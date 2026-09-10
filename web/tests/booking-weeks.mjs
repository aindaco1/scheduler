import assert from "node:assert/strict";

export async function checkBookingWeeks(
  browser,
  base,
  apiFixture,
  settings,
  bookingPath,
) {
  const context = await browser.newContext({
    timezoneId: "America/Denver",
    viewport: { width: 1280, height: 900 },
  });
  await context.route("**/api/**", apiFixture);
  const page = await context.newPage();
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let now,
    failNext = false;
  await page.route("**/api/availability?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const from = Date.parse(params.get("from")),
      to = Date.parse(params.get("to"));
    const location = params.get("location");
    requests.push({ from, to, ...(location ? { location } : {}) });
    const fail = failNext;
    failNext = false;
    const slot = Math.max(now + 3 * 86400000, from + 12 * 3600000);
    await route.fulfill({
      status: fail ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(
        fail
          ? { error: "google_unavailable" }
          : {
              slots:
                location !== "cafe" && slot < to
                  ? [new Date(slot).toISOString()]
                  : [],
            },
      ),
    });
  });
  const loaded = async (action) => {
    const response = page.waitForResponse((r) =>
      r.url().includes("/api/availability?"),
    );
    await action();
    await response;
    await page.waitForFunction(
      () => !!document.querySelector("[data-slot-status] .sr-only"),
    );
  };
  const open = async (date, spanish = false) => {
    now = Date.parse(date);
    await page.clock.setFixedTime(now);
    await page.goto(base + (spanish ? "/es" : "") + bookingPath);
    await loaded(() => page.locator('[data-type="conversation"]').click());
  };
  try {
    await open("2026-09-09T18:00:00Z");
    assert.equal(
      await page
        .getByText(`At least ${settings.noticeHours} hours ahead`, {
          exact: true,
        })
        .count(),
      1,
    );
    assert.equal(
      await page.locator("[data-week]").textContent(),
      "Sep 7 – Sep 14",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Previous week", exact: true })
        .isDisabled(),
      true,
    );
    assert.deepEqual(requests.at(-1), {
      from: Date.parse("2026-09-07T06:00:00Z"),
      to: Date.parse("2026-09-14T06:00:00Z"),
    });
    await page
      .locator("[data-picker]")
      .screenshot({ path: "work/frontend/monday-week-desktop.png" });
    failNext = true;
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await page
      .getByRole("button", { name: "Try again", exact: true })
      .waitFor();
    assert.equal(await page.locator("[data-slot]").count(), 0);
    const failed = requests.at(-1);
    await loaded(() =>
      page.getByRole("button", { name: "Try again", exact: true }).click(),
    );
    assert.deepEqual(requests.at(-1), failed);
    assert.equal(failed.from, Date.parse("2026-09-14T06:00:00Z"));
    await loaded(() =>
      page.getByRole("button", { name: "Previous week", exact: true }).click(),
    );
    assert.equal(requests.at(-1).to, failed.from);
    await loaded(() => page.locator("[data-zone]").selectOption("Asia/Tokyo"));
    assert.deepEqual(requests.at(-1), {
      from: Date.parse("2026-09-06T15:00:00Z"),
      to: Date.parse("2026-09-13T15:00:00Z"),
    });
    assert.equal(
      await page.locator("[data-week]").textContent(),
      "Sep 7 – Sep 14",
    );

    await open("2026-09-13T18:00:00Z");
    for (
      let i = 0;
      i < 27 && !(await page.locator("[data-next]").isDisabled());
      i++
    )
      await loaded(() => page.locator("[data-next]").click());
    assert.equal(await page.locator("[data-next]").isDisabled(), true);
    assert.equal(requests.at(-1).to, now + settings.horizonDays * 86400000);
    assert.ok(requests.at(-1).from < requests.at(-1).to);

    await open("2026-10-28T18:00:00Z", true);
    assert.equal(
      await page
        .getByText(`Al menos ${settings.noticeHours} horas de antelación`, {
          exact: true,
        })
        .count(),
      1,
    );
    assert.equal(requests.at(-1).to - requests.at(-1).from, 169 * 3600000);
    const previous = requests.at(-1);
    await loaded(() =>
      page
        .getByRole("button", { name: "Semana siguiente", exact: true })
        .click(),
    );
    assert.equal(requests.at(-1).from, previous.to);
    await loaded(() =>
      page
        .getByRole("button", { name: "Semana anterior", exact: true })
        .click(),
    );
    await page.setViewportSize({ width: 320, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page
      .locator("[data-picker]")
      .screenshot({ path: "work/frontend/monday-week-es-mobile-dark.png" });
    // A different venue must refresh availability without moving the week or zone.
    const locationSettings = structuredClone(settings);
    const inPerson = locationSettings.types.find(
      (type) => type.mode === "in-person",
    );
    inPerson.enabled = true;
    inPerson.locationIds = ["studio", "cafe"];
    locationSettings.locations = [
      {
        id: "studio",
        name: { en: "Studio", es: "Estudio" },
        address: { en: "123 Studio Street", es: "123 Studio Street" },
        enabled: true,
      },
      {
        id: "cafe",
        name: { en: "Cafe", es: "Café" },
        address: { en: "456 Coffee Street", es: "456 Coffee Street" },
        enabled: true,
      },
    ];
    await page.route("**/api/config", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ settings: locationSettings, ready: true }),
      }),
    );
    for (const spanish of [false, true]) {
      now = Date.parse("2026-09-09T18:00:00Z");
      await page.clock.setFixedTime(now);
      await page.setViewportSize({ width: spanish ? 390 : 1280, height: 900 });
      await loaded(() =>
        page.goto(
          `${base}${spanish ? "/es" : ""}${bookingPath}?type=${inPerson.id}&location=studio`,
        ),
      );
      await loaded(() => page.locator("[data-next]").click());
      await loaded(() => page.locator("[data-next]").click());
      await loaded(() =>
        page.locator("[data-zone]").selectOption("Asia/Tokyo"),
      );
      const weekLabel = await page.locator("[data-week]").textContent();
      const expected = {
        from: Date.parse("2026-09-20T15:00:00Z"),
        to: Date.parse("2026-09-27T15:00:00Z"),
      };
      assert.deepEqual(requests.at(-1), { ...expected, location: "studio" });
      assert.equal(await page.locator("[data-slot]").count(), 1);
      await page.locator("[data-location]").focus();
      await loaded(() => page.locator("[data-location]").selectOption("cafe"));
      assert.deepEqual(requests.at(-1), { ...expected, location: "cafe" });
      assert.equal(await page.locator("[data-week]").textContent(), weekLabel);
      assert.equal(
        await page.locator("[data-zone]").inputValue(),
        "Asia/Tokyo",
      );
      assert.equal(await page.locator("[data-slot]").count(), 0);
      assert.equal(
        await page.locator("[data-slots] .empty-state").isVisible(),
        true,
      );
      assert.equal(
        await page.locator("[data-address]").textContent(),
        "456 Coffee Street",
      );
      assert.equal(
        await page
          .locator("[data-location]")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(new URL(page.url()).searchParams.get("location"), "cafe");
      // Clearing and reselecting also keeps the existing browsing context.
      const count = requests.length;
      await page.locator("[data-location]").selectOption("");
      assert.equal(await page.locator("[data-picker]").isVisible(), false);
      assert.equal(await page.locator("[data-place-prompt]").isVisible(), true);
      assert.equal(requests.length, count);
      await loaded(() =>
        page.locator("[data-location]").selectOption("studio"),
      );
      assert.deepEqual(requests.at(-1), { ...expected, location: "studio" });
      assert.equal(await page.locator("[data-week]").textContent(), weekLabel);
      assert.equal(
        await page.locator("[data-zone]").inputValue(),
        "Asia/Tokyo",
      );
      assert.equal(await page.locator("[data-slot]").count(), 1);
      assert.equal(
        await page.locator("[data-address]").textContent(),
        "123 Studio Street",
      );
      await page.locator(".booking-panel").screenshot({
        path: `work/frontend/location-week-${spanish ? "es-mobile" : "en-desktop"}.png`,
      });
      await loaded(() => page.locator("[data-prev]").click());
      assert.equal(requests.at(-1).to, expected.from);
    }
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
}
