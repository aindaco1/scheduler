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
