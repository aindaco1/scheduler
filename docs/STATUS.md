# Scheduler 1.0 release status

Updated September 10, 2026. This is the current release summary. The [pre-1.0 history](history/pre-1.0.md) preserves the dated implementation, CI, deployment and provider checks without presenting older snapshots as current settings.

## Scope and license

Version 1.0.0 is the first stable release for one owner, under the [MIT license](../LICENSE). The [README](../README.md#installation-and-setup) and [fork guide](FORKING.md) describe installation, account provisioning and upgrades. The [changelog](../CHANGELOG.md) lists the release features. Profiles, pay-what-you-can bookings and direct Proton integration remain phase 2.

The owner page is [scheduler.dustwave.xyz/alonso](https://scheduler.dustwave.xyz/alonso). Google owns new events and attendee invitations; selected Google and direct iCloud calendars block time. Availability respects Busy/Free settings, per-location hours, defaults and overrides, blackouts and booking boundaries. English is always available and Spanish can be enabled in Settings.

## Release verification

The final local `npm run check` passed: 150 Worker tests in 15 files, TypeScript, eight localized page/asset/privacy gates, 312 paired messages, independent fork setup, complete browser flows and Wrangler dry deployment. The dependency audit reported zero known advisories on September 10.

The responsive matrix passed 40 admin and 84 public states in English/Spanish, including 320/390-pixel phones, 768/1024-pixel tablets, a 1280-pixel admin baseline, system themes, keyboard dialogs and 200% text. Saved and unsaved controls are centered on mobile/tablet; location addresses clear the focus outline, management summaries have breathing room, and enlarged text keeps usable horizontal space. These are Chromium fixture and visual checks, not device/screen-reader certification.

[Dependabot PR #1](https://github.com/aindaco1/scheduler/pull/1) updates Acorn to 8.18.0 and runs CI on Node 24. Vitest remains at 4.1.11 because the latest Cloudflare test pool (0.22.0) requires Vitest 4; its incompatible Vitest 5 proposal is deferred until those peer requirements change. All four SHA-pinned GitHub actions declare the Node 24 action runtime.

See the [published 1.0.0 release](https://github.com/aindaco1/scheduler/releases/tag/v1.0.0) for the exact tested source, successful CI and production Worker identifiers. The [launch evidence](research/launch-1.0.0.json) contains fixture counts and asset metrics without private data.

## Provider and recipient acceptance

September 9 acceptance covered Google Meet, Zoom and an in-person booking, rescheduling the same provider event, cancellation, selected Google/iCloud conflict behavior and a real scheduled reminder. These controlled tests used the owner's authorized account; all test bookings were cancelled. See [the dated acceptance record](history/pre-1.0.md#live-provider-and-recipient-acceptance).

Initial messages reached Gmail Spam despite passing SPF, DKIM and DMARC. The subsequent authorized delivery check passed authentication and forwarded to HEY; [the delivery record](history/pre-1.0.md#final-email-rollout) distinguishes that from the earlier complete booking lifecycle. Inbox placement for all recipients is not guaranteed.

The September 10 intermittent availability error was no longer reproducible when inspected. All three locations then returned valid availability. The shared picker now retries transient reads once and records privacy-safe failure classifications; the original cause remains unconfirmed. Failed conflict checks still withhold slots.

The 1.0 release review does not send new invitations or change production settings. Fork owners must perform their own provider and recipient acceptance with consenting recipients.

## Deployment boundaries

The app is self-hosted per owner, not a multi-tenant SaaS. Upstream Google OAuth is in production mode for the personal deployment, but the app is not verified for public multi-user distribution. Zoom uses the owner's private local-test app rather than a public Marketplace listing. New forks supply their own credentials and approval setup.

Proton currently blocks time through its Google subscription and inherits that refresh delay. Direct Proton remains a separate phase 2 feasibility task. External calendar edits can race a booking across providers; fresh final reads reduce but cannot eliminate that risk. Formal screen-reader/native-speaker approval, independent penetration testing and a recovery drill are not claimed; see [quality boundaries](QUALITY.md).
