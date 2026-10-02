# Scheduler 1.0.4 maintenance release — October 2, 2026

## Source and review

Started from `23205975f30398c9a29587187dac5e0c64bc7256`. This release records
the completed Zoom reconnection, branding and guest-first acceptance work and
adds per-owner setup and safe credential-replacement guidance. No booking or
provider runtime logic changes.

Reviewed and incorporated [PR #13](https://github.com/aindaco1/scheduler/pull/13)
and [PR #14](https://github.com/aindaco1/scheduler/pull/14): SHA-pinned
ruby/setup-ruby 1.327.0, Wrangler 4.142.0, Sharp 0.35.5, Sass 1.105.0,
Prettier 3.9.9 and Node types 26.6.3. The Ruby action pin was checked against
its upstream tag. Both original PR checks failed current npm advisories in
Miniflare's Undici dependency; the existing main branch failed the same audit.

A Miniflare-scoped override selects [Undici 7.30.0](https://github.com/nodejs/undici/releases/tag/v7.30.0),
retaining its 7.x API and clearing the advisories. No forced downgrade of the
Cloudflare test pool was used. Vitest 4.1.11, workerd 1.20260908.1 and both
shared-package pins remain unchanged. Both installed Miniflare versions resolve
to the patched Undici. This dependency is development tooling, not deployed
Scheduler provider code.

## Local verification

- `npm ci`, `npm ls --depth=0` and `git diff --check`: passed.
- Dependency audit: zero npm findings; all 34 locked Ruby packages passed OSV
  at `2026-10-02T22:48:17.340Z`.
- `npm run check` completed every deterministic stage: 223 Worker tests in
  18 files, 11 Jev gate regressions, template/type/audit/shared-pin checks,
  Jekyll build, eight localized shells, 325 paired messages, fork setup,
  browser/accessibility flows, 40 admin and 84 public responsive cases,
  and Wrangler dry deployment.
- The first live Jev evaluation stopped incomplete on its first request with
  no provider result. A subsequent read-only model lookup using the current
  Wrangler login returned HTTP 403 / Cloudflare code 10000, and `wrangler
  whoami` confirmed missing `ai:write` scope. This is not a
  passing local full check. Evidence is retained
  separately from any later run; no policy, rubric or approval was changed.
- Isolated local Wrangler smoke passed: health and English/Spanish booking
  pages returned 200, anonymous owner settings returned 401. Disposable storage
  kept the existing local database untouched; no provider calls or invitations.
- Local runtime: Node 26.8.2 / Ruby 3.0.0. Supported Node 24 / Ruby 3.3
  verification is a separate hosted gate.

## Hosted CI and deployment

[Release PR #15](https://github.com/aindaco1/scheduler/pull/15) passed
[its hosted offline check](https://github.com/aindaco1/scheduler/actions/runs/37074854980).
The merged source `68de35f320468b56715a4a85d9f51e7f72a45d55` passed
[trusted-main CI](https://github.com/aindaco1/scheduler/actions/runs/37075046779)
on Node 24 / Ruby 3.3, including the full `npm run check` and live Jev using
the dedicated Workers AI credential. Jev completed 74 requests / 100 questions:
all 16 calibration and 24 validation controls correct, 33 rendered passes,
one existing exact-copy owner-approved review and zero blocking findings.
No review exception, policy or threshold changed to achieve that result.
Hosted npm/Ruby audits also passed. Both original dependency PRs are merged.

Wrangler 4.142.0 deployed the tested source as
`e9b50b30-ff94-4ca7-8529-fb3a33f9e98c` at
`2026-10-02T22:58:32.013548Z`; a fresh deployment read confirms 100% traffic.
All non-asset bindings, the Durable Object namespace, migration and compatibility
settings match the pre-deployment version. Secret binding names are unchanged;
no secret was submitted or rotated by this code deployment. Public settings
match their pre-deployment SHA-256 fingerprint and remain enabled, ready and
Spanish enabled. The new metadata omits two previously explicit asset-routing
fields; deployed route behavior was checked directly below.

The credential-compatible rollback base is
`47c125f9-aa61-4e58-b826-4840f09d65cd`. Earlier versions with the old Zoom
client credentials are not a safe credentials-only rollback after reconnection.

Read-only production verification at `2026-10-02T22:58:51.845Z`:

- Health and all eight English/Spanish booking, admin, manage and privacy
  shells: HTTP 200.
- Anonymous owner settings and connections: HTTP 401 with no-store headers.
- Nine compiled assets and two social images: exact local SHA-256 matches.
  Wrangler reported no changed static assets to upload.
- Five bounded availability reads for `2026-10-03T06:00:00Z` through
  `2026-10-10T06:00:00Z`: HTTP 200 throughout. The two Zoom types returned
  38 and 31 slots; three in-person locations returned 31, 25 and 1 slots.
  These are successful provider reads, not a latency/load benchmark.
- Browser smoke: Brief chat loaded seven nonempty dates, 126 times and an
  enabled Next control in America/Denver. No time was selected or booked.

[Version 1.0.4](https://github.com/aindaco1/scheduler/releases/tag/v1.0.4) tags
that tested/deployed source. The subsequent evidence-only commit does not
change runtime source, dependencies, configuration or generated assets.

## Provider and recipient limits

The [guest-first live test](zoom-guest-first-2026-10-02.md) verified actual
creation, saved joining settings, Denver time, signed-out browser admission
before the host, and cancellation in Scheduler/Google/Zoom before this release.
That result is separate from this maintenance deployment. No further booking,
provider write, invitation or email is part of the release smoke. Recipient
inbox rendering, native guest entry, media, a second real owner and broader
rescheduling/timezone acceptance remain unverified.

## Cleanup

Two byte-identical iCloud copies and one superseded maintenance-evidence draft
were moved to a private recoverable archive outside the checkout. The archive
also preserves local/hosted test evidence, deployment verification, Zoom test
screenshots and generated branding. All 306 archived files were verified by
SHA-256 after moving. Disposable Finder metadata and the empty fork fixture
were included. No credential value or personal provider record was committed.

`npm run clean -- --dry-run` was reviewed before running `npm run clean`.
Build output, generated manifests, caches, Wrangler temporary packaging and
reports were removed. `work/` now contains only the local preview helper and
its README. All 25 protected local-secret/state/preview files retain their
pre-cleanup hashes; dependencies, Ruby tooling, fixtures, submodules and
`.wrangler/state` remain available for local development.

The merged release branch was deleted locally and remotely. GitHub removed the
two merged Dependabot branches; remote refs were pruned. Only `main` remains,
with one worktree and no open PRs. Pinned submodules remain clean. No sibling
repository, dependency source or development database was changed by cleanup.
