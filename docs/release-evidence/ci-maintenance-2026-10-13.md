# CI and dependency maintenance — October 13, 2026

## Change and investigation

[PR #16](https://github.com/aindaco1/scheduler/pull/16) updates Node types to
26.6.4, Acorn to 8.19.0, Sass to 1.105.1 and Wrangler to 4.147.0. Its lockfile
also resolves `source-map-js` to 1.2.2, fixing
[GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
The failing October 8 PR checks and October 12 scheduled check stopped at that
audit before functional tests. This dependency is marked development-only and
is required by Sass/PostCSS. Both shared-package pins, the workerd pin, supported
Vitest version and scoped Undici override are retained.

[PR #17](https://github.com/aindaco1/scheduler/pull/17) updates tsdav from 2.3.4
to 2.3.5. Review of the [upstream parser changes](https://github.com/natelindev/tsdav/compare/v2.3.4...v2.3.5)
identified mixed text/CDATA and namespace handling as relevant to iCloud conflict
reads. Two new consumer regression cases pass actual DAV responses through
`icloudBusy`, requiring the original busy interval to survive both encodings.
Existing tests cover empty/malformed/failed responses, discovery, retries,
authorization, scheduling and competing bookings with the real DAV library and
synthetic network responses.

The separate October 5 live Jev finding was examined against both saved reports
and the email renderer. [The investigation](../research/jev-rescheduled-email-2026-10-13.md)
records identical inputs with different scores, no demonstrated copy defect,
and the unchanged blocking policy. The owner later explicitly approved only
that exact uncertain finding; the linked record preserves the decision and hashes.

The Check workflow permits an explicit `live_jev=true` manual dispatch on a
reviewed branch only when both original and rerunning actors are the repository
owner. This enables full pre-merge validation with the existing dedicated CI
credential. Ordinary PRs and other non-main dispatches remain offline.
`pull_request_target` is not introduced.

## Local verification

- `actionlint` and `git diff --check` passed.
- Twelve event/ref/actor/input cases evaluated the actual routing expression:
  main push/schedule/manual checks stay live; PRs stay offline even with an
  owner actor and opt-in; non-main runs require explicit owner dispatch and an
  owner rerun. GitHub execution remains a separate validation below.
- `npm ci` and dependency audits passed: zero npm findings and all 34 locked
  Ruby packages clear at 2026-10-14T01:07:15Z (October 13 Mountain time).
- `CI=true npm run check` completed every deterministic stage, including Worker,
  type/build, browser/accessibility, quality, fork setup and dry-deployment checks.
  It then exited 2 because no local CI token was provided. This is not a complete
  live pass; hosted validation uses the existing dedicated Workers AI secret.
- The two new iCloud parsing cases passed with the full provider-regression
  file after installing tsdav 2.3.5. Its dependency audit also found zero npm
  vulnerabilities and no findings across 34 Ruby packages.

## Hosted verification and merges

- PR #16 `ba6860b5c26f92ecc54c51de9dbbb17988575b8d`: [ordinary PR checks](https://github.com/aindaco1/scheduler/actions/runs/38494194418)
  and [owner-dispatched complete check](https://github.com/aindaco1/scheduler/actions/runs/38494210890)
  passed. Live Jev completed 74 requests / 100 questions, with 16 calibration
  and 24 validation controls correct, 33 rendered passes, the existing approved
  English pending review, and zero blocking findings.
- PR #17 `4fa130dc2234480b642ab27309b638feb10801f3`, including the PR #16 repair:
  [ordinary PR checks](https://github.com/aindaco1/scheduler/actions/runs/38494437957)
  passed. The [owner-dispatched check](https://github.com/aindaco1/scheduler/actions/runs/38494442612)
  passed deterministic checks, then completed live Jev with all 40 controls
  correct and one blocking review on the same Spanish rescheduling-email text.
  Its margin was 0.03. No automatic retry or new approval was applied.
- The owner approved the exact-copy review on October 13. The committed entry
  binds the candidate/question/policy/model and cannot accept a failure, changed
  text, another finding, control error or incomplete run. Both merges remain
  held for fresh complete candidate validation. Historical failures are retained.

## Deployment and actual providers

No deployment, production calendar write, invitation or email is part of this
maintenance. The documented deployment remains 1.0.7. Admin-notification delivery
and inbox receipt remain unverified; synthetic checks do not close that gap.
