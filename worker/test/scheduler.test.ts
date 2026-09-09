import { fetchMock } from "./fetch-fixtures";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  env,
  SELF,
  runInDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { defaultSettings, type Booking } from "../src/model";
import { sha256Hex } from "../src/security";

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.deactivate());
const expectRpc = (promise: PromiseLike<unknown>) =>
  expect(Promise.resolve(promise));
const origin = "https://scheduler.example";
function startTime() {
  const date = new Date(Date.now() + 3 * 86400_000);
  date.setUTCHours(12, 0, 0, 0);
  return date.getTime();
}
function mockReads(events: object[] = []) {
  fetchMock
    .get("https://oauth2.googleapis.com")
    .intercept({ path: "/token", method: "POST" })
    .reply(200, { access_token: "access" })
    .persist();
  fetchMock
    .get("https://www.googleapis.com")
    .intercept({ path: (p) => p.includes("/events?"), method: "GET" })
    .reply(200, { items: events, timeZone: "UTC" })
    .persist();
}
async function setup(name = crypto.randomUUID()) {
  const stub = env.SCHEDULER.getByName(name);
  await stub.putConnection("google", {
    refreshToken: "refresh",
    email: "owner@example.com",
    accountId: "google-owner",
  });
  await runInDurableObject(stub, (_instance, state) => {
    const s = defaultSettings();
    s.enabled = true;
    s.timezone = "UTC";
    s.requireIcloud = false;
    s.hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      start: "00:00",
      end: "24:00",
    }));
    state.storage.sql.exec(
      "UPDATE config SET value=? WHERE key='settings'",
      JSON.stringify({ settings: s, revision: 7 }),
    );
  });
  return stub;
}
function input(start = startTime(), requestId = crypto.randomUUID()) {
  return {
    requestId,
    typeId: "conversation",
    locationId: "",
    start: new Date(start).toISOString(),
    name: "Guest",
    email: "guest@example.com",
    topic: "Discuss project",
    locale: "en",
    timezone: "UTC",
    turnstile: "valid",
  };
}
describe("Durable booking coordinator", () => {
  it("accepts a 169-hour calendar week without losing its last hour", async () => {
    const clock = vi
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-10-20T12:00:00Z"));
    try {
      mockReads();
      const stub = await setup();
      const config = await stub.getSettings();
      config.settings.timezone = "America/Denver";
      await stub.updateSettings(config.settings, config.revision);
      const from = Date.parse("2026-10-26T06:00:00Z"),
        to = Date.parse("2026-11-02T07:00:00Z");
      const { slots } = await stub.availability("conversation", "", from, to);
      expect(slots).toContain("2026-11-02T06:30:00.000Z");
      expect(slots).not.toContain("2026-11-02T07:00:00.000Z");
      await expectRpc(
        stub.availability("conversation", "", from, from + 8 * 86400000 + 1),
      ).rejects.toMatchObject({ code: "invalid_date_range" });
    } finally {
      clock.mockRestore();
    }
  });
  it.each(["all", "in-person"] as const)(
    "saves a whole-day %s blackout without provider calls, but still rejects bookings during an outage",
    async (scope) => {
      const stub = await setup();
      const calls = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async () =>
          Response.json({ error: "Fixture outage" }, { status: 503 }),
        );
      const config = await stub.getSettings();
      const start = startTime();
      const midnight = new Date(start + 86400_000).setUTCHours(0, 0, 0, 0);
      config.settings.blackouts = [
        {
          id: "offline-day",
          label: "Unavailable",
          scope,
          start: new Date(midnight).toISOString(),
          end: new Date(midnight + 86400_000).toISOString(),
        },
      ];
      const saved = await stub.updateSettings(config.settings, config.revision);
      expect(saved.revision).toBe(config.revision + 1);
      expect(saved.settings.blackouts).toEqual(config.settings.blackouts);
      expect(calls).not.toHaveBeenCalled();

      // This interval is outside the blackout: provider failure, rather than
      // the new local rule, must prevent displaying or reserving free time.
      await expectRpc(
        stub.availability("conversation", "", start, start + 3600_000),
      ).rejects.toMatchObject({ status: 503 });
      await expectRpc(stub.createBooking(input(start))).rejects.toMatchObject({
        status: 503,
      });
      expect((await stub.listBookings()).bookings).toHaveLength(0);
      expect(await stub.getSettings()).toEqual(saved);
    },
  );

  it("saves hours and can pause bookings without calling providers", async () => {
    const stub = await setup();
    const calls = vi.spyOn(globalThis, "fetch");
    let config = await stub.getSettings();
    config.settings.hours[0].end = "16:00";
    config = await stub.updateSettings(config.settings, config.revision);
    expect(config.settings.hours[0].end).toBe("16:00");
    config.settings.enabled = false;
    config = await stub.updateSettings(config.settings, config.revision);
    expect(config.settings.enabled).toBe(false);
    expect(calls).not.toHaveBeenCalled();
  });

  it.each(["opening", "google", "icloud", "requireIcloud", "zoom"])(
    "still verifies %s connection changes and preserves settings on failure",
    async (change) => {
      const stub = await setup();
      vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
        Response.json({ error: "Fixture outage" }, { status: 503 }),
      );
      let config = await stub.getSettings();
      if (change === "opening")
        config = await stub.updateSettings(
          { ...config.settings, enabled: false },
          config.revision,
        );
      const next = structuredClone(config.settings);
      if (change === "opening") next.enabled = true;
      if (change === "google") next.googleCalendars.push("work");
      if (change === "icloud")
        next.icloudCalendars.push("https://caldav.icloud.com/fixture/family/");
      if (change === "requireIcloud") next.requireIcloud = true;
      if (change === "zoom")
        next.types.find((t) => t.mode === "zoom")!.enabled = true;
      await expectRpc(
        stub.updateSettings(next, config.revision),
      ).rejects.toMatchObject({ status: 503 });
      expect(await stub.getSettings()).toEqual(config);
    },
  );

  it("does not overwrite a newer settings save while opening bookings verifies providers", async () => {
    const stub = await setup();
    await runInDurableObject(stub, async (instance) => {
      let config = instance.getSettings();
      config = await instance.updateSettings(
        { ...config.settings, enabled: false },
        config.revision,
      );
      let release!: () => void, started!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fetching = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (url.includes("/token")) {
            started();
            await gate;
            return Response.json({ access_token: "fixture" });
          }
          return Response.json({ items: [], timeZone: "UTC" });
        }),
      );
      const opening = Promise.resolve(
        instance.updateSettings(
          { ...config.settings, enabled: true },
          config.revision,
        ),
      ).catch((error) => error);
      await fetching;
      let saved;
      try {
        saved = await instance.updateSettings(
          { ...config.settings, name: "Updated while paused" },
          config.revision,
        );
      } finally {
        release();
      }
      expect(await opening).toMatchObject({
        code: "settings_changed",
        status: 409,
      });
      expect(instance.getSettings()).toEqual(saved);
      expect(saved!.settings.enabled).toBe(false);
    });
  });

  it.each(["meet", "zoom", "in-person"] as const)(
    "enforces an in-person-only day across %s availability, booking and rescheduling",
    async (mode) => {
      mockReads();
      const stub = await setup();
      await stub.putConnection("zoom", {
        accountId: "fixture",
        refreshToken: "fixture",
        accessToken: "fixture",
        expires: Date.now() + 3600_000,
      });
      let config = await stub.getSettings();
      config.settings.enabled = true;
      const type = config.settings.types.find((t) => t.mode === mode)!;
      config.settings.types.forEach((t) => {
        t.enabled = t.mode === mode;
        t.locationIds = t.mode === "in-person" ? ["studio"] : [];
      });
      config.settings.locations = [
        {
          id: "studio",
          name: { en: "Studio", es: "Estudio" },
          address: { en: "Address", es: "Dirección" },
          enabled: true,
          hours: config.settings.hours,
        },
      ];
      config = await stub.updateSettings(config.settings, config.revision);
      const locationId = mode === "in-person" ? "studio" : "";
      const original = startTime(),
        target = original + 86400_000;
      const created = await stub.createBooking({
        ...input(original),
        typeId: type.id,
        locationId,
      });
      await runInDurableObject(stub, (_instance, state) => {
        const row = state.storage.sql
          .exec<{ data: string }>(
            "SELECT data FROM bookings WHERE id=?",
            created.booking.id,
          )
          .one();
        const b = JSON.parse(row.data);
        b.status = "confirmed";
        state.storage.sql.exec(
          "UPDATE bookings SET data=?,status='confirmed' WHERE id=?",
          JSON.stringify(b),
          b.id,
        );
        state.storage.sql.exec("DELETE FROM jobs");
      });
      const day = new Date(target).toISOString().slice(0, 10);
      config.settings.blackouts = [
        {
          id: "travel",
          label: "Travel",
          scope: "in-person",
          start: day + "T00:00:00Z",
          end: new Date(
            Date.parse(day + "T00:00:00Z") + 86400_000,
          ).toISOString(),
        },
      ];
      await stub.updateSettings(config.settings, config.revision);
      expect((await stub.getSettings()).settings.blackouts[0].scope).toBe(
        "in-person",
      );
      const allowed = mode !== "in-person";
      const slots = (
        await stub.availability(type.id, locationId, target, target + 3600_000)
      ).slots;
      expect(slots.includes(new Date(target).toISOString())).toBe(allowed);
      const moveSlots = (
        await stub.availability(
          type.id,
          locationId,
          target,
          target + 3600_000,
          created.booking.id,
          created.token,
        )
      ).slots;
      expect(moveSlots).toEqual(slots);
      const move = stub.reschedule(
        created.booking.id,
        created.token,
        new Date(target).toISOString(),
        crypto.randomUUID(),
      );
      if (allowed) expect((await move).booking.status).toBe("rescheduling");
      else
        await expectRpc(move).rejects.toMatchObject({
          code: "slot_unavailable",
        });
      const reserve = stub.createBooking({
        ...input(target + 3 * 3600_000),
        typeId: type.id,
        locationId,
      });
      if (allowed) expect((await reserve).booking.status).toBe("pending");
      else
        await expectRpc(reserve).rejects.toMatchObject({
          code: "slot_unavailable",
        });
    },
  );

  it("atomically reserves once for simultaneous overlapping requests", async () => {
    mockReads();
    const stub = await setup();
    const results = await Promise.allSettled([
      stub.createBooking(input()),
      stub.createBooking(input()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await stub.listBookings()).bookings).toHaveLength(1);
  });
  it("returns the same booking for a repeated identical operation and rejects changed input", async () => {
    mockReads();
    const stub = await setup(),
      data = input();
    const [a, b] = await Promise.all([
      stub.createBooking(data),
      stub.createBooking(data),
    ]);
    expect(a.booking.id).toBe(b.booking.id);
    expect(a.token).toBe(b.token);
    await expectRpc(
      stub.createBooking({ ...data, name: "Another guest" }),
    ).rejects.toMatchObject({ code: "request_changed" });
  });
  it("does not reserve when a selected external calendar cannot be read", async () => {
    const stub = await setup();
    await expectRpc(stub.createBooking(input())).rejects.toThrow();
    expect((await stub.listBookings()).bookings).toHaveLength(0);
  });
  it("protects management links and enforces cutoff in the coordinator", async () => {
    mockReads();
    const stub = await setup(),
      created = await stub.createBooking(input());
    await expectRpc(
      stub.getBooking(created.booking.id, "wrong"),
    ).rejects.toMatchObject({ code: "booking_not_found" });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>(
          "SELECT data FROM bookings WHERE id=?",
          created.booking.id,
        )
        .one();
      const b: Booking = JSON.parse(row.data);
      b.status = "confirmed";
      b.start = Date.now() + 3_600_000;
      b.end = b.start + 30 * 60_000;
      state.storage.sql.exec(
        "UPDATE bookings SET data=?,status=?,start=?,end=? WHERE id=?",
        JSON.stringify(b),
        b.status,
        b.start,
        b.end,
        b.id,
      );
    });
    await expectRpc(
      stub.cancel(created.booking.id, created.token),
    ).rejects.toMatchObject({ code: "management_closed" });
  });
  it("rejects a different Google identity when bookings are active even after disconnect", async () => {
    mockReads();
    const stub = await setup();
    await stub.createBooking(input());
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "DELETE FROM config WHERE key='connection:google'",
      );
    });
    await expectRpc(
      stub.putConnection("google", {
        refreshToken: "other",
        email: "other@example.com",
        accountId: "other",
      }),
    ).rejects.toMatchObject({ code: "account_switch_has_bookings" });
  });
  it("reconciles an event already created after a lost response rather than creating another", async () => {
    mockReads();
    const stub = await setup(),
      created = await stub.createBooking(input());
    fetchMock
      .get("https://www.googleapis.com")
      .intercept({
        path:
          "/calendar/v3/calendars/primary/events/s" +
          created.booking.id.replaceAll("-", ""),
        method: "GET",
      })
      .reply(200, {
        id: "s" + created.booking.id.replaceAll("-", ""),
        extendedProperties: {
          private: {
            schedulerBooking: created.booking.id,
            schedulerOwner: "alonso",
          },
        },
        hangoutLink: "https://meet.google.com/test-room",
      })
      .persist();
    await runDurableObjectAlarm(stub);
    const read = await stub.getBooking(created.booking.id, created.token);
    expect(read.booking.status).toBe("confirmed");
    expect(read.booking.joinUrl).toBe("https://meet.google.com/test-room");
  });
  it("allows pending cancellation before the provider job starts", async () => {
    mockReads();
    const stub = await setup(),
      created = await stub.createBooking(input());
    expect(
      (await stub.cancel(created.booking.id, created.token)).booking.status,
    ).toBe("cancelling");
    fetchMock
      .get("https://www.googleapis.com")
      .intercept({
        path:
          "/calendar/v3/calendars/primary/events/s" +
          created.booking.id.replaceAll("-", "") +
          "?sendUpdates=all",
        method: "DELETE",
      })
      .reply(404, {});
    await runDurableObjectAlarm(stub);
    expect(
      (await stub.getBooking(created.booking.id, created.token)).booking.status,
    ).toBe("cancelled");
  });
  it("reschedule fails closed during an outage, then reserves both intervals after recovery", async () => {
    mockReads();
    const stub = await setup(),
      created = await stub.createBooking(input());
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>(
          "SELECT data FROM bookings WHERE id=?",
          created.booking.id,
        )
        .one();
      const b: Booking = JSON.parse(row.data);
      b.status = "confirmed";
      state.storage.sql.exec(
        "UPDATE bookings SET data=?,status=? WHERE id=?",
        JSON.stringify(b),
        "confirmed",
        b.id,
      );
      state.storage.sql.exec("DELETE FROM jobs");
    });
    const next = startTime() + 3 * 3600_000;
    const unavailable = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () =>
        Response.json({ error: "Fixture outage" }, { status: 503 }),
      );
    const config = await stub.getSettings();
    await stub.updateSettings(
      { ...config.settings, noticeHours: 30 },
      config.revision,
    );
    expect(unavailable).not.toHaveBeenCalled();
    await expectRpc(
      stub.reschedule(
        created.booking.id,
        created.token,
        new Date(next).toISOString(),
        crypto.randomUUID(),
      ),
    ).rejects.toThrow();
    expect(
      (await stub.getBooking(created.booking.id, created.token)).booking,
    ).toMatchObject({
      status: "confirmed",
      start: startTime(),
    });
    unavailable.mockRestore();
    expect(
      (
        await stub.reschedule(
          created.booking.id,
          created.token,
          new Date(next).toISOString(),
          crypto.randomUUID(),
        )
      ).booking.status,
    ).toBe("rescheduling");
    await expectRpc(stub.createBooking(input(next))).rejects.toMatchObject({
      code: "slot_unavailable",
    });
    await expectRpc(
      stub.createBooking(input(startTime())),
    ).rejects.toMatchObject({ code: "slot_unavailable" });
  });
});
describe("HTTP authentication and error boundary", () => {
  it("accepts bounded owner messages only through authenticated admin actions", async () => {
    mockReads();
    const stub = await setup("alonso");
    const session = "fixture-owner-message-session";
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO tokens(hash,purpose,expires,value) VALUES(?,?,?,?)",
        await sha256Hex(session),
        "session",
        Date.now() + 60_000,
        "",
      );
    });
    for (const [index, action] of ["cancel", "reschedule"].entries()) {
      const start = startTime() + (index + 5) * 2 * 3_600_000;
      const created = await stub.createBooking(input(start));
      await runInDurableObject(stub, (_instance, state) => {
        const row = state.storage.sql
          .exec<{ data: string }>(
            "SELECT data FROM bookings WHERE id=?",
            created.booking.id,
          )
          .one();
        const b = JSON.parse(row.data);
        b.status = "confirmed";
        state.storage.sql.exec(
          "UPDATE bookings SET data=?,status='confirmed' WHERE id=?",
          JSON.stringify(b),
          b.id,
        );
      });
      const path =
        origin + `/api/admin/bookings/${created.booking.id}/${action}`;
      const body = {
        message: "  An owner note.\nThanks!  ",
        start: new Date(start + 3_600_000).toISOString(),
        requestId: crypto.randomUUID(),
      };
      const send = (payload: object, signedIn: boolean) =>
        SELF.fetch(path, {
          method: "POST",
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            ...(signedIn ? { Cookie: `scheduler_session=${session}` } : {}),
          },
          body: JSON.stringify(payload),
        });
      expect((await send(body, false)).status).toBe(401);
      expect(
        (await send({ ...body, message: "x".repeat(2001) }, true)).status,
      ).toBe(400);
      expect(
        (await send({ ...body, message: { html: "no" } }, true)).status,
      ).toBe(400);
      expect((await send(body, true)).status).toBe(200);
      await runInDurableObject(stub, (_instance, state) => {
        const row = state.storage.sql
          .exec<{ data: string }>(
            "SELECT data FROM bookings WHERE id=?",
            created.booking.id,
          )
          .one();
        expect(JSON.parse(row.data).changeMessage).toBe(
          "An owner note.\nThanks!",
        );
      });
    }
  });

  it("returns a structured 403 for cross-origin mutations", async () => {
    const response = await SELF.fetch(origin + "/api/admin/login", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "owner@example.com", turnstile: "x" }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "untrusted_origin" });
  });
  it("preserves RPC 409/404 status and never returns private config publicly", async () => {
    const response = await SELF.fetch(
      origin + "/api/bookings/" + crypto.randomUUID(),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "booking_not_found" });
    const config = (await (
      await SELF.fetch(origin + "/api/config")
    ).json()) as { settings: Record<string, unknown> };
    for (const key of [
      "googleCalendars",
      "icloudCalendars",
      "blackouts",
      "recurringBlackouts",
    ])
      expect(config.settings).not.toHaveProperty(key);
  });
  it("consumes login tokens once and stores only session hashes", async () => {
    const stub = env.SCHEDULER.getByName("alonso"),
      token = "single-use-login-token";
    await runInDurableObject(stub, async (_instance, state) =>
      state.storage.sql.exec(
        "INSERT INTO tokens(hash,purpose,expires,value) VALUES(?,?,?,?)",
        await sha256Hex(token),
        "login",
        Date.now() + 60_000,
        "",
      ),
    );
    const response = await SELF.fetch(origin + "/api/admin/consume", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
    const duplicate = await SELF.fetch(origin + "/api/admin/consume", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    expect(duplicate.status).toBe(401);
  });
});
