import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { isUsFederalHoliday } from "../src/holidays";
import { canBook } from "../src/availability";
import { defaultSettings, settingsSchema } from "../src/model";

const holiday = (day: string) =>
  isUsFederalHoliday(Temporal.PlainDate.from(day));
describe("U.S. federal holiday blackouts", () => {
  it("matches the OPM 2026 calendar plus actual weekend holiday dates", () => {
    const days: string[] = [];
    for (
      let date = Temporal.PlainDate.from("2026-01-01");
      date.year === 2026;
      date = date.add({ days: 1 })
    )
      if (isUsFederalHoliday(date)) days.push(date.toString());
    expect(days).toEqual([
      "2026-01-01",
      "2026-01-19",
      "2026-02-16",
      "2026-05-25",
      "2026-06-19",
      "2026-07-03",
      "2026-07-04",
      "2026-09-07",
      "2026-10-12",
      "2026-11-11",
      "2026-11-26",
      "2026-12-25",
    ]);
  });

  it("handles Friday/Monday observance and New Year's crossing a year boundary", () => {
    for (const date of [
      "2027-06-18",
      "2027-06-19",
      "2027-07-04",
      "2027-07-05",
      "2027-12-31",
      "2028-01-01",
    ])
      expect(holiday(date), date).toBe(true);
    for (const date of ["2027-06-21", "2027-07-02", "2028-01-03"])
      expect(holiday(date), date).toBe(false);
  });

  it("excludes ordinary adjacent days, regional Inauguration Day and one-off closures", () => {
    for (const date of [
      "2026-11-25",
      "2026-11-27",
      "2026-12-24",
      "2026-12-26",
      "2029-01-20",
    ])
      expect(holiday(date), date).toBe(false);
  });

  it("blocks full days in the schedule time zone and respects turning the preference off", () => {
    const settings = defaultSettings();
    settings.blockUsFederalHolidays = true;
    settings.hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      start: "00:00",
      end: "24:00",
    }));
    const now = Date.parse("2026-11-20T12:00:00Z");
    const bookable = (instant: string) =>
      canBook(settings, settings.types[0], "", Date.parse(instant), [], now);
    expect(bookable("2026-11-26T06:30:00Z")).toBe(true); // Wed 11:30 PM Mountain
    expect(bookable("2026-11-26T07:00:00Z")).toBe(false);
    expect(bookable("2026-11-27T06:30:00Z")).toBe(false); // Thu 11:30 PM Mountain
    expect(bookable("2026-11-27T07:00:00Z")).toBe(true);
    settings.blockUsFederalHolidays = false;
    expect(bookable("2026-11-26T07:00:00Z")).toBe(true);
    delete settings.blockUsFederalHolidays;
    expect(bookable("2026-11-26T07:00:00Z")).toBe(true);
    expect(settingsSchema.safeParse(settings).success).toBe(true);
    expect(
      settingsSchema.safeParse({ ...settings, blockUsFederalHolidays: "true" })
        .success,
    ).toBe(false);
  });
});
