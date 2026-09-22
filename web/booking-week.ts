import { Temporal } from "@js-temporal/polyfill";

interface AvailableDatesOptions {
  now: number;
  timezone: string;
  horizonDays: number;
  noticeHours: number;
  startDate?: string;
}

// Search bounded calendar ranges, then page by dates that actually have slots.
// Each scan ends at local midnight so all slots for a date stay on one page.
export async function availableDatesPage(
  options: AvailableDatesOptions,
  load: (from: number, to: number) => Promise<string[]>,
) {
  const date = (instant: number) =>
    Temporal.Instant.fromEpochMilliseconds(instant)
      .toZonedDateTimeISO(options.timezone)
      .toPlainDate();
  const earliest = options.now + options.noticeHours * 3_600_000;
  const horizon = options.now + options.horizonDays * 86_400_000;
  const first = date(earliest);
  const requested = options.startDate
    ? Temporal.PlainDate.from(options.startDate)
    : first;
  let cursor =
    Temporal.PlainDate.compare(requested, first) < 0 ? first : requested;
  const days = new Map<string, string[]>();
  while (earliest < horizon) {
    const from = cursor.toZonedDateTime(options.timezone).epochMilliseconds;
    if (from >= horizon) break;
    const next = cursor.add({ days: 7 });
    const to = Math.min(
      next.toZonedDateTime(options.timezone).epochMilliseconds,
      horizon,
    );
    const slots = await load(from, to);
    for (const slot of slots) {
      const instant = Date.parse(slot);
      // The API enforces scheduling rules; retain this page's search boundaries.
      if (instant < Math.max(from, earliest) || instant >= to) continue;
      const key = date(instant).toString();
      const group = days.get(key) || [];
      group.push(slot);
      days.set(key, group);
    }
    // Look ahead to one more available date before enabling Next.
    if (days.size > 7) break;
    cursor = next;
  }
  const dates = [...days.keys()].sort();
  return {
    slots: dates.slice(0, 7).flatMap((key) => days.get(key)!.sort()),
    nextDate: dates[7],
  };
}
