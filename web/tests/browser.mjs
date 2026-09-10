// Isolated browser acceptance. Every API and Turnstile request is a fixture;
// this test never authenticates with or writes to a real calendar provider.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
import { checkQuality } from "./quality.mjs";
import { checkBookingWeeks } from "./booking-weeks.mjs";
import { checkSettingsEnhancements } from "./settings.mjs";
const root = resolve(".");
const deployment = JSON.parse(await readFile("_data/deployment.json", "utf8"));
const bookingPath = "/" + deployment.slug;
const model = await build({
  entryPoints: ["worker/src/model.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { defaultSettings } = await import(
  "data:text/javascript;base64," +
    Buffer.from(model.outputFiles[0].text).toString("base64")
);
const settings = defaultSettings("Alonso");
settings.enabled = true;
settings.icloudCalendars = ["https://caldav.example.test/family"];
settings.hours[0].end = "24:00";
settings.recurringBlackouts = [{ day: 1, start: "12:00", end: "13:00" }];
settings.types.forEach((type) => (type.enabled = true));
settings.locations = [
  {
    id: "studio",
    name: { en: "The studio", es: "El estudio" },
    address: { en: "123 Example Street", es: "Calle Ejemplo 123" },
    hours: settings.hours,
    enabled: true,
  },
];
settings.types[2].locationIds = ["studio"];
const server = createServer(async (req, res) => {
  try {
    let path = resolve(
      root,
      "_site",
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (!path.startsWith(resolve(root, "_site") + "/"))
      path = resolve(root, "_site/index.html");
    try {
      if ((await stat(path)).isDirectory()) path += "/index.html";
    } catch {
      path += ".html";
    }
    const mime =
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
      }[extname(path)] || "application/octet-stream";
    const content = await readFile(path);
    res.writeHead(200, { "content-type": mime });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Missing");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  timezoneId: "America/Denver",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
let revision = 1,
  saved,
  settingsUnavailable = false,
  settingsConflict = false,
  bookingWrites = 0,
  credentialWrites = 0;
const ownerRescheduleBodies = [],
  ownerCancellationBodies = [];
const ownerNote =
  "A scheduling change <not HTML>.\nThank you for understanding!";
const start = Date.now() + 3 * 86400000;
let booking = {
  id: "fixture-booking",
  typeId: "conversation",
  typeName: "A conversation",
  mode: "meet",
  location: "Google Meet",
  locationId: "",
  start,
  end: start + 1800000,
  status: "confirmed",
  joinUrl: "https://meet.google.com/fixture",
  locale: "en",
  timezone: "America/Denver",
  email: "guest@example.test",
  name: "Test Guest",
  topic: "A project",
  cancelUntil: start - 86400000,
};
await context.route("https://challenges.cloudflare.com/**", (route) =>
  route.fulfill({
    contentType: "text/javascript",
    body: 'window.turnstile={render(el,o){queueMicrotask(()=>o.callback("fixture-turnstile"));return "widget"},reset(){},remove(){}}',
  }),
);
async function apiFixture(route) {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();
  let payload = {};
  let status = 200;
  if (path === "/api/config")
    payload = { settings, turnstileSiteKey: "fixture-key", ready: true };
  else if (path === "/api/availability") {
    if (url.searchParams.has("booking")) {
      assert.equal(
        new Intl.DateTimeFormat("en", {
          timeZone: "America/Denver",
          weekday: "long",
        }).format(new Date(url.searchParams.get("from"))),
        "Monday",
      );
      assert.equal(url.searchParams.has("token"), false);
      assert.equal(
        route.request().headers().authorization,
        "Bearer fixture-private-token",
      );
    }
    payload = {
      slots: [
        new Date(start).toISOString(),
        new Date(start + 3600000).toISOString(),
      ],
    };
  } else if (path === "/api/bookings" && method === "POST") {
    bookingWrites++;
    const data = route.request().postDataJSON();
    assert.equal(data.turnstile, "fixture-turnstile");
    assert.equal(data.email, "guest@example.test");
    assert.match(data.requestId, /^[\da-f-]{36}$/);
    payload = { booking, token: "fixture-private-token" };
    status = 201;
  } else if (path === "/api/bookings/fixture-booking") {
    assert.equal(
      route.request().headers().authorization,
      "Bearer fixture-private-token",
    );
    payload = { booking };
  } else if (path === "/api/bookings/fixture-booking/reschedule") {
    const data = route.request().postDataJSON();
    assert.equal(data.token, "fixture-private-token");
    booking = {
      ...booking,
      start: Date.parse(data.start),
      end: Date.parse(data.start) + 1800000,
    };
    payload = { booking };
  } else if (path === "/api/bookings/fixture-booking/cancel") {
    assert.equal(route.request().postDataJSON().token, "fixture-private-token");
    booking.status = "cancelled";
    payload = { booking };
  } else if (path === "/api/admin/session") payload = { authenticated: true };
  else if (path === "/api/admin/settings") {
    if (method === "PUT") {
      saved = route.request().postDataJSON();
      if (settingsUnavailable) {
        settingsUnavailable = false;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "google_unavailable" }),
        });
        return;
      }
      if (settingsConflict) {
        settingsConflict = false;
        settings.googleCalendars.push("fixture-work");
        revision++;
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "settings_changed" }),
        });
        return;
      }
      assert.equal(saved.revision, revision);
      Object.assign(settings, saved.settings);
      revision++;
    }
    payload = { settings, revision };
  } else if (path === "/api/admin/bookings") payload = { bookings: [booking] };
  else if (path === "/api/admin/bookings/fixture-booking/cancel") {
    assert.equal(method, "POST");
    const data = route.request().postDataJSON();
    if (data.message) {
      assert.equal(data.message, ownerNote);
      ownerCancellationBodies.push(data);
      if (ownerCancellationBodies.length === 1) {
        status = 503;
        payload = { error: "service_unavailable" };
      } else {
        booking.status = "cancelling";
        payload = { booking };
      }
    } else {
      assert.deepEqual(data, { message: "" });
      assert.equal(booking.status, "pending");
      booking.status = "cancelling";
      booking.error = "zoom_write_uncertain";
      payload = { booking };
    }
  } else if (path === "/api/admin/bookings/fixture-booking/reschedule") {
    assert.equal(method, "POST");
    const data = route.request().postDataJSON();
    assert.equal(data.message, ownerNote);
    ownerRescheduleBodies.push(data);
    if (ownerRescheduleBodies.length === 1) {
      status = 503;
      payload = { error: "service_unavailable" };
    } else {
      booking.start = Date.parse(data.start);
      booking.end = booking.start + 1800000;
      payload = { booking };
    }
  } else if (
    path === "/api/admin/connections" ||
    path === "/api/admin/verify" ||
    path === "/api/admin/connections/icloud"
  ) {
    if (path.endsWith("/icloud")) {
      credentialWrites++;
      assert.equal(route.request().postDataJSON().password, "fixture-password");
    }
    payload = {
      google: { connected: true, email: "owner@example.test" },
      icloud: { connected: true },
      zoom: { connected: true },
      ready: true,
      issues: [],
      calendars: [
        { id: "primary", name: "Personal", provider: "google", writable: true },
        {
          id: "https://caldav.example.test/family",
          name: "Family",
          provider: "icloud",
          writable: false,
        },
        {
          id: "https://caldav.example.test/old-family",
          name: "Family ⚠️",
          provider: "icloud",
          writable: false,
        },
        {
          id: "https://caldav.example.test/reminders",
          name: "Reminders ⚠️",
          provider: "icloud",
          writable: false,
        },
      ],
    };
  } else {
    status = 404;
    payload = { error: "FIXTURE_ROUTE_MISSING" };
    errors.push("Unexpected fixture route " + method + " " + path);
  }
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}
await context.route("**/api/**", apiFixture);
async function axe(name) {
  await page.addScriptTag({
    path: resolve("node_modules/axe-core/axe.min.js"),
  });
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    });
    return result.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.html),
    }));
  });
  assert.deepEqual(violations, [], `${name}: ${JSON.stringify(violations)}`);
}
try {
  await page.goto(base + bookingPath);
  await page.getByRole("heading", { name: "Meet with Alonso." }).waitFor();
  assert.equal(
    await page.getByText("Choose a meeting", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Choose a meeting", exact: true })
      .count(),
    1,
  );
  assert.equal(
    await page.getByText("What brings you here?", { exact: true }).count(),
    0,
  );
  await axe("public home");
  await page.getByRole("button", { name: /A conversation/ }).click();
  await page.locator("[data-slot]").first().waitFor();
  await axe("time picker");
  await page.locator("[data-slot]").first().click();
  await page.getByLabel("Your name").fill("Test Guest");
  await page.getByLabel("Email address").fill("guest@example.test");
  await axe("booking details");
  await page
    .getByRole("button", { name: "Confirm booking", exact: true })
    .click();
  await page.getByRole("heading", { name: "You’re booked." }).waitFor();
  assert.match(page.url(), /#id=fixture-booking&token=fixture-private-token/);
  assert.equal(bookingWrites, 1);
  await axe("confirmed manage");
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  await page.locator("[data-slot]").last().click();
  const moved = page.waitForResponse((response) =>
    response.url().endsWith("/reschedule"),
  );
  await page
    .getByRole("button", { name: "Confirm new time", exact: true })
    .click();
  await moved;
  await page.getByRole("heading", { name: "You’re booked." }).waitFor();
  assert.equal(booking.start, start + 3600000);
  await page
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await page.getByRole("heading", { name: "Booking cancelled." }).waitFor();
  booking.status = "pending";
  await page.reload();
  await page
    .getByRole("heading", { name: "Getting your meeting ready." })
    .waitFor();
  booking.status = "confirmed";
  await page.getByRole("heading", { name: "You’re booked." }).waitFor();
  booking.cancelUntil = Date.now() - 1000;
  await page.reload();
  await page.getByRole("heading", { name: "You’re booked." }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Reschedule", exact: true }).count(),
    0,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Cancel booking", exact: true })
      .count(),
    0,
  );
  booking.status = "failed";
  await page.reload();
  await page
    .getByRole("heading", { name: "This time is no longer available." })
    .waitFor();
  await page
    .getByRole("link", { name: "Choose another time", exact: true })
    .waitFor();
  booking.status = "confirmed";
  booking.cancelUntil = start - 86400000;
  assert.equal(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        localStorage.getItem(key).includes("guest@example.test"),
      ),
    ),
    false,
  );
  await page.goto(base + bookingPath);
  await page.getByRole("button", { name: /Meet in person/ }).click();
  assert.equal(await page.locator("[data-slot]").count(), 0);
  await page.getByLabel("Where shall we meet?").selectOption("studio");
  await page.locator("[data-slot]").first().click();
  const chosen = new URL(page.url()).searchParams.get("slot");
  await page.getByRole("link", { name: "Español", exact: true }).click();
  await page.getByRole("heading", { name: "Confirmemos la reunión" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("slot"), chosen);
  assert.equal(new URL(page.url()).searchParams.get("location"), "studio");
  await page.goto(base + "/es" + bookingPath);
  await page.getByRole("heading", { name: "Reserva con Alonso." }).waitFor();
  assert.equal(
    await page.getByText("Elige una reunión", { exact: true }).count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("heading", { name: "Elige una reunión", exact: true })
      .count(),
    1,
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark" });
  await axe("Spanish dark mobile");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await mkdir("work/frontend", { recursive: true });
  await page.screenshot({
    path: "work/frontend/booking-es-mobile-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(base + "/admin/");
  await page.getByRole("heading", { name: "Your schedule" }).waitFor();
  await axe("admin bookings");
  await page.getByRole("button", { name: "Reschedule", exact: true }).click();
  const ownerMoveForm = page.locator("[data-move-form]");
  await ownerMoveForm
    .locator("[name=start]")
    .fill(new Date(start + 2 * 3600000).toISOString().slice(0, 16));
  await ownerMoveForm.getByLabel("Message to guest (optional)").fill(ownerNote);
  await axe("owner reschedule message");
  await page.screenshot({
    path: "work/frontend/admin-reschedule-message-desktop.png",
    fullPage: true,
  });
  await ownerMoveForm
    .getByRole("button", { name: "Confirm new time", exact: true })
    .click();
  await ownerMoveForm.getByRole("alert").waitFor();
  assert.equal(
    await ownerMoveForm.getByLabel("Message to guest (optional)").inputValue(),
    ownerNote,
  );
  await ownerMoveForm
    .getByRole("button", { name: "Confirm new time", exact: true })
    .click();
  await ownerMoveForm.waitFor({ state: "detached" });
  assert.equal(ownerRescheduleBodies.length, 2);
  assert.deepEqual(ownerRescheduleBodies[0], ownerRescheduleBodies[1]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Message to guest (optional)")
    .fill("Do not send this draft");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Go back", exact: true })
    .click();
  assert.equal(ownerCancellationBodies.length, 0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const ownerCancelDialog = page.getByRole("dialog");
  await ownerCancelDialog
    .getByLabel("Message to guest (optional)")
    .fill(ownerNote);
  assert.equal(
    await ownerCancelDialog.locator("textarea").getAttribute("maxlength"),
    "2000",
  );
  await axe("owner cancellation message");
  await page.screenshot({
    path: "work/frontend/admin-cancel-message-desktop.png",
  });
  await ownerCancelDialog
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await ownerCancelDialog.getByRole("alert").waitFor();
  assert.equal(
    await ownerCancelDialog
      .getByLabel("Message to guest (optional)")
      .inputValue(),
    ownerNote,
  );
  await ownerCancelDialog
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await ownerCancelDialog.waitFor({ state: "detached" });
  assert.deepEqual(ownerCancellationBodies, [
    { message: ownerNote },
    { message: ownerNote },
  ]);
  booking.start = start;
  booking.end = start + 1800000;
  booking.status = "pending";
  booking.error = "google_reconnect_required";
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByText(
      "Reconnect Google Calendar in Settings, then verify the connection and refresh this booking’s status.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Reschedule", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText(/A cancellation will be requested/)
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel booking", exact: true })
    .click();
  await page.getByText("Cancelling", { exact: true }).waitFor();
  await page
    .getByText(
      /Check this meeting in Zoom: the result of its last update is unknown/,
    )
    .waitFor();
  assert.equal(booking.status, "cancelling");
  assert.equal(
    await page.getByRole("button", { name: "Cancel", exact: true }).count(),
    0,
  );
  booking.status = "failed";
  booking.error = "email_needs_attention";
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByText(/Email delivery needs review. Automatic sending has stopped/)
    .waitFor();
  await page.getByRole("button", { name: "Cancel", exact: true }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Reschedule", exact: true }).count(),
    0,
  );
  booking.status = "confirmed";
  booking.error = "email_delivery_pending";
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByText(/Email delivery has not been confirmed. A retry is queued/)
    .waitFor();
  await axe("admin provider recovery");
  booking.error = undefined;
  await page.getByRole("tab", { name: "Availability", exact: true }).click();
  const until = page.locator('[data-setting="hours.0.end"]');
  assert.equal(await until.getAttribute("type"), "time");
  assert.equal(await until.inputValue(), "00:00");
  await page
    .locator(".hours-row")
    .first()
    .screenshot({ path: "work/frontend/until-picker-desktop.png" });
  await until.fill("23:30");
  await until.fill("00:00");
  const recurringUntil = page.locator(
    '[data-setting="recurringBlackouts.0.end"]',
  );
  assert.equal(await recurringUntil.getAttribute("type"), "time");
  await recurringUntil.fill("13:30");
  const addPeriod = await page.locator("[data-add-blackout]").boundingBox();
  const wholeDay = await page.locator(".blackout-day-actions").boundingBox();
  assert.ok(wholeDay.y > addPeriod.y + addPeriod.height);
  await page
    .locator(".blackout-actions")
    .evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page
    .locator(".blackout-actions")
    .screenshot({ path: "work/frontend/blackout-actions-desktop-light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page
    .locator(".blackout-actions")
    .screenshot({ path: "work/frontend/blackout-actions-desktop-dark.png" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.locator("[data-whole-date]").fill("2026-10-31");
  await page.locator("[data-whole-date]").fill("2026-11-01");
  assert.equal(
    await page.locator("[data-whole-end]").inputValue(),
    "2026-11-01",
  );
  await page.locator("[data-whole-scope]").selectOption("in-person");
  await page.locator("[data-add-day]").click();
  assert.equal(
    await page.locator('[data-setting="blackouts.0.scope"]').inputValue(),
    "in-person",
  );
  await page.locator("[data-add-blackout]").click();
  assert.equal(
    await page.locator('[data-setting="blackouts.1.scope"]').inputValue(),
    "all",
  );
  await page
    .locator('[data-setting="blackouts.1.start"]')
    .fill("2026-09-18T09:00");
  await page
    .locator('[data-setting="blackouts.1.end"]')
    .fill("2026-09-18T10:00");
  await page
    .locator('[data-setting="blackouts.1.scope"]')
    .selectOption("in-person");
  await page.locator("[data-whole-date]").fill("2026-09-16");
  await page.locator("[data-whole-end]").fill("2026-09-15");
  await page.locator("[data-add-day]").click();
  assert.equal(await page.locator(".blackout-row").count(), 2);
  assert.match(
    await page
      .locator("[data-whole-end]")
      .evaluate((el) => el.validationMessage),
    /on or after/,
  );
  await page.locator("[data-whole-end]").fill("");
  await page.locator("[data-add-day]").click();
  assert.equal(await page.locator(".blackout-row").count(), 2);
  await page.locator("[data-whole-end]").fill("2026-09-25");
  await page.locator("[data-whole-scope]").selectOption("in-person");
  await page.locator("[data-add-day]").click();
  assert.equal(await page.locator(".blackout-row").count(), 3);
  assert.equal(
    await page.locator('[data-setting="blackouts.2.start"]').inputValue(),
    "2026-09-16T00:00",
  );
  assert.equal(
    await page.locator('[data-setting="blackouts.2.end"]').inputValue(),
    "2026-09-26T00:00",
  );
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  await page.getByLabel("Minimum notice (hours)", { exact: true }).fill("48");
  await page.getByLabel("Booking window (days)", { exact: true }).fill("45");
  await page.getByRole("tab", { name: "Availability", exact: true }).click();
  settingsUnavailable = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Your changes weren’t saved" })
    .waitFor();
  assert.equal(settings.blackouts.length, 0);
  assert.equal(
    await page.locator('[data-setting="blackouts.0.scope"]').inputValue(),
    "in-person",
  );
  assert.equal(
    await page.locator('[data-setting="blackouts.1.start"]').inputValue(),
    "2026-09-18T09:00",
  );
  settingsConflict = true;
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "All changes saved", exact: true })
    .waitFor();
  assert.equal(saved.settings.noticeHours, 48);
  assert.equal(saved.settings.horizonDays, 45);
  assert.equal(saved.settings.hours[0].end, "24:00");
  assert.equal(saved.settings.recurringBlackouts[0].end, "13:30");
  assert.equal(saved.settings.blackouts[0].scope, "in-person");
  assert.equal(
    Date.parse(saved.settings.blackouts[0].end) -
      Date.parse(saved.settings.blackouts[0].start),
    25 * 3600_000,
  );
  assert.equal(saved.settings.blackouts[1].scope, "in-person");
  assert.equal(saved.settings.blackouts[2].scope, "in-person");
  assert.equal(
    Date.parse(saved.settings.blackouts[2].start),
    Date.parse("2026-09-16T06:00:00Z"),
  );
  assert.equal(
    Date.parse(saved.settings.blackouts[2].end),
    Date.parse("2026-09-26T06:00:00Z"),
  );
  assert.equal(
    await page.locator('[data-setting="blackouts.1.scope"]').inputValue(),
    "in-person",
  );
  await page
    .locator(".blackout-row")
    .first()
    .screenshot({ path: "work/frontend/blackout-period-desktop-light.png" });

  assert.ok(saved.settings.googleCalendars.includes("fixture-work"));
  await axe("admin availability");
  await page.getByRole("tab", { name: "Meeting types", exact: true }).click();
  const locationUntil = page.locator(
    '[data-setting="locations.0.hours.0.end"]',
  );
  assert.equal(await locationUntil.getAttribute("type"), "time");
  assert.equal(await locationUntil.inputValue(), "00:00");
  await locationUntil.fill("22:00");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "All changes saved", exact: true })
    .waitFor();
  assert.equal(saved.settings.locations[0].hours[0].end, "22:00");
  await axe("admin meeting types");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
  const holidaySetting = page.getByRole("checkbox", {
    name: "Block U.S. federal holidays",
    exact: true,
  });
  assert.equal(await holidaySetting.isChecked(), false);
  await holidaySetting.focus();
  await page.keyboard.press("Space");
  assert.equal(await holidaySetting.isChecked(), true);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "All changes saved", exact: true })
    .waitFor();
  assert.equal(saved.settings.blockUsFederalHolidays, true);
  await page
    .locator("[data-holiday-settings]")
    .screenshot({ path: "work/frontend/federal-holidays-desktop.png" });
  await page.getByLabel("Apple Account email").fill("owner@example.test");
  await page
    .getByLabel("App-specific password", { exact: true })
    .fill("fixture-password");
  await page
    .getByRole("button", { name: "Update connection", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector("input[name=password]")?.value === "",
  );
  assert.equal(credentialWrites, 1);
  // All desktop tabs survive refresh; saved rules are loaded from the API.
  for (const [name, id] of [
    ["Bookings", "bookings"],
    ["Availability", "availability"],
    ["Meeting types", "types"],
    ["Settings", "settings"],
  ]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await page.reload();
    await page.locator(`#panel-${id}`).waitFor({ state: "visible" });
    assert.equal(
      await page
        .getByRole("tab", { name, exact: true })
        .getAttribute("aria-selected"),
      "true",
    );
  }
  assert.equal(
    await page
      .getByLabel("Minimum notice (hours)", { exact: true })
      .inputValue(),
    "48",
  );
  assert.equal(
    await page
      .getByLabel("Booking window (days)", { exact: true })
      .inputValue(),
    "45",
  );
  await page
    .locator("[data-booking-rules]")
    .screenshot({ path: "work/frontend/booking-rules-desktop.png" });
  await axe("admin settings");
  await page.screenshot({
    path: "work/frontend/admin-settings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page
    .getByLabel("Dashboard section", { exact: true })
    .selectOption("availability");
  await page.reload();
  await page.locator("#panel-availability").waitFor({ state: "visible" });
  assert.equal(
    await page.getByLabel("Dashboard section", { exact: true }).inputValue(),
    "availability",
  );
  assert.equal(await page.locator("#panel-availability").isVisible(), true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await axe("admin mobile");
  await page
    .locator(".hours-row")
    .first()
    .screenshot({ path: "work/frontend/until-picker-mobile.png" });
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .locator(".hours-row")
    .first()
    .screenshot({ path: "work/frontend/until-picker-320.png" });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(base + "/es/admin/");
  await page.locator("#panel-availability").waitFor({ state: "visible" });
  assert.equal(
    await page.getByLabel("Sección del panel", { exact: true }).inputValue(),
    "availability",
  );
  await page
    .getByLabel("Sección del panel", { exact: true })
    .selectOption("settings");
  assert.equal(
    await page
      .getByLabel("Antelación mínima (horas)", { exact: true })
      .inputValue(),
    "48",
  );
  assert.equal(
    await page
      .getByLabel("Plazo de reserva (días)", { exact: true })
      .inputValue(),
    "45",
  );
  await page
    .locator("[data-booking-rules]")
    .screenshot({ path: "work/frontend/booking-rules-es-mobile-dark.png" });
  const spanishHolidaySetting = page.getByRole("checkbox", {
    name: "Bloquear los feriados federales de EE. UU.",
    exact: true,
  });
  assert.equal(await spanishHolidaySetting.isChecked(), true);
  await axe("Spanish federal holiday setting mobile");
  await page
    .locator("[data-holiday-settings]")
    .screenshot({ path: "work/frontend/federal-holidays-es-mobile-dark.png" });
  await spanishHolidaySetting.uncheck();
  await page
    .getByRole("button", { name: "Guardar cambios", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Cambios guardados", exact: true })
    .waitFor();
  assert.equal(saved.settings.blockUsFederalHolidays, false);
  await page
    .getByLabel("Sección del panel", { exact: true })
    .selectOption("availability");
  await page.locator("[data-whole-scope]").selectOption("in-person");
  await axe("Spanish scoped blackouts mobile");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page
    .locator(".blackout-actions")
    .screenshot({ path: "work/frontend/blackout-actions-es-mobile-dark.png" });
  await page
    .locator(".blackout-row")
    .first()
    .screenshot({ path: "work/frontend/blackout-period-es-mobile-dark.png" });
  await page
    .getByLabel("Sección del panel", { exact: true })
    .selectOption("bookings");
  await page
    .getByRole("button", { name: "Cambiar horario", exact: true })
    .click();
  await page
    .getByLabel("Mensaje para el invitado (opcional)")
    .fill("Gracias por tu comprensión.\nNos vemos pronto.");
  await axe("Spanish owner reschedule message mobile");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "work/frontend/admin-reschedule-message-es-mobile-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Mensaje para el invitado (opcional)")
    .fill("Disculpa el cambio.\nGracias por tu comprensión.");
  await axe("Spanish owner cancellation message mobile");
  await page.screenshot({
    path: "work/frontend/admin-cancel-message-es-mobile-dark.png",
  });
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.goto(base + "/privacy/");
  await page
    .getByRole("heading", { name: "A meeting, with privacy in mind." })
    .waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ colorScheme: "light" });
  await axe("privacy English light desktop");
  assert.equal(await page.locator('[aria-busy="true"]').count(), 0);
  await page.screenshot({
    path: "work/frontend/privacy-en-desktop-light.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Español", exact: true }).click();
  await page
    .getByRole("heading", { name: "Una reunión con tu privacidad en mente." })
    .waitFor();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: "dark" });
  await axe("privacy Spanish dark mobile");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.screenshot({
    path: "work/frontend/privacy-es-mobile-dark.png",
    fullPage: true,
  });
  // Whole days stay anchored to the schedule while the owner is travelling.
  const travelContext = await browser.newContext({ timezoneId: "Asia/Tokyo" });
  await travelContext.route("**/api/**", apiFixture);
  const travelPage = await travelContext.newPage();
  travelPage.on("pageerror", (error) => errors.push(error.message));
  await travelPage.goto(base + "/admin/");
  await travelPage
    .getByRole("tab", { name: "Availability", exact: true })
    .click();
  const rangeIndex = settings.blackouts.length;
  await travelPage.locator("[data-whole-date]").fill("2026-10-31");
  await travelPage.locator("[data-whole-end]").fill("2026-11-02");
  await travelPage.locator("[data-add-day]").click();
  await travelPage
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await travelPage
    .getByRole("button", { name: "All changes saved", exact: true })
    .waitFor();
  const travelRange = saved.settings.blackouts[rangeIndex];
  assert.equal(travelRange.scope, "all");
  assert.equal(
    Date.parse(travelRange.start),
    Date.parse("2026-10-31T06:00:00Z"),
  );
  assert.equal(Date.parse(travelRange.end), Date.parse("2026-11-03T07:00:00Z"));
  assert.equal(
    Date.parse(travelRange.end) - Date.parse(travelRange.start),
    73 * 3600000,
  );
  const travelEnd = travelPage.locator(
    `[data-setting="blackouts.${rangeIndex}.end"]`,
  );
  assert.equal(await travelEnd.inputValue(), "2026-11-03T00:00");
  await travelPage
    .locator('[data-setting="timezone"]')
    .selectOption("Asia/Tokyo");
  assert.equal(await travelEnd.inputValue(), "2026-11-03T16:00");
  await travelPage
    .locator('[data-setting="timezone"]')
    .selectOption("America/Denver");
  await travelEnd.fill("2026-11-04T00:00");
  await travelPage
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await travelPage
    .getByRole("button", { name: "All changes saved", exact: true })
    .waitFor();
  assert.equal(
    Date.parse(saved.settings.blackouts[rangeIndex].end),
    Date.parse("2026-11-04T07:00:00Z"),
  );
  await travelEnd.fill("2027-03-14T02:30");
  assert.match(
    await travelEnd.evaluate((el) => el.validationMessage),
    /does not exist/,
  );
  await travelContext.close();
  // An obsolete preference or disabled browser storage cannot break admin.
  const preferenceContext = await browser.newContext();
  await preferenceContext.route("**/api/**", apiFixture);
  const preferencePage = await preferenceContext.newPage();
  preferencePage.on("pageerror", (error) => errors.push(error.message));
  await preferencePage.goto(base + "/admin/");
  await preferencePage.evaluate(() =>
    sessionStorage.setItem("scheduler:admin-tab", "removed-tab"),
  );
  await preferencePage.reload();
  await preferencePage.locator("#panel-bookings").waitFor({ state: "visible" });
  await preferencePage.addInitScript(() => {
    Object.defineProperty(window, "sessionStorage", {
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
  });
  await preferencePage.reload();
  await preferencePage.locator("#panel-bookings").waitFor({ state: "visible" });
  await preferencePage
    .getByRole("tab", { name: "Settings", exact: true })
    .click();
  await preferencePage.locator("#panel-settings").waitFor({ state: "visible" });
  await preferenceContext.close();
  await checkQuality(browser, base, apiFixture, bookingPath);
  await checkBookingWeeks(browser, base, apiFixture, settings, bookingPath);
  await checkSettingsEnhancements(
    browser,
    base,
    apiFixture,
    settings,
    bookingPath,
  );
  assert.deepEqual(errors, []);
  console.log(
    "Frontend acceptance passed: booking, management, bilingual themes, mobile layout, admin saves, iCloud form, and WCAG axe scans.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
