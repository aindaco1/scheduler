import assert from "node:assert/strict";
import { build } from "esbuild";

export async function checkAdminEmail(browser, settings) {
  const bundled = await build({
    entryPoints: ["worker/src/email.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const { adminBookingEmail } = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundled.outputFiles[0].text).toString("base64")
  );
  const context = await browser.newContext();
  await context.route("**/*", (route) => route.abort());
  const page = await context.newPage();
  try {
    for (const locale of ["en", "es"]) {
      const email = adminBookingEmail(
        {
          id: "synthetic-booking",
          name: "Fixture Guest",
          email: "guest-" + "x".repeat(50) + "@example.test",
          typeName: locale === "es" ? "Reunión en persona" : "Meet in person",
          start: Date.parse("2026-10-14T16:30:00Z"),
          end: Date.parse("2026-10-14T17:30:00Z"),
          timezone: "Asia/Tokyo",
          locale,
          location: "123 Example Street",
          topic:
            locale === "es"
              ? "Quisiera hablar sobre mi próximo proyecto."
              : "I'd like to discuss my next project.",
          managementToken: "must-not-be-shared",
        },
        { ...settings, timezone: "America/Denver" },
        "https://scheduler.example",
        "admin@example.test",
      );
      assert.equal(email.to, "admin@example.test");
      assert.ok(!email.html.includes("must-not-be-shared"));
      for (const width of [320, 768]) {
        await page.setViewportSize({ width, height: 900 });
        await page.setContent(email.html);
        assert.equal(await page.locator("html").getAttribute("lang"), locale);
        assert.match(await page.locator("main").innerText(), /America\/Denver/);
        assert.match(await page.locator("main").innerText(), /10:30/);
        assert.equal(
          await page.getByRole("link").getAttribute("href"),
          `https://scheduler.example${locale === "es" ? "/es" : ""}/admin/`,
        );
        await page.keyboard.press("Tab");
        assert.equal(await page.locator("a:focus").count(), 1);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await page.screenshot({
          path: `work/frontend/admin-booking-email-${locale}-${width}.png`,
          fullPage: true,
        });
      }
    }
  } finally {
    await context.close();
  }
  console.log(
    "Admin booking email passed: English/Spanish, owner time zone, private dashboard link and narrow layouts.",
  );
}
