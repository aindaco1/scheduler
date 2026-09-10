import type { Presentation } from "./branding";
import { escapeHtml as esc, localizedText } from "./text";
import { meetingUrl } from "./meeting-links";

export interface PublicIdentity {
  origin: string;
  slug: string;
}
const imagePath = "/assets/social/preview-v1.png";
const compact = (text: string, limit: number) => {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length <= limit
    ? value
    : value.slice(0, limit - 1).trimEnd() + "…";
};
// Data blocks must not be able to terminate their script element.
const jsonScript = (value: unknown) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"),
  );

export function bookingPage(
  url: URL,
  p: Presentation,
  identity: PublicIdentity,
) {
  const s = p.booking;
  const englishPath = "/" + identity.slug;
  const spanish = url.pathname.startsWith("/es/");
  const path = (spanish ? "/es" : "") + englishPath;
  if (!s || url.pathname.replace(/\/$/, "") !== path) return;
  const locale = spanish ? "es" : "en";
  const t = (en: string, es: string) => (spanish ? es : en);
  const local = (value: { en: string; es: string }) =>
    localizedText(value, locale);
  const ids = url.searchParams.getAll("type");
  const type =
    ids.length === 1 ? s.types.find((item) => item.id === ids[0]) : undefined;
  const missing = ids.length > 0 && !type;
  const mode =
    type?.mode === "in-person"
      ? t("In person", "Presencial")
      : type?.mode === "zoom"
        ? "Zoom"
        : "Google Meet";
  const heading = missing
    ? t("Meeting unavailable", "Reunión no disponible")
    : type
      ? local(type.name)
      : t("Meet with", "Reserva con") + " " + p.name;
  const details = type ? `${type.duration} min · ${mode}` : "";
  const closed = t(
    "Not accepting bookings right now. Please check back later.",
    "No se aceptan reservas por ahora. Vuelve a consultar más adelante.",
  );
  const description = missing
    ? t(
        "This meeting type is no longer available. View all meetings to choose another.",
        "Este tipo de reunión ya no está disponible. Consulta todas las reuniones para elegir otra.",
      )
    : !s.enabled
      ? closed
      : type
        ? `${details}. ${local(type.description)}`
        : local(s.intro);
  const title = compact(
    type && !missing ? `${local(type.name)} · ${details} · ${p.name}` : heading,
    180,
  );
  const canonical = meetingUrl(identity.origin, path, type?.id);
  const alternates = (
    ["en", ...(p.spanishEnabled ? ["es"] : []), "x-default"] as string[]
  )
    .map(
      (lang) =>
        `<link rel="alternate" hreflang="${lang}" href="${esc(meetingUrl(identity.origin, (lang === "es" ? "/es" : "") + englishPath, type?.id))}">`,
    )
    .join("");
  const image = identity.origin + imagePath;
  const ownerId = meetingUrl(identity.origin, englishPath) + "#owner";
  const graph: object[] = [
    { "@type": "Person", "@id": ownerId, name: p.name },
    {
      "@type": "WebPage",
      "@id": canonical + "#webpage",
      url: canonical,
      name: title,
      description,
      inLanguage: locale,
      image,
      about: { "@id": ownerId },
      ...(type && s.enabled
        ? { mainEntity: { "@id": canonical + "#service" } }
        : {}),
    },
  ];
  if (type && s.enabled)
    graph.push({
      "@type": "Service",
      "@id": canonical + "#service",
      url: canonical,
      name: local(type.name),
      description,
      serviceType: mode,
      provider: { "@id": ownerId },
    });
  const meta = (name: string, value: string, property = false) =>
    `<meta ${property ? "property" : "name"}="${name}" content="${esc(value)}">`;
  const head =
    `<title>${esc(title)}</title>` +
    meta("description", compact(description, 320)) +
    (missing
      ? meta("robots", "noindex, nofollow")
      : `<link rel="canonical" href="${esc(canonical)}">${alternates}`) +
    meta("og:type", "website", true) +
    meta("og:title", title, true) +
    meta("og:description", compact(description, 320), true) +
    (missing ? "" : meta("og:url", canonical, true)) +
    meta("og:site_name", p.brand.name || "Scheduler", true) +
    meta("og:locale", spanish ? "es_ES" : "en_US", true) +
    (p.spanishEnabled
      ? meta("og:locale:alternate", spanish ? "en_US" : "es_ES", true)
      : "") +
    meta("og:image", image, true) +
    meta("og:image:type", "image/png", true) +
    meta("og:image:width", "1200", true) +
    meta("og:image:height", "630", true) +
    meta(
      "og:image:alt",
      t("Scheduler clock symbol", "Símbolo de reloj de Scheduler"),
      true,
    ) +
    meta("twitter:card", "summary_large_image") +
    meta("twitter:title", title) +
    meta("twitter:description", compact(description, 320)) +
    meta("twitter:image", image) +
    meta(
      "twitter:image:alt",
      t("Scheduler clock symbol", "Símbolo de reloj de Scheduler"),
    ) +
    (missing
      ? ""
      : `<script type="application/ld+json">${jsonScript({ "@context": "https://schema.org", "@graph": graph })}</script>`);
  const home = meetingUrl(identity.origin, path);
  const content =
    `<section class="hero"><h1>${esc(heading)}</h1>${type ? `<p>${esc(p.name)} · ${esc(details)}</p>` : ""}<p class="intro">${esc(description)}</p></section>` +
    (missing
      ? `<a class="button" href="${esc(home)}">${t("All meetings", "Todas las reuniones")}</a>`
      : s.enabled
        ? `${!type ? `<nav aria-label="${t("Meeting types", "Tipos de reunión")}" class="cluster">${s.types.map((item) => `<a href="${esc(meetingUrl(identity.origin, path, item.id))}">${esc(local(item.name))}</a>`).join("")}</nav>` : ""}<p role="status">${t("Loading available times…", "Cargando horarios disponibles…")}</p>`
        : "");
  return {
    head,
    content,
    missing,
    busy: !missing && s.enabled,
    languageUrl: meetingUrl(
      identity.origin,
      (spanish ? "" : "/es") + englishPath,
      type?.id,
    ),
  };
}

export function publicSitemap(
  p: Presentation,
  identity: PublicIdentity,
): string {
  const paths = ["/" + identity.slug, "/privacy/"];
  const urls = (p.spanishEnabled ? ["", "/es"] : [""]).flatMap((prefix) => [
    ...paths.map((path) => meetingUrl(identity.origin, prefix + path)),
    ...(p.booking?.enabled
      ? p.booking.types.map((type) =>
          meetingUrl(identity.origin, prefix + paths[0], type.id),
        )
      : []),
  ]);
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${esc(url)}</loc></url>`).join("")}</urlset>`;
}
