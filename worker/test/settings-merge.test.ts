import { describe, expect, it } from "vitest";
import { defaultSettings } from "../src/model";
import { mergeSettings } from "../../web/settings-merge";

describe("concurrent dashboard settings", () => {
  it("retains an unrelated holiday preference when merging an hours edit", () => {
    const baseline = defaultSettings();
    const local = structuredClone(baseline);
    local.hours[0].end = "16:00";
    const remote = { ...baseline, blockUsFederalHolidays: true };
    expect(mergeSettings(baseline, local, remote)).toMatchObject({
      blockUsFederalHolidays: true,
      hours: local.hours,
    });
    expect(mergeSettings(baseline, remote, local)).toMatchObject({
      blockUsFederalHolidays: true,
      hours: local.hours,
    });
  });
  it("preserves new calendar selections while saving unrelated location edits", () => {
    const baseline = defaultSettings();
    const local = structuredClone(baseline);
    const remote = structuredClone(baseline);
    local.locations = [
      {
        id: "studio",
        name: { en: "Studio", es: "Estudio" },
        address: { en: "Example", es: "Ejemplo" },
        hours: local.hours,
        enabled: true,
      },
    ];
    remote.googleCalendars.push("work");
    remote.icloudCalendars.push("https://caldav.icloud.com/family/");
    const merged = mergeSettings(baseline, local, remote)!;
    expect(merged.locations).toEqual(local.locations);
    expect(merged.googleCalendars).toEqual(remote.googleCalendars);
    expect(merged.icloudCalendars).toEqual(remote.icloudCalendars);
    expect(remote.locations).toEqual([]);
  });

  it("preserves a provider-triggered pause during an unrelated hours edit", () => {
    const baseline = { ...defaultSettings(), enabled: true };
    const local = structuredClone(baseline);
    local.hours[0].end = "16:00";
    const remote = { ...structuredClone(baseline), enabled: false };
    expect(mergeSettings(baseline, local, remote)).toMatchObject({
      enabled: false,
      hours: local.hours,
    });
  });

  it("refuses competing edits to the same availability list", () => {
    const baseline = defaultSettings();
    const local = structuredClone(baseline);
    const remote = structuredClone(baseline);
    local.hours[0].end = "16:00";
    remote.hours[0].start = "10:00";
    expect(mergeSettings(baseline, local, remote)).toBeNull();
    expect(mergeSettings(baseline, local, local)?.hours).toEqual(local.hours);
  });
});
