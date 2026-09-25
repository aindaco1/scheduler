import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calendarDescription } from "../src/booking-location";
import type { Booking } from "../src/model";
import { GoogleCalendar } from "../src/providers/google";
import { fetchMock } from "./fetch-fixtures";

const booking: Booking = {
  id: "11111111-2222-4333-8444-555555555555",
  requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  typeId: "zoom",
  typeName: "Conversation",
  mode: "zoom",
  locationId: "",
  location: "",
  start: 1_900_000_000_000,
  end: 1_900_001_800_000,
  gap: 15,
  name: "Fixture guest",
  email: "guest@example.test",
  topic: "Questions <one> & two",
  locale: "en",
  timezone: "UTC",
  status: "pending",
  created: 0,
  updated: 0,
  managementHash: "fixture",
  revision: 1,
  zoomId: "00000000000",
  joinUrl: "https://zoom.us/j/00000000000?pwd=fixture&lang=en",
};
const host = { name: "Fixture host", email: "host@example.test" };
const id = "s" + booking.id.replaceAll("-", "");
const path = "/calendar/v3/calendars/primary/events/" + id;
const patchPath = path + "?sendUpdates=all&conferenceDataVersion=1";
const remote = {
  id,
  etag: '"fixture-v1"',
  status: "confirmed",
  extendedProperties: {
    private: { schedulerBooking: booking.id, schedulerOwner: "alonso" },
  },
  description: "Owner's existing <b>notes</b>",
  location: "",
  attendees: [{ email: "extra@example.test", responseStatus: "accepted" }],
};
beforeEach(() => fetchMock.activate());
afterEach(() => {
  try {
    fetchMock.assertConsumed();
  } finally {
    fetchMock.deactivate();
  }
});
const google = () => fetchMock.get("https://www.googleapis.com");

describe("Zoom joining links in Google invitations", () => {
  it.each(["en", "es"] as const)(
    "creates a location and escaped description backup in %s",
    async (locale) => {
      const b = { ...booking, locale };
      google().intercept({ path, method: "GET" }).reply(404, {});
      google()
        .intercept({
          path: "/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
          method: "POST",
        })
        .reply(({ body }) => {
          const payload = JSON.parse(body);
          expect(payload.location).toBe(b.joinUrl);
          expect(payload.description).toContain(
            locale === "es"
              ? "Unirse a la reunión de Zoom:"
              : "Join Zoom meeting:",
          );
          expect(payload.description).toContain("?pwd=fixture&amp;lang=en");
          expect(payload.description).toContain(
            "Questions &lt;one&gt; &amp; two",
          );
          return { statusCode: 200, data: { ...remote, ...payload } };
        });
      await expect(
        new GoogleCalendar("fixture").create(b, "alonso", host),
      ).resolves.toEqual({ eventId: id, joinUrl: b.joinUrl });
    },
  );

  it("refuses a Zoom booking without its saved joining URL before any calendar write", async () => {
    await expect(
      new GoogleCalendar("fixture").create(
        { ...booking, joinUrl: undefined },
        "alonso",
        host,
      ),
    ).rejects.toMatchObject({ code: "zoom_incomplete" });
  });

  it.each(["", "Owner's chosen location"])(
    "repairs recovered invitations while preserving edits and RSVPs: %s",
    async (location) => {
      google()
        .intercept({ path, method: "GET" })
        .reply(200, { ...remote, location });
      google()
        .intercept({ path: patchPath, method: "PATCH" })
        .reply(({ body, headers }) => {
          const patch = JSON.parse(body);
          expect(headers["if-match"]).toBe(remote.etag);
          expect(Object.keys(patch).sort()).toEqual(
            location ? ["description"] : ["description", "location"],
          );
          expect(patch.description).toBe(
            remote.description +
              "\n\nJoin Zoom meeting:\nhttps://zoom.us/j/00000000000?pwd=fixture&amp;lang=en",
          );
          if (!location) expect(patch.location).toBe(booking.joinUrl);
          return { statusCode: 200, data: { ...remote, location, ...patch } };
        });
      await expect(
        new GoogleCalendar("fixture").create(booking, "alonso", host),
      ).resolves.toEqual({ eventId: id, joinUrl: booking.joinUrl });
    },
  );

  it("recovers a lost repair response without another patch, duplicate link or new invitation", async () => {
    google().intercept({ path, method: "GET" }).reply(200, remote);
    google()
      .intercept({ path: patchPath, method: "PATCH" })
      .replyWithError(new Error("Lost response"));
    const provider = new GoogleCalendar("fixture");
    await expect(
      provider.create(booking, "alonso", host),
    ).rejects.toMatchObject({ code: "google_unavailable" });
    google()
      .intercept({ path, method: "GET" })
      .reply(200, {
        ...remote,
        location: booking.joinUrl,
        description: calendarDescription(booking, host.name),
        hangoutLink: "https://meet.google.com/unrelated-auto-conference",
      });
    await expect(provider.create(booking, "alonso", host)).resolves.toEqual({
      eventId: id,
      joinUrl: booking.joinUrl,
    });
  });

  it("leaves a concurrent owner edit intact and retries from a fresh event", async () => {
    google().intercept({ path, method: "GET" }).reply(200, remote);
    google().intercept({ path: patchPath, method: "PATCH" }).reply(412, {});
    const provider = new GoogleCalendar("fixture");
    await expect(
      provider.create(booking, "alonso", host),
    ).rejects.toMatchObject({
      code: "calendar_event_changed",
      retryable: true,
    });
    const changed = {
      ...remote,
      etag: '"fixture-v2"',
      description: "New owner notes",
    };
    google().intercept({ path, method: "GET" }).reply(200, changed);
    google()
      .intercept({ path: patchPath, method: "PATCH" })
      .reply(({ body, headers }) => {
        const patch = JSON.parse(body);
        expect(headers["if-match"]).toBe(changed.etag);
        expect(patch.description).toContain("New owner notes");
        return { statusCode: 200, data: { ...changed, ...patch } };
      });
    await expect(
      provider.create(booking, "alonso", host),
    ).resolves.toMatchObject({ eventId: id });
  });

  it.each(["wrong-owner", "wrong-booking", "cancelled"])(
    "never repairs an unrelated or cancelled event: %s",
    async (mismatch) => {
      google()
        .intercept({ path, method: "GET" })
        .reply(200, {
          ...remote,
          status: mismatch === "cancelled" ? "cancelled" : "confirmed",
          extendedProperties: {
            private: {
              schedulerBooking:
                mismatch === "wrong-booking" ? "other" : booking.id,
              schedulerOwner: mismatch === "wrong-owner" ? "other" : "alonso",
            },
          },
        });
      await expect(
        new GoogleCalendar("fixture").create(booking, "alonso", host),
      ).rejects.toMatchObject({ code: "calendar_event_mismatch" });
    },
  );

  it("does not declare success when a repair response still lacks the link", async () => {
    google().intercept({ path, method: "GET" }).reply(200, remote);
    google().intercept({ path: patchPath, method: "PATCH" }).reply(200, remote);
    await expect(
      new GoogleCalendar("fixture").create(booking, "alonso", host),
    ).rejects.toMatchObject({ code: "conference_pending" });
  });

  it("repairs a lost link when rescheduling even if the time patch already succeeded", async () => {
    const b = {
      ...booking,
      targetStart: booking.start,
      targetEnd: booking.end,
    };
    google()
      .intercept({ path, method: "GET" })
      .reply(200, {
        ...remote,
        start: { dateTime: new Date(b.start).toISOString() },
        end: { dateTime: new Date(b.end).toISOString() },
      });
    google()
      .intercept({ path: patchPath, method: "PATCH" })
      .reply(({ body }) => {
        const patch = JSON.parse(body);
        expect(Object.keys(patch).sort()).toEqual(["description", "location"]);
        return { statusCode: 200, data: { ...remote, ...patch } };
      });
    await new GoogleCalendar("fixture").reschedule(b);
  });
});
