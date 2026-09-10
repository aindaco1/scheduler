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

## Booking copy and privacy wording

The homepage's three-line notice/horizon/time-zone strip and its unused styling are removed in both languages. Scheduling limits remain enforced. The English and Spanish privacy pages use more direct wording while preserving the disclosures, service names, headings, links and paragraph structure. The Humanizer and Constrained Humanization Editing skills guided the edit; both versions stay within 5% of their original word counts.

Timezone behavior was checked in the existing implementation: the dropdown starts with `Intl.DateTimeFormat().resolvedOptions().timeZone`, falls back to `America/Denver` if unavailable, and lets the visitor select another zone. A valid timezone in a meeting-specific booking link is retained. This feature uses the browser-reported zone rather than a GPS or IP lookup; no timezone behavior changed in this update.

Local verification passed: all 110 Workers tests, TypeScript, template checks, browser/accessibility acceptance and Wrangler dry run. The production build and browser suite passed again after the final static-copy pass. English desktop and Spanish mobile privacy screenshots and the simplified booking homepage were visually reviewed. No live settings, bookings, calendar events or emails were changed. CI and deployment evidence follows below.

Deployment: source commit `5f667dc` is live in Worker version `11d4f114-b26b-4aa1-964f-30fcf8ac1b40`. The booking script and stylesheet matched the verified build byte for byte, as did the article content of both privacy pages. English/Spanish booking and privacy routes and health returned HTTP 200; unauthenticated private settings remained HTTP 401. A separate Helium tab confirmed the revised privacy text and the loaded homepage without the three removed lines. No production settings or bookings were changed.

[GitHub CI for `5f667dc`](https://github.com/aindaco1/scheduler/actions/runs/34424876242) passed the complete check workflow.

## Privacy service links

The English and Spanish privacy pages now link the named services to their official product sites: Google Calendar, Google Meet, Zoom, Resend, Cloudflare, Turnstile and iCloud. The seven destinations were opened and verified. URLs live once in `_data/services.yml` and are shared by both pages; the existing prose is unchanged.

Local verification passed: the complete check workflow, including 110 Workers tests, TypeScript, template checks, production build, browser/accessibility acceptance and Wrangler dry run. Each rendered article contains eight service links covering the seven destinations, with all Liquid references resolved. No live settings, booking, calendar or email writes were made. CI and deployment evidence follows below.

Deployment: source commit `38ee36c` is live in Worker version `c759730b-c813-47e0-9c6b-b3dd02900fba`. Both privacy routes returned HTTP 200, and each live article matched the verified build with eight links covering all seven services.

[GitHub CI for `38ee36c`](https://github.com/aindaco1/scheduler/actions/runs/34425445331) passed the complete check workflow.

## Booking settings, tab restoration and meeting heading

Minimum notice and booking window now appear at the top of Settings under Booking boundaries, together with the guest change deadline and daily cap. Availability retains hours and blackouts. All controls reuse the existing saved settings and validation. The audit confirmed that slot listing, booking, guest rescheduling, public week navigation and applicable policy copy already read the saved values; 24 hours and 30 days are initial defaults, not fixed runtime rules. Unrelated provider retry limits, calendar-day arithmetic and booking-history lookback are separate concerns.

Admin reuses the shared accessible tab component to restore the selected section across refreshes and language changes in the same browser tab. Only the section name is stored in session storage. Invalid stored names fall back to Bookings, and unavailable storage does not prevent navigation. The English/Spanish homepage now has one Choose a meeting / Elige una reunión heading, replacing the old question and removing the duplicate caption.

Local verification passed: all 113 Workers tests, TypeScript, template checks, production build, browser/accessibility acceptance and Wrangler dry run. Coverage includes configurable notice/horizon boundaries (including zero notice), a 48-hour/45-day settings save through failure and revision-conflict recovery, saved-value reload, all four desktop tabs, mobile tab refresh, language switching, invalid/blocked storage, and public policy text/week navigation using the saved custom values. Desktop light and Spanish mobile dark screenshots were visually reviewed. All setting mutations used isolated fixtures; no live settings, bookings, calendar events or emails were changed. CI and deployment evidence follows below.

Deployment: source commit `8e75f4d` is live in Worker version `d30a077a-57f5-4362-83b0-b667227e8147`. The admin and booking scripts matched the verified local build byte for byte. English/Spanish booking and admin pages and health returned HTTP 200; unauthenticated private settings remained HTTP 401. A separate authenticated Helium tab showed Minimum notice 24 and Booking window 30 under Settings, restored Settings after refresh, and remained fully saved. A separate live homepage tab visually confirmed the single Choose a meeting heading. No production settings, bookings, calendar events or emails were changed.

[GitHub CI for `8e75f4d`](https://github.com/aindaco1/scheduler/actions/runs/34426178147) passed the complete check workflow.

## Gaps, logo uploads, reminder schedules and Settings order

Settings now orders Your booking page, Booking boundaries, Reminders, Automatic blackouts, then Calendar connections. Each meeting type's existing gap is editable directly under Booking boundaries. The logo URL input is replaced by a PNG/JPEG upload with preview/removal, 1 MB maximum, 512 × 512 recommended size and 2048 × 2048 maximum. Existing HTTPS logos remain visible. Uploads stage a bounded image in the existing Durable Object and publish through the regular revision-checked settings save; no additional storage service or credentials are needed. Raster header/dimension validation reuses the pinned Dust Wave Media Core package.

Reminder settings support zero to three distinct whole-hour offsets from 1–168. Legacy scalar settings normalize to a one-element schedule (zero becomes empty). Existing queued reminders retain their timing and delivery IDs. New/rescheduled meetings get separate reminder jobs per offset through the existing outbox; stale jobs are suppressed after cancellation/rescheduling and uncertain deliveries preserve their idempotency key and frozen payload.

The calendar-list investigation found no Scheduler-generated warning marker: iCloud display names are rendered as supplied. The pictured Family and Family-with-warning entries have different IDs, as indicated by their independent selected states. The list now explains that symbols come from provider names and only checked calendars block bookings. No calendar was hidden, renamed or deselected.

Local verification passed: the full check workflow with all 120 Workers tests, TypeScript, template checks, production build, browser/accessibility acceptance and Wrangler dry run. The browser suite passed again after the final calendar-name assertions and screenshot refinements. Coverage includes authenticated/same-origin bounded uploads, invalid raster/size/dimensions, draft publication/removal, bounded draft storage, legacy reminder migration, three independent deliveries and retry identity, reschedule/cancellation suppression, editable gaps, duplicate reminder rejection, zero reminders, settings persistence/order, preview/removal, upload failures, and 320-pixel Spanish dark layout. Desktop and mobile logo, gap and reminder screenshots were visually reviewed. All writes used isolated fixtures; no production settings, calendar events, bookings or emails were changed. CI and deployed verification follow below.

The first CI run for `3c8139b` reported an extra send in the existing permanent-rejection fixture. Recovery fixtures left unsent jobs/alarms behind while later tests replaced the shared provider mock. Cleanup now deletes each fixture's alarm and queued jobs after its test, and the permanent-rejection assertion also checks the expected idempotency key. This changes test isolation only; the deployed runtime is unchanged. The full local check passed again with 120 tests and browser/accessibility coverage.

Deployment: functional source commit `3c8139b` is live in Worker version `499eaf5e-44eb-4d41-9d6b-04d480848aa1`; the subsequent fixture-only commit `2c3a03d` does not change runtime code. The admin, booking and management scripts and stylesheet matched the verified build byte for byte. English/Spanish booking and admin pages and health returned HTTP 200; private settings remained HTTP 401 without authentication. A separate authenticated Helium tab confirmed the requested section order, existing logo preview, upload constraints, 15/15/30-minute gap values, one 24-hour reminder with Add reminder, and independent Family selections (plain Family checked; Family-with-warning unchecked). All changes saved remained disabled. The temporary verification tab was closed without writing production settings or sending emails.

[GitHub CI for `2c3a03d`](https://github.com/aindaco1/scheduler/actions/runs/34428514349) passed the complete check workflow, including all 120 Workers tests and browser/accessibility acceptance. Logo publication and multiple-reminder deliveries were verified with isolated provider fixtures, not new live uploads or recipient mail.

## September 9 quality review and calendar performance

The implementation now has private, bounded 30-second busy snapshots with coalesced reads, reusable Google token/iCloud discovery metadata, fresh conflict checks for booking/rescheduling/recovery, and invalidation on settings/connection/booking changes. Google reads request only needed event fields. Five pre-change live availability samples took 1,800–3,193 ms (median 2,115 ms).

Public assets are shared content-hashed modules with size budgets. Generated JavaScript previously totaled 585,631 bytes across four separate entry bundles; shared modules now total approximately 240 KB. Admin/manage/API responses are private/no-store/no-transform and noindex; HTML prevents automatic zone-wide script injection while explicit Turnstile remains in use. Public routes have canonical/reciprocal locale links, social metadata, robots and a sitemap.

Keyboard week navigation and live announcements are repaired. New 200%-text / 320px tests exposed and fixed header/card overflow. English/Spanish error handling and authored-label fallback were corrected. Identity/routes/brand derive from Wrangler, with a setup command and isolated rendered-browser fork test for a different owner/domain/timezone. See [the full audit](QUALITY.md) and [fork guide](FORKING.md).

Local checks pass: 129 Worker tests; 298 paired UI-message checks; eight localized route/SEO/privacy checks; bundle budgets; fork setup; browser booking/admin/management/privacy flows, keyboard, 200% text, reduced motion and axe; type checks; template contract; production build and Wrangler dry run. The npm advisory query found zero known vulnerabilities. GitHub private vulnerability reporting is enabled, with weekly CI/advisory checks and Dependabot configuration committed. These tests use synthetic guests/providers and do not send real invitations.

A pre-change live Lighthouse mobile lab run measured performance 86, accessibility 100, best practices 92, SEO 100, LCP 2.4 s, TBT 0 ms and CLS 0. It detected Cloudflare-injected CSP violations, a large external header logo, and inspection-environment script overhead; this single lab run is not real-user Web Vitals or proof of complete SEO coverage. Post-deployment evidence is recorded below after release verification.

The first deployed audit candidate passed CI but its mobile lab run exposed CLS 0.699 from a visible initial heading that differed from the owner’s current runtime profile. The heading now stays in the no-JavaScript fallback, header geometry is reserved, and public booking/management load the slot picker lazily. Initial transitive JavaScript is now about 9 KB / 8 KB gzip respectively, with 15 KB regression budgets. Full browser booking/rescheduling checks exercise the lazy picker.

### Final quality release verification

- Source `51efbffcdf2b3144ce38b1be2f1d608646546ba5` is deployed as Worker `45418d0a-a568-42ad-ab07-609f1d4e1fed`. [Final CI passed](https://github.com/aindaco1/scheduler/actions/runs/34431620982).
- Five matched-query live reads had a median of **319 ms**, versus **2,115 ms** before (about 85% lower). The first read still took 2,670 ms; the four repeat reads took 280–334 ms. An earlier 30-read run of the same calendar backend measured median 239 ms / p95 311 ms, including a 2,117 ms cold read. These are small sequential samples, not sustained-load or real-user percentiles.
- Final live mobile Lighthouse: **performance 96, accessibility 100, best practices 100, SEO 100**; LCP approximately 2.5 s, TBT 0 ms, CLS 0, speed index 2.0 s. This confirms the visible initial-heading regression was removed. The large legacy external logo remains an asset-optimization opportunity.
- Live English/Spanish booking/privacy/admin/manage routes, sitemap and robots returned 200; unsigned admin API returned 401. Private headers/noindex and public HTML no-transform were verified. Cloudflare's automatic analytics/JSD injections were absent, with explicit Turnstile still part of the application.
- Every deployed JavaScript asset matched the final local build byte-for-byte. Initial booking/management JavaScript totals **8,909 / 8,301 bytes gzip** including eager shared imports; all generated JS totals 240,647 bytes (about 59% less than the original duplicated entry bundles).
- Helium confirmed the real lazy picker loaded, Monday weeks changed from Sep 7–14 to Sep 14–21, 104 available times were announced, and keyboard focus remained on Next week. Temporary verification tabs were closed; no live booking, settings change or test invitation was made during this audit.
- [Metrics-only evidence](research/quality-evidence-2026-09-09.json) records versions, samples and budgets. Formal screen-reader/native-speaker review, independent penetration testing and an operational restore drill are not claimed; the specific limits and follow-ups are in [QUALITY.md](QUALITY.md).


## 2026-09-09 — Default gaps, optional Spanish and compact settings

Implemented separate default video/in-person gaps in Settings with per-type inheritance or explicit overrides (including zero) in Meeting types. Legacy matching defaults migrate to inheritance without changing effective availability; custom gaps and stored booking snapshots remain intact. The Google account address appears below its connection status in green. Logo upload/help and preview/actions share desktop columns and stack on mobile.

**Offer Spanish** defaults on. Turning it off hides Spanish editing fields and expands English fields, preserves translations, hides the site language switch, temporarily redirects Spanish routes to English, and removes Spanish live search alternates/sitemap entries. Existing bookings retain their recorded email language; new bookings use English while disabled. Language-aware shells read only a small local preference alongside static assets, not calendar events. Hashed assets and the calendar cache retain their existing behavior.

Local verification: `npm run check` passed, including 135 Worker tests across 14 files, 303 paired UI messages, generated route/SEO and bundle budgets, isolated fork setup, browser booking/admin/management flows, settings save/reload, default/override behavior, Spanish off/on with translation preservation and full-width fields, desktop/mobile screenshots, axe, keyboard, high text zoom, build and Worker dry run. Initial booking/management JavaScript remains about 9 KB / 8.4 KB gzip. Rendered gap controls, Google connection card and desktop/mobile logo layouts were inspected. These tests use synthetic data and do not send invitations or modify live calendar settings. CI/deployment/live verification follows below.

### Preference release verification

- Source `ee00213e3027335676ed5053d03d41efd70d6dba` deployed as Worker `7a21e5cf-1b25-4033-ad75-6a936ece9c56`; [GitHub CI passed](https://github.com/aindaco1/scheduler/actions/runs/34433081743).
- Live configuration still has Spanish enabled and effective gaps of 15 / 15 / 30 minutes. All eight English/Spanish application routes and sitemap returned 200; unsigned settings API returned 401. Nine deployed build assets matched the local build exactly, with immutable caching intact. Live HTML had no unexpected Cloudflare script injection.
- Five read-only calendar queries returned 200: 2,702 ms cold, then 266 / 262 / 312 / 281 ms; median 281 ms. This small sequential sample confirms the existing browse cache is still working; it is not sustained-load evidence.
- Rendered desktop/mobile fixture checks and local/hosted tests passed. Live Helium dashboard inspection could not run because the Mac was locked. Spanish off/on was exercised in isolated browser/Worker fixtures; no live preferences, calendar events or invitations were changed for testing.
- [Release evidence](research/preferences-release-2026-09-09.json) contains only versions, status, asset hashes and timings.


## 2026-09-09 — Meeting details and live branding

Simplified Gap (minutes) into an editable field in the left desktop column, populated from the appropriate video/in-person default. A different value is an override; entering the current default restores inheritance. Removed the Use default checkbox and changed the meeting-type enable label to Active. Browser tests caught and fixed a duplicate blur/change event that could replay a previous gap when the meeting mode changed. Added space beneath the booking-list Refresh toolbar.

Separated each location’s full street address from optional arrival instructions. Google receives a clean venue/address Location and separately labeled Guest note and Arrival instructions sections in its description. Entry instructions are snapshotted with new bookings, included in private booking summaries and relevant emails, and omitted from anonymous configuration. Existing guest notes, location addresses and stored bookings remain intact. Provider payload tests check English/Spanish text, line breaks and HTML escaping without sending invitations.

Brand name is now a Settings field, seeded from `BRAND_NAME`. The old flash came from Jekyll’s deployment-brand header being replaced only after client configuration loaded; Privacy never made that replacement. All page shells now receive the saved logo/name and site-name metadata in their initial response using the existing presentation read. A shared renderer reserves logo dimensions and retains matching images during hydration. Removing an uploaded logo restores the saved text brand. The blackout label and time inputs were confirmed to use `settings.timezone`, with a browser test switching to Asia/Tokyo.

Local `npm run check` passed: 141 Worker tests, 309 paired UI messages, bundle/SEO/privacy gates, independent fork setup, browser booking/admin/manage flows, desktop/mobile screenshots, keyboard/axe checks, build and Worker dry run. Rendered gap, location and booking-list layouts were visually reviewed. Initial public booking/manage JavaScript stays below the existing 15 KB gzip limits. CI and live release verification follows below.

### Meeting details release verification

- Source `cda9b9dc356b556c02e103af0b1f96c67f527918` deployed as Worker `27dfb602-995b-4067-913b-b3aa5bd07e76`; [CI passed](https://github.com/aindaco1/scheduler/actions/runs/34436105552).
- Live Helium review confirmed the Brand name setting (current value DUST WAVE), editable 15-minute video gap in the left column, Active label, and separate address/arrival-instruction fields. Privacy and Admin show the same saved logo. Temporary review tabs were closed without changing live settings or bookings.
- All eight English/Spanish page responses returned 200 with the saved logo already in initial HTML and without the old visible text fallback. Public instruction data remains omitted, unsigned admin API returns 401, and all nine deployed JS/CSS assets match the checked build. No automatic Cloudflare script injection appeared.
- Provider/email behavior was verified with isolated fixtures; no live invitation or test email was sent. [Release evidence](research/meeting-details-release-2026-09-09.json) records the source, Worker, CI and read-only live checks.


## Booking activation, shared addresses and optional branding

Your booking page now has an accessible Active switch in the top-right heading, applied with Save changes. Location status is also labeled Active. Postal addresses use one full-width field for both languages while names and arrival instructions remain bilingual. Empty logo settings use the Scheduler icon shared with the favicon. An explicitly empty Brand name hides its header line, leaves Scheduler visible, and falls back to Scheduler in site-name metadata; the editable Settings field remains available.

Pausing keeps the public URL at HTTP 200 with a clear English/Spanish not-accepting-bookings message and blocks new appointments. Existing bookings and reminders are unchanged. Private, authorized cancellation and rescheduling remain available within the existing rules; the previously inconsistent pause gate on their availability picker is fixed.

Local verification: `npm run check` passed all 146 Workers tests, type/build/template checks, 311 paired UI messages, asset budgets, independent fork setup, browser/keyboard acceptance, axe scans and Wrangler dry run. Regression cases cover blank-brand persistence and initial HTML, canonical addresses without legacy data loss, unauthenticated pause enforcement and both private booking changes. Desktop and 320-pixel mobile screenshots were reviewed. These checks used fixtures, with no live settings, calendar or email mutations. Deployment and CI evidence follow below.


Deployment: source commit `6cd9187` is live in Cloudflare Worker version `717d686d-2270-4992-b6de-5a46e672eb21`. All nine build assets matched the verified local files byte for byte; all eight English/Spanish shells returned HTTP 200, referenced the current assets and included the saved logo in their initial HTML. Private settings remained HTTP 401 without authentication. Public configuration kept the live page active and ready, retained its brand/logo, shared the same address across languages, and omitted arrival instructions. A read-only Helium review confirmed the checked Active switch at the top right, updated brand help and All changes saved. No live settings, meetings or emails were changed.

[GitHub CI for `6cd9187`](https://github.com/aindaco1/scheduler/actions/runs/34438230750) passed. Structured release evidence is retained in [active-settings-release-2026-09-09.json](research/active-settings-release-2026-09-09.json).


## Card activation, cancelled-booking visibility and responsive admin review

Meeting types and locations now share the booking-page Active switch, placed at the top right of every card and kept outside its disclosure control. Settings now ends with Other, containing Hide cancelled meetings after (days), default 1. The list counts elapsed time since successful cancellation, ignores later email retry timestamps, supports 0–365 days, preserves older-dashboard settings and filters before the result limit. Records and private access remain intact. Returning to Bookings or saving the preference refreshes the list.

The review corrected doubled paragraph/row margins, reduced mobile hours-row height where controls fit, kept meeting durations together in narrow headers, and left 20 pixels between Verify connections and the next divider. Saved changes occupy a 42-pixel strip at phone/tablet widths; unsaved changes retain a 44-pixel Save button in a 62-pixel bar. Screen-reader save announcements remain available.

Local verification: `npm run check` passed all 149 Workers tests across 15 files, template/type/build checks, 312 paired messages, bundle budgets, independent fork setup, browser acceptance and Wrangler dry run. The new review covers all four admin tabs at 320, 390, 768, 1024 and 1280 pixels in English/Spanish (40 combinations), with light/dark variants, card switch/disclosure independence, save state sizes, control spacing and 10 additional axe scans. Phone/tablet/desktop screenshots were visually reviewed. Tests use isolated fixture settings and providers; no live meetings or messages were created or changed. Deployment and CI evidence follow below.


Deployment: runtime source `f78d26a` is live in Worker version `5fce6b99-2647-4bef-bf33-4bf06c92a863`. All nine build assets matched the locally verified files, and eight English/Spanish shells returned HTTP 200 with the current assets. The public page remains active and ready; private settings return HTTP 401 without authentication, and anonymous configuration omits the new private visibility preference and arrival instructions. A read-only Helium review confirmed the meeting-type/location switches, Other section and one-day default, with All changes saved. No live settings, meetings or messages were changed.

CI exposed two pre-existing test timing/isolation issues: an exact redirect URL check could miss the picker's added timezone, and old fixture alarms could make requests during the next test's global outage spy. Commits `6dec1fb` and `da0e396` correct the assertions and fixture teardown without changing the production runtime or weakening the settings-save guarantee. The corrected browser suite and all 149 backend tests passed locally. [Final GitHub CI for `da0e396`](https://github.com/aindaco1/scheduler/actions/runs/34439731977) passed the complete workflow. Structured evidence is retained in [responsive-admin-release-2026-09-09.json](research/responsive-admin-release-2026-09-09.json).


## Sign-in page copy cleanup

Removed “A space for your schedule” and its Spanish counterpart from the owner sign-in page, including the paragraph wrapper. The production build and existing quality checks passed (311 paired messages). This is a copy-only change; authentication behavior is unchanged. Deployment and CI verification follow below.

Deployment: source `ca7d48e` is live in Worker version `80f863d4-2ef4-4da6-bc79-2338ac85b62d`. Both admin locale routes reference the verified new bundle, which matches the local build byte for byte and contains neither tagline. [GitHub CI for this change](https://github.com/aindaco1/scheduler/actions/runs/34446880496) was still running at the time of live verification. No live settings, bookings or messages were changed.


## Location question copy

Changed the English location prompt to “Where should we meet?” and updated the existing browser test label. Spanish wording is unchanged. The production build and quality checks passed (eight localized pages, 311 paired messages and asset budgets). Deployment verification follows below.

Deployment: source `f49b5df` is live in Worker version `c62e1db2-18ed-4639-8c23-c4c088ed7bac`. Both public booking locale routes reference the new bundle, which matches the local build byte for byte and includes the updated English question. [GitHub CI](https://github.com/aindaco1/scheduler/actions/runs/34451893262) was still running at live verification. No live settings, bookings or messages were changed.
