import { headerLogoMarkup, safeHttps } from "../worker/src/branding";
export { safeHttps };
import { escapeHtml, localizedText } from "../worker/src/text";
import { AdminApiClient } from "@dustwave/admin-shell/api-client";
import { responsiveTurnstileSize } from "@dustwave/admin-shell/turnstile";
import type { Settings, PublicBooking, Locale } from "../worker/src/model";
import { LOGO_MAX_BYTES, LOGO_MAX_DIMENSION } from "../worker/src/logo-policy";

export const locale: Locale =
  document.documentElement.lang === "es" ? "es" : "en";
export const t = (en: string, es: string) => (locale === "es" ? es : en);
export const local = (value: { en: string; es: string }) =>
  localizedText(value, locale);
export const esc = escapeHtml;
export const app = document.querySelector<HTMLElement>("#app")!;
const defaultWordmark =
  document.querySelector<HTMLTemplateElement>("#default-wordmark")?.innerHTML ||
  document.querySelector(".wordmark")?.innerHTML ||
  "";
export const prefix = locale === "es" ? "/es" : "";
export const bookingPath = document.body.dataset.bookingPath || "/";
export const api = new AdminApiClient({
  baseUrl: "/api",
  credentials: "same-origin",
});
export type PublicSettings = Pick<
  Settings,
  | "name"
  | "intro"
  | "spanishEnabled"
  | "timezone"
  | "enabled"
  | "noticeHours"
  | "horizonDays"
  | "cancelHours"
  | "types"
  | "locations"
  | "brand"
>;
export type { PublicBooking };
export interface Config {
  settings: PublicSettings;
  turnstileSiteKey: string;
  ready: boolean;
}
export const $ = <T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
) => root.querySelector<T>(selector)!;
export const $$ = <T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document,
) => Array.from(root.querySelectorAll<T>(selector));
export const icon = (name: string) =>
  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${name === "clock" ? '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' : name === "calendar" ? '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18"/>' : name === "pin" ? '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>' : name === "video" ? '<rect x="2" y="5" width="13" height="14" rx="2"/><path d="m15 9 7-4v14l-7-4"/>' : '<path d="M12 3v18M3 12h18"/>'}</svg>`;
export const modeLabel = (mode: string) =>
  mode === "meet"
    ? "Google Meet"
    : mode === "zoom"
      ? "Zoom"
      : t("In person", "Presencial");
export const dateLabel = (
  value: number | string,
  timezone: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: "full", timeStyle: "short" },
) =>
  new Intl.DateTimeFormat(locale, { timeZone: timezone, ...opts }).format(
    new Date(value),
  );
export const timeLabel = (value: number | string, timezone: string) =>
  dateLabel(value, timezone, { hour: "numeric", minute: "2-digit" });
export const zoneLabel = (zone: string) => zone.replaceAll("_", " ");
export function currentZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Denver";
  } catch {
    return "America/Denver";
  }
}
export function timezoneOptions(selected: string) {
  const list =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [
          "America/Denver",
          "America/New_York",
          "America/Chicago",
          "America/Los_Angeles",
          "America/Mexico_City",
          "Europe/Madrid",
          "Europe/London",
          "UTC",
        ];
  return [...new Set([selected, ...list])]
    .map(
      (z) =>
        `<option value="${esc(z)}" ${z === selected ? "selected" : ""}>${esc(zoneLabel(z))}</option>`,
    )
    .join("");
}
export function setBusy(busy = false) {
  app.setAttribute("aria-busy", String(busy));
}
export function focusHeading(selector = "h1") {
  const el = $<HTMLElement>(selector, app);
  if (el) {
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
  }
}
export function errorText(error: unknown) {
  const e = error as { code?: string; status?: number };
  const code = e?.code || "";
  if (code === "invalid_logo")
    return t(
      "Choose a valid PNG or JPEG image.",
      "Elige una imagen PNG o JPEG válida.",
    );
  if (code === "logo_too_large")
    return t(
      `This image is too large. Choose a file up to ${LOGO_MAX_BYTES / 1_000_000} MB.`,
      `Esta imagen es demasiado grande. Elige un archivo de hasta ${LOGO_MAX_BYTES / 1_000_000} MB.`,
    );
  if (code === "logo_dimensions")
    return t(
      `Resize the image to ${LOGO_MAX_DIMENSION} × ${LOGO_MAX_DIMENSION} pixels or smaller.`,
      `Reduce la imagen a ${LOGO_MAX_DIMENSION} × ${LOGO_MAX_DIMENSION} píxeles o menos.`,
    );
  if (code === "logo_missing")
    return t(
      "Please upload the logo again, then save your changes.",
      "Vuelve a subir el logotipo y guarda los cambios.",
    );
  if (e.status === 409)
    return t(
      "That time is no longer available, or this item changed. Refresh and try again.",
      "Ese horario ya no está disponible o el elemento cambió. Actualiza e inténtalo de nuevo.",
    );
  if (e.status === 429)
    return t(
      "Too many attempts. Please wait a little and try again.",
      "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
    );
  if (e.status === 401 || code.includes("TOKEN"))
    return t(
      "This link or session has expired. Please use your latest booking email or sign in again.",
      "Este enlace o sesión ha caducado. Usa tu correo de reserva más reciente o vuelve a iniciar sesión.",
    );
  if (code.toLowerCase().includes("turnstile") || code.startsWith("challenge_"))
    return t(
      "Please complete the spam check again.",
      "Completa de nuevo la verificación contra spam.",
    );
  if (
    code === "management_closed" ||
    code.toLowerCase().includes("cutoff") ||
    code.toLowerCase().includes("too_late")
  )
    return t(
      "The change deadline has passed. This booking can no longer be changed here.",
      "Ya pasó el plazo para cambios. Esta reserva ya no se puede modificar aquí.",
    );
  if (code === "booking_paused")
    return t(
      "Not accepting bookings right now. Please check back later.",
      "No se aceptan reservas por ahora. Vuelve a consultar más adelante.",
    );
  if (e.status === 503)
    return t(
      "Booking is temporarily unavailable while calendar connections are checked. Please try again later.",
      "Las reservas no están disponibles mientras se comprueban las conexiones de calendario. Inténtalo más tarde.",
    );
  return t(
    "Something went wrong. Your details are still here. Please try again.",
    "Algo salió mal. Tus datos siguen aquí. Inténtalo de nuevo.",
  );
}
export function showError(el: HTMLElement, error: unknown) {
  el.className = "notice error";
  el.setAttribute("role", "alert");
  el.textContent = errorText(error);
}
export function statusLabel(status: string) {
  return (
    (
      {
        pending: t("Confirming", "Confirmando"),
        confirmed: t("Confirmed", "Confirmada"),
        failed: t("Needs attention", "Requiere atención"),
        cancelling: t("Cancelling", "Cancelando"),
        cancelled: t("Cancelled", "Cancelada"),
        rescheduling: t("Rescheduling", "Cambiando horario"),
      } as Record<string, string>
    )[status] || status
  );
}
export function summary(
  b: Pick<
    PublicBooking,
    | "typeName"
    | "start"
    | "end"
    | "timezone"
    | "location"
    | "locationInstructions"
    | "mode"
  >,
) {
  return `<div class="booking-review"><strong>${esc(b.typeName)}</strong><p>${esc(dateLabel(b.start, b.timezone))}<br><span class="muted">${esc(zoneLabel(b.timezone))} · ${Math.round((b.end - b.start) / 60000)} ${t("minutes", "minutos")}</span></p><p>${esc(b.location || modeLabel(b.mode))}</p>${b.locationInstructions ? `<p class="booking-instructions"><strong>${t("Arrival instructions", "Instrucciones de llegada")}</strong><br>${esc(b.locationInstructions)}</p>` : ""}</div>`;
}
export function applyBrand(settings: PublicSettings) {
  const languageLink = $<HTMLAnchorElement>("#language-link");
  if (languageLink) languageLink.hidden = settings.spanishEnabled === false;
  // Also handle a page left open while the owner changes the setting.
  if (settings.spanishEnabled === false && locale === "es") {
    const english = new URL(location.href);
    english.pathname = english.pathname.replace(/^\/es(?=\/)/, "");
    location.replace(english.href);
  }
  const mark = $<HTMLAnchorElement>(".wordmark");
  const logo = safeHttps(settings.brand.logoUrl);
  if (mark) {
    const current = mark.querySelector<HTMLImageElement>(".header-logo");
    if (logo) {
      if (
        current?.getAttribute("src") !== logo ||
        current.alt !== (settings.brand.name || settings.name)
      )
        mark.innerHTML = headerLogoMarkup(settings);
    } else {
      if (current) mark.innerHTML = defaultWordmark;
      const label = mark.querySelector<HTMLElement>("[data-brand-name]");
      if (label && settings.brand.name !== undefined) {
        label.textContent = settings.brand.name;
        label.hidden = !settings.brand.name;
      }
    }
  }
  const siteName = $<HTMLMetaElement>('meta[property="og:site_name"]');
  if (siteName && settings.brand.name !== undefined)
    siteName.content = settings.brand.name || "Scheduler";
  if (/^#[0-9a-fA-F]{6}$/.test(settings.brand.primary)) {
    document.documentElement.style.setProperty(
      "--brand-primary",
      settings.brand.primary,
    );
    const rgb = settings.brand.primary
      .slice(1)
      .match(/../g)!
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    document.documentElement.style.setProperty(
      "--brand-on-primary",
      luminance > 0.179 ? "#000000" : "#ffffff",
    );
  }
}
export function managementUrl(id: string, token: string) {
  return `${prefix}/manage/#${new URLSearchParams({ id, token })}`;
}
export function syncLanguageLink() {
  const link = $<HTMLAnchorElement>("#language-link");
  if (!link) return;
  const u = new URL(link.href);
  u.search = location.search;
  u.hash = location.hash;
  link.href = u.href;
}
export function initShell() {
  const select = $<HTMLSelectElement>("#appearance");
  let appearance = "system";
  try {
    appearance =
      localStorage.getItem("dustwave-scheduler-appearance") || "system";
  } catch {}
  function apply(value: string) {
    document.documentElement.dataset.theme =
      value === "light" || value === "dark" ? value : "system";
    select.value = value;
  }
  apply(appearance);
  select.addEventListener("change", () => {
    apply(select.value);
    try {
      localStorage.setItem("dustwave-scheduler-appearance", select.value);
    } catch {}
  });
  addEventListener("storage", (e) => {
    if (e.key === "dustwave-scheduler-appearance")
      apply(e.newValue || "system");
  });
  syncLanguageLink();
  // Tokens remain in the fragment, and never enter external requests or storage.
  window.addEventListener("hashchange", syncLanguageLink);
}

interface TurnstileAPI {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}
let turnstileScript: Promise<void> | undefined;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (!turnstileScript)
    turnstileScript = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        turnstileScript = undefined;
        reject(new Error("Turnstile unavailable"));
      };
      document.head.append(script);
    });
  return turnstileScript;
}
export async function mountTurnstile(
  el: HTMLElement,
  key: string,
  action: "booking" | "admin_login",
  onChange: (token: string) => void,
) {
  if (!key) {
    el.innerHTML = `<p class="help-text">${t("Spam protection is not configured yet.", "La protección contra spam todavía no está configurada.")}</p>`;
    return { reset() {}, remove() {} };
  }
  try {
    await loadTurnstile();
    if (!el.isConnected) return { reset() {}, remove() {} };
    const id = window.turnstile!.render(el, {
      sitekey: key,
      action,
      language: locale,
      theme: "auto",
      size: responsiveTurnstileSize(el),
      callback: (token: string) => onChange(token),
      "expired-callback": () => onChange(""),
      "error-callback": () => {
        onChange("");
        el.setAttribute(
          "aria-label",
          t(
            "Spam check unavailable. Reload to retry.",
            "Verificación no disponible. Recarga para reintentar.",
          ),
        );
      },
    });
    return {
      reset() {
        onChange("");
        window.turnstile?.reset(id);
      },
      remove() {
        window.turnstile?.remove(id);
      },
    };
  } catch {
    el.innerHTML = `<p class="notice error" role="alert">${t("The spam check could not load. Check your connection and reload this page.", "No se pudo cargar la verificación. Comprueba tu conexión y recarga la página.")}</p>`;
    return { reset() {}, remove() {} };
  }
}
export function confirmAction(
  title: string,
  message: string,
  button: string,
  options?: { content: HTMLElement; onConfirm: () => Promise<void> },
): Promise<boolean> {
  const dialog = document.createElement("dialog");
  dialog.className = "modal";
  dialog.setAttribute("aria-labelledby", "confirm-title");
  dialog.innerHTML = `<form method="dialog"><h2 id="confirm-title">${esc(title)}</h2><p>${esc(message)}</p><div data-confirm-error></div><div class="cluster"><button class="button" value="cancel" formnovalidate>${t("Go back", "Volver")}</button><button class="button danger" value="confirm">${esc(button)}</button></div></form>`;
  if (options) {
    const form = $<HTMLFormElement>("form", dialog);
    const error = $("[data-confirm-error]", dialog);
    error.before(options.content);
    let pending = false;
    dialog.addEventListener("cancel", (event) => {
      if (pending) event.preventDefault();
    });
    form.addEventListener("submit", async (event) => {
      if ((event.submitter as HTMLButtonElement)?.value !== "confirm") return;
      event.preventDefault();
      if (pending) return;
      pending = true;
      error.hidden = true;
      const controls = $$<
        HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
      >("button, input, textarea", form);
      controls.forEach((control) => (control.disabled = true));
      form.setAttribute("aria-busy", "true");
      try {
        await options.onConfirm();
        dialog.close("confirm");
      } catch (e) {
        error.hidden = false;
        showError(error, e);
      } finally {
        pending = false;
        controls.forEach((control) => (control.disabled = false));
        form.removeAttribute("aria-busy");
      }
    });
  }
  document.body.append(dialog);
  dialog.showModal();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => {
        const result = dialog.returnValue === "confirm";
        dialog.remove();
        resolve(result);
      },
      { once: true },
    ),
  );
}
