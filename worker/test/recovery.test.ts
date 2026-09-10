import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  env,
  runInDurableObject,
  runDurableObjectAlarm,
} from "cloudflare:test";
import { defaultSettings, reminderSchedule, type Booking } from "../src/model";
import { fetchMock } from "./fetch-fixtures";

type Stub = ReturnType<typeof env.SCHEDULER.getByName>;
interface StoredJob {
  id: string;
  kind: string;
  mailKind?: string;
  revision?: number;
  due: number;
  lease: number;
  attempts: number;
  created?: number;
  firstAttemptAt?: number;
  payload?: string;
  error?: string;
  terminal?: boolean;
}
const day = 86_400_000;
const googleOrigin = "https://www.googleapis.com";
const eventPath = (id: string) =>
  "/calendar/v3/calendars/primary/events/s" + id.replaceAll("-", "");
const fixtureStubs = new Set<Stub>();

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(async () => {
  // Unsent fixture mail must not wake under the next test's global provider mock.
  for (const stub of fixtureStubs)
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.deleteAlarm();
      state.storage.sql.exec("DELETE FROM jobs");
    });
  fixtureStubs.clear();
  vi.restoreAllMocks();
  fetchMock.deactivate();
});

function futureStart() {
  const date = new Date(Date.now() + 3 * day);
  date.setUTCHours(12, 0, 0, 0);
  return date.getTime();
}

async function setup(reminderHours = [24]) {
  const busy = { events: [] as object[] };
  fetchMock
    .get("https://oauth2.googleapis.com")
    .intercept({ path: "/token", method: "POST" })
    .reply(200, { access_token: "fixture-access" })
    .persist();
  fetchMock
    .get(googleOrigin)
    .intercept({ path: (p) => p.includes("/events?"), method: "GET" })
    .reply(() => ({
      statusCode: 200,
      data: { items: busy.events, timeZone: "UTC" },
    }))
    .persist();
  const stub = env.SCHEDULER.getByName(crypto.randomUUID());
  fixtureStubs.add(stub);
  await stub.putConnection("google", {
    refreshToken: "fixture-refresh",
    email: "owner@example.test",
    accountId: "fixture-google-owner",
  });
  await runInDurableObject(stub, (_instance, state) => {
    const settings = defaultSettings();
    settings.reminderHours = reminderHours;
    settings.enabled = true;
    settings.timezone = "UTC";
    settings.requireIcloud = false;
    settings.hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      day,
      start: "00:00",
      end: "24:00",
    }));
    state.storage.sql.exec(
      "UPDATE config SET value=? WHERE key='settings'",
      JSON.stringify({ settings, revision: 7 }),
    );
  });
  const start = futureStart();
  const created = await stub.createBooking({
    requestId: crypto.randomUUID(),
    typeId: "conversation",
    locationId: "",
    start: new Date(start).toISOString(),
    name: "Fixture guest",
    email: "guest@example.test",
    topic: "Fixture discussion",
    locale: "en",
    timezone: "UTC",
    turnstile: "fixture",
  });
  return { stub, busy, created, start };
}

function remoteEvent(id: string, start: number) {
  return {
    id: "s" + id.replaceAll("-", ""),
    status: "confirmed",
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(start + 30 * 60_000).toISOString() },
    extendedProperties: {
      private: { schedulerBooking: id, schedulerOwner: "alonso" },
    },
    hangoutLink: "https://meet.google.com/fixture-room",
  };
}

async function confirmAndQueueMail(reminderHours = [24]) {
  const fixture = await setup(reminderHours);
  fetchMock
    .get(googleOrigin)
    .intercept({ path: eventPath(fixture.created.booking.id), method: "GET" })
    .reply(200, remoteEvent(fixture.created.booking.id, fixture.start))
    .persist();
  await runDurableObjectAlarm(fixture.stub);
  expect(
    (
      await fixture.stub.getBooking(
        fixture.created.booking.id,
        fixture.created.token,
      )
    ).booking.status,
  ).toBe("confirmed");
  return fixture;
}

async function jobs(stub: Stub) {
  return runInDurableObject(stub, (_instance, state) =>
    state.storage.sql
      .exec<{ data: string }>("SELECT data FROM jobs")
      .toArray()
      .map((row) => JSON.parse(row.data) as StoredJob),
  );
}

async function storedBooking(stub: Stub, id: string): Promise<Booking> {
  return runInDurableObject(stub, (_instance, state) =>
    JSON.parse(
      state.storage.sql
        .exec<{ data: string }>("SELECT data FROM bookings WHERE id=?", id)
        .one().data,
    ),
  );
}

async function retainAndRunNow(stub: Stub, kind: string, created?: number) {
  return runInDurableObject(stub, async (_instance, state) => {
    const all = state.storage.sql
      .exec<{ data: string }>("SELECT data FROM jobs")
      .toArray()
      .map((row) => JSON.parse(row.data) as StoredJob);
    const job = all.find((job) => job.mailKind === kind || job.kind === kind);
    if (!job) throw new Error("Expected queued " + kind + " mail");
    state.storage.sql.exec("DELETE FROM jobs WHERE id!=?", job.id);
    job.due = Date.now() - 1;
    job.lease = 0;
    if (created !== undefined) job.created = created;
    state.storage.sql.exec(
      "UPDATE jobs SET due=?,lease=0,data=? WHERE id=?",
      job.due,
      JSON.stringify(job),
      job.id,
    );
    await state.storage.setAlarm(Date.now() + 500);
    return job.id;
  });
}

describe("Coordinator recovery after overlapping actions and partial provider results", () => {
  it("accepts up to three distinct reminders and upgrades the legacy single reminder", async () => {
    expect(reminderSchedule.parse(24)).toEqual([24]);
    expect(reminderSchedule.parse(0)).toEqual([]);
    expect(reminderSchedule.parse([1, 24, 48])).toEqual([48, 24, 1]);
    for (const invalid of [[24, 24], [1, 2, 3, 4], [0], [169], [1.5]])
      expect(reminderSchedule.safeParse(invalid).success).toBe(false);
    const { stub } = await setup();
    await runInDurableObject(stub, (_instance, state) => {
      const stored = JSON.parse(
        state.storage.sql
          .exec<{ value: string }>(
            "SELECT value FROM config WHERE key='settings'",
          )
          .one().value,
      );
      stored.settings.reminderHours = 24;
      state.storage.sql.exec(
        "UPDATE config SET value=? WHERE key='settings'",
        JSON.stringify(stored),
      );
    });
    const config = await stub.getSettings();
    expect(config.settings.reminderHours).toEqual([24]);
    expect(
      (
        await stub.updateSettings(
          { ...config.settings, reminderHours: [48, 24, 1] },
          config.revision,
        )
      ).settings.reminderHours,
    ).toEqual([48, 24, 1]);
  });
  it("queues and delivers three separate reminders once, keeping a stable key on retry", async () => {
    const { stub, start } = await confirmAndQueueMail([48, 24, 1]);
    const reminders = (await jobs(stub)).filter(
      (job) => job.mailKind === "reminder",
    );
    expect(reminders.map((job) => job.due).sort()).toEqual(
      [48, 24, 1].map((hour) => start - hour * 3_600_000).sort(),
    );
    expect(new Set(reminders.map((job) => job.id)).size).toBe(3);
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        "DELETE FROM jobs WHERE json_extract(data,'$.mailKind')!='reminder'",
      );
      for (const job of reminders) {
        job.due = Date.now() - 1;
        state.storage.sql.exec(
          "UPDATE jobs SET due=?,data=? WHERE id=?",
          job.due,
          JSON.stringify(job),
          job.id,
        );
      }
      await state.storage.setAlarm(Date.now() + 500);
    });
    const attempts: { key: string; body: string }[] = [];
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(({ body, headers }) => {
        attempts.push({ key: String(headers["idempotency-key"]), body });
        return {
          statusCode: attempts.length === 1 ? 500 : 200,
          data: { id: "fixture" },
        };
      })
      .persist();
    await runDurableObjectAlarm(stub);
    expect(attempts).toHaveLength(3);
    expect(new Set(attempts.map((attempt) => attempt.key)).size).toBe(3);
    await retainAndRunNow(stub, "reminder");
    await runDurableObjectAlarm(stub);
    expect(attempts).toHaveLength(4);
    expect(attempts[3]).toEqual(attempts[0]);
    expect(await jobs(stub)).toEqual([]);
  });
  it("skips elapsed reminders and allows all reminders to be disabled", async () => {
    const { stub, start } = await confirmAndQueueMail([168, 24, 1]);
    expect(
      (await jobs(stub))
        .filter((job) => job.mailKind === "reminder")
        .map((job) => job.due)
        .sort(),
    ).toEqual([start - 24 * 3_600_000, start - 3_600_000].sort());
    const disabled = await confirmAndQueueMail([]);
    expect(
      (await jobs(disabled.stub)).filter((job) => job.mailKind === "reminder"),
    ).toEqual([]);
  });
  it("rebuilds all three reminders after rescheduling and drops them after cancellation", async () => {
    const { stub, created, start } = await confirmAndQueueMail([48, 24, 1]);
    const target = start + day;
    fetchMock
      .get(googleOrigin)
      .intercept({
        path:
          eventPath(created.booking.id) +
          "?sendUpdates=all&conferenceDataVersion=1",
        method: "PATCH",
      })
      .reply(200, remoteEvent(created.booking.id, target));
    await stub.reschedule(
      created.booking.id,
      created.token,
      new Date(target).toISOString(),
      crypto.randomUUID(),
    );
    await runDurableObjectAlarm(stub);
    const moved = (await jobs(stub)).filter(
      (job) => job.mailKind === "reminder" && job.revision === 2,
    );
    expect(moved.map((job) => job.due).sort()).toEqual(
      [48, 24, 1].map((hours) => target - hours * 3_600_000).sort(),
    );
    fetchMock
      .get(googleOrigin)
      .intercept({
        path: eventPath(created.booking.id) + "?sendUpdates=all",
        method: "DELETE",
      })
      .reply(204);
    await stub.cancel(created.booking.id, created.token);
    await runDurableObjectAlarm(stub);
    expect(
      (await stub.getBooking(created.booking.id, created.token)).booking.status,
    ).toBe("cancelled");
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        "DELETE FROM jobs WHERE json_extract(data,'$.mailKind')!='reminder'",
      );
      const pending = state.storage.sql
        .exec<{ data: string }>("SELECT data FROM jobs")
        .toArray()
        .map(({ data }) => JSON.parse(data) as StoredJob);
      expect(pending).toHaveLength(6);
      for (const job of pending) {
        job.due = Date.now() - 1;
        state.storage.sql.exec(
          "UPDATE jobs SET due=?,data=? WHERE id=?",
          job.due,
          JSON.stringify(job),
          job.id,
        );
      }
      await state.storage.setAlarm(Date.now() + 500);
    });
    await runDurableObjectAlarm(stub);
    await runDurableObjectAlarm(stub);
    expect(await jobs(stub)).toEqual([]);
  });
  it.each(["cancelled", "rescheduled"] as const)(
    "keeps an owner message with its %s operation through provider and email retries",
    async (kind) => {
      const { stub, created, start } = await confirmAndQueueMail();
      await runInDurableObject(stub, (_instance, state) =>
        state.storage.sql.exec("DELETE FROM jobs"),
      );
      const message =
        "A scheduling change <not HTML>.\nThank you for understanding!";
      const requestId = crypto.randomUUID();
      const target = new Date(start + 3 * 3_600_000).toISOString();
      const change = (note: string) =>
        kind === "cancelled"
          ? stub.cancel(created.booking.id, "", true, note)
          : stub.reschedule(
              created.booking.id,
              "",
              target,
              requestId,
              true,
              note,
            );
      await change(message);
      await change(message);
      await expect(
        Promise.resolve(change("A different note")),
      ).rejects.toMatchObject({ code: "request_changed" });
      const path =
        eventPath(created.booking.id) +
        (kind === "cancelled"
          ? "?sendUpdates=all"
          : "?sendUpdates=all&conferenceDataVersion=1");
      const method = kind === "cancelled" ? "DELETE" : "PATCH";
      fetchMock
        .get(googleOrigin)
        .intercept({ path, method })
        .reply(503, { error: "Fixture outage" });
      await runDurableObjectAlarm(stub);
      expect((await jobs(stub)).filter((job) => job.kind === "email")).toEqual(
        [],
      );
      expect(
        (await storedBooking(stub, created.booking.id)).cancelledAt,
      ).toBeUndefined();
      await retainAndRunNow(stub, "booking");
      fetchMock.get(googleOrigin).intercept({ path, method }).reply(200, {});
      const beforeCompletion = Date.now();
      await runDurableObjectAlarm(stub);
      const result = (await stub.getBooking(created.booking.id, created.token))
        .booking;
      expect(result.status).toBe(
        kind === "cancelled" ? "cancelled" : "confirmed",
      );
      expect(result).not.toHaveProperty("changeMessage");
      const cancelledAt = (await storedBooking(stub, created.booking.id))
        .cancelledAt;
      if (kind === "cancelled") {
        expect(cancelledAt).toBeGreaterThanOrEqual(beforeCompletion);
        expect(cancelledAt).toBeLessThanOrEqual(Date.now());
      } else expect(cancelledAt).toBeUndefined();
      const bodies: string[] = [];
      for (const statusCode of [503, 200]) {
        await retainAndRunNow(stub, kind);
        fetchMock
          .get("https://api.resend.com")
          .intercept({ path: "/emails", method: "POST" })
          .reply(({ body }) => {
            bodies.push(body);
            return { statusCode, data: { id: "fixture-message" } };
          });
        await runDurableObjectAlarm(stub);
        expect(
          (await storedBooking(stub, created.booking.id)).cancelledAt,
        ).toBe(cancelledAt);
      }
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toBe(bodies[0]);
      const email = JSON.parse(bodies[0]);
      expect(email.to).toEqual(["guest@example.test"]);
      expect(email.text).toContain(message);
      expect(email.html).toContain("&lt;not HTML&gt;.<br>Thank you");
      expect(email.html).not.toContain("<not HTML>");
      expect(email.reply_to).toBe(env.ADMIN_EMAIL);
      expect(email.headers).toEqual({ "Auto-Submitted": "auto-generated" });
      expect(await jobs(stub)).toEqual([]);
      if (kind === "rescheduled") {
        await stub.cancel(created.booking.id, created.token);
        await runInDurableObject(stub, (_instance, state) => {
          const row = state.storage.sql
            .exec<{ data: string }>(
              "SELECT data FROM bookings WHERE id=?",
              created.booking.id,
            )
            .one();
          expect(JSON.parse(row.data).changeMessage).toBeUndefined();
        });
      }
    },
  );

  it("rejects guest-authored owner messages and oversized notes without changing the booking", async () => {
    const { stub, created, start } = await confirmAndQueueMail();
    for (const message of ["Guest-authored note", "x".repeat(2001)]) {
      const admin = message.length > 2000;
      await expect(
        Promise.resolve(
          stub.cancel(created.booking.id, created.token, admin, message),
        ),
      ).rejects.toThrow();
      await expect(
        Promise.resolve(
          stub.reschedule(
            created.booking.id,
            created.token,
            new Date(start + 3_600_000).toISOString(),
            crypto.randomUUID(),
            admin,
            message,
          ),
        ),
      ).rejects.toThrow();
      expect(
        (await stub.getBooking(created.booking.id, created.token)).booking
          .status,
      ).toBe("confirmed");
    }
  });

  it("preserves cancellation submitted while the pending job awaits its external conflict read", async () => {
    const { stub, created, start, busy } = await setup();
    busy.events = [
      {
        id: "new-external-conflict",
        start: { dateTime: new Date(start).toISOString() },
        end: { dateTime: new Date(start + 60 * 60_000).toISOString() },
      },
    ];
    fetchMock
      .get(googleOrigin)
      .intercept({ path: eventPath(created.booking.id), method: "GET" })
      .reply(404, {});

    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>();
    const fixtureFetch = globalThis.fetch;
    let suspended = false;
    vi.stubGlobal(
      "fetch",
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        if (
          !suspended &&
          request.method === "GET" &&
          request.url.startsWith(googleOrigin) &&
          new URL(request.url).pathname.endsWith("/events")
        ) {
          suspended = true;
          entered.resolve();
          await release.promise;
        }
        return fixtureFetch(input, init);
      },
    );
    // Both operations run in this owner's context. Resolving a cross-context gate
    // from the mocked network otherwise switches test continuations into the DO.
    await runInDurableObject(stub, async (instance, state) => {
      await state.storage.deleteAlarm();
      const alarm = instance.alarm();
      await entered.promise;
      try {
        const cancelled = await instance.cancel(
          created.booking.id,
          created.token,
        );
        expect(cancelled.booking.status).toBe("cancelling");
      } finally {
        release.resolve();
      }
      await alarm;
    });
    expect(
      (await stub.getBooking(created.booking.id, created.token)).booking.status,
    ).toBe("cancelling");

    fetchMock
      .get(googleOrigin)
      .intercept({
        path: eventPath(created.booking.id) + "?sendUpdates=all",
        method: "DELETE",
      })
      .reply(404, {});
    await runDurableObjectAlarm(stub);
    expect(
      (await stub.getBooking(created.booking.id, created.token)).booking.status,
    ).toBe("cancelled");
    expect((await jobs(stub)).filter((job) => job.kind === "booking")).toEqual(
      [],
    );
  });

  it("keeps the original meeting when the reserved reschedule target becomes externally busy before the alarm", async () => {
    const { stub, created, start, busy } = await setup();
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>(
          "SELECT data FROM bookings WHERE id=?",
          created.booking.id,
        )
        .one();
      const booking: Booking = JSON.parse(row.data);
      booking.status = "confirmed";
      state.storage.sql.exec(
        "UPDATE bookings SET data=?,status=? WHERE id=?",
        JSON.stringify(booking),
        "confirmed",
        booking.id,
      );
      state.storage.sql.exec("DELETE FROM jobs");
    });
    const target = start + 3 * 3_600_000;
    expect(
      (
        await stub.reschedule(
          created.booking.id,
          created.token,
          new Date(target).toISOString(),
          crypto.randomUUID(),
          true,
          "This change must not be announced if it fails.",
        )
      ).booking.status,
    ).toBe("rescheduling");
    busy.events = [
      {
        id: "late-external-conflict",
        start: { dateTime: new Date(target).toISOString() },
        end: { dateTime: new Date(target + 3_600_000).toISOString() },
      },
    ];
    fetchMock
      .get(googleOrigin)
      .intercept({ path: eventPath(created.booking.id), method: "GET" })
      .reply(200, remoteEvent(created.booking.id, start));
    const calls = vi.spyOn(globalThis, "fetch");
    await runDurableObjectAlarm(stub);
    const result = (await stub.getBooking(created.booking.id, created.token))
      .booking;
    expect(result).toMatchObject({
      status: "confirmed",
      start,
      error: "slot_unavailable",
    });
    await runInDurableObject(stub, (_instance, state) => {
      const row = state.storage.sql
        .exec<{ data: string }>(
          "SELECT data FROM bookings WHERE id=?",
          created.booking.id,
        )
        .one();
      expect(JSON.parse(row.data).changeMessage).toBeUndefined();
    });
    expect(
      (await jobs(stub)).some((job) => job.mailKind === "rescheduled"),
    ).toBe(false);
    expect(calls.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(
      false,
    );
    expect((await jobs(stub)).filter((job) => job.kind === "booking")).toEqual(
      [],
    );
  });

  it("retries the same Resend message body after delivery fails and the owner edits settings", async () => {
    const { stub, created } = await confirmAndQueueMail();
    await retainAndRunNow(stub, "confirmed");
    const bodies: string[] = [];
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(({ body }) => {
        bodies.push(body);
        return {
          statusCode: 500,
          data: { message: "Fixture temporary failure" },
        };
      });
    await runDurableObjectAlarm(stub);
    const failed = (await jobs(stub))[0];
    expect(failed.attempts).toBe(1);
    expect(failed.payload).toBeTruthy();
    expect(failed.firstAttemptAt).toBeGreaterThan(0);
    expect(JSON.parse(bodies[0])).toMatchObject({
      reply_to: env.ADMIN_EMAIL,
      headers: { "Auto-Submitted": "auto-generated" },
    });

    const config = await stub.getSettings();
    await stub.updateSettings(
      { ...config.settings, name: "Changed owner name", cancelHours: 48 },
      config.revision,
    );
    await retainAndRunNow(stub, "confirmed");
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(({ body }) => {
        bodies.push(body);
        return { statusCode: 200, data: { id: "fixture-message" } };
      });
    await runDurableObjectAlarm(stub);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[1]).not.toContain("Changed owner name");
    expect(await jobs(stub)).toEqual([]);
    expect(
      (await stub.getBooking(created.booking.id, created.token)).booking,
    ).toMatchObject({ status: "confirmed", error: undefined });
  });

  it("holds permanent Resend rejections without repeating delivery attempts", async () => {
    const { stub, created } = await confirmAndQueueMail();
    const expectedKey = await retainAndRunNow(stub, "confirmed");
    const sent = vi.fn();
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(({ headers }) => {
        sent(headers["idempotency-key"]);
        return { statusCode: 422, data: { message: "Invalid recipient" } };
      })
      .persist();
    await runDurableObjectAlarm(stub);
    expect((await jobs(stub))[0]).toMatchObject({
      terminal: true,
      error: "email_needs_attention",
      attempts: 1,
    });
    expect(
      (await stub.getBooking(created.booking.id, created.token)).booking.error,
    ).toBe("email_needs_attention");
    await retainAndRunNow(stub, "confirmed");
    await runDurableObjectAlarm(stub);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledWith(expectedKey);
  });

  it("honors Resend Retry-After before another attempt", async () => {
    const { stub } = await confirmAndQueueMail();
    await retainAndRunNow(stub, "confirmed");
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(
        429,
        { message: "Rate limited" },
        { headers: { "Retry-After": "7200" } },
      );
    const before = Date.now();
    await runDurableObjectAlarm(stub);
    expect((await jobs(stub))[0].due).toBeGreaterThanOrEqual(
      before + 7_200_000,
    );
    expect((await jobs(stub))[0].terminal).toBe(false);
  });

  it("retains a deliverable reminder for the original meeting after a reschedule is rejected", async () => {
    const { stub, created, start, busy } = await confirmAndQueueMail();
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "DELETE FROM jobs WHERE id LIKE 'email:%:confirmed'",
      );
    });
    const target = start + 3 * 3_600_000;
    await stub.reschedule(
      created.booking.id,
      created.token,
      new Date(target).toISOString(),
      crypto.randomUUID(),
    );
    busy.events = [
      {
        id: "late-external-conflict",
        start: { dateTime: new Date(target).toISOString() },
        end: { dateTime: new Date(target + 3_600_000).toISOString() },
      },
    ];
    await runDurableObjectAlarm(stub);
    const saved = await runInDurableObject(
      stub,
      (_instance, state) =>
        JSON.parse(
          state.storage.sql
            .exec<{ data: string }>(
              "SELECT data FROM bookings WHERE id=?",
              created.booking.id,
            )
            .one().data,
        ) as Booking,
    );
    expect(saved).toMatchObject({
      status: "confirmed",
      start,
      error: "slot_unavailable",
    });
    const reminder = (await jobs(stub)).find(
      (job) => job.mailKind === "reminder" && job.revision === saved.revision,
    );
    expect(
      reminder,
      "A reminder with the old revision will be silently skipped",
    ).toMatchObject({ due: start - 24 * 3_600_000 });
  });

  it("starts the reminder retry deadline at first delivery attempt, even when enqueued a week earlier", async () => {
    const { stub, created } = await confirmAndQueueMail();
    const weekAgo = Date.now() - 7 * day;
    await retainAndRunNow(stub, "reminder", weekAgo);
    const bodies: string[] = [];
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(({ body }) => {
        bodies.push(body);
        return { statusCode: 500, data: { message: "Fixture retry required" } };
      });
    await runDurableObjectAlarm(stub);
    const failed = (await jobs(stub))[0];
    expect(failed.created).toBe(weekAgo);
    expect(failed.firstAttemptAt).toBeGreaterThan(weekAgo + 6 * day);
    expect(failed.attempts).toBe(1);
    await retainAndRunNow(stub, "reminder");
    fetchMock
      .get("https://api.resend.com")
      .intercept({ path: "/emails", method: "POST" })
      .reply(({ body }) => {
        bodies.push(body);
        return { statusCode: 200, data: { id: "fixture-reminder" } };
      });
    await runDurableObjectAlarm(stub);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(await jobs(stub)).toEqual([]);
    expect(
      (await stub.getBooking(created.booking.id, created.token)).booking,
    ).toMatchObject({ status: "confirmed", error: undefined });
  });
});
