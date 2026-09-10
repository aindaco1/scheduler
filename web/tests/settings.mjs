import assert from "node:assert/strict";

export async function checkSettingsEnhancements(
  browser,
  base,
  apiFixture,
  settings,
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  await context.route("**/api/**", apiFixture);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let uploads = 0,
    failUpload = false,
    imageBytes;
  const logoUrl = "https://scheduler.example/api/logo/" + "1".repeat(64);
  await page.route("**/api/admin/logo", async (route) => {
    uploads++;
    if (failUpload) {
      failUpload = false;
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "service_unavailable" }),
      });
    }
    assert.equal(route.request().method(), "POST");
    assert.equal(route.request().headers()["content-type"], "image/png");
    assert.deepEqual(route.request().postDataBuffer(), imageBytes);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ url: logoUrl }),
    });
  });
  await page.route(logoUrl, (route) =>
    route.fulfill({ contentType: "image/png", body: imageBytes }),
  );
  const save = async () => {
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await page
      .getByRole("button", { name: "All changes saved", exact: true })
      .waitFor();
  };
  const reload = async () => {
    await page.reload();
    await page.locator("#panel-settings").waitFor({ state: "visible" });
  };
  try {
    await page.goto(base + "/admin/");
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    assert.equal(
      await page
        .locator(
          '[data-calendar="icloud"][value="https://caldav.example.test/family"]',
        )
        .isChecked(),
      true,
    );
    assert.equal(
      await page
        .locator(
          '[data-calendar="icloud"][value="https://caldav.example.test/old-family"]',
        )
        .isChecked(),
      false,
    );
    assert.match(
      await page.locator(".calendar-list").textContent(),
      /Family ⚠️/,
    );
    assert.equal(
      await page.getByText("Ready to book", { exact: true }).count(),
      1,
    );
    assert.deepEqual(
      await page.locator("#panel-settings h2").allTextContents(),
      [
        "Your booking page",
        "Booking boundaries",
        "Reminders",
        "Automatic blackouts",
        "Calendar connections",
      ],
    );
    await page.locator('[data-setting="types.0.gap"]').fill("20");
    await page.locator('[data-setting="types.2.gap"]').fill("45");
    await page
      .getByRole("button", { name: "Add reminder", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Add reminder", exact: false })
      .click();
    assert.equal(await page.locator(".reminder-row").count(), 3);
    assert.equal(await page.locator("[data-add-reminder]").isDisabled(), true);
    await page.locator('[data-setting="reminderHours.1"]').fill("24");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    assert.match(
      await page
        .locator('[data-setting="reminderHours.1"]')
        .evaluate((el) => el.validationMessage),
      /different time/,
    );
    assert.deepEqual(settings.reminderHours, [24]);
    for (const [i, hours] of [48, 24, 1].entries())
      await page
        .locator(`[data-setting="reminderHours.${i}"]`)
        .fill(String(hours));
    await save();
    assert.deepEqual(settings.reminderHours, [48, 24, 1]);
    assert.equal(settings.types[0].gap, 20);
    assert.equal(settings.types[2].gap, 45);
    await reload();
    assert.equal(
      await page.locator('[data-setting="types.0.gap"]').inputValue(),
      "20",
    );
    assert.equal(await page.locator(".reminder-row").count(), 3);
    await page
      .locator("[data-booking-rules]")
      .screenshot({ path: "work/frontend/gap-settings-desktop.png" });
    await page
      .locator("[data-reminder-settings]")
      .screenshot({ path: "work/frontend/reminders-desktop.png" });
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#666";
      ctx.fillRect(0, 0, 512, 512);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    imageBytes = Buffer.from(png, "base64");
    const selectLogo = (buffer, mimeType = "image/png") =>
      page
        .locator("[data-logo-file]")
        .setInputFiles({ name: "fixture-logo", mimeType, buffer });
    const originalLogo = settings.brand.logoUrl;
    await selectLogo(Buffer.from("<svg/>"), "image/svg+xml");
    await page
      .getByText("Choose a valid PNG or JPEG image.", { exact: true })
      .waitFor();
    await selectLogo(Buffer.alloc(1_000_001));
    await page.getByText(/This image is too large/).waitFor();
    await selectLogo(Buffer.from("not an image"));
    await page
      .getByText("Choose a valid PNG or JPEG image.", { exact: true })
      .waitFor();
    const wide = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 2049;
      canvas.height = 1;
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await selectLogo(Buffer.from(wide, "base64"));
    await page.getByText(/Resize the image/).waitFor();
    assert.equal(uploads, 0);
    failUpload = true;
    await selectLogo(imageBytes);
    await page.locator("[data-logo-error][role=alert]").waitFor();
    assert.equal(settings.brand.logoUrl, originalLogo);
    await selectLogo(imageBytes);
    await page
      .getByText("Image ready. Save changes to publish it.", { exact: true })
      .waitFor();
    assert.equal(settings.brand.logoUrl, originalLogo);
    assert.ok(
      (
        await page
          .getByRole("img", { name: "Logo preview", exact: true })
          .getAttribute("src")
      ).startsWith("data:image/png"),
    );
    await save();
    assert.equal(settings.brand.logoUrl, logoUrl);
    await reload();
    assert.equal(
      await page
        .getByRole("img", { name: "Logo preview", exact: true })
        .getAttribute("src"),
      logoUrl,
    );
    assert.equal(
      await page.getByLabel("Logo URL (optional)", { exact: true }).count(),
      0,
    );
    await page
      .locator("[data-logo-editor]")
      .evaluate((node) => node.scrollIntoView({ block: "start" }));
    await page
      .locator("[data-logo-editor]")
      .screenshot({ path: "work/frontend/logo-upload-desktop.png" });
    await page.setViewportSize({ width: 320, height: 900 });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(base + "/es/admin/");
    await page.locator("#panel-settings").waitFor({ state: "visible" });
    assert.deepEqual(
      await page.locator("#panel-settings h2").allTextContents(),
      [
        "Tu página de reservas",
        "Límites de reserva",
        "Recordatorios",
        "Bloqueos automáticos",
        "Conexiones de calendario",
      ],
    );
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const violations = await page.evaluate(async () =>
      (
        await window.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        })
      ).violations.map(({ id, nodes }) => ({
        id,
        nodes: nodes.map((node) => node.html),
      })),
    );
    assert.deepEqual(violations, []);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .locator("[data-logo-editor]")
      .evaluate((node) => node.scrollIntoView({ block: "start" }));
    await page
      .locator("[data-logo-editor]")
      .screenshot({ path: "work/frontend/logo-upload-es-mobile-dark.png" });
    await page
      .locator("[data-reminder-settings]")
      .screenshot({ path: "work/frontend/reminders-es-mobile-dark.png" });
    await page.goto(base + "/admin/");
    await page.locator("#panel-settings").waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: "Remove logo", exact: true })
      .click();
    for (let i = 0; i < 3; i++)
      await page.locator("[data-remove-reminder]").first().click();
    await save();
    assert.equal(settings.brand.logoUrl, "");
    assert.deepEqual(settings.reminderHours, []);
    await reload();
    assert.equal(await page.locator(".reminder-row").count(), 0);
    assert.equal(
      await page
        .getByRole("img", { name: "Logo preview", exact: true })
        .count(),
      0,
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
