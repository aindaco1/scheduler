// Explicit live drill: creates and deletes only a uniquely named synthetic Worker.
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { readProject } from "./project-config.mjs";

if (!process.argv.includes("--live-isolated"))
  throw Error(
    "Use --live-isolated to create a temporary Cloudflare recovery fixture.",
  );
const { config: project } = await readProject();
await mkdir("work", { recursive: true });
const directory = await mkdtemp(resolve("work/recovery-drill-"));
const name = "scheduler-recovery-" + randomBytes(8).toString("hex");
const token = randomBytes(32).toString("hex");
const configPath = join(directory, "wrangler.json");
const secretsPath = join(directory, ".env.json");
await writeFile(
  configPath,
  JSON.stringify({
    name,
    account_id: project.account_id,
    main: resolve("scripts/recovery-drill/worker.ts"),
    compatibility_date: project.compatibility_date,
    compatibility_flags: ["nodejs_compat"],
    workers_dev: true,
    preview_urls: false,
    observability: { enabled: false },
    durable_objects: {
      bindings: [{ name: "DRILL", class_name: "RecoveryDrill" }],
    },
    migrations: [{ tag: "v1", new_sqlite_classes: ["RecoveryDrill"] }],
    vars: {
      OWNER_NAME: "Recovery fixture",
      OWNER_SLUG: "recovery-fixture",
      OWNER_TIMEZONE: "UTC",
      BRAND_NAME: "Fixture",
      PUBLIC_ORIGIN: "https://recovery.example.invalid",
    },
  }),
  { mode: 0o600 },
);
await writeFile(
  secretsPath,
  JSON.stringify({
    DRILL_TOKEN: token,
    ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  }),
  { mode: 0o600 },
);
function wrangler(args) {
  const result = spawnSync(
    process.execPath,
    [
      resolve("node_modules/wrangler/bin/wrangler.js"),
      ...args,
      "--config",
      configPath,
    ],
    { encoding: "utf8", timeout: 180_000 },
  );
  return result;
}
const evidence = {
  started: new Date().toISOString(),
  worker: name,
  syntheticOnly: true,
  productionNamespaceUsed: false,
  providerWrites: 0,
  cleanup: false,
};
try {
  const deployment = wrangler(["deploy", "--secrets-file", secretsPath]);
  await writeFile(
    join(directory, "deploy.log"),
    (deployment.stdout || "") + (deployment.stderr || ""),
    { mode: 0o600 },
  );
  assert.equal(
    deployment.status,
    0,
    "Isolated deployment failed; inspect private drill log",
  );
  const url = deployment.stdout.match(
    /https:\/\/[a-z0-9.-]+\.workers\.dev/,
  )?.[0];
  assert(
    url && new URL(url).hostname.startsWith(name + "."),
    "Expected isolated Worker URL",
  );
  async function call(path, body = "") {
    const response = await fetch(url + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    assert(
      response.ok,
      `Recovery operation ${path} failed (${response.status})`,
    );
    return response.json();
  }
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(url + "/ready", {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  assert(ready, "New isolated Worker did not become reachable");
  assert.equal(
    (await fetch(url + "/snapshot", { method: "POST" })).status,
    404,
  );
  const before = await call("/seed");
  assert(
    before.snapshot.credentialRecovered &&
      before.snapshot.managementRecovered &&
      before.snapshot.heldEmailRecovered,
  );
  await call("/damage");
  const damaged = await call("/snapshot");
  assert.notEqual(damaged.digest, before.snapshot.digest);
  const restore = await call("/restore", before.bookmark);
  assert(restore.undo);
  await call("/restart");
  const after = await call("/snapshot");
  assert.deepEqual(
    after,
    before.snapshot,
    "Restored SQL, KV, encrypted payloads and alarm must match",
  );
  const quarantine = await call("/quarantine");
  assert.deepEqual(quarantine, {
    paused: true,
    sessions: 0,
    alarm: null,
    runnableJobs: 0,
  });
  Object.assign(evidence, {
    passed: true,
    completed: new Date().toISOString(),
    tables: after.counts,
    exactSnapshotMatch: true,
    credentialRecovered: after.credentialRecovered,
    managementRecovered: after.managementRecovered,
    heldEmailRecovered: after.heldEmailRecovered,
    alarmRecovered: after.alarm === before.snapshot.alarm,
    undoBookmarkReturned: true,
    restoredStateQuarantined: true,
  });
} finally {
  assert(/^scheduler-recovery-[a-f0-9]{16}$/.test(name));
  const deletion = wrangler(["delete", "--force"]);
  await writeFile(
    join(directory, "cleanup.log"),
    (deletion.stdout || "") + (deletion.stderr || ""),
    { mode: 0o600 },
  );
  evidence.cleanup = deletion.status === 0;
  await writeFile(
    join(directory, "evidence.json"),
    JSON.stringify(evidence, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      evidence: join(directory, "evidence.json"),
      passed: evidence.passed === true,
      cleanup: evidence.cleanup,
    }),
  );
  assert(
    evidence.cleanup,
    "Isolated Worker cleanup failed; inspect the drill directory",
  );
}
