// Remove only reproducible consumer outputs. Never touch credentials, dependencies,
// pinned submodules or .wrangler/state (the local development database).
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
const { values } = parseArgs({ options: { "dry-run": { type: "boolean" } } });
const root = new URL("../", import.meta.url);
const outputs = [
  "_site",
  "assets/build",
  "assets/social",
  "_data/build.json",
  "_data/deployment.json",
  ".jekyll-cache",
  ".sass-cache",
  ".wrangler/tmp",
  "coverage",
  "test-results",
  "playwright-report",
  "work/frontend",
  "work/audit",
];
for (const output of outputs) {
  if (!values["dry-run"])
    await rm(fileURLToPath(new URL(output, root)), {
      recursive: true,
      force: true,
    });
  console.log(
    `${values["dry-run"] ? "Would remove" : "Removed if present"}: ${output}`,
  );
}
