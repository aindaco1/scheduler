import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";
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
