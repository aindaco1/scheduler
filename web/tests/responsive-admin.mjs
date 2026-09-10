import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { responsiveLayoutIssues } from "./responsive-public.mjs";

// All APIs are fixtures. Review the actual production CSS at phone, tablet and
// desktop widths, including keyboard-operated card switches and compact saves.
export async function checkResponsiveAdmin(
  browser,
  base,
  apiFixture,
  settings,
) {
  const context = await browser.newContext();
  await context.route("**/api/**", apiFixture);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const checks = [];
  const selectTab = async (key) => {
    const mobile = page.locator(".mobile-tabs select");
    if (await mobile.isVisible()) await mobile.selectOption(key);
    else await page.locator("#tab-" + key).click();
    await page.locator("#panel-" + key).waitFor({ state: "visible" });
  };
  try {
    for (const locale of ["en", "es"]) {
      await page.goto(base + (locale === "es" ? "/es" : "") + "/admin/");
      await page.locator("#admin-tabs").waitFor();
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      for (const width of [320, 390, 768, 1024, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({
          colorScheme: width === 390 || width === 1024 ? "dark" : "light",
        });
        for (const tab of ["availability", "types", "settings", "bookings"]) {
          await selectTab(tab);
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
            false,
            `${locale}/${width}/${tab}: page overflow`,
          );
          const result = { locale, width, tab };
          if (tab !== "bookings") {
            const bar = await page.locator(".save-bar").boundingBox();
            result.savedBarHeight = bar.height;
            if (width <= 1024) {
              const save = await page.locator("[data-save]").boundingBox();
              result.savedCenterOffset = Math.abs(
                save.x + save.width / 2 - bar.x - bar.width / 2,
              );
              if (tab === "types")
                await page.screenshot({
                  path: `work/frontend/admin-${locale}-${width}-saved-centered.png`,
                });
              assert.ok(
                result.savedCenterOffset <= 1,
                `${locale}/${width}/${tab}: saved label is ${result.savedCenterOffset}px off center`,
              );
              assert.ok(
                bar.height <= 44,
                `${locale}/${width}: saved strip ${bar.height}px`,
              );
            }
          }
          if (tab === "types") {
            const cards = page.locator("#panel-types .editor-card");
            for (let i = 0; i < (await cards.count()); i++) {
              const card = cards.nth(i),
                detail = card.locator("details"),
                toggle = card.getByRole("switch");
              const open = await detail.evaluate((el) => el.open);
              const checked = await toggle.isChecked();
              await toggle.focus();
              await toggle.press("Space");
              assert.equal(await toggle.isChecked(), !checked);
              assert.equal(
                await detail.evaluate((el) => el.open),
                open,
                "Active must not expand/collapse its card",
              );
              const dirtyBar = await page.locator(".save-bar").boundingBox();
              if (width <= 1024) {
                const save = await page.locator("[data-save]").boundingBox();
                const offset = Math.abs(
                  save.x + save.width / 2 - dirtyBar.x - dirtyBar.width / 2,
                );
                result.unsavedCenterOffset = Math.max(
                  result.unsavedCenterOffset || 0,
                  offset,
                );
                if (i === 0)
                  await page.screenshot({
                    path: `work/frontend/admin-${locale}-${width}-unsaved-centered.png`,
                  });
                assert.ok(
                  offset <= 1,
                  `${locale}/${width}: Save changes is ${offset}px off center`,
                );
                assert.ok(
                  dirtyBar.height <= 64,
                  `${locale}/${width}: unsaved bar ${dirtyBar.height}px`,
                );
              }
              assert.ok(
                (await page.locator("[data-save]").boundingBox()).height >= 44,
                "Save target remains 44px",
              );
              await toggle.press("Space");
              assert.equal(
                await page.locator("[data-save]").isDisabled(),
                true,
              );
              const switchRect = await card
                  .locator(".active-toggle")
                  .boundingBox(),
                cardRect = await card.boundingBox();
              assert.ok(
                Math.abs(switchRect.y - cardRect.y - (width <= 760 ? 17 : 21)) <
                  2,
                "Switch at card top",
              );
              assert.ok(
                cardRect.x + cardRect.width - switchRect.x - switchRect.width <=
                  23,
                "Switch at card right",
              );
              if (!open) await detail.locator("summary").press("Enter");
              const gaps = await detail
                .locator(".stack")
                .first()
                .evaluate((el) => {
                  const children = [...el.children].filter(
                    (n) => n.getBoundingClientRect().height > 0,
                  );
                  return children
                    .slice(1)
                    .map(
                      (n, index) =>
                        n.getBoundingClientRect().top -
                        children[index].getBoundingClientRect().bottom,
                    );
                });
              assert.ok(
                gaps.every((gap) => gap >= 12 && gap <= 24),
                `${locale}/${width}: doubled vertical spacing ${gaps}`,
              );
            }
            for (const index of [0, (await cards.count()) - 1]) {
              await cards
                .nth(index)
                .locator("summary")
                .scrollIntoViewIfNeeded();
              await page.screenshot({
                path: `work/frontend/admin-${locale}-${width}-${index === 0 ? "type" : "location"}.png`,
              });
            }
          }
          if (tab === "settings") {
            assert.equal(
              await page
                .locator("#panel-settings .panel")
                .last()
                .getAttribute("data-other-settings"),
              "",
            );
            const field = page.locator(
              '[data-setting="cancelledBookingRetentionDays"]',
            );
            assert.equal(
              await field.inputValue(),
              String(settings.cancelledBookingRetentionDays),
            );
            const verify = await page.locator("[data-verify]").boundingBox(),
              divider = await page
                .locator(".connection-card")
                .first()
                .boundingBox();
            result.verifyGap = divider.y - verify.y - verify.height;
            assert.ok(result.verifyGap >= 16, "Verify button clears divider");
            if (width === 1280) {
              await page
                .locator(".connections-heading")
                .scrollIntoViewIfNeeded();
              await page.screenshot({
                path: `work/frontend/connections-spacing-${locale}.png`,
              });
            }
          }
          result.issues = await responsiveLayoutIssues(page, "#panel-" + tab);
          if (
            result.issues.length ||
            (tab === "availability" &&
              locale === "es" &&
              [320, 768].includes(width))
          ) {
            result.screenshot = `work/frontend/admin-${locale}-${width}-${tab}-expanded.png`;
            await page
              .locator("#panel-" + tab)
              .screenshot({ path: result.screenshot });
          }
          checks.push(result);
        }
        await selectTab("types");
        const violations = await page.evaluate(
          async () => (await axe.run()).violations,
        );
        assert.deepEqual(violations, [], `${locale}/${width}: axe findings`);
      }
    }
    await page.goto(base + "/admin/");
    await selectTab("settings");
    const retention = page.locator(
      '[data-setting="cancelledBookingRetentionDays"]',
    );
    for (const days of [7, 0, 1]) {
      await retention.fill(String(days));
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await page
        .getByRole("button", { name: "All changes saved", exact: true })
        .waitFor();
      assert.equal(settings.cancelledBookingRetentionDays, days);
      await page.reload();
      await page.locator("#panel-settings").waitFor({ state: "visible" });
      assert.equal(await retention.inputValue(), String(days));
    }
    assert.deepEqual(errors, []);
    await writeFile(
      "work/frontend/responsive-admin-review.json",
      JSON.stringify(checks, null, 2) + "\n",
    );
    assert.deepEqual(
      checks.filter((check) => check.issues.length),
      [],
      "Expanded admin fields must fit without control or text overlap",
    );
    console.log(
      `Responsive admin passed: ${checks.length} locale/viewport/tab checks, card switch keyboard behavior, spacing, save strips and retention settings.`,
    );
  } finally {
    await context.close();
  }
}
