// Source + generated-artifact gates. No provider access, credentials, or live writes.
import { readFile, readdir, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { parse } from "acorn";
import { transform } from "esbuild";
import assert from "node:assert/strict";
import { readProject } from "./project-config.mjs";
const { site } = await readProject();
const manifest = JSON.parse(await readFile("_data/build.json", "utf8"));
const budget = JSON.parse(
  await readFile("config/quality-budgets.json", "utf8"),
);
const meta = JSON.parse(await readFile("work/audit/bundle-meta.json", "utf8"));
const metrics = { assets: {}, entries: {}, translations: 0, pages: 0 };
for (const file of Object.keys(meta.outputs)) {
  const body = await readFile(file);
  metrics.assets[file] = { bytes: body.length, gzip: gzipSync(body).length };
}
for (const [entry, limit] of Object.entries(budget.entryGzipBytes)) {
  const visited = new Set();
  const visit = (path) => {
    if (visited.has(path)) return;
    visited.add(path);
    for (const child of meta.outputs[path]?.imports || [])
      if (!child.external) visit(child.path);
  };
  visit(manifest[entry].slice(1));
  const bytes = [...visited].reduce(
    (n, file) => n + metrics.assets[file].gzip,
    0,
  );
  metrics.entries[entry] = { gzip: bytes, modules: visited.size };
  assert(bytes <= limit, `${entry}: ${bytes} gzip bytes exceeds ${limit}`);
}
assert(
  Object.values(metrics.assets).reduce((n, a) => n + a.bytes, 0) <=
    budget.totalJavaScriptBytes,
  "Total JS exceeds budget",
);
const css = await readFile(manifest.css.slice(1));
assert(
  css.length <= budget.cssBytes && gzipSync(css).length <= budget.cssGzipBytes,
  "CSS exceeds budget",
);
const publicPaths = [
  `/${site.slug}`,
  `/es/${site.slug}`,
  "/privacy/",
  "/es/privacy/",
];
const privatePaths = ["/admin/", "/es/admin/", "/manage/", "/es/manage/"];
async function htmlFor(path) {
  return readFile(
    `_site${path.endsWith("/") ? path + "index" : path}.html`,
    "utf8",
  );
}
const attrs = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
  );
for (const path of [...publicPaths, ...privatePaths]) {
  const html = await htmlFor(path),
    spanish = path.startsWith("/es/");
  assert(
    html.includes(`<html lang="${spanish ? "es" : "en"}">`),
    `${path}: HTML language`,
  );
  assert(!/\{[{%]/.test(html), `${path}: unrendered template`);
  assert(
    html.includes('href="#main"') && html.includes('id="main"'),
    `${path}: skip link`,
  );
  const links = [...html.matchAll(/<link\b[^>]*>/g)].map((m) => attrs(m[0]));
  const isPublic = publicPaths.includes(path);
  if (isPublic) {
    assert(
      links.some((l) => l.rel === "canonical" && l.href === site.origin + path),
      `${path}: canonical`,
    );
    for (const lang of ["en", "es", "x-default"]) {
      const enPath = path.replace(/^\/es\//, "/");
      const expected = site.origin + (lang === "es" ? "/es" : "") + enPath;
      assert(
        links.some((l) => l.hreflang === lang && l.href === expected),
        `${path}: reciprocal ${lang} alternate`,
      );
    }
    assert(
      /<meta\s+property="og:title"/.test(html) &&
        /<meta\s+name="description"/.test(html),
      `${path}: public metadata`,
    );
  } else {
    assert(
      /name="robots" content="noindex, nofollow"/.test(html),
      `${path}: private noindex`,
    );
    assert(
      !links.some((l) => l.rel === "canonical" || l.hreflang),
      `${path}: no private SEO metadata`,
    );
  }
  for (const match of html.matchAll(
    /(?:src|href)="(\/assets\/[^"?]+)(?:\?[^\"]*)?"/g,
  ))
    await stat("_site" + match[1]);
  metrics.pages++;
}
const sitemap = await readFile("_site/sitemap.xml", "utf8");
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .sort();
assert.deepEqual(
  locations,
  publicPaths.map((p) => site.origin + p).sort(),
  "Sitemap is exactly the public locale routes",
);
const robots = await readFile("_site/robots.txt", "utf8");
assert(
  robots.includes(`Sitemap: ${site.origin}/sitemap.xml`),
  "Robots sitemap origin",
);
assert(
  !/^Disallow:.*manage/m.test(robots),
  "Management shells must be crawlable to expose noindex",
);
// t(en, es) is the existing compact catalog. Parse code rather than guessing at commas/quotes.
const sources = (await readdir("web")).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".d.ts"),
);
const expressions = (node, code) =>
  node?.type === "TemplateLiteral"
    ? node.expressions
        .map((n) => code.slice(n.start, n.end).replace(/\s/g, ""))
        .sort()
    : [];
const reviews = [];
for (const file of sources) {
  const code = (
    await transform(await readFile("web/" + file, "utf8"), {
      loader: "ts",
      target: "es2022",
    })
  ).code;
  const tree = parse(code, { ecmaVersion: "latest", sourceType: "module" });
  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === "t"
    ) {
      assert(
        node.arguments.length === 2,
        `${file}: t() needs English and Spanish`,
      );
      for (const a of node.arguments)
        assert(
          !(
            a.type === "Literal" &&
            typeof a.value === "string" &&
            !a.value.trim()
          ),
          `${file}: empty translation`,
        );
      assert.deepEqual(
        expressions(node.arguments[0], code),
        expressions(node.arguments[1], code),
        `${file}: translation placeholders differ`,
      );
      reviews.push({
        file,
        en: code.slice(node.arguments[0].start, node.arguments[0].end),
        es: code.slice(node.arguments[1].start, node.arguments[1].end),
      });
      metrics.translations++;
    }
    for (const child of Object.values(node))
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === "object") walk(child);
  }
  walk(tree);
}
// Check path boundaries and high-confidence credential signatures without printing matches.
const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
for (const file of tracked) {
  if (file.startsWith("shared/")) continue;
  assert(
    !/(^|\/)(\.env|\.dev\.vars)(\.|$)/.test(file) || file.endsWith(".example"),
    `${file}: tracked secrets file`,
  );
  if (!(await stat(file)).isFile()) continue;
  const text = await readFile(file, "utf8");
  assert(
    !/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk_live_[A-Za-z0-9]{20,}|\bgh[pousr]_[A-Za-z0-9]{30,}/.test(
      text,
    ),
    `${file}: possible credential; inspect privately`,
  );
}
for (const path of [
  "worker",
  "web",
  "scripts",
  "docs",
  "config",
  "shared",
  "node_modules",
  ".dev.vars",
  "wrangler.jsonc",
  "package-lock.json",
])
  await assert.rejects(
    stat(resolve("_site", path)),
    `Private/source path published: ${path}`,
  );
await mkdir("work/audit", { recursive: true });
await writeFile("work/audit/quality.json", JSON.stringify(metrics, null, 2));
await writeFile(
  "work/audit/translation-review.json",
  JSON.stringify(
    {
      note: "Review packet, not native-speaker approval. Paired inline UI strings; static pages and email reviewed separately.",
      strings: reviews,
    },
    null,
    2,
  ),
);
console.log(
  `Quality gates passed: ${metrics.pages} localized pages, ${metrics.translations} paired messages, crawl/privacy boundaries and asset budgets.`,
);
console.log(JSON.stringify(metrics.entries));
