# Scheduler 1.0.8 — October 13, 2026

## Source and validation

Release source: `a36c6c0dd744c7e4d136f89574d166bbcf4073fe`.
The release contains merged PRs #16 and #17, followed by the package/lockfile,
README and changelog version update. See the [maintenance record](ci-maintenance-2026-10-13.md)
for the dependency repairs, iCloud XML regression coverage and exact-copy Jev
approval. No semantic threshold, control, model policy or product copy changed.

- Local: `CI=true npm run check` passed all deterministic stages: 266 Worker
  tests in 19 files, type/build checks, quality/fork checks, browser/accessibility
  flows and dry deployment. It then exited 2 because no local live Jev token was
  supplied. This is separate from the complete hosted pass below.
- Audits: zero npm vulnerabilities and no findings across 34 Ruby packages at
  01:35:39 UTC on October 14 (October 13 Mountain time).
- CI: [trusted-main run 38496723597](https://github.com/aindaco1/scheduler/actions/runs/38496723597)
  passed this exact source at 01:40:15 UTC. It ran the complete check and audits
  on Node 24 / Ruby 3.3. Live Jev completed 74 requests / 100 questions, with all
  16 calibration and 24 validation controls correct, 33 rendered passes, one
  existing approved English pending-copy review and zero blocking findings.
  The Spanish rescheduling email passed outright (0.65 pass / 0.30 fail / 0.05
  uncertain, margin 0.35); its new approval was not needed for this release run.
- Corpus SHA-256: `59fc506e9e66d05d57a40c48127183a054f400ddb6e1772b097fb7f6deb77476`.

## Production deployment

The owner authorized production deployment and verification without test
invitations. Wrangler 4.147.0 deployed the tested source with version tag
`v1.0.8` and the source SHA in its annotation.

- Worker version: `89dafd4b-40c8-4113-824f-0ec6d7a25462`.
- Traffic: 100% from `2026-10-14T01:41:25.210Z`.
- Previous version: `9c23862c-090c-4f3d-9bbe-be61bf3b7b6b` (1.0.7).
- All non-asset bindings match the previous version, including ten secret
  binding names, public vars and the existing SQLite Durable Object namespace.
  No secret was uploaded/replaced, no namespace was recreated and no migration
  or provider reconnection was required.
- The public configuration fingerprint is unchanged:
  `63b89613f5b3611f4e47c89571fbe1af70d9426d333b4ad29204be1b8d886218`.
- Static assets were unchanged, so Wrangler uploaded no new asset files.

## Live verification

GET-only route/asset/availability checks ran from 01:41:39 through 01:41:53 UTC.

- All 24 route checks passed: English/Spanish booking, privacy, admin and guest
  management shells; all six localized meeting links; root redirect; health,
  public config, robots and sitemap; an unavailable meeting link; anonymous
  session and three protected admin endpoints. Private APIs returned 401,
  private pages/APIs retained no-store/noindex, and security headers were present.
- All 15 public asset SHA-256 values match the tested local build.
- All ten availability reads returned 200 across two seven-day windows
  (October 15–22 and October 22–29 in America/Denver), covering both active video
  types and all three in-person locations. Slot counts were respectively
  26/15/12/9/0 and 72/53/45/36/0. Zero-slot responses are successful empty
  availability results, not failed provider reads treated as free time.
- The live English and Spanish brief-chat pickers each rendered 82 times across
  seven available dates (October 15–27). The Spanish view measured 320 CSS
  pixels with equal content width and no horizontal overflow. The system dark
  appearance rendered correctly. Initial embedded-browser input timeouts were
  resolved with a fresh page load; no application warning/error was captured.
  Screenshot evidence remains local under `work/release-1.0.8/`.
- Cloudflare telemetry from deployment through 01:46:21 UTC contained only
  `info` levels and `ok` Worker outcomes. This is an observed verification
  window, not a guarantee about future provider availability.

## Acceptance boundary and release

No test booking, reschedule, cancellation, calendar/Zoom write, invitation,
login email or branded notification was sent. Read-only calendar availability
is verified; admin-notification delivery and recipient inbox acceptance remain
unverified. Earlier actual-recipient evidence remains separately dated in
[release status](../STATUS.md).

[Release v1.0.8](https://github.com/aindaco1/scheduler/releases/tag/v1.0.8) targets
the tested/deployed source above. The deployment record is committed separately
and does not change the runtime artifact. Install from a recursive clone of the
release tag because GitHub source archives omit pinned submodules.
