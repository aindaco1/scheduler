// Isolated browser acceptance. Every API and Turnstile request is a fixture;
// this test never authenticates with or writes to a real calendar provider.
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import assert from "node:assert/strict";
const root = resolve(".");
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
const settings = defaultSettings();
settings.enabled = true;
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
  bookingWrites = 0,
  credentialWrites = 0;
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
await context.route("**/api/**", async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  const method = route.request().method();
  let payload = {};
  let status = 200;
  if (path === "/api/config")
    payload = { settings, turnstileSiteKey: "fixture-key", ready: true };
  else if (path === "/api/availability") {
    if (url.searchParams.has("booking")) {
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
      assert.equal(saved.revision, revision);
      Object.assign(settings, saved.settings);
      revision++;
    }
    payload = { settings, revision };
  } else if (path === "/api/admin/bookings") payload = { bookings: [booking] };
  else if (path === "/api/admin/bookings/fixture-booking/cancel") {
    assert.equal(method, "POST");
    assert.deepEqual(route.request().postDataJSON(), {});
    assert.equal(booking.status, "pending");
    booking.status = "cancelling";
    booking.error = "zoom_write_uncertain";
    payload = { booking };
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
});
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
  await page.goto(base + "/alonso");
  await page.getByRole("heading", { name: "Meet with Alonso." }).waitFor();
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
  await page.goto(base + "/alonso");
  await page.getByRole("button", { name: /Meet in person/ }).click();
  assert.equal(await page.locator("[data-slot]").count(), 0);
  await page.getByLabel("Where shall we meet?").selectOption("studio");
  await page.locator("[data-slot]").first().click();
  const chosen = new URL(page.url()).searchParams.get("slot");
  await page.getByRole("link", { name: "Español", exact: true }).click();
  await page.getByRole("heading", { name: "Confirmemos la reunión" }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("slot"), chosen);
  assert.equal(new URL(page.url()).searchParams.get("location"), "studio");
  await page.goto(base + "/es/alonso");
  await page.getByRole("heading", { name: "Reserva con Alonso." }).waitFor();
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
    .getByText(/Email delivery needs review. Automatic sending is paused/)
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
  await page.getByLabel("Minimum notice (hours)", { exact: true }).fill("48");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page
    .getByRole("button", { name: "All changes saved", exact: true })
    .waitFor();
  assert.equal(saved.settings.noticeHours, 48);
  await axe("admin availability");
  await page.getByRole("tab", { name: "Meeting types", exact: true }).click();
  await axe("admin meeting types");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();
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
  await axe("admin settings");
  await page.screenshot({
    path: "work/frontend/admin-settings-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page
    .getByLabel("Dashboard section", { exact: true })
    .selectOption("availability");
  assert.equal(await page.locator("#panel-availability").isVisible(), true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await axe("admin mobile");
  await page.getByRole("link", { name: "Privacy", exact: true }).click();
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
  assert.deepEqual(errors, []);
  console.log(
    "Frontend acceptance passed: booking, management, bilingual themes, mobile layout, admin saves, iCloud form, and WCAG axe scans.",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
