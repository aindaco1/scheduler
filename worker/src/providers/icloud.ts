import { createDAVClient, type DAVCalendar } from "tsdav";
import { fetchProvider } from "../provider-fetch";
import { readBoundedText } from "@dustwave/worker-core/request-validation";
import { AppError, type CalendarChoice, type IcloudConnection } from "../model";
import { icalBusy } from "./ical";
import { xml2js, type Element } from "xml-js";
import sax from "sax";
import { FreshCache } from "../fresh-cache";

export function validateMultistatus(body: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(body))
    throw new AppError("icloud_incomplete", 503);
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
    throw new AppError("icloud_incomplete", 503);
  }
  const roots = document.elements?.filter((e) => e.type === "element") || [];
  if (roots.length !== 1 || roots[0].name?.split(":").pop() !== "multistatus")
    throw new AppError("icloud_incomplete", 503);
  const root = roots[0],
    prefix = root.name!.includes(":") ? root.name!.split(":")[0] : "";
  if (root.attributes?.[prefix ? "xmlns:" + prefix : "xmlns"] !== "DAV:")
    throw new AppError("icloud_incomplete", 503);
}

function safeUrl(value: string) {
  const url = new URL(value);
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
    if (!response.ok) throw new AppError("icloud_unavailable", 503, true);
    // Empty 200/204 responses are not successful calendar snapshots, even when
    // tsdav would normalize them to an empty event list.
    if (requiresMultistatus && response.status !== 207)
      throw new AppError("icloud_incomplete", 503);
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
    if (/HTTP\/1\.[01] (?:401|403|429|5\d\d)/.test(body))
      throw new AppError("icloud_incomplete", 503);
    return new Response(body, {
      status: response.status,
      headers: response.headers,
    });
  }
  throw new AppError("icloud_unavailable", 503);
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
// Discovery metadata is reusable; every busy() call still sends a new REPORT.
export class IcloudSession {
  private discovery = new FreshCache<{
    dav: Awaited<ReturnType<typeof client>>;
    calendars: DAVCalendar[];
  }>(1);
  constructor(private connection: IcloudConnection) {}
  private snapshot() {
    return this.discovery
      .get("discovery", 5 * 60_000, async () => {
        const dav = await client(this.connection);
        const calendars = await dav.fetchCalendars();
        if (calendars.length > 100)
          throw new AppError("icloud_incomplete", 503);
        calendars.forEach((c) => safeUrl(c.url));
        return { dav, calendars };
      })
      .catch((error) => {
        if (error instanceof AppError) throw error;
        throw new AppError("icloud_unavailable", 503, true);
      });
  }
  async calendars(): Promise<CalendarChoice[]> {
    const { calendars } = await this.snapshot();
    return calendars.map((c) => ({
      id: c.url,
      name:
        typeof c.displayName === "string" ? c.displayName : "iCloud calendar",
      provider: "icloud",
      writable: false,
    }));
  }
  async busy(ids: string[], from: number, to: number, zone: string) {
    try {
      const { dav, calendars } = await this.snapshot();
      const data = await Promise.all(
        ids.map(async (id) => {
          safeUrl(id);
          const calendar = calendars.find((c) => c.url === id);
          if (!calendar) throw new AppError("icloud_calendar_missing", 503);
          const objects = await dav.fetchCalendarObjects({
            calendar,
            timeRange: {
              start: new Date(from).toISOString(),
              end: new Date(to).toISOString(),
            },
            expand: true,
            urlFilter: () => true,
          });
          if (objects.length > 5000)
            throw new AppError("icloud_incomplete", 503);
          return objects.flatMap((o) => {
            if (typeof o.data !== "string")
              throw new AppError("icloud_incomplete", 503);
            return icalBusy(o.data, from, to, zone);
          });
        }),
      );
      return data.flat();
    } catch (error) {
      this.discovery.clear();
      if (error instanceof AppError) throw error;
      // tsdav errors can embed response data; only return a stable classification.
      throw new AppError("icloud_incomplete", 503);
    }
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
