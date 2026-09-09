import type { Settings } from "../worker/src/model";

// Merge whole settings fields only. Lists stay atomic so two edits to hours,
// meeting types, or selected calendars never silently overwrite one another.
export function mergeSettings(
  baseline: Settings,
  edited: Settings,
  current: Settings,
): Settings | null {
  const merged = structuredClone(current);
  for (const key of Object.keys(baseline) as (keyof Settings)[]) {
    const before = JSON.stringify(baseline[key]);
    const local = JSON.stringify(edited[key]);
    const remote = JSON.stringify(current[key]);
    if (local === before) continue;
    if (remote !== before && remote !== local) return null;
    Object.assign(merged, { [key]: structuredClone(edited[key]) });
  }
  return merged;
}
