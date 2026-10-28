# CI and dependency maintenance — October 28, 2026

## Investigation and changes

The October 26 [scheduled Check run](https://github.com/aindaco1/scheduler/actions/runs/40386241548)
stopped at the dependency audit, before functional checks or Jev. It reported
Undici 7.30.0 and both the direct and Cloudflare test pool's nested Zod as
vulnerable. The existing scoped Miniflare override now selects Undici 7.30.1;
the direct Zod update to 4.6.6 also supplies the test pool's Zod through a scoped
override. No force/legacy peer flags or audit exemptions are used.

Advisories: [Undici EventSource memory](https://github.com/advisories/GHSA-4qv8-2p9j-2685),
[integrity tokens](https://github.com/advisories/GHSA-f72v-6w45-q472),
[content encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c), and
[Zod collection validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

The October 21 [PR #24 check](https://github.com/aindaco1/scheduler/actions/runs/39691015164)
passed its then-current audit and Worker tests but failed the browser accessibility
gate. Axe 4.14 found `label-content-name-mismatch`: the header link's fixed
"Booking home" name omitted the visible "SCHEDULER" text after clearing branding.
Removing the overriding ARIA label lets native link naming follow the visible
text or logo alt text, including saved branding changes and both languages.
Existing browser fixtures now explicitly check these accessible names.

The combined candidate retains the actual heads of [PR #18](https://github.com/aindaco1/scheduler/pull/18),
[PR #19](https://github.com/aindaco1/scheduler/pull/19),
[PR #21](https://github.com/aindaco1/scheduler/pull/21),
[PR #22](https://github.com/aindaco1/scheduler/pull/22), and
[PR #24](https://github.com/aindaco1/scheduler/pull/24) in its history so their
updates can be validated and merged together. Both shared-package pins,
workerd 1.20260908.1 and supported Vitest 4.1.12 are retained.

The [tsdav 2.4.0 release](https://github.com/natelindev/tsdav/releases/tag/v2.4.0)
adds Digest authentication negotiation. Scheduler's bounded Apple transport
continues to reject credential challenges before the library can negotiate.
A new synthetic regression verifies a Digest challenge fails closed without a
credential retry; existing coverage checks explicit Basic headers, unsafe
redirects, incomplete snapshots, recovery, authorization and competing bookings.

## Local verification

- `npm ci` succeeded without peer-dependency bypasses.
- `npm run audit:dependencies` passed on October 28 at 17:16:19 UTC: zero npm
  findings and no findings across all 34 locked Ruby packages.
- `npm ls` confirms Zod 4.6.6 and Undici 7.30.1 throughout the affected trees.
- `actionlint` and `git diff --check` passed.
- `CI=true npm run check` passed all deterministic stages: 267 Worker tests in
  19 files; audit/platform/Jev gate unit tests; type/build, quality and fork setup;
  browser flows/accessibility, 40 admin and 84 public responsive checks; and
  Wrangler dry deployment. It then exited 2 because no local Jev token was
  supplied. No local live Jev pass is claimed.

## Hosted verification

Candidate `25e2dd583be15fed8aa97b52512f1cf07aa74f80` passed
[ordinary PR checks](https://github.com/aindaco1/scheduler/actions/runs/40734463839).
Its [owner-dispatched complete check](https://github.com/aindaco1/scheduler/actions/runs/40734493131)
also passed: all deterministic stages, 267 Worker tests, and live Jev with 74
requests / 100 questions. All 16 calibration and 24 validation controls were
correct. There were 33 rendered passes, one previously approved English
pending-copy review and zero blocking findings. The existing Spanish review was
not needed. Questions, controls, model policy, thresholds and approvals are
unchanged.

GitHub artifact `12836193115` retains the synthetic browser and Jev evidence
until November 11, 2026. Archive digest:
`sha256:f5c40e961beba6b558190c9743815c10f0d1a57b163a8e07f88a2c9f4050db83`.

PR #24 merged on October 28 at 17:23:23 UTC as
`b358b6cef62182c48854e0178355c4a323de18cf`. GitHub also marked PRs #18, #19, #21
and #22 merged because their commits are included. No open PRs remained at
17:23 UTC. The merge and tested candidate both have tree
`a63a0c4501020bbb21f3f9a29f0821930c296eea`; no untested base/head changes entered
the merge. This verification update changes documentation only.

Historical failures remain failed; new evidence supersedes their affected source
revisions without relabeling old runs. Earlier October 21 runtime/audit failures
were already superseded by the successful [main run](https://github.com/aindaco1/scheduler/actions/runs/39690675210)
after PR #23; October 13 and earlier dispositions remain in their dated records.

## Deployment and actual providers

This maintenance does not deploy production or send any calendar invitations,
bookings or email. The last recorded production deployment is 1.0.8.
Actual admin-notification delivery and recipient receipt remain unverified.

## Dependabot follow-up batch

After the first merge, Dependabot opened PRs #25–29 with newer available
versions: ruby/setup-ruby 1.335.0, upload-artifact 7.0.2, Sass 1.106.1,
Wrangler 4.152.0, tsdav 2.5.0 and Zod 4.6.7. Their actual commits are combined
in PR #26 for validation and merge together. Both security overrides and the
supported Vitest/workerd/shared-package pins are retained.

Reviewed upstream release/source changes: tsdav's filename-write and OAuth/sync
changes are outside Scheduler's read-only Basic-auth iCloud path; equivalent
percent-encoding in principal URLs does affect discovery. A new fixture tests
the actual discovery path with differing equivalent URL spellings. Zod's
4.6.7 source comparison changes version metadata. Actions remain SHA-pinned;
the Ruby update retains the 3.3 line and the artifact update retains the existing
evidence paths and retention policy.

Local installation and audits passed again at 17:26:27 UTC with zero npm
findings and all 34 Ruby packages clear. `CI=true npm run check` passed all
deterministic stages with the updated dependencies (267 Worker tests), then
exited 2 at the missing local Jev credential. The subsequently added
principal-discovery regression passed with all 24 tests in its focused iCloud
file. Hosted checks include that new test in the complete suite.

The first batch's documentation commit `c524bec` also passed
[trusted-main checks including live Jev](https://github.com/aindaco1/scheduler/actions/runs/40735393802).
Follow-up candidate `2fca506ceebcaff02d4e4b806f50eb1a67c510bc` passed
[ordinary PR checks](https://github.com/aindaco1/scheduler/actions/runs/40736036029)
and [complete live checks](https://github.com/aindaco1/scheduler/actions/runs/40736060206).
The complete suite passed 268 Worker tests and every deterministic stage.
Live Jev completed 74 requests / 100 questions, with all 40 controls correct,
33 rendered passes, the unchanged approved English pending-copy review and zero
blocking findings.

PR #26 merged at 17:32 UTC as `8aeb5ef5e4da35f761d4664608ac153fafc2bf16`;
GitHub marked #25, #27, #28 and #29 merged too. The tested and merged trees are
both `a54f2eb43b6929761fa6e134f13c38c8dbb3f312`. No open PRs remain after this
second batch. This final verification update changes documentation only.

GitHub artifact `12837396992` retains the follow-up synthetic evidence until
November 11. Archive digest:
`sha256:740692584b8ba37e91246cc773d17a27a8ebe9cdfde6f8cfa45e0ff38995b6f3`.

After the owner authorized deployment, both batches shipped in
[1.0.9](release-1.0.9-2026-10-28.md) from separately tested release source
`4a8dc4bfe2876568ad60ebe6585be47479436439`. Live verification used read-only
calendar availability and sent no test invitations or emails.
