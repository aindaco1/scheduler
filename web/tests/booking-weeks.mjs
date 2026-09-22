import assert from "node:assert/strict";

export async function checkAvailableDates(
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
    failNext = 0,
    failureCode = "google_unavailable";
  const localSettings = structuredClone(settings);
  localSettings.noticeHours = 24;
  localSettings.horizonDays = 30;
  await page.route("**/api/config", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ settings: localSettings, ready: true }),
    }),
  );
  await page.route("**/api/availability?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const from = Date.parse(params.get("from")),
      to = Date.parse(params.get("to"));
    const location = params.get("location");
    requests.push({
      from,
      to,
      location,
      booking: params.get("booking"),
      authorization: route.request().headers().authorization,
    });
    const fail = failNext > 0;
    if (fail) failNext--;
    const slots = [];
    // Weekdays only, with two initial blackout dates and multiple times per date.
    for (
      let day = Math.floor(from / 86400000) * 86400000;
      day < to;
      day += 86400000
    ) {
      const weekday = new Date(day).getUTCDay();
      if (
        !weekday ||
        weekday === 6 ||
        ["2026-09-10", "2026-09-11"].includes(
          new Date(day).toISOString().slice(0, 10),
        )
      )
        continue;
      for (const hour of [18, 19]) {
        const slot = day + hour * 3600000;
        if (
          location !== "cafe" &&
          slot >= from &&
          slot < to &&
          slot >= now + localSettings.noticeHours * 3600000 &&
          slot + 1800000 <= now + localSettings.horizonDays * 86400000
        )
          slots.push(new Date(slot).toISOString());
      }
    }
    await route.fulfill({
      status: fail ? 503 : 200,
      contentType: "application/json",
      body: JSON.stringify(fail ? { error: failureCode } : { slots }),
    });
  });
  const loaded = async (action) => {
    const response = page.waitForResponse((r) =>
      r.url().includes("/api/availability?"),
    );
    await action();
    await response;
    await page.locator("[data-slot-status] .sr-only").waitFor();
  };
  const open = async (date, spanish = false) => {
    now = Date.parse(date);
    await page.clock.setFixedTime(now);
    await page.goto(base + (spanish ? "/es" : "") + bookingPath);
    await loaded(() => page.locator('[data-type="conversation"]').click());
  };
  const shownDates = async () => page.locator(".slot-day h3").allTextContents();
  try {
    await open("2026-09-09T18:00:00Z");
    assert.equal(
      await page
        .getByText(`At least ${localSettings.noticeHours} hours ahead`, {
          exact: true,
        })
        .count(),
      1,
    );
    assert.equal(
      await page.locator("[data-week]").textContent(),
      "Sep 14 – Sep 22",
    );
    assert.equal((await shownDates()).length, 7);
    assert.equal(await page.locator("[data-slot]").count(), 14);
    assert.equal(
      await page
        .getByRole("button", {
          name: "Previous 7 available dates",
          exact: true,
        })
        .isDisabled(),
      true,
    );
    assert.equal(requests[0].from, Date.parse("2026-09-10T06:00:00Z"));
    assert.equal(requests[0].to, Date.parse("2026-09-17T06:00:00Z"));
    assert.equal(requests[1].from, requests[0].to);
    const firstDates = await shownDates();
    await page
      .locator("[data-picker]")
      .screenshot({ path: "work/frontend/available-dates-desktop.png" });

    failNext = 2;
    const beforeFailure = requests.length;
    await page
      .getByRole("button", { name: "Next 7 available dates", exact: true })
      .click();
    await page.locator("[data-retry]").waitFor();
    assert.equal(await page.locator("[data-slot]").count(), 0);
    assert.equal(await page.locator("[data-next]").isDisabled(), true);
    assert.equal(requests.length - beforeFailure, 2);
    const failed = requests.at(-1);
    const beforeRetry = requests.length;
    await loaded(() => page.locator("[data-retry]").click());
    assert.deepEqual(requests[beforeRetry], failed);
    assert.equal(failed.from, Date.parse("2026-09-23T06:00:00Z"));
    assert.equal(
      await page.locator("[data-week]").textContent(),
      "Sep 23 – Oct 1",
    );
    const secondDates = await shownDates();
    assert.equal(new Set([...firstDates, ...secondDates]).size, 14);
    await loaded(() => page.locator("[data-prev]").click());
    assert.deepEqual(await shownDates(), firstDates);
    await loaded(() => page.locator("[data-zone]").selectOption("Asia/Tokyo"));
    assert.equal(
      await page.locator("[data-week]").textContent(),
      "Sep 15 – Sep 23",
    );
    assert.equal((await shownDates()).length, 7);

    await open("2026-09-09T18:00:00Z");
    const allDates = [...(await shownDates())];
    for (
      let i = 0;
      i < 27 && !(await page.locator("[data-next]").isDisabled());
      i++
    ) {
      await loaded(() => page.locator("[data-next]").click());
      const nextDates = await shownDates();
      assert.ok(nextDates.length <= 7);
      allDates.push(...nextDates);
    }
    assert.equal(await page.locator("[data-next]").isDisabled(), true);
    assert.equal(new Set(allDates).size, allDates.length);
    assert.equal((await shownDates()).length, 5);
    assert.equal(
      await page.locator("[data-week]").textContent(),
      "Oct 2 – Oct 8",
    );
    assert.equal(
      requests.at(-1).to,
      now + localSettings.horizonDays * 86400000,
    );

    const beforeDst = requests.length;
    await open("2026-10-28T18:00:00Z", true);
    assert.equal(
      requests[beforeDst].to - requests[beforeDst].from,
      169 * 3600000,
    );
    assert.equal((await shownDates()).length, 7);
    await loaded(() =>
      page
        .getByRole("button", {
          name: "7 fechas disponibles siguientes",
          exact: true,
        })
        .click(),
    );
    await loaded(() =>
      page
        .getByRole("button", {
          name: "7 fechas disponibles anteriores",
          exact: true,
        })
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
      .screenshot({ path: "work/frontend/available-dates-es-mobile-dark.png" });

    // Every scan for rescheduling carries the private booking authorization.
    const fixtureBooking = {
      id: "available-dates-fixture",
      typeId: "conversation",
      typeName: "A conversation",
      mode: "meet",
      locationId: "",
      location: "Google Meet",
      start: now + 10 * 86400000,
      end: now + 10 * 86400000 + 1800000,
      status: "confirmed",
      locale: "en",
      timezone: "America/Denver",
      name: "Fixture guest",
      email: "guest@example.test",
      topic: "",
      cancelUntil: now + 9 * 86400000,
    };
    await page.route("**/api/bookings/available-dates-fixture", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ booking: fixtureBooking }),
      }),
    );
    await page.goto(
      base + "/manage/#id=available-dates-fixture&token=fixture-private-token",
    );
    const beforeManage = requests.length;
    await loaded(() =>
      page.getByRole("button", { name: "Reschedule", exact: true }).click(),
    );
    assert.equal((await shownDates()).length, 7);
    await loaded(() => page.locator("[data-next]").click());
    for (const request of requests.slice(beforeManage)) {
      assert.equal(request.booking, fixtureBooking.id);
      assert.equal(request.authorization, "Bearer fixture-private-token");
    }

    const inPerson = localSettings.types.find(
      (type) => type.mode === "in-person",
    );
    inPerson.enabled = true;
    inPerson.locationIds = ["studio", "cafe"];
    localSettings.locations = [
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
      const beforeZone = requests.length;
      await loaded(() =>
        page.locator("[data-zone]").selectOption("Asia/Tokyo"),
      );
      const startingDate = requests[beforeZone].from;
      const dateLabel = await page.locator("[data-week]").textContent();
      await page.locator("[data-location]").focus();
      failNext = 1;
      failureCode = spanish ? "icloud_unavailable" : "google_unavailable";
      const beforeCafe = requests.length;
      await loaded(() => page.locator("[data-location]").selectOption("cafe"));
      assert.equal(requests[beforeCafe].from, startingDate);
      assert.equal(requests[beforeCafe + 1].from, startingDate);
      assert.equal(
        requests.at(-1).to,
        now + localSettings.horizonDays * 86400000,
      );
      assert.equal(await page.locator("[data-slot]").count(), 0);
      assert.equal(await page.locator("[data-next]").isDisabled(), true);
      assert.equal(
        await page.locator("[data-slots] .empty-state").isVisible(),
        true,
      );
      assert.equal(
        await page.locator("[data-zone]").inputValue(),
        "Asia/Tokyo",
      );
      assert.equal(
        await page
          .locator("[data-location]")
          .evaluate((el) => el === document.activeElement),
        true,
      );
      assert.equal(
        await page.locator("[data-address]").textContent(),
        "456 Coffee Street",
      );
      const count = requests.length;
      await page.locator("[data-location]").selectOption("");
      assert.equal(await page.locator("[data-picker]").isVisible(), false);
      assert.equal(requests.length, count);
      await loaded(() =>
        page.locator("[data-location]").selectOption("studio"),
      );
      assert.equal(requests[count].from, startingDate);
      assert.equal(await page.locator("[data-week]").textContent(), dateLabel);
      assert.equal(
        await page.locator("[data-zone]").inputValue(),
        "Asia/Tokyo",
      );
      await page.locator(".booking-panel").screenshot({
        path: `work/frontend/location-dates-${spanish ? "es-mobile" : "en-desktop"}.png`,
      });
      await loaded(() => page.locator("[data-prev]").click());
      assert.ok(requests.at(-1).from < startingDate);
    }
    failureCode = "google_reconnect_required";
    failNext = 1;
    const beforeReconnect = requests.length;
    await page.locator("[data-location]").selectOption("cafe");
    await page.locator("[data-retry]").waitFor();
    assert.equal(requests.length - beforeReconnect, 1);
    await loaded(() => page.locator("[data-location]").selectOption("studio"));
    failureCode = "icloud_unavailable";
    failNext = 1;
    await page.locator("[data-location]").selectOption("cafe");
    await page
      .getByText(
        "Se interrumpió la consulta del calendario. Volviendo a intentar…",
        { exact: true },
      )
      .waitFor();
    const beforeLeaving = requests.length;
    await page.locator("[data-back]").click();
    await page.waitForTimeout(700);
    assert.equal(requests.length, beforeLeaving);

    // An impossible notice/horizon combination does not issue an invalid range request.
    localSettings.noticeHours = 48;
    localSettings.horizonDays = 1;
    const beforeEmpty = requests.length;
    await page.goto(base + bookingPath);
    await page.locator('[data-type="conversation"]').click();
    await page.locator("[data-slot-status] .sr-only").waitFor();
    assert.equal(requests.length, beforeEmpty);
    assert.equal(await page.locator("[data-prev]").isDisabled(), true);
    assert.equal(await page.locator("[data-next]").isDisabled(), true);
    assert.equal(
      await page.locator("[data-week]").textContent(),
      "No dates available",
    );
    assert.deepEqual(errors, []);
    console.log(
      "Available-date paging passed: seven nonempty dates, notice, horizon, DST, private rescheduling, location retention and provider failures.",
    );
  } finally {
    await context.close();
  }
}
