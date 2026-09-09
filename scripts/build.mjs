import { build } from "esbuild";
import * as sass from "sass";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

await rm("assets/build", { recursive: true, force: true });
await mkdir("assets/build", { recursive: true });
const entries = ["booking", "manage", "admin", "privacy"].map(
  (name) => "web/" + name + ".ts",
);
if (entries.length)
  await build({
    entryPoints: entries,
    outdir: "assets/build",
    bundle: true,
    format: "esm",
    target: ["es2022"],
    minify: true,
    sourcemap: false,
    metafile: true,
  });
try {
  const css = sass.compile("assets/scheduler.scss", {
    style: "compressed",
    loadPaths: ["shared/dust-wave-platform/packages/design-core/styles"],
  });
  await writeFile("assets/build/scheduler.css", css.css);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
execFileSync("bundle", ["exec", "jekyll", "build"], {
  stdio: "inherit",
  env: { ...process.env, JEKYLL_ENV: "production" },
});
