import { readFile } from "node:fs/promises";
import { parse } from "jsonc-parser";
export async function readProject(path = "wrangler.jsonc") {
  const errors = [];
  const config = parse(await readFile(path, "utf8"), errors, {
    allowTrailingComma: true,
  });
  if (errors.length) throw Error("Invalid Wrangler JSONC");
  const {
    PUBLIC_ORIGIN: origin,
    OWNER_SLUG: slug,
    OWNER_NAME: name = "Your name",
    OWNER_TIMEZONE: timezone = "UTC",
    BRAND_NAME: brand = "Scheduler",
  } = config.vars;
  validateIdentity({ origin, slug, name, timezone, brand });
  return { config, site: { origin, slug, name, timezone, brand } };
}
export function validateIdentity({ origin, slug, name, timezone, brand }) {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port
  )
    throw Error(
      "Use a production HTTPS origin without a path, credentials, query or trailing slash.",
    );
  if (
    !/^[a-z][a-z0-9-]{0,59}$/.test(slug) ||
    [
      "es",
      "api",
      "admin",
      "manage",
      "privacy",
      "assets",
      "pages",
      "index",
      "404",
      "robots",
      "sitemap",
    ].includes(slug)
  )
    throw Error(
      "Choose a lowercase booking slug that is not a reserved route.",
    );
  for (const value of [name, brand])
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 100 ||
      /[\x00-\x1f\x7f]/.test(value)
    )
      throw Error("Name and brand must be plain text, 1–100 characters.");
  new Intl.DateTimeFormat("en", { timeZone: timezone });
}
