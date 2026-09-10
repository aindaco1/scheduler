import { build } from "esbuild";
import * as sass from "sass";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readProject } from "./project-config.mjs";
import { execFileSync } from "node:child_process";

await rm("assets/build", { recursive: true, force: true });
await mkdir("assets/build", { recursive: true });
const { site } = await readProject();
await writeFile("_data/deployment.json", JSON.stringify(site));
const manifest = {};
const entries = ["booking", "manage", "admin", "privacy"].map(
  (name) => "web/" + name + ".ts",
);
const result = await build({
  entryPoints: entries,
  outdir: "assets/build",
  entryNames: "[name]-[hash]",
  bundle: true,
  splitting: true,
  chunkNames: "shared-[hash]",
  format: "esm",
  target: ["es2022"],
  minify: true,
  sourcemap: false,
  metafile: true,
});
for (const [file, info] of Object.entries(result.metafile.outputs)) {
  if (info.entryPoint)
    manifest[info.entryPoint.split("/").at(-1).replace(".ts", "")] = "/" + file;
}
try {
  const css = sass.compile("assets/scheduler.scss", {
    style: "compressed",
    loadPaths: ["shared/dust-wave-platform/packages/design-core/styles"],
  });
  const hash = createHash("sha256").update(css.css).digest("hex").slice(0, 12);
  manifest.css = `/assets/build/scheduler-${hash}.css`;
  await writeFile(manifest.css.slice(1), css.css);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
await writeFile("_data/build.json", JSON.stringify(manifest));
await mkdir("work/audit", { recursive: true });
await writeFile("work/audit/bundle-meta.json", JSON.stringify(result.metafile));
execFileSync("bundle", ["exec", "jekyll", "build"], {
  stdio: "inherit",
  env: { ...process.env, JEKYLL_ENV: "production" },
});
