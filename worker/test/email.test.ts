import { describe, expect, it } from "vitest";
import { adminBookingEmail, bookingEmail } from "../src/email";
import { defaultSettings, type Booking } from "../src/model";

const booking: Booking = {
  id: "11111111-2222-4333-8444-555555555555",
  requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  typeId: "conversation",
  typeName: "A conversation",
  mode: "meet",
  locationId: "",
  location: "Google Meet",
  start: Date.parse("2026-09-12T16:00:00Z"),
  end: Date.parse("2026-09-12T16:30:00Z"),
  gap: 15,
  name: "Fixture guest",
  email: "guest@example.test",
  topic: "",
  locale: "en",
  timezone: "America/Denver",
  status: "confirmed",
  created: 0,
  updated: 0,
  managementHash: "fixture-hash",
  revision: 2,
};
const settings = defaultSettings();

describe("Admin booking notification", () => {
  it.each(["en", "es"] as const)(
    "uses the admin recipient, owner timezone and authenticated dashboard in %s",
    (locale) => {
      const email = adminBookingEmail(
        {
          ...booking,
          locale,
          timezone: "Asia/Tokyo",
          name: "<Guest & name>",
          topic: '<script>alert("x")</script>\nSecond line',
          managementToken: "private-guest-token",
        },
        { ...settings, timezone: "America/Denver" },
        "https://scheduler.example",
        "admin@example.test",
      );
      expect(email.to).toBe("admin@example.test");
      expect(email.reply_to).toBe(booking.email);
      expect(email.text).toContain("America/Denver");
      expect(email.text).toMatch(/10:00/);
      expect(email.text).not.toContain("Asia/Tokyo");
      expect(email.text).toContain(booking.email);
      expect(email.text).toContain('<script>alert("x")</script>\nSecond line');
      expect(email.html).toContain("&lt;Guest &amp; name&gt;");
      expect(email.html).toContain(
        "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;<br>Second line",
      );
      expect(email.html).not.toContain("<script>");
      expect(email.html).toContain(
        `href="https://scheduler.example${locale === "es" ? "/es" : ""}/admin/"`,
      );
      expect(email.subject).toContain(
        locale === "es" ? "Nueva reserva confirmada" : "New booking confirmed",
      );
      expect(JSON.stringify(email)).not.toMatch(
        /private-guest-token|\/manage\/|token=/,
      );
    },
  );

  it.each(["meet", "zoom", "in-person"] as const)(
    "includes the %s meeting destination and omits an empty guest note",
    (mode) => {
      const joinUrl =
        mode === "in-person" ? undefined : `https://${mode}.example/fixture`;
      const email = adminBookingEmail(
        { ...booking, mode, location: "Fixture studio", joinUrl },
        settings,
        "https://scheduler.example",
        "admin@example.test",
      );
      expect(email.text).toContain(joinUrl || "Fixture studio");
      expect(email.html).toContain(joinUrl || "Fixture studio");
      expect(email.text).not.toContain("Guest note");
      expect(email.html).not.toContain("Guest note");
    },
  );
});
const note =
  'Sorry about the change <script>alert("x")</script>.\nThank you & see you soon!';
const render = (
  kind: Parameters<typeof bookingEmail>[4],
  message?: string,
  locale: Booking["locale"] = "en",
) =>
  bookingEmail(
    { ...booking, locale, changeMessage: message },
    settings,
    "https://scheduler.example",
    "fixture-token",
    kind,
  );

describe("Owner change messages in booking emails", () => {
  it.each(["en", "es"] as const)(
    "includes the original note with escaped markup and preserved lines in %s",
    (locale) => {
      for (const kind of ["cancelled", "rescheduled"] as const) {
        const email = render(kind, note, locale);
        expect(email.text).toContain(note);
        expect(email.text).toContain(
          `${locale === "es" ? "Mensaje de" : "Message from"} ${settings.name}:`,
        );
        expect(email.html).toContain(
          "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;.<br>Thank you &amp; see you soon!",
        );
        expect(email.html).not.toContain("<script>");
        expect(email.subject).toBe(render(kind, undefined, locale).subject);
      }
    },
  );
  it.each(["confirmed", "reminder"] as const)(
    "does not repeat a change message in %s mail",
    (kind) => {
      expect(render(kind, note)).toEqual(render(kind));
    },
  );
  it.each(["cancelled", "rescheduled"] as const)(
    "keeps %s mail unchanged when the note is blank",
    (kind) => {
      expect(render(kind, "  \n  ")).toEqual(render(kind));
    },
  );
});

it.each(["en", "es"] as const)(
  "keeps entry instructions separate and safely rendered in %s booking emails",
  (locale) => {
    const instructions = "Use the side door <do not knock>.\nAsk for A & B.";
    for (const kind of ["confirmed", "rescheduled", "reminder"] as const) {
      const email = bookingEmail(
        {
          ...booking,
          locale,
          topic: "Guest wants to discuss their project",
          locationInstructions: instructions,
        },
        settings,
        "https://scheduler.example",
        "token",
        kind,
      );
      expect(email.text).toContain(instructions);
      expect(email.text).toContain(
        locale === "es" ? "Instrucciones de llegada:" : "Arrival instructions:",
      );
      expect(email.html).toContain(
        "&lt;do not knock&gt;.<br>Ask for A &amp; B.",
      );
      expect(email.html).not.toContain("<do not knock>");
    }
  },
);
