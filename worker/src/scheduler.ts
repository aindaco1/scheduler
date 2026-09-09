import { DurableObject } from "cloudflare:workers";
import { prepareResendEmail } from "@dustwave/worker-core/email";
import { Temporal } from "@js-temporal/polyfill";
import { ResendApiError } from "@dustwave/worker-core/resend";
import { outboxRetryDelayMs } from "@dustwave/worker-core/outbox";
import {
  AppError,
  bookingInput,
  changeMessageInput,
  defaultSettings,
  settingsSchema,
  type Booking,
  type BookingInput,
  type Busy,
  type Settings,
  type GoogleConnection,
  type IcloudConnection,
  type ZoomConnection,
  type PublicBooking,
  type CalendarChoice,
} from "./model";
import { availableSlots, canBook, resolveType } from "./availability";
import {
  seal,
  unseal,
  randomToken,
  sha256Hex,
  timingSafeEqual,
} from "./security";
import { GoogleCalendar, googleToken } from "./providers/google";
import { icloudBusy, icloudCalendars } from "./providers/icloud";
import { refreshZoom, ZoomMeetings } from "./providers/zoom";
import { bookingEmail, loginEmail, sendEmail, type Email } from "./email";
import type { RuntimeEnv } from "./env";

interface Job {
  id: string;
  kind: "booking" | "email";
  bookingId?: string;
  revision?: number;
  mailKind?: "confirmed" | "cancelled" | "rescheduled" | "reminder";
  payload?: string;
  attempts: number;
  due: number;
  lease: number;
  error?: string;
  created?: number;
  expires?: number;
  firstAttemptAt?: number;
  sender?: string;
  terminal?: boolean;
}
interface StoredConfig {
  settings: Settings;
  revision: number;
}
const active = ["pending", "confirmed", "cancelling", "rescheduling"];

export class Scheduler extends DurableObject<RuntimeEnv> {
  private zoomRefresh?: Promise<ZoomConnection>;
  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env);
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS bookings (id TEXT PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, start REAL NOT NULL, end REAL NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL)",
    );
    ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS booking_time ON bookings(start,end)",
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, due REAL NOT NULL, lease REAL NOT NULL DEFAULT 0, data TEXT NOT NULL)",
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS tokens (hash TEXT PRIMARY KEY, purpose TEXT NOT NULL, expires REAL NOT NULL, value TEXT NOT NULL)",
    );
    ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, reset REAL NOT NULL, count INTEGER NOT NULL)",
    );
    if (!this.read<StoredConfig>("settings"))
      this.write("settings", { settings: defaultSettings(), revision: 1 });
  }
  private read<T>(key: string): T | undefined {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM config WHERE key=?", key)
      .toArray()[0];
    return row ? JSON.parse(row.value) : undefined;
  }
  private write(key: string, value: unknown) {
    this.ctx.storage.sql.exec(
      "INSERT INTO config(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      key,
      JSON.stringify(value),
    );
  }
  getSettings(): StoredConfig {
    return this.read<StoredConfig>("settings")!;
  }
  private booking(id: string): Booking {
    const row = this.ctx.storage.sql
      .exec<{ data: string }>("SELECT data FROM bookings WHERE id=?", id)
      .toArray()[0];
    if (!row) throw new AppError("booking_not_found", 404);
    return JSON.parse(row.data);
  }
  private save(b: Booking) {
    b.updated = Date.now();
    this.ctx.storage.sql.exec(
      "INSERT INTO bookings(id,request_id,start,end,status,data) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET start=excluded.start,end=excluded.end,status=excluded.status,data=excluded.data",
      b.id,
      b.requestId,
      b.start,
      b.end,
      b.status,
      JSON.stringify(b),
    );
  }
  private present(b: Booking): PublicBooking {
    const {
      id,
      typeId,
      typeName,
      mode,
      locationId,
      location,
      start,
      end,
      status,
      joinUrl,
      locale,
      timezone,
      email,
      name,
      topic,
      error,
    } = b;
    return {
      id,
      typeId,
      typeName,
      mode,
      locationId,
      location,
      start,
      end,
      status,
      joinUrl,
      locale,
      timezone,
      email,
      name,
      topic,
      error,
      cancelUntil: start - this.getSettings().settings.cancelHours * 3_600_000,
    };
  }
  private localBusy(from: number, to: number): Busy[] {
    const rows = this.ctx.storage.sql
      .exec<{ data: string }>(
        "SELECT data FROM bookings WHERE status IN ('pending','confirmed','cancelling','rescheduling') AND (end>=? AND start<=? OR status='rescheduling') LIMIT 3000",
        from,
        to,
      )
      .toArray();
    if (rows.length === 3000) throw new AppError("calendar_incomplete", 503);
    return rows.flatMap((r) => {
      const b: Booking = JSON.parse(r.data);
      return [
        { start: b.start, end: b.end, gap: b.gap, bookingId: b.id },
        ...(b.targetStart
          ? [
              {
                start: b.targetStart,
                end: b.targetEnd!,
                gap: b.gap,
                bookingId: b.id,
              },
            ]
          : []),
      ];
    });
  }
  private async connection<T>(provider: string): Promise<T | undefined> {
    const data = this.read<string>("connection:" + provider);
    return data ? unseal<T>(data, this.env.ENCRYPTION_KEY) : undefined;
  }
  async putConnection(
    provider: "google" | "icloud" | "zoom",
    value: GoogleConnection | IcloudConnection | ZoomConnection,
    maintenance = false,
  ) {
    const encrypted = await seal(value, this.env.ENCRYPTION_KEY);
    const accountId = "accountId" in value ? value.accountId : undefined;
    const previous = this.read<string>("identity:" + provider);
    if (
      previous &&
      accountId !== previous &&
      this.ctx.storage.sql
        .exec<{ count: number }>(
          "SELECT count(*) AS count FROM bookings WHERE status IN ('pending','rescheduling','cancelling') OR (status='confirmed' AND end>?)",
          Date.now(),
        )
        .one().count
    )
      throw new AppError("account_switch_has_bookings", 409);
    this.ctx.storage.transactionSync(() => {
      this.write("connection:" + provider, encrypted);
      if (accountId) this.write("identity:" + provider, accountId);
      if (!maintenance) {
        const c = this.getSettings();
        c.settings.enabled = false;
        c.revision++;
        this.write("settings", c);
      }
    });
  }
  private async google(): Promise<GoogleCalendar> {
    if (!this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_CLIENT_SECRET)
      throw new AppError("google_not_configured", 503);
    const connection = await this.connection<GoogleConnection>("google");
    if (!connection) throw new AppError("google_not_connected", 503);
    return new GoogleCalendar(
      await googleToken(
        connection,
        this.env.GOOGLE_CLIENT_ID,
        this.env.GOOGLE_CLIENT_SECRET,
      ),
    );
  }
  private async zoom(): Promise<ZoomMeetings> {
    if (!this.env.ZOOM_CLIENT_ID || !this.env.ZOOM_CLIENT_SECRET)
      throw new AppError("zoom_not_configured", 503);
    // Refresh token rotation is serialized per owner and persisted before callers receive it.
    if (!this.zoomRefresh)
      this.zoomRefresh = (async () => {
        const c = await this.connection<ZoomConnection>("zoom");
        if (!c) throw new AppError("zoom_not_connected", 503);
        const next = await refreshZoom(
          c,
          this.env.ZOOM_CLIENT_ID!,
          this.env.ZOOM_CLIENT_SECRET!,
        );
        if (next !== c) await this.putConnection("zoom", next, true);
        return next;
      })();
    try {
      return new ZoomMeetings((await this.zoomRefresh).accessToken);
    } finally {
      this.zoomRefresh = undefined;
    }
  }
  private configured(settings: Settings): string[] {
    const issues: string[] = [];
    if (!this.env.GOOGLE_CLIENT_ID || !this.env.GOOGLE_CLIENT_SECRET)
      issues.push("google_not_configured");
    if (
      !this.env.SESSION_SECRET ||
      !this.env.ENCRYPTION_KEY ||
      !this.env.RESEND_API_KEY ||
      !this.env.EMAIL_FROM ||
      !this.env.TURNSTILE_SECRET_KEY ||
      !this.env.TURNSTILE_SITE_KEY
    )
      issues.push("setup_required");
    if (!this.read("connection:google")) issues.push("google_not_connected");
    if (
      settings.requireIcloud &&
      (!this.read("connection:icloud") || !settings.icloudCalendars.length)
    )
      issues.push("icloud_not_connected");
    if (
      settings.types.some((t) => t.enabled && t.mode === "zoom") &&
      !this.read("connection:zoom")
    )
      issues.push("zoom_not_connected");
    if (!settings.hours.length) issues.push("hours_required");
    if (!settings.types.some((t) => t.enabled))
      issues.push("meeting_type_required");
    return issues;
  }
  publicConfig() {
    const s = this.getSettings().settings;
    const settings = {
      name: s.name,
      intro: s.intro,
      timezone: s.timezone,
      enabled: s.enabled,
      noticeHours: s.noticeHours,
      horizonDays: s.horizonDays,
      cancelHours: s.cancelHours,
      brand: s.brand,
      types: s.types.filter((t) => t.enabled),
      locations: s.locations
        .filter((l) => l.enabled)
        .map(({ id, name, address, enabled }) => ({
          id,
          name,
          address,
          enabled,
        })),
    };
    return {
      settings,
      turnstileSiteKey: this.env.TURNSTILE_SITE_KEY,
      ready: s.enabled && !this.configured(s).length,
    };
  }
  private async externalBusy(
    settings: Settings,
    from: number,
    to: number,
  ): Promise<Busy[]> {
    const issues = this.configured(settings);
    if (issues.length) throw new AppError(issues[0], 503);
    const [google, apple] = await Promise.all([
      this.google(),
      this.connection<IcloudConnection>("icloud"),
    ]);
    const results = await Promise.all([
      google.busy(settings.googleCalendars, from, to, settings.timezone),
      settings.icloudCalendars.length
        ? apple
          ? icloudBusy(
              apple,
              settings.icloudCalendars,
              from,
              to,
              settings.timezone,
            )
          : Promise.reject(new AppError("icloud_not_connected", 503))
        : Promise.resolve([]),
    ]);
    this.write("lastVerified", Date.now());
    return results.flat();
  }
  async connections(verify = false) {
    const settings = this.getSettings().settings,
      issues = this.configured(settings);
    const calendars: CalendarChoice[] = [];
    const gc = await this.connection<GoogleConnection>("google");
    const ic = await this.connection<IcloudConnection>("icloud");
    if (gc) {
      try {
        calendars.push(...(await (await this.google()).calendars()));
      } catch (e) {
        issues.push(e instanceof AppError ? e.code : "google_unavailable");
      }
    }
    if (ic) {
      try {
        calendars.push(...(await icloudCalendars(ic)));
      } catch (e) {
        issues.push(e instanceof AppError ? e.code : "icloud_unavailable");
      }
    }
    if (verify && !issues.length) {
      try {
        await this.externalBusy(
          settings,
          Date.now() - 86_400_000,
          Date.now() + 7 * 86_400_000,
        );
        if (settings.types.some((t) => t.enabled && t.mode === "zoom"))
          await this.zoom();
      } catch (e) {
        issues.push(e instanceof AppError ? e.code : "calendar_unavailable");
      }
    }
    return {
      google: { connected: !!gc, email: gc?.email },
      icloud: { connected: !!ic },
      zoom: { connected: !!this.read("connection:zoom") },
      calendars,
      ready: !issues.length,
      issues: [...new Set(issues)],
      lastVerified: this.read<number>("lastVerified") || null,
    };
  }
  async connectIcloud(username: string, password: string) {
    if (
      !username ||
      username.length > 254 ||
      !password ||
      password.length > 128
    )
      throw new AppError("invalid_credentials");
    await icloudCalendars({ username, password });
    await this.putConnection("icloud", { username, password });
    return this.connections();
  }
  async disconnect(provider: string) {
    if (!["google", "icloud", "zoom"].includes(provider))
      throw new AppError("invalid_provider");
    this.ctx.storage.sql.exec(
      "DELETE FROM config WHERE key=?",
      "connection:" + provider,
    );
    const c = this.getSettings();
    c.settings.enabled = false;
    c.revision++;
    this.write("settings", c);
    return this.connections();
  }
  async updateSettings(value: unknown, revision: number) {
    const settings = settingsSchema.parse(value);
    let current = this.getSettings();
    if (current.revision !== revision)
      throw new AppError("settings_changed", 409);
    // Local availability edits must remain saveable during provider outages.
    // Validate live connections only when opening bookings or changing their
    // dependencies; listing, booking and rescheduling still check every time.
    const connectionsChanged =
      (["googleCalendars", "icloudCalendars"] as const).some(
        (key) =>
          JSON.stringify([...settings[key]].sort()) !==
          JSON.stringify([...current.settings[key]].sort()),
      ) ||
      settings.requireIcloud !== current.settings.requireIcloud ||
      settings.types.some((t) => t.enabled && t.mode === "zoom") !==
        current.settings.types.some((t) => t.enabled && t.mode === "zoom");
    if (settings.enabled && (!current.settings.enabled || connectionsChanged)) {
      await this.externalBusy(
        settings,
        Date.now() - 86_400_000,
        Date.now() + 86_400_000,
      );
      if (settings.types.some((t) => t.enabled && t.mode === "zoom"))
        await this.zoom();
    }
    current = this.getSettings();
    if (current.revision !== revision)
      throw new AppError("settings_changed", 409);
    this.write("settings", { settings, revision: revision + 1 });
    return this.getSettings();
  }
  async availability(
    typeId: string,
    locationId: string,
    from: number,
    to: number,
    id?: string,
    token?: string,
  ) {
    const config = this.getSettings();
    if (!config.settings.enabled) throw new AppError("booking_paused", 503);
    if (id) {
      const b = await this.authorizedBooking(id, token || "", false);
      if (typeId !== b.typeId || locationId !== b.locationId)
        throw new AppError("invalid_request");
      config.settings.types = config.settings.types.map((t) =>
        t.id === b.typeId
          ? { ...t, duration: (b.end - b.start) / 60_000, gap: b.gap }
          : t,
      );
    }
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to <= from ||
      to - from > 7 * 86_400_000
    )
      throw new AppError("invalid_date_range");
    const busy = await this.externalBusy(
      config.settings,
      from - 4 * 3_600_000,
      to + 8 * 3_600_000,
    );
    if (this.getSettings().revision !== config.revision)
      throw new AppError("settings_changed", 409);
    return {
      slots: availableSlots(
        config.settings,
        typeId,
        locationId,
        from,
        to,
        [...busy, ...this.localBusy(from - 86_400_000, to + 86_400_000)],
        Date.now(),
        id,
      ),
    };
  }
  async rateLimit(key: string, maximum: number, period: number) {
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM limits WHERE reset<?", now);
    const row = this.ctx.storage.sql
      .exec<{ count: number }>("SELECT count FROM limits WHERE key=?", key)
      .toArray()[0];
    if (row && row.count >= maximum)
      throw new AppError("too_many_requests", 429);
    this.ctx.storage.sql.exec(
      "INSERT INTO limits(key,reset,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=count+1",
      key,
      now + period,
    );
  }
  private enqueue(job: Job) {
    job.created ??= Date.now();
    this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO jobs(id,due,lease,data) VALUES(?,?,?,?)",
      job.id,
      job.due,
      job.lease,
      JSON.stringify(job),
    );
  }
  private async arm() {
    const row = this.ctx.storage.sql
      .exec<{ next: number }>(
        "SELECT min(max(due,lease)) AS next FROM jobs WHERE coalesce(json_extract(data,'$.terminal'),0)=0",
      )
      .toArray()[0];
    if (row?.next != null)
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 500, row.next));
  }
  private queueBooking(b: Booking) {
    this.enqueue({
      id: `booking:${b.id}:${b.revision}`,
      kind: "booking",
      bookingId: b.id,
      revision: b.revision,
      attempts: 0,
      due: Date.now(),
      lease: 0,
    });
  }
  async createBooking(raw: unknown) {
    const input = bookingInput.parse(raw);
    try {
      new Intl.DateTimeFormat("en", { timeZone: input.timezone });
    } catch {
      throw new AppError("invalid_timezone");
    }
    const { turnstile: _, ...identity } = input;
    const fingerprint = await sha256Hex(JSON.stringify(identity));
    const existing = this.ctx.storage.sql
      .exec<{ data: string }>(
        "SELECT data FROM bookings WHERE request_id=?",
        input.requestId,
      )
      .toArray()[0];
    if (existing) {
      const b: Booking = JSON.parse(existing.data);
      if (this.read("request:" + input.requestId) !== fingerprint)
        throw new AppError("request_changed", 409);
      return {
        booking: this.present(b),
        token: await unseal<string>(
          b.managementToken!,
          this.env.ENCRYPTION_KEY,
        ),
      };
    }
    const config = this.getSettings(),
      s = config.settings;
    if (!s.enabled) throw new AppError("booking_paused", 503);
    const { type, location } = resolveType(s, input.typeId, input.locationId);
    const start = Date.parse(input.start),
      end = start + type.duration * 60_000;
    if (
      !canBook(
        s,
        type,
        input.locationId,
        start,
        this.localBusy(start - 86_400_000, end + 86_400_000),
        Date.now(),
      )
    )
      throw new AppError("slot_unavailable", 409);
    const busy = await this.externalBusy(
      s,
      start - 86_400_000,
      end + 86_400_000,
    );
    const id = crypto.randomUUID(),
      token = randomToken();
    const managementHash = await sha256Hex(token),
      managementToken = await seal(token, this.env.ENCRYPTION_KEY);
    const concurrent = this.ctx.storage.sql
      .exec<{ data: string }>(
        "SELECT data FROM bookings WHERE request_id=?",
        input.requestId,
      )
      .toArray()[0];
    if (concurrent) {
      const prior: Booking = JSON.parse(concurrent.data);
      if (this.read("request:" + input.requestId) !== fingerprint)
        throw new AppError("request_changed", 409);
      return {
        booking: this.present(prior),
        token: await unseal<string>(
          prior.managementToken!,
          this.env.ENCRYPTION_KEY,
        ),
      };
    }
    if (this.getSettings().revision !== config.revision)
      throw new AppError("settings_changed", 409);
    // No await between the final overlap check and reservation/job insertion.
    if (
      !canBook(
        s,
        type,
        input.locationId,
        start,
        [...busy, ...this.localBusy(start - 86_400_000, end + 86_400_000)],
        Date.now(),
      )
    )
      throw new AppError("slot_unavailable", 409);
    const b: Booking = {
      id,
      requestId: input.requestId,
      typeId: type.id,
      typeName: type.name[input.locale],
      mode: type.mode,
      locationId: input.locationId,
      location: location
        ? `${location.name[input.locale]} — ${location.address[input.locale]}`
        : "",
      start,
      end,
      gap: type.gap,
      name: input.name,
      email: input.email,
      topic: input.topic,
      locale: input.locale,
      timezone: input.timezone,
      status: "pending",
      created: Date.now(),
      updated: Date.now(),
      managementHash,
      managementToken,
      revision: 1,
    };
    this.ctx.storage.transactionSync(() => {
      this.save(b);
      this.write("request:" + input.requestId, fingerprint);
      this.queueBooking(b);
    });
    await this.arm();
    return { booking: this.present(b), token };
  }
  private async authorizedBooking(
    id: string,
    token: string,
    admin: boolean,
  ): Promise<Booking> {
    const b = this.booking(id);
    if (
      !admin &&
      (!token || !timingSafeEqual(await sha256Hex(token), b.managementHash))
    )
      throw new AppError("booking_not_found", 404);
    return b;
  }
  async getBooking(id: string, token: string, admin = false) {
    return {
      booking: this.present(await this.authorizedBooking(id, token, admin)),
    };
  }
  listBookings() {
    return {
      bookings: this.ctx.storage.sql
        .exec<{ data: string }>(
          "SELECT data FROM bookings WHERE end>? ORDER BY start LIMIT 200",
          Date.now() - 30 * 86_400_000,
        )
        .toArray()
        .map((r) => this.present(JSON.parse(r.data))),
    };
  }
  async cancel(id: string, token: string, admin = false, message = "") {
    const initial = await this.authorizedBooking(id, token, admin),
      s = this.getSettings().settings;
    message = changeMessageInput.parse(message);
    if (message && !admin) throw new AppError("invalid_request", 403);
    if (!admin && Date.now() > initial.start - s.cancelHours * 3_600_000)
      throw new AppError("management_closed", 403);
    const b = this.booking(id);
    if (b.status === "cancelled" || b.status === "cancelling") {
      if (admin && message !== (b.changeMessage || ""))
        throw new AppError("request_changed", 409);
      return { booking: this.present(b) };
    }
    if (
      b.status !== "confirmed" &&
      b.status !== "failed" &&
      b.status !== "pending"
    )
      throw new AppError("booking_busy", 409);
    b.status = "cancelling";
    b.changeMessage = message || undefined;
    b.revision++;
    b.error = undefined;
    this.ctx.storage.transactionSync(() => {
      this.save(b);
      this.queueBooking(b);
    });
    await this.arm();
    return { booking: this.present(b) };
  }
  async reschedule(
    id: string,
    token: string,
    startValue: string,
    requestId: string,
    admin = false,
    message = "",
  ) {
    const initial = await this.authorizedBooking(id, token, admin),
      config = this.getSettings(),
      s = config.settings;
    message = changeMessageInput.parse(message);
    if (message && !admin) throw new AppError("invalid_request", 403);
    const messageHash = await sha256Hex(message);
    if (
      !/^[0-9a-f-]{36}$/.test(requestId) ||
      !Number.isFinite(Date.parse(startValue))
    )
      throw new AppError("invalid_request");
    const key = "reschedule:" + requestId,
      prior = this.read<{ id: string; start: number; messageHash?: string }>(
        key,
      ),
      start = Date.parse(startValue);
    if (prior) {
      if (
        prior.id !== id ||
        prior.start !== start ||
        (prior.messageHash
          ? prior.messageHash !== messageHash
          : Boolean(message))
      )
        throw new AppError("request_changed", 409);
      return { booking: this.present(initial) };
    }
    if (!admin && Date.now() > initial.start - s.cancelHours * 3_600_000)
      throw new AppError("management_closed", 403);
    if (initial.status !== "confirmed") throw new AppError("booking_busy", 409);
    const { type } = resolveType(s, initial.typeId, initial.locationId);
    const end = start + (initial.end - initial.start);
    const snapshot = {
      ...type,
      duration: (initial.end - initial.start) / 60_000,
      gap: initial.gap,
    };
    const busy = await this.externalBusy(
      s,
      start - 86_400_000,
      end + 86_400_000,
    );
    const b = this.booking(id);
    if (
      b.revision !== initial.revision ||
      b.status !== "confirmed" ||
      this.getSettings().revision !== config.revision
    )
      throw new AppError("booking_busy", 409);
    if (
      !canBook(
        s,
        snapshot,
        b.locationId,
        start,
        [...busy, ...this.localBusy(start - 86_400_000, end + 86_400_000)],
        Date.now(),
        id,
      )
    )
      throw new AppError("slot_unavailable", 409);
    b.status = "rescheduling";
    b.changeMessage = message || undefined;
    b.targetStart = start;
    b.targetEnd = end;
    b.revision++;
    b.error = undefined;
    this.ctx.storage.transactionSync(() => {
      this.save(b);
      this.write(key, { id, start, messageHash });
      this.queueBooking(b);
    });
    await this.arm();
    return { booking: this.present(b) };
  }
  async createLogin(email: string) {
    if (
      !timingSafeEqual(
        email.trim().toLowerCase(),
        this.env.ADMIN_EMAIL.toLowerCase(),
      )
    )
      return { ok: true };
    const token = randomToken(),
      hash = await sha256Hex(token);
    const expires = Date.now() + 15 * 60_000;
    const payload = await seal(
      loginEmail(email, this.env.PUBLIC_ORIGIN + "/admin/#login=" + token),
      this.env.ENCRYPTION_KEY,
    );
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        "INSERT INTO tokens(hash,purpose,expires,value) VALUES(?,?,?,?)",
        hash,
        "login",
        expires,
        "",
      );
      this.enqueue({
        id: "login:" + hash,
        kind: "email",
        payload,
        attempts: 0,
        due: Date.now(),
        lease: 0,
        expires,
      });
    });
    await this.arm();
    return { ok: true };
  }
  async consumeLogin(token: string) {
    const hash = await sha256Hex(token);
    const row = this.ctx.storage.sql
      .exec<{ expires: number }>(
        "DELETE FROM tokens WHERE hash=? AND purpose='login' RETURNING expires",
        hash,
      )
      .toArray()[0];
    if (!row || row.expires < Date.now())
      throw new AppError("login_expired", 401);
    const session = randomToken();
    this.ctx.storage.sql.exec(
      "INSERT INTO tokens(hash,purpose,expires,value) VALUES(?,?,?,?)",
      await sha256Hex(session),
      "session",
      Date.now() + 12 * 3_600_000,
      "",
    );
    return session;
  }
  async session(token: string) {
    if (!token) return false;
    const hash = await sha256Hex(token);
    const row = this.ctx.storage.sql
      .exec<{ expires: number }>(
        "SELECT expires FROM tokens WHERE hash=? AND purpose='session'",
        hash,
      )
      .toArray()[0];
    return !!row && row.expires > Date.now();
  }
  async logout(token: string) {
    this.ctx.storage.sql.exec(
      "DELETE FROM tokens WHERE hash=?",
      await sha256Hex(token),
    );
  }
  async oauthState(provider: string, session: string, verifier: string) {
    const state = randomToken(),
      hash = await sha256Hex(state);
    this.ctx.storage.sql.exec(
      "INSERT INTO tokens(hash,purpose,expires,value) VALUES(?,?,?,?)",
      hash,
      "oauth:" + provider,
      Date.now() + 10 * 60_000,
      JSON.stringify({ session: await sha256Hex(session), verifier }),
    );
    return state;
  }
  async consumeOauth(state: string, provider: string, session: string) {
    const hash = await sha256Hex(state);
    const row = this.ctx.storage.sql
      .exec<{ expires: number; value: string }>(
        "DELETE FROM tokens WHERE hash=? AND purpose=? RETURNING expires,value",
        hash,
        "oauth:" + provider,
      )
      .toArray()[0];
    if (!row || row.expires < Date.now())
      throw new AppError("oauth_expired", 401);
    const value: { session: string; verifier: string } = JSON.parse(row.value);
    if (!timingSafeEqual(value.session, await sha256Hex(session)))
      throw new AppError("oauth_expired", 401);
    return value.verifier;
  }
  private queueMail(b: Booking, kind: Job["mailKind"], due = Date.now()) {
    this.enqueue({
      id: `email:${b.id}:${b.revision}:${kind}`,
      kind: "email",
      bookingId: b.id,
      revision: b.revision,
      mailKind: kind,
      attempts: 0,
      due,
      lease: 0,
    });
  }
  private queueReminder(b: Booking) {
    const hours = this.getSettings().settings.reminderHours;
    if (hours && b.start - hours * 3_600_000 > Date.now())
      this.queueMail(b, "reminder", b.start - hours * 3_600_000);
  }
  private mergeResult(b: Booking, result: Partial<Booking>): boolean {
    const current = this.booking(b.id);
    if (current.revision !== b.revision) {
      if (current.status === "cancelling") {
        Object.assign(current, result);
        this.save(current);
      }
      return false;
    }
    Object.assign(b, result);
    this.save(b);
    return true;
  }
  private async processBooking(job: Job) {
    let b = this.booking(job.bookingId!);
    if (
      b.revision !== job.revision ||
      !["pending", "cancelling", "rescheduling"].includes(b.status)
    )
      return;
    const google = await this.google();
    if (b.status === "pending") {
      const existing = await google.get(b);
      if (!existing) {
        const s = this.getSettings().settings;
        const busy = await this.externalBusy(
          s,
          b.start - 86_400_000,
          b.end + 86_400_000,
        );
        if (this.booking(b.id).revision !== b.revision) return;
        // Local reservation already passed time-based rules; elapsed notice must not invalidate a queued booking.
        if (
          busy.some(
            (x) =>
              x.bookingId !== b.id &&
              b.start < x.end + Math.max(b.gap, x.gap ?? b.gap) * 60_000 &&
              b.end + Math.max(b.gap, x.gap ?? b.gap) * 60_000 > x.start,
          )
        ) {
          if (!this.read("zoomAttempt:" + b.id)) {
            b.status = "failed";
            b.error = "slot_unavailable";
            this.save(b);
            return;
          }
          throw new AppError("booking_needs_attention", 503);
        }
      }
      if (b.mode === "zoom" && !b.zoomId) {
        const zoom = await this.zoom(),
          found = await zoom.find(b);
        if (found?.id && found.join_url) {
          if (
            !this.mergeResult(b, {
              zoomId: String(found.id),
              joinUrl: found.join_url,
            })
          )
            return;
        } else {
          if (this.read("zoomAttempt:" + b.id))
            throw new AppError("zoom_write_uncertain", 503, true);
          if (this.booking(b.id).revision !== b.revision) return;
          this.write("zoomAttempt:" + b.id, Date.now());
          try {
            const result = await zoom.create(b);
            if (!this.mergeResult(b, result)) return;
          } catch (e) {
            if (e instanceof AppError && e.code === "zoom_write_rejected")
              this.ctx.storage.sql.exec(
                "DELETE FROM config WHERE key=?",
                "zoomAttempt:" + b.id,
              );
            throw e;
          }
        }
      }
      if (this.booking(b.id).revision !== b.revision) return;
      const result = await google.create(b, this.env.OWNER_SLUG);
      if (!this.mergeResult(b, result)) return;
      b.status = "confirmed";
      b.error = undefined;
      this.ctx.storage.transactionSync(() => {
        this.save(b);
        this.queueMail(b, "confirmed");
        this.queueReminder(b);
      });
    } else if (b.status === "rescheduling") {
      const remote = await google.get(b);
      if (Date.parse(remote?.start?.dateTime || "") !== b.targetStart) {
        const s = this.getSettings().settings,
          busy = await this.externalBusy(
            s,
            b.targetStart! - 86_400_000,
            b.targetEnd! + 86_400_000,
          );
        if (
          busy.some(
            (x) =>
              x.bookingId !== b.id &&
              b.targetStart! < x.end + b.gap * 60_000 &&
              b.targetEnd! + b.gap * 60_000 > x.start,
          )
        ) {
          b.status = "confirmed";
          b.targetStart = undefined;
          b.targetEnd = undefined;
          b.error = "slot_unavailable";
          b.changeMessage = undefined;
          this.ctx.storage.transactionSync(() => {
            this.save(b);
            this.queueReminder(b);
          });
          return;
        }
      }
      // Google is patched first; if Zoom fails, both intervals remain reserved until recovery.
      await google.reschedule(b);
      if (b.mode === "zoom") await (await this.zoom()).reschedule(b);
      b.start = b.targetStart!;
      b.end = b.targetEnd!;
      b.targetStart = undefined;
      b.targetEnd = undefined;
      b.status = "confirmed";
      b.error = undefined;
      this.ctx.storage.transactionSync(() => {
        this.save(b);
        this.queueMail(b, "rescheduled");
        this.queueReminder(b);
      });
    } else {
      if (b.mode === "zoom" && !b.zoomId && this.read("zoomAttempt:" + b.id)) {
        const found = await (await this.zoom()).find(b);
        if (!found?.id) throw new AppError("zoom_write_uncertain", 503, true);
        b.zoomId = String(found.id);
        this.save(b);
      }
      await google.cancel(b);
      if (b.mode === "zoom" && b.zoomId) await (await this.zoom()).cancel(b);
      b.status = "cancelled";
      b.error = undefined;
      this.ctx.storage.transactionSync(() => {
        this.save(b);
        this.queueMail(b, "cancelled");
      });
    }
  }
  private async processEmail(job: Job) {
    if (job.expires && Date.now() > job.expires) return;
    // Resend deduplication expires. Stop automatic delivery rather than risk a duplicate after a day.
    if (job.firstAttemptAt && Date.now() - job.firstAttemptAt > 23 * 3_600_000)
      throw new AppError("email_needs_attention", 503);
    if (job.bookingId) {
      const b = this.booking(job.bookingId);
      if (b.revision !== job.revision) return;
      if (
        job.mailKind === "reminder" &&
        (b.status !== "confirmed" || b.start < Date.now())
      )
        return;
      if (!job.payload)
        job.payload = await seal(
          bookingEmail(
            b,
            this.getSettings().settings,
            this.env.PUBLIC_ORIGIN,
            await unseal<string>(b.managementToken!, this.env.ENCRYPTION_KEY),
            job.mailKind!,
          ),
          this.env.ENCRYPTION_KEY,
        );
    }
    // Freeze the entire message before its first write: Resend retries require identical content.
    if (!job.firstAttemptAt) {
      const email = prepareResendEmail(
        await unseal<Email>(job.payload!, this.env.ENCRYPTION_KEY),
        { replyTo: this.env.EMAIL_REPLY_TO || this.env.ADMIN_EMAIL },
      );
      job.payload = await seal(email, this.env.ENCRYPTION_KEY);
    }
    job.firstAttemptAt ??= Date.now();
    job.sender ??= this.env.EMAIL_FROM;
    this.ctx.storage.sql.exec(
      "UPDATE jobs SET data=? WHERE id=?",
      JSON.stringify(job),
      job.id,
    );
    await sendEmail(
      await unseal<Email>(job.payload!, this.env.ENCRYPTION_KEY),
      this.env.RESEND_API_KEY,
      job.sender,
      job.id,
    );
    if (job.bookingId) {
      const b = this.booking(job.bookingId);
      if (b.revision === job.revision && b.error?.startsWith("email_")) {
        b.error = undefined;
        this.save(b);
      }
    }
  }
  async alarm() {
    const now = Date.now();
    this.ctx.storage.sql.exec("DELETE FROM tokens WHERE expires<?", now);
    this.ctx.storage.sql.exec("DELETE FROM limits WHERE reset<?", now);
    const jobs = this.ctx.storage.sql
      .exec<{ data: string }>(
        "SELECT data FROM jobs WHERE due<=? AND lease<=? AND coalesce(json_extract(data,'$.terminal'),0)=0 ORDER BY due LIMIT 5",
        now,
        now,
      )
      .toArray()
      .map((r) => JSON.parse(r.data) as Job);
    for (const job of jobs) {
      job.lease = Date.now() + 120_000;
      this.ctx.storage.sql.exec(
        "UPDATE jobs SET lease=?,data=? WHERE id=?",
        job.lease,
        JSON.stringify(job),
        job.id,
      );
      try {
        if (job.kind === "booking") await this.processBooking(job);
        else await this.processEmail(job);
        this.ctx.storage.sql.exec("DELETE FROM jobs WHERE id=?", job.id);
      } catch (e) {
        job.attempts++;
        job.terminal =
          job.kind === "email" &&
          ((e instanceof ResendApiError && !e.retryable) ||
            (e instanceof AppError && e.code === "email_needs_attention"));
        job.error = job.terminal
          ? "email_needs_attention"
          : e instanceof AppError
            ? e.code
            : job.kind === "email"
              ? "email_delivery_pending"
              : "provider_unavailable";
        job.lease = 0;
        job.due =
          Date.now() +
          outboxRetryDelayMs(e, job.attempts, {
            minimumMs: 15_000,
            maximumMs: job.kind === "email" ? 24 * 3_600_000 : 3_600_000,
          });
        this.ctx.storage.sql.exec(
          "UPDATE jobs SET due=?,lease=0,data=? WHERE id=?",
          job.due,
          JSON.stringify(job),
          job.id,
        );
        if (job.bookingId) {
          const b = this.booking(job.bookingId);
          if (b.revision === job.revision) {
            b.error = job.error;
            this.save(b);
          }
        }
      }
    }
    await this.arm();
  }
}
