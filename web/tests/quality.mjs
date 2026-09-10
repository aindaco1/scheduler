import assert from "node:assert/strict";
export async function checkQuality(browser, base, apiFixture, bookingPath) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  await context.route("**/api/**", apiFixture);
  const page = await context.newPage();
  try {
    await page.goto(base + bookingPath);
    await page.locator("[data-type]").first().waitFor();
    await page.keyboard.press("Tab");
    assert.equal(
      await page
        .locator(".skip-link")
        .evaluate((el) => el === document.activeElement),
      true,
      "Skip link is the first keyboard stop",
    );
    await page.keyboard.press("Enter");
    assert.equal(
      await page
        .locator("#main")
        .evaluate((el) => el === document.activeElement),
      true,
    );
    await page.locator("[data-type]").first().focus();
    await page.keyboard.press("Enter");
    await page.locator("[data-slot]").first().waitFor();
    await page.locator("[data-next]").focus();
    await page.keyboard.press("Enter");
    await page.locator("[data-slot-status] .sr-only").waitFor();
    assert.equal(
      await page
        .locator("[data-next]")
        .evaluate((el) => el === document.activeElement),
      true,
      "Week navigation retains keyboard focus",
    );
    assert.match(
      await page.locator("[data-slot-status]").textContent(),
      /available times|No openings/,
    );
    await page.locator("[data-prev]").focus();
    await page.keyboard.press("Enter");
    await page.locator("[data-slot-status] .sr-only").waitFor();
    assert.equal(
      await page
        .locator("[data-next]")
        .evaluate((el) => el === document.activeElement),
      true,
      "Disabled previous control moves focus to next",
    );
    for (const path of [
      bookingPath,
      "/es" + bookingPath,
      "/admin/",
      "/es/admin/",
      "/privacy/",
      "/es/privacy/",
    ]) {
      await page.goto(base + path);
      await page.waitForFunction(
        () =>
          document.querySelector("#app")?.getAttribute("aria-busy") !== "true",
      );
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%"),
      );
      await page.setViewportSize({ width: 320, height: 850 });
      if (
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        )
      ) {
        await page.screenshot({
          path: "work/frontend/audit-overflow.png",
          fullPage: true,
        });
        console.log(
          await page.evaluate(() =>
            [...document.querySelectorAll("body *")]
              .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 15)
              .map((el) => ({
                tag: el.tagName,
                class: el.className,
                width: el.getBoundingClientRect().width,
              })),
          ),
        );
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${path}: 200% text at 320px overflows`,
      );
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      const violations = await page.evaluate(async () =>
        (
          await axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
      );
      assert.deepEqual(
        violations,
        [],
        `${path}: reduced motion / high zoom accessibility`,
      );
    }
    await page.screenshot({
      path: "work/frontend/audit-spanish-privacy-200-percent.png",
      fullPage: true,
    });
    console.log(
      "Quality browser checks passed: skip link, week focus, live announcements, 200% text, reduced motion, English/Spanish and WCAG scans.",
    );
  } finally {
    await context.close();
  }
}
