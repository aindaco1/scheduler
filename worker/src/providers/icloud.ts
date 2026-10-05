import {
  createDAVClient,
  fetchCalendarObjects,
  getBasicAuthHeaders,
  type DAVCalendar,
} from "tsdav";
import { fetchProvider } from "../provider-fetch";
import { readBoundedText } from "@dustwave/worker-core/request-validation";
import { AppError, type CalendarChoice, type IcloudConnection } from "../model";
import { icalBusy } from "./ical";
import { xml2js, type Element } from "xml-js";
import sax from "sax";
import { FreshCache } from "../fresh-cache";

type IcloudFailureReason =
  | "unsafe_xml"
  | "invalid_xml"
  | "invalid_root"
  | "invalid_namespace"
  | "http_error"
  | "unexpected_status"
  | "multistatus_error"
  | "redirect_limit"
  | "calendar_limit"
  | "event_limit"
  | "event_data_missing"
  | "library_error";
class IcloudReadError extends AppError {
  constructor(
    code: string,
    retryable: boolean,
    public reason: IcloudFailureReason,
    public upstreamStatus?: number,
  ) {
    super(code, 503, retryable);
  }
}

export function validateMultistatus(body: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(body))
    throw new IcloudReadError("icloud_incomplete", false, "unsafe_xml");
  let document: Element;
  try {
    // xml-js swallows SAX errors; validate completeness before letting tsdav parse it.
    const parser = sax.parser(true, { xmlns: true });
    parser.onerror = (error) => {
      throw error;
    };
    parser.write(body).close();
    document = xml2js(body, { compact: false }) as Element;
  } catch {
    throw new IcloudReadError("icloud_incomplete", true, "invalid_xml");
  }
  const roots = document.elements?.filter((e) => e.type === "element") || [];
  if (roots.length !== 1 || roots[0].name?.split(":").pop() !== "multistatus")
    throw new IcloudReadError("icloud_incomplete", true, "invalid_root");
  const root = roots[0],
    prefix = root.name!.includes(":") ? root.name!.split(":")[0] : "";
  if (root.attributes?.[prefix ? "xmlns:" + prefix : "xmlns"] !== "DAV:")
    throw new IcloudReadError("icloud_incomplete", true, "invalid_namespace");
}

function safeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError("invalid_icloud_host", 503);
  }
  if (
    url.protocol !== "https:" ||
    !(
      url.hostname === "caldav.icloud.com" ||
      /^p\d+-caldav\.icloud\.com$/.test(url.hostname)
    ) ||
    url.username ||
    url.password ||
    url.port
  )
    throw new AppError("invalid_icloud_host", 503);
}
const appleFetch: typeof fetch = async (input, init) => {
  const method = (
    init?.method || (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  const requiresMultistatus = method === "PROPFIND" || method === "REPORT";
  let url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  for (let i = 0; i < 4; i++) {
    safeUrl(url);
    const response = await fetchProvider(
      url,
      { ...init, redirect: "manual" },
      20_000,
      6_000_000,
    );
    if ([301, 302, 307, 308].includes(response.status)) {
      url = new URL(response.headers.get("location") || "", url).href;
      continue;
    }
    if ([401, 403].includes(response.status))
      throw new IcloudReadError(
        "icloud_reconnect_required",
        false,
        "http_error",
        response.status,
      );
    if (response.status === 429)
      throw new IcloudReadError(
        "icloud_rate_limited",
        false,
        "http_error",
        response.status,
      );
    if (!response.ok) {
      // Do not retry earlier than a provider's Retry-After instruction.
      const after = response.headers.get("retry-after");
      const delay =
        after === null
          ? 0
          : /^\d+$/.test(after)
            ? Number(after) * 1000
            : Date.parse(after) - Date.now();
      throw new IcloudReadError(
        "icloud_unavailable",
        (response.status === 408 || response.status >= 500) && delay <= 500,
        "http_error",
        response.status,
      );
    }
    // Empty 200/204 responses are not successful calendar snapshots, even when
    // tsdav would normalize them to an empty event list.
    if (requiresMultistatus && response.status !== 207)
      throw new IcloudReadError(
        "icloud_incomplete",
        true,
        "unexpected_status",
        response.status,
      );
    const body = await readBoundedText(
      new Request("https://bounded.internal/", {
        method: "POST",
        body: response.body,
      }),
      6_000_000,
    );
    if (response.status === 207) validateMultistatus(body);
    // A 207 envelope can contain failed resources. Never treat an incomplete multistatus as free time.
    // Optional discovery properties commonly return 404; tsdav checks resource-level errors.
    if (/HTTP\/1\.[01] (?:401|403)/.test(body))
      throw new IcloudReadError(
        "icloud_reconnect_required",
        false,
        "multistatus_error",
      );
    if (/HTTP\/1\.[01] 429/.test(body))
      throw new IcloudReadError(
        "icloud_rate_limited",
        false,
        "multistatus_error",
      );
    if (/HTTP\/1\.[01] 5\d\d/.test(body))
      throw new IcloudReadError("icloud_incomplete", true, "multistatus_error");
    // After strict XML validation, ensure tsdav parses the snapshot. Otherwise
    // a missing/mistyped Content-Type silently turns valid busy events into [].
    const headers = new Headers(response.headers);
    if (response.status === 207)
      headers.set("Content-Type", "application/xml; charset=utf-8");
    return new Response(body, {
      status: response.status,
      headers,
    });
  }
  throw new IcloudReadError("icloud_unavailable", false, "redirect_limit");
};
async function client(connection: IcloudConnection) {
  return createDAVClient({
    serverUrl: "https://caldav.icloud.com",
    credentials: connection,
    authMethod: "Basic",
    defaultAccountType: "caldav",
    fetch: appleFetch,
  });
}
// Discovery is only needed for the owner's calendar picker. Conflict checks
// query the saved, validated collection URLs directly with a fresh REPORT.
export class IcloudSession {
  private discovery = new FreshCache<{
    dav: Awaited<ReturnType<typeof client>>;
    calendars: DAVCalendar[];
  }>(1);
  constructor(private connection: IcloudConnection) {}
  private async read<T>(
    operation: "discovery" | "busy",
    load: () => Promise<T>,
  ): Promise<T> {
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await load();
        if (attempt)
          console.info(
            JSON.stringify({ event: "icloud_read_recovered", operation }),
          );
        return value;
      } catch (error) {
        this.discovery.clear();
        // tsdav errors may contain credentials, URLs or calendar contents.
        const failure =
          error instanceof AppError
            ? error
            : new IcloudReadError(
                operation === "discovery"
                  ? "icloud_unavailable"
                  : "icloud_incomplete",
                true,
                "library_error",
              );
        const retry =
          attempt === 0 && failure.retryable && Date.now() - started < 10_000;
        console.warn(
          JSON.stringify({
            event: retry ? "icloud_read_retry" : "icloud_read_failed",
            operation,
            code: failure.code,
            ...(failure instanceof IcloudReadError
              ? {
                  reason: failure.reason,
                  upstreamStatus: failure.upstreamStatus,
                }
              : {}),
          }),
        );
        if (!retry) throw failure;
        // Retry the entire read; never reuse partial events.
        // Slow attempts, rejected credentials and throttling need owner/provider recovery.
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  private snapshot() {
    return this.discovery
      .get("discovery", 5 * 60_000, async () => {
        const dav = await client(this.connection);
        const calendars = await dav.fetchCalendars();
        if (calendars.length > 100)
          throw new IcloudReadError(
            "icloud_incomplete",
            false,
            "calendar_limit",
          );
        calendars.forEach((c) => safeUrl(c.url));
        return { dav, calendars };
      })
      .catch((error) => {
        if (error instanceof AppError) throw error;
        throw new IcloudReadError("icloud_unavailable", true, "library_error");
      });
  }
  async calendars(): Promise<CalendarChoice[]> {
    const { calendars } = await this.read("discovery", () => this.snapshot());
    return calendars.map((c) => ({
      id: c.url,
      name:
        typeof c.displayName === "string" ? c.displayName : "iCloud calendar",
      provider: "icloud",
      writable: false,
    }));
  }
  async busy(ids: string[], from: number, to: number, zone: string) {
    return this.read("busy", async () => {
      // Let every selected calendar settle before discarding a failed attempt.
      const data = await Promise.allSettled(
        ids.map(async (id) => {
          safeUrl(id);
          const objects = await fetchCalendarObjects({
            calendar: { url: id },
            headers: getBasicAuthHeaders(this.connection),
            fetch: appleFetch,
            timeRange: {
              start: new Date(from).toISOString(),
              end: new Date(to).toISOString(),
            },
            expand: true,
            urlFilter: () => true,
          });
          if (objects.length > 5000)
            throw new IcloudReadError(
              "icloud_incomplete",
              false,
              "event_limit",
            );
          return objects.flatMap((o) => {
            if (typeof o.data !== "string")
              throw new IcloudReadError(
                "icloud_incomplete",
                true,
                "event_data_missing",
              );
            return icalBusy(o.data, from, to, zone);
          });
        }),
      );
      // A different calendar's transient failure must not mask rejected access
      // or throttling and trigger another read against that provider.
      const failed =
        data.find(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof AppError &&
            !result.reason.retryable,
        ) || data.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      return data.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
    });
  }
}
export async function icloudCalendars(connection: IcloudConnection) {
  return new IcloudSession(connection).calendars();
}
export async function icloudBusy(
  connection: IcloudConnection,
  ids: string[],
  from: number,
  to: number,
  zone: string,
) {
  return new IcloudSession(connection).busy(ids, from, to, zone);
}
