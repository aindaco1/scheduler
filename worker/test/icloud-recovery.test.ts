import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IcloudSession } from "../src/providers/icloud";
import { fetchMock } from "./fetch-fixtures";
import {
  appleOrigin,
  busyReport,
  calendarUrl,
  credentials,
  mockIcloudDiscovery,
  mockReport,
  multistatus,
} from "./icloud-fixtures";

const from = Date.parse("2026-10-08T12:00:00Z"),
  to = from + 3_600_000;
const busy = (session = new IcloudSession(credentials)) =>
  session.busy([calendarUrl], from, to, "UTC");
const warning = vi.fn(),
  info = vi.fn();
beforeEach(() => {
  warning.mockClear();
  info.mockClear();
  fetchMock.activate();
  vi.spyOn(console, "warn").mockImplementation(warning);
  vi.spyOn(console, "info").mockImplementation(info);
});
afterEach(() => {
  try {
    fetchMock.assertConsumed();
  } finally {
    vi.restoreAllMocks();
    fetchMock.deactivate();
  }
});

it.each([
  { status: 503, body: "private provider failure" },
  { status: 200, body: "" },
  { status: 207, body: '<d:multistatus xmlns:d="DAV:">' },
])(
  "recovers a $status REPORT and retains recovered conflicts",
  async ({ status, body }) => {
    mockReport(body, status);
    mockReport(busyReport(from, to));
    await expect(busy()).resolves.toEqual([{ start: from, end: to }]);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(
      JSON.stringify({ event: "icloud_read_recovered", operation: "busy" }),
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain("private");
  },
);

it("retries discovery for the owner's connection check without reading events", async () => {
  mockIcloudDiscovery(503);
  mockIcloudDiscovery();
  await expect(
    new IcloudSession(credentials).calendars(),
  ).resolves.toMatchObject([{ id: calendarUrl, provider: "icloud" }]);
});

it("checks a saved calendar despite a catalog outage with a one-hour Retry-After", async () => {
  const session = new IcloudSession(credentials);
  mockIcloudDiscovery(503, ["family"], { "Retry-After": "3600" });
  await expect(session.calendars()).rejects.toMatchObject({
    code: "icloud_unavailable",
    retryable: false,
  });
  mockReport(busyReport(from, to));
  await expect(busy(session)).resolves.toEqual([{ start: from, end: to }]);
});

it("authenticates a direct REPORT with the exact confirmation conflict window", async () => {
  const start = Date.parse("2026-10-05T19:30:00Z"),
    end = Date.parse("2026-10-07T20:30:00Z");
  fetchMock
    .get(appleOrigin)
    .intercept({ path: "/fixture/calendars/family/", method: "REPORT" })
    .reply(({ body, headers }) => {
      expect(headers.authorization).toBe(
        "Basic " + btoa(credentials.username + ":" + credentials.password),
      );
      expect(body).toContain('start="20261005T193000Z"');
      expect(body).toContain('end="20261007T203000Z"');
      expect(body).toContain("expand");
      return { statusCode: 207, data: busyReport(start, start + 3_600_000) };
    });
  await expect(
    new IcloudSession(credentials).busy(
      [calendarUrl],
      start,
      end,
      "America/Denver",
    ),
  ).resolves.toEqual([{ start, end: start + 3_600_000 }]);
});

it("rejects a deleted selected calendar without discovery or a free-time fallback", async () => {
  mockReport("not found", 404);
  await expect(busy()).rejects.toMatchObject({
    code: "icloud_unavailable",
    retryable: false,
  });
});

it.each(["", "text/plain", "application/octet-stream"])(
  "retains validated busy events when Apple's Content-Type is %j",
  async (contentType) => {
    mockReport(busyReport(from, to), 207, { "Content-Type": contentType });
    await expect(busy()).resolves.toEqual([{ start: from, end: to }]);
  },
);

it("rejects unsafe saved calendar URLs before sending credentials", async () => {
  await expect(
    new IcloudSession(credentials).busy(
      ["https://example.test/calendar/"],
      from,
      to,
      "UTC",
    ),
  ).rejects.toMatchObject({ code: "invalid_icloud_host" });
});

it("does not forward selected-calendar credentials to an unsafe redirect", async () => {
  mockReport("", 302, { Location: "https://example.test/calendar/" });
  await expect(busy()).rejects.toMatchObject({ code: "invalid_icloud_host" });
});

it("recovers a transport failure without exposing its message", async () => {
  fetchMock
    .get(appleOrigin)
    .intercept({ path: "/fixture/calendars/family/", method: "REPORT" })
    .replyWithError(new Error("private event owner@example.test"));
  mockReport(multistatus());
  await expect(busy()).resolves.toEqual([]);
  expect(warning).toHaveBeenCalledWith(
    JSON.stringify({
      event: "icloud_read_retry",
      operation: "busy",
      code: "icloud_incomplete",
      reason: "library_error",
    }),
  );
});

it("stops after one retry and permits a later fresh recovery", async () => {
  mockReport("unavailable", 503);
  mockReport("unavailable", 503);
  const session = new IcloudSession(credentials);
  await expect(busy(session)).rejects.toMatchObject({
    code: "icloud_unavailable",
  });
  expect(warning).toHaveBeenCalledTimes(2);
  mockReport(busyReport(from, to));
  await expect(busy(session)).resolves.toEqual([{ start: from, end: to }]);
});

it.each([401, 403, 429])(
  "does not retry rejected credentials or throttling (%s)",
  async (status) => {
    mockReport("private", status);
    await expect(busy()).rejects.toMatchObject({
      code:
        status === 429 ? "icloud_rate_limited" : "icloud_reconnect_required",
      retryable: false,
    });
    expect(warning).toHaveBeenCalledTimes(1);
  },
);

it("honors a longer Retry-After without another immediate read", async () => {
  mockReport("unavailable", 503, { "Retry-After": "60" });
  await expect(busy()).rejects.toMatchObject({
    code: "icloud_unavailable",
    retryable: false,
  });
  expect(warning).toHaveBeenCalledTimes(1);
});

it("does not repeat a slow failed operation", async () => {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  fetchMock
    .get(appleOrigin)
    .intercept({ path: "/fixture/calendars/family/", method: "REPORT" })
    .reply(() => {
      now += 10_000;
      return { statusCode: 503, data: "unavailable" };
    });
  await expect(busy()).rejects.toMatchObject({ code: "icloud_unavailable" });
  expect(warning).toHaveBeenCalledTimes(1);
});

it("performs a fresh conflict REPORT on every read without rediscovery", async () => {
  mockReport(multistatus());
  const session = new IcloudSession(credentials);
  await expect(busy(session)).resolves.toEqual([]);
  mockReport(busyReport(from, to));
  await expect(busy(session)).resolves.toEqual([{ start: from, end: to }]);
});

it("discards a partial attempt and rereads every selected calendar", async () => {
  mockReport(busyReport(from, to));
  mockReport("unavailable", 503, {}, "work");
  mockReport(multistatus());
  mockReport(busyReport(from + 60_000, to), 207, {}, "work");
  await expect(
    new IcloudSession(credentials).busy(
      [calendarUrl, appleOrigin + "/fixture/calendars/work/"],
      from,
      to,
      "UTC",
    ),
  ).resolves.toEqual([{ start: from + 60_000, end: to }]);
});

it("does not let one calendar's transient failure hide another's rejected access", async () => {
  mockReport("unavailable", 503);
  mockReport("private", 403, {}, "work");
  await expect(
    new IcloudSession(credentials).busy(
      [calendarUrl, appleOrigin + "/fixture/calendars/work/"],
      from,
      to,
      "UTC",
    ),
  ).rejects.toMatchObject({
    code: "icloud_reconnect_required",
    retryable: false,
  });
  expect(warning).toHaveBeenCalledTimes(1);
});
