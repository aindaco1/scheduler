export const escapeHtml = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const localizedText = (
  value: { en: string; es: string } | undefined,
  locale: "en" | "es",
) => value?.[locale] || value?.en || value?.es || "";

// Postal addresses are shared across languages. Keep the localized wire shape
// for older dashboards and prefer a nonempty legacy address without data loss.
export const streetAddress = (value: { en: string; es: string }): string =>
  value.en.trim() || value.es.trim();
