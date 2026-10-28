# Scheduler 1.0.9 — October 28, 2026

## Source and validation

Release source: `4a8dc4bfe2876568ad60ebe6585be47479436439`.
The release includes the ten merged dependency PRs and header accessible-name
repair documented in [maintenance evidence](ci-maintenance-2026-10-28.md),
followed by the package/lockfile, README and changelog version update. Both
Dust Wave submodule pins and the supported Vitest/workerd combination remain
unchanged.

- Local: `CI=true npm run check` passed all deterministic stages, including
  268 Worker tests in 19 files, type/build checks, 327 paired messages,
  quality/fork checks, browser/accessibility flows, 40 admin and 84 public
  responsive cases, bilingual admin-email fixtures and dry deployment. It then
  exited 2 because no local live Jev token was supplied; this is not a local
  live Jev pass.
- Audits: zero npm vulnerabilities and no findings across all 34 locked Ruby
  packages at 17:43:55 UTC. The hosted audit also passed at 17:46:19 UTC.
- CI: [trusted-main run 40738758968](https://github.com/aindaco1/scheduler/actions/runs/40738758968)
  passed the exact release source on Node 24.22.1 / Ruby 3.3, including the
  complete check and dependency audit. Live Jev completed 74 requests / 100
  questions, with all 16 calibration and 24 validation controls correct,
  33 rendered passes, the existing approved English pending-copy review and
  zero blocking findings. No threshold, control or review approval changed.

## Production deployment

The owner authorized deployment and live verification without test invitations
or emails. Wrangler 4.152.0 deployed the tested source with tag `v1.0.9` and
the source SHA in the version annotation.

- Worker version: `b0851aa4-fd41-4fd3-aa29-8d419502ebdb`.
- Traffic: 100% from `2026-10-28T17:48:52.989909Z`.
- Previous version: `89dafd4b-40c8-4113-824f-0ec6d7a25462` (1.0.8).
- Every binding matches the previous deployment, including ten secret binding
  names, public vars and the existing SQLite Durable Object namespace. No secret
  was uploaded or replaced, and no migration or reconnection was required.
- The public configuration fingerprint remains
  `63b89613f5b3611f4e47c89571fbe1af70d9426d333b4ad29204be1b8d886218`.
- Eight localized HTML shells were uploaded. All 15 public asset hashes match
  the tested local build.

## Live verification

GET-only route/asset/availability checks ran from 17:49:05 through 17:49:15 UTC;
live Chromium checks completed at 17:49:41 UTC. The [machine-readable evidence](release-1.0.9-2026-10-28.json)
contains the route results, asset hashes, aggregate slot counts and browser
measurements without guest data or private calendar contents.

- All 24 route checks passed: English/Spanish booking, privacy, admin and guest
  management shells; six localized meeting-type links; root redirect; health,
  config, robots and sitemap; unavailable type; anonymous session; and three
  protected admin endpoints. Private APIs returned 401. Private routes retained
  no-store/noindex, and security headers were present.
- All ten availability requests returned 200, covering both video types and
  all three in-person venues across October 29–November 5 and November 5–12 in
  America/Denver. The first seven-local-day window spans 169 elapsed hours over
  daylight saving's end; the second spans 168 hours. Slot counts were
  17/10/9/3/4 and 58/41/35/26/17. Returned slots respected notice, horizon and
  request boundaries, without duplicates. No provider failure was treated as
  an empty or available result.
- English and Spanish brief-chat pickers each displayed 92 times over seven
  available dates. Both languages passed at 320 and 1280 CSS pixels, using
  system light for English and system dark for Spanish. There was no horizontal
  overflow, the home link's accessible name was SCHEDULER, keyboard focus moved
  to the language link, and no browser warnings/errors or write requests were
  observed. Desktop English and mobile Spanish screenshots were visually reviewed.
- Cloudflare telemetry from deployment through 17:49:51 UTC contained 116
  events, all at `info` level with `ok` Worker outcomes. This describes the
  bounded verification window, not future provider availability.

## Acceptance and cleanup

No test booking, reschedule, cancellation, calendar/Zoom write, invitation,
login email or branded notification was sent. Live calendar availability is
verified. Actual admin-notification delivery and recipient inbox acceptance
remain unverified; synthetic email tests do not establish delivery.

After verification, the documented fixed-output cleanup removed builds,
generated manifests, caches, Wrangler temporary output and test reports.
Dependencies, source/tests/fixtures, pinned submodules and the read-only local
preview helper remain. All 22 local database files have unchanged hashes.

Two superseded untracked October 13 document copies, temporary release scripts,
screenshots and operational logs were moved to a private recoverable archive
outside the checkout. Two fully merged local branches were deleted, eleven stale
remote-tracking refs were pruned, and the obsolete worktree registration whose
directory no longer existed was pruned. Only `main` remains locally and on GitHub,
with one active worktree. No sibling repository or submodule content changed.

[Release v1.0.9](https://github.com/aindaco1/scheduler/releases/tag/v1.0.9) targets
the exact tested/deployed source above. The evidence commit is separate and does
not change the runtime artifact. Install with a recursive clone of the release
tag; GitHub source archives omit submodule contents.
