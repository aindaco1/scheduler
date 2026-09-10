# Contributing

Read [AGENTS.md](AGENTS.md), [phase 1 decisions](docs/decisions/phase-1.md), and [the architecture/setup guide](docs/OPERATIONS.md). For your own deployment, start with [FORKING.md](docs/FORKING.md).

Keep changes small and reuse the pinned shared packages. Update a shared package through its upstream repository and then advance the submodule deliberately; do not silently edit vendor contents. Both submodules are public MIT repositories.

Use isolated fixtures, never real guests or calendar invitations. Add regression cases for altered scheduling rules, authorization, retries, caches, and concurrency. Public availability and booking/rescheduling must use the same rules. Preserve both English and Spanish messages, keyboard behavior, system themes, and narrow layouts.

Run `npm run check` before submitting a change. It includes type checks, Worker tests, production build, asset/SEO/i18n/privacy gates, independent fork setup, browser accessibility/flow tests and a Wrangler dry run. `npm audit --audit-level=moderate` checks current advisories; inability to retrieve advisories is not a clean result. CI does this too.

Explain the user-visible behavior and relevant test evidence in the pull request. Record meaningful operational changes in `docs/STATUS.md`, keeping local tests, CI, deployment, and real provider/recipient results distinct. Public issues, screenshots and logs must contain only synthetic guest data.

For translation work, run `npm run test:quality` after building. The review packet in `work/audit/translation-review.json` contains paired UI messages. Static page copy and email translations are maintained alongside their English counterparts. See [QUALITY.md](docs/QUALITY.md) for adding locales and manual review boundaries.
