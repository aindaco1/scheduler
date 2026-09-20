# Dependency PR review — September 20, 2026

Reviewed against main `2d082792818578311d23c3a61b53d91e35d30ccd`. The three original PR heads combine without source or lockfile conflicts. Combined local source `20832b143ee7129dc947781f2eb7a389e7edd988` has tree `38da8e39b3c7c663505669c802337eea9c8536a6`; merging current main into PR #6 produced the same tree before adding this documentation.

## Changes reviewed

| PR | Original reviewed head | Update | Review |
| --- | --- | --- | --- |
| [#4](https://github.com/aindaco1/scheduler/pull/4) | `3eb453dd902e4f9f6b48bd122c02643db0927b41` | ruby/setup-ruby 1.321.0 → 1.322.0 | The action SHA matches the upstream tag. Its [upstream diff](https://github.com/ruby/setup-ruby/compare/v1.321.0...v1.322.0) adds Ruby 4.0.7 to the version inventory; Scheduler still requests Ruby 3.3. |
| [#5](https://github.com/aindaco1/scheduler/pull/5) | `f773209ae03a961a8b8700146f52c65fd92854e0` | @types/node 26.5.0 → 26.5.1; Sass 1.104.0 → 1.104.1; Wrangler 4.130.0 → 4.131.2 | Manifest and lockfile agree. [Sass](https://github.com/sass/dart-sass/releases/tag/1.104.1) contains patch fixes; [Wrangler](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.131.2) updates Miniflare. Local server startup explicitly exercises the newer Miniflare with the retained workerd override. |
| [#6](https://github.com/aindaco1/scheduler/pull/6) | `8a12c2d1fc437b9ed62fa1156937a6fdf21d627e` | Zod 4.5.4 → 4.6.5 | Reviewed the [4.6 changes](https://github.com/colinhacks/zod/releases/tag/v4.6.0) and [4.6.5 release](https://github.com/colinhacks/zod/releases/tag/v4.6.5). Existing schema defaults, transforms/refinements, API validation, booking, authorization, provider-failure and recovery fixtures pass. No application adaptation is required. |

`npm ls` reports no invalid dependencies. Cloudflare pool 0.22.0 still requires Vitest `^4.1.0`; Vitest stays at 4.1.11. The existing workerd 1.20260908.1 override and sharp 0.35.4 override remain. Both Dust Wave gitlinks are unchanged. No force or legacy-peer installation flags were used.

## Local verification

An isolated worktree used Node 24.21.0 and the host's installed Ruby 3.0.0/Bundler 2.3.6. Ruby 3.0.0 is below the documented installation minimum; these local results do not replace the hosted Ruby 3.3 check.

- `npm ci --no-audit --no-fund` and `bundle check`: passed.
- `npm run check`: passed template synchronization, Worker/browser TypeScript, audit and shared-pin fixtures, all 176 Worker tests in 17 files, Jekyll production build, eight localized shell/privacy/asset gates, 321 paired messages, independent fork setup, browser booking/management/admin flows and axe scans, 40 admin and 84 public responsive states, and Wrangler deployment dry run.
- `npm run audit:dependencies`: zero npm vulnerabilities; OSV checked all 34 locked Ruby packages with no findings at `2026-09-20T14:41:10.340Z`.
- `wrangler dev --local` with separate disposable local storage and no provider secrets: `/api/health` returned `{ok:true}`, English and Spanish booking shells returned 200, and unauthenticated `/api/admin/settings` returned 401. The server was stopped afterward.
- `git diff --check`: passed. Application source, scheduling policy, storage schema, runtime configuration, and submodule contents are unchanged.

The existing shared Sass `@import` deprecation warning remains; the build and CSS/browser gates pass. Advisory results are dated registry observations.

## Hosted CI

All original PR Checks passed on September 17 with Node 24 and Ruby 3.3: [#4 run](https://github.com/aindaco1/scheduler/actions/runs/35230074096), [#5 run](https://github.com/aindaco1/scheduler/actions/runs/35230124051), and [#6 run](https://github.com/aindaco1/scheduler/actions/runs/35230133657). After #4 and #5 merged, their changes were merged into #6 for a combined hosted run. The final combined result is available in [PR #6 checks](https://github.com/aindaco1/scheduler/pull/6/checks), and subsequent main checks appear in [Actions](https://github.com/aindaco1/scheduler/actions/workflows/check.yml).

## Deployment and provider boundaries

No production deployment, settings change, live booking, provider write, invitation, or email occurred during this review. Fixture/browser and local-server results do not establish production or recipient acceptance. The last recorded deployed Worker and earlier controlled provider/recipient evidence remain in [STATUS](../STATUS.md).
