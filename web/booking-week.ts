import { Temporal } from "@js-temporal/polyfill";

// Labels use Monday boundaries; the following Monday belongs to the next page.
export function bookingWeek(
  now: number,
  timezone: string,
  offset: number,
  horizonDays: number,
) {
  const date = (instant: number) =>
    Temporal.Instant.fromEpochMilliseconds(instant)
      .toZonedDateTimeISO(timezone)
      .toPlainDate();
  const today = date(now);
  const firstMonday = today.subtract({ days: today.dayOfWeek - 1 });
  const horizon = now + horizonDays * 86_400_000;
  const lastOffset = Math.floor(firstMonday.until(date(horizon - 1)).days / 7);
  const weekOffset = Math.max(0, Math.min(offset, lastOffset));
  const monday = firstMonday.add({ weeks: weekOffset });
  const from = monday.toZonedDateTime(timezone).epochMilliseconds;
  const next = monday
    .add({ weeks: 1 })
    .toZonedDateTime(timezone).epochMilliseconds;
  return {
    offset: weekOffset,
    from,
    next,
    to: Math.min(next, horizon),
    hasNext: next < horizon,
  };
}
