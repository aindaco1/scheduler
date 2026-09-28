# Scheduler 1.0.3 maintenance release — September 28, 2026

## Source and review

Started from `e2086925e1473e455c7c764fb134c43fc937b475`. Reviewed the current
README, documentation index, Phase 1 decisions, API, security, quality, setup,
operations, roadmap, browser guidance and relevant historical release evidence.
Research remains historical; the current product and release contracts govern.

| PR | Reviewed head | Change |
| --- | --- | --- |
| [#8](https://github.com/aindaco1/scheduler/pull/8) | `44a336831ecdfe2169a3f85fc0a6818182d10203` | SHA-pinned ruby/setup-ruby 1.322.0 → 1.325.0; upstream tag verified |
| [#9](https://github.com/aindaco1/scheduler/pull/9) | `11001b5003d9064cb1e1341a8bbeda3cfe9f9ff9` | Node types 26.5.1 → 26.6.2, Prettier 3.9.6 → 3.9.8, Wrangler 4.131.2 → 4.136.0 |
| [#10](https://github.com/aindaco1/scheduler/pull/10) | `83f61b62673c6ef94589da838891763f6b8675c1` | tsdav 2.3.3 → 2.3.4 |

All three original checks passed before merge. Their combined main source is
`b68d653da4bbcb95d164b9a8b940f9d5416628fa`. Manifest/lockfile updates agree and
`npm ls --depth=0` reports no invalid dependencies. Vitest 4.1.11, the
workerd 1.20260908.1 override and both shared dependency pins remain unchanged.
The [tsdav release](https://github.com/natelindev/tsdav/releases/tag/v2.3.4)
fixes discovery/XML/resource URL handling; the existing iCloud regression suite
exercises actual tsdav discovery, fresh REPORTs and fail-closed malformed reads.
The Ruby action's upstream tag resolves to
`e8944e80fb94b20106697132f8c20c665fab29e9`, matching the workflow pin.

The pre-existing uncommitted Zoom changes and their documentation were retained
and versioned. Adapter SHA-256
`e94ef53789416f5a8d47b9338f67fc3df672a56f89a08499ad08e080a082626c`
matches the September 25 deployed timestamp correction. This release prevents
those operational fixes from being lost in a clean-checkout deployment.

## Local verification

- `npm ci`, `npm ls --depth=0` and `git diff --check`: passed.
- Full `npm run check`: passed 223 Worker tests in 18 files, 11 Jev gate
  regressions, template/type/audit/shared-pin checks, Jekyll build, eight
  localized shells, 325 paired messages, fork setup, browser/axe flows,
  40 admin and 84 public responsive cases, and Wrangler dry deployment.
- Live Jev: complete; 74 requests / 100 questions, all 16 calibration and
  24 validation controls correct, 33 rendered passes, one existing exact-copy
  owner-approved review, zero blocking findings. Synthetic corpus/report source:
  `work/jev/2026-09-28T04-46-00-723Z-7f9a6f`; no approval or policy was modified.
- Current advisory queries: zero npm vulnerabilities; OSV checked all 34 locked
  Ruby packages without findings at `2026-09-28T04:46:02.500Z`.
- Isolated Wrangler local smoke: health, English and Spanish booking shells
  returned 200; anonymous owner settings returned 401. A disposable persistence
  directory and no live provider credentials kept existing local state isolated.
- Local runtime: Node 26.8.2 / Ruby 3.0.0. The installed Ruby is below the
  documented 3.1 minimum; hosted Ruby 3.3 verification remains a separate gate.
  Existing Sass import deprecations and fixture/configuration warnings remain.

## Hosted CI and deployment

[PR #12](https://github.com/aindaco1/scheduler/pull/12) passed its
[offline hosted check](https://github.com/aindaco1/scheduler/actions/runs/36379284226).
The merged source `1dafb4d165650a55d995fa032dcee4edf67517b0` passed
[trusted-main CI](https://github.com/aindaco1/scheduler/actions/runs/36379492704)
on Node 24 / Ruby 3.3, including the complete live Jev gate. Hosted results:
all 40 controls correct, 33 rendered passes, the same exact-copy approved review
and zero blocking findings. Local and hosted raw evidence is retained in the
private cleanup archive; hosted artifacts also have the usual 14-day retention.

Wrangler 4.136.0 deployed that source as
`e7a53911-e9eb-4b78-98a1-6cc1ebbf7830` at `2026-09-28T04:55:26.875837Z`.
A fresh deployment read confirms 100% traffic. The previous version
`3c9b0134-bfd0-4da3-a958-9ef72bf0896c` is the code rollback target.
Worker identity, namespace, migration, bindings, settings, secrets and provider
connections were not changed. The pre/post public configuration hashes match.

Read-only production verification at `2026-09-28T04:56:30.543Z`:

- Health and all eight localized public/admin/manage/privacy shells: 200.
- Anonymous settings and connections: 401 with no-store headers.
- Nine compiled assets and both social images: exact local SHA-256 matches.
  Wrangler reported no changed static assets to upload.
- Public configuration: enabled, ready and Spanish enabled, unchanged from
  its pre-deployment fingerprint.
- Availability window: `2026-09-29T05:00:00Z`–`2026-10-06T05:00:00Z`.
  Two Zoom types returned 64 and 41 slots; the three in-person locations
  returned 29, 20 and 5 slots. These are five successful bounded provider reads,
  not a performance benchmark or a write/recipient test.
- The first availability probe returned 503 before the full repeat passed.
  Its provider error classification was not captured. Cause remains unconfirmed;
  no dependency regression or specific provider outage is inferred. A further
  read at `2026-09-28T04:57:30.529Z`, after the normal cache window, returned
  200 and 64 slots. The browser also successfully loaded the public picker.
- Browser smoke: English Brief chat displayed seven nonempty dates, 139 times
  and enabled Next. English/Spanish in-person displayed seven dates / 87 times
  and preserved the selected location and America/Denver timezone. The Spanish
  system-dark picker was visually inspected. No time was booked or submitted.

## Provider and recipient limits

No real booking, calendar/Zoom write, invitation or email is used for this
maintenance pass. Live availability reads passed as recorded above. The existing Zoom write/read-back and recipient acceptance gaps
remain in [the roadmap](../ROADMAP.md#test-quality-follow-up).

## Cleanup

Seven byte-identical iCloud duplicate files and one superseded documentation
copy were moved to a private recoverable archive outside the checkout. No
additional duplicate-name candidates remain in consumer source or generated
files. Dependency/submodule contents were not changed by duplicate cleanup.
After live verification, the local synthetic Jev/browser/audit output and
hosted evidence were archived privately. `npm run clean` removed fixed build
output, generated manifests, caches, Wrangler temporary packaging and reports.
Disposable Finder metadata was archived too. No blanket Git cleanup was used.

Merged `fix/zoom-calendar-link` and `release/1.0.3` branches were deleted
locally and remotely; merged Dependabot branches were removed and remote refs
pruned. Only `main` remains locally and on GitHub, with one worktree and no open
PRs. All 25 protected local-secret/state/preview files match pre-cleanup hashes.
Dependencies, source fixtures and clean pinned submodules remain. `work/` keeps
only the read-only local preview helper and its README. The final evidence-only
commit changes no tested runtime source, configuration, dependency or asset.
