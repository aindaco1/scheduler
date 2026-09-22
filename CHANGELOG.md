# Changelog

## Unreleased

- Page booking and guest rescheduling by seven dates with actual availability after minimum notice. Skip unavailable dates, retain all slots for each displayed date, look ahead before enabling Next, and stop at the configured horizon. Keep provider failures visible and preserve location/time-zone browsing context.

- Identify the host in new calendar invitations using the saved Display name and connected Google account. Titles include both participants, descriptions name the host and guest in the booking language, and the host is included as an accepted attendee. Preserve existing events and guest responses during recovery and rescheduling.
- Update Zod to 4.6.5, Wrangler to 4.131.2, Sass to 1.104.1, Node types to 26.5.1, and the SHA-pinned Ruby setup action to 1.322.0. Retain the Cloudflare-compatible Vitest 4 and workerd pins; verify the combined updates with the full check and dependency audits.
- Detect variable-length GitHub App installation tokens in the source audit, including dots, underscores, and hyphens, while keeping credential values out of diagnostics.

## 1.0.1 — 2026-09-10

Security audit, recovery verification and meeting sharing. Existing installations need no schema migration or provider reconnection; preserve the namespace and encryption key.

- Complete the documented engineering audit and fix all seven confirmed findings. Keep credential-bearing requests on approved endpoints and enforce response deadlines through body reads; sanitize provider diagnostics.
- Prevent a late Zoom refresh from restoring a disconnected credential and recheck booking state immediately before sending queued mail.
- Rate-limit guest management, reject out-of-policy reschedules before provider I/O, enforce the change deadline after provider reads, and return accurate client-validation errors.
- Update Ruby JSON to 2.21.2 for CVE-2026-71847, add fail-closed Ruby advisory checks alongside npm in CI, and avoid persisting checkout credentials.
- Add an isolated live Cloudflare recovery/quarantine drill and a production repair runbook. Verify restored SQL, KV, encrypted payloads and alarm state without touching live bookings or sending mail.

- Add Copy link for saved, active meeting types, localized meeting-specific Open Graph/X metadata and WebPage/Person/Service JSON-LD, runtime canonical/language links and a sitemap of active types. Render public summaries before JavaScript, supply a raster preview and Apple touch icon, and show a noindex 404 for retired or ambiguous meeting links. Saved content changes update previews without a rebuild.
- Organize maintainer guides around `docs/README.md`, move detailed contribution/security/license notices into `docs/`, and separate release evidence from research. Remove redundant root pointer files so each detailed guide has one home.
- Document Phase 2 separately, including two-way Google Calendar sync when a booked guest declines. Phase 2 features remain planned.

See the [audit report](docs/release-evidence/security-audit-1.0.1-2026-09-10.md) and [release verification](docs/STATUS.md) for evidence and limits.

## 1.0.0 — 2026-09-10

First stable, MIT-licensed release for a single owner's self-hosted scheduling page.

- Google Calendar and direct iCloud conflict checking; automatic Google invitations; Google Meet, Zoom and in-person bookings.
- Configurable notice, booking horizon, daily limits, default/per-type gaps and cancellation/rescheduling deadlines.
- Weekly hours, recurring and date-range blackouts, in-person-only travel blocks, and optional U.S. federal holiday blocking.
- Guest booking management, optional owner messages with changes, and up to three reminders.
- Private owner dashboard with logo upload, editable branding, optional Spanish, system themes and responsive layouts.
- Monday-based week navigation that stays in place when switching venues, bounded availability caching and one automatic retry for transient reads.
- Durable reservation/provider/email recovery, private credentials, Turnstile, access controls, and automated quality checks.
- Mobile/tablet save controls are centered; booking addresses and management summaries have clearer spacing, including with enlarged text.
- Node 24 CI and Acorn 8.18.0; retain Vitest 4 until the Cloudflare test pool supports the next major.
- Recursive-clone installation instructions, provider setup guide, documented upgrades and safe generated-output cleanup.

Existing installations need no new database migration or account reconnection for 1.0.0. Keep the Worker name, owner slug, migration and encryption key unchanged when upgrading. Provider setup and actual email receipt must be verified for each new fork.

Profiles, Stripe pay-what-you-can bookings (including free), and direct Proton integration remain phase 2. The owner deployment uses Proton through Google. This release does not claim public Google/Zoom app verification, universal Inbox delivery, or a formal accessibility certification.

See [release verification](docs/STATUS.md) and the [pre-1.0 development history](docs/history/pre-1.0.md) for dated evidence.
