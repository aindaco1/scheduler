// Read-only production probe. Evidence deliberately excludes response bodies and URLs with guest tokens.
import { parseArgs } from "node:util";
import { writeFile, mkdir } from "node:fs/promises";
import { readProject } from "./project-config.mjs";
const { values } = parseArgs({
  options: {
    samples: { type: "string", default: "10" },
    output: { type: "string", default: "work/audit/calendar-benchmark.json" },
  },
});
const count = Number(values.samples);
if (!Number.isInteger(count) || count < 2 || count > 30)
  throw Error("Use 2–30 sequential samples.");
const { site } = await readProject();
const configResponse = await fetch(site.origin + "/api/config", {
  signal: AbortSignal.timeout(15000),
});
if (!configResponse.ok)
  throw Error(`Config unavailable (${configResponse.status})`);
const { settings, ready } = await configResponse.json();
if (!ready) throw Error("Bookings are paused or connections need attention.");
const type =
  settings.types.find((t) => t.enabled && t.mode !== "in-person") ||
  settings.types.find((t) => t.enabled);
const location = type.mode === "in-person" ? type.locationIds[0] : "";
const from = new Date();
from.setUTCHours(0, 0, 0, 0);
const params = new URLSearchParams({
  type: type.id,
  location,
  from: from.toISOString(),
  to: new Date(+from + 7 * 86400000).toISOString(),
});
const samples = [];
for (let i = 0; i < count; i++) {
  const start = performance.now();
  const response = await fetch(site.origin + "/api/availability?" + params, {
    signal: AbortSignal.timeout(90000),
  });
  const payload = await response.json();
  samples.push({
    ms: Math.round(performance.now() - start),
    status: response.status,
  });
  if (!response.ok || !Array.isArray(payload.slots))
    throw Error(
      `Availability probe failed (${response.status}); no body retained.`,
    );
}
const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
const report = {
  at: new Date().toISOString(),
  samples,
  summary: {
    minimum: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    maximum: sorted.at(-1),
    ...(count >= 30 ? { p95: sorted[Math.ceil(count * 0.95) - 1] } : {}),
  },
  note: "Sequential read-only samples; first sample may be cold. Not real-user Core Web Vitals or sustained-load evidence.",
};
await mkdir("work/audit", { recursive: true });
await writeFile(values.output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report.summary));
