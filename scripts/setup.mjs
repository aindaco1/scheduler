import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import { readProject, validateIdentity } from "./project-config.mjs";
const { values: v } = parseArgs({
  options: Object.fromEntries(
    [
      "origin",
      "slug",
      "name",
      "timezone",
      "brand",
      "worker",
      "account",
      "turnstile",
    ]
      .map((key) => [key, { type: "string" }])
      .concat([
        ["help", { type: "boolean" }],
        ["check", { type: "boolean" }],
      ]),
  ),
});
if (v.help) {
  console.log(
    'npm run setup -- --origin https://schedule.example.com --slug your-name --name "Your Name" --brand "Your Brand" --timezone America/Denver --worker my-scheduler --account YOUR_CLOUDFLARE_ACCOUNT_ID --turnstile YOUR_PUBLIC_SITE_KEY\nRun in a new fork before first deployment. No credentials are requested, generated or published. --check validates the current configuration.',
  );
} else {
  const { config } = await readProject();
  if (v.check)
    console.log("Deployment identity and route configuration are valid.");
  else {
    for (const key of [
      "origin",
      "slug",
      "name",
      "timezone",
      "worker",
      "account",
      "turnstile",
    ])
      if (!v[key]) throw Error(`Missing --${key}; run npm run setup -- --help`);
    const identity = { ...v, brand: v.brand || "Scheduler" };
    validateIdentity(identity);
    if (!/^[a-z][a-z0-9-]{0,62}$/.test(v.worker))
      throw Error("Invalid Worker name.");
    if (!/^[a-f0-9]{32}$/.test(v.account))
      throw Error("Use your 32-character Cloudflare account ID.");
    if (
      !/^[A-Za-z0-9_-]{10,100}$/.test(v.turnstile) ||
      v.turnstile.startsWith("1x000")
    )
      throw Error("Use your public production Turnstile site key.");
    Object.assign(config, {
      name: v.worker,
      account_id: v.account,
      routes: [{ pattern: new URL(v.origin).hostname, custom_domain: true }],
      workers_dev: false,
      preview_urls: false,
    });
    Object.assign(config.vars, {
      PUBLIC_ORIGIN: v.origin,
      OWNER_SLUG: v.slug,
      OWNER_NAME: v.name,
      OWNER_TIMEZONE: v.timezone,
      BRAND_NAME: identity.brand,
      TURNSTILE_SITE_KEY: v.turnstile,
    });
    await writeFile("wrangler.jsonc", JSON.stringify(config, null, 2) + "\n");
    console.log(
      `Configured ${v.origin}/${v.slug}. Next: npm run check, provision Worker secrets, and deploy. Existing runtime settings are never changed by this script.`,
    );
  }
}
