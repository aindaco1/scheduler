import { fetchProvider } from "../provider-fetch";
import { AppError, type Booking, type ZoomConnection } from "../model";
import { boundedJson } from "../security";

export async function refreshZoom(
  connection: ZoomConnection,
  id: string,
  secret: string,
): Promise<ZoomConnection> {
  if (connection.expires > Date.now() + 120_000) return connection;
  const response = await fetchProvider(
    "https://zoom.us/oauth/token",
    {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(id + ":" + secret) },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: connection.refreshToken,
      }),
    },
    12_000,
  );
  if (!response.ok) throw new AppError("zoom_reconnect_required", 503);
  const token = await boundedJson<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>(response, 32_768);
  if (!token.access_token || !token.refresh_token)
    throw new AppError("zoom_reconnect_required", 503);
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expires: Date.now() + token.expires_in * 1000,
    accountId: connection.accountId,
  };
}
interface Meeting {
  id: number;
  join_url?: string;
  agenda?: string;
  start_time?: string;
}
export class ZoomMeetings {
  constructor(private token: string) {}
  private async request<T>(
    path: string,
    init: RequestInit = {},
    missing = false,
  ): Promise<T | null> {
    let response: Response;
    try {
      response = await fetchProvider(
        "https://api.zoom.us/v2" + path,
        {
          ...init,
          headers: {
            Authorization: "Bearer " + this.token,
            "Content-Type": "application/json",
          },
        },
        15_000,
      );
    } catch {
      throw new AppError("zoom_write_uncertain", 503, true);
    }
    if (missing && response.status === 404) return null;
    if (!response.ok)
      throw new AppError(
        init.method === "POST" &&
          response.status >= 400 &&
          response.status < 500
          ? "zoom_write_rejected"
          : response.status === 401
            ? "zoom_reconnect_required"
            : "zoom_unavailable",
        503,
        true,
      );
    return response.status === 204 ? null : boundedJson<T>(response);
  }
  async find(booking: Booking): Promise<Meeting | null> {
    if (booking.zoomId)
      return this.request(
        "/meetings/" + encodeURIComponent(booking.zoomId),
        {},
        true,
      );
    let page = "";
    for (let i = 0; i < 20; i++) {
      const data = await this.request<{
        meetings?: Meeting[];
        next_page_token?: string;
      }>(
        "/users/me/meetings?type=scheduled&page_size=300" +
          (page ? "&next_page_token=" + encodeURIComponent(page) : ""),
      );
      if (!data?.meetings) throw new AppError("zoom_incomplete", 503);
      const found = data.meetings.find((m) =>
        m.agenda?.includes(`Scheduler reference: ${booking.id}`),
      );
      if (found) return this.request("/meetings/" + found.id);
      if (!data.next_page_token) return null;
      page = data.next_page_token;
    }
    throw new AppError("zoom_incomplete", 503);
  }
  async create(booking: Booking): Promise<{ zoomId: string; joinUrl: string }> {
    const meeting = await this.request<Meeting>("/users/me/meetings", {
      method: "POST",
      body: JSON.stringify({
        topic: booking.typeName,
        type: 2,
        start_time: new Date(booking.start).toISOString(),
        duration: (booking.end - booking.start) / 60_000,
        timezone: booking.timezone,
        agenda: `Scheduler reference: ${booking.id}`,
        settings: {
          waiting_room: true,
          join_before_host: false,
          use_pmi: false,
          meeting_authentication: false,
        },
      }),
    });
    if (!meeting?.id || !meeting.join_url)
      throw new AppError("zoom_write_uncertain", 503, true);
    return { zoomId: String(meeting.id), joinUrl: meeting.join_url };
  }
  async reschedule(booking: Booking) {
    if (!booking.zoomId) throw new AppError("zoom_event_missing", 503);
    await this.request("/meetings/" + booking.zoomId, {
      method: "PATCH",
      body: JSON.stringify({
        start_time: new Date(booking.targetStart!).toISOString(),
        duration: (booking.targetEnd! - booking.targetStart!) / 60_000,
        timezone: booking.timezone,
      }),
    });
  }
  async cancel(booking: Booking) {
    if (booking.zoomId)
      await this.request(
        "/meetings/" + booking.zoomId,
        { method: "DELETE" },
        true,
      );
  }
}
