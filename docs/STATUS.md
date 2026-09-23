# Scheduler release status

Updated September 23, 2026 (UTC). This is the current release summary. The [pre-1.0 history](history/pre-1.0.md) preserves the dated implementation, CI, deployment and provider checks without presenting older snapshots as current settings.

## Scope and license

Version 1.0.0 is the first stable release for one owner, under the [MIT license](../LICENSE). The [README](../README.md#installation-and-setup) and [fork guide](FORKING.md) describe installation, account provisioning and upgrades. The [changelog](../CHANGELOG.md) lists the release features. The 1.0.1 engineering audit and fixes are complete; release verification is recorded below. The [roadmap](ROADMAP.md) owns Phase 2 profiles, pay-what-you-can bookings, direct Proton integration and two-way Google Calendar sync.

The owner page is [scheduler.dustwave.xyz/alonso](https://scheduler.dustwave.xyz/alonso). Google owns new events and attendee invitations; selected Google and direct iCloud calendars block time. Availability respects Busy/Free settings, per-location hours, defaults and overrides, blackouts and booking boundaries. English is always available and Spanish can be enabled in Settings.

## Release verification

### Required Jev development checks — September 23 UTC (release candidate)

Scheduler reuses Platform Test Core for required live semantic evaluation of
34 synthetic English/Spanish browser/email cases, with 40 separate labeled
controls. `npm run check` retains all existing deterministic checks and blocks
semantic failures, reviews and incomplete evaluation. `check:offline` explicitly
omits the model gate; its browser capture assertions still run. See
[Quality](QUALITY.md#required-jev-development-check) and the
[dated evidence](release-evidence/jev-development-2026-09-23.md).

The release checks passed 193 Worker tests, seven gate regressions, the
build/fork/browser/accessibility matrix and dependency audits. A live near-tie
then blocked release despite two earlier passes. Separating the pending-state
assertions suggested an absence-based rubric mismatch; a further affirmative
consistency revision and fresh full-page controls passed all 40 controls but
still failed the actual English pending screen (33/34 rendered passes). All
four blocked trials are preserved. The owner approved explicit pending copy in
both languages, but its final live check still produced an English pending-screen
review (pass 0.51, fail 0.48). All 40 controls and the other 33 rendered cases
passed. This remains a judge-quality blocker; no threshold, label or review
override was used to obtain release acceptance. The change is unreleased.

Hosted CI is wired for live checks on trusted main runs, with explicitly offline
pull-request checks. The dedicated Workers AI secret and account variable are
configured in GitHub; hosted verification and deployment are pending. CutNotes
keeps its separate credentials and workflow. No calendar write, invitation or
recipient delivery occurred. Judge evidence and actual provider/recipient
acceptance remain separate.

### Seven available dates and invitation identity — September 22 UTC

Booking and guest rescheduling now show up to seven dates with actual slots after minimum notice, skipping unavailable dates. Next starts at the next available date; a lookahead scan determines whether another page exists. All times on a displayed date stay together, dates use the visitor's selected time zone, and scans stop at the configured horizon. Location changes retain the current page's starting date. A provider error during any scan stops the page and uses the existing retry/error flow. Calendar-provider operations and reservation rules are unchanged.

- Local: `npm run check` passed on Node 26.8.2 / Ruby 3.0.0, including 193 Worker tests, 324 paired translations, independent fork setup, browser/axe flows, 40 admin and 84 public responsive checks, and Wrangler dry deployment. The 13 date-paging cases cover skipped weekdays/blackouts, complete-date grouping, notice, sparse/final pages, lookahead failures, time zones, DST and bounded searches. Browser checks verify previous/next pages, duplicate-free date sequences, final partial pages, retry/cancellation, location retention, and authorization on every rescheduling scan. English desktop and Spanish 320-pixel dark previews were visually reviewed; `git diff --check` passed. This run also includes the invitation identity fix below.
- CI: [Check passed](https://github.com/aindaco1/scheduler/actions/runs/35772145438) for source `9774a418723fcbed23b931e5180566ba413b06e5` on Node 24 / Ruby 3.3. The local dependency audit also found zero npm advisories and no findings across 34 Ruby packages.
- Deployment: that source is live as Worker `524bcce3-a49a-4280-9e89-6e59163defcb`, including the invitation identity fix below. Health and all eight English/Spanish shells returned 200; unauthenticated owner settings returned 401. Nine compiled assets and both generated preview images matched the tested build. Public configuration remained enabled and ready. The live Brief chat picker in America/Chicago showed seven available dates on each of its first two pages, with 112 and 143 slots, no overlapping dates, and successful Previous navigation. The code rollback target is `ccecef10-b77b-47f2-8397-94f881daa1c3`, confirmed as the version deployed immediately beforehand. See the [deployment evidence](release-evidence/available-dates-and-host-2026-09-22.json).
- Actual provider/recipient: live availability reads passed, but calendar writes and recipient acceptance were not repeated. No live bookings, invitations or mail were sent. Invitation rendering is covered by synthetic provider fixtures; actual rendering and recipient receipt remain unverified. Sparse schedules require more bounded reads; the live smoke sampled two pages without a formal latency measurement.
- Cleanup: after verification, stopped the temporary local servers and ran the repository's fixed-output cleanup. Removed generated builds, manifests, caches and browser reports; moved reviewed scratch logs and verification scripts to Trash. Retained dependencies, source/fixtures, pinned submodules, local Durable Object state and the small read-only preview helper under ignored `work/local-preview/`. Fetch/prune and remote inspection confirmed only `main` locally and on GitHub, with one worktree and no stale branches to delete. No production settings, secrets, provider connections or schema migrations changed.

### Invitation host identity — September 22 UTC (local)

New Google invitations now include the saved Display name in the title and localized description, plus the connected Google account as an accepted attendee. Source inspection found that the previous title contained only the meeting type and guest name, while the attendee list contained only the guest. Events still go to the connected account's primary calendar. Existing events, including recovered creations and reschedules, keep their identity and attendee responses. See [operating guidance](OPERATIONS.md#location-details-and-consistent-branding).

Local `npm run check` passed on Node 26.8.2 / Ruby 3.0.0: type checks, audit/platform tests, 186 Worker tests, build, quality/localization/privacy gates, independent fork setup, browser/axe flows, 40 admin and 84 public responsive checks, and Wrangler dry deployment. Ten added Worker cases cover the coordinator's use of saved identity, all meeting modes and languages, escaped names, duplicate host/guest addresses, uncertain insert recovery and rescheduling without replacing RSVPs. `git diff --check` passed. Existing Sass import deprecation and Wrangler configuration/fixture-secret warnings remain; no new production credentials were used.

This fix is included in the successful CI and September 22 deployment above. Actual Google invitation rendering and recipient receipt remain unverified; no live bookings, calendar writes, invitations or mail were used. The guest's particular event was not inspected, so the fix does not confirm that booking's current provider state.

### Dependency PR validation — September 20 UTC

[PR #4](https://github.com/aindaco1/scheduler/pull/4), [PR #5](https://github.com/aindaco1/scheduler/pull/5), and [PR #6](https://github.com/aindaco1/scheduler/pull/6) update the SHA-pinned Ruby setup action, development tooling, and Zod. The combined source passed `npm ci`, `npm run check` (176 Worker tests, browser/axe flows, 40 admin and 84 public responsive checks, and Wrangler dry deployment), and `npm run audit:dependencies` (zero npm advisories and no findings across 34 Ruby packages). A separate isolated Wrangler local-server smoke returned healthy/public responses and denied unauthenticated owner settings. Vitest 4, the workerd override, both submodule pins, and application source are unchanged.

Each original PR's hosted Check passed on September 17; the combined branch's hosted verification is tracked in [PR #6 checks](https://github.com/aindaco1/scheduler/pull/6/checks). Local validation used Node 24.21.0 and the installed Ruby 3.0.0; the supported Ruby 3.3 environment is covered by CI. See the [dependency review record](release-evidence/dependencies-2026-09-20.md) for revisions, upstream review, and validation limits.

This maintenance validation does not deploy a Worker or repeat live provider/recipient acceptance. The most recent recorded production deployment remains the September 14 Platform rollout below. No live bookings, calendar writes, invitations, or email were used.

### Platform 0.37.0 reuse rollout — September 14 UTC

[PR #2](https://github.com/aindaco1/scheduler/pull/2) merged the characterized migration and removed the duplicate browser declarations. Platform is pinned at `30b1cf9c1154b6f38e3da34fc7b2ed3b6d312088`. Local `npm run check` passed, and [main CI passed](https://github.com/aindaco1/scheduler/actions/runs/34803846422) for merge `7a0287a224c70796f80ecf89bbc798ffaf5cb3e7`.

The tested source `f8f5bce9ffd5efae01d2b3075c3eebe0f0681593` is deployed as Worker `ae6665e9-4e79-452e-875c-ec22cc5e7b93`. Public health, English/Spanish booking shells and the admin shell returned HTTP 200; all three referenced CSS/JavaScript assets matched the tested build. The previous Worker `f44ec8f7-54cd-4d07-8960-8ca5f2487c3e` is the code rollback target. No settings, secrets or schema migrations changed, and no new bookings, provider writes or messages were used for verification. See the [release record](release-evidence/platform-reuse-2026-09-14.json) and [migration/rollback rehearsal](platform-reuse-2026-09-14.md).

### Version 1.0.1 security and sharing release

The [engineering audit](release-evidence/security-audit-1.0.1-2026-09-10.md) covers all nine roadmap review areas and records seven confirmed findings, all fixed. No critical/high finding was confirmed. This is not an independent penetration test or certification.

Local `npm run check` passed on Node 24.20.0: 176 Worker tests in 17 files, two Ruby-advisory gate tests, TypeScript, Jekyll build, eight localized shell/asset/privacy gates, 321 paired browser messages, independent fork setup, complete browser flows/axe, 40 admin and 84 public responsive states, and Wrangler dry deployment. The updated advisory command reported zero npm advisories and no findings across all 34 locked Ruby packages after updating JSON to 2.21.2.

The actual Cloudflare recovery drill passed on an isolated temporary Worker: all six SQL tables, KV, encrypted credentials/management/email payloads and the alarm matched their saved state after PITR and restart. Restored-state quarantine invalidated sessions, held jobs, paused bookings and removed the alarm. Temporary resources were deleted successfully. No production namespace or real provider credentials were supplied.

[CI passed](https://github.com/aindaco1/scheduler/actions/runs/34499812594) for application source `401ff059415f93179672964737156cbcb750bd11`, deployed as Worker `f44ec8f7-54cd-4d07-8960-8ca5f2487c3e`. Read-only production checks passed for eight localized shells, two unauthenticated owner APIs (401), an invalid private booking (404), nine matching built assets, eight main/type preview pages, ten sitemap entries, two matching preview assets, and retired-type GET/HEAD (404). Booking remained enabled/ready. September 14-week availability returned 104 and 81 slots for the two video types and 24, 18 and 0 for the three in-person locations, all with successful provider reads. A zero count is a successful no-openings result.

No live bookings, provider writes, invitations or recipient messages were used in the audit. The [1.0.1 release](https://github.com/aindaco1/scheduler/releases/tag/v1.0.1) includes the tested application and the final documentation/evidence update; that update changes no deployed runtime or assets. See [the release evidence](release-evidence/security-1.0.1.json) for separated outcomes and probe limits.

### September 10 meeting-link preview upgrade

Local `npm run check` passed on Node 24.20.0: 158 Worker tests in 16 files, type checks, Jekyll build, eight localized shell/asset/privacy gates, 321 paired browser messages, independent fork setup, complete booking/admin/browser accessibility flows, the new sharing fixtures, 40 admin and 84 public responsive states, and Wrangler dry deployment. The September 10 dependency audit reported zero known vulnerabilities. The new copy controls and generated 1200 × 630 preview were visually inspected.

The native macOS LinkPresentation baseline reproduced the old deployed issue: the Brief chat type link resolved to the main page, had the generic title, and supplied neither image nor icon.

[CI passed](https://github.com/aindaco1/scheduler/actions/runs/34482088793) for source `9057a738362d88aca1a4b0cd8885a5a5a1b3da3c`. That source is deployed as Worker `a8fa6c88-eed4-4440-82c7-882150471331`. Live verification passed for the main page and all three meeting types in English/Spanish: eight initial HTML responses with correct titles, canonicals, images and parsed JSON-LD; ten public sitemap entries; both raster assets matching local hashes; and retired-type GET/HEAD returning 404. The live Brief chat link opened its picker and loaded available times for the September 14 week.

Native Apple LinkPresentation now returns the exact main/type URL, correct localized title, preview image and icon for the main page and the English/Spanish Brief chat links. In Messages itself, pasting the Brief chat URL into a new draft with no recipient produced an attached rich link titled **Brief chat · 30 min · Zoom · Alonso Indacochea**, with **Scheduler clock symbol** image caption and one image. The unsent attachment/draft was removed and the original conversation view restored. This verifies the macOS Messages draft preview; no recipient-delivery or iPhone-device claim is made. No live invitations, bookings or messages were sent. See [the public-facts-only evidence](release-evidence/meeting-sharing-2026-09-10.json).

### Version 1.0.0 launch verification

The final local `npm run check` passed: 150 Worker tests in 15 files, TypeScript, eight localized page/asset/privacy gates, 312 paired messages, independent fork setup, complete browser flows and Wrangler dry deployment. The dependency audit reported zero known advisories on September 10.

The responsive matrix passed 40 admin and 84 public states in English/Spanish, including 320/390-pixel phones, 768/1024-pixel tablets, a 1280-pixel admin baseline, system themes, keyboard dialogs and 200% text. Saved and unsaved controls are centered on mobile/tablet; location addresses clear the focus outline, management summaries have breathing room, and enlarged text keeps usable horizontal space. These are Chromium fixture and visual checks, not device/screen-reader certification.

[Dependabot PR #1](https://github.com/aindaco1/scheduler/pull/1) updates Acorn to 8.18.0 and runs CI on Node 24. Vitest remains at 4.1.11 because the latest Cloudflare test pool (0.22.0) requires Vitest 4; its incompatible Vitest 5 proposal is deferred until those peer requirements change. All four SHA-pinned GitHub actions declare the Node 24 action runtime.

Production deployment verified September 10 from source `10487b0b6433e08cc075c4b57e739c4f7c4de526`, following [successful CI](https://github.com/aindaco1/scheduler/actions/runs/34461926796) on Node **24.20.0**. Cloudflare Worker version: `1f930a09-d255-453d-85da-e05fe54e0e35`. All eight localized routes and nine built assets matched; unauthenticated private API reads returned 401. Public settings remained enabled/ready. Read-only availability for the September 28 week returned 58, 46 and 16 slots across the three locations (one cold read of 2.38 seconds, then 0.42 and 0.34 seconds; these three samples are not a performance percentile).

See the [published 1.0.0 release](https://github.com/aindaco1/scheduler/releases/tag/v1.0.0) for the exact tested source, successful CI and production Worker identifiers. The [launch evidence](release-evidence/launch-1.0.0.json) contains fixture counts and asset metrics without private data.

## Checkout cleanup

For 1.0.1, reproducible site/bundle/manifests, caches and test reports were removed with `npm run clean`. Remaining one-off release logs, screenshots/helpers and isolated-drill scratch files were moved to a private recoverable archive outside the checkout. Dependencies, source fixtures, pinned submodules, secrets and any local database state are retained; TypeScript passes after cleanup. Remote references were pruned; only `main` remains locally and on origin, with no extra worktrees or open pull requests. There were no stale branches to delete.

## Provider and recipient acceptance

September 9 acceptance covered Google Meet, Zoom and an in-person booking, rescheduling the same provider event, cancellation, selected Google/iCloud conflict behavior and a real scheduled reminder. These controlled tests used the owner's authorized account; all test bookings were cancelled. See [the dated acceptance record](history/pre-1.0.md#live-provider-and-recipient-acceptance).

Initial messages reached Gmail Spam despite passing SPF, DKIM and DMARC. The subsequent authorized delivery check passed authentication and forwarded to HEY; [the delivery record](history/pre-1.0.md#final-email-rollout) distinguishes that from the earlier complete booking lifecycle. Inbox placement for all recipients is not guaranteed.

The September 10 intermittent availability error was no longer reproducible when inspected. All three locations then returned valid availability. The shared picker now retries transient reads once and records privacy-safe failure classifications; the original cause remains unconfirmed. Failed conflict checks still withhold slots.

The 1.0 release review does not send new invitations or change production settings. Fork owners must perform their own provider and recipient acceptance with consenting recipients.

## Deployment boundaries

The app is self-hosted per owner, not a multi-tenant SaaS. Upstream Google OAuth is in production mode for the personal deployment, but the app is not verified for public multi-user distribution. Zoom uses the owner's private local-test app rather than a public Marketplace listing. New forks supply their own credentials and approval setup.

Proton currently blocks time through its Google subscription and inherits that refresh delay. Direct Proton remains a separate phase 2 feasibility task. External calendar edits can race a booking across providers; fresh final reads reduce but cannot eliminate that risk. Formal screen-reader/native-speaker approval, independent penetration testing and a recovery drill are not claimed; see [quality boundaries](QUALITY.md).

## Documentation follow-up

The maintainer index and full contribution, security and third-party guides now live in `docs/`, with release metrics in `docs/release-evidence/`. The root keeps README, LICENSE, AGENTS and CHANGELOG; the redundant contribution, security and third-party pointer files were removed. Component READMEs stay beside their code. The roadmap records the next audit and Phase 2 plans separately from verified 1.0 behaviour. This follow-up changes documentation only; the deployed 1.0.0 source and release tag above remain unchanged.

Documentation validation passed: local links and heading anchors across 21 Markdown files, six byte-identical moved evidence records, the Jekyll build and quality gates for eight localized pages/312 paired messages. All nine generated assets match the published 1.0.0 hashes. No application code, deployment configuration, package version or production state changed.
