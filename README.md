# Scheduler

An open-source, self-hosted meeting scheduler for one person. Guests choose a meeting type, a place or video call, and an available time. Confirmed meetings are added to your main Google calendar automatically.

**Version 1.0.1 · [MIT license](LICENSE) · [Release notes](CHANGELOG.md)**

[See the booking page](https://scheduler.dustwave.xyz/alonso).

## What it does

- Checks selected Google and iCloud calendars for conflicts, respecting each event's Busy/Free setting. A Proton subscription visible in Google can block time too.
- Supports Google Meet, Zoom and in-person locations with their own opening hours and optional arrival instructions.
- Gives you weekly availability, recurring and temporary blackouts, inclusive date ranges, in-person-only travel blocks and optional U.S. federal holiday blackouts.
- Lets you set booking notice, how far ahead guests can book, default video/in-person gaps, per-type gap overrides, daily limits and change deadlines.
- Sends calendar invitations through Google and confirmations, changes and up to three reminders through Resend. Guests can cancel or reschedule; owners can include a message with a change.
- Includes a private dashboard, logo upload, optional brand name, optional Spanish, system light/dark themes, and mobile/tablet layouts. Turnstile protects booking without an email-verification step.
- Share individual meeting types from the dashboard with Copy link. Public pages include meeting-specific social previews and structured data in their initial HTML.

Jekyll builds the pages; a Cloudflare Worker serves the app and API. One SQLite Durable Object holds the owner's data. There is no separate database server, Redis, D1 or KV to operate.

## Installation and setup

You'll need Git, Node.js 24 or later, Ruby 3.1 or later with Bundler, a Cloudflare account with a domain, a Google account, and a Resend sending domain. iCloud and Zoom are optional. Cloudflare and provider usage may incur charges.

1. **Fork this repository**, then install your fork with its pinned public dependencies:

   ```sh
   git clone --recurse-submodules https://github.com/YOUR-USERNAME/scheduler.git
   cd scheduler
   npm ci
   bundle install
   npx playwright install chromium
   ```

   If you already cloned it, run `git submodule update --init --recursive`. GitHub's automatic source ZIP does not include submodule contents; use the recursive clone.

2. **Configure your own public identity before deploying.** Create a Turnstile widget for your hostname, then replace the sample values:

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
   ```

   This updates `wrangler.jsonc`; your page becomes `/your-name`. The dashboard controls branding and scheduling preferences after setup. Keep the Worker name, owner slug and encryption key stable when upgrading an existing installation.

3. **Connect your services.** Follow the [account, OAuth and secret setup guide](docs/FORKING.md#3-provision-your-accounts-and-secrets). It lists every required secret, callback URL and sending-domain step. You need your own credentials; the demo's connections do not transfer to a fork. Never commit credentials or paste them into public configuration.

4. **Check and deploy:**

   ```sh
   npm run check
   npx wrangler deploy --secrets-file .env.production
   ```

5. **Open `/admin/` on your domain.** Sign in using the configured owner email. Connect Google, optionally connect iCloud/Zoom, choose blocking calendars, and review your hours, locations, meeting types and reminders. If you do not use iCloud, turn off **Require iCloud**. New installations start paused. Use **Verify connections**, then turn on **Your booking page → Active** and save. Confirm your first booking and email delivery with a consenting test recipient.

The [complete setup guide](docs/FORKING.md) covers production secrets, local development, upgrades and troubleshooting. This is a single-owner deployment. The [roadmap](docs/ROADMAP.md) covers Phase 2 payments, profiles, direct Proton integration and two-way Google Calendar sync.

## Local development and testing

```sh
cp .dev.vars.example .dev.vars
# Fill in separate local secrets and provider credentials in .dev.vars.
npm run dev
```

Open `http://localhost:8787/your-name` (or `/alonso` in the unchanged upstream checkout) and `/admin/`. Local storage is separate from production; live provider credentials still contact those providers. Local OAuth needs registered localhost callbacks. Automated tests use isolated fixtures and send no real invitations.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build and run the local Worker on port 8787 |
| `npm run build` | Generate routes, hashed assets and Jekyll output |
| `npm run check` | Run the complete type, Worker, build, setup, browser and quality checks |
| `npm run audit:dependencies` | Check current dependency advisories |
| `npm run clean -- --dry-run` | List disposable generated output |
| `npm run clean` | Remove generated output; retain dependencies, secrets and local database state |

Use the project build command rather than bare `jekyll build`. See [operations](docs/OPERATIONS.md) for maintenance and [contributing](docs/CONTRIBUTING.md) for development conventions.

## Documentation

Start with the [documentation index](docs/README.md), organized by task. It links to setup, operations, contribution, API, security and quality guides, plus research and release evidence.

See the [roadmap](docs/ROADMAP.md) for future work, the [changelog](CHANGELOG.md) for completed changes, and [release status](docs/STATUS.md) for current deployment verification.

## License

Scheduler is [MIT licensed](LICENSE). Keep its copyright and license notice when copying or modifying it. Bundled dependencies retain their own licenses; see [third-party notices](docs/THIRD_PARTY_NOTICES.md). The included Inter font is OFL licensed. Proprietary fonts and demo-owner branding are not required to run your own instance.
