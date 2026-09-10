// Isolated operational fixture. Never imported by the Scheduler entry point.
import { Scheduler } from "../../worker/src/scheduler";
import {
  seal,
  unseal,
  sha256Hex,
  timingSafeEqual,
} from "../../worker/src/security";
import type { RuntimeEnv } from "../../worker/src/env";
import type { Booking } from "../../worker/src/model";

type DrillEnv = RuntimeEnv & {
  DRILL_TOKEN: string;
  DRILL: DurableObjectNamespace<RecoveryDrill>;
};
const tables = [
  "config",
  "bookings",
  "jobs",
  "tokens",
  "limits",
  "logos",
] as const;

export class RecoveryDrill extends Scheduler {
  // A restored alarm must never contact a provider in this isolated fixture.
  async alarm() {
    await this.ctx.storage.deleteAlarm();
  }

  async seed() {
    const token = "synthetic-management-token";
    const now = Date.now();
    const b: Booking = {
      id: "11111111-2222-4333-8444-555555555555",
      requestId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      typeId: "conversation",
      typeName: "Recovery fixture",
      mode: "meet",
      locationId: "",
      location: "",
      start: now + 3 * 86_400_000,
      end: now + 3 * 86_400_000 + 1_800_000,
      gap: 15,
      name: "Synthetic guest",
      email: "guest@example.invalid",
      topic: "Recovery drill only",
      locale: "en",
      timezone: "UTC",
      status: "pending",
      revision: 1,
      created: now,
      updated: now,
      managementHash: await sha256Hex(token),
      managementToken: await seal(token, this.env.ENCRYPTION_KEY),
    };
    await this.putConnection("google", {
      refreshToken: "synthetic-refresh",
      email: "owner@example.invalid",
      accountId: "synthetic-owner",
    });
    const payload = await seal(
      {
        to: b.email,
        subject: "Synthetic",
        text: "Never deliver",
        html: "Never deliver",
      },
      this.env.ENCRYPTION_KEY,
    );
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO bookings VALUES(?,?,?,?,?,?)",
        b.id,
        b.requestId,
        b.start,
        b.end,
        b.status,
        JSON.stringify(b),
      );
      const job = {
        id: "fixture-job",
        kind: "email",
        bookingId: b.id,
        revision: 1,
        payload,
        firstAttemptAt: now,
        terminal: true,
        error: "email_needs_attention",
        attempts: 1,
        due: now,
        lease: 0,
      };
      this.ctx.storage.sql.exec(
        "INSERT INTO jobs VALUES(?,?,?,?)",
        job.id,
        now,
        0,
        JSON.stringify(job),
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO tokens VALUES(?,?,?,?)",
        "fixture-hash",
        "session",
        now + 3_600_000,
        "",
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO limits VALUES(?,?,?)",
        "fixture-limit",
        now + 60_000,
        2,
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO logos VALUES(?,?,?,?)",
        "fixture-logo",
        "image/png",
        new Uint8Array([1, 2, 3, 4]),
        now,
      );
    });
    await this.ctx.storage.put("fixture-kv", "before");
    await this.ctx.storage.setAlarm(now + 86_400_000);
    return {
      bookmark: await this.ctx.storage.getCurrentBookmark(),
      snapshot: await this.snapshot(),
    };
  }

  async snapshot() {
    const rows = Object.fromEntries(
      tables.map((table) => [
        table,
        this.ctx.storage.sql
          .exec(`SELECT * FROM ${table} ORDER BY rowid`)
          .toArray(),
      ]),
    );
    const b = rows.bookings[0] && JSON.parse(String(rows.bookings[0].data));
    const connection = rows.config.find((r) => r.key === "connection:google");
    const payload =
      rows.jobs[0] && JSON.parse(String(rows.jobs[0].data)).payload;
    const serial = JSON.stringify(rows, (_key, value) =>
      value instanceof ArrayBuffer ? Array.from(new Uint8Array(value)) : value,
    );
    return {
      digest: await sha256Hex(serial),
      counts: Object.fromEntries(tables.map((t) => [t, rows[t].length])),
      kv: await this.ctx.storage.get("fixture-kv"),
      alarm: await this.ctx.storage.getAlarm(),
      credentialRecovered:
        !!connection &&
        (
          await unseal<{ refreshToken: string }>(
            JSON.parse(String(connection.value)),
            this.env.ENCRYPTION_KEY,
          )
        ).refreshToken === "synthetic-refresh",
      managementRecovered:
        !!b &&
        (await unseal(b.managementToken, this.env.ENCRYPTION_KEY)) ===
          "synthetic-management-token",
      heldEmailRecovered:
        !!payload &&
        (await unseal<{ text: string }>(payload, this.env.ENCRYPTION_KEY))
          .text === "Never deliver",
    };
  }

  async damage() {
    this.ctx.storage.transactionSync(() => {
      for (const table of tables)
        this.ctx.storage.sql.exec(`DELETE FROM ${table}`);
    });
    await this.ctx.storage.put("fixture-kv", "after");
    await this.ctx.storage.deleteAlarm();
    return { damaged: true };
  }
  async restore(bookmark: string) {
    return {
      undo: await this.ctx.storage.onNextSessionRestoreBookmark(bookmark),
    };
  }
  async quarantine() {
    const current = this.getSettings();
    current.settings.enabled = false;
    current.revision++;
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "UPDATE config SET value=? WHERE key='settings'",
        JSON.stringify(current),
      );
      this.ctx.storage.sql.exec("DELETE FROM tokens");
      this.ctx.storage.sql.exec(
        "UPDATE jobs SET data=json_set(data,'$.terminal',json('true'),'$.error','recovery_review_required'),lease=0",
      );
    });
    await this.ctx.storage.deleteAlarm();
    return {
      paused: !this.getSettings().settings.enabled,
      sessions: this.ctx.storage.sql
        .exec<{ count: number }>("SELECT count(*) AS count FROM tokens")
        .one().count,
      alarm: await this.ctx.storage.getAlarm(),
      runnableJobs: this.ctx.storage.sql
        .exec<{ count: number }>(
          "SELECT count(*) AS count FROM jobs WHERE coalesce(json_extract(data,'$.terminal'),0)=0",
        )
        .one().count,
    };
  }
  restart() {
    this.ctx.abort("Isolated recovery drill restart");
  }
}

export default {
  async fetch(request: Request, env: DrillEnv) {
    if (
      request.method !== "POST" ||
      !timingSafeEqual(
        request.headers.get("Authorization") || "",
        "Bearer " + env.DRILL_TOKEN,
      )
    )
      return new Response(null, { status: 404 });
    const stub = env.DRILL.getByName("synthetic-recovery-fixture");
    const action = new URL(request.url).pathname;
    let result: unknown;
    if (action === "/ready") result = { ready: true };
    else if (action === "/seed") result = await stub.seed();
    else if (action === "/damage") result = await stub.damage();
    else if (action === "/snapshot") result = await stub.snapshot();
    else if (action === "/quarantine") result = await stub.quarantine();
    else if (action === "/restore") {
      const value = await request.text();
      if (!/^[a-z0-9-]{1,200}$/i.test(value))
        return new Response(null, { status: 400 });
      result = await stub.restore(value);
    } else if (action === "/restart") {
      try {
        await stub.restart();
      } catch {
        /* ctx.abort deliberately ends the RPC. */
      }
      result = { restarted: true };
    } else return new Response(null, { status: 404 });
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  },
};
