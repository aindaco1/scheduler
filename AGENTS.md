# Scheduler

Read README.md, docs/README.md and docs/decisions/phase-1.md before changing behavior.

- Jekyll builds the public/admin shells; one Worker and one SQLite Durable Object per owner hold runtime state.
- The same availability rules must govern listing, booking, and rescheduling. Never treat a provider failure as free time.
- Reserve atomically before external writes. Use durable operation IDs and recover uncertain writes without duplicate events.
- The calendar provider owns invitations; Resend owns branded confirmations/reminders. Never send unsolicited live test invitations.
- Reuse pinned Dust Wave packages. Consumer-specific booking rules, storage, routes, templates and secrets stay here.
- English with optional Spanish, system light/dark, keyboard operation, and narrow screens are phase 1 requirements. Spanish defaults on; respect the runtime Settings toggle and retain translations when disabled.
- Keep secrets, personal calendar contents, guest data, .dev.vars, and generated files out of git and logs.
- Run npm run check for functional changes. Add meaningful tests for scheduling, authorization, provider failure and concurrency cases.
- Record local, CI, deployed and actual provider/recipient verification separately in docs/STATUS.md. Do not call phase 1 complete while required integrations remain unverified.
- Preserve unrelated changes and avoid changes to sibling repositories or submodule contents.
- Follow docs/README.md for documentation ownership. Prospective work belongs in docs/ROADMAP.md; completed changes in CHANGELOG.md; dated verification in docs/STATUS.md and docs/release-evidence/. Keep research and historical evidence distinct, and update links when moving files.
