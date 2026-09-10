# Scheduler release status

Updated September 10, 2026. This is the current release summary. The [pre-1.0 history](history/pre-1.0.md) preserves the dated implementation, CI, deployment and provider checks without presenting older snapshots as current settings.

## Scope and license

Version 1.0.0 is the first stable release for one owner, under the [MIT license](../LICENSE). The [README](../README.md#installation-and-setup) and [fork guide](FORKING.md) describe installation, account provisioning and upgrades. The [changelog](../CHANGELOG.md) lists the release features. The 1.0.1 engineering audit and fixes are complete; release verification is recorded below. The [roadmap](ROADMAP.md) owns Phase 2 profiles, pay-what-you-can bookings, direct Proton integration and two-way Google Calendar sync.

The owner page is [scheduler.dustwave.xyz/alonso](https://scheduler.dustwave.xyz/alonso). Google owns new events and attendee invitations; selected Google and direct iCloud calendars block time. Availability respects Busy/Free settings, per-location hours, defaults and overrides, blackouts and booking boundaries. English is always available and Spanish can be enabled in Settings.

## Release verification

### Version 1.0.1 security and sharing release

The [engineering audit](release-evidence/security-audit-1.0.1-2026-09-10.md) covers all nine roadmap review areas and records seven confirmed findings, all fixed. No critical/high finding was confirmed. This is not an independent penetration test or certification.

Local `npm run check` passed on Node 24.20.0: 176 Worker tests in 17 files, two Ruby-advisory gate tests, TypeScript, Jekyll build, eight localized shell/asset/privacy gates, 321 paired browser messages, independent fork setup, complete browser flows/axe, 40 admin and 84 public responsive states, and Wrangler dry deployment. The updated advisory command reported zero npm advisories and no findings across all 34 locked Ruby packages after updating JSON to 2.21.2.

The actual Cloudflare recovery drill passed on an isolated temporary Worker: all six SQL tables, KV, encrypted credentials/management/email payloads and the alarm matched their saved state after PITR and restart. Restored-state quarantine invalidated sessions, held jobs, paused bookings and removed the alarm. Temporary resources were deleted successfully. No production namespace or real provider credentials were supplied.

CI, production deployment and read-only live verification are pending for the candidate. No live bookings, provider writes, invitations or recipient messages were used in the audit. See [the release evidence](release-evidence/security-1.0.1.json) for separated outcomes.

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

After publication, reproducible site/bundle/manifests, caches and test reports were removed with `npm run clean`. Old scratch work and provisioning backups were moved to a private recoverable archive outside the checkout. Dependencies, source fixtures, pinned submodules and any local database state are retained; TypeScript checks still pass after cleanup. The merged Dependabot branch and temporary review worktree were removed. Only `main` remains, with no open pull requests at launch.

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
