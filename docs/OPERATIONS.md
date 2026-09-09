# Development and operations

## Architecture and local checks

Jekyll produces static shells, Inter/font assets and small browser entrypoints. A Cloudflare Worker serves them and the same-origin API. One SQLite Durable Object per owner contains settings, bookings, hashed sessions and a durable provider/email job queue. No separate SQL server, Redis, D1, KV, or application server is required.

Clone with `--recurse-submodules`, then run `npm ci`, `bundle install` and `npx playwright install chromium`. Use Node 22+ and Ruby 3.1+; CI uses Ruby 3.3. Copy `.dev.vars.example` to `.dev.vars`, generate separate random secrets at least 32 characters long, and supply provider credentials. `npm run dev` builds and serves at http://localhost:8787. It is not a fixture/demo authentication bypass.

`npm run check` checks pinned shared-template synchronization, Worker and browser TypeScript, real Workers-runtime tests with mocked providers, the production Jekyll build, Chromium booking/admin/accessibility flows, and a Wrangler dry deployment. Browser fixtures never send real invitations. Browser screenshots are local under `work/frontend`; CI retains them briefly as artifacts. `npm run types` regenerates bindings after Wrangler changes. `npm run format` formats consumer code without modifying pinned dependencies.

## Deployment

The production configuration binds `scheduler.dustwave.xyz` as a Worker custom domain. The primary page is `/alonso`, with Spanish at `/es/alonso`. Only this Worker/domain is modified. `workers.dev` and preview URLs are disabled to keep the configured same-origin and Turnstile rules consistent.

Run `npm run check`, then `npx wrangler deploy`. Provision secrets with `npx wrangler secret put NAME`, or `npx wrangler secret bulk` from a private, ignored JSON file. Never put secrets in Wrangler vars, GitHub source, public build output, screenshots, or test fixtures. Do not replace `ENCRYPTION_KEY` without decrypting and re-encrypting stored credentials and queued emails first. Ordinary code redeploys preserve the Durable Object and its alarm queue.

Required bootstrap secrets: `SESSION_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `TURNSTILE_SECRET_KEY`. Google additionally requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` before connection or booking is possible. The paused site and owner dashboard can be deployed before Google credentials are available. Zoom additionally uses `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET` when a Zoom type is enabled. `TURNSTILE_SITE_KEY` is public and belongs in Wrangler vars.

The Check workflow runs on pushes and pull requests with read-only repository permissions. Deployment currently runs from the authenticated local Wrangler CLI; it does not store a broad Cloudflare credential in GitHub. A future deployment workflow should use a dedicated scoped credential.

## Owner setup

1. Sign in at `/admin/` using the exact `ADMIN_EMAIL`. Turnstile protects login requests. The email link is single-use for 15 minutes; the secure owner session lasts 12 hours. Guest booking does not require email verification.
2. Connect Google through a Web application OAuth client with Google Calendar API enabled. Use redirect URI `https://scheduler.dustwave.xyz/api/admin/callback/google`. Local development needs a separately registered localhost callback. The application requests `openid`, `email`, `calendar.readonly`, and `calendar.events`. Refresh tokens are encrypted in the owner object. Select the Google calendars that should block time, including the subscribed Proton work calendar. All writes use `primary`.
3. Connect iCloud with the Apple Account email and an app-specific password. The adapter discovers actual calendars, then you select Family and any other blockers. The application only reads iCloud, although Apple's credential itself is not restricted to read-only access. Account login, two-factor approval, and app-password issuance must be done by the account owner.
4. For Zoom, create a user-managed General OAuth app with `user:read:user`, `meeting:read:meeting`, `meeting:read:list_meetings`, `meeting:write:meeting`, `meeting:update:meeting`, and `meeting:delete:meeting`. Register `https://scheduler.dustwave.xyz/api/admin/callback/zoom` as the redirect and allow-list URL, enable strict URL matching, save the client secrets, then connect from the dashboard. The owner's private deployment uses development credentials and local-test distribution, which allows the app creator's own Zoom account; it is not a public Marketplace listing. Fork owners create their own app. Shared-access permissions are not required. Keep Zoom types disabled until connection passes. Meet needs no separate Google Meet credential.
5. Set the actual owner timezone, weekly hours, temporary and recurring blackouts, locations and their hours, meeting types, gaps, and reminders. Choose blocking calendars explicitly. Repository seed settings are editable starting defaults; the confirmed live launch values are documented in [phase 1 decisions](decisions/phase-1.md).
6. Use Verify connections. The application reads current provider data before allowing bookings to be enabled. Read failures close availability. Enable bookings only after reviewing the actual hours and locations.

Google OAuth applications left in external Testing can receive short-lived refresh tokens. Review Google's current publishing/verification requirements for the intended personal deployment. Supply the scheduler home and privacy pages when configuring consent. A production deployment is not evidence that Google/iCloud/Zoom authorization or recipient delivery has been verified.

## Booking consistency and recovery

Slots use the same rules for listing, booking, and rescheduling. Weekly hours use the owner's IANA timezone; minimum notice and cancellation cutoff use elapsed hours. Overnight periods can be represented as two periods meeting at midnight. The end time `24:00` is supported. Adjacent scheduler bookings require the greater of their two gaps; an external event receives the candidate meeting's gap. Calendar reads include recurring/all-day events; incomplete or malformed provider responses fail closed.

The object rechecks external conflicts and claims each local interval synchronously before queuing provider writes. Google IDs derive from the booking UUID, so a lost insert response can be reconciled without creating another event. Google sends the calendar invitations; Resend sends separate branded confirmations, updates and reminders. These are intentionally different messages.

Rescheduling holds both the original and proposed time until provider updates succeed. A new conflict found before the Google write preserves the original booking. Uncertain Zoom creation is reconciled by the stored operation marker; the app does not blindly issue a second POST. An uncertain provider write can retain a pending reservation until it is reconciled. Reconnecting the same identity is supported; switching provider identities underneath active bookings is rejected.

Alarms retry pending jobs with bounded backoff. A failed job's error appears in the admin booking list. On `google_reconnect_required`, reconnect the same Google account. On Zoom uncertainty, inspect the scheduled meeting with the booking reference before any manual repair. Do not delete a reservation simply to free a slot while an external creation may have succeeded. The dashboard can cancel pending bookings and the cancellation job reconciles provider outcomes.

Email messages and sender are frozen on first dispatch, with a stable Resend idempotency key. Automatic sends stop after 23 hours from that first attempt if the outcome remains uncertain, because the provider's deduplication window is finite. A reminder's first attempt is its scheduled time, not its original enqueue time. Stale reminders after cancellation/rescheduling are discarded. An email API acceptance alone does not prove inbox delivery.

External calendars cannot participate in the local database transaction: a last-second edit made directly in Google/iCloud can race a scheduler write. Final provider conflict reads narrow that gap, but they cannot eliminate it. Proton's subscription-through-Google refresh delay is accepted for phase 1. Keep direct Proton integration in phase 2.

## Private data and maintenance

Provider credentials and management tokens are encrypted; login/session token lookups use hashes. Guest names, email addresses, topics and booking times remain in private storage for booking management. There is no automatic booking-history purge in phase 1. Guest management links carry secrets in the URL fragment; API requests use an Authorization header or JSON body. Public pages never expose busy-event titles or account credentials.

Pause bookings before operational repairs. Use Cloudflare's Durable Object storage recovery facilities if a data repair requires rollback, preserving the encryption key separately. Do not roll back only provider state or only local reservations without reconciling the other side. Cloudflare observability redacts request query strings, including OAuth callback values. Review redacted job error classifications instead of logging provider response bodies or full callback/management URLs.

## Live acceptance still required

Use an owner-designated recipient and an explicitly selected test time for a real booking. Verify one main-Google event, correct attendee invite and conference/location, Resend inbox receipt, selected Google and Family conflicts, reschedule update of the existing event, cancellation, and reminder timing. Repeat for Zoom and a real in-person location. No unattended test should invite another person without authorization. Record local, CI, deployed, provider, and recipient evidence separately in STATUS.md.

References: [Worker custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Google OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Google token expiration](https://developers.google.com/identity/protocols/oauth2#expiration), [Apple app-specific passwords](https://support.apple.com/en-us/102654), [Zoom OAuth](https://developers.zoom.us/docs/integrations/oauth/), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

The dashboard preserves unrelated edits if another tab connects a calendar or changes different settings while a save is pending. It re-reads current settings, merges only whole fields changed by one side, and retries once with the current revision. Competing edits to the same field (including an hours or calendar-selection list) remain a conflict; the server revision check is never bypassed.
