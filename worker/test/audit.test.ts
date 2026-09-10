import { afterEach, expect, it, vi } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { fetchProvider } from "../src/provider-fetch";
import { boundedJson, seal, sha256Hex } from "../src/security";
import worker from "../src/index";
import type { Booking } from "../src/model";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("denies every owner operation without a session before any provider request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const [path, method] of [
    ["settings", "GET"],
    ["settings", "PUT"],
    ["connections", "GET"],
    ["verify", "POST"],
    ["connections/icloud", "POST"],
    ["connections/google", "DELETE"],
    ["connections/zoom", "DELETE"],
    ["connect/google", "GET"],
    ["callback/google", "GET"],
    ["connect/zoom", "GET"],
    ["callback/zoom", "GET"],
    ["logo", "POST"],
    ["bookings", "GET"],
    ["bookings/11111111-2222-4333-8444-555555555555/cancel", "POST"],
    ["bookings/11111111-2222-4333-8444-555555555555/reschedule", "POST"],
    ["logout", "POST"],
  ]) {
    const response = await worker.fetch(
      new Request("https://scheduler.example/api/admin/" + path, {
        method,
        headers: { Origin: "https://scheduler.example" },
      }),
      env,
    );
    expect(response.status, path).toBe(401);
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("binds OAuth state to one session and provider, expires it, and consumes it once", async () => {
  const stub = env.SCHEDULER.getByName(crypto.randomUUID());
  const state = await stub.oauthState("google", "session-one", "verifier");
  await expect(
    Promise.resolve(stub.consumeOauth(state, "zoom", "session-one")),
  ).rejects.toThrow();
  expect(await stub.consumeOauth(state, "google", "session-one")).toBe(
    "verifier",
  );
  await expect(
    Promise.resolve(stub.consumeOauth(state, "google", "session-one")),
  ).rejects.toThrow();
  const other = await stub.oauthState("google", "session-one", "verifier");
  await expect(
    Promise.resolve(stub.consumeOauth(other, "google", "session-two")),
  ).rejects.toThrow();
  const expired = await stub.oauthState("zoom", "session-one", "verifier");
  await runInDurableObject(stub, (_instance, context) => {
    context.storage.sql.exec("UPDATE tokens SET expires=0");
  });
  await expect(
    Promise.resolve(stub.consumeOauth(expired, "zoom", "session-one")),
  ).rejects.toThrow();
});

it("revokes owner sessions on logout and rejects expired sessions", async () => {
  const stub = env.SCHEDULER.getByName(crypto.randomUUID());
  const token = "synthetic-session";
  await runInDurableObject(stub, async (_instance, context) => {
    context.storage.sql.exec(
      "INSERT INTO tokens VALUES(?,?,?,?)",
      await sha256Hex(token),
      "session",
      Date.now() + 60_000,
      "",
    );
    context.storage.sql.exec(
      "INSERT INTO tokens VALUES(?,?,?,?)",
      await sha256Hex("expired"),
      "session",
      0,
      "",
    );
  });
  expect(await stub.session(token)).toBe(true);
  expect(await stub.session("expired")).toBe(false);
  await stub.logout(token);
  expect(await stub.session(token)).toBe(false);
});

it("limits guest management requests before reading or changing booking data", async () => {
  const getBooking = vi.fn();
  const cancel = vi.fn();
  const { AppError } = await import("../src/model");
  const runtime = {
    ...env,
    SCHEDULER: {
      getByName: () => ({
        rateLimit: async () => {
          throw new AppError("too_many_requests", 429);
        },
        getBooking,
        cancel,
      }),
    },
  } as unknown as Parameters<typeof worker.fetch>[1];
  for (const method of ["GET", "POST"]) {
    const response = await worker.fetch(
      new Request(
        "https://scheduler.example/api/bookings/11111111-2222-4333-8444-555555555555" +
          (method === "POST" ? "/cancel" : ""),
        { method, headers: { Origin: "https://scheduler.example" } },
      ),
      runtime,
    );
    expect(response.status).toBe(429);
  }
  expect(getBooking).not.toHaveBeenCalled();
  expect(cancel).not.toHaveBeenCalled();
});

it("keeps credentials on the original provider request and exposes redirects for validation", async () => {
  const fetch = vi.fn(async (_input: unknown, init: RequestInit) => {
    expect(init.redirect).toBe("manual");
    return new Response(null, {
      status: 307,
      headers: { Location: "https://untrusted.example/" },
    });
  });
  vi.stubGlobal("fetch", fetch);
  expect(
    (
      await fetchProvider(
        "https://provider.example/",
        { headers: { Authorization: "Bearer fixture" } },
        100,
      )
    ).status,
  ).toBe(307);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("times out a stalled body after headers arrive and cancels the stream", async () => {
  const cancel = vi.fn();
  vi.stubGlobal(
    "fetch",
    async () => new Response(new ReadableStream({ cancel })),
  );
  await expect(
    fetchProvider("https://provider.example/", {}, 20),
  ).rejects.toMatchObject({ code: "provider_unavailable" });
  expect(cancel).toHaveBeenCalledOnce();
});

it("rejects oversized provider bodies without trusting Content-Length", async () => {
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response("0123456789", { headers: { "Content-Length": "1" } }),
  );
  await expect(
    fetchProvider("https://provider.example/", {}, 100, 4),
  ).rejects.toMatchObject({ code: "provider_response_too_large" });
});

it("does not expose private provider content through JSON parser errors", async () => {
  try {
    await boundedJson(
      new Response("private-provider-credential-and-guest@example.test"),
    );
    throw Error("Expected rejection");
  } catch (error) {
    expect(error).toMatchObject({
      code: "provider_response_invalid",
      message: "provider_response_invalid",
    });
    expect(String(error)).not.toContain("guest@example.test");
  }
});

it.each([
  { body: "{", status: 400 },
  { body: "[]", status: 400 },
  { body: "x".repeat(65_537), status: 413 },
])(
  "returns a client error for malformed or oversized JSON ($status)",
  async ({ body, status }) => {
    const runtime = {
      ...env,
      SCHEDULER: { getByName: () => ({ rateLimit: async () => {} }) },
    } as unknown as Parameters<typeof worker.fetch>[1];
    const result = await worker.fetch(
      new Request("https://scheduler.example/api/admin/login", {
        method: "POST",
        headers: { Origin: "https://scheduler.example" },
        body,
      }),
      runtime,
    );
    expect(result.status).toBe(status);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
  },
);

it("does not restore a Zoom credential when refresh finishes after disconnect", async () => {
  const stub = env.SCHEDULER.getByName(crypto.randomUUID());
  await stub.putConnection("zoom", {
    accessToken: "old",
    refreshToken: "old-refresh",
    accountId: "fixture-owner",
    expires: 0,
  });
  await runInDurableObject(stub, async (instance, state) => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal("fetch", async () => {
      entered();
      await gate;
      return Response.json({
        access_token: "refreshed",
        refresh_token: "rotated",
        expires_in: 3600,
      });
    });
    const pending = (
      instance as unknown as { zoom(): Promise<unknown> }
    ).zoom();
    const outcome = pending.then(
      () => "accepted",
      () => "rejected",
    );
    await started;
    await instance.disconnect("zoom");
    release();
    expect(await outcome).toBe("rejected");
    expect(
      state.storage.sql
        .exec("SELECT value FROM config WHERE key='connection:zoom'")
        .toArray(),
    ).toEqual([]);
  });
});

it("rechecks a reminder revision after decrypting its payload, before contacting Resend", async () => {
  const stub = env.SCHEDULER.getByName(crypto.randomUUID());
  await runInDurableObject(stub, async (instance, state) => {
    const now = Date.now();
    const b: Booking = {
      id: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      typeId: "conversation",
      typeName: "Fixture",
      mode: "meet",
      locationId: "",
      location: "",
      start: now + 3_600_000,
      end: now + 5_400_000,
      gap: 15,
      name: "Fixture",
      email: "guest@example.test",
      topic: "",
      locale: "en",
      timezone: "UTC",
      status: "confirmed",
      created: now,
      updated: now,
      managementHash: await sha256Hex("fixture"),
      revision: 1,
    };
    state.storage.sql.exec(
      "INSERT INTO bookings VALUES(?,?,?,?,?,?)",
      b.id,
      b.requestId,
      b.start,
      b.end,
      b.status,
      JSON.stringify(b),
    );
    const job = {
      id: "fixture-reminder",
      kind: "email",
      bookingId: b.id,
      revision: 1,
      mailKind: "reminder",
      payload: await seal(
        { to: b.email, subject: "Fixture", text: "Fixture", html: "Fixture" },
        env.ENCRYPTION_KEY,
      ),
      firstAttemptAt: now,
      sender: env.EMAIL_FROM,
      attempts: 0,
      due: now,
      lease: 0,
    };
    state.storage.sql.exec(
      "INSERT INTO jobs VALUES(?,?,?,?)",
      job.id,
      now,
      0,
      JSON.stringify(job),
    );
    const decrypt = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, "decrypt").mockImplementation(async (...args) => {
      b.status = "cancelling";
      b.revision++;
      state.storage.sql.exec(
        "UPDATE bookings SET status=?,data=? WHERE id=?",
        b.status,
        JSON.stringify(b),
        b.id,
      );
      return decrypt(...args);
    });
    const fetch = vi.fn(async () => Response.json({ id: "fixture-mail" }));
    vi.stubGlobal("fetch", fetch);
    await (
      instance as unknown as { processEmail(job: unknown): Promise<void> }
    ).processEmail(job);
    expect(fetch).not.toHaveBeenCalled();
    state.storage.sql.exec("DELETE FROM jobs");
  });
});
