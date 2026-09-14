# Platform reuse migration — September 14, 2026

Consume the published admin declarations and shared pin checker. The 67-line ambient declaration copy is removed; runtime admin code is unchanged.

## Immutable source contract

- Consumer baseline: `1701eb22421407111ea7a6aba7374caf4141e29c`.
- Previous Platform pin: `af2a5e5e4b65f218e627652b8243feb9704c48a1`.
- Candidate Platform pin: `01630b1a132ab88f0e1972d1985e1a0cf860df76` ([shared PR](https://github.com/aindaco1/dust-wave-platform/pull/41)).
- Workspace candidate: 0.37.0. Changed packages: Worker Core 0.14.0, Admin Shell 0.11.0, Test Core 0.2.0, Release Core 0.3.0. Only entries used by this consumer are imported; other package versions retain their manifest values.

The gitlink, exact-version assertions, any affected lockfile entries and adapters
move together. Initialize the recorded submodule (`git submodule update --init
--recursive`), run `npm ci`, and stage an intentional gitlink change before the
shared pin assertion. Do not pull a moving Platform branch into the consumer.
This candidate depends on the shared PR and is independently reversible.

## Validation

`npm run check` passed: 176 Worker tests, audit/pin tests, build, quality/setup gates, browser acceptance, 40 responsive-admin checks, 84 public-layout checks and Wrangler dry run.

These are local source/build/test results. No consumer merge, deployment,
provider mutation, newsletter send or live acceptance is asserted.

## Rollback

Revert the complete migration commit, including its adapters, manifest/lockfile
changes, expected versions and gitlink. Then run `git submodule update --init
--recursive`, `npm ci`, and the affected checks above. Reverting only the pointer
would leave imports of unavailable exports. No data/schema migration is part of
this change. Another consumer's pointer is unaffected.

Rollback rehearsal passed on Node 24 before this final evidence annotation.
The complete migration was reversed locally with `git revert --no-commit`, the
previous submodule was initialized, and `npm ci` restored its lockfile state.
The old pin was verified and the following checks passed: `npm run typecheck`; `npm test`.
Temporary characterization fixtures used by the newsletter checks were removed.
The candidate source/gitlink was then restored, `npm ci` passed, and the worktree
was clean. No other consumer was changed by that rollback. The functional source
is unchanged by this evidence annotation.
