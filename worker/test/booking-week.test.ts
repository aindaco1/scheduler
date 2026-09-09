import { describe, expect, it } from "vitest";
import { bookingWeek } from "../../web/booking-week";

const iso = Date.parse;
describe("Monday booking pages", () => {
  it("starts a Wednesday visit on Monday and pages without gaps or overlaps", () => {
    const now = iso("2026-09-09T18:00:00Z");
    const first = bookingWeek(now, "America/Denver", 0, 30);
    const second = bookingWeek(now, "America/Denver", 1, 30);
    expect(first).toMatchObject({
      from: iso("2026-09-07T06:00:00Z"),
      to: iso("2026-09-14T06:00:00Z"),
      hasNext: true,
    });
    expect(second.from).toBe(first.to);
    expect(second.next).toBe(iso("2026-09-21T06:00:00Z"));
  });

  it("uses the selected time zone when Sunday has already become Monday elsewhere", () => {
    const now = iso("2026-09-14T00:30:00Z");
    expect(bookingWeek(now, "America/Denver", 0, 30).from).toBe(
      iso("2026-09-07T06:00:00Z"),
    );
    expect(bookingWeek(now, "Asia/Tokyo", 0, 30).from).toBe(
      iso("2026-09-13T15:00:00Z"),
    );
    expect(
      bookingWeek(iso("2026-09-14T06:00:00Z"), "America/Denver", 0, 30).from,
    ).toBe(iso("2026-09-14T06:00:00Z"));
  });

  it.each([
    [
      "2026-03-04T18:00:00Z",
      "2026-03-02T07:00:00Z",
      "2026-03-09T06:00:00Z",
      167,
    ],
    [
      "2026-10-28T18:00:00Z",
      "2026-10-26T06:00:00Z",
      "2026-11-02T07:00:00Z",
      169,
    ],
  ])(
    "keeps Monday midnight boundaries across a DST week starting near %s",
    (now, from, to, hours) => {
      const week = bookingWeek(iso(String(now)), "America/Denver", 0, 30);
      expect(week.from).toBe(iso(String(from)));
      expect(week.to).toBe(iso(String(to)));
      expect(week.to - week.from).toBe(Number(hours) * 3600000);
      expect(bookingWeek(iso(String(now)), "America/Denver", 1, 30).from).toBe(
        week.to,
      );
    },
  );

  it("keeps the final partial week reachable without extending the booking horizon", () => {
    const now = iso("2026-09-13T18:00:00Z"); // Sunday
    const last = bookingWeek(now, "America/Denver", 5, 30);
    expect(last.from).toBe(iso("2026-10-12T06:00:00Z"));
    expect(last.to).toBe(now + 30 * 86400000);
    expect(last.next).toBe(iso("2026-10-19T06:00:00Z"));
    expect(last.hasNext).toBe(false);
    expect(bookingWeek(now, "America/Denver", 6, 30)).toEqual(last);
  });

  it("does not offer an extra week when the horizon ends exactly at Monday midnight", () => {
    const week = bookingWeek(
      iso("2026-09-07T06:00:00Z"),
      "America/Denver",
      0,
      7,
    );
    expect(week.hasNext).toBe(false);
    expect(
      bookingWeek(iso("2026-09-07T06:00:00Z"), "America/Denver", 1, 7),
    ).toEqual(week);
  });
});
