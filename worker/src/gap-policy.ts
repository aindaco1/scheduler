import type { MeetingType, Settings } from "./model";

export const DEFAULT_GAPS = { video: 15, inPerson: 30 };
export function defaultMeetingGap(
  settings: Pick<Settings, "defaultGaps">,
  mode: MeetingType["mode"],
): number {
  return settings.defaultGaps[mode === "in-person" ? "inPerson" : "video"];
}
export function meetingGap(
  settings: Pick<Settings, "defaultGaps">,
  type: MeetingType,
): number {
  return type.gap ?? defaultMeetingGap(settings, type.mode);
}
// Upgrade the old per-type controls without changing anyone's effective gaps.
// Values matching the former defaults inherit; custom values remain overrides.
export function normalizePreferences(settings: Settings): Settings {
  if (!settings.defaultGaps) {
    settings.defaultGaps = { ...DEFAULT_GAPS };
    for (const type of settings.types)
      if (type.gap === defaultMeetingGap(settings, type.mode)) type.gap = null;
  }
  settings.spanishEnabled ??= true;
  return settings;
}
