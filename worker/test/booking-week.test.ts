import { describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { availableDatesPage } from "../../web/booking-week";
import { availableSlots, MAX_AVAILABILITY_RANGE_MS } from "../src/availability";
import { defaultSettings } from "../src/model";

const now = Date.parse("2026-09-09T18:00:00Z");
const options = {
  now,
  timezone: "America/Denver",
  horizonDays: 30,
  noticeHours: 24,
};
const dates = (slots: string[], zone = options.timezone) => [
  ...new Set(
    slots.map((slot) =>
      Temporal.Instant.from(slot)
        .toZonedDateTimeISO(zone)
        .toPlainDate()
        .toString(),
    ),
  ),
];
const fixture = (slots: string[]) =>
  vi.fn(async (from: number, to: number) =>
    slots.filter((slot) => Date.parse(slot) >= from && Date.parse(slot) < to),
  );
function schedule() {
  const settings = defaultSettings();
  settings.timezone = options.timezone;
  settings.noticeHours = options.noticeHours;
  const load = vi.fn(async (from: number, to: number) =>
    availableSlots(settings, "conversation", "", from, to, [], now),
  );
  return { settings, load };
}

describe("Pages of seven dates with availability", () => {
  it("skips weekends, keeps all slots on each date and pages without duplicate dates", async () => {
    const { load } = schedule();
    const first = await availableDatesPage(options, load);
    expect(dates(first.slots)).toEqual([
      "2026-09-10",
      "2026-09-11",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
    ]);
    expect(first.slots[0]).toBe("2026-09-10T18:00:00.000Z");
    expect(first.slots.at(-1)).toBe("2026-09-18T22:30:00.000Z");
    expect(first.nextDate).toBe("2026-09-21");
    const second = await availableDatesPage(
      { ...options, startDate: first.nextDate },
      load,
    );
    expect(dates(second.slots)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
      "2026-09-25",
      "2026-09-28",
      "2026-09-29",
    ]);
    expect(second.nextDate).toBe("2026-09-30");
    expect(new Set([...first.slots, ...second.slots]).size).toBe(
      first.slots.length + second.slots.length,
    );
    expect(
      load.mock.calls.every(
        ([from, to]) => to > from && to - from <= MAX_AVAILABILITY_RANGE_MS,
      ),
    ).toBe(true);
  });

  it("searches past fully unavailable ranges after minimum notice", async () => {
    const { settings, load } = schedule();
    settings.blackouts = [
      {
        id: "trip",
        start: "2026-09-10T00:00:00Z",
        end: "2026-09-21T00:00:00Z",
        label: "Away",
      },
    ];
    const page = await availableDatesPage(options, load);
    expect(dates(page.slots)).toHaveLength(7);
    expect(dates(page.slots)[0]).toBe("2026-09-21");
    expect(dates(page.slots).at(-1)).toBe("2026-09-29");
    expect(load.mock.calls.length).toBeGreaterThan(2);
  });

  it("reaches a sparse final page, trims to the horizon and disables Next", async () => {
    const slots = [
      "2026-09-12T18:00:00Z",
      "2026-10-09T17:00:00Z",
      "2026-10-09T19:00:00Z",
    ];
    const load = fixture(slots);
    const page = await availableDatesPage(options, load);
    expect(page).toEqual({ slots: slots.slice(0, 2), nextDate: undefined });
    expect(load.mock.calls.at(-1)![1]).toBe(now + 30 * 86400000);
    for (let i = 1; i < load.mock.calls.length; i++)
      expect(load.mock.calls[i][0]).toBe(load.mock.calls[i - 1][1]);
  });

  it("does not enable Next just because seven dates were found", async () => {
    const slots = Array.from(
      { length: 7 },
      (_, i) => `2026-09-${String(10 + i).padStart(2, "0")}T18:00:00Z`,
    );
    const load = fixture(slots);
    expect(await availableDatesPage(options, load)).toEqual({
      slots,
      nextDate: undefined,
    });
    expect(load.mock.calls.at(-1)![1]).toBe(now + 30 * 86400000);
  });

  it("groups by the visitor's time zone and keeps a whole date on one page", async () => {
    const slots = [
      "2026-09-10T18:00:00Z",
      "2026-09-11T05:30:00Z",
      "2026-09-11T06:30:00Z",
    ];
    const denver = await availableDatesPage(options, fixture(slots));
    const tokyo = await availableDatesPage(
      { ...options, timezone: "Asia/Tokyo" },
      fixture(slots),
    );
    expect(dates(denver.slots)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(dates(tokyo.slots, "Asia/Tokyo")).toEqual(["2026-09-11"]);
  });

  it.each([
    ["2026-03-04T18:00:00Z", "2026-03-05T07:00:00Z", "2026-03-12T06:00:00Z"],
    ["2026-10-28T18:00:00Z", "2026-10-29T06:00:00Z", "2026-11-05T07:00:00Z"],
  ])(
    "scans complete local dates across DST near %s",
    async (visit, from, to) => {
      const load = fixture([]);
      await availableDatesPage({ ...options, now: Date.parse(visit) }, load);
      expect(load.mock.calls[0]).toEqual([Date.parse(from), Date.parse(to)]);
      expect(load.mock.calls[1][0]).toBe(Date.parse(to));
      expect(
        load.mock.calls.every(([a, b]) => b - a <= MAX_AVAILABILITY_RANGE_MS),
      ).toBe(true);
    },
  );

  it("honors zero and long notice, including elapsed hours across DST", async () => {
    const load = fixture([]);
    await availableDatesPage({ ...options, noticeHours: 0 }, load);
    expect(load.mock.calls[0][0]).toBe(Date.parse("2026-09-09T06:00:00Z"));
    load.mockClear();
    await availableDatesPage({ ...options, noticeHours: 240 }, load);
    expect(load.mock.calls[0][0]).toBe(Date.parse("2026-09-19T06:00:00Z"));
    load.mockClear();
    await availableDatesPage(
      { ...options, now: Date.parse("2026-03-08T06:30:00Z") },
      load,
    );
    expect(load.mock.calls[0][0]).toBe(Date.parse("2026-03-09T06:00:00Z"));
  });

  it.each([24, 48])(
    "makes no requests when %i hours of notice reaches the horizon",
    async (noticeHours) => {
      const load = fixture([]);
      expect(
        await availableDatesPage(
          { ...options, horizonDays: 1, noticeHours },
          load,
        ),
      ).toEqual({ slots: [], nextDate: undefined });
      expect(load).not.toHaveBeenCalled();
    },
  );

  it("bounds an entirely empty 180-day search and returns no next page", async () => {
    const load = fixture([]);
    expect(
      await availableDatesPage({ ...options, horizonDays: 180 }, load),
    ).toEqual({ slots: [], nextDate: undefined });
    expect(load.mock.calls.length).toBeLessThanOrEqual(27);
    expect(load.mock.calls.at(-1)![1]).toBe(now + 180 * 86400000);
  });

  it("fails the whole page if a later range fails, including the lookahead", async () => {
    const load = fixture(
      Array.from({ length: 7 }, (_, i) => `2026-09-${10 + i}T18:00:00Z`),
    );
    load.mockImplementationOnce(async () =>
      Array.from({ length: 7 }, (_, i) => `2026-09-${10 + i}T18:00:00Z`),
    );
    load.mockImplementationOnce(async () => {
      throw new Error("google_unavailable");
    });
    await expect(availableDatesPage(options, load)).rejects.toThrow(
      "google_unavailable",
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a later starting date when refreshing a location, without searching earlier dates", async () => {
    const load = fixture(["2026-09-12T18:00:00Z", "2026-09-25T18:00:00Z"]);
    const page = await availableDatesPage(
      { ...options, startDate: "2026-09-21" },
      load,
    );
    expect(page.slots).toEqual(["2026-09-25T18:00:00Z"]);
    expect(load.mock.calls[0][0]).toBe(Date.parse("2026-09-21T06:00:00Z"));
  });
});
