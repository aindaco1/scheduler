import { test } from "node:test";
import assert from "node:assert/strict";
import { auditRuby } from "./audit-ruby.mjs";
const lock = "GEM\n  specs:\n    json (2.21.2)\n";
test("Ruby advisory gate distinguishes clean results and confirmed findings", async () => {
  assert.deepEqual(
    (await auditRuby(lock, async () => Response.json({ results: [{}] })))
      .findings,
    [],
  );
  const result = await auditRuby(lock, async () =>
    Response.json({ results: [{ vulns: [{ id: "GHSA-fixture" }] }] }),
  );
  assert.deepEqual(result.findings, [
    { name: "json", version: "2.21.2", advisories: ["GHSA-fixture"] },
  ]);
});
test("Ruby advisory gate fails closed on outage, partial results, invalid shape and pagination", async () => {
  for (const body of [
    {},
    { results: [] },
    { results: [null] },
    { results: [{ error: "unavailable" }] },
    { results: [{ next_page_token: "more" }] },
    { results: [{ vulns: "invalid" }] },
  ])
    await assert.rejects(auditRuby(lock, async () => Response.json(body)));
  await assert.rejects(
    auditRuby(lock, async () => new Response(null, { status: 503 })),
  );
  await assert.rejects(
    auditRuby(lock, async () => {
      throw Error("offline");
    }),
  );
});
