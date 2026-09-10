import { calendarDescription } from "../booking-location";
import { fetchProvider } from "../provider-fetch";
import { Temporal } from "@js-temporal/polyfill";
import {
  AppError,
  type Booking,
  type Busy,
  type CalendarChoice,
  type GoogleConnection,
} from "../model";
import { boundedJson } from "../security";

const api = "https://www.googleapis.com/calendar/v3";
interface GoogleEvent {
  id: string;
  status?: string;
  transparency?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
  extendedProperties?: { private?: Record<string, string> };
  conferenceData?: { createRequest?: { status?: { statusCode?: string } } };
}
export async function googleToken(
  connection: GoogleConnection,
  clientId: string,
  clientSecret: string,
): Promise<{ token: string; expires: number }> {
  const response = await fetchProvider(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
      }),
    },
    12_000,
  );
  if (!response.ok) throw new AppError("google_reconnect_required", 503);
  const result = await boundedJson<{
    access_token?: string;
    expires_in?: number;
  }>(response, 32_768);
  if (!result.access_token)
    throw new AppError("google_reconnect_required", 503);
  return {
    token: result.access_token,
    expires:
      Date.now() +
      Math.max(0, Math.min(Number(result.expires_in) || 0, 3600) - 60) * 1000,
  };
}
export class GoogleCalendar {
  constructor(
    private token: string,
    private onUnauthorized = () => {},
  ) {}
  private async request<T>(
    path: string,
    init: RequestInit = {},
    allowMissing = false,
  ): Promise<T | null> {
    let response: Response;
    try {
      response = await fetchProvider(
        api + path,
        {
          ...init,
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
            ...init.headers,
          },
        },
        15_000,
      );
    } catch {
      throw new AppError("google_unavailable", 503, true);
    }
    if (allowMissing && [404, 410].includes(response.status)) return null;
    if (response.status === 401) this.onUnauthorized();
    if (!response.ok)
      throw new AppError(
        response.status === 401
          ? "google_reconnect_required"
          : "google_unavailable",
        503,
        response.status >= 500 || response.status === 429,
      );
    if (response.status === 204) return null;
    return boundedJson<T>(response);
  }
  async calendars(): Promise<CalendarChoice[]> {
    const result: CalendarChoice[] = [];
    let page = "";
    for (let i = 0; i < 30; i++) {
      const data = await this.request<{
        items?: {
          id: string;
          summary: string;
          primary?: boolean;
          accessRole: string;
        }[];
        nextPageToken?: string;
      }>(
        "/users/me/calendarList?maxResults=250" +
          (page ? "&pageToken=" + encodeURIComponent(page) : ""),
      );
      if (!data?.items) throw new AppError("google_incomplete", 503);
      result.push(
        ...data.items.map((c) => ({
          id: c.primary ? "primary" : c.id,
          name: c.summary,
          provider: "google" as const,
          writable: ["owner", "writer"].includes(c.accessRole),
        })),
      );
      if (!data.nextPageToken) return result;
      page = data.nextPageToken;
    }
    throw new AppError("google_incomplete", 503);
  }
  async busy(
    ids: string[],
    from: number,
    to: number,
    zone: string,
  ): Promise<Busy[]> {
    const calendars = await Promise.all(
      ids.map(async (id) => {
        const result: Busy[] = [];
        let page = "";
        for (let i = 0; i < 30; i++) {
          const query = new URLSearchParams({
            singleEvents: "true",
            timeMin: new Date(from).toISOString(),
            timeMax: new Date(to).toISOString(),
            maxResults: "2500",
            timeZone: zone,
            showDeleted: "false",
            fields:
              "nextPageToken,timeZone,items(id,status,transparency,start,end,attendees(self,responseStatus),extendedProperties/private)",
          });
          if (page) query.set("pageToken", page);
          const data = await this.request<{
            items?: GoogleEvent[];
            nextPageToken?: string;
            timeZone?: string;
          }>(`/calendars/${encodeURIComponent(id)}/events?${query}`);
          if (!data?.items) throw new AppError("google_incomplete", 503);
          for (const e of data.items) {
            if (
              e.status === "cancelled" ||
              e.transparency === "transparent" ||
              e.attendees?.some(
                (a) => a.self && a.responseStatus === "declined",
              )
            )
              continue;
            const instant = (v: GoogleEvent["start"]) =>
              v?.dateTime
                ? Date.parse(v.dateTime)
                : v?.date
                  ? Temporal.PlainDate.from(v.date).toZonedDateTime({
                      timeZone: v.timeZone || data.timeZone || zone,
                      plainTime: "00:00",
                    }).epochMilliseconds
                  : NaN;
            const start = instant(e.start),
              end = instant(e.end);
            if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
              throw new AppError("google_incomplete", 503);
            result.push({
              start,
              end,
              bookingId: e.extendedProperties?.private?.schedulerBooking,
            });
          }
          if (!data.nextPageToken) return result;
          page = data.nextPageToken;
        }
        throw new AppError("google_incomplete", 503);
      }),
    );
    return calendars.flat();
  }
  eventId(booking: Booking) {
    return "s" + booking.id.replaceAll("-", "");
  }
  async get(booking: Booking): Promise<GoogleEvent | null> {
    return this.request(
      `/calendars/primary/events/${this.eventId(booking)}`,
      {},
      true,
    );
  }
  async create(
    booking: Booking,
    owner: string,
  ): Promise<{ eventId: string; joinUrl?: string }> {
    let event = await this.get(booking);
    if (!event) {
      const body = {
        id: this.eventId(booking),
        summary: `${booking.typeName} · ${booking.name}`,
        description: calendarDescription(booking),
        start: {
          dateTime: new Date(booking.start).toISOString(),
          timeZone: booking.timezone,
        },
        end: {
          dateTime: new Date(booking.end).toISOString(),
          timeZone: booking.timezone,
        },
        attendees: [{ email: booking.email, displayName: booking.name }],
        location: booking.joinUrl || booking.location,
        guestsCanModify: false,
        guestsCanInviteOthers: false,
        extendedProperties: {
          private: { schedulerBooking: booking.id, schedulerOwner: owner },
        },
        ...(booking.mode === "meet"
          ? {
              conferenceData: {
                createRequest: {
                  requestId: booking.id,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              },
            }
          : {}),
      };
      event = await this.request(
        "/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1",
        { method: "POST", body: JSON.stringify(body) },
      );
    }
    if (
      !event ||
      event.status === "cancelled" ||
      event.extendedProperties?.private?.schedulerBooking !== booking.id ||
      event.extendedProperties?.private?.schedulerOwner !== owner
    )
      throw new AppError("calendar_event_mismatch", 503);
    if (booking.mode === "meet" && !event.hangoutLink) {
      if (
        event.conferenceData?.createRequest?.status?.statusCode === "failure"
      ) {
        // A failed conference request is final. A stable repair ID lets retries converge.
        await this.request(
          `/calendars/primary/events/${this.eventId(booking)}?sendUpdates=all&conferenceDataVersion=1`,
          {
            method: "PATCH",
            body: JSON.stringify({
              conferenceData: {
                createRequest: {
                  requestId: booking.id + "-repair-" + booking.revision,
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              },
            }),
          },
        );
        throw new AppError("conference_repair_pending", 503, true);
      }
      throw new AppError("conference_pending", 503, true);
    }
    return { eventId: event.id, joinUrl: event.hangoutLink || booking.joinUrl };
  }
  async reschedule(booking: Booking): Promise<void> {
    const event = await this.get(booking);
    if (
      !event ||
      event.status === "cancelled" ||
      event.extendedProperties?.private?.schedulerBooking !== booking.id
    )
      throw new AppError("calendar_event_mismatch", 503);
    const start = booking.targetStart!,
      end = booking.targetEnd!;
    if (
      Date.parse(event.start?.dateTime || "") === start &&
      Date.parse(event.end?.dateTime || "") === end
    )
      return;
    await this.request(
      `/calendars/primary/events/${this.eventId(booking)}?sendUpdates=all&conferenceDataVersion=1`,
      {
        method: "PATCH",
        body: JSON.stringify({
          start: {
            dateTime: new Date(start).toISOString(),
            timeZone: booking.timezone,
          },
          end: {
            dateTime: new Date(end).toISOString(),
            timeZone: booking.timezone,
          },
        }),
      },
    );
  }
  async cancel(booking: Booking) {
    await this.request(
      `/calendars/primary/events/${this.eventId(booking)}?sendUpdates=all`,
      { method: "DELETE" },
      true,
    );
  }
}
