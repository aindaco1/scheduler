import { afterEach, describe, expect, it, vi } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import { defaultSettings, settingsSchema, type Booking } from "../src/model";
import { sha256Hex } from "../src/security";

const day = 86_400_000;
const now = Date.parse("2026-09-09T12:00:00Z");
type Stub = ReturnType<typeof env.SCHEDULER.getByName>;
afterEach(() => vi.restoreAllMocks());

async function insert(stub: Stub, entries: Partial<Booking>[]) {
  const managementHash = await sha256Hex("fixture-private-token");
  const bookings: Booking[] = entries.map((entry) => ({
    id: crypto.randomUUID(),
    requestId: crypto.randomUUID(),
    typeId: "conversation",
    typeName: "Conversation",
    mode: "meet",
    locationId: "",
    location: "",
    start: now + 5 * day,
    end: now + 5 * day + 1_800_000,
    gap: 15,
    name: "Guest",
    email: "guest@example.test",
    topic: "",
    locale: "en",
    timezone: "UTC",
    status: "cancelled",
    created: now - 10 * day,
    updated: now,
    managementHash,
    revision: 2,
    ...entry,
  }));
  await runInDurableObject(stub, (_instance, state) => {
    for (const booking of bookings)
      state.storage.sql.exec(
        "INSERT INTO bookings(id,request_id,start,end,status,data) VALUES(?,?,?,?,?,?)",
        booking.id,
        booking.requestId,
        booking.start,
        booking.end,
        booking.status,
        JSON.stringify(booking),
      );
  });
  return bookings;
}

describe("Cancelled booking dashboard visibility", () => {
  it("defaults legacy settings to one day and preserves a saved preference when an older dashboard omits it", async () => {
    const stub = env.SCHEDULER.getByName(crypto.randomUUID());
    const legacy = defaultSettings();
    Reflect.deleteProperty(legacy, "cancelledBookingRetentionDays");
    expect(settingsSchema.parse(legacy).cancelledBookingRetentionDays).toBe(1);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE config SET value=? WHERE key='settings'",
        JSON.stringify({ settings: legacy, revision: 1 }),
      );
    });
    let config = await stub.getSettings();
    expect(config.settings.cancelledBookingRetentionDays).toBe(1);
    for (const days of [3, 0]) {
      config.settings.cancelledBookingRetentionDays = days;
      config = await stub.updateSettings(config.settings, config.revision);
      const oldDashboard = structuredClone(config.settings);
      Reflect.deleteProperty(oldDashboard, "cancelledBookingRetentionDays");
      config = await stub.updateSettings(oldDashboard, config.revision);
      expect(config.settings.cancelledBookingRetentionDays).toBe(days);
    }
    for (const days of [-1, 0.5, 366, "1", null])
      expect(
        settingsSchema.safeParse({
          ...config.settings,
          cancelledBookingRetentionDays: days,
        }).success,
      ).toBe(false);
    expect((await stub.publicConfig()).settings).not.toHaveProperty(
      "cancelledBookingRetentionDays",
    );
  });

  it("uses elapsed time since successful cancellation, supports legacy timestamps, and never deletes hidden bookings", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const stub = env.SCHEDULER.getByName(crypto.randomUUID());
    const entries = await insert(stub, [
      { id: "recent", cancelledAt: now - day + 1 },
      { id: "at-cutoff", cancelledAt: now - day },
      { id: "old-with-email-update", cancelledAt: now - 2 * day, updated: now },
      { id: "legacy-recent", updated: now - 3_600_000 },
      { id: "legacy-old", updated: now - 2 * day },
      { id: "confirmed", status: "confirmed", updated: now - 5 * day },
      { id: "cancelling", status: "cancelling", updated: now - 5 * day },
      {
        id: "old-meeting-just-cancelled",
        start: now - 61 * day,
        end: now - 61 * day + 1_800_000,
        cancelledAt: now,
      },
      {
        id: "old-confirmed",
        status: "confirmed",
        start: now - 61 * day,
        end: now - 61 * day + 1_800_000,
      },
    ]);
    const visible = async () =>
      (await stub.listBookings()).bookings.map((booking) => booking.id).sort();
    expect(await visible()).toEqual(
      [
        "recent",
        "legacy-recent",
        "confirmed",
        "cancelling",
        "old-meeting-just-cancelled",
      ].sort(),
    );
    let config = await stub.getSettings();
    config.settings.cancelledBookingRetentionDays = 3;
    config = await stub.updateSettings(config.settings, config.revision);
    expect(await visible()).toEqual(
      entries
        .filter((entry) => entry.id !== "old-confirmed")
        .map((entry) => entry.id)
        .sort(),
    );
    config.settings.cancelledBookingRetentionDays = 0;
    await stub.updateSettings(config.settings, config.revision);
    expect(await visible()).toEqual(["cancelling", "confirmed"]);
    expect(
      (await stub.getBooking("at-cutoff", "fixture-private-token")).booking
        .status,
    ).toBe("cancelled");
    await expect(
      Promise.resolve(stub.getBooking("at-cutoff", "wrong-token")),
    ).rejects.toMatchObject({ code: "booking_not_found" });
    await runInDurableObject(stub, (_instance, state) => {
      expect(
        state.storage.sql
          .exec<{ total: number }>("SELECT count(*) AS total FROM bookings")
          .one().total,
      ).toBe(entries.length);
    });
  });

  it("filters expired cancellations before the dashboard result limit", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const stub = env.SCHEDULER.getByName(crypto.randomUUID());
    await insert(stub, [
      ...Array.from({ length: 205 }, () => ({
        cancelledAt: now - 2 * day,
        start: now + day,
        end: now + day + 1_800_000,
      })),
      { id: "next-meeting", status: "confirmed" },
    ]);
    expect(
      (await stub.listBookings()).bookings.map((booking) => booking.id),
    ).toEqual(["next-meeting"]);
  });
});
