import type { Booking, Settings, Locale } from "./model";
import { escapeHtml, localizedText, streetAddress } from "./text";
export const arrivalHeading = (locale: Locale) =>
  locale === "es" ? "Instrucciones de llegada" : "Arrival instructions";
// Calendar LOCATION is a single text value. Keep access notes out of the address.
export function calendarLocation(
  location: Settings["locations"][number],
  locale: Locale,
): string {
  return [localizedText(location.name, locale), streetAddress(location.address)]
    .map((value) =>
      value
        .trim()
        .replace(/\r?\n+/g, ", ")
        .replace(/\s+/g, " "),
    )
    .filter(Boolean)
    .join(", ");
}
// Google accepts HTML descriptions. Escape authored text and retain line breaks.
export function calendarDescription(booking: Booking): string {
  return [
    booking.topic.trim()
      ? `${booking.locale === "es" ? "Nota del invitado" : "Guest note"}:\n${booking.topic}`
      : "",
    booking.locationInstructions?.trim()
      ? `${arrivalHeading(booking.locale)}:\n${booking.locationInstructions.trim()}`
      : "",
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join("\n\n");
}
