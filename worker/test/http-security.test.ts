import { env, SELF } from "cloudflare:test";
import { expect, it, vi } from "vitest";
it("keeps private HTML, API successes and API errors uncacheable and unindexable", async () => {
  for (const path of [
    "/admin/",
    "/es/admin/",
    "/manage/",
    "/es/manage/",
    "/api/config",
    "/api/admin/settings",
    "/api/missing",
  ]) {
    const response = await SELF.fetch("https://scheduler.example" + path);
    expect(response.headers.get("cache-control")).toContain(
      "private, no-store",
    );
    expect(response.headers.get("cache-control")).toContain("no-transform");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "object-src 'none'",
    );
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  }
});

it.each(["booking", "reschedule"])(
  "logs only the bounded %s failure code",
  async (operation) => {
    const { default: worker } = await import("../src/index");
    const { AppError } = await import("../src/model");
    const error = new AppError("icloud_incomplete", 503);
    error.message = "private calendar guest@example.test";
    const fail = async () => {
      throw error;
    };
    const runtime = {
      ...env,
      SCHEDULER: {
        getByName: () => ({
          rateLimit: async () => {},
          createBooking: fail,
          reschedule: fail,
        }),
      },
    } as unknown as Parameters<typeof worker.fetch>[1];
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const provider = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        success: true,
        action: "booking",
        hostname: "scheduler.example",
      }),
    );
    try {
      const id = "11111111-2222-4333-8444-555555555555";
      const response = await worker.fetch(
        new Request(
          "https://scheduler.example/api/bookings" +
            (operation === "reschedule" ? `/${id}/reschedule` : ""),
          {
            method: "POST",
            headers: {
              Origin: "https://scheduler.example",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              requestId: id,
              typeId: "conversation",
              locationId: "",
              start: "2026-10-10T16:00:00Z",
              name: "Private fixture",
              email: "guest@example.test",
              topic: "Private topic",
              locale: "en",
              timezone: "UTC",
              turnstile: "fixture",
              ...(operation === "reschedule" ? { token: "private-token" } : {}),
            }),
          },
        ),
        runtime,
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "icloud_incomplete" });
      expect(warning.mock.calls).toEqual([
        [
          JSON.stringify({
            event:
              operation === "booking" ? "booking_failed" : "reschedule_failed",
            code: "icloud_incomplete",
          }),
        ],
      ]);
    } finally {
      warning.mockRestore();
      provider.mockRestore();
    }
  },
);

it("logs only the bounded availability failure code, never private request or provider data", async () => {
  const { default: worker } = await import("../src/index");
  const { AppError } = await import("../src/model");
  const error = new AppError("icloud_unavailable", 503, true);
  error.message = "private provider response guest@example.test";
  const runtime = {
    ...env,
    SCHEDULER: {
      getByName: () => ({
        rateLimit: async () => {},
        availability: async () => {
          throw error;
        },
      }),
    },
  } as unknown as Parameters<typeof worker.fetch>[1];
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const response = await worker.fetch(
      new Request(
        "https://scheduler.example/api/availability?booking=private-id&location=private-location",
        { headers: { Authorization: "Bearer private-token" } },
      ),
      runtime,
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "icloud_unavailable" });
    expect(warning.mock.calls).toEqual([
      [
        JSON.stringify({
          event: "availability_failed",
          code: "icloud_unavailable",
        }),
      ],
    ]);
  } finally {
    warning.mockRestore();
  }
});
