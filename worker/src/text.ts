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
