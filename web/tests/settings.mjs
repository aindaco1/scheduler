import assert from "node:assert/strict";

export async function checkSettingsEnhancements(
  browser,
  base,
  apiFixture,
  settings,
  bookingPath,
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
    await page.locator('[data-setting="defaultGaps.video"]').fill("20");
    await page.locator('[data-setting="defaultGaps.inPerson"]').fill("45");
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
    assert.equal(settings.defaultGaps.video, 20);
    assert.equal(settings.defaultGaps.inPerson, 45);
    await reload();
    assert.equal(
      await page.locator('[data-setting="defaultGaps.video"]').inputValue(),
      "20",
    );
    assert.equal(await page.locator(".reminder-row").count(), 3);
    await page
      .locator("[data-booking-rules]")
      .screenshot({ path: "work/frontend/gap-settings-desktop.png" });
    await page
      .locator("[data-reminder-settings]")
      .screenshot({ path: "work/frontend/reminders-desktop.png" });
    const email = page.locator(".connection-email");
    assert.equal(await email.textContent(), "owner@example.test");
    assert.equal(
      await page.locator(".connection-card p").first().textContent(),
      "New meetings are added automatically to your main Google calendar.",
    );
    await page
      .locator(".connection-card")
      .first()
      .screenshot({ path: "work/frontend/google-connection-desktop.png" });
    await page.getByRole("tab", { name: "Meeting types", exact: true }).click();
    assert.equal(await page.locator("[data-default-gap]").count(), 0);
    assert.equal(
      await page.locator('[data-setting="types.0.gap"]').isDisabled(),
      false,
    );
    const gapBox = await page
      .locator('[data-setting="types.0.gap"]')
      .boundingBox();
    const nameBox = await page
      .locator('[data-setting="types.0.name.en"]')
      .boundingBox();
    assert.ok(Math.abs(gapBox.x - nameBox.x) < 2);
    assert.equal(
      await page
        .locator("#panel-types .editor-card")
        .first()
        .getByRole("checkbox", { name: "Active", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page.locator('[data-setting="types.0.gap"]').inputValue(),
      "20",
    );
    await page.locator('[data-setting="types.0.gap"]').fill("35");
    await save();
    assert.equal(settings.types[0].gap, 35);
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await page.locator('[data-setting="defaultGaps.video"]').fill("25");
    await save();
    await page.getByRole("tab", { name: "Meeting types", exact: true }).click();
    assert.equal(
      await page.locator('[data-setting="types.0.gap"]').inputValue(),
      "35",
    );
    assert.equal(
      await page.locator('[data-setting="types.1.gap"]').inputValue(),
      "25",
    );
    await page.locator('[data-setting="types.0.gap"]').fill("25");
    await page
      .locator('[data-setting="types.0.mode"]')
      .selectOption("in-person");
    assert.equal(
      await page.locator('[data-setting="types.0.gap"]').inputValue(),
      "45",
    );
    await page.locator('[data-setting="types.0.mode"]').selectOption("meet");
    assert.equal(
      await page.locator('[data-setting="types.0.gap"]').inputValue(),
      "25",
    );
    await page
      .locator("#panel-types .editor-card")
      .first()
      .screenshot({ path: "work/frontend/gap-override-desktop.png" });
    await save();
    assert.equal(settings.types[0].gap, null);
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await page.locator('[data-setting="brand.name"]').fill("Fixture & Brand");
    await save();
    await reload();
    assert.equal(settings.brand.name, "Fixture & Brand");
    assert.equal(
      await page.locator('[data-setting="brand.name"]').inputValue(),
      "Fixture & Brand",
    );
    assert.equal(
      await page.locator(".wordmark [data-brand-name]").textContent(),
      "Fixture & Brand",
    );
    await page.getByRole("tab", { name: "Meeting types", exact: true }).click();
    await page
      .locator('[data-setting="locations.0.instructions.en"]')
      .fill("Use the side door.\nRing once.");
    await page
      .locator('[data-setting="locations.0.instructions.es"]')
      .fill("Usa la puerta lateral.\nToca una vez.");
    await save();
    assert.equal(
      settings.locations[0].instructions.en,
      "Use the side door.\nRing once.",
    );
    assert.equal(
      await page
        .getByLabel("Full street address", { exact: true })
        .inputValue(),
      settings.locations[0].address.en,
    );
    assert.equal(
      await page.locator('[data-setting="locations.0.address.es"]').count(),
      0,
    );
    await page
      .getByLabel("Full street address", { exact: true })
      .first()
      .fill("123 Example St, Town, NM 87102");
    await save();
    assert.deepEqual(settings.locations[0].address, {
      en: "123 Example St, Town, NM 87102",
      es: "123 Example St, Town, NM 87102",
    });
    assert.equal(
      await page
        .locator('[data-setting="locations.0.enabled"]')
        .getAttribute("type"),
      "checkbox",
    );
    assert.equal(
      await page
        .locator('[data-setting="locations.0.enabled"]')
        .locator("..")
        .textContent(),
      "Active",
    );
    await page
      .locator("#panel-types .panel")
      .last()
      .screenshot({ path: "work/frontend/location-instructions-desktop.png" });
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    const intro = settings.intro.es;
    await page.locator('[data-setting="intro.es"]').fill(intro + " Traducido.");
    await page.locator('[data-setting="spanishEnabled"]').uncheck();
    assert.equal(
      await page.locator('[data-setting="intro.es"]').isVisible(),
      false,
    );
    assert.equal(
      await page
        .locator('[data-setting="spanishEnabled"]')
        .evaluate((el) => el === document.activeElement),
      true,
    );
    const fullWidth = await page
      .locator('[data-setting="intro.en"]')
      .evaluate(
        (el) =>
          Math.abs(
            el.getBoundingClientRect().width -
              el.closest(".bilingual-fields").getBoundingClientRect().width,
          ) < 2,
      );
    assert.equal(fullWidth, true);
    await save();
    await reload();
    assert.equal(settings.spanishEnabled, false);
    assert.equal(settings.intro.es, intro + " Traducido.");
    assert.equal(await page.locator("#language-link").isVisible(), false);
    await page.getByRole("tab", { name: "Meeting types", exact: true }).click();
    assert.equal(
      await page.locator('[data-setting="types.0.name.es"]').isVisible(),
      false,
    );
    assert.equal(
      await page.locator('[data-setting="locations.0.address.es"]').count(),
      0,
    );
    assert.equal(
      await page
        .locator('[data-setting="types.0.name.en"]')
        .evaluate(
          (el) =>
            Math.abs(
              el.getBoundingClientRect().width -
                el.closest(".bilingual-fields").getBoundingClientRect().width,
            ) < 2,
        ),
      true,
    );
    const guest = await context.newPage();
    await guest.goto(base + "/es" + bookingPath + "?type=conversation#kept");
    await guest.waitForURL(base + bookingPath + "?type=conversation#kept");
    assert.equal(await guest.locator("#language-link").isVisible(), false);
    await guest.close();
    await page.getByRole("tab", { name: "Settings", exact: true }).click();
    await page.locator('[data-setting="spanishEnabled"]').check();
    assert.equal(
      await page.locator('[data-setting="intro.es"]').inputValue(),
      intro + " Traducido.",
    );
    await save();
    assert.equal(await page.locator("#language-link").isVisible(), true);
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
    const previewBox = await page.locator(".logo-visual").boundingBox(),
      controlsBox = await page.locator(".logo-controls").boundingBox();
    assert.ok(previewBox.x > controlsBox.x + controlsBox.width);
    assert.ok(Math.abs(previewBox.y - controlsBox.y) < 2);
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
    assert.equal(
      await page.locator(".wordmark [data-brand-name]").textContent(),
      "Fixture & Brand",
    );
    assert.deepEqual(settings.reminderHours, []);
    await reload();
    assert.equal(await page.locator(".reminder-row").count(), 0);
    assert.equal(
      await page
        .getByRole("img", { name: "Logo preview", exact: true })
        .count(),
      0,
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.locator('[data-setting="brand.name"]').fill("");
    const activeSwitch = page.getByRole("switch", {
      name: "Active",
      exact: true,
    });
    assert.equal(await activeSwitch.isChecked(), true);
    await activeSwitch.focus();
    await activeSwitch.press("Space");
    assert.equal(await activeSwitch.isChecked(), false);
    // Settings remain a draft until the existing Save changes action.
    assert.equal(settings.enabled, true);
    await save();
    await reload();
    assert.equal(settings.enabled, false);
    assert.equal(settings.brand.name, "");
    assert.equal(
      await page.locator('[data-setting="brand.name"]').isVisible(),
      true,
    );
    assert.equal(
      await page.locator(".wordmark [data-brand-name]").isVisible(),
      false,
    );
    assert.equal(await page.locator(".wordmark svg").count(), 1);
    assert.equal(await page.locator(".wordmark .header-logo").count(), 0);

    const heading = await page
      .locator(".booking-page-heading h2")
      .boundingBox();
    const toggle = await page.locator(".active-toggle").boundingBox();
    assert.ok(toggle.x > heading.x + heading.width);
    assert.ok(
      Math.abs(toggle.y + toggle.height / 2 - heading.y - heading.height / 2) <
        2,
    );
    await page
      .locator("[data-booking-page]")
      .screenshot({ path: "work/frontend/booking-page-active-desktop.png" });
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    assert.deepEqual((await page.evaluate(() => axe.run())).violations, []);
    const visitor = await context.newPage();
    for (const [path, label] of [
      [bookingPath, "Not accepting bookings right now"],
      ["/es" + bookingPath, "No se aceptan reservas por ahora"],
    ]) {
      const response = await visitor.goto(base + path + "?type=conversation");
      assert.equal(response.status(), 200);
      await visitor
        .getByRole("heading", { name: label, exact: true })
        .waitFor();
      assert.equal(await visitor.locator(".choice-card").count(), 0);
      assert.equal(
        await visitor
          .locator('meta[property="og:site_name"]')
          .getAttribute("content"),
        "Scheduler",
      );
      await visitor.screenshot({
        path: `work/frontend/paused-${path.startsWith("/es") ? "es" : "en"}.png`,
      });
    }
    await visitor.close();
    await page.setViewportSize({ width: 320, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .locator("[data-booking-page]")
      .screenshot({ path: "work/frontend/booking-page-active-mobile.png" });
    await activeSwitch.focus();
    await activeSwitch.press("Space");
    await page.locator('[data-setting="brand.name"]').fill("Fixture & Brand");
    await save();
    assert.equal(settings.enabled, true);
    assert.equal(
      await page.locator(".wordmark [data-brand-name]").isVisible(),
      true,
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
