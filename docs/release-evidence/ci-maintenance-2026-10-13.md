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
and the unchanged blocking policy. No semantic exception was added.

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

Pending candidate checks. PR #17 updates tsdav 2.3.4 to 2.3.5 and must be checked
against the repaired base, including the iCloud/provider regression suite.

## Deployment and actual providers

No deployment, production calendar write, invitation or email is part of this
maintenance. The documented deployment remains 1.0.7. Admin-notification delivery
and inbox receipt remain unverified; synthetic checks do not close that gap.
