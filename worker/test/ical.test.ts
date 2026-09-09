import { describe, it, expect } from "vitest";
import { icalBusy } from "../src/providers/ical";
const start = Date.parse("2026-09-01T00:00:00Z"),
  end = Date.parse("2026-10-01T00:00:00Z");
const wrap = (body: string) =>
  `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${body}\r\nEND:VCALENDAR`;
const event = (extra: string) =>
  `BEGIN:VEVENT\r\nUID:a\r\n${extra}\r\nEND:VEVENT`;
describe("iCalendar normalization", () => {
  it("handles all-day end as exclusive in the owner timezone", () => {
    const busy = icalBusy(
      wrap(event("DTSTART;VALUE=DATE:20260910\r\nDTEND;VALUE=DATE:20260912")),
      start,
      end,
      "America/Denver",
    );
    expect(busy).toEqual([
      {
        start: Date.parse("2026-09-10T06:00:00Z"),
        end: Date.parse("2026-09-12T06:00:00Z"),
      },
    ]);
  });
  it("honors EXDATE and moved recurrence exceptions", () => {
    const text = wrap(
      event(
        "DTSTART:20260910T160000Z\r\nDTEND:20260910T170000Z\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE:20260911T160000Z",
      ) +
        "\r\n" +
        event(
          "RECURRENCE-ID:20260912T160000Z\r\nDTSTART:20260912T180000Z\r\nDTEND:20260912T190000Z",
        ),
    );
    const busy = icalBusy(text, start, end, "America/Denver");
    expect(
      busy.some((b) => b.start === Date.parse("2026-09-11T16:00:00Z")),
    ).toBe(false);
    expect(
      busy.some((b) => b.start === Date.parse("2026-09-12T18:00:00Z")),
    ).toBe(true);
    expect(
      busy.some((b) => b.start === Date.parse("2026-09-12T16:00:00Z")),
    ).toBe(false);
  });
  it("retains expanded recurrence instances and omits transparent/cancelled events", () => {
    const text = wrap(
      event("DTSTART:20260910T160000Z\r\nDTEND:20260910T170000Z") +
        "\r\n" +
        event(
          "RECURRENCE-ID:20260911T160000Z\r\nDTSTART:20260911T160000Z\r\nDTEND:20260911T170000Z",
        ),
    );
    expect(icalBusy(text, start, end, "UTC")).toHaveLength(2);
    expect(
      icalBusy(
        wrap(
          event(
            "DTSTART:20260910T160000Z\r\nDTEND:20260910T170000Z\r\nTRANSP:TRANSPARENT",
          ),
        ),
        start,
        end,
        "UTC",
      ),
    ).toHaveLength(0);
  });
  it("fails closed on malformed events and unknown timezones", () => {
    expect(() => icalBusy("bad", start, end, "UTC")).toThrow(
      "calendar_incomplete",
    );
    expect(() =>
      icalBusy(
        wrap(
          event(
            "DTSTART;TZID=Unknown/Zone:20260910T160000\r\nDTEND;TZID=Unknown/Zone:20260910T170000",
          ),
        ),
        start,
        end,
        "UTC",
      ),
    ).toThrow();
  });
});
