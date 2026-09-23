import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  pendingRequirements,
  requirements,
  renderedCase,
} from "../../scripts/jev-cases.mjs";

const clean = (text) =>
  text
    .replace(/https?:\/\/\S+/g, "[link]")
    .replace(/[\w.+-]+@[\w.-]+/g, "[email]")
    .trim();

// Runs inside the existing browser harness, with its local server and built app.
// All state is synthetic; unexpected APIs and nonlocal requests fail the capture.
export async function captureJevCases(
  browser,
  base,
  originalSettings,
  bookingPath,
) {
  const cases = [];
  const context = await browser.newContext({
    timezoneId: "UTC",
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.clock.setFixedTime(new Date("2026-09-09T12:00:00Z"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const settings = structuredClone(originalSettings);
  Object.assign(settings, {
    name: "Fixture Host",
    enabled: true,
    spanishEnabled: true,
    timezone: "UTC",
    cancelHours: 24,
    noticeHours: 24,
    horizonDays: 30,
  });
  const start = Date.parse("2026-09-14T16:00:00Z");
  const token = "synthetic-management-token";
  let locale,
    booking,
    availabilityFailure = false,
    denied = false;
  let submissions = 0,
    reschedules = 0,
    cancellations = 0;
  const freshBooking = () => ({
    id: "jev-fixture",
    requestId: "synthetic-request",
    typeId: "conversation",
    typeName: locale === "es" ? "Una conversación" : "A conversation",
    mode: "meet",
    locationId: "",
    location: "Google Meet",
    start,
    end: start + 1_800_000,
    status: "pending",
    locale,
    timezone: "UTC",
    name: "Fixture Guest",
    email: "guest@example.test",
    topic: "",
    cancelUntil: start - 86_400_000,
    gap: 15,
    created: 0,
    updated: 0,
    revision: 1,
    managementHash: "synthetic-hash",
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    const respond = (payload, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    if (url.hostname === "challenges.cloudflare.com")
      return route.fulfill({
        contentType: "text/javascript",
        body: 'window.turnstile={render(el,o){queueMicrotask(()=>o.callback("fixture-turnstile"));return "widget"},reset(){},remove(){}}',
      });
    if (url.origin !== base) {
      errors.push("Unexpected external request");
      return route.abort();
    }
    if (!url.pathname.startsWith("/api/")) return route.continue();
    if (url.pathname === "/api/config")
      return respond({
        settings,
        ready: true,
        turnstileSiteKey: "fixture-key",
      });
    if (url.pathname === "/api/availability") {
      if (url.searchParams.has("booking"))
        assert.equal(request.headers().authorization, `Bearer ${token}`);
      if (availabilityFailure)
        return respond({ error: "google_unavailable" }, 503);
      const from = Date.parse(url.searchParams.get("from")),
        to = Date.parse(url.searchParams.get("to"));
      return respond({
        slots: [start, start + 3_600_000]
          .filter((s) => s >= from && s < to)
          .map((s) => new Date(s).toISOString()),
      });
    }
    if (url.pathname === "/api/bookings" && request.method() === "POST") {
      const data = request.postDataJSON();
      assert.equal(data.locale, locale);
      assert.equal(data.email, "guest@example.test");
      assert.equal(data.turnstile, "fixture-turnstile");
      assert.equal(Date.parse(data.start), start);
      submissions++;
      return respond({ booking, token }, 202);
    }
    if (
      url.pathname === "/api/bookings/jev-fixture" &&
      request.method() === "GET"
    ) {
      assert.equal(request.headers().authorization, `Bearer ${token}`);
      return denied
        ? respond({ error: "invalid_token" }, 403)
        : respond({ booking });
    }
    if (
      url.pathname === "/api/bookings/jev-fixture/reschedule" &&
      request.method() === "POST"
    ) {
      const data = request.postDataJSON();
      assert.equal(data.token, token);
      assert.match(data.requestId, /^[a-f0-9-]{36}$/);
      assert.equal(Date.parse(data.start), start + 3_600_000);
      reschedules++;
      booking = { ...booking, status: "rescheduling" };
      return respond({ booking });
    }
    if (
      url.pathname === "/api/bookings/jev-fixture/cancel" &&
      request.method() === "POST"
    ) {
      assert.equal(request.postDataJSON().token, token);
      cancellations++;
      booking = { ...booking, status: "cancelled" };
      return respond({ booking });
    }
    errors.push(
      `Unexpected fixture route: ${request.method()} ${url.pathname}`,
    );
    return respond({ error: "unexpected_fixture_route" }, 500);
  });
  const capture = async (kind, scope, rule = requirements[kind]) => {
    const candidate = clean(await page.locator(scope).innerText());
    assert.ok(candidate.length > 10);
    cases.push(
      renderedCase(
        `browser-${kind}-${locale}`,
        candidate,
        kind === "pending" ? pendingRequirements : { meaning: rule },
      ),
    );
  };
  const heading = (en, es) =>
    page
      .getByRole("heading", { name: locale === "es" ? es : en, exact: true })
      .waitFor();
  try {
    for (locale of ["en", "es"]) {
      const prefix = locale === "es" ? "/es" : "";
      booking = freshBooking();
      availabilityFailure = true;
      await page.goto(base + prefix + bookingPath);
      await page.locator('[data-type="conversation"]').click();
      await page.locator("[data-retry]").waitFor();
      assert.equal(await page.locator("[data-slot]").count(), 0);
      await capture("unavailable", "[data-picker]");
      availabilityFailure = false;
      await page.locator("[data-retry]").click();
      await page.locator("[data-slot]").first().click();
      await page.locator('[name="name"]').fill("Fixture Guest");
      await page.locator('[name="email"]').fill("guest@example.test");
      await page.locator("[data-submit]").click();
      await heading("Getting your meeting ready.", "Preparando tu reunión.");
      assert.equal(await page.locator("[data-reschedule]").count(), 0);
      const pendingCopy =
        locale === "es"
          ? "Tu reunión aún no está confirmada."
          : "Your meeting is not confirmed yet.";
      assert.ok(
        (await page.locator(".manage-wrap").innerText()).includes(pendingCopy),
      );
      await capture("pending", ".manage-wrap");
      booking.status = "confirmed";
      await page.reload();
      await heading("You’re booked.", "Tu reserva está confirmada.");
      await capture("confirmed", ".manage-wrap");
      await page.locator("[data-reschedule]").click();
      await page.locator("[data-slot]").first().waitFor();
      await capture("reschedule", "[data-reschedule-panel]");
      await page
        .locator(`[data-slot="${new Date(start + 3_600_000).toISOString()}"]`)
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name:
            locale === "es" ? "Confirmar nuevo horario" : "Confirm new time",
          exact: true,
        })
        .click();
      await heading("Getting your meeting ready.", "Preparando tu reunión.");
      assert.equal(booking.start, start); // The pending fixture retains the original time.
      // A pending change must not imply the original booking lost confirmation.
      assert.ok(
        !(await page.locator(".manage-wrap").innerText()).includes(pendingCopy),
      );
      booking = {
        ...booking,
        status: "confirmed",
        start: start + 3_600_000,
        end: start + 5_400_000,
      };
      await page.reload();
      await heading("You’re booked.", "Tu reserva está confirmada.");
      const visible = await page.locator(".manage-wrap").innerText();
      assert.ok(visible.includes("17:00") || visible.includes("5:00"));
      await capture("rescheduled", ".manage-wrap", requirements.confirmed);
      booking.cancelUntil = Date.parse("2026-09-08T12:00:00Z");
      await page.reload();
      await heading("You’re booked.", "Tu reserva está confirmada.");
      assert.equal(
        await page.locator("[data-reschedule], [data-cancel]").count(),
        0,
      );
      await capture("deadline", ".manage-wrap");
      booking.cancelUntil = start - 86_400_000;
      await page.reload();
      await page.locator("[data-cancel]").click();
      await page
        .getByRole("dialog")
        .getByRole("button", {
          name: locale === "es" ? "Cancelar reserva" : "Cancel booking",
          exact: true,
        })
        .click();
      await heading("Booking cancelled.", "Reserva cancelada.");
      assert.equal(
        await page.locator("[data-reschedule], [data-cancel]").count(),
        0,
      );
      await capture("cancelled", ".manage-wrap");
      booking.status = "failed";
      await page.reload();
      await heading(
        "This time is no longer available.",
        "Este horario ya no está disponible.",
      );
      await capture("failed", ".manage-wrap");
      denied = true;
      await page.reload();
      await heading(
        "We couldn’t open this booking.",
        "No pudimos abrir esta reserva.",
      );
      assert.equal(
        await page.locator("[data-reschedule], [data-cancel]").count(),
        0,
      );
      assert.ok(
        !(await page.locator(".manage-wrap").innerText()).includes(
          "guest@example.test",
        ),
      );
      await capture(
        "unauthorized",
        ".manage-wrap",
        "The booking could not be opened; the candidate does not claim that it was successfully retrieved or changed.",
      );
      denied = false;
    }
    assert.equal(submissions, 2);
    assert.equal(reschedules, 2);
    assert.equal(cancellations, 2);

    const bundled = await build({
      stdin: {
        contents: 'export { bookingEmail } from "./worker/src/email.ts";',
        resolveDir: process.cwd(),
      },
      bundle: true,
      format: "esm",
      platform: "node",
      write: false,
    });
    const { bookingEmail } = await import(
      "data:text/javascript;base64," +
        Buffer.from(bundled.outputFiles[0].text).toString("base64")
    );
    for (locale of ["en", "es"]) {
      for (const kind of [
        "confirmed",
        "rescheduled",
        "cancelled",
        "reminder",
      ]) {
        const instructions =
          locale === "es"
            ? "Entra por la puerta lateral."
            : "Use the side entrance.";
        const changeMessage =
          locale === "es"
            ? "Gracias por tu flexibilidad."
            : "Thank you for being flexible.";
        const email = bookingEmail(
          {
            ...freshBooking(),
            status: kind === "cancelled" ? "cancelled" : "confirmed",
            mode: "in-person",
            location: "123 Example Street",
            locationInstructions: instructions,
            changeMessage,
          },
          settings,
          "https://scheduler.example",
          token,
          kind,
        );
        assert.equal(email.to, "guest@example.test");
        assert.equal(email.text.includes(token), kind !== "cancelled");
        assert.equal(email.html.includes(token), kind !== "cancelled");
        assert.equal(email.text.includes(instructions), kind !== "cancelled");
        assert.equal(email.html.includes(instructions), kind !== "cancelled");
        assert.equal(
          email.text.includes(changeMessage),
          ["rescheduled", "cancelled"].includes(kind),
        );
        if (kind !== "cancelled")
          assert.ok(
            email.html.includes(
              `${locale === "es" ? "/es" : ""}/manage/#id=jev-fixture`,
            ),
          );
        await page.setContent(email.html);
        const rules = {
          meaning:
            kind === "rescheduled"
              ? "The meeting has been rescheduled to the time shown; the change is completed rather than merely requested."
              : requirements[kind],
          policy:
            kind === "cancelled"
              ? "The cancelled booking needs no further action from the guest."
              : "The guest can cancel or reschedule until 24 hours before the meeting.",
        };
        for (const [format, text] of [
          ["text", email.text],
          ["html", await page.locator("main").innerText()],
        ]) {
          cases.push(
            renderedCase(
              `email-${kind}-${locale}-${format}`,
              clean(text),
              rules,
            ),
          );
        }
      }
    }
    assert.deepEqual(errors, []);
    assert.equal(cases.length, 34);
    return cases;
  } finally {
    await context.close();
  }
}
