# Development and operations

For a new deployment, follow [the fork/setup guide](FORKING.md). Identity and public routes come from Wrangler vars, so use `npm run build` rather than bare Jekyll.

## Architecture and local checks

Jekyll produces static shells, Inter/font assets and small browser entrypoints. A Cloudflare Worker serves them and the same-origin API. One SQLite Durable Object per owner contains settings, bookings, hashed sessions and a durable provider/email job queue. No separate SQL server, Redis, D1, KV, or application server is required.

Clone with `--recurse-submodules`, then run `npm ci`, `bundle install` and `npx playwright install chromium`. Use Node 24+ and Ruby 3.1+; CI uses Ruby 3.3. Copy `.dev.vars.example` to `.dev.vars`, generate separate random secrets at least 32 characters long, and supply provider credentials. `npm run dev` builds and serves at http://localhost:8787. It is not a fixture/demo authentication bypass.

`npm run check` checks pinned shared-template synchronization, Worker and browser TypeScript, real Workers-runtime tests with mocked providers, the production Jekyll build, Chromium booking/admin/accessibility flows, and a Wrangler dry deployment. Browser fixtures never send real invitations. Browser screenshots are local under `work/frontend`; CI retains them briefly as artifacts. `npm run types` regenerates bindings after Wrangler changes. `npm run format` formats consumer code without modifying pinned dependencies.

## Deployment

The production configuration binds `scheduler.dustwave.xyz` as a Worker custom domain. The primary page is `/alonso`, with Spanish at `/es/alonso`. Only this Worker/domain is modified. `workers.dev` and preview URLs are disabled to keep the configured same-origin and Turnstile rules consistent.

Run `npm run check`, then `npx wrangler deploy`. Provision secrets with `npx wrangler secret put NAME`, or `npx wrangler secret bulk` from a private, ignored JSON file. Never put secrets in Wrangler vars, GitHub source, public build output, screenshots, or test fixtures. Do not replace `ENCRYPTION_KEY` without decrypting and re-encrypting stored credentials and queued emails first. Ordinary code redeploys preserve the Durable Object and its alarm queue.

Required bootstrap secrets: `SESSION_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TURNSTILE_SECRET_KEY`. Google additionally requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` before connection or booking is possible. The paused site and owner dashboard can be deployed before Google credentials are available. Zoom additionally uses `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET` when a Zoom type is enabled. `TURNSTILE_SITE_KEY` is public and belongs in Wrangler vars.

The Check workflow runs on pushes, pull requests and a weekly schedule with read-only repository permissions. Deployment currently runs from the authenticated local Wrangler CLI; it does not store a broad Cloudflare credential in GitHub. A future deployment workflow should use a dedicated scoped credential.

## Owner setup

1. Sign in at `/admin/` using the exact `ADMIN_EMAIL`. Turnstile protects login requests. The email link is single-use for 15 minutes; the secure owner session lasts 12 hours. Guest booking does not require email verification.
2. Connect Google through a Web application OAuth client with Google Calendar API enabled. Use redirect URI `https://scheduler.dustwave.xyz/api/admin/callback/google`. Local development needs a separately registered localhost callback. The application requests `openid`, `email`, `calendar.readonly`, and `calendar.events`. Refresh tokens are encrypted in the owner object. Select the Google calendars that should block time, including the subscribed Proton work calendar. All writes use `primary`.
3. Connect iCloud with the Apple Account email and an app-specific password. The adapter discovers actual calendars, then you select Family and any other blockers. The application only reads iCloud, although Apple's credential itself is not restricted to read-only access. Account login, two-factor approval, and app-password issuance must be done by the account owner.
4. For Zoom, create a user-managed General OAuth app with `user:read:user`, `meeting:read:meeting`, `meeting:read:list_meetings`, `meeting:write:meeting`, `meeting:update:meeting`, and `meeting:delete:meeting`. Register `https://scheduler.dustwave.xyz/api/admin/callback/zoom` as the redirect and allow-list URL, enable strict URL matching, save the client secrets, then connect from the dashboard. The owner's private deployment uses development credentials and local-test distribution, which allows the app creator's own Zoom account; it is not a public Marketplace listing. Fork owners create their own app. Shared-access permissions are not required. Keep Zoom types disabled until connection passes. Meet needs no separate Google Meet credential.
5. Set the actual owner timezone, weekly hours, temporary and recurring blackouts, locations and their hours, meeting types, gaps, and reminders. Choose blocking calendars explicitly. Repository seed settings are editable starting defaults; the confirmed live launch values are documented in [phase 1 decisions](decisions/phase-1.md).
6. Use Verify connections. The application reads current provider data before allowing bookings to be enabled. Read failures close availability. Enable bookings only after reviewing the actual hours and locations.

Google OAuth applications left in external Testing can receive short-lived refresh tokens. Review Google's current publishing/verification requirements for the intended personal deployment. Supply the scheduler home and privacy pages when configuring consent. A production deployment is not evidence that Google/iCloud/Zoom authorization or recipient delivery has been verified.

## Booking consistency and recovery

The public booking and guest rescheduling pickers open on the current Monday-to-Monday week in the visitor's selected time zone. Previous/Next week moves by calendar weeks rather than seven elapsed days; changing time zone reloads the corresponding Monday boundaries. The ending Monday belongs to the next page. The final page can be a partial week within the configured horizon, and past/too-soon slots remain unavailable. Calendar arithmetic handles daylight-saving changes, including 167- and 169-hour weeks.

Slots use the same rules for listing, booking, and rescheduling. Weekly hours use the owner's IANA timezone; minimum notice and cancellation cutoff use elapsed hours. Overnight periods can be represented as two periods meeting at midnight. Weekly From and Until controls use time pickers. Their display follows the browser locale; English uses a 12-hour clock where supported. A midnight Until value means the end of the selected day and is stored as `24:00`, preserving full-day and late-night ranges. Adjacent scheduler bookings require the greater of their two gaps; an external event receives the candidate meeting's gap. Calendar reads include recurring/all-day events. Busy events block time; Free/transparent events do not, including all-day Family events. An owner who needs extra time blocked can add a blackout. Incomplete or malformed provider responses fail closed.

The object rechecks external conflicts and claims each local interval synchronously before queuing provider writes. Google IDs derive from the booking UUID, so a lost insert response can be reconciled without creating another event. Google sends the calendar invitations; Resend sends separate branded confirmations, updates and reminders. These are intentionally different messages.

Rescheduling holds both the original and proposed time until provider updates succeed. A new conflict found before the Google write preserves the original booking. Uncertain Zoom creation is reconciled by the stored operation marker; the app does not blindly issue a second POST. An uncertain provider write can retain a pending reservation until it is reconciled. Reconnecting the same identity is supported; switching provider identities underneath active bookings is rejected.

Alarms retry pending jobs with bounded backoff. A failed job's error appears in the admin booking list. On `google_reconnect_required`, reconnect the same Google account. On Zoom uncertainty, inspect the scheduled meeting with the booking reference before any manual repair. Do not delete a reservation simply to free a slot while an external creation may have succeeded. The dashboard can cancel pending bookings and the cancellation job reconciles provider outcomes.

Email messages and sender are frozen on first dispatch, with a stable Resend idempotency key. Automatic sends stop after 23 hours from that first attempt if the outcome remains uncertain, because the provider's deduplication window is finite. A reminder's first attempt is its scheduled time, not its original enqueue time. Stale reminders after cancellation/rescheduling are discarded. An email API acceptance alone does not prove inbox delivery.

External calendars cannot participate in the local database transaction: a last-second edit made directly in Google/iCloud can race a scheduler write. Final provider conflict reads narrow that gap, but they cannot eliminate it. Proton's subscription-through-Google refresh delay is accepted for phase 1. Keep direct Proton integration in phase 2.

## Private data and maintenance

Provider credentials and management tokens are encrypted; login/session token lookups use hashes. Guest names, email addresses, topics and booking times remain in private storage for booking management. There is no automatic booking-history purge in phase 1. Guest management links carry secrets in the URL fragment; API requests use an Authorization header or JSON body. Public pages never expose busy-event titles or account credentials.

Pause bookings before operational repairs. Use Cloudflare's Durable Object storage recovery facilities if a data repair requires rollback, preserving the encryption key separately. Do not roll back only provider state or only local reservations without reconciling the other side. Cloudflare observability redacts request query strings, including OAuth callback values. Review redacted job error classifications instead of logging provider response bodies or full callback/management URLs.

## Live acceptance procedure

Use an owner-designated recipient and an explicitly selected test time for a real booking. Verify one main-Google event, correct attendee invite and conference/location, Resend inbox receipt, selected Google and Family conflicts, reschedule update of the existing event, cancellation, and reminder timing. Repeat for Zoom and a real in-person location. No unattended test should invite another person without authorization. Record local, CI, deployed, provider, and recipient evidence separately in STATUS.md.

For the deployed owner's account, September 9 acceptance is recorded in [STATUS.md](STATUS.md). Repeat this procedure for new credentials or forks. Self-addressed Google tests verify event/attendee writes, but do not prove a separate invitation email to an external attendee.

## Email receipt and spam

A Resend `delivered` event means the recipient mail server accepted the message; inspect the actual mailbox to verify placement. During launch, Gmail placed the test confirmations, updates and reminder in Spam even though its original-message view reported SPF, DKIM and DMARC all passing. The owner confirmed receipt. Gmail does not forward its spam to the owner's HEY address. Marking expected messages as not spam can help future classification, but it does not guarantee inbox placement for other guests. No broad mail filter or domain authentication policy was changed. Both open and click tracking are disabled in Resend.

Before changing DNS, inspect the received message's authentication results and Resend's domain state. Gmail attributed this case to similarity with past spam, not an authentication failure. See [Gmail sender guidelines](https://support.google.com/mail/answer/81126?hl=en) and [Resend deliverability guidance](https://resend.com/docs/knowledge-base/how-do-i-avoid-gmails-spam-folder).

References: [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration), [Apple app-specific passwords](https://support.apple.com/en-us/102654), [Zoom OAuth](https://developers.zoom.us/docs/integrations/oauth/), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

The dashboard preserves unrelated edits if another tab connects a calendar or changes different settings while a save is pending. It re-reads current settings, merges only whole fields changed by one side, and retries once with the current revision. Competing edits to the same field (including an hours or calendar-selection list) remain a conflict; the server revision check is never bypassed.

## Email delivery and held failures

Worker Core 0.13.0 supplies content-preserving delivery defaults. `EMAIL_REPLY_TO` is optional and falls back to the configured owner `ADMIN_EMAIL`. Both owner sign-in and booking emails include a monitored reply destination and `Auto-Submitted: auto-generated`. Replies do not automatically cancel or reschedule a booking; the existing management link owns those actions.

The outbox freezes the message, sender, reply address and headers before the first provider call. Retries keep the same idempotency key and exact body even after settings change. Provider `Retry-After` delays take precedence over normal backoff. Permanent Resend rejections stop automatic attempts and leave an encrypted held job; the booking shows `email_needs_attention`. Uncertain delivery also stops before Resend's 24-hour deduplication window expires. Inspect Resend history before any manual resend. A held message does not invalidate a confirmed calendar event.

The production `dustwave.xyz` domain has verified SPF and DKIM, a DMARC monitoring record, and disabled open/click tracking. Initial test messages passed Gmail SPF/DKIM/DMARC and TLS but landed in Spam. Authentication is necessary and does not guarantee Inbox placement. Keep this distinction in recipient acceptance evidence. See the [shared delivery guide](https://github.com/aindaco1/dust-wave-platform/blob/main/docs/email-deliverability.md) for the cross-project policy.

## Messages with owner booking changes

In **Bookings**, choose **Reschedule** or **Cancel**, then optionally enter a message (up to 2,000 characters). Confirming sends the note inside the guest’s reschedule/cancellation email once the calendar providers finish the change. Leave it blank to use the existing notification. The note is plain text, preserves line breaks, and uses the guest’s selected email language for its heading; the note itself is not translated. It is not added to the calendar description or future reminders.

Failed dashboard requests keep the draft available for retry. Accepted changes retain their note through provider recovery, and the email outbox freezes the message before its first delivery attempt. A reschedule rejected by a new conflict sends no reschedule notice. These notes can only be authored through authenticated owner actions.

## Travel and temporary blackouts

Under **Settings → Automatic blackouts**, enable **Block U.S. federal holidays** and save to block all meeting types on the 11 annual nationwide holidays. The option starts off, including for existing installations. It includes each holiday's actual date and the standard observed weekday: Friday for a Saturday holiday, Monday for a Sunday holiday. These rules follow the [OPM annual holiday calendar](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/) and apply in the configured schedule time zone. Turning the option off restores normal availability rules; existing bookings are never cancelled automatically.

Holiday dates are calculated locally each year, without another calendar connection, feed or scheduled job. They do not add rows to temporary blackouts. Regional Inauguration Day, state holidays and one-off closures are outside this annual rule and can use manual blackouts. Changes to the nationwide holiday rules require updating the implementation. Older settings default to off, and older clients that omit the new preference preserve its saved value.

In **Availability → Temporary blackouts → Whole days**, choose **From date** and **Through date**, then set **Block** to **All meetings** or **In-person only**. Click **Block dates** and **Save changes**. Both dates are included; use the same date for a single day. For example, September 16–25 blocks ten full days and ends at midnight on September 26. The entire range is one editable/removable blackout. In-person-only blocks leave Google Meet and Zoom available subject to the normal hours, notice, gaps and calendar conflicts. Existing bookings are not cancelled by adding a blackout.

Saving blackouts, hours, branding or other local settings does not contact calendar providers. A provider outage must not prevent the owner from saving those edits or pausing bookings. Opening bookings, changing selected calendars or the iCloud requirement, and changing whether Zoom is offered still verify connections before saving. Use **Settings → Verify connections** to check provider health independently. Slot listing, new bookings and rescheduling continue to fail closed when any required calendar cannot be checked.

The same Block selector is available on dated periods, including a multi-day trip. Existing blackouts without an explicit scope keep blocking all meetings. Recurring blackouts continue to block all meetings. Blackout dates/times use the schedule time zone displayed above the controls, even when the browser is in another time zone. The end of a whole-day range is midnight after the final date, accounting for daylight-saving changes. Existing saved instants do not move when changing the display/schedule time zone.

## Branding, gaps and reminders

Use **Meeting types → Copy link** to share a saved, active type. The control remains visible with the editor collapsed. Unsaved/new or inactive types must be saved and activated first; links for existing types use saved settings. The dashboard's language selects the shared locale, with English used when Spanish is disabled. If clipboard access is denied, a selected read-only URL is provided for manual copying.

The initial HTML includes meeting-specific titles/descriptions, Open Graph/X cards and Schema.org WebPage/Person/Service data. The preview image and 180-pixel Apple touch icon are generated from the existing Scheduler mark by `npm run build`; generated files stay out of git. Main-page identity and meeting metadata come from the existing SQLite presentation read, with no calendar calls. Canonical URLs strip browsing state. Social apps cache previews independently, so previously sent bubbles may keep their old appearance even after settings change. Verify newly shared links and their actual recipient-side appearance separately from source checks; do not send unsolicited test messages or invitations.

Settings is ordered Your booking page, Booking boundaries, Reminders, Automatic blackouts, Calendar connections, then Other. Set default video/in-person gaps under Booking boundaries; override a type's Gap (minutes) in Meeting types. The shared gap policy governs availability and reservations, while existing bookings retain their gap snapshots.

Upload a PNG or JPEG logo under Your booking page. The maximum is 1,000,000 bytes and 2048 pixels per side; 512 × 512 is recommended. A transparent PNG works well across themes. The preview appears after upload; Save changes publishes it. Remove logo returns to the Scheduler icon after saving. Existing HTTPS logos remain usable and visible without re-uploading.

The existing SQLite Durable Object stores image bytes separately from settings, using content hashes for URLs. Uploads require an authenticated same-origin request, bounded bytes and validated raster headers/dimensions. Only the saved image is served publicly, with a fixed image MIME, nosniff, and a one-day immutable cache policy. The active image and ten recent drafts are retained; an evicted draft must be re-uploaded before saving. This avoids another storage binding and stays below Cloudflare's [2 MB SQLite row limit](https://developers.cloudflare.com/durable-objects/platform/limits/).

Add up to three distinct reminder times, in whole hours from 1–168 before the meeting, or remove all to disable them. The schedule applies to new and rescheduled meetings. Existing queued reminders keep their timing and IDs. New reminder jobs include the offset in their idempotency key, reuse the existing outbox and freeze their message on first dispatch. Expired reminder times are skipped; booking revision/status checks suppress stale reminders after cancellation or rescheduling. Legacy scalar settings read as a one-element list (or an empty list for zero).

Calendar names, including warning emoji, come from the provider's display names. Similar names can belong to distinct calendar IDs; only checked calendars block bookings. Scheduler connection problems appear separately under Needs attention. Do not merge or remove calendars merely because their names resemble one another.

## Booking preferences and language rollout

`defaultGaps.video` and `defaultGaps.inPerson` store default minutes (0–240). A meeting type’s `gap: null` inherits its mode’s current default; a number, including zero, is an explicit override. The shared gap policy governs listing, creation and rescheduling; persisted bookings carry concrete gap snapshots. Reads migrate legacy 15-minute video / 30-minute in-person values to inheritance and preserve other values. Older dashboard submissions that omit the new default/language preferences preserve the current values.

`spanishEnabled` defaults true. Turning it off retains authored Spanish strings and the recorded email language of existing bookings. New bookings use English. Site shells and the sitemap read public presentation preferences (language and branding) from SQLite alongside static asset loading; they never query calendar providers. A streaming [Cloudflare HTMLRewriter](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/) hides the language link and removes Spanish alternates while disabled. Spanish routes redirect temporarily to English with query state intact and no replacement fragment, preserving private booking links. Shells/sitemap are not browser-cached so changes take effect without a deploy; content-hashed assets keep immutable caching, and availability caching is unchanged.

Turning Spanish back on restores the links and bilingual editors. Runtime preferences do not alter generated bilingual source artifacts or require a rebuild.

## Location details and consistent branding

A location keeps one full postal address and optional localized `instructions` separately. The editor shows a single full-width address field, shared across languages. For compatibility, stored `address` still uses the `{en, es}` shape: reads prefer nonempty English, then Spanish; editing the shared field updates both values. Reading legacy data does not overwrite it. Public configuration and new invitations use the same canonical address for either language. The calendar provider’s [Location field is plain text](https://developers.google.com/workspace/calendar/api/v3/reference/events), so the scheduler formats a single venue/address line there. The description has separate Guest note and Arrival instructions sections, with HTML escaping. This follows the distinction between [iCalendar LOCATION and DESCRIPTION](https://www.rfc-editor.org/rfc/rfc5545.html); Google owns the invitation’s iCalendar serialization. Existing guest `topic` data is preserved. Resend adds instructions as a separate section for confirmations, reschedules and reminders. Anonymous `/api/config` omits instructions; only the owner and token-authorized booking responses receive them. New bookings snapshot instructions; changing a location does not rewrite existing invitations.

`brand.name` is editable without rebuilding. New/legacy installations inherit `BRAND_NAME`; later changes belong to Settings. The existing presentation read and HTMLRewriter now render the saved name/logo into the initial header and site-name metadata on all shells, including Privacy. The shared browser/server logo renderer escapes content, enforces HTTPS and reserves image dimensions. The browser retains an already matching image instead of replacing it after configuration loads. Removing the logo restores the shared Scheduler icon template, using the same mark as the favicon. A saved empty `brand.name` hides the brand line and promotes Scheduler; site-name metadata also uses Scheduler. The field stays editable in Settings. Omitting the property from an older dashboard preserves the saved value, including empty strings.

Temporary blackout labels, date inputs and date-range conversion use `settings.timezone`; changing Schedule time zone updates the label and displayed values. Tests also exercise an owner browser in a different time zone. The booking-list header has its own bottom margin above the first row divider.


## Pausing new bookings

Use **Settings → Your booking page → Active**, then **Save changes**. The [native checkbox switch](https://www.w3.org/WAI/ARIA/apg/patterns/switch/examples/switch-checkbox/) supports Space, visible focus and forced-color modes. Its label remains Active in both states; its position and accessible checked state indicate the value.

A paused booking URL returns HTTP 200 and shows “Not accepting bookings right now” (with Spanish equivalent); it does not become a 404. Anonymous availability and new booking requests return `booking_paused` with HTTP 503, including submissions from a page left open before pausing. The page distinguishes an owner pause from temporary provider unavailability. Existing meetings and queued reminders remain unchanged. Token-authorized management links still allow cancellation and rescheduling under the existing deadline, meeting/location activation, blackout and provider-conflict rules. Reactivation runs the normal connection checks. Browser fixture tests cover pause/unpause; never toggle a live owner's settings just to test this behavior.


## Cancelled booking visibility and responsive administration

**Settings → Other → Hide cancelled meetings after (days)** controls the owner's list, with a default of 1 elapsed day after cancellation completes (0 hides immediately, maximum 365). The filter runs in SQLite before the 200-result limit so old cancellations cannot crowd out current meetings. Non-cancelled meetings retain the existing 30-day meeting-end lookback. This is a visibility preference, not a deletion or archival policy: records, private links and email jobs are retained, and increasing the period can reveal retained cancellations again.

`cancelledAt` is recorded after required calendar-provider cancellation succeeds, separately from `updated`; later email retries do not reset the timer. Legacy cancellations use `updated`, then `created` when needed. Reading older settings supplies the one-day default; a save from an older dashboard that omits the field preserves its current value. Saving this preference or returning to the Bookings tab refreshes the list; the existing Refresh action and page reload also apply the current clock.

Booking-page, meeting-type and location Active controls share the same native checkbox switch renderer. Card switches sit outside native disclosure summaries so toggling activation never also expands or collapses a card. Both remain keyboard-operable. The responsive review covers 320, 390, 768, 1024 and 1280 pixels across all four admin tabs in English/Spanish, including normal save states, unsaved 44-pixel actions, vertical gaps, connection-divider clearance, independent switches and automated accessibility scans. Generated screenshots and measurements remain in ignored `work/frontend/`; release findings are recorded in STATUS.


## Intermittent availability failures

The shared booking/rescheduling picker retries a temporary Google/iCloud unavailable response, generic service failure, network failure or HTTP 502/504 once after 500 ms. It preserves the selected week, location and time zone, clears old slots, and never treats a failed check as available time. Changing the week or time zone, choosing another venue, or leaving the picker cancels the old retry. Reconnection/configuration errors require attention rather than automatic retries. Persistent failures retain the manual Try again action.

Worker observability records known availability failures as `{ "event": "availability_failed", "code": "icloud_unavailable" }` (with the actual bounded application code). It does not log the request query, guest details, credentials, provider response bodies or calendar contents. Unknown exceptions retain the existing `request_failed` / `internal_error` classification. Use Settings → Verify connections to investigate persistent calendar errors.


## Local cleanup and releases

Run `npm run clean -- --dry-run` to inspect the fixed generated-output list, then `npm run clean` to remove it. This removes build output, generated manifests, Jekyll/Sass caches, Wrangler temporary packaging, coverage and browser reports. It retains `node_modules`, Ruby dependencies, `.dev.vars`, all source/fixtures, pinned submodules and `.wrangler/state`. Do not use a blanket `git clean -fdx`, which also removes secrets and development state. Scratch provisioning exports and old operational logs should be reviewed separately and moved to a private recoverable archive if they are no longer needed.

For a release: update the package/lockfile version and CHANGELOG, run `npm run check` and the dependency audit, commit and require a successful CI run for that source, then deploy. Verify the public routes/assets and read-only availability before tagging the tested commit and creating its GitHub release. Record source SHA, Worker version, CI and live checks in STATUS. GitHub source archives omit submodule contents; installation uses a recursive clone of the release tag. No extra database migration is needed for 1.0.0.
