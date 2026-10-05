import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IcloudSession } from "../src/providers/icloud";
import { fetchMock } from "./fetch-fixtures";
import {
  appleOrigin,
  busyReport,
  calendarUrl,
  credentials,
  mockIcloudDiscovery,
  mockIcloudReport,
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
  "recovers a $status REPORT with fresh discovery and retains recovered conflicts",
  async ({ status, body }) => {
    mockIcloudReport(body, status);
    mockIcloudReport(busyReport(from, to));
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

it("recovers a transport failure without exposing its message", async () => {
  mockIcloudDiscovery();
  fetchMock
    .get(appleOrigin)
    .intercept({ path: "/fixture/calendars/family/", method: "REPORT" })
    .replyWithError(new Error("private event owner@example.test"));
  mockIcloudReport(multistatus());
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

it("stops after one retry, discards discovery, and permits a later fresh recovery", async () => {
  mockIcloudReport("unavailable", 503);
  mockIcloudReport("unavailable", 503);
  const session = new IcloudSession(credentials);
  await expect(busy(session)).rejects.toMatchObject({
    code: "icloud_unavailable",
  });
  expect(warning).toHaveBeenCalledTimes(2);
  mockIcloudReport(busyReport(from, to));
  await expect(busy(session)).resolves.toEqual([{ start: from, end: to }]);
});

it.each([401, 403, 429])(
  "does not retry rejected credentials or throttling (%s)",
  async (status) => {
    mockIcloudReport("private", status);
    await expect(busy()).rejects.toMatchObject({
      code:
        status === 429 ? "icloud_rate_limited" : "icloud_reconnect_required",
      retryable: false,
    });
    expect(warning).toHaveBeenCalledTimes(1);
  },
);

it("honors a longer Retry-After without another immediate read", async () => {
  mockIcloudDiscovery();
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
  mockIcloudDiscovery();
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

it("reuses discovery after success but performs each fresh conflict REPORT", async () => {
  mockIcloudReport(multistatus());
  const session = new IcloudSession(credentials);
  await expect(busy(session)).resolves.toEqual([]);
  mockReport(busyReport(from, to));
  await expect(busy(session)).resolves.toEqual([{ start: from, end: to }]);
});

it("discards a partial attempt and rereads every selected calendar", async () => {
  mockIcloudDiscovery(207, ["family", "work"]);
  mockReport(busyReport(from, to));
  mockReport("unavailable", 503, {}, "work");
  mockIcloudDiscovery(207, ["family", "work"]);
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
  mockIcloudDiscovery(207, ["family", "work"]);
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
