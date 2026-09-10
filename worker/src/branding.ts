import type { Settings } from "./model";
import { escapeHtml } from "./text";
export type Presentation = Pick<Settings, "name" | "brand" | "spanishEnabled">;
export function safeHttps(value: string | undefined): string {
  try {
    const url = new URL(value || "");
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
export function headerLogoMarkup(
  settings: Pick<Settings, "name" | "brand">,
): string {
  const logo = safeHttps(settings.brand.logoUrl);
  return logo
    ? `<img class="header-logo" width="120" height="52" decoding="async" src="${escapeHtml(logo)}" alt="${escapeHtml(settings.brand.name || settings.name)}">`
    : "";
}
