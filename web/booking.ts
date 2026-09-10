import type { MeetingType } from "../worker/src/model";
import {
  api,
  app,
  t,
  esc,
  local,
  $,
  initShell,
  setBusy,
  focusHeading,
  icon,
  modeLabel,
  applyBrand,
  mountTurnstile,
  managementUrl,
  errorText,
  showError,
  currentZone,
  summary,
  prefix,
  safeHttps,
  syncLanguageLink,
  type Config,
  type PublicBooking,
} from "./common";
import { SlotPicker } from "./slots";

initShell();
let config: Config;
let selected: MeetingType | undefined;
let locationId = "";
let slot = "";
let timezone = currentZone();
let picker: SlotPicker | undefined;
let challenge: { reset: () => void; remove: () => void } | undefined;
let challengeToken = "";
let draft = { name: "", email: "", topic: "" };
let submissionId = "";
let submissionKey = "";
let submitting = false;

function release() {
  picker?.destroy();
  picker = undefined;
  challenge?.remove();
  challenge = undefined;
  challengeToken = "";
}
function updateUrl() {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({
    type: selected?.id || "",
    location: locationId,
    slot,
    timezone,
  })) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, "", url);
  syncLanguageLink();
}
function intro() {
  release();
  selected = undefined;
  const s = config.settings;
  const available = config.ready && s.enabled;
  app.innerHTML = `<section class="hero"><h1>${t("Meet with", "Reserva con")} ${esc(s.name)}.</h1><p class="intro">${esc(local(s.intro))}</p></section>${
    !available
      ? `<section class="panel"><h2>${t("Bookings will open soon", "Pronto podrás reservar")}</h2><p class="muted">${t("The calendar is taking a little pause. Please check back soon.", "La agenda está en pausa. Vuelve a consultar pronto.")}</p></section>`
      : `<section aria-labelledby="meeting-choices"><div class="section-heading"><h2 id="meeting-choices">${t("Choose a meeting", "Elige una reunión")}</h2></div><div class="choice-grid">${s.types
          .filter((type) => type.enabled)
          .map(
            (type) =>
              `<button class="choice-card" type="button" data-type="${esc(type.id)}"><span class="choice-icon">${icon(type.mode === "in-person" ? "pin" : "video")}</span><span><h3>${esc(local(type.name))}</h3><p>${esc(local(type.description))}</p></span><span class="choice-bottom"><span>${type.duration} ${t("min", "min")} · ${modeLabel(type.mode)}</span><span class="choice-arrow" aria-hidden="true">↗</span></span></button>`,
          )
          .join("")}</div></section>`
  }`;
  app.querySelectorAll<HTMLButtonElement>("[data-type]").forEach((button) =>
    button.addEventListener("click", () => {
      selected = s.types.find((type) => type.id === button.dataset.type)!;
      locationId = "";
      slot = "";
      const u = new URL(location.href);
      u.searchParams.set("type", selected.id);
      history.replaceState(null, "", u);
      renderSlots();
    }),
  );
  setBusy(false);
}
function sidebar() {
  const type = selected!;
  return `<aside class="booking-sidebar"><button class="button link-button back" data-back type="button">← ${t("All meetings", "Todas las reuniones")}</button><p class="eyebrow">${esc(config.settings.name)}</p><h1>${esc(local(type.name))}</h1><p class="muted">${esc(local(type.description))}</p><div class="detail-list"><div class="detail-item">${icon("clock")}<span>${type.duration} ${t("minutes", "minutos")}</span></div><div class="detail-item">${icon(type.mode === "in-person" ? "pin" : "video")}<span>${modeLabel(type.mode)}</span></div><div class="detail-item">${icon("calendar")}<span>${t("At least", "Al menos")} ${config.settings.noticeHours} ${t("hours ahead", "horas de antelación")}</span></div></div><p class="help-text">${t("You can cancel or reschedule until", "Puedes cancelar o cambiar el horario hasta")} ${config.settings.cancelHours} ${t("hours before your meeting.", "horas antes de la reunión.")}</p></aside>`;
}
function bindBack() {
  $("[data-back]", app).addEventListener("click", () => {
    selected = undefined;
    locationId = "";
    slot = "";
    updateUrl();
    intro();
    focusHeading();
  });
}
function renderSlots() {
  release();
  slot = "";
  updateUrl();
  const type = selected!;
  const places = config.settings.locations.filter(
    (l) => l.enabled && type.locationIds.includes(l.id),
  );
  app.innerHTML = `<div class="booking-layout">${sidebar()}<section class="booking-panel"><p class="step-label">${t("Step 1 of 2", "Paso 1 de 2")}</p><h2>${t("Find a time that works", "Encuentra tu momento")}</h2>${type.mode === "in-person" ? `<label class="field">${t("Where shall we meet?", "¿Dónde nos reunimos?")}<select data-location required><option value="">${t("Choose a location", "Elige un lugar")}</option>${places.map((l) => `<option value="${esc(l.id)}" ${locationId === l.id ? "selected" : ""}>${esc(local(l.name))}</option>`).join("")}</select></label><p class="help-text" data-address></p>` : ""}<div data-picker>${type.mode === "in-person" && !locationId ? `<div class="empty-state">${places.length ? t("Choose a place to see its available times.", "Elige un lugar para ver sus horarios disponibles.") : t("No in-person locations are available yet.", "Aún no hay lugares disponibles para reuniones presenciales.")}</div>` : ""}</div></section></div>`;
  bindBack();
  if (type.mode === "in-person")
    $<HTMLSelectElement>("[data-location]", app).addEventListener(
      "change",
      (e) => {
        locationId = (e.target as HTMLSelectElement).value;
        slot = "";
        renderSlots();
      },
    );
  if (type.mode !== "in-person" || locationId) {
    const l = places.find((p) => p.id === locationId);
    if (l) $("[data-address]", app).textContent = local(l.address);
    picker = new SlotPicker($("[data-picker]", app), {
      type: type.id,
      location: locationId,
      horizon: config.settings.horizonDays,
      timezone,
      onSelect: (iso, zone) => {
        slot = iso;
        timezone = zone;
        renderDetails();
        focusHeading("h2");
      },
    });
  }
  focusHeading();
}
function renderDetails() {
  release();
  updateUrl();
  const type = selected!;
  const place = config.settings.locations.find((l) => l.id === locationId);
  const view = {
    typeName: local(type.name),
    start: Date.parse(slot),
    end: Date.parse(slot) + type.duration * 60000,
    timezone,
    mode: type.mode,
    location: place ? `${local(place.name)} · ${local(place.address)}` : "",
  };
  app.innerHTML = `<div class="booking-layout">${sidebar()}<section class="booking-panel"><p class="step-label">${t("Step 2 of 2", "Paso 2 de 2")}</p><h2>${t("Make it a date", "Confirmemos la reunión")}</h2>${summary(view)}<button class="button link-button" type="button" data-change>${t("Choose a different time", "Elegir otro horario")}</button><form class="stack" data-details><label class="field">${t("Your name", "Tu nombre")}<input name="name" autocomplete="name" maxlength="100" required value="${esc(draft.name)}"></label><label class="field">${t("Email address", "Correo electrónico")}<input name="email" type="email" inputmode="email" autocomplete="email" maxlength="254" required value="${esc(draft.email)}"><small>${t("Your calendar invitation and booking details will arrive here.", "Aquí recibirás la invitación de calendario y los datos de la reserva.")}</small></label><label class="field">${t("Anything to share beforehand?", "¿Algo que quieras compartir antes?")} <span class="meta">${t("Optional", "Opcional")}</span><textarea name="topic" maxlength="2000">${esc(draft.topic)}</textarea></label><div class="turnstile" data-turnstile></div><div data-error></div><button class="button primary full" type="submit" data-submit disabled>${t("Confirm booking", "Confirmar reserva")}</button><p class="help-text">${t("Booking confirms automatically. Please check your email address before continuing.", "La reserva se confirma automáticamente. Comprueba tu dirección de correo antes de continuar.")}</p></form></section></div>`;
  bindBack();
  $("[data-change]", app).addEventListener("click", () => {
    readDraft();
    renderSlots();
  });
  const form = $<HTMLFormElement>("[data-details]", app);
  form.addEventListener("input", readDraft);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void submit();
  });
  void mountTurnstile(
    $("[data-turnstile]", app),
    config.turnstileSiteKey,
    "booking",
    (token) => {
      challengeToken = token;
      const button = $<HTMLButtonElement>("[data-submit]", app);
      if (button) button.disabled = !token || submitting;
    },
  ).then((value) => (challenge = value));
}
function readDraft() {
  const form = $<HTMLFormElement>("[data-details]", app);
  if (!form) return;
  const data = new FormData(form);
  draft = {
    name: String(data.get("name") || ""),
    email: String(data.get("email") || ""),
    topic: String(data.get("topic") || ""),
  };
}
async function submit() {
  if (submitting || !challengeToken) return;
  readDraft();
  const button = $<HTMLButtonElement>("[data-submit]", app);
  const error = $("[data-error]", app);
  const key = JSON.stringify({
    typeId: selected!.id,
    locationId,
    slot,
    timezone,
    ...draft,
  });
  if (key !== submissionKey) {
    submissionId = crypto.randomUUID();
    submissionKey = key;
  }
  submitting = true;
  button.disabled = true;
  button.textContent = t("Confirming your booking…", "Confirmando tu reserva…");
  error.textContent = "";
  try {
    const result = (await api.request("/bookings", {
      method: "POST",
      body: {
        requestId: submissionId,
        typeId: selected!.id,
        locationId,
        start: slot,
        ...draft,
        locale: document.documentElement.lang === "es" ? "es" : "en",
        timezone,
        turnstile: challengeToken,
      },
    })) as { booking: PublicBooking; token: string };
    if (!result.token || !result.booking?.id)
      throw new Error("Invalid response");
    location.assign(managementUrl(result.booking.id, result.token));
  } catch (e) {
    showError(error, e);
    challenge?.reset();
    button.textContent = t("Confirm booking", "Confirmar reserva");
  } finally {
    submitting = false;
    button.disabled = !challengeToken;
  }
}
async function boot() {
  try {
    config = (await api.request("/config")) as Config;
    applyBrand(config.settings);
    intro();
    const params = new URL(location.href).searchParams;
    const id = params.get("type");
    if (id && config.ready && config.settings.enabled) {
      selected = config.settings.types.find(
        (type) => type.enabled && type.id === id,
      );
      if (selected) {
        const place = params.get("location") || "";
        locationId = config.settings.locations.some(
          (l) =>
            l.enabled && l.id === place && selected!.locationIds.includes(l.id),
        )
          ? place
          : "";
        const zone = params.get("timezone") || timezone;
        try {
          new Intl.DateTimeFormat("en", { timeZone: zone });
          timezone = zone;
        } catch {}
        const chosen = params.get("slot") || "";
        slot = Number.isFinite(Date.parse(chosen))
          ? new Date(chosen).toISOString()
          : "";
        if (slot && (selected.mode !== "in-person" || locationId))
          renderDetails();
        else renderSlots();
      }
    }
  } catch (e) {
    app.innerHTML = `<section class="hero"><h1>${t("A little pause.", "Una pequeña pausa.")}</h1><p>${esc(errorText(e))}</p><button class="button" data-reload>${t("Try again", "Reintentar")}</button></section>`;
    $("[data-reload]", app).addEventListener("click", () => void boot());
    setBusy(false);
  }
}
void boot();
