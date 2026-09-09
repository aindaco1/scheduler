import ICAL from "ical.js";
import { Temporal } from "@js-temporal/polyfill";
import { AppError, type Busy } from "../model";

function milliseconds(
  time: ICAL.Time,
  fallback: string,
  property?: ICAL.Property,
): number {
  if (time.isDate)
    return Temporal.PlainDate.from(time.toString()).toZonedDateTime({
      timeZone: fallback,
      plainTime: "00:00",
    }).epochMilliseconds;
  if (time.zone.tzid !== "floating") return time.toUnixTime() * 1000;
  const tzid = property?.getParameter("tzid");
  const zone = typeof tzid === "string" ? tzid : fallback;
  try {
    return Temporal.PlainDateTime.from(time.toString()).toZonedDateTime(zone)
      .epochMilliseconds;
  } catch {
    throw new AppError("calendar_timezone_unknown", 503);
  }
}
export function icalBusy(
  text: string,
  from: number,
  to: number,
  zone: string,
): Busy[] {
  if (text.length > 2_000_000) throw new AppError("calendar_incomplete", 503);
  try {
    const root = new ICAL.Component(ICAL.parse(text));
    const events = root.getAllSubcomponents("vevent");
    if (!events.length) throw new AppError("calendar_incomplete", 503);
    const busy: Busy[] = [];
    const add = (event: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
      if (
        event.component.getFirstPropertyValue("status") === "CANCELLED" ||
        event.component.getFirstPropertyValue("transp") === "TRANSPARENT"
      )
        return;
      const s = milliseconds(
        start,
        zone,
        event.component.getFirstProperty("dtstart") || undefined,
      );
      const e = milliseconds(
        end,
        zone,
        event.component.getFirstProperty("dtend") ||
          event.component.getFirstProperty("dtstart") ||
          undefined,
      );
      if (e < s || !Number.isFinite(s) || !Number.isFinite(e))
        throw new AppError("calendar_incomplete", 503);
      if (s < to && e > from) busy.push({ start: s, end: e });
    };
    const masters = new Set(
      events
        .filter(
          (c) =>
            !c.hasProperty("recurrence-id") && new ICAL.Event(c).isRecurring(),
        )
        .map((c) => c.getFirstPropertyValue("uid")),
    );
    for (const component of events) {
      const event = new ICAL.Event(component);
      if (event.isRecurrenceException() && masters.has(event.uid)) continue;
      if (!component.hasProperty("dtstart"))
        throw new AppError("calendar_incomplete", 503);
      if (!event.isRecurring()) {
        add(event, event.startDate, event.endDate);
        continue;
      }
      // Bound old/dense series; incomplete expansion closes availability instead of dropping conflicts.
      const iterator = event.iterator();
      let completed = false;
      for (let n = 0; n < 30_000; n++) {
        const occurrence = iterator.next();
        if (!occurrence) {
          completed = true;
          break;
        }
        const details = event.getOccurrenceDetails(occurrence);
        add(details.item, details.startDate, details.endDate);
        if (
          milliseconds(
            occurrence,
            zone,
            event.component.getFirstProperty("dtstart") || undefined,
          ) >
          to + 366 * 86_400_000
        ) {
          completed = true;
          break;
        }
      }
      if (!completed) throw new AppError("calendar_incomplete", 503);
      // Moved exceptions may lie inside our range even when their original occurrence does not.
      for (const exception of events.filter(
        (c) =>
          c.hasProperty("recurrence-id") &&
          c.getFirstPropertyValue("uid") === event.uid,
      )) {
        const e = new ICAL.Event(exception);
        add(e, e.startDate, e.endDate);
      }
    }
    return busy;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("calendar_incomplete", 503);
  }
}
