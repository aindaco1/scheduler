import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Booking } from "../src/model";
import {
  IcloudSession,
  icloudBusy,
  validateMultistatus,
} from "../src/providers/icloud";
import { calendarLocation } from "../src/booking-location";
import { GoogleCalendar } from "../src/providers/google";
import { refreshZoom, ZoomMeetings } from "../src/providers/zoom";

const from = Date.parse("2026-09-10T00:00:00Z");
const to = Date.parse("2026-09-11T00:00:00Z");
const booking: Booking = {
  id: "11111111-2222-4333-8444-555555555555",
  requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  typeId: "conversation",
  typeName: "A conversation",
  mode: "meet",
  locationId: "",
  location: "",
  start: Date.parse("2026-09-10T16:00:00Z"),
  end: Date.parse("2026-09-10T16:30:00Z"),
  gap: 15,
  name: "Fixture guest",
  email: "guest@example.test",
  topic: "",
  locale: "en",
  timezone: "America/Denver",
  status: "pending",
  created: from,
  updated: from,
  managementHash: "fixture-hash",
  revision: 1,
};
const eventId = "s" + booking.id.replaceAll("-", "");
const eventPath = "/calendar/v3/calendars/primary/events/" + eventId;
const event = {
  id: eventId,
  status: "confirmed",
  start: { dateTime: new Date(booking.start).toISOString() },
  end: { dateTime: new Date(booking.end).toISOString() },
  extendedProperties: {
    private: { schedulerBooking: booking.id, schedulerOwner: "alonso" },
  },
};

import { fetchMock } from "./fetch-fixtures";
beforeEach(() => fetchMock.activate());
afterEach(() => {
  try {
    fetchMock.assertConsumed();
  } finally {
    fetchMock.deactivate();
  }
});

const multistatus = (contents = "") =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${contents}</d:multistatus>`;
const response = (href: string, props: string) =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
const appleOrigin = "https://caldav.icloud.com";
const calendarUrl = appleOrigin + "/fixture/calendars/family/";
const credentials = {
  username: "owner@example.test",
  password: "fixture-app-password",
};

/** A complete discovery fixture keeps REPORT regressions on the actual tsdav integration path. */
function mockIcloudReport(body: string | undefined, status = 207) {
  const apple = fetchMock.get(appleOrigin);
  const xml = { headers: { "Content-Type": "application/xml; charset=utf-8" } };
  apple
    .intercept({ path: "/.well-known/caldav", method: "PROPFIND" })
    .reply(207, multistatus(), xml);
  apple
    .intercept({ path: "/.well-known/caldav", method: "GET" })
    .reply(207, multistatus(), xml);
  apple
    .intercept({ path: "/", method: "PROPFIND" })
    .reply(
      207,
      multistatus(
        response(
          "/",
          "<d:current-user-principal><d:href>/fixture/principal/</d:href></d:current-user-principal>",
        ),
      ),
      xml,
    );
  apple
    .intercept({ path: "/fixture/principal/", method: "PROPFIND" })
    .reply(
      207,
      multistatus(
        response(
          "/fixture/principal/",
          "<c:calendar-home-set><d:href>/fixture/calendars/</d:href></c:calendar-home-set>",
        ),
      ),
      xml,
    );
  apple
    .intercept({ path: "/fixture/calendars/", method: "PROPFIND" })
    .reply(
      207,
      multistatus(
        response(
          "/fixture/calendars/family/",
          '<d:displayname>Family</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>',
        ),
      ),
      xml,
    );
  apple
    .intercept({ path: "/fixture/calendars/family/", method: "PROPFIND" })
    .reply(
      207,
      multistatus(
        response("/fixture/calendars/family/", "<d:supported-report-set/>"),
      ),
      xml,
    );
  apple
    .intercept({ path: "/fixture/calendars/family/", method: "REPORT" })
    .reply(status, body, xml);
}

describe("iCloud response completeness", () => {
  it("reuses discovery but performs a fresh REPORT and rediscovers after failure", async () => {
    mockIcloudReport(multistatus());
    const session = new IcloudSession(credentials);
    expect(
      await session.busy([calendarUrl], from, to, "America/Denver"),
    ).toEqual([]);
    // No discovery fixtures remain: this second read must only issue REPORT.
    fetchMock
      .get(appleOrigin)
      .intercept({ path: "/fixture/calendars/family/", method: "REPORT" })
      .reply(503, "provider unavailable");
    await expect(
      session.busy([calendarUrl], from, to, "America/Denver"),
    ).rejects.toMatchObject({ code: "icloud_unavailable" });
    mockIcloudReport(multistatus());
    expect(
      await session.busy([calendarUrl], from, to, "America/Denver"),
    ).toEqual([]);
  });

  it.each([
    { status: 200, body: "" },
    {
      status: 200,
      body: "<html><body>temporary provider failure</body></html>",
    },
    { status: 200, body: multistatus() },
    { status: 204, body: undefined },
  ])(
    "rejects a REPORT without multistatus HTTP status: $status $body",
    async ({ status, body }) => {
      mockIcloudReport(body, status);
      await expect(
        icloudBusy(credentials, [calendarUrl], from, to, "America/Denver"),
      ).rejects.toMatchObject({ code: "icloud_incomplete" });
    },
  );

  it.each([
    "this is not XML",
    "<html><body>temporary provider failure</body></html>",
    '<d:multistatus xmlns:d="DAV:">',
    '<d:multistatus xmlns:d="DAV:"><d:response>',
    '<d:multistatus xmlns:d="urn:wrong"/>',
    '<!DOCTYPE d:multistatus [<!ENTITY data "fixture">]><d:multistatus xmlns:d="DAV:"/>',
  ])("rejects malformed or unsafe multistatus: %s", async (body) => {
    mockIcloudReport(body);
    await expect(
      icloudBusy(credentials, [calendarUrl], from, to, "America/Denver"),
    ).rejects.toMatchObject({ code: "icloud_incomplete" });
  });

  it("accepts an empty valid multistatus as a successful no-conflict result", async () => {
    mockIcloudReport(multistatus());
    await expect(
      icloudBusy(credentials, [calendarUrl], from, to, "America/Denver"),
    ).resolves.toEqual([]);
    expect(() =>
      validateMultistatus('<multistatus xmlns="DAV:"/>'),
    ).not.toThrow();
  });

  it("keeps an event whose CalDAV resource has no .ics extension", async () => {
    const ical = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:family-event",
      "DTSTART:20260910T160000Z",
      "DTEND:20260910T170000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    mockIcloudReport(
      multistatus(
        response(
          "/fixture/calendars/family/extensionless-event",
          `<d:getetag>"fixture"</d:getetag><c:calendar-data><![CDATA[${ical}]]></c:calendar-data>`,
        ),
      ),
    );
    await expect(
      icloudBusy(credentials, [calendarUrl], from, to, "America/Denver"),
    ).resolves.toEqual([
      { start: booking.start, end: Date.parse("2026-09-10T17:00:00Z") },
    ]);
  });

  it("rejects a nested permission error even when HTTP status is 207", async () => {
    mockIcloudReport(
      multistatus(
        "<d:response><d:href>/fixture/calendars/family/event</d:href><d:status>HTTP/1.1 403 Forbidden</d:status></d:response>",
      ),
    );
    await expect(
      icloudBusy(credentials, [calendarUrl], from, to, "America/Denver"),
    ).rejects.toMatchObject({ code: "icloud_incomplete" });
  });
});

describe("Google conflict completeness and conference recovery", () => {
  it.each([
    { error: { code: 403, message: "fixture permission failure" } },
    {
      items: [
        { id: "missing-end", start: { dateTime: "2026-09-10T16:00:00Z" } },
      ],
    },
    {
      items: [
        {
          id: "reversed",
          start: { dateTime: "2026-09-10T17:00:00Z" },
          end: { dateTime: "2026-09-10T16:00:00Z" },
        },
      ],
    },
    {
      items: [
        {
          id: "invalid-time",
          start: { dateTime: "invalid" },
          end: { dateTime: "2026-09-10T17:00:00Z" },
        },
      ],
    },
  ])("rejects an incomplete Google busy response: %j", async (payload) => {
    fetchMock
      .get("https://www.googleapis.com")
      .intercept({
        path: /^\/calendar\/v3\/calendars\/primary\/events\?/,
        method: "GET",
      })
      .reply(200, payload);
    await expect(
      new GoogleCalendar("fixture-token").busy(
        ["primary"],
        from,
        to,
        "America/Denver",
      ),
    ).rejects.toMatchObject({ code: "google_incomplete" });
  });

  it("does not return a partial busy snapshot when a later page fails", async () => {
    const google = fetchMock.get("https://www.googleapis.com");
    google
      .intercept({
        path: (path) =>
          path.startsWith("/calendar/v3/calendars/primary/events?") &&
          !new URL(path, "https://www.googleapis.com").searchParams.has(
            "pageToken",
          ),
        method: "GET",
      })
      .reply(200, { items: [event], nextPageToken: "fixture-next" });
    google
      .intercept({
        path: (path) =>
          new URL(path, "https://www.googleapis.com").searchParams.get(
            "pageToken",
          ) === "fixture-next",
        method: "GET",
      })
      .reply(403, { error: { code: 403 } });
    await expect(
      new GoogleCalendar("fixture-token").busy(
        ["primary"],
        from,
        to,
        "America/Denver",
      ),
    ).rejects.toMatchObject({ code: "google_unavailable" });
  });

  it("fails the entire conflict check if one selected calendar fails", async () => {
    const google = fetchMock.get("https://www.googleapis.com");
    google
      .intercept({
        path: /^\/calendar\/v3\/calendars\/primary\/events\?/,
        method: "GET",
      })
      .reply(200, { items: [] });
    google
      .intercept({
        path: /^\/calendar\/v3\/calendars\/family\/events\?/,
        method: "GET",
      })
      .reply(403, { error: { code: 403 } });
    await expect(
      new GoogleCalendar("fixture-token").busy(
        ["primary", "family"],
        from,
        to,
        "America/Denver",
      ),
    ).rejects.toMatchObject({ code: "google_unavailable" });
  });

  it("repairs a failed Meet request on the existing event and recovers without reinserting", async () => {
    const google = fetchMock.get("https://www.googleapis.com");
    google.intercept({ path: eventPath, method: "GET" }).reply(200, {
      ...event,
      conferenceData: {
        createRequest: { status: { statusCode: "failure" } },
      },
    });
    google
      .intercept({
        path: eventPath + "?sendUpdates=all&conferenceDataVersion=1",
        method: "PATCH",
      })
      .reply((options) => {
        const payload = JSON.parse(String(options.body));
        expect(payload.conferenceData.createRequest.requestId).toBe(
          booking.id + "-repair-" + booking.revision,
        );
        expect(
          payload.conferenceData.createRequest.conferenceSolutionKey,
        ).toEqual({ type: "hangoutsMeet" });
        expect(payload.start).toBeUndefined();
        return {
          statusCode: 200,
          data: {
            ...event,
            conferenceData: {
              createRequest: { status: { statusCode: "pending" } },
            },
          },
        };
      });
    const provider = new GoogleCalendar("fixture-token");
    await expect(provider.create(booking, "alonso")).rejects.toMatchObject({
      code: "conference_repair_pending",
    });
    google.intercept({ path: eventPath, method: "GET" }).reply(200, {
      ...event,
      hangoutLink: "https://meet.google.com/fixture-code",
    });
    await expect(provider.create(booking, "alonso")).resolves.toEqual({
      eventId,
      joinUrl: "https://meet.google.com/fixture-code",
    });
  });
});

describe("Zoom write outcomes", () => {
  it("preserves the connected account identity when rotating refresh credentials", async () => {
    fetchMock
      .get("https://zoom.us")
      .intercept({ path: "/oauth/token", method: "POST" })
      .reply(200, {
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
      });
    await expect(
      refreshZoom(
        {
          accountId: "fixture-account",
          accessToken: "old-access",
          refreshToken: "old-refresh",
          expires: 0,
        },
        "fixture-client",
        "fixture-secret",
      ),
    ).resolves.toMatchObject({
      accountId: "fixture-account",
      accessToken: "new-access",
      refreshToken: "new-refresh",
    });
  });

  it.each([400, 401, 403, 429])(
    "distinguishes a rejected creation (%i) from an uncertain write",
    async (status) => {
      fetchMock
        .get("https://api.zoom.us")
        .intercept({ path: "/v2/users/me/meetings", method: "POST" })
        .reply(status, { code: 300, message: "fixture rejection" });
      await expect(
        new ZoomMeetings("fixture-token").create({ ...booking, mode: "zoom" }),
      ).rejects.toMatchObject({ code: "zoom_write_rejected" });
    },
  );

  it("keeps a transport failure uncertain so callers do not blindly create twice", async () => {
    fetchMock
      .get("https://api.zoom.us")
      .intercept({ path: "/v2/users/me/meetings", method: "POST" })
      .replyWithError(new Error("fixture response lost"));
    await expect(
      new ZoomMeetings("fixture-token").create({ ...booking, mode: "zoom" }),
    ).rejects.toMatchObject({ code: "zoom_write_uncertain" });
  });
});

it.each(["en", "es"] as const)(
  "keeps the street address, guest note and arrival instructions separate in a %s invitation",
  async (locale) => {
    const location = {
      id: "studio",
      name: { en: "Studio", es: "Estudio" },
      address: {
        en: "709 Haines Ave NW\nAlbuquerque, NM 87102, USA",
        es: "709 Haines Ave NW\nAlbuquerque, NM 87102, EE. UU.",
      },
      instructions: {
        en: "Use side door <A>.\nRing once & wait.",
        es: "Usa puerta lateral <A>.\nToca una vez y espera.",
      },
      enabled: true,
      hours: [],
    };
    const candidate = {
      ...booking,
      mode: "in-person" as const,
      locale,
      location: calendarLocation(location, locale),
      topic: "My project <notes> & questions",
      locationInstructions: location.instructions[locale],
    };
    const google = fetchMock.get("https://www.googleapis.com");
    google.intercept({ path: eventPath, method: "GET" }).reply(404, {});
    google
      .intercept({
        path: "/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
        method: "POST",
      })
      .reply((options) => {
        const body = JSON.parse(String(options.body));
        expect(body.location).toContain(
          "709 Haines Ave NW, Albuquerque, NM 87102",
        );
        expect(body.location).not.toContain("door");
        expect(body.location).not.toContain("puerta");
        expect(body.description).toContain(
          locale === "es" ? "Nota del invitado:" : "Guest note:",
        );
        expect(body.description).toContain(
          "My project &lt;notes&gt; &amp; questions",
        );
        expect(body.description).toContain(
          locale === "es"
            ? "Instrucciones de llegada:"
            : "Arrival instructions:",
        );
        expect(body.description).toContain("&lt;A&gt;");
        expect(body.description).not.toContain("<A>");
        return { statusCode: 200, data: event };
      });
    await expect(
      new GoogleCalendar("fixture-token").create(candidate, "alonso"),
    ).resolves.toEqual({ eventId, joinUrl: undefined });
  },
);

it("uses one postal address for either invitation language and falls back to legacy Spanish-only addresses", () => {
  const location = {
    id: "studio",
    name: { en: "Studio", es: "Estudio" },
    address: { en: "123 Example St\nTown, NM 87102", es: "Legacy translation" },
    enabled: true,
    hours: [],
  };
  expect(calendarLocation(location, "es")).toBe(
    "Estudio, 123 Example St, Town, NM 87102",
  );
  expect(calendarLocation(location, "en")).toBe(
    "Studio, 123 Example St, Town, NM 87102",
  );
  location.address = { en: " ", es: "Calle Mayor 1, Madrid" };
  expect(calendarLocation(location, "en")).toBe(
    "Studio, Calle Mayor 1, Madrid",
  );
});
