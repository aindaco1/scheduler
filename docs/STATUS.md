# Implementation and verification status

Updated September 9, 2026. Phase 1 application implemented; live calendar/recipient acceptance is pending.

## Complete locally

- iCloud Drive `scheduler` checkout and public MIT GitHub repository created.
- Research, source comparisons, confirmed decisions, editable assumptions, shared-design references, and phase 2 Protoxide research preserved in `docs/`.
- Bilingual public booking, guest cancellation/rescheduling, private owner dashboard, and privacy pages; warm system light/dark design.
- Google Calendar/Meet, iCloud CalDAV conflict adapter, Zoom OAuth/meetings adapter, Resend email jobs, and Turnstile integration implemented.
- Shared rule engine for weekly/location hours, recurring/temporary blackouts, 24-hour notice/cutoff, 30-day horizon, separate gaps, timezone/DST, and optional cap/reminders.
- Atomic reservations, duplicate submission protection, uncertain provider-write recovery, reschedule holds, encrypted credentials, and hashed owner/guest authorization.
- `npm run check`: 63 tests passed in the Workers runtime; production build and Wrangler dry-run passed. Chromium booking/admin/management/privacy acceptance passed, including 12 axe scans, English/Spanish, system light/dark, mobile overflow, settings saves and iCloud form handling.
- Formal provider/recovery review found and repaired malformed/truncated CalDAV and non-207 response fail-open behavior, extensionless resources, pending-cancellation races, reschedule conflict recheck, lost rollback reminder, and immutable email retry behavior.
- npm audit: no known vulnerabilities at the checked lockfile.

## Infrastructure

- A dedicated managed Turnstile widget is scoped to `scheduler.dustwave.xyz`.
- A dedicated sending-only Resend key is restricted to the already verified `dustwave.xyz` sending domain. From: Dust Wave Scheduler, `bookings@dustwave.xyz`.
- Bootstrap Worker secrets provisioned. Owner login is restricted to the provisioned owner email; changing `ADMIN_EMAIL` is a secret-only operation.
- Google Cloud configured through the owner's Helium browser: dedicated Scheduler project, Calendar API enabled, production Web OAuth client, domain/privacy branding, and required identity/Calendar scopes. Google client secrets are provisioned in Cloudflare; they are not in source. Google has not verified this personal OAuth app. Google and iCloud owner connections completed. Selected blockers are Personal and Volver under Google, plus the iCloud calendar named Family (the separate Family warning-marked calendar is unselected).
- Zoom's user-managed Dust Wave Scheduler app is configured for the owner's account, with strict callback URL matching, six granular identity/meeting scopes, and credentials provisioned in Cloudflare. The owner OAuth flow completed in Helium. The 30-minute Zoom meeting type is enabled. This private app uses Zoom's development/local-test distribution; it has not been published to the Marketplace. Actual meeting writes remain part of live acceptance.
- GitHub CI passed for code commit `3aa18bc`: [Check run](https://github.com/aindaco1/scheduler/actions/runs/34391546129), including the settings concurrency fix.

## Remaining live acceptance

1. Finish real booking lifecycle verification for the connected Google and iCloud accounts. The dashboard's live verification passed calendar discovery and selected-calendar event reads for the previous day and next seven days; this is not yet a controlled conflict fixture or event-write test.
2. Verify real Zoom meeting creation, recovery lookup, rescheduling, and cancellation through the connected app. The successful OAuth callback verified owner identity; the dashboard verification is not a meeting-write test.
3. Initial meeting durations remain editable defaults: 30-minute video, 60-minute in-person. The owner-confirmed weekday hours, gaps, and three sourced locations are saved in the live dashboard; in-person location choices are enabled. Public booking remains paused during setup.
4. An owner-designated real booking must demonstrate conflict checking, one correct main-calendar event and attendee invite, conference/location, received email, reschedule/cancellation, and reminder behavior. Fixture passes and provider API acceptance are not recipient verification.

Phase 1 is not operationally complete while these real-provider and recipient checks remain outstanding. Account connections are complete. The request to use the owner's inbox as a designated test guest remains unanswered; no live guest invitations have been sent.

## Deployed evidence

- Initial Cloudflare deployment used Worker version `2c2e1e03-2883-4c53-bb00-aedd4738162f` to `scheduler.dustwave.xyz` on September 9, 2026.
- Latest checked code deployment: Worker version `a3ad604d-be65-4bea-8532-47cf1d86da99`, corresponding to code commit `3aa18bc`. Subsequent Zoom secret provisioning created a new secret version.

- Live HTTP verification: English/Spanish booking, admin and privacy pages returned 200, health returned 200, private settings returned 401 without a session, and public configuration exposed no blocking-calendar data and confirmed bookings paused.
- Live browser verification: booking and owner login pages rendered without console errors. A real Turnstile-protected login submission using a reserved non-owner test address returned the generic success response; the owner allowlist prevented email dispatch.
- Admin recovery controls now permit pending/failed cancellation and explain provider recovery states; the browser fixture verifies cancellation remains pending until the provider confirms it.

- Live owner login: Turnstile passed in Helium, the Resend sign-in email was reported delivered, and its single-use link established a working private dashboard session. This verifies owner authentication; it does not establish guest invitation or inbox acceptance.

- Dashboard concurrency: a calendar connection incremented the settings revision while a location edit was pending. The stale write was rejected. Confirmed edits were preserved and reapplied. The updated save flow now merges disjoint top-level changes and retries once using the current revision; competing changes to the same field still stop. Unit tests and the browser conflict fixture pass.

- Final setup check: Google, iCloud, and Zoom show connected; the selected Personal, Volver, and Family blockers survived the Zoom connection update. Verify connections returned Ready to book, including live selected-calendar reads. The public configuration independently confirmed all three meeting types and locations, 24-hour notice/cutoff, 30-day horizon, and the global booking pause. All six public/admin/privacy language routes and health returned 200; unauthenticated private settings returned 401.
