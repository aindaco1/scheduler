import { env, runInDurableObject } from "cloudflare:test";
import { expect, it, vi } from "vitest";
import worker from "../src/index";
import { defaultSettings } from "../src/model";
import type { Presentation } from "../src/branding";

const origin = "https://meet.example.org";
const shell = `<!doctype html><html lang="en"><head><title>Old</title><meta name="description" content="Old"><meta property="og:title" content="Old"><meta property="og:site_name" content="Old"><meta property="og:url" content="https://old.example/"><meta name="twitter:card" content="summary"><link rel="canonical" href="https://old.example/"><link rel="alternate" hreflang="es" href="https://old.example/es/"></head><body><a id="language-link">Español</a><div id="app" aria-busy="true">Loading</div><noscript><h1>Old</h1>Enable JavaScript</noscript></body></html>`;
function presentation(): Presentation {
  const s = defaultSettings("Taylor");
  return {
    name: s.name,
    brand: s.brand,
    spanishEnabled: true,
    booking: {
      intro: {
        en: "Let's find time to talk.",
        es: "Busquemos un momento para conversar.",
      },
      enabled: true,
      types: s.types.map(({ id, name, description, duration, mode }) => ({
        id,
        name,
        description,
        duration,
        mode,
      })),
    },
  };
}
async function request(path: string, p = presentation(), method = "GET") {
  const read = vi.fn(async () => p);
  const asset = vi.fn(
    async (request: Request) =>
      new Response(
        request.method === "HEAD"
          ? null
          : path.startsWith("/sitemap")
            ? "<urlset/>"
            : shell,
        {
          headers: {
            "Content-Type": path.startsWith("/sitemap")
              ? "application/xml"
              : "text/html",
            ETag: '"static"',
          },
        },
      ),
  );
  const runtime = {
    ...env,
    PUBLIC_ORIGIN: origin,
    OWNER_SLUG: "taylor",
    SCHEDULER: { getByName: () => ({ presentation: read }) },
    ASSETS: { fetch: asset },
  } as unknown as Parameters<typeof worker.fetch>[1];
  const response = await worker.fetch(
    new Request("https://untrusted-host.example" + path, { method }),
    runtime,
  );
  expect(read).toHaveBeenCalledOnce();
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.has("etag")).toBe(false);
  return response;
}
const graph = (html: string) =>
  JSON.parse(
    html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)![1],
  )["@graph"] as Record<string, any>[];

it("renders each meeting and locale in initial HTML with clean identity and no provider calls", async () => {
  const p = presentation();
  const titles = new Set();
  for (const prefix of ["", "/es"]) {
    for (const type of p.booking!.types) {
      const response = await request(
        `${prefix}/taylor?type=${type.id}&slot=private-time&location=private-location&timezone=UTC&tracking=private`,
        p,
      );
      expect(response.status).toBe(200);
      const html = await response.text();
      const canonical = `${origin}${prefix}/taylor?type=${type.id}`;
      expect(html).toContain(`rel="canonical" href="${canonical}"`);
      expect(html).toContain(`property="og:url" content="${canonical}"`);
      expect(html).toContain(
        `property="og:image" content="${origin}/assets/social/preview-v1.png"`,
      );
      expect(html).toContain(
        `href="${origin}${prefix ? "" : "/es"}/taylor?type=${type.id}"`,
      );
      expect(html).not.toMatch(
        /private-time|private-location|tracking|untrusted-host|old\.example/,
      );
      expect(html.match(/property="og:title"/g)).toHaveLength(1);
      expect(html.match(/<title>/g)).toHaveLength(1);
      const nodes = graph(html);
      expect(
        nodes.find((node) => node["@type"] === "Service")?.provider,
      ).toEqual({ "@id": origin + "/taylor#owner" });
      expect(
        nodes.find((node) => node["@type"] === "WebPage")?.inLanguage,
      ).toBe(prefix ? "es" : "en");
      titles.add(html.match(/<title>(.*?)<\/title>/)![1]);
    }
  }
  expect(titles.size).toBe(6);
});

it("uses saved main-page identity and intro and exposes crawlable meeting links", async () => {
  const p = presentation();
  p.name = "Renamed Owner";
  p.brand.name = "";
  const html = await (await request("/taylor?timezone=UTC", p)).text();
  expect(html).toContain("Meet with Renamed Owner");
  expect(html).toContain("Let&#39;s find time to talk.");
  expect(html).toContain('property="og:site_name" content="Scheduler"');
  expect(html).toContain(`href="${origin}/taylor?type=conversation"`);
  expect(graph(html).some((node) => node["@type"] === "Service")).toBe(false);
  p.booking!.types[0].name.en = "Renamed meeting";
  const updated = await (await request("/taylor?type=conversation", p)).text();
  expect(updated).toContain("Renamed meeting");
});

it("returns a private-safe 404 for missing, disabled, empty and ambiguous types, including HEAD", async () => {
  const p = presentation();
  p.booking!.types = p.booking!.types.filter(
    (type) => type.id !== "conversation",
  );
  for (const query of [
    "type=conversation",
    "type=deleted",
    "type=",
    "type=zoom& type=conversation".replace(" ", ""),
    "type=%3Cscript%3E",
  ]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await request("/taylor?" + query, p, method);
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      const html = await response.text();
      if (method === "HEAD") expect(html).toBe("");
      else {
        expect(html).toContain("Meeting unavailable");
        expect(html).not.toMatch(
          /application\/ld\+json|rel="canonical"|<script>/,
        );
      }
    }
  }
});

it("keeps paused meeting links at 200 with a closed message and no bookable service", async () => {
  const p = presentation();
  p.booking!.enabled = false;
  const response = await request("/taylor?type=conversation", p);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("Not accepting bookings right now");
  expect(html).toContain('aria-busy="false"');
  expect(graph(html).some((node) => node["@type"] === "Service")).toBe(false);
  expect(await (await request("/sitemap.xml", p)).text()).not.toContain(
    "?type=",
  );
});

it("updates sitemap membership and language alternates immediately from public preferences", async () => {
  const p = presentation();
  let xml = await (await request("/sitemap.xml", p)).text();
  expect(xml.match(/<url>/g)).toHaveLength(10);
  p.spanishEnabled = false;
  p.booking!.types.pop();
  xml = await (await request("/sitemap.xml", p)).text();
  expect(xml.match(/<url>/g)).toHaveLength(4);
  expect(xml).not.toContain("/es/");
  const html = await (await request("/taylor?type=conversation", p)).text();
  expect(html).not.toMatch(/hreflang="es"|og:locale:alternate/);
  const redirect = await request(
    "/es/taylor?type=conversation&timezone=UTC",
    p,
  );
  expect(redirect.status).toBe(302);
  expect(redirect.headers.get("location")).toBe(
    "https://untrusted-host.example/taylor?type=conversation&timezone=UTC",
  );
  expect(await (await request("/sitemap.xml", p, "HEAD")).text()).toBe("");
});

it("escapes authored content in HTML and JSON-LD and supports localized fallback", async () => {
  const p = presentation();
  const unsafe = '</script><img src=x onerror="alert(1)"> & \u2028';
  p.name = unsafe;
  p.booking!.types[0].name = { en: "", es: "Conversación & ideas" };
  p.booking!.types[0].description.en = unsafe;
  const html = await (await request("/taylor?type=conversation", p)).text();
  expect(html).not.toContain("<img src=x");
  expect(html.match(/<script /g)).toHaveLength(1);
  expect(html).toContain("Conversación &amp; ideas");
  expect(graph(html).find((node) => node["@type"] === "Person")?.name).toBe(
    unsafe,
  );
});

it("leaves private and privacy shells free of booking structured data", async () => {
  for (const path of ["/admin/", "/manage/", "/privacy/", "/es/admin/"]) {
    const html = await (await request(path)).text();
    expect(html).not.toMatch(/application\/ld\+json|#service|Let's find time/);
  }
});

it("projects only public meeting facts from SQLite without exposing inactive types or private settings", async () => {
  const stub = env.SCHEDULER.getByName(crypto.randomUUID());
  await stub.presentation();
  await runInDurableObject(stub, (_instance, state) => {
    const settings = defaultSettings();
    settings.types[0].enabled = true;
    settings.types[1].enabled = false;
    settings.types[1].name.en = "PRIVATE INACTIVE TYPE";
    settings.googleCalendars = ["private-calendar-id"];
    state.storage.sql.exec(
      "UPDATE config SET value=? WHERE key='settings'",
      JSON.stringify({ settings, revision: 1 }),
    );
  });
  const p = await stub.presentation();
  expect(Object.keys(p).sort()).toEqual([
    "booking",
    "brand",
    "name",
    "spanishEnabled",
  ]);
  expect(Object.keys(p.booking.types[0]).sort()).toEqual([
    "description",
    "duration",
    "id",
    "mode",
    "name",
  ]);
  expect(JSON.stringify(p)).not.toMatch(
    /PRIVATE INACTIVE TYPE|private-calendar-id|locationIds|blackouts|instructions/,
  );
});
