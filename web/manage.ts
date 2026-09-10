import {
  api,
  app,
  t,
  esc,
  $,
  initShell,
  setBusy,
  focusHeading,
  summary,
  statusLabel,
  safeHttps,
  confirmAction,
  showError,
  errorText,
  prefix,
  bookingPath,
  dateLabel,
  type PublicBooking,
  type Config,
} from "./common";
import { LazySlotPicker as SlotPicker } from "./lazy-slots";

initShell();
const fragment = new URLSearchParams(location.hash.slice(1));
const id = fragment.get("id") || "";
const token = fragment.get("token") || "";
let booking: PublicBooking;
let config: Config;
let picker: SlotPicker | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let busy = false;
const pending = () =>
  ["pending", "cancelling", "rescheduling"].includes(booking.status);
async function read() {
  return (await api.request(`/bookings/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })) as { booking: PublicBooking };
}
function render() {
  picker?.destroy();
  picker = undefined;
  const editable =
    booking.status === "confirmed" && Date.now() < booking.cancelUntil;
  const heading =
    booking.status === "confirmed"
      ? t("You’re booked.", "Tu reserva está confirmada.")
      : booking.status === "cancelled"
        ? t("Booking cancelled.", "Reserva cancelada.")
        : booking.status === "failed"
          ? t(
              "This time is no longer available.",
              "Este horario ya no está disponible.",
            )
          : t("Getting your meeting ready.", "Preparando tu reunión.");
  const join = safeHttps(booking.joinUrl);
  app.innerHTML = `<section class="manage-wrap"><div class="status-symbol" aria-hidden="true">${booking.status === "confirmed" ? "✓" : booking.status === "cancelled" ? "−" : pending() ? "…" : "!"}</div><p class="eyebrow" role="status">${esc(statusLabel(booking.status))}</p><h1>${heading}</h1><p class="muted">${booking.status === "confirmed" ? t("Your invitation and meeting details will be sent to", "La invitación y los datos de la reunión se enviarán a") + " " + esc(booking.email) : booking.status === "cancelled" ? t("Your calendar invitation will be updated. Thanks for letting us know.", "La invitación de calendario se actualizará. Gracias por avisarnos.") : booking.status === "failed" ? t("Your booking was not confirmed. Please choose another available time.", "Tu reserva no se confirmó. Elige otro horario disponible.") : t("Keep this page open while the calendar confirms your meeting. You can also return using this private link.", "Mantén esta página abierta mientras el calendario confirma tu reunión. También puedes volver con este enlace privado.")}</p>${summary(booking)}${booking.status === "failed" ? `<p><a class="button primary full" href="${bookingPath}?type=${encodeURIComponent(booking.typeId)}">${t("Choose another time", "Elegir otro horario")}</a></p>` : ""}${join && booking.status === "confirmed" ? `<p><a class="button primary full" href="${esc(join)}" target="_blank" rel="noopener noreferrer">${t("Join video meeting", "Entrar a la videollamada")} ↗</a></p>` : ""}<div class="notice" role="status" data-progress ${pending() ? "" : "hidden"}>${t("Checking for confirmation…", "Esperando la confirmación…")}</div><div data-error></div>${editable ? `<p class="help-text">${t("You can make changes until", "Puedes hacer cambios hasta el")} ${esc(dateLabel(booking.cancelUntil, booking.timezone))} (${esc(booking.timezone)}).</p><div class="cluster"><button type="button" class="button" data-reschedule>${t("Reschedule", "Cambiar horario")}</button><button type="button" class="button danger" data-cancel>${t("Cancel booking", "Cancelar reserva")}</button></div>` : booking.status === "confirmed" ? `<p class="notice">${t("The self-service change deadline has passed. If you need a change, contact the organizer using your calendar invitation.", "El plazo para cambios en línea ha terminado. Si necesitas un cambio, contacta con la persona organizadora mediante la invitación de calendario.")}</p>` : ""}<div data-reschedule-panel></div><hr class="divider"><p class="help-text">${t("This is your private booking link. Save it to manage this meeting.", "Este es tu enlace privado. Guárdalo para administrar esta reunión.")}</p><a href="${bookingPath}">${t("Back to all meetings", "Volver a todas las reuniones")}</a></section>`;
  if (editable) {
    $("[data-cancel]", app).addEventListener("click", () => void cancel());
    $("[data-reschedule]", app).addEventListener(
      "click",
      () => void reschedule(),
    );
  }
  setBusy(false);
  if (pending()) schedulePoll();
}
function schedulePoll() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void poll(), 3000);
}
async function poll() {
  try {
    const result = await read();
    if (
      result.booking.status !== booking.status ||
      result.booking.start !== booking.start ||
      result.booking.joinUrl !== booking.joinUrl
    ) {
      booking = result.booking;
      render();
    } else if (pending()) schedulePoll();
  } catch (e) {
    const el = $("[data-progress]", app);
    if (el) {
      el.hidden = false;
      el.textContent = t(
        "We couldn’t check the latest status. We’ll try again shortly; keep this private link.",
        "No pudimos consultar el estado. Lo intentaremos de nuevo pronto; conserva este enlace privado.",
      );
    }
    schedulePoll();
  }
}
async function cancel() {
  if (busy) return;
  if (
    !(await confirmAction(
      t("Cancel this meeting?", "¿Cancelar esta reunión?"),
      t(
        "The invitation will be cancelled and the time will become available again.",
        "La invitación se cancelará y el horario volverá a estar disponible.",
      ),
      t("Cancel booking", "Cancelar reserva"),
    ))
  )
    return;
  busy = true;
  try {
    const result = (await api.request(
      `/bookings/${encodeURIComponent(id)}/cancel`,
      { method: "POST", body: { token } },
    )) as { booking: PublicBooking };
    booking = result.booking;
    render();
    focusHeading();
  } catch (e) {
    showError($("[data-error]", app), e);
  } finally {
    busy = false;
  }
}
async function reschedule() {
  if (busy) return;
  const panel = $("[data-reschedule-panel]", app);
  panel.innerHTML = `<hr class="divider"><h2>${t("Choose a new time", "Elige otro horario")}</h2><p class="help-text">${t("Your current time stays reserved until the new time is confirmed.", "Tu horario actual se mantiene reservado hasta que se confirme el nuevo.")}</p><div data-picker></div>`;
  try {
    config ||= (await api.request("/config")) as Config;
    picker?.destroy();
    picker = new SlotPicker($("[data-picker]", panel), {
      type: booking.typeId,
      location: booking.locationId,
      horizon: config.settings.horizonDays,
      timezone: booking.timezone,
      booking: id,
      token,
      onSelect: (iso) => void changeTime(iso),
    });
    $("[data-picker]", panel).scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  } catch (e) {
    showError(panel, e);
  }
}
async function changeTime(start: string) {
  if (busy) return;
  if (
    !(await confirmAction(
      t("Move your meeting?", "¿Cambiar el horario?"),
      dateLabel(start, booking.timezone),
      t("Confirm new time", "Confirmar nuevo horario"),
    ))
  )
    return;
  busy = true;
  try {
    const result = (await api.request(
      `/bookings/${encodeURIComponent(id)}/reschedule`,
      {
        method: "POST",
        body: { token, start, requestId: crypto.randomUUID() },
      },
    )) as { booking: PublicBooking };
    booking = result.booking;
    render();
    focusHeading();
  } catch (e) {
    showError($("[data-error]", app), e);
  } finally {
    busy = false;
  }
}
async function boot() {
  if (!id || !token) {
    app.innerHTML = `<section class="manage-wrap"><h1>${t("Your private booking link", "Tu enlace privado")}</h1><p>${t("Open the manage-booking link in your confirmation email to view, cancel, or reschedule your meeting.", "Abre el enlace de administración en tu correo de confirmación para ver, cancelar o cambiar tu reunión.")}</p><a href="${bookingPath}">${t("Book a meeting", "Reservar una reunión")}</a></section>`;
    setBusy(false);
    return;
  }
  try {
    const result = await read();
    booking = result.booking;
    render();
  } catch (e) {
    app.innerHTML = `<section class="manage-wrap"><h1>${t("We couldn’t open this booking.", "No pudimos abrir esta reserva.")}</h1><p class="notice error">${esc(errorText(e))}</p><button class="button" data-retry>${t("Try again", "Reintentar")}</button></section>`;
    $("[data-retry]", app).addEventListener("click", () => void boot());
    setBusy(false);
  }
}
addEventListener("pagehide", () => {
  if (timer) clearTimeout(timer);
  picker?.destroy();
});
void boot();
