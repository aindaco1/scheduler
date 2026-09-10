# Scheduler

A small, open-source meeting scheduler built with Jekyll, Cloudflare Workers, Google Calendar, iCloud, Google Meet, Zoom, and Resend. English and Spanish; system light/dark; no per-booking host approval.

Alonso's booking page is **https://scheduler.dustwave.xyz/alonso**.

**[Set up your own instance →](docs/FORKING.md)**

## Project documentation

- [Quality, security, accessibility, performance, SEO and i18n](docs/QUALITY.md)
- [Contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md)
- [Phase 1 decisions](docs/decisions/phase-1.md)
- [Implementation and verification status](docs/STATUS.md)
- [Research and architecture](docs/research/scheduler-research-and-scope.md)
- [Design and shared-code reuse](docs/research/design-reuse-notes.md)
- [Phase 2 Proton research](docs/research/proton-integration-notes.md)
- [Development and deployment](docs/OPERATIONS.md)
- [Cross-project email delivery audit](docs/research/email-deliverability-audit.md)

Phase 2 adds profiles, pay-what-you-can including free, and direct Proton integration if its feasibility checks pass. Phase 1 uses a Proton calendar subscribed through Google for conflicts.

## Development

Use Node 22+, Ruby 3.1+ and Bundler. Clone with submodules.

```sh
git clone --recurse-submodules https://github.com/aindaco1/scheduler.git
cd scheduler
npm ci
bundle install
cp .dev.vars.example .dev.vars
npm run dev
```

Open http://localhost:8787/alonso and /admin. Calendar setup is required before public booking can be enabled. Unit and Worker tests use isolated fixtures and never contact live calendars.

```sh
npm run check
```

MIT licensed. Third-party components retain their notices. The included Inter font is OFL licensed; proprietary brand fonts are not distributed.
