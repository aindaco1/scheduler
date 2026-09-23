#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { callCloudflareJev, evaluateJevCases } from "@dustwave/test-core/jev";
import { controls } from "./jev-cases.mjs";
import { readProject } from "./project-config.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const INPUT_USD_PER_MILLION = 0.042; // TypeSafe reference, 2026-09-23; not a Cloudflare billing cap.
const MAX_QUESTIONS = 100;
const protocolFiles = [
  "scripts/jev-cases.mjs",
  "web/tests/jev.mjs",
  "shared/dust-wave-platform/packages/test-core/src/jev.js",
];

export function protocolDigest() {
  return sha256(
    JSON.stringify(
      protocolFiles.map((file) => [
        file,
        sha256(fs.readFileSync(path.join(ROOT, file))),
      ]),
    ),
  );
}

export function loadPolicy() {
  const policy = JSON.parse(
    fs.readFileSync(path.join(ROOT, "config/jev-policy.json"), "utf8"),
  );
  if (policy.protocolSha256 !== protocolDigest())
    throw new Error(
      "Jev questions or controls changed: review the policy and validation before updating its digest",
    );
  return policy;
}

function approvedReview(report, source, key, result, approvals) {
  if (
    source.expected ||
    !report.complete ||
    report.error ||
    result?.findings[key]?.decision !== "review"
  )
    return undefined;
  return approvals.find(
    (approval) =>
      approval.caseId === source.id &&
      approval.question === key &&
      approval.candidateSha256 === sha256(source.candidate) &&
      approval.requirementSha256 === sha256(source.requirements[key]) &&
      approval.policySha256 === sha256(JSON.stringify(report.policy)) &&
      approval.model === result.model &&
      report.policy.models.includes(result.model) &&
      approval.approvedBy &&
      approval.approvedAt &&
      approval.reason,
  );
}

export function summarize(report, corpus, approvals = []) {
  const labels = {
    calibration: { correct: 0, fail: 0, review: 0, missing: 0 },
    validation: { correct: 0, fail: 0, review: 0, missing: 0 },
  };
  const rendered = { pass: 0, fail: 0, review: 0, missing: 0 };
  const results = new Map(report.cases.map((row) => [row.id, row]));
  let inputTokens = 0;
  let blockingFindings = 0;
  const approvedReviews = [];
  for (const source of corpus) {
    const result = results.get(source.id)?.result;
    inputTokens += result?.usage.input_tokens || 0;
    const findings = result?.findings || {};
    for (const key of Object.keys(source.requirements)) {
      if (findings[key]?.decision === (source.expected || "pass")) continue;
      const approval = approvedReview(report, source, key, result, approvals);
      if (approval) approvedReviews.push(approval);
      else blockingFindings++;
    }
    const decisions = Object.keys(source.requirements).map(
      (key) => findings[key]?.decision,
    );
    const bucket = source.expected ? labels[source.split] : rendered;
    if (decisions.some((d) => !d)) bucket.missing++;
    else if (decisions.includes("review")) bucket.review++;
    else if (decisions.every((d) => d === (source.expected || "pass")))
      bucket[source.expected ? "correct" : "pass"]++;
    else bucket.fail++;
  }
  const passed = report.complete && !report.error && blockingFindings === 0;
  return {
    passed,
    controls: labels,
    rendered,
    blockingFindings,
    approvedReviews,
    inputTokens,
    estimatedInferenceUsd: (inputTokens * INPUT_USD_PER_MILLION) / 1_000_000,
  };
}

export function exitCode(report, corpus, dryRun = false, approvals = []) {
  if (dryRun) return 0;
  if (!report.complete || report.error) return 2;
  return summarize(report, corpus, approvals).passed ? 0 : 1;
}

export function budget(questionCount, maximum) {
  if (!Number.isFinite(maximum) || maximum <= 0 || maximum > 1)
    throw new Error(
      "Estimated spending limit must be positive and no more than $1",
    );
  const reservedEstimateUsd =
    (questionCount * 32_000 * INPUT_USD_PER_MILLION) / 1_000_000;
  if (questionCount > MAX_QUESTIONS || reservedEstimateUsd > maximum)
    throw new Error(
      "Jev question/estimated spending limit exceeded before authentication",
    );
  return reservedEstimateUsd;
}

export function reviewMarkdown(report, corpus, metadata, approvals = []) {
  const summary = summarize(report, corpus, approvals);
  const lines = [
    "# Scheduler Jev development check",
    "",
    `Mode: ${metadata.mode}. Complete: ${report.complete}. Scheduler gate passed: ${summary.passed}.`,
    `Network attempts: ${report.networkAttempts}. Questions: ${report.questionCount}.`,
    ...(report.error ? [`Error: ${report.error}.`] : []),
    "",
    `Controls: ${JSON.stringify(summary.controls)}.`,
    `Rendered: ${JSON.stringify(summary.rendered)}.`,
    `Blocking findings: ${summary.blockingFindings}. Applied human reviews: ${summary.approvedReviews.length}.`,
    "",
    "The fixed 0.10 margin is a conservative starting policy, not a measured accuracy guarantee. Exact scheduling, authorization and provider tests remain authoritative. This check does not establish deployment, calendar writes, recipient delivery or fluent-speaker acceptance.",
    "",
    "## Findings",
    "",
  ];
  const results = new Map(report.cases.map((row) => [row.id, row]));
  for (const source of corpus) {
    const row = results.get(source.id);
    const findings = Object.entries(source.requirements).filter(
      ([key]) =>
        row?.result?.findings[key]?.decision !== (source.expected || "pass"),
    );
    if (!findings.length && !row?.error) continue;
    lines.push(`### ${source.id}`, "", ...(row?.error ? [row.error, ""] : []));
    for (const [key, requirement] of findings) {
      const finding = row?.result?.findings[key];
      const approval = approvedReview(
        report,
        source,
        key,
        row?.result,
        approvals,
      );
      lines.push(
        `- ${finding?.decision || "unevaluated"} (expected ${source.expected || "pass"}): ${requirement} Probabilities: ${JSON.stringify(finding?.probabilities || {})}.`,
      );
      if (approval)
        lines.push(
          `  Human review accepted by ${approval.approvedBy} on ${approval.approvedAt}: ${approval.reason}`,
        );
    }
    lines.push(
      "",
      ...source.candidate.split("\n").map((line) => `> ${line}`),
      "",
    );
  }
  return lines.join("\n");
}

async function credentials() {
  const { config } = await readProject(path.join(ROOT, "wrangler.jsonc"));
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.account_id;
  if (!/^[a-fA-F0-9]{32}$/.test(accountId || ""))
    throw new Error("Cloudflare account configuration is missing");
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token && !process.env.CI) {
    try {
      const auth = JSON.parse(
        execFileSync(
          process.execPath,
          [
            path.join(ROOT, "node_modules/wrangler/bin/wrangler.js"),
            "auth",
            "token",
            "--json",
          ],
          {
            cwd: ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 45_000,
          },
        ),
      );
      token = auth.token || auth.access_token;
    } catch {
      /* Fail below without logging credentials or CLI output. */
    }
  }
  if (typeof token !== "string" || !token.trim())
    throw new Error("Cloudflare authentication is missing");
  return { accountId, token };
}

export async function main(args = process.argv.slice(2)) {
  if (args.includes("--help")) {
    console.log(
      "npm run test:jev -- [--dry-run] [--max-estimated-usd=0.25]\nLive by default. Fresh local build/browser/email capture, then synthetic Jev evaluation.\nnpm run check also runs all deterministic checks. Exit 1: findings/review; 2: incomplete/setup error.\n--dry-run makes no model/authentication calls and is not a passing live gate.",
    );
    return 0;
  }
  if (
    args.some(
      (arg) =>
        !["--check", "--dry-run"].includes(arg) &&
        !arg.startsWith("--max-estimated-usd="),
    )
  )
    throw new Error("Unknown Jev argument");
  const dryRun = args.includes("--dry-run"),
    fullCheck = args.includes("--check");
  const maximum = Number(
    args.find((arg) => arg.startsWith("--max-estimated-usd="))?.split("=")[1] ??
      0.25,
  );
  budget(0, maximum); // Reject invalid limits before running local subprocesses.
  const policy = loadPolicy();
  const approvals = JSON.parse(
    fs.readFileSync(path.join(ROOT, "config/jev-reviews.json"), "utf8"),
  );
  if (!Array.isArray(approvals))
    throw new Error("Invalid Jev review approvals");
  const output = path.join(
    ROOT,
    "work/jev",
    new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      crypto.randomBytes(3).toString("hex"),
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output);
  console.log(
    `Jev evidence: ${path.relative(ROOT, output)} (${dryRun ? "preview; no model calls" : "live gate"})`,
  );
  const capturePath = path.join(output, "rendered.json");
  const run = (script) =>
    execFileSync("npm", ["run", script], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, SCHEDULER_JEV_OUTPUT: capturePath },
    });
  if (fullCheck) run("check:offline");
  else {
    run("build");
    run("test:browser");
  }
  const rendered = JSON.parse(fs.readFileSync(capturePath, "utf8"));
  if (
    rendered.length !== 34 ||
    rendered.some((row) => row.expected || row.split)
  )
    throw new Error("Synthetic renderer capture is incomplete");
  const corpus = [...controls, ...rendered];
  const sourcePaths = [
    "scripts/jev-evaluation.mjs",
    "scripts/jev-cases.mjs",
    "web/tests/jev.mjs",
    "web/manage.ts",
    "web/booking.ts",
    "web/slots.ts",
    "web/common.ts",
    "worker/src/email.ts",
    "config/jev-policy.json",
    "config/jev-reviews.json",
    ...protocolFiles.slice(1),
  ];
  const questionCount = corpus.reduce(
    (n, row) => n + Object.keys(row.requirements).length,
    0,
  );
  const metadata = {
    mode: dryRun ? "dry-run" : "live",
    createdAt: new Date().toISOString(),
    deterministicScope: fullCheck
      ? "complete check:offline plus synthetic capture"
      : "browser suite and email capture",
    reservedEstimateUsd: budget(questionCount, maximum),
    inputUsdPerMillion: INPUT_USD_PER_MILLION,
    corpusSha256: sha256(JSON.stringify(corpus)),
    sourceHashes: Object.fromEntries(
      sourcePaths.map((file) => [
        file,
        sha256(fs.readFileSync(path.join(ROOT, file))),
      ]),
    ),
    candidateHashes: Object.fromEntries(
      corpus.map((row) => [row.id, sha256(row.candidate)]),
    ),
  };
  fs.writeFileSync(
    path.join(output, "corpus.json"),
    JSON.stringify(corpus, null, 2) + "\n",
  );
  const onProgress = async (report) => {
    // Shared evidence is advisory; Scheduler owns the separate mandatory gate.
    fs.writeFileSync(
      path.join(output, "report.json"),
      JSON.stringify(
        {
          ...metadata,
          evaluation: report,
          schedulerGate: summarize(report, corpus, approvals),
        },
        null,
        2,
      ) + "\n",
    );
    fs.writeFileSync(
      path.join(output, "review.md"),
      reviewMarkdown(report, corpus, metadata, approvals),
    );
  };
  let report = await evaluateJevCases(corpus, {
    policy,
    maxQuestions: MAX_QUESTIONS,
    onProgress,
  });
  if (!dryRun) {
    let auth;
    try {
      auth = await credentials();
    } catch {
      report.error =
        "Jev authentication unavailable. Configure CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, or use an existing local Wrangler login. No live evaluation was completed";
      await onProgress(report);
      console.error(report.error);
      return 2;
    }
    report = await evaluateJevCases(corpus, {
      policy,
      maxQuestions: MAX_QUESTIONS,
      onProgress,
      call: (request) => callCloudflareJev(request, auth),
    });
  }
  console.log(
    JSON.stringify(
      {
        output: path.relative(ROOT, output),
        mode: metadata.mode,
        complete: report.complete,
        networkAttempts: report.networkAttempts,
        questionCount,
        ...summarize(report, corpus, approvals),
      },
      null,
      2,
    ),
  );
  return exitCode(report, corpus, dryRun, approvals);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch(() => {
      console.error(
        "Jev check stopped before complete evidence. Check the local deterministic output, dependencies, policy digest and spending limit; no automatic retry or fallback was performed.",
      );
      process.exitCode = 2;
    });
}
