# Implementation and verification status

Updated September 9, 2026. Phase 1 booking is open at [scheduler.dustwave.xyz/alonso](https://scheduler.dustwave.xyz/alonso). Phase 1 and its delivery hardening are deployed and verified for the owner. Inbox placement remains recipient-controlled.

## Implemented and configured

- Public MIT repository, iCloud Drive checkout, research, source comparisons, design references and phase 2 Protoxide investigation are preserved.
- English/Spanish public booking, management and privacy pages plus the private owner dashboard use a warm system light/dark design.
- Google Calendar/Meet, direct iCloud CalDAV, Zoom, Resend and Turnstile are connected. Bookings create events automatically on the primary Google calendar, with an attendee invitation and branded confirmation.
- Personal and Volver under Google and Family under iCloud block bookings. Every event's Busy/Free setting is respected, including all-day Family events. The separately named Family warning calendar is unselected.
- Owner hours are weekdays 09:00–16:00 and 20:30–22:00 America/Denver. The booking horizon is 30 days; notice and guest cancellation/rescheduling cutoff are 24 hours. Video gaps are 15 minutes and in-person gaps 30 minutes, including existing busy events. Locations have separate hours intersected with owner availability.
- Dust Wave Studio, Slow Burn Wells Park and Bow & Arrow are configured from owner-provided/sourced information. Editable initial durations are 30 minutes for Meet/Zoom and 60 minutes in person. Reminders are restored to the 24-hour setting.
- Atomic reservations and durable operation IDs cover duplicate submissions, uncertain provider writes, reschedule holds and recovery. Credentials and sensitive job payloads are encrypted; authorization tokens are hashed or encrypted as appropriate.

## Local verification

The Workers runtime suite covers calendar/DST rules, authorization, concurrency and provider/retry failures. The current email change adds permanent-rejection holding and Retry-After coverage, bringing the suite to 65 tests. The production build, TypeScript checks and Wrangler package dry run pass. Browser acceptance covers booking, management, private settings, English/Spanish, system light/dark, narrow screens, concurrency recovery and 12 axe scans.

The email outbox freezes all delivery fields before its first attempt, preserves them on retry, honors Retry-After and holds permanent rejections or uncertain delivery beyond its deduplication deadline for inspection. The shared helper adds a configured reply address and automatic-message header. It preserves existing subjects, recipients, links and branding; cancellation copy now accurately says no further action is needed.

## Live provider and recipient acceptance

All tests used the owner's explicitly authorized Google account as the guest; no third-party invitation was sent.

- Meet: created one correct Google event with a working Meet link, rescheduled the same event without changing its link, then cancelled it. Direct Google reads verified the timestamps and removal.
- Zoom: created a meeting and Google event, rescheduled with stable provider identity/link, then cancelled. The coordinator confirmed both provider deletions before marking the booking cancelled; the Google event was removed.
- Spanish in-person: real Turnstile submission booked Bow & Arrow with the correct address and hours, then the guest cancelled successfully.
- Gaps: public availability reflected the 15-minute video and 30-minute in-person spacing around the controlled bookings.
- iCloud: live Busy/Free inspection explained the apparent all-day conflict. A separate day's two opaque busy intervals agreed with public availability and adjacent gaps. The owner explicitly chose to respect Free events. The temporary private inspection route/UI was removed after verification.
- Reminder: an actual Durable Object alarm dispatched the confirmation's scheduled reminder. The interval was temporarily set to 48 hours to exercise delivery during this session and then restored to 24 hours; this was not a 24-hour waiting test.
- Resend reported confirmations, updates, cancellations and the reminder delivered. The owner confirmed receipt in Gmail Spam. An original received message passed SPF, DKIM and DMARC and used TLS 1.3, HTML and plain text. Spam placement prevented forwarding to HEY; authenticated delivery alone is not proof of Inbox placement.
- All controlled test bookings are cancelled. A bounded Google search confirmed no remaining Scheduler test events.

## Deployment and account boundaries

- Cloudflare serves the custom domain with workers.dev disabled. Turnstile is scoped to the booking domain. A restricted Resend key sends as Dust Wave Scheduler from `bookings@dustwave.xyz`; open and click tracking are disabled on the verified sending domain.
- Google uses a dedicated personal OAuth project with the required Calendar/identity scopes. The external OAuth app is in production mode but is not Google-verified for public multi-user distribution.
- Zoom uses the owner's private development/local-test app with six granular identity/meeting scopes and strict callback matching. It is not a published Marketplace app.
- Prior checked CI: [3aa18bc check run](https://github.com/aindaco1/scheduler/actions/runs/34391546129). The last pre-hardening Worker version was `6c06f811-d397-4efa-850f-924fdd697f7e`; final email rollout evidence is recorded below when completed.
- Public English/Spanish routes and health returned 200; unauthenticated private settings returned 401. Live configuration and the owner dashboard independently confirmed connected providers, selected calendars, meeting/location settings and open booking.

## Phase 2

Profiles such as Dust Wave/Volver, Stripe pay-what-you-can including free, and direct Proton integration remain phase 2. Proton currently contributes conflicts through the selected Google subscription. Public multi-owner onboarding/provider verification is separate from this personal phase 1 deployment.

## Final email rollout

- Source commit `752243c` passed [GitHub CI](https://github.com/aindaco1/scheduler/actions/runs/34399237652), including all 65 Workers tests, build/types, browser acceptance and Wrangler dry run.
- Cloudflare Worker version `5b78c1e5-1b62-44bb-af13-b4bc6ad69f0d` deployed the shared reply headers and bounded retry handling.
- A single additional owner-authorized delivery check used the same source transport and shared helper from the local checkout against Resend. It deliberately created no new calendar booking; it was a transport/header check, not another production outbox lifecycle test.
- The received Gmail original passed SPF/DKIM/DMARC, used TLS 1.3, contained both plain text and HTML, and included the configured owner Reply-To plus `Auto-Submitted: auto-generated`. Gmail's existing forwarding/delete-copy behavior ran, and the matching 14:20 message was observed in HEY. This latest test did not remain in Spam. No mailbox rule or DNS enforcement policy was changed to obtain the result.

This verifies the owner’s current delivery path. It does not promise universal Inbox placement or establish reputation for every recipient/provider. The earlier complete booking lifecycle, reminder and clean-up evidence remains the phase 1 functional acceptance.

## Temporary blackout control layout

The owner-reported desktop misalignment is fixed with a layout scoped to the blackout actions: the buttons and date field share a 48-pixel minimum height and align along their bottom edge. The whole-day field and action wrap together on narrow screens. Labels and booking behavior are unchanged.

Local verification: all 65 Workers tests and TypeScript checks passed. The final build passed the existing browser acceptance and Wrangler dry run. An isolated rendered check covered 24 combinations of English/Spanish, light/dark and 320–1280-pixel viewports, with aligned desktop controls and no horizontal overflow. Desktop and mobile panel screenshots were visually reviewed. These checks used fixture data and made no live calendar, settings or email writes.

Deployment: source commit `bc1aa2e` is live in Cloudflare Worker version `33ecb1cf-4330-480f-b74a-5acc357f5b3d`. Public fetches of the deployed CSS and admin script matched the locally verified build byte for byte; the English/Spanish booking pages and admin shell returned HTTP 200.

[GitHub CI for `bc1aa2e`](https://github.com/aindaco1/scheduler/actions/runs/34410001899) passed the full check workflow.

## Owner messages for booking changes

Optional owner messages are implemented in the cancellation dialog and reschedule form, with English/Spanish labels, a 2,000-character limit and draft retention on request failure. The note appears in both plain-text and HTML versions of the corresponding guest notification after provider confirmation. Markup is escaped, line breaks are preserved, blank messages retain existing email content, and notes are excluded from reminders and later changes. The settings save bar no longer covers booking forms.

Local verification covers authenticated HTTP requests, oversized/invalid notes, guest-authoring rejection, idempotency, provider and email retries, failed reschedules, and safe bilingual email rendering. The Workers suite now contains 75 tests. Browser acceptance adds owner message submission/retry/dismissal checks plus English desktop and Spanish dark mobile screenshots and axe scans. These are isolated fixtures; no live meeting was changed and no live guest email was sent for this feature. `npm run check` passed, including all 75 tests, TypeScript, the production build, browser acceptance and Wrangler dry run. CI and deployment evidence follow below.

Deployment: source commit `f9c0427` is live in Worker version `ed7a3f3a-2b58-4464-8a30-d1709a75b258`. All five changed frontend assets matched the verified local build byte for byte. English/Spanish booking and admin shells returned HTTP 200, and unauthenticated private settings remained HTTP 401. Existing bookings require no data migration.

[GitHub CI for `f9c0427`](https://github.com/aindaco1/scheduler/actions/runs/34410953142) passed the complete check workflow.

## Time pickers and travel blackouts

All weekly Until controls (working hours, recurring blackouts and location hours) now use the same time picker as From. Midnight end values round-trip as the end of the selected day. Whole-day blackout creation is on a separate row, and both whole-day and dated-period blackouts offer All meetings or In-person only. Old blackouts retain their all-meeting behavior.

Verification adds coverage for scope validation, exact interval boundaries, all three meeting services, slot listing, booking and rescheduling, and midnight ranges. Browser checks cover saved scopes, working/recurring/location end-time edits, a 25-hour daylight-saving day, the separate desktop row, bilingual themes and narrow screens. These checks use isolated fixtures and do not modify live availability or calendar events.

Local gates passed: all 83 Workers tests, TypeScript, template checks, production build, browser acceptance and Wrangler dry run. Final desktop and mobile screenshots were reviewed, including unclipped AM/PM controls at 320 pixels. CI and live deployment evidence follow below.

Deployment: source commit `aedc679` is live in Worker version `6cde3782-522d-4e3a-9cf9-76a06b1e98af`. The live admin script and stylesheet matched the verified build byte for byte. English/Spanish booking and admin routes returned HTTP 200, and unauthenticated private settings remained HTTP 401. No live blackout or calendar setting was created during verification.

[GitHub CI for `aedc679`](https://github.com/aindaco1/scheduler/actions/runs/34412034499) passed the complete check workflow.
