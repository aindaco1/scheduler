import assert from "node:assert/strict";

export async function checkSharing(
  browser,
  base,
  apiFixture,
  initial,
  bookingPath,
) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  let settings = structuredClone(initial);
  page.on("pageerror", (error) =>
    console.error("Sharing page error:", error.message),
  );
  await context.addInitScript(() => {
    window.copiedLinks = [];
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text) => {
          if (window.denyClipboard) throw new Error("Clipboard denied");
          window.copiedLinks.push(text);
        },
      },
    });
  });
  await context.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/config")
      return route.fulfill({
        json: { settings, ready: true, turnstileSiteKey: "fixture-key" },
      });
    if (url.pathname === "/api/admin/settings") {
      if (route.request().method() === "PUT")
        settings = route.request().postDataJSON().settings;
      return route.fulfill({ json: { settings, revision: 1 } });
    }
    return apiFixture(route);
  });
  try {
    for (const prefix of ["", "/es"]) {
      await page.goto(
        base +
          prefix +
          "/admin/?slot=private-time&location=private-location#private",
      );
      await page.locator(".mobile-tabs select").selectOption("types");
      const button = page.locator('[data-copy-meeting="conversation"]');
      await button.click();
      assert.deepEqual(await page.evaluate(() => window.copiedLinks), [
        base + prefix + bookingPath + "?type=conversation",
      ]);
      assert.equal(
        await button.locator("..").locator("[data-share-status]").innerText(),
        prefix ? "Enlace copiado." : "Link copied.",
      );
      await page
        .locator('[data-setting="types.0.name.en"]')
        .fill("Unsaved name");
      await button.click();
      assert.equal(
        (await page.evaluate(() => window.copiedLinks)).at(-1),
        base + prefix + bookingPath + "?type=conversation",
      );
      await page.evaluate(() => {
        window.denyClipboard = true;
      });
      await button.click();
      const fallback = button.locator("..").locator("[data-share-url]");
      assert.equal(
        await fallback.inputValue(),
        base + prefix + bookingPath + "?type=conversation",
      );
      assert(await fallback.isVisible());
      const selected = await fallback.evaluate(
        (input) => input.selectionEnd - input.selectionStart,
      );
      assert.equal(selected, (await fallback.inputValue()).length);
      await page.locator('[data-setting="types.0.enabled"]').press("Space");
      assert(await button.isDisabled());
      assert.equal(await fallback.isVisible(), false);
      await page.locator('[data-setting="types.0.enabled"]').press("Space");
      await page.locator("[data-add-type]").click();
      const newType = page.locator('[data-setting="types.3.enabled"]');
      await newType.press("Space");
      assert(await page.locator("[data-copy-meeting]").last().isDisabled());
      await page.locator("[data-save]").click();
      await page.locator("[data-save]").getAttribute("disabled");
      await page.waitForFunction(
        () => !document.querySelectorAll("[data-copy-meeting]")[3].disabled,
      );
      await page.screenshot({
        path: `work/frontend/sharing-${prefix ? "es" : "en"}-mobile.png`,
        fullPage: true,
      });
      // Restore the same fixture before the other language; no live writes occur.
      settings = structuredClone(initial);
    }
    settings.spanishEnabled = false;
    await page.goto(base + "/es/admin/");
    await page.locator(".mobile-tabs select").selectOption("types");
    await page.locator('[data-copy-meeting="conversation"]').click();
    assert.deepEqual(await page.evaluate(() => window.copiedLinks), [
      base + bookingPath + "?type=conversation",
    ]);
    for (const query of [
      "?type=missing",
      "?type=",
      "?type=conversation&type=zoom",
    ]) {
      await page.goto(base + bookingPath + query);
      await page
        .getByRole("heading", { name: "Meeting unavailable", exact: true })
        .waitFor();
      await page
        .getByRole("link", { name: "All meetings", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Choose a meeting", exact: true })
        .waitFor();
    }
    console.log(
      "Meeting sharing passed: clean bilingual links, saved/active state, clipboard fallback, retired links and mobile layouts.",
    );
  } finally {
    await context.close();
  }
}
