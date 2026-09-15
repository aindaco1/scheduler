import assert from "node:assert/strict";
import test from "node:test";
import { hasCredentialSignature } from "./credential-signatures.mjs";

test("detects classic and variable-length installation tokens while allowing placeholders", () => {
  const tokens = [
    ["ghs", "a".repeat(36)].join("_"),
    ...[128, 256].map((n) => ["ghs", "12345", ["eyJ" + "a".repeat(30), "b_c-".repeat(n), "d_e-".repeat(20)].join(".")].join("_")),
    ["ghp", "a".repeat(36)].join("_"),
    ["sk", "live", "a".repeat(24)].join("_"),
    ["-----BEGIN ", "PRIVATE KEY-----"].join("")
  ];
  for (const token of tokens) assert.equal(hasCredentialSignature(`before ${token} after`), true);
  assert.equal(hasCredentialSignature("ghs_test ghp_fixture sk_live_example safe=true"), false);
});
