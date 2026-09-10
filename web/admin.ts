import { streetAddress } from "../worker/src/text";
import { meetingUrl } from "../worker/src/meeting-links";
import { defaultMeetingGap } from "../worker/src/gap-policy";
import { Temporal } from "@js-temporal/polyfill";
import { mountAccessibleTabs } from "@dustwave/admin-shell/tabs";
import { setDirtyButtonState } from "@dustwave/admin-shell/dirty-controls";
import { mountUnsavedChangesGuard } from "@dustwave/admin-shell/unsaved-changes";
import type { Settings, Weekly, CalendarChoice } from "../worker/src/model";
import { mergeSettings } from "./settings-merge";
import {
  LOGO_MAX_BYTES,
  LOGO_MAX_DIMENSION,
  LOGO_RECOMMENDED_DIMENSION,
  LOGO_TYPES,
} from "../worker/src/logo-policy";
import {
  api,
  app,
  t,
  esc,
  local,
  $,
  $$,
  initShell,
  setBusy,
  mountTurnstile,
  showError,
  errorText,
  prefix,
  bookingPath,
  timezoneOptions,
  currentZone,
  dateLabel,
  statusLabel,
  confirmAction,
  safeHttps,
  applyBrand,
  syncLanguageLink,
  type Config,
  type PublicBooking,
} from "./common";

interface Connections {
  google: { connected: boolean; email?: string };
  icloud: { connected: boolean };
  zoom: { connected: boolean };
  calendars: CalendarChoice[];
  ready: boolean;
  issues: string[];
}
let settings: Settings;
let baseline = "";
let revision = 0;
let connections: Connections;
let bookings: PublicBooking[] = [];
let config: Config;
let saving = false;
let logoUploading = false;
let logoPreview: { url: string; data: string } | undefined;
let selectedTab: string | undefined;
let tabs: ReturnType<typeof mountAccessibleTabs>;
let token = "";
let challenge: { reset: () => void; remove: () => void } | undefined;
initShell();
const guard = mountUnsavedChangesGuard({
  hasUnsavedChanges: () =>
    logoUploading ||
    (Boolean(settings) && JSON.stringify(settings) !== baseline),
});
const days = [
  t("Sunday", "Domingo"),
  t("Monday", "Lunes"),
  t("Tuesday", "Martes"),
  t("Wednesday", "Miércoles"),
  t("Thursday", "Jueves"),
  t("Friday", "Viernes"),
  t("Saturday", "Sábado"),
];
function get(path: string): unknown {
  return path.split(".").reduce((obj: any, key) => obj?.[key], settings);
}
function put(path: string, value: unknown) {
  const keys = path.split(".");
  const last = keys.pop()!;
  const target = keys.reduce((obj: any, key) => obj[key], settings);
  target[last] = value;
}
function field(
  path: string,
  label: string,
  options: {
    type?: string;
    min?: number;
    max?: number;
    help?: string;
    required?: boolean;
    value?: string;
  } = {},
) {
  const type = options.type || "text";
  return `<label class="field">${esc(label)}<input data-setting="${esc(path)}" type="${type}" value="${esc(options.value ?? get(path))}" ${options.min !== undefined ? `min="${options.min}"` : ""} ${options.max !== undefined ? `max="${options.max}"` : ""} ${options.required ? "required" : ""} ${type === "number" ? 'step="1"' : ""}>${options.help ? `<small>${esc(options.help)}</small>` : ""}</label>`;
}
function check(path: string, label: string) {
  return `<label class="check"><input type="checkbox" data-setting="${esc(path)}" ${get(path) ? "checked" : ""}><span>${esc(label)}</span></label>`;
}
function activeToggle(path: string, describedBy: string) {
  return `<label class="active-toggle"><span>${t("Active", "Activo")}</span><input class="sr-only" type="checkbox" role="switch" data-setting="${esc(path)}" aria-describedby="${esc(describedBy)}" ${get(path) ? "checked" : ""}><span class="switch-track" aria-hidden="true"></span></label>`;
}
function bilingual(path: string, label: string, long = false) {
  return `<div class="form-grid bilingual-fields ${settings.spanishEnabled ? "" : "single-language"}">${(["en", "es"] as const).map((lang) => `<label class="field" data-content-language="${lang}" ${lang === "es" && !settings.spanishEnabled ? "hidden" : ""}>${esc(label)} · ${lang === "en" ? "English" : "Español"}${long ? `<textarea data-setting="${path}.${lang}" maxlength="2000">${esc(get(path + "." + lang))}</textarea>` : `<input data-setting="${path}.${lang}" maxlength="2000" value="${esc(get(path + "." + lang))}">`}</label>`).join("")}</div>`;
}
function hours(path: string, rows: Weekly[], label: string) {
  return `<div class="rows" role="group" aria-label="${esc(label)}">${rows.map((row, index) => `<div class="hours-row"><label class="field">${t("Day", "Día")}<select data-setting="${path}.${index}.day" data-number>${days.map((day, i) => `<option value="${i}" ${row.day === i ? "selected" : ""}>${day}</option>`).join("")}</select></label>${field(`${path}.${index}.start`, t("From", "Desde"), { type: "time", required: true })}<label class="field">${t("Until", "Hasta")}<input type="time" data-setting="${path}.${index}.end" data-end-of-day value="${esc(row.end === "24:00" ? "00:00" : row.end)}" required></label><button class="button" type="button" data-remove="${path}" data-index="${index}" aria-label="${t("Remove hours", "Eliminar horario")} ${index + 1}">×</button></div>`).join("")}</div><button class="button" type="button" data-add-hours="${path}">+ ${t("Add time range", "Añadir franja horaria")}</button>`;
}
function localInput(instant: string | number, zone = currentZone()) {
  return Temporal.Instant.fromEpochMilliseconds(new Date(instant).getTime())
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
function dirty() {
  const changed = JSON.stringify(settings) !== baseline;
  const saveBar = $(".save-bar", app);
  saveBar.hidden = selectedTab === "bookings" && !changed;
  saveBar.classList.toggle("save-bar-inline", selectedTab === "bookings");
  saveBar.classList.toggle(
    "has-pending-changes",
    changed || saving || logoUploading,
  );
  setDirtyButtonState(
    $("[data-save]", app),
    changed,
    t("All changes saved", "Cambios guardados"),
    t("Save changes", "Guardar cambios"),
    { forceDisabled: saving || logoUploading },
  );
  $$<HTMLInputElement | HTMLButtonElement>(
    "[data-logo-file], [data-remove-logo]",
    app,
  ).forEach((input) => (input.disabled = saving || logoUploading));
  syncShareButtons();
  $("[data-save-state]", app).textContent = changed
    ? t("You have unsaved changes.", "Tienes cambios sin guardar.")
    : t("Your schedule is up to date.", "Tu agenda está al día.");
}
function render() {
  const labels = {
    bookings: t("Bookings", "Reservas"),
    availability: t("Availability", "Disponibilidad"),
    types: t("Meeting types", "Tipos de reunión"),
    settings: t("Settings", "Configuración"),
  };
  app.innerHTML = `<div class="admin-hero between"><div><h1>${t("Your schedule", "Tu agenda")}</h1><span class="status-pill ${settings.enabled ? "good" : ""}">${settings.enabled ? t("Bookings open", "Reservas abiertas") : t("Bookings paused", "Reservas en pausa")}</span></div><div class="cluster"><a class="button" href="${bookingPath}" target="_blank" rel="noopener">${t("View booking page", "Ver página de reservas")} ↗</a><button class="button" type="button" data-logout>${t("Sign out", "Cerrar sesión")}</button></div></div><div data-global-error></div><div id="admin-tabs"><div class="admin-tabs" role="tablist" aria-label="${t("Dashboard sections", "Secciones del panel")}">${Object.entries(
    labels,
  )
    .map(
      ([key, label]) =>
        `<button type="button" role="tab" id="tab-${key}" aria-controls="panel-${key}" data-tab="${key}" aria-selected="false" tabindex="-1">${label}</button>`,
    )
    .join("")}</div>${Object.keys(labels)
    .map(
      (key) =>
        `<section role="tabpanel" tabindex="0" id="panel-${key}" aria-labelledby="tab-${key}" hidden></section>`,
    )
    .join(
      "",
    )}</div><div class="save-bar"><span class="save-state" data-save-state></span><button type="button" class="button primary" data-save>${t("Save changes", "Guardar cambios")}</button></div>`;
  $("[data-logout]", app).addEventListener("click", () => void logout());
  $("[data-save]", app).addEventListener("click", () => void save());
  renderBookings();
  renderAvailability();
  renderTypes();
  renderSettings();
  tabs = mountAccessibleTabs($("#admin-tabs", app), {
    initialTab: selectedTab,
    storageKey: "scheduler:admin-tab",
    storage: {
      getItem(key) {
        try {
          return sessionStorage.getItem(key);
        } catch {
          return null;
        }
      },
      setItem(key, value) {
        try {
          sessionStorage.setItem(key, value);
        } catch {
          // Tab navigation still works when browser storage is unavailable.
        }
      },
    },
    responsiveSelect: {
      label: t("Dashboard section", "Sección del panel"),
      wrapperClass: "mobile-tabs field",
      labelClass: "",
      selectClass: "field-control",
    },
    onSelect: (name: string) => {
      const returningToBookings =
        name === "bookings" &&
        selectedTab !== undefined &&
        selectedTab !== name;
      selectedTab = name;
      dirty();
      if (returningToBookings) void refreshBookings();
    },
  });
  // Handle each edit once. A blur/change event can otherwise replay an old
  // gap value while switching meeting mode rebuilds the gap field.
  app.oninput = onSetting;
  bindCollections();
  dirty();
  setBusy(false);
}
function onSetting(event: Event) {
  const el = event.target as
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (!el.dataset.setting) return;
  let value: unknown =
    el instanceof HTMLInputElement && el.type === "checkbox"
      ? el.checked
      : el.value;
  if (
    el.dataset.number !== undefined ||
    (el instanceof HTMLInputElement && el.type === "number")
  )
    value = Number(el.value);
  if (el.dataset.datetime !== undefined) {
    let time = NaN;
    try {
      time = Temporal.PlainDateTime.from(el.value).toZonedDateTime(
        settings.timezone,
      ).epochMilliseconds;
    } catch {}
    const valid =
      Number.isFinite(time) && localInput(time, settings.timezone) === el.value;
    el.setCustomValidity(
      valid
        ? ""
        : t(
            "This local time does not exist. Choose another time.",
            "Este horario local no existe. Elige otro horario.",
          ),
    );
    if (!valid) return;
    value = new Date(time).toISOString();
  }
  // A time picker represents midnight as 00:00; an end belongs to the selected day's end.
  if (el.dataset.endOfDay !== undefined && value === "00:00") value = "24:00";
  const gapField = el.dataset.setting.match(/^types\.(\d+)\.gap$/);
  if (
    gapField &&
    value ===
      defaultMeetingGap(settings, settings.types[Number(gapField[1])].mode)
  )
    value = null;
  if (/^locations\.\d+\.address$/.test(el.dataset.setting))
    value = { en: el.value, es: el.value };
  put(el.dataset.setting, value);
  if (el.dataset.setting === "spanishEnabled") syncContentLanguages();
  if (
    el.dataset.setting.startsWith("defaultGaps.") ||
    /^types\.\d+\.mode$/.test(el.dataset.setting)
  )
    syncGapEditors();
  if (el.dataset.setting.startsWith("reminderHours.")) validateReminderFields();
  if (el.dataset.setting === "timezone") {
    rerenderEditor();
    $<HTMLSelectElement>('[data-setting="timezone"]', app).focus();
    return;
  }
  dirty();
}
function rerenderEditor() {
  render();
}
function bindCollections() {
  $$<HTMLButtonElement>("[data-add-hours]", app).forEach((button) =>
    button.addEventListener("click", () => {
      (get(button.dataset.addHours!) as Weekly[]).push({
        day: 1,
        start: "09:00",
        end: "17:00",
      });
      rerenderEditor();
    }),
  );
  $$<HTMLButtonElement>("[data-remove]", app).forEach((button) =>
    button.addEventListener("click", async () => {
      const path = button.dataset.remove!;
      const index = Number(button.dataset.index);
      if (path === "types" && settings.types.length === 1) {
        showError(
          $("[data-global-error]", app),
          new Error("Keep one meeting type"),
        );
        return;
      }
      if (path === "locations") {
        const item = settings.locations[index];
        if (
          !(await confirmAction(
            t("Remove this location?", "¿Eliminar este lugar?"),
            t(
              "It will also be removed from all meeting types.",
              "También se eliminará de todos los tipos de reunión.",
            ),
            t("Remove location", "Eliminar lugar"),
          ))
        )
          return;
        settings.types.forEach(
          (type) =>
            (type.locationIds = type.locationIds.filter(
              (id) => id !== item.id,
            )),
        );
      }
      (get(path) as unknown[]).splice(index, 1);
      rerenderEditor();
    }),
  );
}
function blackoutScope(
  scope: Settings["blackouts"][number]["scope"],
  path?: string,
) {
  return `<label class="field">${t("Block", "Bloquear")}<select ${path ? `data-setting="${esc(path)}"` : "data-whole-scope"}><option value="all" ${scope !== "in-person" ? "selected" : ""}>${t("All meetings", "Todas las reuniones")}</option><option value="in-person" ${scope === "in-person" ? "selected" : ""}>${t("In-person only", "Solo presenciales")}</option></select></label>`;
}
function renderAvailability() {
  $("#panel-availability", app).innerHTML =
    `<div class="admin-layout"><section class="panel"><h2>${t("Working hours", "Horario habitual")}</h2><p>${t("Meetings must fit completely within these hours. Split overnight hours across two days.", "Las reuniones deben caber por completo en estas franjas. Divide los horarios nocturnos en dos días.")}</p><label class="field">${t("Schedule time zone", "Zona horaria de la agenda")}<select data-setting="timezone">${timezoneOptions(settings.timezone)}</select></label>${hours("hours", settings.hours, t("Weekly working hours", "Horario semanal"))}</section><section class="panel"><h2>${t("Recurring blackouts", "Bloqueos recurrentes")}</h2><p>${t("Protect lunch, school runs, or any repeating time away. These override working hours.", "Protege la hora de comer, los trayectos al colegio o cualquier ausencia recurrente. Estos bloqueos tienen prioridad sobre el horario habitual.")}</p>${hours("recurringBlackouts", settings.recurringBlackouts, t("Recurring blackouts", "Bloqueos recurrentes"))}</section><section class="panel"><h2>${t("Temporary blackouts", "Bloqueos temporales")}</h2><p>${t("Block whole days or an exact period. These times are shown in", "Bloquea días completos o un periodo exacto. Estos horarios se muestran en")} <strong>${esc(settings.timezone)}</strong>.</p><div class="rows">${settings.blackouts.map((b, i) => `<div class="blackout-row">${field(`blackouts.${i}.label`, t("Label", "Nombre"))}${blackoutScope(b.scope, `blackouts.${i}.scope`)}<label class="field">${t("Starts", "Comienza")}<input type="datetime-local" data-setting="blackouts.${i}.start" data-datetime value="${localInput(b.start, settings.timezone)}" required></label><label class="field">${t("Ends", "Termina")}<input type="datetime-local" data-setting="blackouts.${i}.end" data-datetime value="${localInput(b.end, settings.timezone)}" required></label><button type="button" class="button" data-remove="blackouts" data-index="${i}" aria-label="${t("Remove blackout", "Eliminar bloqueo")} ${i + 1}">×</button></div>`).join("")}</div><div class="blackout-actions"><div class="cluster"><button class="button" type="button" data-add-blackout>+ ${t("Add period", "Añadir periodo")}</button></div><div class="blackout-day-actions" role="group" aria-labelledby="whole-days-heading" aria-describedby="whole-days-help"><h3 id="whole-days-heading">${t("Whole days", "Días completos")}</h3><p class="help-text" id="whole-days-help">${t("Both dates are included. Use the same date to block one day.", "Se incluyen ambas fechas. Usa la misma fecha para bloquear un solo día.")}</p><div class="cluster"><label class="field">${t("From date", "Desde el día")}<input type="date" data-whole-date required></label><label class="field">${t("Through date", "Hasta el día")}<input type="date" data-whole-end required></label>${blackoutScope("all")}<button class="button" type="button" data-add-day>+ ${t("Block dates", "Bloquear fechas")}</button></div></div></div></section></div>`;
  $("[data-add-blackout]", app).addEventListener("click", () => {
    const now = new Date();
    now.setMinutes(0, 0, 0);
    settings.blackouts.push({
      id: `away-${crypto.randomUUID().slice(0, 8)}`,
      label: "",
      start: now.toISOString(),
      end: new Date(now.getTime() + 3600000).toISOString(),
    });
    rerenderEditor();
  });
  const fromDate = $<HTMLInputElement>("[data-whole-date]", app);
  const throughDate = $<HTMLInputElement>("[data-whole-end]", app);
  let previousFromDate = "";
  fromDate.addEventListener("input", () => {
    throughDate.min = fromDate.value;
    if (!throughDate.value || throughDate.value === previousFromDate)
      throughDate.value = fromDate.value;
    previousFromDate = fromDate.value;
    throughDate.setCustomValidity("");
  });
  throughDate.addEventListener("input", () =>
    throughDate.setCustomValidity(""),
  );
  $("[data-add-day]", app).addEventListener("click", () => {
    throughDate.setCustomValidity(
      throughDate.value && fromDate.value && throughDate.value < fromDate.value
        ? t(
            "The end date must be on or after the start date.",
            "La fecha final debe ser igual o posterior a la fecha inicial.",
          )
        : "",
    );
    if (!fromDate.reportValidity() || !throughDate.reportValidity()) return;
    const scope = $<HTMLSelectElement>("[data-whole-scope]", app).value as
      "all" | "in-person";
    const start = Temporal.PlainDate.from(fromDate.value)
      .toZonedDateTime(settings.timezone)
      .toInstant();
    const end = Temporal.PlainDate.from(throughDate.value)
      .add({ days: 1 })
      .toZonedDateTime(settings.timezone)
      .toInstant();
    settings.blackouts.push({
      id: `away-${crypto.randomUUID().slice(0, 8)}`,
      label:
        scope === "in-person"
          ? t("In-person unavailable", "Sin reuniones presenciales")
          : fromDate.value === throughDate.value
            ? t("Day off", "Día libre")
            : t("Days off", "Días libres"),
      scope,
      start: start.toString(),
      end: end.toString(),
    });
    rerenderEditor();
  });
}
function gapEditor(index: number) {
  const type = settings.types[index],
    gap = defaultMeetingGap(settings, type.mode);
  return `<div class="form-grid gap-editor"><label class="field">${t("Gap (minutes)", "Intervalo (minutos)")}<input type="number" min="0" max="240" step="1" required data-setting="types.${index}.gap" value="${type.gap ?? gap}"><small>${t("Default:", "Predeterminado:")} ${gap} min</small></label></div>`;
}
function syncGapEditors() {
  $$<HTMLElement>("[data-gap-editor]", app).forEach((target) => {
    target.innerHTML = gapEditor(Number(target.dataset.gapEditor));
  });
}
function syncContentLanguages() {
  $$(".bilingual-fields", app).forEach((node) =>
    node.classList.toggle("single-language", !settings.spanishEnabled),
  );
  $$<HTMLElement>('[data-content-language="es"]', app).forEach((node) => {
    node.hidden = !settings.spanishEnabled;
  });
}
function meetingShareControl(id: string) {
  return `<div class="meeting-share stack" data-meeting-share><button class="button" type="button" data-copy-meeting="${esc(id)}">${t("Copy link", "Copiar enlace")}</button><span class="help-text" role="status" data-share-status></span><label class="field" hidden>${t("Meeting link", "Enlace de la reunión")}<input readonly data-share-url></label></div>`;
}
function syncShareButtons() {
  if (!baseline) return;
  const saved = JSON.parse(baseline) as Settings;
  $$<HTMLButtonElement>("[data-copy-meeting]", app).forEach((button) => {
    const id = button.dataset.copyMeeting;
    const active =
      saved.types.some((type) => type.id === id && type.enabled) &&
      settings.types.some((type) => type.id === id && type.enabled);
    button.disabled = !active || saving;
    const root = button.closest<HTMLElement>("[data-meeting-share]")!;
    const status = $("[data-share-status]", root);
    if (!active) {
      status.textContent = t(
        "Save and activate this meeting to share it.",
        "Guarda y activa esta reunión para compartirla.",
      );
      $<HTMLInputElement>("[data-share-url]", root).parentElement!.hidden =
        true;
    } else if (button.dataset.active !== "true") {
      status.textContent = t(
        "Links use your saved settings.",
        "Los enlaces usan la configuración guardada.",
      );
    }
    button.dataset.active = String(active);
  });
}
function renderTypes() {
  $("#panel-types", app).innerHTML =
    `<div class="admin-layout"><section class="panel"><div class="between"><h2>${t("Meeting types", "Tipos de reunión")}</h2><button class="button" type="button" data-add-type>+ ${t("New type", "Nuevo tipo")}</button></div><p>${t("Keep each invitation clear: a duration, a purpose, and a place to connect.", "Cada invitación debe ser clara: una duración, un propósito y un lugar para conectar.")}</p>${settings.types.map((type, i) => `<div class="editor-card">${activeToggle(`types.${i}.enabled`, `type-heading-${i}`)}<details ${i === 0 ? "open" : ""}><summary id="type-heading-${i}">${esc(local(type.name) || t("New meeting", "Nueva reunión"))} <span class="duration-label">· ${type.duration} min</span></summary><div class="stack">${bilingual(`types.${i}.name`, t("Name", "Nombre"))}${bilingual(`types.${i}.description`, t("Description", "Descripción"), true)}<div class="form-grid">${field(`types.${i}.duration`, t("Duration (minutes)", "Duración (minutos)"), { type: "number", min: 5, max: 240 })}<label class="field">${t("Meeting service", "Modalidad de reunión")}<select data-setting="types.${i}.mode"><option value="meet" ${type.mode === "meet" ? "selected" : ""}>Google Meet</option><option value="zoom" ${type.mode === "zoom" ? "selected" : ""}>Zoom</option><option value="in-person" ${type.mode === "in-person" ? "selected" : ""}>${t("In person", "Presencial")}</option></select></label></div><div data-gap-editor="${i}">${gapEditor(i)}</div><fieldset><legend>${t("Allowed in-person locations", "Lugares presenciales permitidos")}</legend>${settings.locations.length ? settings.locations.map((l) => `<label class="check"><input type="checkbox" data-type-location="${i}" value="${esc(l.id)}" ${type.locationIds.includes(l.id) ? "checked" : ""}>${esc(local(l.name))}</label>`).join("") : `<p class="help-text">${t("Add locations below to offer in-person meetings.", "Añade lugares a continuación para ofrecer reuniones presenciales.")}</p>`}</fieldset><div class="between"><small>${t("Link ID", "ID del enlace")}: ${esc(type.id)}</small><button class="button danger" type="button" data-remove="types" data-index="${i}" ${settings.types.length === 1 ? "disabled" : ""}>${t("Remove type", "Eliminar tipo")}</button></div></div></details>${meetingShareControl(type.id)}</div>`).join("")}</section><section class="panel"><div class="between"><h2>${t("In-person locations", "Lugares presenciales")}</h2><button class="button" type="button" data-add-location>+ ${t("New location", "Nuevo lugar")}</button></div><p>${t("Each location has its own hours, inside your overall working hours. All hours use your schedule time zone.", "Cada lugar tiene su propio horario, dentro de tu horario general. Todos usan la zona horaria de tu agenda.")}</p>${settings.locations.map((l, i) => `<div class="editor-card">${activeToggle(`locations.${i}.enabled`, `location-heading-${i}`)}<details open><summary id="location-heading-${i}">${esc(local(l.name) || t("New location", "Nuevo lugar"))}</summary><div class="stack">${bilingual(`locations.${i}.name`, t("Location name", "Nombre del lugar"))}${field(`locations.${i}.address`, t("Full street address", "Dirección postal completa"), { value: streetAddress(l.address) })}<p class="help-text">${t("Include street, city, state or region, postal code and country. This goes in the calendar invitation’s Location field.", "Incluye calle, ciudad, estado o región, código postal y país. Se incluirá en el campo Ubicación de la invitación.")}</p>${bilingual(`locations.${i}.instructions`, t("Arrival instructions (optional)", "Instrucciones de llegada (opcionales)"), true)}<p class="help-text">${t("Entry, parking or other details for your guest. Included in the invitation and booking emails; not shown on the public booking page.", "Acceso, estacionamiento u otros detalles para tu invitado. Se incluyen en la invitación y los correos de reserva; no aparecen en la página pública.")}</p>${hours(`locations.${i}.hours`, l.hours, t("Location hours", "Horario del lugar"))}<button class="button danger" type="button" data-remove="locations" data-index="${i}">${t("Remove location", "Eliminar lugar")}</button></div></details></div>`).join("")}</section></div>`;
  $$<HTMLButtonElement>("[data-copy-meeting]", app).forEach((button) => {
    button.addEventListener("click", async () => {
      const root = button.closest<HTMLElement>("[data-meeting-share]")!;
      const id = button.dataset.copyMeeting!;
      const saved = JSON.parse(baseline) as Settings;
      if (!saved.types.some((type) => type.id === id && type.enabled)) return;
      const path = saved.spanishEnabled
        ? bookingPath
        : bookingPath.replace(/^\/es\//, "/");
      const url = meetingUrl(location.origin, path, id);
      const status = $("[data-share-status]", root);
      const fallback = $<HTMLInputElement>("[data-share-url]", root);
      try {
        await navigator.clipboard.writeText(url);
        status.textContent = t("Link copied.", "Enlace copiado.");
        fallback.parentElement!.hidden = true;
      } catch {
        fallback.value = url;
        fallback.parentElement!.hidden = false;
        fallback.focus();
        fallback.select();
        status.textContent = t(
          "Copy the selected link.",
          "Copia el enlace seleccionado.",
        );
      }
    });
  });
  syncShareButtons();
  $("[data-add-type]", app).addEventListener("click", () => {
    settings.types.push({
      id: `meeting-${crypto.randomUUID().slice(0, 8)}`,
      name: { en: "New meeting", es: "Nueva reunión" },
      description: { en: "", es: "" },
      duration: 30,
      gap: null,
      mode: "meet",
      enabled: false,
      locationIds: [],
    });
    rerenderEditor();
  });
  $("[data-add-location]", app).addEventListener("click", () => {
    settings.locations.push({
      id: `place-${crypto.randomUUID().slice(0, 8)}`,
      name: { en: "New location", es: "Nuevo lugar" },
      address: { en: "", es: "" },
      instructions: { en: "", es: "" },
      hours: structuredClone(settings.hours),
      enabled: false,
    });
    rerenderEditor();
  });
  $$<HTMLInputElement>("[data-type-location]", app).forEach((input) =>
    input.addEventListener("change", () => {
      const type = settings.types[Number(input.dataset.typeLocation)];
      type.locationIds = input.checked
        ? [...new Set([...type.locationIds, input.value])]
        : type.locationIds.filter((id) => id !== input.value);
      dirty();
    }),
  );
}
function renderSettings() {
  $("#panel-settings", app).innerHTML =
    `<div class="admin-layout"><section class="panel" data-booking-page><div class="booking-page-heading"><h2>${t("Your booking page", "Tu página de reservas")}</h2>${activeToggle("enabled", "booking-active-help")}</div><div class="stack"><p class="help-text" id="booking-active-help">${t("Turn off to pause new bookings. Existing meetings stay on the calendar and can still be managed. Save changes to apply.", "Desactiva para pausar nuevas reservas. Las reuniones existentes siguen en el calendario y se pueden gestionar. Guarda los cambios para aplicar.")}</p>${field("name", t("Display name", "Nombre público"), { required: true })}${field("brand.name", t("Brand name", "Nombre de marca"), { help: t("Leave empty to show only Scheduler. A logo image replaces the header text.", "Déjalo vacío para mostrar solo Scheduler. La imagen del logotipo reemplaza el texto del encabezado.") })}${bilingual("intro", t("Short introduction", "Introducción breve"), true)}<div data-logo-editor></div><label class="field">${t("Primary color", "Color principal")}<div class="color-field"><input type="color" value="${esc(settings.brand.primary)}" data-setting="brand.primary"><span class="help-text">${t("Used for actions in light mode. Text contrast is adjusted automatically.", "Se usa en las acciones del modo claro. El contraste del texto se ajusta automáticamente.")}</span></div></label>${check("spanishEnabled", t("Offer Spanish", "Ofrecer español"))}<p class="help-text">${t("Show Spanish on your site and in content editors. Turning it off keeps your translations for later.", "Muestra español en tu sitio y en los campos de contenido. Al desactivarlo, se conservan las traducciones.")}</p></div></section><section class="panel" data-booking-rules><h2>${t("Booking boundaries", "Límites de reserva")}</h2><div class="form-grid">${field("noticeHours", t("Minimum notice (hours)", "Antelación mínima (horas)"), { type: "number", min: 0, max: 720 })}${field("horizonDays", t("Booking window (days)", "Plazo de reserva (días)"), { type: "number", min: 1, max: 180 })}${field("cancelHours", t("Change deadline (hours before)", "Plazo para cambios (horas antes)"), { type: "number", min: 0, max: 720 })}${field("dailyLimit", t("Maximum meetings per day", "Máximo de reuniones al día"), { type: "number", min: 0, max: 100, help: t("0 means no daily limit.", "0 significa sin límite diario.") })}</div><h3>${t("Gap between meetings", "Intervalo entre reuniones")}</h3><p class="help-text">${t("Default space before and after meetings, including busy calendar events. Adjust individual meetings in Meeting types.", "Intervalos predeterminados antes y después de las reuniones, incluidos los eventos ocupados. Personaliza cada reunión en Tipos de reunión.")}</p><div class="form-grid">${field("defaultGaps.video", t("Video default (minutes)", "Predeterminado para video (minutos)"), { type: "number", min: 0, max: 240 })}${field("defaultGaps.inPerson", t("In-person default (minutes)", "Predeterminado presencial (minutos)"), { type: "number", min: 0, max: 240 })}</div></section><section class="panel" data-reminder-settings><h2>${t("Reminders", "Recordatorios")}</h2><p>${t("Up to three email reminders for new or rescheduled meetings. Remove all reminders to turn them off.", "Hasta tres recordatorios por correo para reuniones nuevas o reprogramadas. Elimina todos para desactivarlos.")}</p><div class="rows">${settings.reminderHours.map((hours, i) => `<div class="reminder-row">${field(`reminderHours.${i}`, `${t("Reminder", "Recordatorio")} ${i + 1} ${t("(hours before)", "(horas antes)")}`, { type: "number", min: 1, max: 168, required: true })}<button class="button" type="button" data-remove-reminder="${i}" aria-label="${t("Remove reminder", "Eliminar recordatorio")} ${i + 1}">×</button></div>`).join("")}</div><button class="button" type="button" data-add-reminder ${settings.reminderHours.length >= 3 ? "disabled" : ""}>+ ${t("Add reminder", "Añadir recordatorio")}</button><p class="help-text">${t("Choose different times, from 1 to 168 hours before the meeting. Confirmations and calendar invitations always send.", "Elige horarios distintos, entre 1 y 168 horas antes de la reunión. Siempre se envían la confirmación y la invitación al calendario.")}</p></section><section class="panel" data-holiday-settings><h2>${t("Automatic blackouts", "Bloqueos automáticos")}</h2>${check("blockUsFederalHolidays", t("Block U.S. federal holidays", "Bloquear los feriados federales de EE. UU."))}<p class="help-text">${t("Blocks all meeting types on the 11 annual federal holidays and their observed weekdays, using your schedule time zone.", "Bloquea todos los tipos de reunión durante los 11 feriados federales anuales y los días laborables en que se observan, según la zona horaria de tu agenda.")}</p><a class="help-text" href="https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/" target="_blank" rel="noopener noreferrer">${t("View the federal holiday calendar", "Ver el calendario de feriados federales")} ↗</a></section><section class="panel"><h2>${t("Calendar connections", "Conexiones de calendario")}</h2><p>${t("Google receives new bookings. Only the calendars you select below block time.", "Google recibe las nuevas reservas. Solo los calendarios seleccionados bloquean horarios.")}</p><div data-connections></div></section><section class="panel" data-other-settings><h2>${t("Other", "Otros")}</h2><div class="form-grid">${field("cancelledBookingRetentionDays", t("Hide cancelled meetings after (days)", "Ocultar reuniones canceladas después de (días)"), { type: "number", min: 0, max: 365, required: true, help: t("Counted from when cancellation finishes. 0 hides them immediately. This only hides entries from Bookings; records are kept.", "Se cuenta desde que finaliza la cancelación. 0 las oculta de inmediato. Solo se ocultan de Reservas; se conservan los registros.") })}</div></section></div>`;
  renderLogoEditor();
  renderConnections();
  validateReminderFields();
  $("[data-add-reminder]", app).addEventListener("click", () => {
    if (settings.reminderHours.length >= 3) return;
    settings.reminderHours.push(
      [24, 1, 48].find((hour) => !settings.reminderHours.includes(hour))!,
    );
    rerenderEditor();
    $<HTMLInputElement>(
      `[data-setting="reminderHours.${settings.reminderHours.length - 1}"]`,
      app,
    ).focus();
  });
  $$<HTMLButtonElement>("[data-remove-reminder]", app).forEach((button) =>
    button.addEventListener("click", () => {
      settings.reminderHours.splice(Number(button.dataset.removeReminder), 1);
      rerenderEditor();
      $("[data-add-reminder]", app).focus();
    }),
  );
}
function validateReminderFields() {
  $$<HTMLInputElement>('[data-setting^="reminderHours."]', app).forEach(
    (input) => {
      input.setCustomValidity(
        settings.reminderHours.filter((hours) => hours === Number(input.value))
          .length > 1
          ? t(
              "Choose a different time for each reminder.",
              "Elige un horario distinto para cada recordatorio.",
            )
          : "",
      );
    },
  );
}
function renderLogoEditor() {
  const target = $("[data-logo-editor]", app);
  const preview =
    logoPreview?.url === settings.brand.logoUrl
      ? logoPreview.data
      : safeHttps(settings.brand.logoUrl);
  target.innerHTML = `<div class="logo-editor"><div class="logo-controls"><label class="field">${t("Logo image (optional)", "Imagen del logotipo (opcional)")}<input type="file" accept="${LOGO_TYPES.join(",")}" data-logo-file aria-describedby="logo-help" ${logoUploading ? "disabled" : ""}></label><p class="help-text" id="logo-help">${t("PNG or JPEG, up to", "PNG o JPEG, hasta")} ${LOGO_MAX_BYTES / 1_000_000} MB. ${t("Recommended:", "Recomendado:")} ${LOGO_RECOMMENDED_DIMENSION} × ${LOGO_RECOMMENDED_DIMENSION} px. ${t("Maximum:", "Máximo:")} ${LOGO_MAX_DIMENSION} × ${LOGO_MAX_DIMENSION} px. ${t("Use a transparent PNG to keep the background clear.", "Usa un PNG transparente para mantener el fondo sin color.")}</p><p class="help-text" data-logo-status role="status">${logoUploading ? t("Uploading image…", "Subiendo imagen…") : ""}</p><div data-logo-error></div></div><div class="logo-visual">${preview ? `<div class="logo-preview"><img src="${esc(preview)}" alt="${t("Logo preview", "Vista previa del logotipo")}"></div><button type="button" class="button" data-remove-logo ${logoUploading ? "disabled" : ""}>${t("Remove logo", "Eliminar logotipo")}</button>` : `<p class="help-text">${t("Using the Scheduler icon.", "Se está usando el icono de Scheduler.")}</p>`}</div></div>`;
  $("[data-logo-file]", target).addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void uploadLogo(file);
  });
  target.querySelector("[data-remove-logo]")?.addEventListener("click", () => {
    settings.brand.logoUrl = "";
    logoPreview = undefined;
    renderLogoEditor();
    dirty();
  });
}
async function uploadLogo(file: File) {
  if (logoUploading || saving) return;
  const error = (code: string) => Object.assign(new Error(code), { code });
  logoUploading = true;
  renderLogoEditor();
  dirty();
  try {
    if (file.size > LOGO_MAX_BYTES) throw error("logo_too_large");
    if (!LOGO_TYPES.includes(file.type)) throw error("invalid_logo");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(error("invalid_logo"));
      reader.readAsDataURL(file);
    });
    const preview = new Image();
    preview.src = data;
    try {
      await preview.decode();
    } catch {
      throw error("invalid_logo");
    }
    if (
      preview.naturalWidth > LOGO_MAX_DIMENSION ||
      preview.naturalHeight > LOGO_MAX_DIMENSION
    )
      throw error("logo_dimensions");
    const result = (await api.request("/admin/logo", {
      method: "POST",
      body: file,
      headers: { "Content-Type": file.type },
    })) as { url: string };
    settings.brand.logoUrl = result.url;
    logoPreview = { url: result.url, data };
    logoUploading = false;
    renderLogoEditor();
    $("[data-logo-status]", app).textContent = t(
      "Image ready. Save changes to publish it.",
      "Imagen lista. Guarda los cambios para publicarla.",
    );
  } catch (error) {
    logoUploading = false;
    renderLogoEditor();
    const target = $("[data-logo-error]", app);
    showError(target, error);
    if ((error as { status?: number }).status === 503)
      target.textContent = t(
        "The image couldn’t be uploaded. Please try again.",
        "No se pudo subir la imagen. Inténtalo de nuevo.",
      );
  } finally {
    dirty();
  }
}
function renderConnections() {
  const target = $("[data-connections]", app);
  const c = connections;
  target.innerHTML = `<div class="between connections-heading"><span class="status-pill ${c.ready ? "good" : "bad"}">${c.ready ? t("Ready to book", "Lista para reservar") : t("Setup needed", "Falta configuración")}</span><button class="button" type="button" data-verify>${t("Verify connections", "Verificar conexiones")}</button></div>${c.issues.length ? `<div class="notice"><strong>${t("Needs attention", "Requiere atención")}</strong><ul>${c.issues.map((issue) => `<li>${esc(connectionIssue(issue))}</li>`).join("")}</ul></div>` : ""}<div data-connection-error></div><div class="connection-card"><div class="between"><h3>Google Calendar</h3><div class="connection-status"><span class="status-pill ${c.google.connected ? "good" : ""}">${c.google.connected ? t("Connected", "Conectado") : t("Not connected", "Sin conectar")}</span>${c.google.connected && c.google.email ? `<span class="connection-email">${esc(c.google.email)}</span>` : ""}</div></div><p>${t("New meetings are added automatically to your main Google calendar.", "Las reuniones se añaden automáticamente a tu calendario principal de Google.")}</p><div class="cluster"><a class="button" data-oauth href="/api/admin/connect/google">${c.google.connected ? t("Reconnect Google", "Reconectar Google") : t("Connect Google", "Conectar Google")}</a>${c.google.connected ? `<button type="button" class="button danger" data-disconnect="google">${t("Disconnect", "Desconectar")}</button>` : ""}</div></div><div class="connection-card"><div class="between"><h3>iCloud Calendar</h3><span class="status-pill ${c.icloud.connected ? "good" : ""}">${c.icloud.connected ? t("Connected", "Conectado") : t("Not connected", "Sin conectar")}</span></div><p>${t("Connect directly for family-calendar conflicts using an Apple app-specific password.", "Conecta directamente para consultar conflictos del calendario familiar con una contraseña de aplicación de Apple.")}</p><form class="stack" data-icloud-form><div class="form-grid"><label class="field">${t("Apple Account email", "Correo de tu cuenta de Apple")}<input type="email" name="username" autocomplete="username" required></label><label class="field">${t("App-specific password", "Contraseña de aplicación")}<input type="password" name="password" autocomplete="new-password" required></label></div><div class="cluster"><button class="button" type="submit">${c.icloud.connected ? t("Update connection", "Actualizar conexión") : t("Connect iCloud", "Conectar iCloud")}</button>${c.icloud.connected ? `<button class="button danger" type="button" data-disconnect="icloud">${t("Disconnect", "Desconectar")}</button>` : ""}<a class="help-text" href="https://support.apple.com/102654" target="_blank" rel="noopener noreferrer">${t("Create an app-specific password", "Crear una contraseña de aplicación")} ↗</a></div></form></div><div class="connection-card"><div class="between"><h3>Zoom</h3><span class="status-pill ${c.zoom.connected ? "good" : ""}">${c.zoom.connected ? t("Connected", "Conectado") : t("Not connected", "Sin conectar")}</span></div><p>${t("Needed only for enabled Zoom meeting types.", "Solo es necesario para los tipos de reunión por Zoom habilitados.")}</p><div class="cluster"><a class="button" data-oauth href="/api/admin/connect/zoom">${c.zoom.connected ? t("Reconnect Zoom", "Reconectar Zoom") : t("Connect Zoom", "Conectar Zoom")}</a>${c.zoom.connected ? `<button type="button" class="button danger" data-disconnect="zoom">${t("Disconnect", "Desconectar")}</button>` : ""}</div></div><hr class="divider"><h3>${t("Calendars that block bookings", "Calendarios que bloquean reservas")}</h3><p class="help-text">${t("Calendar names come from Google or iCloud, including any symbols. Similar names can belong to different calendars. Only checked calendars block bookings.", "Los nombres vienen de Google o iCloud, incluidos sus símbolos. Nombres parecidos pueden corresponder a calendarios distintos. Solo los calendarios marcados bloquean reservas.")} ${t("Select your subscribed Proton calendar under Google. Subscription changes can take time to appear.", "Selecciona el calendario de Proton suscrito en Google. Los cambios de la suscripción pueden tardar en aparecer.")}</p><div class="calendar-list">${c.calendars.map((cal) => `<label class="check calendar-label"><input type="checkbox" data-calendar="${esc(cal.provider)}" value="${esc(cal.id)}" ${(cal.provider === "google" ? settings.googleCalendars : settings.icloudCalendars).includes(cal.id) ? "checked" : ""}><span>${esc(cal.name)}<small>${cal.provider === "google" ? "Google Calendar" : "iCloud"}</small></span></label>`).join("") || `<p class="help-text">${t("Connect a calendar account to choose blocking calendars.", "Conecta una cuenta de calendario para elegir los calendarios que bloquean horarios.")}</p>`}</div>${check("requireIcloud", t("Require iCloud conflict checking before accepting bookings", "Exigir la consulta de conflictos de iCloud antes de aceptar reservas"))}`;
  $("[data-verify]", target).addEventListener(
    "click",
    () => void connectionAction("/admin/verify", "POST", {}),
  );
  $$<HTMLInputElement>("[data-calendar]", target).forEach((input) =>
    input.addEventListener("change", () => {
      const key =
        input.dataset.calendar === "google"
          ? "googleCalendars"
          : "icloudCalendars";
      settings[key] = input.checked
        ? [...new Set([...settings[key], input.value])]
        : settings[key].filter((id) => id !== input.value);
      dirty();
    }),
  );
  $$<HTMLButtonElement>("[data-disconnect]", target).forEach((button) =>
    button.addEventListener("click", async () => {
      if (JSON.stringify(settings) !== baseline) {
        const message = $("[data-connection-error]", app);
        message.className = "notice error";
        message.setAttribute("role", "alert");
        message.textContent = t(
          "Save your current changes before disconnecting an account.",
          "Guarda los cambios actuales antes de desconectar una cuenta.",
        );
        return;
      }
      if (
        !(await confirmAction(
          t("Disconnect this account?", "¿Desconectar esta cuenta?"),
          t(
            "New bookings will be paused. Existing bookings remain on your calendar.",
            "Las nuevas reservas se pausarán. Las reservas existentes permanecerán en tu calendario.",
          ),
          t("Disconnect", "Desconectar"),
        ))
      )
        return;
      const before = JSON.stringify(settings);
      if (
        await connectionAction(
          `/admin/connections/${button.dataset.disconnect}`,
          "DELETE",
          undefined,
        )
      ) {
        if (JSON.stringify(settings) === before) await loadDashboard();
        else {
          settings.enabled = false;
          dirty();
        }
      }
    }),
  );
  $$<HTMLAnchorElement>("[data-oauth]", target).forEach((link) =>
    link.addEventListener("click", (event) => {
      if (
        !guard.confirmTransition(
          t(
            "You have unsaved changes. Leave without saving?",
            "Tienes cambios sin guardar. ¿Salir sin guardarlos?",
          ),
        )
      )
        event.preventDefault();
    }),
  );
  $<HTMLFormElement>("[data-icloud-form]", target).addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const data = new FormData(form);
      const password = String(data.get("password") || "");
      $<HTMLInputElement>("input[name=password]", form).value = "";
      await connectionAction("/admin/connections/icloud", "POST", {
        username: String(data.get("username") || ""),
        password,
      });
    },
  );
}
function connectionIssue(code: string) {
  const lower = code.toLowerCase();
  if (lower.includes("google"))
    return t(
      "Connect Google and verify the selected calendars.",
      "Conecta Google y verifica los calendarios seleccionados.",
    );
  if (lower.includes("icloud"))
    return t(
      "Connect iCloud and select the family calendars that should block time.",
      "Conecta iCloud y selecciona los calendarios familiares que deben bloquear horarios.",
    );
  if (lower.includes("zoom"))
    return t(
      "Connect Zoom or disable Zoom meeting types.",
      "Conecta Zoom o desactiva los tipos de reunión por Zoom.",
    );
  if (lower.includes("turnstile"))
    return t(
      "Turnstile needs to be configured.",
      "Falta configurar Turnstile.",
    );
  if (lower.includes("resend") || lower.includes("email"))
    return t(
      "Email delivery needs to be configured.",
      "Falta configurar el envío de correo.",
    );
  return t(
    "A connection needs attention. Verify connections to try again.",
    "Una conexión requiere atención. Verifica las conexiones para reintentar.",
  );
}
async function connectionAction(path: string, method: string, body: unknown) {
  const target = $("[data-connections]", app);
  $$<HTMLButtonElement>("button", target).forEach(
    (button) => (button.disabled = true),
  );
  try {
    connections = (await api.request(path, { method, body })) as Connections;
    renderConnections();
    return true;
  } catch (e) {
    showError($("[data-connection-error]", app), e);
    $$<HTMLButtonElement>("button", target).forEach(
      (button) => (button.disabled = false),
    );
    return false;
  }
}
function bookingIssue(booking: PublicBooking) {
  const code = booking.error || "";
  if (["google_reconnect_required", "google_not_connected"].includes(code))
    return t(
      "Reconnect Google Calendar in Settings, then verify the connection and refresh this booking’s status.",
      "Vuelve a conectar Google Calendar en Configuración, verifica la conexión y actualiza el estado de esta reserva.",
    );
  if (code === "zoom_write_uncertain")
    return t(
      "Check this meeting in Zoom: the result of its last update is unknown. The scheduler is checking for the existing meeting. Cancellation may remain pending until that is resolved.",
      "Revisa esta reunión en Zoom: se desconoce el resultado de su última actualización. El sistema está buscando la reunión existente. La cancelación puede quedar pendiente hasta que se resuelva.",
    );
  if (["zoom_reconnect_required", "zoom_not_connected"].includes(code))
    return t(
      "Reconnect Zoom in Settings, then verify the connection and refresh this booking’s status.",
      "Vuelve a conectar Zoom en Configuración, verifica la conexión y actualiza el estado de esta reserva.",
    );
  if (code === "email_delivery_pending")
    return t(
      "Email delivery has not been confirmed. A retry is queued; check Resend’s delivery history if this continues. The booking status is shown separately above.",
      "No se ha confirmado la entrega del correo. Hay un reintento pendiente; revisa el historial de Resend si esto continúa. El estado de la reserva se muestra por separado arriba.",
    );
  if (code === "email_needs_attention")
    return t(
      "Email delivery needs review. Automatic sending has stopped for this message. Check Resend’s delivery history and correct any rejection before sending it manually.",
      "La entrega del correo requiere revisión. El envío automático de este mensaje se ha detenido. Revisa el historial de Resend y corrige cualquier rechazo antes de enviarlo manualmente.",
    );
  if (code === "booking_needs_attention")
    return t(
      "A calendar conflict was found after a video meeting may have been created. Inspect the Google Calendar and Zoom records; this booking is still unresolved.",
      "Se detectó un conflicto de calendario después de que posiblemente se creara una videollamada. Revisa los registros de Google Calendar y Zoom; esta reserva sigue sin resolverse.",
    );
  if (["conference_pending", "conference_repair_pending"].includes(code))
    return t(
      "The Google Meet link is not ready yet. The scheduler will check again; refresh this list to see the latest booking status.",
      "El enlace de Google Meet todavía no está listo. El sistema volverá a comprobarlo; actualiza esta lista para ver el estado más reciente.",
    );
  if (code === "slot_unavailable")
    return booking.status === "confirmed"
      ? t(
          "The requested new time became unavailable. The original meeting remains confirmed.",
          "El nuevo horario solicitado dejó de estar disponible. La reunión original sigue confirmada.",
        )
      : t(
          "This time became unavailable before the booking was confirmed. You can cancel this record and arrange another time.",
          "Este horario dejó de estar disponible antes de confirmar la reserva. Puedes cancelar este registro y acordar otro horario.",
        );
  if (code.startsWith("icloud_") || code.startsWith("calendar_"))
    return t(
      "Calendar conflicts could not be checked completely. Verify the calendar connections and selected blocking calendars in Settings.",
      "No se pudieron comprobar todos los conflictos. Verifica las conexiones y los calendarios que bloquean horarios en Configuración.",
    );
  return t(
    "A provider could not complete this operation. Verify its connection in Settings, inspect the provider’s records, and refresh this booking’s status.",
    "Un proveedor no pudo completar esta operación. Verifica su conexión en Configuración, revisa sus registros y actualiza el estado de esta reserva.",
  );
}
function bookingActions(booking: PublicBooking) {
  if (!["confirmed", "pending", "failed"].includes(booking.status)) return "";
  return `<div class="cluster">${booking.status === "confirmed" ? `<button class="button" type="button" data-admin-reschedule="${esc(booking.id)}">${t("Reschedule", "Cambiar horario")}</button>` : ""}<button class="button danger" type="button" data-admin-cancel="${esc(booking.id)}">${t("Cancel", "Cancelar")}</button></div>`;
}
function bookingMessageField() {
  return `<label class="field">${t("Message to guest (optional)", "Mensaje para el invitado (opcional)")}<textarea name="message" rows="4" maxlength="2000"></textarea><small>${t("Included in the guest’s email once the calendar change is confirmed. Up to 2,000 characters.", "Se incluye en el correo al invitado cuando se confirma el cambio en el calendario. Hasta 2.000 caracteres.")}</small></label>`;
}
function renderBookings() {
  $("#panel-bookings", app).innerHTML =
    `<section class="panel"><div class="between bookings-heading"><h2>${t("Upcoming and recent meetings", "Reuniones próximas y recientes")}</h2><button class="button" type="button" data-refresh-bookings>${t("Refresh", "Actualizar")}</button></div><div data-booking-error></div>${bookings.length ? bookings.map((b) => `<article class="booking-row"><div class="between"><h3>${esc(b.name)} · ${esc(b.typeName)}</h3><span class="status-pill ${b.status === "confirmed" ? "good" : b.status === "failed" ? "bad" : ""}">${esc(statusLabel(b.status))}</span></div><p>${esc(dateLabel(b.start, settings.timezone))} · ${esc(settings.timezone)}<br>${esc(b.location || b.mode)} · <a href="mailto:${esc(b.email)}">${esc(b.email)}</a></p>${b.error ? `<div class="notice error"><p>${esc(bookingIssue(b))}</p><small>${t("Diagnostic code", "Código de diagnóstico")}: ${esc(b.error)}</small></div>` : ""}${b.topic ? `<p class="topic">${esc(b.topic)}</p>` : ""}${bookingActions(b)}<div data-booking-action="${esc(b.id)}"></div></article>`).join("") : `<div class="empty-state"><h3>${t("Your next conversation starts here.", "Tu próxima conversación empieza aquí.")}</h3><p>${t("Bookings will appear here as people reserve your time.", "Las reservas aparecerán aquí cuando alguien elija un horario.")}</p></div>`}</section>`;
  $("[data-refresh-bookings]", app).addEventListener(
    "click",
    () => void refreshBookings(),
  );
  $$<HTMLButtonElement>("[data-admin-cancel]", app).forEach((button) =>
    button.addEventListener(
      "click",
      () => void cancelBooking(button.dataset.adminCancel!),
    ),
  );
  $$<HTMLButtonElement>("[data-admin-reschedule]", app).forEach((button) =>
    button.addEventListener("click", () => {
      const b = bookings.find((b) => b.id === button.dataset.adminReschedule)!;
      const target = $(`[data-booking-action="${b.id}"]`, app);
      if (target.querySelector("[data-move-form]")) {
        $<HTMLInputElement>("[name=start]", target).focus();
        return;
      }
      let pending = false;
      let operation: { body: string; requestId: string } | undefined;
      target.innerHTML = `<form class="stack" data-move-form><label class="field">${t("New start time", "Nuevo horario de inicio")} · ${esc(currentZone())}<input type="datetime-local" name="start" value="${localInput(b.start)}" required></label><p class="help-text">${t("Calendar conflicts and notice are checked before the change is accepted. You can override the guest change deadline.", "Se comprueban los conflictos y la antelación antes de aceptar el cambio. Puedes modificar la reserva después del plazo del invitado.")}</p>${bookingMessageField()}<button class="button" type="submit">${t("Confirm new time", "Confirmar nuevo horario")}</button><div data-move-error></div></form>`;
      $<HTMLFormElement>("[data-move-form]", target).addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();
          if (pending) return;
          const form = event.currentTarget as HTMLFormElement;
          const data = new FormData(form);
          const start = new Date(String(data.get("start"))).toISOString();
          const message = String(data.get("message") || "").trim();
          const body = JSON.stringify({ start, message });
          if (operation?.body !== body)
            operation = { body, requestId: crypto.randomUUID() };
          pending = true;
          const controls = $$<
            HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
          >("button, input, textarea", form);
          controls.forEach((control) => (control.disabled = true));
          form.setAttribute("aria-busy", "true");
          $("[data-move-error]", target).hidden = true;
          try {
            await api.request(`/admin/bookings/${b.id}/reschedule`, {
              method: "POST",
              body: { start, message, requestId: operation.requestId },
            });
            await refreshBookings();
          } catch (e) {
            $("[data-move-error]", target).hidden = false;
            showError($("[data-move-error]", target), e);
          } finally {
            pending = false;
            controls.forEach((control) => (control.disabled = false));
            form.removeAttribute("aria-busy");
          }
        },
      );
    }),
  );
}
async function refreshBookings() {
  try {
    const result = (await api.request("/admin/bookings")) as {
      bookings: PublicBooking[];
    };
    bookings = result.bookings;
    renderBookings();
  } catch (e) {
    showError($("[data-booking-error]", app), e);
  }
}
async function cancelBooking(id: string) {
  const content = document.createElement("div");
  content.innerHTML = bookingMessageField();
  const message = $<HTMLTextAreaElement>("[name=message]", content);
  const confirmed = await confirmAction(
    t("Cancel this booking?", "¿Cancelar esta reserva?"),
    t(
      "A cancellation will be requested. Any existing calendar invitation is updated when the providers confirm. This may take time if a provider’s last result is uncertain.",
      "Se solicitará la cancelación. Las invitaciones existentes se actualizarán cuando los proveedores confirmen. Esto puede tardar si se desconoce el resultado de la última operación.",
    ),
    t("Cancel booking", "Cancelar reserva"),
    {
      content,
      onConfirm: () =>
        api
          .request(`/admin/bookings/${id}/cancel`, {
            method: "POST",
            body: { message: message.value.trim() },
          })
          .then(() => undefined),
    },
  );
  if (confirmed) await refreshBookings();
}

async function save() {
  if (saving || logoUploading) return;
  const invalid = $$<
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  >("[data-setting]", app).find((input) => !input.checkValidity());
  if (invalid) {
    const panel = invalid.closest("[role=tabpanel]");
    tabs.select(panel?.id.replace("panel-", "") || "settings");
    invalid.reportValidity();
    return;
  }
  saving = true;
  dirty();
  $("[data-global-error]", app).textContent = "";
  try {
    const write = (value: Settings, expected: number) =>
      api.request("/admin/settings", {
        method: "PUT",
        body: { settings: value, revision: expected },
      }) as Promise<{ settings: Settings; revision: number }>;
    let result: { settings: Settings; revision: number };
    try {
      result = await write(settings, revision);
    } catch (e) {
      if ((e as { status?: number }).status !== 409) throw e;
      const current = (await api.request("/admin/settings")) as {
        settings: Settings;
        revision: number;
      };
      const merged = mergeSettings(
        JSON.parse(baseline),
        settings,
        current.settings,
      );
      if (!merged) throw e;
      // Retry once with the current revision. Another concurrent write still
      // produces a conflict; never bypass the server's revision check.
      result = await write(merged, current.revision);
    }
    const retentionChanged =
      result.settings.cancelledBookingRetentionDays !==
      JSON.parse(baseline).cancelledBookingRetentionDays;
    settings = result.settings;
    revision = result.revision;
    baseline = JSON.stringify(settings);
    applyBrand(settings);
    rerenderEditor();
    if (retentionChanged) await refreshBookings();
    const state = $("[data-save-state]", app);
    state.setAttribute("role", "status");
    state.textContent = t(
      "Saved. Your booking page is updated.",
      "Guardado. Tu página de reservas está actualizada.",
    );
  } catch (e) {
    const target = $("[data-global-error]", app);
    showError(target, e);
    if ((e as { status?: number }).status === 503)
      target.textContent = t(
        "Your changes weren’t saved because a calendar connection could not be verified. Your edits are still here. Retry, or use Verify connections in Settings for details.",
        "No se guardaron tus cambios porque no se pudo verificar una conexión de calendario. Tus cambios siguen aquí. Inténtalo de nuevo o usa Verificar conexiones en Configuración para ver los detalles.",
      );
    if ((e as { status?: number }).status === 409) {
      target.innerHTML += `<p>${t("Your edits are still on this page. Reload the latest settings to discard them, then apply your changes again.", "Tus cambios siguen en esta página. Recarga la configuración más reciente para descartarlos y luego vuelve a aplicarlos.")}</p><button class="button" data-reload-settings type="button">${t("Reload saved settings", "Recargar configuración guardada")}</button>`;
      $("[data-reload-settings]", target).addEventListener("click", () => {
        if (
          guard.confirmTransition(
            t(
              "Discard these edits and reload?",
              "¿Descartar estos cambios y recargar?",
            ),
          )
        )
          void loadDashboard();
      });
    }
    target.scrollIntoView({ block: "start" });
  } finally {
    saving = false;
    dirty();
  }
}
async function logout() {
  if (
    !guard.confirmTransition(
      t(
        "Leave without saving your changes?",
        "¿Salir sin guardar los cambios?",
      ),
    )
  )
    return;
  await api.request("/admin/logout", { method: "POST", body: {} });
  baseline = JSON.stringify(settings);
  await login();
}
async function login() {
  app.innerHTML = `<section class="login-wrap"><h1>${t("Welcome back.", "Te damos la bienvenida.")}</h1><p class="muted">${t("Sign in with your owner email. We’ll send a private, single-use sign-in link.", "Inicia sesión con tu correo de administración. Te enviaremos un enlace privado de un solo uso.")}</p><form class="panel stack" data-login><label class="field">${t("Email address", "Correo electrónico")}<input type="email" name="email" autocomplete="email" maxlength="254" required></label><div data-turnstile class="turnstile"></div><div data-login-status></div><button class="button primary" type="submit" data-login-button disabled>${t("Send sign-in link", "Enviar enlace de acceso")}</button></form></section>`;
  setBusy(false);
  config ||= (await api.request("/config")) as Config;
  applyBrand(config.settings);
  challenge = await mountTurnstile(
    $("[data-turnstile]", app),
    config.turnstileSiteKey,
    "admin_login",
    (value) => {
      token = value;
      $<HTMLButtonElement>("[data-login-button]", app).disabled = !value;
    },
  );
  $<HTMLFormElement>("[data-login]", app).addEventListener(
    "submit",
    async (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const button = $<HTMLButtonElement>("[data-login-button]", app);
      button.disabled = true;
      try {
        await api.request("/admin/login", {
          method: "POST",
          body: {
            email: String(new FormData(form).get("email")),
            turnstile: token,
          },
        });
        const status = $("[data-login-status]", app);
        status.className = "notice success";
        status.setAttribute("role", "status");
        status.textContent = t(
          "If this is the owner email, a sign-in link is on its way. Check your inbox.",
          "Si este es el correo de administración, recibirás un enlace de acceso. Revisa tu bandeja de entrada.",
        );
      } catch (e) {
        showError($("[data-login-status]", app), e);
      } finally {
        challenge?.reset();
      }
    },
  );
}
async function loadDashboard() {
  const result = (await api.request("/admin/settings")) as {
    settings: Settings;
    revision: number;
  };
  settings = result.settings;
  settings.locations.forEach((location) => {
    location.instructions ??= { en: "", es: "" };
  });
  revision = result.revision;
  baseline = JSON.stringify(settings);
  applyBrand(settings);
  const results = await Promise.allSettled([
    api.request("/admin/connections"),
    api.request("/admin/bookings"),
  ]);
  connections =
    results[0].status === "fulfilled"
      ? (results[0].value as Connections)
      : {
          google: { connected: false },
          icloud: { connected: false },
          zoom: { connected: false },
          ready: false,
          calendars: [],
          issues: ["connection_unavailable"],
        };
  bookings =
    results[1].status === "fulfilled"
      ? (results[1].value as { bookings: PublicBooking[] }).bookings
      : [];
  render();
  if (results[1].status === "rejected")
    showError($("[data-booking-error]", app), results[1].reason);
}
async function boot() {
  try {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const loginToken = fragment.get("login");
    if (loginToken) {
      history.replaceState(null, "", location.pathname + location.search);
      syncLanguageLink();
      await api.request("/admin/consume", {
        method: "POST",
        body: { token: loginToken },
      });
    }
    const session = (await api.request("/admin/session")) as {
      authenticated: boolean;
    };
    if (session.authenticated) await loadDashboard();
    else await login();
  } catch (e) {
    app.innerHTML = `<section class="login-wrap"><h1>${t("Let’s try that again.", "Intentémoslo de nuevo.")}</h1><p class="notice error">${esc(errorText(e))}</p><a class="button" href="${prefix}/admin/">${t("Return to sign in", "Volver al inicio de sesión")}</a></section>`;
    setBusy(false);
  }
}
void boot();
