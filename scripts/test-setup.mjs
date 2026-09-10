import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { readProject } from "./project-config.mjs";
await mkdir("work", { recursive: true });
const root = resolve("."),
  fixture = await mkdtemp(resolve("work/fork-"));
try {
  await cp("wrangler.jsonc", fixture + "/wrangler.jsonc");
  execFileSync(
    process.execPath,
    [
      resolve("scripts/setup.mjs"),
      "--origin",
      "https://meet.example.org",
      "--slug",
      "taylor",
      "--name",
      "Taylor & Co",
      "--brand",
      "MY STUDIO",
      "--timezone",
      "Europe/Madrid",
      "--worker",
      "taylor-scheduler",
      "--account",
      "a".repeat(32),
      "--turnstile",
      "0x4AAAAAAAAAAAAAAAAAAAA",
    ],
    { cwd: fixture, stdio: "pipe" },
  );
  const { site, config } = await readProject(fixture + "/wrangler.jsonc");
  assert.equal(config.routes[0].pattern, "meet.example.org");
  assert.equal(config.vars.OWNER_SLUG, "taylor");
  for (const name of [
    "_config.yml",
    "_layouts",
    "_includes",
    "_plugins",
    "pages",
    "index.html",
    "404.html",
    "robots.txt",
    "sitemap.xml",
  ])
    await cp(name, fixture + "/" + name, { recursive: true });
  await mkdir(fixture + "/_data");
  await writeFile(fixture + "/_data/deployment.json", JSON.stringify(site));
  await cp("_data/build.json", fixture + "/_data/build.json");
  execFileSync(
    "bundle",
    [
      "exec",
      "jekyll",
      "build",
      "--source",
      fixture,
      "--destination",
      fixture + "/_site",
    ],
    {
      cwd: root,
      env: { ...process.env, JEKYLL_ENV: "production" },
      stdio: "pipe",
    },
  );
  const en = await readFile(fixture + "/_site/taylor.html", "utf8");
  const es = await readFile(fixture + "/_site/es/taylor.html", "utf8");
  assert(en.includes("https://meet.example.org/taylor"));
  assert(en.includes("Taylor &amp; Co") && en.includes("MY STUDIO"));
  assert(es.includes('data-booking-path="/es/taylor"'));
  assert(!en.includes("dustwave.xyz") && !en.includes("/alonso"));
  const admin = await readFile(fixture + "/_site/admin/index.html", "utf8");
  assert(admin.includes('data-booking-path="/taylor"'));
  assert.throws(() =>
    execFileSync(
      process.execPath,
      [
        resolve("scripts/setup.mjs"),
        "--origin",
        "https://meet.example.org",
        "--slug",
        "admin",
        "--name",
        "Taylor",
        "--timezone",
        "UTC",
        "--worker",
        "test",
        "--account",
        "a".repeat(32),
        "--turnstile",
        "0x4AAAAAAAAAAAAAAAAAAAA",
      ],
      { cwd: fixture, stdio: "pipe" },
    ),
  );
  await cp("_site/assets", fixture + "/_site/assets", { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route("**/*", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/config")
        return route.fulfill({
          json: {
            ready: false,
            turnstileSiteKey: "",
            settings: {
              name: "Taylor & Co",
              intro: { en: "A fixture", es: "Una prueba" },
              enabled: false,
              timezone: "Europe/Madrid",
              noticeHours: 24,
              horizonDays: 30,
              cancelHours: 24,
              types: [],
              locations: [],
              brand: { primary: "#101215", logoUrl: "" },
            },
          },
        });
      const file =
        fixture +
        "/_site" +
        (path.endsWith("/")
          ? path + "index.html"
          : /\.[a-z0-9]+$/i.test(path)
            ? path
            : path + ".html");
      const mime = path.endsWith(".js")
        ? "text/javascript"
        : path.endsWith(".css")
          ? "text/css"
          : path.endsWith(".svg")
            ? "image/svg+xml"
            : path.endsWith(".woff2")
              ? "font/woff2"
              : "text/html";
      try {
        await route.fulfill({ body: await readFile(file), contentType: mime });
      } catch {
        await route.fulfill({ status: 404, body: "Fixture resource missing" });
      }
    });
    const page = await context.newPage();
    await page.goto("https://meet.example.org/taylor");
    await page
      .getByRole("heading", { name: "Not accepting bookings right now" })
      .waitFor();
    assert.equal(
      await page.locator(".wordmark").getAttribute("href"),
      "/taylor",
    );
    await page.getByRole("link", { name: "Español", exact: true }).click();
    await page
      .getByRole("heading", { name: "No se aceptan reservas por ahora" })
      .waitFor();
    assert.equal(
      await page.locator(".wordmark").getAttribute("href"),
      "/es/taylor",
    );
    assert.equal(
      await page.locator("#language-link").getAttribute("href"),
      "https://meet.example.org/taylor",
    );
  } finally {
    await browser.close();
  }
  console.log(
    "Fork setup passed: independent domain, route, owner, brand, locales, private pages, and reserved-route rejection.",
  );
} finally {
  await rm(fixture, { recursive: true, force: true });
}
