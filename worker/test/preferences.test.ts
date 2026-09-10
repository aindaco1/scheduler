import { expect, it } from "vitest";
import { defaultSettings, settingsSchema } from "../src/model";
import { meetingGap, normalizePreferences } from "../src/gap-policy";
import { availableSlots, canBook, resolveType } from "../src/availability";
import { localizedAsset, isPresentationPath } from "../src/language";

it("upgrades legacy default gaps while preserving custom gaps and translations", () => {
  const legacy = defaultSettings();
  Reflect.deleteProperty(legacy, "defaultGaps");
  Reflect.deleteProperty(legacy, "spanishEnabled");
  legacy.types[0].gap = 15;
  legacy.types[1].gap = 45;
  legacy.types[2].gap = 30;
  const settings = normalizePreferences(legacy);
  expect(settings.spanishEnabled).toBe(true);
  expect(settings.types.map((t) => t.gap)).toEqual([null, 45, null]);
  expect(settings.types.map((t) => meetingGap(settings, t))).toEqual([
    15, 45, 30,
  ]);
  settings.defaultGaps.video = 20;
  settings.defaultGaps.inPerson = 60;
  expect(settings.types.map((t) => meetingGap(settings, t))).toEqual([
    20, 45, 60,
  ]);
  const spanish = settings.intro.es;
  settings.spanishEnabled = false;
  expect(settingsSchema.parse(settings).intro.es).toBe(spanish);
  settings.types[0].gap = 0;
  expect(meetingGap(settings, settings.types[0])).toBe(0);
  settings.defaultGaps.video = 241;
  expect(settingsSchema.safeParse(settings).success).toBe(false);
});

it("uses default and override gaps for both visible slots and final booking checks", () => {
  const s = defaultSettings();
  s.timezone = "UTC";
  s.hours = [{ day: 4, start: "09:00", end: "17:00" }];
  const now = Date.parse("2026-09-09T00:00Z"),
    start = Date.parse("2026-09-10T12:15Z");
  const busy = [{ start: start - 75 * 60000, end: start - 15 * 60000 }];
  const allowed = () => canBook(s, s.types[0], "", start, busy, now);
  const visible = () =>
    availableSlots(s, "conversation", "", start, start + 1, busy, now)
      .length === 1;
  s.defaultGaps.video = 30;
  expect(allowed()).toBe(false);
  expect(visible()).toBe(false);
  s.types[0].gap = 15;
  expect(allowed()).toBe(true);
  expect(visible()).toBe(true);
  const snapshot = resolveType(s, "conversation").type;
  s.types[0].gap = null;
  s.defaultGaps.video = 60;
  expect(canBook(s, snapshot, "", start, busy, now)).toBe(true);
  expect(allowed()).toBe(false);
  // The larger stored neighbor gap still applies to an explicit zero override.
  s.types[0].gap = 0;
  expect(
    canBook(s, s.types[0], "", start, [{ ...busy[0], gap: 30 }], now),
  ).toBe(false);
});

const html =
  '<!doctype html><html lang="en"><head><link rel="alternate" hreflang="es" href="https://schedule.example/es/taylor"></head><body><a id="language-link" href="/es/taylor">Español</a><h1>Choose a meeting</h1></body></html>';
function assets(body = html, contentType = "text/html") {
  return {
    fetch: async (request: Request) => {
      expect(request.headers.has("if-none-match")).toBe(false);
      return new Response(request.method === "HEAD" ? null : body, {
        headers: { "Content-Type": contentType, ETag: '"static"' },
      });
    },
  } as unknown as Fetcher;
}
it("hides disabled Spanish before JavaScript and removes its search alternate", async () => {
  for (const enabled of [true, false]) {
    const response = await localizedAsset(
      new Request("https://schedule.example/taylor", {
        headers: { "If-None-Match": '"static"' },
      }),
      assets(),
      Promise.resolve(enabled),
    );
    const output = await response.text();
    expect(output.includes('hreflang="es"')).toBe(enabled);
    expect(output.includes("hidden")).toBe(!enabled);
    expect(output).toContain("Choose a meeting");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.has("etag")).toBe(false);
  }
});
it("temporarily redirects Spanish pages without losing query state or replacing private fragments", async () => {
  for (const path of [
    "/es/taylor",
    "/es/admin/",
    "/es/manage/",
    "/es/privacy/",
  ]) {
    const response = await localizedAsset(
      new Request("https://schedule.example" + path + "?type=conversation"),
      assets(),
      Promise.resolve(false),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://schedule.example" + path.slice(3) + "?type=conversation",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  }
});
it("filters the sitemap and avoids preference lookups for hashed assets", async () => {
  const response = await localizedAsset(
    new Request("https://schedule.example/sitemap.xml"),
    assets(
      "<urlset><url><loc>https://schedule.example/taylor</loc></url><url><loc>https://schedule.example/es/taylor</loc></url><url><loc>https://schedule.example/privacy/</loc></url><url><loc>https://schedule.example/es/privacy/</loc></url></urlset>",
      "application/xml",
    ),
    Promise.resolve(false),
  );
  const output = await response.text();
  expect(output).not.toContain("/es/");
  expect(output.match(/<url>/g)).toHaveLength(2);
  for (const path of [
    "/taylor",
    "/es/taylor/",
    "/admin/",
    "/es/privacy/",
    "/sitemap.xml",
  ])
    expect(isPresentationPath(path, "taylor")).toBe(true);
  for (const path of [
    "/assets/build/booking-hash.js",
    "/api/config",
    "/random",
  ])
    expect(isPresentationPath(path, "taylor")).toBe(false);
});
