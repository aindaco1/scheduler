import type { Temporal } from "@js-temporal/polyfill";

// The 11 annual nationwide holidays and standard Monday-Friday observance:
// https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
// Actual weekend dates are also blocked. Regional/one-off closures are manual.
const fixedDates = new Set(["1-1", "6-19", "7-4", "11-11", "12-25"]);
function fixedHoliday(date: Temporal.PlainDate): boolean {
  return fixedDates.has(`${date.month}-${date.day}`);
}

export function isUsFederalHoliday(date: Temporal.PlainDate): boolean {
  if (fixedHoliday(date)) return true;
  if (date.dayOfWeek === 5 && fixedHoliday(date.add({ days: 1 }))) return true;
  if (date.dayOfWeek === 1 && fixedHoliday(date.subtract({ days: 1 })))
    return true;
  const { month, day, dayOfWeek } = date;
  if (dayOfWeek === 1) {
    return (
      ((month === 1 || month === 2) && day >= 15 && day <= 21) || // MLK / Washington
      (month === 5 && day >= 25) || // Memorial Day
      (month === 9 && day <= 7) || // Labor Day
      (month === 10 && day >= 8 && day <= 14) // Columbus Day
    );
  }
  return month === 11 && dayOfWeek === 4 && day >= 22 && day <= 28; // Thanksgiving
}
