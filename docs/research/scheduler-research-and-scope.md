# Open-source scheduler: research and agreed scope

Research date: September 9, 2026. This is the archived pre-build research brief. Scheduler is now implemented and deployed; use [current status](../STATUS.md), [product decisions](../decisions/phase-1.md) and [installation](../FORKING.md) for the shipped application. Project comparisons and open questions below retain their original research date.

Companion research: [design and shared-code reuse](design-reuse-notes.md), [Protoxide knowledge for phase 2](proton-integration-notes.md).

**Recommendation**

Build a small scheduler on the existing Dust Wave Jekyll and Cloudflare foundation, reusing the shared platform packages and selected open-source calendar components. CloudMeet is the closest existing project to the requested infrastructure, but source inspection found enough missing scheduling behavior that a wholesale fork would require substantial repair. No complete Jekyll-based scheduler meeting these requirements emerged from this search.

If adopting a complete application becomes more important than retaining the stack, evaluate Tymeslot first and Calnode second. Both would introduce a separate application runtime. Cal.diy has useful integration and scheduling references, but is a much larger application and currently carries an explicit upstream recommendation for personal, non-production use.

**Scope confirmed in this conversation**

| Area | Phase 1 decision |
|---|---|
| Hosts | One person initially |
| Public URL | `https://scheduler.dustwave.xyz/alonso` (chosen; DNS and deployment not configured in this research task) |
| Booking destination | Main Google calendar; create events automatically without per-booking host approval |
| Conflict calendars | Owner chooses which calendars block availability |
| Proton | Use the work calendar already subscribed to and visible in Google; its refresh delay is accepted |
| Apple family calendar | Connect directly to iCloud for conflict checking |
| Video meetings | Google Meet and Zoom; owner sets the service for each meeting type |
| In-person meetings | Booker chooses from owner-provided locations; each location has its own available days and hours |
| Notice | At least 24 elapsed hours before the meeting by default; configurable |
| Booking horizon | 30 days initially; editable |
| Gaps | Separate settings for video and in-person meetings, including conflicts with existing calendar events |
| Blackouts | Recurring exclusions and temporary exclusions, including partial days and date ranges |
| Cancellation / rescheduling | Booker can manage the booking until 24 hours before it starts |
| Landing page | Short introduction and a choice of meeting types |
| Languages | English and Spanish in phase 1 |
| Spam protection | Cloudflare Turnstile; no email-verification step for bookers |
| Administration | Small private web dashboard |
| Branding | Pool/Store warmth with system light/dark; easy control over name, logo, colors, copy, and domain |
| Technology | Jekyll/static public UI, Cloudflare backend, Resend, GitHub; Stripe in phase 2 |

Phase 2 explicitly includes pay-what-you-can pricing with a free option, booker-selectable profiles such as **Dust Wave** and **Volver**, and a direct Proton integration if feasible. Phase 1 remains Google-backed for event creation.

**Projects investigated**

The table distinguishes documented capabilities from fit judgments. GitHub activity was checked live; a recent push is a maintenance signal, not evidence that a release is reliable. Only CloudMeet received a focused local review of its booking and availability implementation. Other candidates were assessed through primary repository documentation, selected source files, and provider documentation.

| Project | License / architecture | Useful capabilities | Fit and disposition |
|---|---|---|---|
| [CloudMeet](https://github.com/dennisklappe/CloudMeet) | MIT; SvelteKit, Cloudflare Pages/Workers, D1, KV | Single-owner dashboard; selected Google calendars; Google Meet event creation; reminders; basic branding | Closest infrastructure match. Uses Emailit and SvelteKit. Important scheduling and booking reliability gaps described below. Reuse selected pieces. |
| [Tymeslot](https://github.com/Tymeslot/tymeslot) | AGPL-3.0; Elixir/Phoenix LiveView, PostgreSQL | Google/iCloud/CalDAV, Meet/Zoom, multiple schedules, breaks, date overrides, buffers, notice, themes, Stripe Connect | Strongest complete-app candidate for this scope. Requires another runtime and database; its Connect payment model is more elaborate than this single-owner project needs. PWYC including free was not verified. |
| [Calnode](https://github.com/Calnode/calnode) | Apache-2.0; Go, SQLite, Svelte admin, server-rendered public pages | Google/iCloud/CalDAV, Meet/Zoom, branded mail, rescheduling, Stripe Checkout, expiring holds, idempotent booking API | Promising compact alternative and architecture reference. Newer project, created June 2026. Go service is outside the preferred stack; no verified sliding-scale feature. |
| [Cal.diy](https://github.com/calcom/cal.diy) | MIT; Next.js/React, tRPC, Prisma, PostgreSQL | Large scheduling codebase, Google/Zoom setup, notice and before/after buffers in schema | Broad reference, poor simplicity fit. README says enterprise features including Teams and Workflows were removed; do not infer hosted Cal.com feature parity. Upstream discourages production use. |
| [Easy!Appointments](https://github.com/alextselegidis/easyappointments) | GPL-3.0; PHP and MySQL | Providers/services, working plans, booking administration, Google synchronization | Established option for service appointments. Significant infrastructure and integration mismatch; not a good basis for a small Jekyll/Worker scheduler. |
| [Thunderbird Appointment](https://github.com/thunderbird/appointment) | MPL-2.0; Python backend, Vue frontend; container development stack | Dedicated appointment project with CalDAV-oriented integration work | Worth studying for calendar behavior. Development setup includes backend, frontend, PostgreSQL, Redis, and Mailpit; adds considerable operational surface. Exact payment/branding fit unverified. |
| [Nextcloud Calendar appointments](https://docs.nextcloud.com/server/latest/user_manual/en/groupware/calendar.html#appointments) | AGPL-3.0; Nextcloud application | Public appointment slots within a calendar platform | Reasonable when already operating Nextcloud. Introducing Nextcloud for this scheduler adds a separate platform. |
| [Rallly](https://github.com/lukevella/rallly) | AGPL-3.0; JavaScript/TypeScript application | Group polls to find a suitable meeting time | Different workflow from immediate, automatic booking of the owner's availability. Exclude as foundation. |
| [LibreBooking](https://github.com/LibreBooking/librebooking) | GPL-3.0; PHP resource-reservation application | Resource and facility reservations | Better suited to reservable rooms/equipment and organizational resource rules. Exclude for this personal meeting scheduler. |
| [builtbyai/appointment-scheduler](https://github.com/builtbyai/appointment-scheduler) | MIT; React, Worker/D1, alternate Express development backend | Booking wizard, ICS, Resend adapter, video-room hooks | Explicit prototype: availability is synthetic by default and real Google free/busy is a future replacement point. Not a functioning calendar-conflict engine to adopt. |
| [Orange Inbox](https://github.com/InventiveHQ/orange-inbox) | MIT; Next.js on Workers, D1/R2, email worker | README describes booking pages and Google Calendar/Meet inside a mail application | Too much unrelated email infrastructure. A reference only; booking behavior not independently verified. |

Live GitHub metadata showed these repositories unarchived. Selected most-recent push dates: CloudMeet July 2; Cal.diy September 9; Tymeslot September 8; Calnode September 4; Easy!Appointments September 9; Thunderbird Appointment September 8. Repository rename redirects matter: `calcom/cal.com` now resolves to `calcom/cal.diy`, and `LibreBooking/app` resolves to `LibreBooking/librebooking`.

**What the CloudMeet code actually does**

Reviewed commit: `5a9f0e3c8ec29485e8221893c8712be10ec0e122`, dated July 2, 2026. These are source findings, not results from a deployed-instance test.

- It has useful direct REST wrappers for Google calendar listing, selected-calendar free/busy, token refresh, and event changes. These avoid requiring a large Google SDK in a Worker. [Google adapter source](https://github.com/dennisklappe/CloudMeet/blob/5a9f0e3c8ec29485e8221893c8712be10ec0e122/src/lib/server/google-calendar.ts)
- The schema defines `buffer_minutes`, `availability_overrides`, and location fields, but no references to those names were found in the checked-out `src/` and `functions/` trees. The availability route only rejects past slots; it does not enforce the requested 24-hour notice. [Schema](https://github.com/dennisklappe/CloudMeet/blob/5a9f0e3c8ec29485e8221893c8712be10ec0e122/schema.sql), [availability route](https://github.com/dennisklappe/CloudMeet/blob/5a9f0e3c8ec29485e8221893c8712be10ec0e122/src/routes/api/availability/%2Bserver.ts)
- Calendar-read errors are caught and the availability route continues without that calendar's conflicts. The Google helper also treats a missing busy array as empty without handling per-calendar errors. This can make unavailable time appear bookable. [Availability route](https://github.com/dennisklappe/CloudMeet/blob/5a9f0e3c8ec29485e8221893c8712be10ec0e122/src/routes/api/availability/%2Bserver.ts), [Google adapter](https://github.com/dennisklappe/CloudMeet/blob/5a9f0e3c8ec29485e8221893c8712be10ec0e122/src/lib/server/google-calendar.ts)
- The booking POST checks existing local bookings, then calls the calendar provider, then inserts a confirmed booking. It does not recheck external conflicts or apply a single authoritative availability calculation at submission. The separate read and insert do not provide an atomic overlap reservation. It accepts the submitted start and end times rather than deriving the end from the configured duration. [Booking route](https://github.com/dennisklappe/CloudMeet/blob/5a9f0e3c8ec29485e8221893c8712be10ec0e122/src/routes/api/bookings/%2Bserver.ts)
- A Google creation failure is caught and the route still stores a confirmed booking. For Google it always requests a Meet conference; it does not implement the schema's Zoom/in-person options. [Booking route](https://github.com/dennisklappe/CloudMeet/blob/5a9f0e3c8ec29485e8221893c8712be10ec0e122/src/routes/api/bookings/%2Bserver.ts)
- The Google event requests omit `sendUpdates=all`; simply including an attendee does not explicitly request the required invitation notifications. [Adapter source](https://github.com/dennisklappe/CloudMeet/blob/5a9f0e3c8ec29485e8221893c8712be10ec0e122/src/lib/server/google-calendar.ts), [Google event API](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)

Repairing the booking rules, provider failure handling, concurrency, Zoom, Apple, and notifications while replacing the UI with Jekyll would amount to substantial new implementation. Selective reuse is the more honest scope.

**Feature ideas from Zoom Scheduler, Calendly, and other products**

[Zoom's scheduling documentation](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0057781) provides a useful menu: date exclusions, before/after buffers, minimum notice, booking horizon, daily limits, custom questions, email verification, and customizable confirmation behavior. [Calendly's availability guidance](https://calendly.com/help/scheduling-faq) and [buffer documentation](https://calendly.com/help/how-to-use-buffers) reinforce explicit timezone handling and checking the whole protected interval.

Confirmed phase 1 choices include self-service cancellation/rescheduling until 24 hours before the event, a 30-day booking horizon, and Turnstile without booker email verification. Further useful proposals are timezone selection, an optional topic/question field, reminders, and an optional daily booking cap. Keep the cap disabled until configured; reminder timing and the initial cap remain unchosen.

Google's own [appointment schedules](https://support.google.com/calendar/answer/10729749) and Proton's [appointment scheduling](https://proton.me/support/calendar-appointment-scheduling) are also relevant feature references. Their hosted product interfaces do not establish an API we can use for a branded open-source fork.

**Calendar integration plan**

Google is both a conflict source and the phase 1 event organizer. After one-time owner authorization, the backend creates the event on `primary`, attaches the booker, and requests guest notifications. Meet bookings create a unique conference; Zoom bookings create a Zoom meeting and place its join URL into the Google event; in-person events carry the chosen location. An invitee's calendar settings still control whether an invitation is automatically displayed or requires their response. [Google event creation](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Zoom API authorization](https://developers.zoom.us/docs/api/using-zoom-apis/)

The Proton subscription remains a selected calendar in Google. Proton documents delays of up to eight hours and possible subscription-refresh problems; this limitation is accepted for phase 1. During implementation, verify that the particular subscribed calendar contributes busy intervals through Google's API. If free/busy is unsupported for that calendar, investigate reading its visible events through the same Google connection; do not silently treat an error as free time. [Proton sharing](https://proton.me/support/share-calendar-via-link), [Google free/busy response and per-calendar errors](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)

For Apple, use an iCloud CalDAV adapter with owner authorization/app-specific credentials and discover the actual family calendar. Use [tsdav](https://github.com/natelindev/tsdav), an MIT-licensed library whose documentation explicitly supports Cloudflare Workers. Apple's documentation describes [third-party access](https://support.apple.com/en-us/121539) and [app-specific passwords](https://support.apple.com/en-la/102654). The scheduler should use the family calendar for conflict reads only; the credential itself may have broader provider permissions. Shared-family-calendar discovery and recurring/all-day-event handling require testing against the actual account.

Use an existing iCalendar implementation such as [ical.js](https://github.com/kewisch/ical.js) for recurrence and timezone data where needed. Its distribution does not automatically register all timezone definitions, so supply the calendar's VTIMEZONE data or an appropriate timezone dataset. Do not write a new recurrence parser.

**Small implementation with explicit ownership**

- Jekyll renders the public booking shell and static admin shell, using small browser JavaScript modules. The private API controls all dashboard data and mutations. Availability is dynamic, so a purely static site cannot perform the complete booking workflow.
- One Cloudflare Worker owns the API, calendar adapters, and notification/payment orchestration. For one person, one SQLite-backed Durable Object can own settings, bookings, temporary reservations, and retry records. This is a proposed design that avoids a separate application server and separate D1/KV stores initially. [Cloudflare SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- Keep appearance defaults/assets in the repository. Dashboard-edited scheduling settings have one runtime source of truth and take effect without rebuilding Jekyll. Runtime branding fields can override static defaults through a deliberately public configuration response.
- Store the person separately from the booking profile. Phase 1 has one profile. Phase 2 can add Dust Wave and Volver without redesigning ownership or allowing simultaneous bookings across identities.
- Use `https://scheduler.dustwave.xyz/alonso` as Alonso's canonical public landing URL. Keep the person path stable when phase 2 profiles arrive. Derive direct booking links, email links, and payment return URLs from one validated canonical URL configuration; do not duplicate hostname/path strings across templates.
- Keep one availability function used by displayed slots, final booking submission, rescheduling, and paid-booking completion. It applies working hours, location-specific hours, recurring exclusions, temporary blackouts, selected calendar conflicts, existing bookings/holds, the 30-day horizon, notice, and gaps. Location hours restrict the owner's schedule; they cannot override a blackout or conflict.
- Represent instants in UTC and schedules in an IANA timezone. Default the owner timezone to America/Denver provisionally; show the timezone clearly and let bookers change their display zone. Use actual elapsed hours for the 24-hour notice.
- Model gaps as the minimum interval between meetings, avoiding accidental addition of two ordinary gap settings. For two scheduler bookings use the larger applicable gap; allow explicit before/after travel protection where useful. Proposed initial values are 15 minutes for video and 30 minutes for in-person, pending the owner's choice.

The booking flow should atomically claim the meeting interval using the same gap rules before awaiting calendar/conference APIs, recheck current calendar conflicts, derive duration and location server-side, then create the conference/calendar event. Do not pad both bookings with a full ordinary gap and accidentally double it. Use stable operation IDs and recover interrupted provider calls without duplicate events. A calendar-write failure must remain pending or failed, with a clear user-visible state and automatic recovery; it must not be labeled confirmed. No manual host-approval queue is required. Local serialization prevents two scheduler requests from taking the same interval, but cannot make an external calendar edit atomic with the local booking; rechecks and reconciliation remain necessary.

Validate Turnstile through the Worker before starting a new booking operation, checking the expected hostname/action and applying bounded request limits. A client-side success alone is insufficient. Tokens are single-use and expire after five minutes; handle retries with idempotent booking operations and a fresh challenge when needed. Keep entered details intact on verification failure. Turnstile reduces abuse; it does not prove ownership of the submitted email address, so show that address clearly in the final review. No OTP or email-link verification is added to the booking flow. [Cloudflare server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

Use opaque, booking-scoped management links for guest changes. Enforce the 24-hour cancellation/rescheduling cutoff on the server; rescheduling also checks the target slot's notice and conflicts. Preserve the old booking until the new slot is successfully secured. Localize public pages, management screens, confirmations, reminders, and validation messages in English and Spanish, retaining the booking's chosen language for later messages. Owner-entered meeting descriptions and introduction need editable translations.

Google owns the actual invitation and its update/cancellation lifecycle. Resend owns branded confirmations and reminders with manage-booking links. Avoid generating a second independent calendar event via an unrelated ICS attachment. Retry email failures separately from successful event creation.

**Code reuse verified in existing checkouts**

Read-only inspection of Store's shared modules confirmed these reusable components. These are current local source observations, not claims about which version is deployed publicly.

| Existing component | Reuse |
|---|---|
| `dust-wave-jekyll-template` | Shared accessible includes, date rendering, and other appropriate static integration files; consumer owns booking layouts and content |
| `@dustwave/worker-core` | Stripe transport/signature verification, Resend webhook/failure helpers, durable-outbox mechanics, provider HTTP, validation, sessions, timezone choices |
| `@dustwave/admin-shell` | Existing session/API client, tabs, unsaved-change controls, and Turnstile UI primitives |
| `@dustwave/design-core` / `site-shell` | Appropriate shared styles and browser helpers while allowing independent branding |
| Existing GitHub workflows and release helpers | Adapt build, preview, verification, and deployment patterns after checking the new repository's needs |

Pin the shared packages/template using their existing consumer model. Keep appointment rules and storage in the scheduler. Inventory count reservations are not identical to overlapping time intervals, so do not force the Store inventory model into the booking engine merely to claim reuse.

Source inspected under Store's `shared/dust-wave-platform` and `shared/dust-wave-jekyll-template`, plus Store's operating guide. Public source references: [Dust Wave Platform](https://github.com/aindaco1/dust-wave-platform), [Jekyll Template](https://github.com/aindaco1/dust-wave-jekyll-template).

**Phase 2: profiles, paid time, and Proton**

1. **Booker-selectable profiles.** A landing page offers Dust Wave or Volver, with direct profile links as well. Each profile has its own name/logo/copy, event types, locations, hours, email identity, pricing defaults, and destination-calendar configuration. Confirmed bookings and holds block the same person's time across both profiles. A booking made under Dust Wave must prevent an overlapping Volver booking even if their destination calendars differ. Calendar organizer identity must follow the actual connected provider account; profile branding alone cannot change it.
2. **Pay what you can, including free.** Present a suggested amount, editable amount, and an explicit free option. Validate the chosen amount on the Worker. Zero uses the existing booking path without payment details. Positive amounts use the owner's Stripe account and the existing shared Stripe primitives; no marketplace/Connect layer is needed for multiple profiles owned by the same payee. Support provider minimum-charge rules and an owner-configured maximum. Stripe documents both [pay-what-you-want payments](https://docs.stripe.com/payments/checkout/pay-what-you-want) and [no-cost orders](https://docs.stripe.com/payments/checkout/no-cost-orders); using our own amount selector keeps the free branch and booking rules coherent.
3. **Reserve during payment.** Hold the slot under the same gap rules, align the payment session's lifetime with the reservation, and confirm from verified payment state/webhooks rather than the browser's return URL. Release abandoned/expired holds; make duplicate webhooks harmless. Recheck conflicts before fulfillment. If payment succeeds but calendar creation cannot finish, preserve the payment record and recover or refund under an explicit policy. Paid-booking refund rules and any changes to the 24-hour management cutoff need choosing before phase 2 launches. [Stripe Checkout API](https://docs.stripe.com/api/checkout/sessions/create)
4. **Direct Proton integration feasibility.** Target conflict reads and automatic creation/update/cancellation on a selected Proton work calendar, including invitations. I did not find documented official third-party Calendar write endpoints in the searched Proton materials. Read-only sharing is established; native Proton appointment scheduling is not proof of a public integration API. Recheck official capabilities when phase 2 starts.

There is an experimental open-source route: [Protoxide](https://github.com/mathewcsims/protoxide), an MIT-licensed Go bridge descended from Ferroxide/Hydroxide. We inspected commit `f332c8b` and captured the protocol lessons, source map, gaps, and acceptance criteria in [the Proton integration notes](proton-integration-notes.md). Useful lessons include calendar-specific signing identity, stable UID/provider-ID mapping, integer sequence numbers, encrypted event partitions, and incremental sync. Incomplete attendee handling, cursor advancement after skipped updates, cache completeness, verification exceptions, and long-lived session reliability need work. Its current Go/disk-cache design requires another runtime; a Worker port would be a separate implementation effort. Ordinary event creation alone would not satisfy the invitation requirement.

Keep `calendar provider` behind a small interface from phase 1. This makes Proton an additional implementation if it becomes viable while leaving Google/iCloud and profile behavior intact.

**Implementation sequence and proof of completion**

1. Establish a minimal Google+iCloud integration spike: list selectable calendars, prove a known Proton-via-Google conflict and an iCloud family conflict, create a test Google event with a real invitation, create both Meet and Zoom links, then exercise update/cancel. Use only owner-designated test recipients.
2. Build the shared availability calculation and atomic reservation path. Prove recurring and date-range blackouts, partial-day exclusions, location-specific hours, 24-hour notice, the 30-day horizon, mixed video/in-person gaps, all-day events, recurring exceptions, DST changes, and adjacent-day conflicts.
3. Add the bilingual booking UI, location selector, private dashboard, 24-hour-cutoff manage-booking links, Turnstile, and Resend reminders. Follow the [design reuse notes](design-reuse-notes.md). Check both themes, mobile layout, keyboard operation, timezone labels, token expiry/retry, and privacy of calendar details.
4. Exercise simultaneous bookings, repeated submissions, rescheduling into conflicts, revoked calendar access, provider timeouts after a write, and failed/retried email. A successful HTTP response is not proof that the invite arrived or that a meeting link works.
5. Confirm Google OAuth remains connected beyond development testing. External OAuth projects left in Testing can receive seven-day refresh tokens for calendar scopes; setup must account for this. [Google OAuth token expiration](https://developers.google.com/identity/protocols/oauth2)
6. Add phase 2 profiles and pricing through the same booking path. Test cross-profile collisions, free bookings, paid bookings, abandonment, duplicate/late webhooks, payment-success/calendar-failure recovery, and refunds in Stripe test mode before live use. Complete the Proton feasibility milestone separately.

Remaining setup choices can stay editable: exact video/in-person gap lengths, durations, allowed locations and their hours, reminder timing, booking caps, displayed introduction/name, and phase 2 refund rules. Public versus unlisted meeting types and extra guests remain optional scope choices. The confirmed 30-day horizon is editable. At the time of this research, the public URL was chosen but DNS and deployment were not yet configured. Those setup steps are now complete for the owner deployment. Research, source review, local behavior tests, deployed provider tests, and recipient delivery are separate completion claims.
