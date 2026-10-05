import { fetchMock } from "./fetch-fixtures";

export const multistatus = (contents = "") =>
  `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${contents}</d:multistatus>`;
export const response = (href: string, props: string) =>
  `<d:response><d:href>${href}</d:href><d:propstat><d:prop>${props}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`;
export const appleOrigin = "https://caldav.icloud.com";
export const calendarUrl = appleOrigin + "/fixture/calendars/family/";
export const credentials = {
  username: "owner@example.test",
  password: "fixture-app-password",
};

/** A complete discovery fixture keeps REPORT regressions on the actual tsdav integration path. */
export function mockIcloudDiscovery(status = 207, names = ["family"]) {
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
      status,
      multistatus(
        names
          .map((name) =>
            response(
              `/fixture/calendars/${name}/`,
              '<d:displayname>Family</d:displayname><d:resourcetype><d:collection/><c:calendar/></d:resourcetype><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>',
            ),
          )
          .join(""),
      ),
      xml,
    );
  if (status !== 207) return;
  for (const name of names)
    apple
      .intercept({ path: `/fixture/calendars/${name}/`, method: "PROPFIND" })
      .reply(
        207,
        multistatus(
          response(`/fixture/calendars/${name}/`, "<d:supported-report-set/>"),
        ),
        xml,
      );
}
export function mockReport(
  body: string | undefined,
  status = 207,
  headers: Record<string, string> = {},
  name = "family",
) {
  fetchMock
    .get(appleOrigin)
    .intercept({ path: `/fixture/calendars/${name}/`, method: "REPORT" })
    .reply(status, body, {
      headers: { "Content-Type": "application/xml; charset=utf-8", ...headers },
    });
}
export function mockIcloudReport(body: string | undefined, status = 207) {
  mockIcloudDiscovery();
  mockReport(body, status);
}
export function busyReport(start: number, end: number) {
  const stamp = (ms: number) =>
    new Date(ms).toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  const ical = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:fixture-busy",
    "DTSTART:" + stamp(start),
    "DTEND:" + stamp(end),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return multistatus(
    response(
      "/fixture/calendars/family/event",
      `<d:getetag>"fixture"</d:getetag><c:calendar-data><![CDATA[${ical}]]></c:calendar-data>`,
    ),
  );
}
