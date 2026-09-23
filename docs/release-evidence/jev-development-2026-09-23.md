# Required Jev development checks — September 23, 2026

Implementation on `feat/jev-testing`, based on Scheduler source `c951add`,
published for review in [draft PR 7](https://github.com/aindaco1/scheduler/pull/7).
This is development-tooling evidence, not a deployed release.

## Scope and reuse

The requested scope is English/Spanish guest-facing copy and observable booking,
rescheduling and failure states, with live Jev enabled by default and blocking
failures or uncertain results. Trusted main/manual CI is wired; PR checks remain
explicitly offline. The CutNotes development evaluation and Pool's shared-package
pilot informed the integration. Scheduler keeps the mandatory gate and its own
requirements rather than inheriting Pool's advisory release policy.

Platform advances from `30b1cf9c1154b6f38e3da34fc7b2ed3b6d312088` to the merged
immutable commit `816da7b52ed346025f5bbe3a7a420e9ad7c4a815` ([PR 46](https://github.com/aindaco1/dust-wave-platform/pull/46)),
workspace 0.40.0. The pin assertions and lockfile move together: Test Core 0.3.0,
Worker Core 0.15.0, Admin Shell 0.12.0 and Site Shell 0.3.0. At the initial integration, runtime
entries used by Scheduler remained unchanged; no sibling repository or submodule
source was edited. Before the approved pending-copy change below, all nine compiled assets and
both social images matched the September 22 release-evidence hashes. This compares local output to recorded
hashes; it is not a fresh production probe.

The existing browser harness captures 18 states and the actual email renderer
supplies 16 HTML/text cases. There is no second app, browser framework, simulated
scheduler implementation or runtime Jev integration. Browser API responses are
synthetic; the existing Workers-runtime suite owns reservation, provider failure,
authorization and concurrency correctness. Exact assertions still fail before
any model request. The same capture assertions run offline in PR checks.

## Frozen evaluation

There are 16 calibration and 12 separate validation controls. The 0.10 margin,
recognized `jev-1.13.0` model and questions were frozen before the first live run;
no threshold or question tuning was performed in response to model results.
Labels are engineering-authored, not independent fluent-speaker validation.
The source-bound policy and full probabilities are retained with each run.

Initial complete `npm run check`: 34/34 rendered cases pass; 16/16 calibration
and 12/12 validation controls correctly classified; zero reviews. 62 requests,
78 questions, 41,600 input tokens, estimated inference $0.0017472.
This uses the dated TypeSafe rate rather than a Cloudflare billing receipt.
The conservative preflight reserve was $0.104832, below the $0.25 default limit.
No retries, fallback providers, purchases or top-ups were used.

The explicit dry run completed with zero model/authentication calls,
`complete: false` and `schedulerGate.passed: false`. Its corpus hash matches
the initial live run: `c121f608a31ad06986fe71ec3a2febb1f3d58b351097ae6478986ee0d44da30a`.
The preview's successful exit is not a live pass.

The final complete `npm run check` repeated the live run with the same corpus,
candidate hashes, questions and policy: 34/34 rendered cases, 16/16 calibration
and 12/12 validation controls, with zero failures or reviews. It again used
62 requests and 41,600 input tokens. The two runs total 83,200 input tokens,
estimated $0.0034944. Those two runs agreed on this small frozen set; the later release trial below
showed that this was insufficient evidence of stable judge behavior. No tests were skipped to obtain the final pass.

## Pending-state rubric review

The 1.0.2 release-candidate check at 14:59 UTC passed all deterministic checks
and all 28 controls but stopped on `browser-pending-en`: 33 rendered passes,
zero failures and one review. Identical candidate and corpus hashes produced
pass/fail margins of 0.14, 0.17 and finally 0.09 across three live runs. The final
margin fell below the unchanged 0.10 threshold; the earlier passes did not
establish robust repeatability. No automatic retry or deployment followed.

Source review found the pending rubric combined two assertions. It now asks
separately whether confirmation is in progress and whether the candidate avoids
claiming completed confirmation. Both must pass. Production copy, model and
threshold are unchanged. Eight fresh English/Spanish validation controls were
written and frozen before evaluation, including finished confirmation,
contradictory claims and missing status. These increase validation from 12 to 20
controls and the complete evaluation from 78 to 96 questions (70 requests).
This is an explicit rubric revision, not a silent reinterpretation of the
failed run. The [review data](jev-rubric-review-2026-09-23.json) preserve the
original request, hashes and all three margins.

The first atomic revision completed at 15:03 UTC: all 36 controls passed, but
both rendered pending pages failed the absence-based assertion. The positive
confirmation-in-progress assertion passed. This suggested a mismatch between an
absence requirement and the shared grader's instruction to evaluate communicated
facts. That failed run is also retained in the review data; it was not retried.

The final rubric keeps confirmation-in-progress as one assertion and makes the
second affirmative: every statement about calendar confirmation presents an
unfinished process. Four more held-out full-page controls include realistic
dates, meeting names and private-link guidance, with or without a conflicting
claim that the calendar confirmed the appointment. All original and added
controls remain in the corpus. This yields 16 calibration and 24 validation
controls, 34 rendered cases, 100 questions and 74 requests. The fixed limit is
still 100 questions, with a $0.1344 conservative reserve. The revised check at
15:06 UTC passed all 40 controls and 33/34 rendered cases. The actual English
pending screen still failed the consistency assertion (pass 0.33, fail 0.66,
uncertain 0.01). This does not prove a product defect. Deployment remains blocked
while the owner chooses between making pending copy explicit and retaining the
copy for further evaluator review. No threshold or label was changed to erase
this finding.

The owner then explicitly chose clearer pending copy. New bookings now say
“Your meeting is not confirmed yet” / “Tu reunión aún no está confirmada.” Shared
waiting guidance says the page is waiting for the calendar; the explicit
unconfirmed sentence applies only to a new pending booking, never to a pending
reschedule or cancellation. Existing fixture checks now assert that distinction
in both languages. The final rubric and all controls remain frozen; only product
copy and its exact capture assertions changed. The source-bound policy digest
was refreshed for the added assertions. The complete local check at 15:09 UTC
again passed all deterministic checks and all 40 controls, with 33 rendered
passes and one review: English pending consistency received pass 0.51, fail 0.48,
uncertain 0.01 (margin 0.03). It used 74 requests, 100 questions and 48,471 input
tokens (estimated $0.002035782). The copy clarification did not resolve the
judge-quality issue. Release, trusted live CI and deployment remain blocked;
version 1.0.1 stays the published release. No retry or override converted the
finding into a pass.

## Verification boundaries

- Local deterministic: complete check passed with 193 Worker tests, seven new
  semantic-gate regressions, template/pin/type/audit checks, production build,
  eight localized shells, 325 paired messages, independent fork setup,
  browser/axe/date-paging checks, 40 admin and 84 public responsive checks,
  synthetic capture and Wrangler dry deployment. Node 26.8.2 / Ruby 3.0.0
  on this host; hosted workflow remains Node 24 / Ruby 3.3.
- Source review: formatting and `git diff --check` passed; all 143 local links
  across 25 Markdown files resolve. Changed-file credential-signature scan found
  no matches across 20 text files.
- Dependencies: current npm audit found zero vulnerabilities; OSV returned no
  findings across 34 Ruby packages on September 23 UTC.
- Initial fixture repair: the unauthorized browser case originally navigated
  to the identical fragment URL without reloading the document. It timed out
  before any Jev calls. The fixture now reloads explicitly; no product code was
  changed to satisfy it.
- Hosted CI: [draft PR 7](https://github.com/aindaco1/scheduler/pull/7) runs the
  explicit offline workflow; its result is tracked on the PR. Trusted main/live
  CI remains unverified while the local semantic gate blocks merging. The repository
  variable `JEV_CLOUDFLARE_ACCOUNT_ID` was configured with `gh` from CutNotes'
  matching account configuration. Initially no Scheduler repository secrets were
  listed. The required dedicated Workers AI secret is
  `JEV_CLOUDFLARE_API_TOKEN`. CutNotes has no Jev repository secret or permanent
  token in its development configuration; local runs use Wrangler OAuth.
  That temporary credential was not copied to GitHub. GitHub CLI can store a
  supplied secret but cannot retrieve another repository's secret plaintext or
  create a Cloudflare token. Cloudflare denied token-management API access with
  the local OAuth credential. The user subsequently provisioned the dedicated
  Scheduler secret, verified present through `gh` on September 23 at 12:47 UTC.
  Trusted live verification and deployment remain pending.
- Deployment: none. No production setting, secret, schema or booking was changed.
- Calendar providers/recipients: not exercised. No live calendar write,
  invitation or email was sent. Only the approved synthetic text went to Jev.

## Local evidence

- First live run: `work/jev/2026-09-23T05-03-50-697Z-81ab99/`.
- Final complete check: `work/jev/2026-09-23T05-07-40-973Z-1420dc/`.
- Zero-call preview: `work/jev/2026-09-23T05-06-18-086Z-bb83fe/`.

Each run directory contained fresh rendered cases, the complete corpus,
raw responses/probabilities, source and candidate hashes, usage, and `review.md`.
All raw Jev runs, including blocked trials, were moved to a private recoverable
archive in macOS Trash before cleanup. The curated review JSON remains in this
repository. No credentials or real guest/calendar content are in these reports.
A different checkout regenerates new evidence with the documented command.

The bounded cleanup removed generated assets/site/manifests, caches, browser
reports and local audit/Jev output. Local Worker state and the preview helpers
were hash-verified unchanged; dependencies and local-secret presence were
preserved. Branch inventory found only `main` and the active unmerged
`feat/jev-testing` branch, so no stale feature branch was deleted.

## Rollback

Revert the consumer adapter, browser capture hook, commands, workflow and docs
alongside the Platform gitlink, pin assertions and lockfile. Restore
`30b1cf9c1154b6f38e3da34fc7b2ed3b6d312088`, then initialize submodules and run
`npm ci` and the original deterministic check. No data migration, provider
reconnection or sibling rollback is required. This rollback is documented,
not claimed as rehearsed for this change.

[Quality](../QUALITY.md#required-jev-development-check) owns commands, source
boundaries, authentication, spending and handling a blocked gate.
