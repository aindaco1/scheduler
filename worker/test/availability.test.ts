import { describe, it, expect } from "vitest";
import { defaultSettings } from "../src/model";
import { canBook, availableSlots } from "../src/availability";

const iso = (v: string) => Date.parse(v);
describe("availability rules", () => {
  it("enforces exact 24 elapsed hours and the horizon", () => {
    const s = defaultSettings(),
      type = s.types[0],
      now = iso("2026-09-09T16:00:00Z");
    expect(canBook(s, type, "", now + 24 * 3600_000, [], now)).toBe(true);
    expect(
      canBook(s, type, "", now + 24 * 3600_000 - 15 * 60_000, [], now),
    ).toBe(false);
    expect(canBook(s, type, "", now + 31 * 86400_000, [], now)).toBe(false);
  });
  it("uses the larger mixed meeting gap without adding gaps", () => {
    const s = defaultSettings(),
      t = s.types[0],
      start = iso("2026-09-10T16:00:00Z"),
      now = start - 2 * 86400_000;
    const previous = {
      start: start - 90 * 60_000,
      end: start - 30 * 60_000,
      gap: 30,
    };
    expect(canBook(s, t, "", start, [previous], now)).toBe(true);
    expect(canBook(s, t, "", start - 15 * 60_000, [previous], now)).toBe(false);
    expect(
      canBook(
        s,
        t,
        "",
        start,
        [{ start: start + 45 * 60_000, end: start + 75 * 60_000 }],
        now,
      ),
    ).toBe(true);
  });
  it("checks location hours, recurring and temporary blackouts", () => {
    const s = defaultSettings();
    const t = { ...s.types[2], enabled: true, locationIds: ["studio"] };
    s.types[2] = t;
    s.locations = [
      {
        id: "studio",
        name: { en: "Studio", es: "Estudio" },
        address: { en: "Address", es: "Dirección" },
        enabled: true,
        hours: [{ day: 4, start: "10:00", end: "12:00" }],
      },
    ];
    const start = iso("2026-09-10T16:00:00Z"),
      now = start - 2 * 86400_000;
    expect(canBook(s, t, "studio", start, [], now)).toBe(true);
    expect(canBook(s, t, "studio", start - 3600_000, [], now)).toBe(false);
    s.recurringBlackouts = [{ day: 4, start: "10:30", end: "11:00" }];
    expect(canBook(s, t, "studio", start, [], now)).toBe(false);
    s.recurringBlackouts = [];
    s.blackouts = [
      {
        id: "away",
        start: "2026-09-10T15:00:00Z",
        end: "2026-09-10T17:00:00Z",
        label: "Away",
      },
    ];
    expect(canBook(s, t, "studio", start, [], now)).toBe(false);
  });
  it("counts daily scheduler bookings once and excludes only authorized current booking", () => {
    const s = defaultSettings();
    s.dailyLimit = 1;
    const t = s.types[0],
      start = iso("2026-09-10T16:00:00Z"),
      now = start - 2 * 86400_000;
    const busy = [
      {
        start: start + 4 * 3600_000,
        end: start + 5 * 3600_000,
        bookingId: "a",
      },
    ];
    expect(canBook(s, t, "", start, busy, now)).toBe(false);
    expect(canBook(s, t, "", start, busy, now, "a")).toBe(true);
  });
  it("omits nonexistent DST times and preserves the repeated hour", () => {
    const s = defaultSettings();
    s.noticeHours = 0;
    s.horizonDays = 180;
    s.hours = [{ day: 0, start: "00:00", end: "04:00" }];
    const spring = availableSlots(
      s,
      s.types[0].id,
      "",
      iso("2026-03-08T07:00:00Z"),
      iso("2026-03-08T11:00:00Z"),
      [],
      iso("2026-03-07T00:00:00Z"),
    );
    expect(spring).not.toContain("2026-03-08T11:00:00.000Z");
    const fall = availableSlots(
      s,
      s.types[0].id,
      "",
      iso("2026-11-01T06:00:00Z"),
      iso("2026-11-01T11:00:00Z"),
      [],
      iso("2026-10-31T00:00:00Z"),
    );
    expect(fall).toContain("2026-11-01T07:00:00.000Z");
    expect(fall).toContain("2026-11-01T08:00:00.000Z");
  });
  it("rejects unbounded availability scans and invalid location combinations", () => {
    const s = defaultSettings();
    expect(() =>
      availableSlots(s, "conversation", "", 0, 10 * 86400_000, [], 0),
    ).toThrow("invalid_date_range");
    expect(() =>
      availableSlots(s, "conversation", "unknown", 0, 86400_000, [], 0),
    ).toThrow("invalid_location");
  });
});
