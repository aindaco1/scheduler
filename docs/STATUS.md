# Implementation and verification status

Updated September 9, 2026. Phase 1 application implemented; live calendar/recipient acceptance is pending.

## Complete locally

- iCloud Drive `scheduler` checkout and public MIT GitHub repository created.
- Research, source comparisons, confirmed decisions, editable assumptions, shared-design references, and phase 2 Protoxide research preserved in `docs/`.
- Bilingual public booking, guest cancellation/rescheduling, private owner dashboard, and privacy pages; warm system light/dark design.
- Google Calendar/Meet, iCloud CalDAV conflict adapter, Zoom OAuth/meetings adapter, Resend email jobs, and Turnstile integration implemented.
- Shared rule engine for weekly/location hours, recurring/temporary blackouts, 24-hour notice/cutoff, 30-day horizon, separate gaps, timezone/DST, and optional cap/reminders.
- Atomic reservations, duplicate submission protection, uncertain provider-write recovery, reschedule holds, encrypted credentials, and hashed owner/guest authorization.
- `npm run check`: 56 tests passed in the Workers runtime; production build and Wrangler dry-run passed. Chromium booking/admin/management/privacy acceptance passed, including 12 axe scans, English/Spanish, system light/dark, mobile overflow, settings saves and iCloud form handling.
- Formal provider/recovery review found and repaired malformed/truncated CalDAV fail-open behavior, extensionless resources, pending-cancellation races, reschedule conflict recheck, lost rollback reminder, and immutable email retry behavior.
- npm audit: no known vulnerabilities at the checked lockfile.

## Infrastructure

- A dedicated managed Turnstile widget is scoped to `scheduler.dustwave.xyz`.
- A dedicated sending-only Resend key is restricted to the already verified `dustwave.xyz` sending domain. From: Dust Wave Scheduler, `bookings@dustwave.xyz`.
- Bootstrap Worker secrets provisioned. Owner login is restricted to the provisioned owner email; changing `ADMIN_EMAIL` is a secret-only operation.
- Google/Zoom client secrets and owner calendar connections are not provisioned. Google Cloud browser access reaches the account sign-in screen.
- GitHub CI passed for the initial commit: [Check run](https://github.com/aindaco1/scheduler/actions/runs/34386873149). Subsequent code changes run the same gates.

## Remaining live acceptance

1. Owner Google Cloud sign-in; create/configure the Web OAuth client, then connect the intended main Google Calendar from the private dashboard.
2. Connect iCloud with an owner-issued app-specific password and select the real Family calendar. Select the subscribed Proton calendar under Google.
3. Configure/connect the Zoom OAuth app and enable the Zoom meeting type if wanted at launch.
4. Review actual working hours, gaps, meeting types, and in-person locations/hours. Initial values are editable proposals; public booking starts paused.
5. An owner-designated real booking must demonstrate conflict checking, one correct main-calendar event and attendee invite, conference/location, received email, reschedule/cancellation, and reminder behavior. Fixture passes and provider API acceptance are not recipient verification.

Phase 1 is not operationally complete while these account authorizations and real-provider checks remain outstanding. No live guest invitations have been sent.

## Deployed evidence

- Initial Cloudflare deployment used Worker version `2c2e1e03-2883-4c53-bb00-aedd4738162f` to `scheduler.dustwave.xyz` on September 9, 2026.
- Google and Zoom remain unconnected; deployment intentionally supports the paused setup state without dummy provider credentials.

- Live HTTP verification: English/Spanish booking, admin and privacy pages returned 200, health returned 200, private settings returned 401 without a session, and public configuration exposed no blocking-calendar data and confirmed bookings paused.
- Live browser verification: booking and owner login pages rendered without console errors. A real Turnstile-protected login submission using a reserved non-owner test address returned the generic success response; the owner allowlist prevented email dispatch.
- Admin recovery controls now permit pending/failed cancellation and explain provider recovery states; the browser fixture verifies cancellation remains pending until the provider confirms it.
