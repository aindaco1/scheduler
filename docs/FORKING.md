# Run your own Scheduler

Scheduler is an MIT-licensed, single-owner application. Fork it for your own calendar, domain and branding. It needs one Cloudflare Worker with a SQLite Durable Object and static assets; no separate database server, Redis, hosting service, or paid scheduler account. Cloudflare/provider charges and quotas depend on your accounts.

## 1. Clone and install

Fork this repository on GitHub, then clone **your fork** with its public dependencies:

```sh
git clone --recurse-submodules https://github.com/YOUR-USERNAME/scheduler.git
cd scheduler
npm ci
bundle install
npx playwright install chromium
```

Use Node 24+ and Ruby 3.1+ with Bundler (CI uses Ruby 3.3). Configure the development-only [Jev credential](QUALITY.md#required-jev-development-check) for the full `npm run check`; `npm run check:offline` is an explicit deterministic-only alternative, not full acceptance. If you cloned without dependencies, run `git submodule update --init --recursive`. Both pinned Dust Wave submodules are public and MIT-licensed; no Dust Wave account is needed. Keep their license notices.

## 2. Configure your identity and domain

Add a domain to your Cloudflare account and create a Turnstile widget scoped to your scheduler hostname. Run this locally, substituting your own **public** values:

```sh
npm run setup -- \
  --origin https://schedule.example.com \
  --slug your-name \
  --name "Your Name" \
  --brand "Your Brand" \
  --timezone America/Denver \
  --worker my-scheduler \
  --account YOUR_CLOUDFLARE_ACCOUNT_ID \
  --turnstile YOUR_PUBLIC_SITE_KEY
npm run types
npm run check
```

The script updates `wrangler.jsonc`. The build derives public routes, links, titles, canonical URLs, language alternates, and sitemap from those values. Your URLs become `/your-name` and `/es/your-name`. Spanish starts enabled; turn off **Offer Spanish** in Settings for an English-only site without deleting translations or rebuilding. Spanish routes then redirect to English, and live search alternates/sitemap omit Spanish. Reserved route names are rejected. No provider credentials belong in these flags or Wrangler vars. `npm run setup -- --check` validates configuration without changing it.

`OWNER_NAME` and `OWNER_TIMEZONE` seed an empty installation. Existing dashboard settings are preserved on deploy. Set default video/in-person gaps in Settings; individual meeting types start with the default populated in their editable Gap field. Enter a different value to override it, or the current default to restore inheritance.

`BRAND_NAME` seeds the Brand name field in Settings. Change Brand name, upload a logo and choose your accent there. The saved brand name/logo renders in the initial HTML on every page, including Privacy, without a rebuild or a fallback-header flash. Brand name also updates the live site-name metadata. Search metadata uses the deployment name, so update that value and rebuild if you change your public identity later.

**Do this before your first deploy.** Changing an existing deployment's Worker name or `OWNER_SLUG` can select a different Durable Object and make its existing bookings/settings appear missing. It is not a data migration. Keep the Worker name, owner slug, namespace migration and `ENCRYPTION_KEY` stable for upgrades.

## 3. Provision your accounts and secrets

Sign in with `npx wrangler login`. For a new Worker, save the secrets below in an ignored `.env.production` file (dotenv or JSON), then pass it to the first deploy in step 4. For an existing Worker, use `npx wrangler secret put NAME` to enter one value interactively. Keep secret values out of shell history:

| Secret | Purpose |
| --- | --- |
| `SESSION_SECRET` | A unique, random value of at least 32 characters for sessions/rate-limit hashes |
| `ENCRYPTION_KEY` | A different random value of at least 32 characters for stored credentials and queued email |
| `ADMIN_EMAIL` | Your sole dashboard sign-in address and recipient for new confirmed booking notifications |
| `RESEND_API_KEY` | Sending-only key scoped to your verified sending domain |
| `EMAIL_FROM` | Sender such as `Scheduler <bookings@example.com>` |
| `EMAIL_REPLY_TO` | Optional monitored reply address; defaults to `ADMIN_EMAIL` |
| `TURNSTILE_SECRET_KEY` | Your widget's secret, not its public site key |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Your Google Web OAuth client |
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | Optional Zoom OAuth client, only for Zoom meeting types |

Generate secrets in a password manager and keep a secure backup. Do not copy another installation's secrets. Do not rotate `ENCRYPTION_KEY` without first planning re-encryption of existing state. GitHub repository secrets and Worker runtime secrets are separate stores.

For Google, enable Calendar API and register `https://YOUR-HOST/api/admin/callback/google`. Review OAuth consent/publishing requirements for your audience; the upstream deployment's OAuth approval and credentials do not transfer to a fork. Meet uses the Google connection. For Zoom, follow [the owner-specific setup below](#zoom-for-your-own-scheduler). For iCloud, create your own Apple app-specific password and enter it only in the private dashboard.

Verify your Resend domain's SPF/DKIM and set an aligned DMARC policy. Use a monitored reply address, leave open/click tracking off for transactional mail, and verify recipient placement separately from provider acceptance. See [the delivery audit](research/email-deliverability-audit.md).

### Zoom for your own Scheduler

Each Scheduler installation has one owner and its own Zoom OAuth credentials.
The connection creates meetings as the Zoom user who authorizes it. Other owners
can connect their accounts by creating an app for their own deployment; they do
not need a Volver or Dust Wave account. Guests use the invitation link and do not
install the Scheduler Zoom app.

1. Sign into [Zoom Marketplace](https://marketplace.zoom.us/) with the intended
   host account. App creation requires an owner, admin or Zoom developer role;
   an organization may need to grant that role. Choose **Developer → Build app →
   General app**, then **User-managed**. Use the **Development** view for this
   private setup. See [Zoom's app creation guide](https://developers.zoom.us/docs/integrations/create/).
2. Register `https://YOUR-HOST/api/admin/callback/zoom` in both the OAuth redirect
   and allow list, using the origin configured in step 2. Enable strict matching.
   Keep public-client OAuth disabled: Scheduler exchanges credentials in its
   Worker. Do not copy the upstream hostname into a fork's callback.
3. Add these user-level scopes, without the account-wide `:admin` variants:

   | Scope | Scheduler use |
   | --- | --- |
   | `user:read:user` | Identify the authorizing host and prevent unsafe account changes |
   | `meeting:read:meeting` | Read a saved meeting during recovery |
   | `meeting:read:list_meetings` | Find a meeting after an uncertain creation response |
   | `meeting:write:meeting` | Create booked meetings |
   | `meeting:update:meeting` | Reschedule the existing meeting |
   | `meeting:delete:meeting` | Cancel the existing meeting |

   Explain in the scope description that Scheduler manages the owner's booked
   meetings, stores OAuth tokens encrypted in private Durable Object storage,
   and includes guest joining links in the corresponding invitations and
   confirmations. No Meeting SDK, webhooks or shared-access permission is used.
4. Match the app name and icon to your installation. The upstream app is named
   **Scheduler** and uses the clock mark from `assets/icon.svg` and
   `_includes/scheduler-mark.svg`. Zoom branding is saved separately from
   Scheduler Settings; changing one does not synchronize the other. For the
   default mark, build the project, then create a PNG with the existing Sharp
   dependency:

   ```sh
   npm run build
   node --input-type=module <<'NODE'
   import { mkdir } from 'node:fs/promises';
   import sharp from 'sharp';
   await mkdir('work/zoom-branding', { recursive: true });
   await sharp('_site/assets/icon.svg').resize(512, 512).png()
     .toFile('work/zoom-branding/scheduler-logo-512.png');
   NODE
   ```

   Upload that image in the app builder and apply it to light and dark mode.
   If your installation has custom branding, use its name/logo instead. Preview
   the app listing to confirm the saved result. Generated assets stay in ignored
   `work/`; the SVG sources remain the source of truth.
5. Complete the builder's **Local Test** requirements. Save the matching
   Development client ID and secret as `ZOOM_CLIENT_ID` and `ZOOM_CLIENT_SECRET`
   in your own Worker using the private secret procedure above. Development and
   Production credentials are different pairs; do not mix them or copy the
   upstream credentials. Keep a private record of the app's creator account and
   app ID so you can find it for maintenance.
6. After deployment, start **Connect Zoom** from Scheduler's `/admin/`, authorize
   as the intended host, then run **Verify connections**. Starting in Scheduler
   supplies its session-bound OAuth state. Review settings and explicitly enable
   bookings after verification; connecting/reconnecting pauses the page. Follow
   step 4 below for real booking and recipient acceptance.

[Local Test](https://developers.zoom.us/docs/build-flow/local-test/) is limited
to the app's own Zoom account and internal testers. This per-owner setup does
not make the upstream app a shared OAuth service for unrelated Zoom accounts.
Public external distribution requires a separate
[Zoom publication and review process](https://developers.zoom.us/docs/build-flow/publish/).
Workplace app policies, meeting security locks and the owner's Zoom plan still
apply; one owner's successful connection does not verify another owner's account.

For a broken connection or replacement app, use the
[reconnection procedure](OPERATIONS.md#zoom-reconnection-and-app-replacement)
before changing credentials on an installation with existing bookings.

## 4. Deploy, configure, and verify

For the first deployment, load the private secrets file prepared above:

```sh
npx wrangler deploy --secrets-file .env.production
```

Keep that file private and backed up in your password manager. Later code-only deployments use `npx wrangler deploy`; saved Worker secrets are retained. Do not use `.dev.vars.example` as production credentials: its challenge test keys are for localhost only. See [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

Open `/admin/`, sign in through the emailed link, connect calendars, and select the calendars that block bookings. Review all meeting types, locations, timezone, weekly hours, blackout dates, notice/gap limits, reminders, and the privacy page. A new installation starts **paused**. Google Calendar is required; disable the default “Require iCloud” setting if you only use Google.

Verify connections and then enable bookings. Use a consenting test recipient to check one booking, its calendar event/invitation, notification, reschedule and cancellation. Automated fixture tests do not verify your credentials or real inbox delivery. Cancel any test bookings when finished.

## Local development and upgrades

Copy `.dev.vars.example` to ignored `.dev.vars`, set separate local credentials and random secrets, then run `npm run dev` at `http://localhost:8787`. It is a real local Worker with isolated local storage, not a fake login bypass. Local OAuth needs registered localhost callbacks. The example Turnstile test keys work only on localhost and are rejected on production origins. Use `npm run build`, not bare `jekyll build`, because the app build generates routes and asset manifests.

The current release tag is `v1.0.4`; [release notes](../CHANGELOG.md) describe its scope. Existing installations need no data migration or reconnection for this release. Use `npm run clean -- --dry-run` to inspect generated output and `npm run clean` to remove it while preserving dependencies, secrets and `.wrangler/state`.

Commit your public configuration. To adopt upstream fixes, add an upstream remote and merge/rebase deliberately, preserving your Wrangler configuration and secrets. Run `npm ci`, `git submodule update --init --recursive`, and `npm run check` before each deploy. Ordinary code deployments preserve SQLite state and queued work. Do not reapply a new namespace migration or delete the Durable Object to perform an upgrade.

Enable GitHub Actions and private vulnerability reporting on your fork, then update the reporting URL in [the security policy](SECURITY.md). Check runs on PRs, main pushes and a weekly schedule; Dependabot proposes dependency/action updates. Scheduled workflows in forks may need explicit activation. The live Jev step on trusted main runs needs its own scoped Workers AI secret as described in [Quality](QUALITY.md#required-jev-development-check); PR checks remain offline. No deployment credential is stored in GitHub and no workflow deploys automatically.
