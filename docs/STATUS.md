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

## Saving blackouts during calendar outages

The reported blackout-save error came from coupling every enabled settings save to live calendar and Zoom checks. Routine local edits now save without provider calls. Opening bookings and changing calendar dependencies retain live verification; availability, booking and rescheduling still reject requests when conflict checks fail. Settings-save failures now explicitly say that edits were not saved and remain available for retry, in both languages.

The current live connection verification passed during investigation. This does not identify which provider caused the earlier failure. The owner's open form and unsaved blackout draft were left untouched. Regression coverage checks full-day and in-person-only saves with providers offline, pausing, dependency validation, stale revisions during verification, reservation/reschedule failures and browser draft retention. Final local, CI and deployment evidence follows below.

Local verification passed: all 92 Workers tests, TypeScript, template checks, production build, bilingual browser/accessibility acceptance and Wrangler dry run. Test data and providers are isolated fixtures; no live booking or email was created.

Deployment: source commit `bf51781` is live in Worker version `901dbb4b-2363-487c-a81d-4bb28939b98b`. The public admin asset matched the verified build byte for byte. English/Spanish booking and admin pages and health returned HTTP 200; unauthenticated private settings remained HTTP 401. The live configuration reported ready, and read-only availability checks for each of the three currently offered meeting types returned HTTP 200 with slots. No live settings were written during verification, so the owner's pending form can retry Save changes without a reload.

[GitHub CI for `bf51781`](https://github.com/aindaco1/scheduler/actions/runs/34413242131) passed the complete check workflow.

## Inclusive whole-day date ranges

Whole days now has From date and Through date controls, with both dates included. Single days prefill the same end date; reversed or missing dates cannot add a blackout. A multi-day trip becomes one ordinary blackout with either scope. Dates and period edits use the configured schedule time zone; existing saved instants remain unchanged. The implementation reuses the installed Temporal library for calendar-day arithmetic and the existing blackout storage/availability rules.

Regression coverage adds first/middle/final day enforcement, dates outside the range, all/video/in-person modes, single-day compatibility, invalid input, both scopes, ten-day inclusive bounds, a 73-hour daylight-saving range, and saving/editing while the browser is in Tokyo and the schedule is in Denver. Desktop light and mobile Spanish dark controls were visually reviewed. Verification uses isolated fixtures and does not create the user's example trip in live settings. Final check, CI and deployment evidence follows below.

Local verification passed: all 94 Workers tests, TypeScript, template checks, production build, bilingual browser/accessibility checks and Wrangler dry run. Both desktop themes and the mobile range controls were reviewed visually.

Deployment: source commit `f5ee35b` is live in Worker version `8ded1c57-2622-4bda-ba68-e7574ad881fc`. The live admin script and stylesheet matched the verified local build byte for byte. English/Spanish booking and admin pages and health returned HTTP 200; private settings still required authentication (HTTP 401). An authenticated, separate Helium tab confirmed the From date, Through date, scope and Block dates controls, with America/Denver displayed and existing saved blackouts intact. No production setting, calendar event or email was changed during verification.

[GitHub CI for `f5ee35b`](https://github.com/aindaco1/scheduler/actions/runs/34414040260) passed the complete check workflow.

## Monday booking weeks

The shared public booking/guest-rescheduling picker now opens on the current week's Monday in the visitor's selected time zone. Week labels show Monday-to-Monday boundaries, and navigation advances calendar weeks. The final partial week remains reachable without extending the booking horizon. Changing zones reloads the correct boundaries, and pending/failed reads clear old slots. Availability scans share an eight-elapsed-day maximum so a calendar week crossing a daylight-saving offset change is accepted; slot notice, horizon, conflict and authorization enforcement remain intact.

Local verification passed: all 101 Workers tests, TypeScript, template checks, production build, browser/accessibility acceptance and Wrangler dry run. Coverage includes the Sep 7–14 example, Sunday/Monday differences between zones, 167/169-hour weeks, consecutive page boundaries, the final partial week and exact horizon boundary, provider-read failures/retry, and authenticated rescheduling queries. English desktop and Spanish 320-pixel dark screenshots were reviewed. All verification uses isolated fixtures; no live booking or settings were changed. CI and deployment evidence follows below.

Deployment: source commit `9fb33bf` is live in Worker version `9b5130a2-6600-40ed-b26f-8a3a437fe4d7`. Both changed public scripts matched the verified local build byte for byte. English/Spanish booking and management pages and health returned HTTP 200; unauthenticated private settings remained HTTP 401. A separate Helium tab showed Sep 7–Sep 14 with Previous week disabled, then advanced to Sep 14–Sep 21 and loaded live available slots. No slot was selected or booked, and no settings were changed.

[GitHub CI for `9fb33bf`](https://github.com/aindaco1/scheduler/actions/runs/34415553557) passed the complete check workflow.

## Optional federal holiday blackouts

Settings now includes **Automatic blackouts → Block U.S. federal holidays**, off by default. The shared availability rule calculates the 11 annual nationwide holidays and their standard observed weekdays locally in the schedule time zone, including actual weekend dates and New Year's observance in the preceding December. It applies to every meeting type, new reservations and rescheduling, while retaining existing bookings. The annual rules and observed-date conventions were verified against the [OPM holiday calendar](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/). Regional Inauguration Day and one-off closures remain manual blackouts.

Local verification passed: all 110 Workers tests, TypeScript, template checks, production build, browser/accessibility acceptance and Wrangler dry run. Coverage includes all 2026 holiday dates, Saturday/Sunday observance, year boundaries, schedule-time-zone boundaries, Meet/Zoom/in-person enforcement, existing booking retention, old-client compatibility and saving during provider outages. English desktop and Spanish mobile dark screenshots were visually reviewed; browser checks confirm keyboard operation, persistence after reload and disabling the rule. All mutations used isolated fixtures. CI and deployment evidence follows below.

Deployment: source commit `a8b6429` is live in Worker version `baff586b-18ec-4272-9f6c-5c49b6dd68b3`. The live admin script matched the verified local build byte for byte. English/Spanish booking and admin pages and health returned HTTP 200; unauthenticated private settings remained HTTP 401. A separate authenticated Helium tab confirmed the new checkbox under Settings, unchecked with no unsaved changes. The preference was not enabled during verification, and no live booking, calendar event or email was created or changed.

[GitHub CI for `a8b6429`](https://github.com/aindaco1/scheduler/actions/runs/34417628470) passed the complete check workflow.

## Dropdown spacing and Scheduler identity

Native dropdowns now use a shared inset chevron with reserved text padding across booking, management, settings and appearance controls. High-contrast forced-color modes keep the system arrow. English/Spanish public and admin hero taglines are removed; the footer reads **SCHEDULER**. Starter introduction and metadata copy also omit the removed phrase. The live customized introduction was inspected and does not contain it, so saved settings require no update.

The new monochrome clock-and-selected-time icon draws on the inspected CutNotes, Auto Subtitle and MKV Magic icons. One SVG mark feeds both the theme-aware header and favicon. The favicon URL is versioned to refresh browser caches. Design rationale and concept-generation notes are in [design reuse](research/design-reuse-notes.md#scheduler-icon-and-copy-refinement).

Local verification passed: all 110 Workers tests, TypeScript, template checks, production build, existing browser/accessibility acceptance and Wrangler dry run. Additional isolated visual checks covered English/Spanish, light/dark, and 320/360/1280-pixel widths with no horizontal overflow. Desktop and mobile booking views, admin dropdowns, explicit theme override, forced colors and the final SVG icon were visually reviewed. Verification used fixtures and made no production settings, booking, calendar or email writes. CI and deployment evidence follows below.

Deployment: source commit `e7c5f28` is live in Worker version `d728ff88-fd2b-4e97-810e-208af02a3294`. The admin script, booking script, stylesheet, favicon and dropdown SVG matched the verified build byte for byte. All eight English/Spanish booking, admin, management and privacy routes returned HTTP 200 with the new icon reference, mark and footer; HTML includes runtime-injected scripts, so it is not byte-identical to the static build. Health returned HTTP 200 and unauthenticated private settings HTTP 401. A separate Helium tab visually confirmed the live location dropdown inset and footer, and confirmed the admin tagline was gone. The existing custom header logo still takes precedence over the new default mark. No production settings or bookings were changed.

[GitHub CI for `e7c5f28`](https://github.com/aindaco1/scheduler/actions/runs/34423650303) passed the complete check workflow.
