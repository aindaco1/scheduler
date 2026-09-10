import { meetingGap } from "./gap-policy";
import { Temporal } from "@js-temporal/polyfill";
import {
  AppError,
  type Busy,
  type MeetingType,
  type Settings,
  type Weekly,
} from "./model";
import { isUsFederalHoliday } from "./holidays";

const minute = 60_000;
// Seven local calendar days can exceed 168 hours across an offset change.
export const MAX_AVAILABILITY_RANGE_MS = 8 * 86_400_000;
export function localDate(ms: number, zone: string) {
  return Temporal.Instant.fromEpochMilliseconds(ms)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString();
}

function windows(
  day: Temporal.PlainDate,
  rules: Weekly[],
  zone: string,
): Busy[] {
  return rules
    .filter((w) => w.day === day.dayOfWeek % 7)
    .map((w) => {
      const start = day.toPlainDateTime(w.start).toZonedDateTime(zone, {
        disambiguation: "compatible",
      }).epochMilliseconds;
      const endDay = w.end === "24:00" ? day.add({ days: 1 }) : day;
      const end = endDay
        .toPlainDateTime(w.end === "24:00" ? "00:00" : w.end)
        .toZonedDateTime(zone, { disambiguation: "later" }).epochMilliseconds;
      return { start, end };
    });
}

export function overlaps(a: Busy, b: Busy, gap = 0): boolean {
  return a.start < b.end + gap * minute && a.end + gap * minute > b.start;
}

export function resolveType(
  settings: Settings,
  typeId: string,
  locationId = "",
) {
  const type = settings.types.find((t) => t.id === typeId && t.enabled);
  if (!type) throw new AppError("invalid_meeting_type");
  const location =
    type.mode === "in-person"
      ? settings.locations.find(
          (l) =>
            l.id === locationId && l.enabled && type.locationIds.includes(l.id),
        )
      : undefined;
  if (type.mode === "in-person" && !location)
    throw new AppError("invalid_location");
  if (type.mode !== "in-person" && locationId)
    throw new AppError("invalid_location");
  return { type: { ...type, gap: meetingGap(settings, type) }, location };
}

export function canBook(
  settings: Settings,
  type: MeetingType,
  locationId: string,
  start: number,
  busy: Busy[],
  now: number,
  ignoreId?: string,
): boolean {
  const end = start + type.duration * minute;
  if (
    !Number.isFinite(start) ||
    start < now + settings.noticeHours * 3_600_000 ||
    end > now + settings.horizonDays * 86_400_000
  )
    return false;
  const local = Temporal.Instant.fromEpochMilliseconds(
    start,
  ).toZonedDateTimeISO(settings.timezone);
  if (local.second || local.millisecond || local.minute % 15) return false;
  const day = local.toPlainDate();
  if (settings.blockUsFederalHolidays && isUsFederalHoliday(day)) return false;
  const candidate = { start, end };
  const fits = (rules: Weekly[]) =>
    windows(day, rules, settings.timezone).some(
      (w) => start >= w.start && end <= w.end,
    );
  if (!fits(settings.hours)) return false;
  if (type.mode === "in-person") {
    const location = settings.locations.find(
      (l) =>
        l.id === locationId && l.enabled && type.locationIds.includes(l.id),
    );
    if (!location || !fits(location.hours)) return false;
  }
  const exclusions = [
    ...windows(day, settings.recurringBlackouts, settings.timezone),
    ...settings.blackouts
      .filter((b) => b.scope !== "in-person" || type.mode === "in-person")
      .map((b) => ({
        start: Date.parse(b.start),
        end: Date.parse(b.end),
      })),
  ];
  if (exclusions.some((b) => overlaps(candidate, b))) return false;
  const gap = meetingGap(settings, type);
  const conflicts = busy.filter((b) => !ignoreId || b.bookingId !== ignoreId);
  if (
    conflicts.some((b) => overlaps(candidate, b, Math.max(gap, b.gap ?? gap)))
  )
    return false;
  if (settings.dailyLimit) {
    const ids = new Set(
      conflicts
        .filter(
          (b) =>
            b.bookingId &&
            localDate(b.start, settings.timezone) === day.toString(),
        )
        .map((b) => b.bookingId),
    );
    if (ids.size >= settings.dailyLimit) return false;
  }
  return true;
}

export function availableSlots(
  settings: Settings,
  typeId: string,
  locationId: string,
  from: number,
  to: number,
  busy: Busy[],
  now: number,
  ignoreId?: string,
): string[] {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    to <= from ||
    to - from > MAX_AVAILABILITY_RANGE_MS
  )
    throw new AppError("invalid_date_range");
  const { type } = resolveType(settings, typeId, locationId);
  const slots: string[] = [];
  // Walk actual instants: DST gaps disappear and repeated times retain distinct offsets/instants.
  for (
    let t =
      Math.ceil(
        Math.max(from, now + settings.noticeHours * 3_600_000) / (15 * minute),
      ) *
      15 *
      minute;
    t < to;
    t += 15 * minute
  ) {
    if (canBook(settings, type, locationId, t, busy, now, ignoreId))
      slots.push(new Date(t).toISOString());
  }
  return slots;
}
