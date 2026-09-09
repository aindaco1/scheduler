import { fetchWithTimeout } from "@dustwave/worker-core/provider-fetch";
import {
  ResendApiError,
  classifyResendFailure,
} from "@dustwave/worker-core/resend";
import { type Booking, type Settings } from "./model";

const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export interface Email {
  to: string;
  reply_to?: string;
  headers?: Record<string, string>;
  subject: string;
  text: string;
  html: string;
}
export function bookingEmail(
  booking: Booking,
  settings: Settings,
  origin: string,
  token: string,
  kind: "confirmed" | "cancelled" | "rescheduled" | "reminder",
): Email {
  const es = booking.locale === "es";
  const titles = {
    confirmed: es ? "Tu reunión está confirmada" : "Your meeting is confirmed",
    cancelled: es
      ? "Tu reunión se ha cancelado"
      : "Your meeting has been cancelled",
    rescheduled: es
      ? "Tu reunión se ha reprogramado"
      : "Your meeting has been rescheduled",
    reminder: es ? "Recordatorio de tu reunión" : "Your meeting reminder",
  };
  const date = new Intl.DateTimeFormat(es ? "es" : "en", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: booking.timezone,
  }).format(booking.start);
  const where = booking.joinUrl || booking.location;
  const manage =
    origin +
    (es ? "/es" : "") +
    "/manage/#id=" +
    booking.id +
    "&token=" +
    encodeURIComponent(token);
  const policy =
    kind === "cancelled"
      ? es
        ? "Esta reserva está cancelada. No tienes que hacer nada más."
        : "This booking is cancelled. No further action is needed."
      : es
        ? `Puedes cancelar o reprogramar hasta ${settings.cancelHours} horas antes.`
        : `You can cancel or reschedule until ${settings.cancelHours} hours beforehand.`;
  const context = es
    ? `Información de tu reserva con ${settings.name} en ${new URL(origin).hostname}.`
    : `Details for your booking with ${settings.name} at ${new URL(origin).hostname}.`;
  const text = [
    titles[kind],
    context,
    `${booking.typeName} · ${settings.name}`,
    `${date} (${booking.timezone})`,
    `${(booking.end - booking.start) / 60_000} min`,
    where,
    kind === "cancelled"
      ? ""
      : `${es ? "Gestionar reunión" : "Manage booking"}: ${manage}`,
    policy,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = `<!doctype html><html lang="${booking.locale}"><body style="margin:0;background:#f5f5f2;color:#252930;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:white;border:1px solid #d2d7df;border-radius:12px"><p>${escape(settings.name)}</p><h1 style="font-size:26px">${escape(titles[kind])}</h1><p>${escape(context)}</p><h2 style="font-size:19px">${escape(booking.typeName)}</h2><p>${escape(date)}<br>${escape(booking.timezone)}</p><p>${(booking.end - booking.start) / 60_000} min</p><p>${escape(where)}</p>${kind === "cancelled" ? "" : `<p><a href="${escape(manage)}" style="display:inline-block;background:#101215;color:white;padding:14px 20px;border-radius:8px">${es ? "Gestionar reunión" : "Manage booking"}</a></p>`}<p>${escape(policy)}</p></main></body></html>`;
  return {
    to: booking.email,
    subject: titles[kind] + " · " + settings.name,
    text,
    html,
  };
}
export function loginEmail(email: string, url: string): Email {
  return {
    to: email,
    subject: "Sign in to Scheduler · Iniciar sesión",
    text: `Sign in / Iniciar sesión:\n${url}\n\nThis link expires in 15 minutes and can be used once. / Este enlace vence en 15 minutos y solo puede usarse una vez.`,
    html: `<p><a href="${escape(url)}">Sign in to Scheduler / Iniciar sesión</a></p><p>This link expires in 15 minutes. / Este enlace vence en 15 minutos.</p>`,
  };
}
export async function sendEmail(
  email: Email,
  key: string,
  from: string,
  idempotencyKey: string,
) {
  const response = await fetchWithTimeout(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [email.to],
        subject: email.subject,
        text: email.text,
        html: email.html,
        ...(email.reply_to ? { reply_to: email.reply_to } : {}),
        ...(email.headers ? { headers: email.headers } : {}),
      }),
    },
    15_000,
  );
  if (!response.ok)
    throw new ResendApiError("Email delivery failed", {
      ...classifyResendFailure(response.status, {
        retryAfter: response.headers.get("Retry-After"),
      }),
    });
}
