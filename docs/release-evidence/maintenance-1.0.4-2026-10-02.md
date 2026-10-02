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
  Wrangler login returned HTTP 403 / Cloudflare code 10000. This is not a
  passing local full check. Evidence is retained
  separately from any later run; no policy, rubric or approval was changed.
- Local runtime: Node 26.8.2 / Ruby 3.0.0. Supported Node 24 / Ruby 3.3
  verification is a separate hosted gate.

## Hosted CI and deployment

Pending; no 1.0.4 code deployment has occurred at this checkpoint.
The current credential-compatible rollback base is
`47c125f9-aa61-4e58-b826-4840f09d65cd`. Earlier versions with the old Zoom
client credentials are not a safe credentials-only rollback after reconnection.

## Provider and recipient limits

The [guest-first live test](zoom-guest-first-2026-10-02.md) verified actual
creation, saved joining settings, Denver time, signed-out browser admission
before the host, and cancellation in Scheduler/Google/Zoom before this release.
That result is separate from this maintenance deployment. No further booking,
provider write, invitation or email is part of the release smoke. Recipient
inbox rendering, native guest entry, media, a second real owner and broader
rescheduling/timezone acceptance remain unverified.

## Cleanup

Pending. Twenty-five local-secret/state/preview files were fingerprinted before
cleanup. Generated outputs and reviewed duplicate documentation will be archived
privately or removed through the fixed cleanup command after release verification.
