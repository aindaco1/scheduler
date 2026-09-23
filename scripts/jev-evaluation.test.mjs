import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { evaluateJevCases } from "@dustwave/test-core/jev";
import {
  budget,
  exitCode,
  loadPolicy,
  summarize,
  reviewMarkdown,
} from "./jev-evaluation.mjs";

const policy = { minimumMargin: 0.1, models: ["jev-1.13.0"] };
const corpus = [
  {
    id: "negative-control",
    split: "calibration",
    expected: "fail",
    candidate: "Wrong",
    requirements: { meaning: "Pending" },
  },
  {
    id: "positive-control",
    split: "validation",
    expected: "pass",
    candidate: "Correct",
    requirements: { meaning: "Confirmed" },
  },
  {
    id: "rendered",
    candidate: "Current UI",
    requirements: { meaning: "Pending", policy: "Retry" },
  },
];
const response = (request, choice, model = "jev-1.13.0", probabilities) => ({
  result: {
    model,
    usage: { input_tokens: 12, output_tokens: 0 },
    answers: Object.fromEntries(
      Object.keys(request.input.questions).map((key) => [
        key,
        {
          type: "choice",
          choice,
          probabilities: probabilities || {
            pass: choice === "pass" ? 0.98 : 0.01,
            fail: choice === "fail" ? 0.98 : 0.01,
            uncertain: choice === "uncertain" ? 0.98 : 0.01,
          },
        },
      ]),
    ),
  },
});
const run = (modify = (_request, result) => result) =>
  evaluateJevCases(corpus, {
    policy,
    call: async (request) =>
      modify(
        request,
        response(
          request,
          request.input.state.candidate === "Wrong" ? "fail" : "pass",
        ),
      ),
  });

test("required gate accepts correctly rejected bad controls and all actual output passing", async () => {
  const report = await run();
  assert.equal(exitCode(report, corpus), 0);
  assert.equal(summarize(report, corpus).controls.calibration.correct, 1);
  assert.equal(report.releaseAccepted, false);
});
test("a false pass on an intentionally bad control blocks the gate", async () => {
  const report = await run((request, result) =>
    request.input.state.candidate === "Wrong"
      ? response(request, "pass")
      : result,
  );
  assert.equal(exitCode(report, corpus), 1);
  assert.equal(summarize(report, corpus).controls.calibration.fail, 1);
});
test("a real rendered failure blocks even when every control is correct", async () => {
  const report = await run((request, result) =>
    request.input.state.candidate === "Current UI"
      ? response(request, "fail")
      : result,
  );
  assert.equal(exitCode(report, corpus), 1);
  assert.match(reviewMarkdown(report, corpus, { mode: "live" }), /Current UI/);
});
test("near ties, uncertain answers and unknown models cannot pass", async () => {
  for (const [choice, model, probabilities] of [
    ["pass", "jev-1.13.0", { pass: 0.52, fail: 0.47, uncertain: 0.01 }],
    ["uncertain", "jev-1.13.0", undefined],
    ["pass", "jev-new", undefined],
  ]) {
    const report = await run((request, result) =>
      request.input.state.candidate === "Current UI"
        ? response(request, choice, model, probabilities)
        : result,
    );
    assert.equal(exitCode(report, corpus), 1);
    assert.equal(summarize(report, corpus).rendered.review, 1);
  }
});
test("incomplete/malformed provider evidence stops requests and returns setup failure", async () => {
  for (const call of [
    async () => {
      throw new Error("secret-provider-body");
    },
    async () => ({ result: {} }),
  ]) {
    const report = await evaluateJevCases(corpus, { policy, call });
    assert.equal(report.networkAttempts, 1);
    assert.equal(exitCode(report, corpus), 2);
    assert.equal(summarize(report, corpus).passed, false);
    assert.ok(!JSON.stringify(report).includes("secret-provider-body"));
  }
});
test("preview is explicitly incomplete; absence of a required answer never counts as pass", async () => {
  const preview = await evaluateJevCases(corpus, { policy });
  assert.equal(preview.networkAttempts, 0);
  assert.equal(exitCode(preview, corpus, true), 0);
  assert.equal(exitCode(preview, corpus), 2);
  assert.equal(summarize(preview, corpus).passed, false);
  const report = await run();
  delete report.cases[2].result.findings.policy;
  assert.equal(exitCode(report, corpus), 1);
});
test("fixed controls are bound to the reviewed protocol; limits reject excessive spend", () => {
  assert.deepEqual(loadPolicy().models, policy.models);
  assert.equal(budget(78, 0.25), 0.104832);
  for (const value of [0, -1, 2, NaN]) assert.throws(() => budget(78, value));
  assert.throws(() => budget(101, 1));
  assert.throws(() => budget(78, 0.001));
});

const hash = (value) => createHash("sha256").update(value).digest("hex");
const reviewReport = () =>
  run((request, result) => {
    if (request.input.state.candidate === "Current UI") {
      result.result.answers.meaning = response(request, "pass", "jev-1.13.0", {
        pass: 0.51,
        fail: 0.48,
        uncertain: 0.01,
      }).result.answers.meaning;
    }
    return result;
  });
const approvalFor = (report, source = corpus[2], question = "meaning") => ({
  caseId: source.id,
  question,
  candidateSha256: hash(source.candidate),
  requirementSha256: hash(source.requirements[question]),
  policySha256: hash(JSON.stringify(report.policy)),
  model: "jev-1.13.0",
  approvedBy: "Fixture owner",
  approvedAt: "2026-09-23",
  reason: "Reviewed fixture text communicates the pending state.",
});

test("explicit human review accepts only its finding while preserving raw evidence", async () => {
  const report = await reviewReport();
  const approvals = [approvalFor(report)];
  assert.equal(exitCode(report, corpus), 1);
  assert.equal(exitCode(report, corpus, false, approvals), 0);
  const summary = summarize(report, corpus, approvals);
  assert.equal(summary.rendered.review, 1);
  assert.equal(summary.approvedReviews.length, 1);
  assert.equal(report.cases[2].result.findings.meaning.decision, "review");
  assert.equal(report.releaseAccepted, false);
  assert.match(
    reviewMarkdown(report, corpus, { mode: "live" }, approvals),
    /Human review accepted by Fixture owner/,
  );
});

test("changed text, rubric, policy, case, question or model invalidates the approval", async () => {
  const report = await reviewReport();
  const approvals = [approvalFor(report)];
  for (const mutate of [
    (r, c) => {
      c[2].candidate += " Changed";
    },
    (r, c) => {
      c[2].requirements.meaning = "Changed requirement";
    },
    (r) => {
      r.policy.minimumMargin = 0.2;
    },
    (r, c) => {
      r.cases[2].id = c[2].id = "different-case";
    },
    (r, c) => {
      c[2].requirements.changed = c[2].requirements.meaning;
      delete c[2].requirements.meaning;
      r.cases[2].result.findings.changed = r.cases[2].result.findings.meaning;
      delete r.cases[2].result.findings.meaning;
    },
    (r) => {
      r.cases[2].result.model = "jev-new";
    },
  ]) {
    const changedReport = structuredClone(report),
      changedCorpus = structuredClone(corpus);
    mutate(changedReport, changedCorpus);
    assert.equal(exitCode(changedReport, changedCorpus, false, approvals), 1);
  }
});

test("review approval cannot hide a failure, another review, missing evidence or incomplete evaluation", async () => {
  const report = await reviewReport();
  const approvals = [approvalFor(report)];
  for (const mutate of [
    (r) => {
      r.cases[2].result.findings.meaning.decision = "fail";
    },
    (r) => {
      r.cases[2].result.findings.policy.decision = "fail";
    },
    (r) => {
      r.cases[2].result.findings.policy.decision = "review";
    },
    (r) => {
      delete r.cases[2].result.findings.policy;
    },
    (r) => {
      r.complete = false;
    },
    (r) => {
      r.error = "Provider error";
    },
  ]) {
    const changed = structuredClone(report);
    mutate(changed);
    assert.notEqual(exitCode(changed, corpus, false, approvals), 0);
  }
});

test("controls cannot be waived through human review", async () => {
  const report = await run();
  report.cases[0].result.findings.meaning.decision = "review";
  const approvals = [approvalFor(report, corpus[0])];
  assert.equal(exitCode(report, corpus, false, approvals), 1);
  assert.equal(summarize(report, corpus, approvals).approvedReviews.length, 0);
});
