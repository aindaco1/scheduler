# Quality review and ongoing checks

Initially reviewed September 9, 2026 and refreshed for 1.0 on September 10 against the current application, generated pages, Workers-runtime fixtures, and the Pool/Store documentation. This is an engineering review with regression fixes, not an independent penetration test, formal WCAG conformance statement, or native-speaker translation certification. Deployment and measured production results are recorded separately in [STATUS.md](STATUS.md).

The September 10 [1.0.1 audit report](release-evidence/security-audit-1.0.1-2026-09-10.md) supersedes the initial security/restore review below. It includes resolved provider transport, stale credential/email, diagnostics, request-abuse and Ruby dependency findings, plus an actual isolated Cloudflare restore/quarantine drill. The full local candidate check passed 176 Worker tests and the existing browser/fork/quality matrix; release CI/deployment remains separately recorded.

## Practices reused

- Pool security guidance: server-authoritative validation, scoped sessions/tokens, private data excluded from caches/logs, fail-closed provider reads, bounded external requests, and explicit public/private route boundaries.
- Store performance guidance: measure before optimizing, cache only a small projection, revalidate mutations authoritatively, bound memory/freshness, provide a kill switch, keep outer private responses no-store, and retain metrics without response bodies.
- Store accessibility guidance: keyboard focus, live status, axe across full flows, 200% text, narrow screens and reduced motion, with manual assistive-technology testing kept separate.
- Store SEO/i18n guidance: reciprocal canonical language routes, sitemap exclusion of private flows, crawlable noindex management pages, locale completeness checks and review packets.

References in the source repositories: [Pool security](https://github.com/aindaco1/pool/blob/main/docs/SECURITY.md), [Store performance](https://github.com/aindaco1/store/blob/main/docs/PERFORMANCE.md), [Store accessibility](https://github.com/aindaco1/store/blob/main/docs/ACCESSIBILITY.md), [Store SEO](https://github.com/aindaco1/store/blob/main/docs/SEO.md), [Store i18n](https://github.com/aindaco1/store/blob/main/docs/I18N.md). These are practices adapted to this smaller app, not copied commerce infrastructure.

## Findings and fixes

Severity reflects impact in this single-owner application.

| Area | Finding | Severity | Resolution / evidence |
| --- | --- | --- | --- |
| Performance | Every picker request repeated Google token refresh, Apple discovery and both calendar reads | High UX impact | Private 30-second busy snapshots, shared concurrent reads, reusable token/discovery metadata, early rejection of impossible ranges; coordinator tests verify actual avoided fetches |
| Performance/privacy | Google returned unused titles/descriptions and other event fields | Medium | Partial-response field mask retains only fields needed for Busy/Free, time bounds, pagination and Scheduler identity; live availability reads verified mask acceptance |
| Performance | Each entrypoint bundled duplicate shared code; fixed filenames discouraged safe long caching | Medium | Shared ES modules and content-hashed JS/CSS with immutable asset headers; per-entry initial transitive gzip and aggregate byte budgets |
| Security/privacy | Private HTML shells lacked explicit no-store headers and HTTP noindex | Medium | Admin/manage/API responses now set private/no-store/no-transform and X-Robots-Tag; Worker tests cover both locales, successes and errors |
| Accessibility | Week navigation replaced the focused button and reset keyboard focus | Medium | Restore focus to the corresponding enabled navigation button; keyboard regression test |
| Accessibility | Successful availability loads had no announcement of results | Medium | Localized live announcement of available-time count or no openings |
| Accessibility | Header/cards overflowed at 200% text on a 320px viewport | Medium | Wrapping header controls, shrinkable cards/columns, and long-word wrapping; fixture screenshot and six-page high-zoom/reduced-motion axe gate |
| i18n/UX | Challenge and expired-management errors fell through to generic text; Spanish-only authored labels lacked fallback | Medium | Explicit paired error copy and symmetric content fallback; names require at least one nonempty language |
| SEO | Missing canonical URLs, language alternates, social titles, robots and sitemap | Medium | Public EN/ES routes receive metadata and a sitemap; private routes remain excluded; generated-artifact assertions |
| Maintainability | Identity, branding, links and routes hardcoded for upstream owner | Medium | One public deployment identity in Wrangler, generated build data/routes, setup CLI and independent-domain fork test |
| Maintenance | No persistent quality/advisory gates beyond existing tests | Medium | Asset/SEO/locale/source-publication checks added to `npm run check`; weekly CI and dependency/action update proposals |
| Privacy/performance | Zone-wide Cloudflare analytics and JavaScript Detections were being injected into pages and blocked by CSP | Medium | HTML now includes no-transform, preventing those automatic injections; explicit Turnstile stays active. Verified on the real edge |
| Performance | Header logo lacked explicit dimensions | Low | Reserve a 120×52 contain-fit box; legacy external image optimization remains an operator asset choice |
| Reporting | No enabled private vulnerability intake | Low | GitHub private vulnerability reporting enabled upstream; SECURITY.md documents fork configuration |

No known npm dependency advisories were reported during the review. This is a dated registry result, not a promise that every dependency is vulnerability-free. CI queries current advisories and fails on moderate or higher issues or an unsuccessful query.

## Calendar cache contract

The Durable Object remains the source of truth for local bookings. The cache never contains rendered slots, guest details, event titles/descriptions, or response bodies. It contains only opaque time intervals and the Scheduler booking identifier needed to ignore the same event during rescheduling.

| Item | Policy |
| --- | --- |
| Storage/scope | In-memory only, in the existing owner Durable Object; never KV, SQLite, browser storage or CDN |
| Browsing freshness | Maximum 30 seconds, starting before provider I/O; no stale-while-revalidate or stale-on-error |
| Key | Selected Google/iCloud calendar IDs, owner timezone and a normalized bounded date window |
| Window | 14-day bucket plus 10 days of overlap, at most 24 days for valid picker requests; nearby weeks in the same bucket reuse the snapshot |
| Bounds | Four snapshots; unusually dense results over 10,000 intervals are returned but not retained |
| Concurrent readers | Share an in-flight read of the same snapshot instead of sending duplicate provider requests |
| Local reservations | Read from SQLite again on every availability response, then apply the current rules; never cached in a slot response |
| Invalidation | Settings saves, calendar connection changes, booking state writes, observed provider failures, and fresh verification/booking reads clear snapshots |
| Race protection | An invalidated in-flight cache promise cannot repopulate the cache after it finishes; settings revision is checked again before returning slots |
| Confirmation/reschedule | Always fetch fresh Google events and fresh iCloud REPORT results; never use a browsing snapshot, including durable job recovery |
| Google access token | Memory-only reuse until the provider's expiry minus 60 seconds, capped at one hour; refreshes coalesce; 401 or connection changes clear it |
| iCloud discovery | Private client/calendar metadata may be reused for five minutes; event REPORTs are fresh outside the browsing snapshot; failure or connection changes discard discovery |
| Explicit verification | Discards cached connection metadata and performs fresh discovery/conflict checks |
| Emergency switch | Set Worker var `CALENDAR_CACHE_ENABLED` to string `"false"` and redeploy to bypass busy snapshots; no data migration or purge required |

Cold starts and expired snapshots still wait for the providers. The picker retries transient read failures once after 500 ms; it keeps the same selection, cancels obsolete retries, and shows the error if the retry fails. It never serves stale slots during recovery. Known availability errors emit only their bounded classification to Worker observability. A fresh booking may be slower than browsing because it rechecks conflicts. Other calendar clients can change events between a provider read and write; Google/iCloud do not supply a cross-provider atomic reservation transaction. The scheduler serializes its own reservations, but cannot promise atomic exclusion against unrelated calendar clients.

A Proton subscription visible through Google inherits Google's subscription refresh delay. A “fresh Google read” is not proof of a fresh direct Proton read. Direct Proton integration remains phase 2.

Google's [partial-resource guidance](https://developers.google.com/workspace/calendar/api/guides/performance) supports requesting just the necessary event fields. Cloudflare's [in-memory Durable Object state](https://developers.cloudflare.com/durable-objects/reference/in-memory-state/) supports this small cache, but its lifecycle is not durable: eviction simply causes a cold read. No extra infrastructure is required.

## Security review scope and accepted limitations

Reviewed authentication/mutation routes, schema validation, cookie/origin boundaries, opaque booking links, encryption, provider URL/response validation, logo upload, event/outbox recovery, public projections and log classifications. Existing tests cover cross-origin rejection, single-use login tokens, hashed sessions, owner-only actions, booking scope, unsafe/incomplete calendar data, image validation, concurrent reservations, and uncertain writes.

The app intentionally exposes bookable times and approved locations. It does not expose which private event blocks a time. Public user-authored text is HTML-escaped, provider requests have deadlines/body limits, and uploaded images are type/size/dimension validated. CSP still permits inline styles because branding/layout uses them; it prohibits inline scripts, objects and framing. HSTS applies to the deployed HTTPS host.

Residual considerations:

- Booking records currently have no automatic deletion policy, as the privacy page says. Operators must decide retention requirements and arrange deliberate deletion/export work; this review did not delete records.
- A guest who mistypes an email can book without verification, per product scope. Turnstile and rate limits reduce abuse but do not prove email ownership.
- Anyone holding the private management link can use its booking permissions until their deadline. Keep links out of issue reports, referrers and browser persistence.
- Apple credentials are broader than this read-only adapter. Google/Zoom OAuth consent, publishing and account controls belong to each deployment owner.
- The existing external header logo is about 159 KB for a much smaller rendered size. Prefer an optimized uploaded raster; this review did not replace the chosen image or alter another project's source asset.
- Public page identity and meeting metadata use saved runtime presentation settings; static fallback build metadata still derives from deployment configuration.
- No intrusive penetration/load testing was performed on live providers. The 1.0.1 isolated platform restore/quarantine drill passed; it did not restore real guest data or verify possession of the backed-up production encryption key. Preserve namespace identity and the key; independent archival backups remain outside the shipped app.

## Accessibility and localization contract

All public booking, management, admin and privacy routes ship in English and Spanish, with Spanish enabled by default and an owner setting to turn it off. Disabled Spanish routes temporarily redirect to English; runtime language links, alternates and sitemap entries follow the preference. Translations and existing booking email languages are preserved. Native controls, labels, dialogs, skip links and focus styles remain the default. Dates use `Intl`/Temporal with IANA zones; the browser selects its reported timezone and guests can override it. Pages of seven nonempty dates, minimum notice, horizon limits and DST scan boundaries are covered separately. Owner calendar names and authored content are not automatically translated.

The compact `t(en, es)` convention remains the existing UI catalog, avoiding a second translation framework. The quality script parses TypeScript compiled to JavaScript, rejects missing/empty paired literal translations and mismatched template placeholders, and exports a review packet. This validates the paired calls; it cannot detect every newly hardcoded string or judge translation quality. Email and static privacy copy are reviewed alongside their paired language sources and tested in their existing flows.

For a new locale, deliberately extend `Locale`, input schemas, formatting, route generation, email/static copy, translation catalog contract and language navigation. Do not merely add a route that silently serves English. Have a fluent speaker review the generated packet and actual rendered flows before declaring a locale complete.

The launch review adds 84 public-flow checks across 320, 390, 768 and 1024 pixels in English/Spanish and both system themes, including booking details, guest management, dialogs, privacy, sign-in and 200% text. It checks address clearance from the location focus outline, summary spacing, overflow, control size and keyboard focus. Narrow-screen nested summary padding is capped to leave more room for enlarged text.

The admin browser suite also exercises all four tabs at 320, 390, 768, 1024 and 1280 pixels in both languages. It checks independent Active switches and card disclosures, normalized vertical gaps, connection-divider spacing, compact saved states and full-size unsaved actions. Saved and unsaved controls are centered at phone/tablet widths; desktop retains the status/action layout. The cancelled-booking suite verifies elapsed-time cutoffs, old settings/data, email retry timestamps, filtering before the result limit and continued private access without deleting records.

Manual follow-up remains appropriate for VoiceOver/Safari or NVDA/Firefox speech, mobile screen readers, and native-speaker Spanish review. The current evidence is Chromium keyboard/DOM/axe and high-zoom/reduced-motion testing, not an assistive-technology certification.

## Commands and evidence

```sh
npm run check
npm run audit:dependencies
npm run benchmark:availability -- --samples 30
```

`check:offline` runs the pinned shared-template contract, TypeScript, Workers-runtime tests, production build, quality gates, independent fork setup, browser flows/axe and a Wrangler dry run. `config/quality-budgets.json` owns the asset limits. The booking and management pages load the timezone/slot-picker code only when a picker opens. Budgets count initial shared imports separately from lazy code, with all code still subject to the aggregate limit. Exact footprints are written to the quality artifact. Calendar responses remain private/no-store; only content-addressed assets and saved public logos receive long-lived cache headers.

Local evidence goes to ignored `work/audit` and `work/frontend`. CI retains fixture screenshots, quality metrics, the translation packet and synthetic Jev evidence for 14 days. It never calls real calendars or sends invitations. The read-only availability benchmark collects sequential duration/status samples without event/guest bodies; its p95 is emitted only for 30 samples. It is not real-user LCP/INP/CLS or sustained-load evidence.

`audit:dependencies` checks npm advisories and every registry Ruby package in `Gemfile.lock` through OSV. Failed, incomplete, malformed or paginated Ruby responses fail the gate; all reported Ruby advisories require disposition by updating the dependency. The audit-gate fixtures run inside `check`. Advisory queries run separately and in CI so offline local fixture success is not described as a current advisory result. The live isolated recovery runner is an explicit operational command, never an automatic CI deployment.

SEO checks verify eight localized shells, exact public sitemap membership, reciprocal alternates, canonical origins, asset existence and private noindex. Management shells stay crawlable so bots can see noindex, following [Google's localized-page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions) and the Store crawl policy. Search-engine indexing and actual social-card rendering are external outcomes, not guaranteed by a passing build.

Meeting sharing adds Worker-response checks for localized initial metadata/JSON-LD, runtime sitemap membership, saved changes, retired/ambiguous type 404s, paused 200s, HEAD, public-projection privacy and HTML/script escaping. Browser fixtures cover clean copied URLs, saved/active eligibility, clipboard failure, locale selection, mobile controls and unavailable-link navigation. Generated PNGs have fixed dimensions and a 200 KB budget each. The static sitemap gate covers Jekyll's base shell; Worker tests cover the saved meeting-type entries. These follow [Apple's Messages preview guidance](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages), [Open Graph](https://ogp.me/) and [Schema.org Service](https://schema.org/Service). Actual Messages rendering remains a separate acceptance result; valid Service data does not imply eligibility for a Google rich result.

Cloudflare documents `no-transform` for preventing automatic [Web Analytics injection](https://developers.cloudflare.com/web-analytics/faq/) and [JavaScript Detections injection](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/). Scheduler's explicit Turnstile and server verification remain required. Do not add a zone rule that requires a JSD-passed signal for these no-transform pages; the signal is intentionally absent. No zone-wide settings were changed.

Final source/CI/deployment results and measured latency/Lighthouse outcomes are recorded in [the pre-1.0 verification history](history/pre-1.0.md#final-quality-release-verification), with a [metrics-only evidence file](release-evidence/quality-evidence-2026-09-09.json).

## Required Jev development check

`npm run check` runs the complete deterministic suite, captures fresh synthetic
browser/email output inside the existing browser harness, then runs live Jev.
Failures, uncertain/near-tied judgments, unknown model versions, incorrect
labeled controls and incomplete evaluation all prevent a passing check.
`npm test` remains the focused, offline Worker suite.

```sh
npm run check                       # Complete deterministic + live semantic gate
npm run check:offline               # Explicit deterministic-only check
npm run test:jev                    # Fresh build/browser capture + live semantic gate
npm run test:jev -- --dry-run        # Fresh capture and requests; zero model/auth calls
npm run test:jev:unit               # Offline gate/error/budget regressions
```

A dry run exits successfully as a preview with `complete: false` and a false
Scheduler gate. It is never equivalent to a live pass. The live command exits 1
for findings/control mismatches/review, and 2 for missing authentication,
preparation errors or incomplete provider evidence. The full command runs the
existing deterministic suite once, before remote evaluation; Jev cannot override
its failures. Standalone `test:jev` does not claim the Worker suite ran.

### Ownership and inputs

Reuse Platform Test Core 0.3.0's `@dustwave/test-core/jev` entry for request
construction, bounded Cloudflare transport, complete response validation and
probability routing. Scheduler owns requirements, controls, source capture,
credentials, budget and the required gate. No runtime Worker/browser import,
new service, database or separate test framework is added. CutNotes and Pool
remain unchanged.

Keep this boundary when adopting Jev elsewhere: reuse the shared evaluation
protocol and transport, with a thin consumer adapter for each project's output
and acceptance rules. Do not add a second shared Jev implementation or move
consumer credentials into Platform. CutNotes' Python runner would need its own
explicit adoption of the existing JavaScript entry.

The first corpus contains 34 rendered cases: nine browser states in each
language (calendar failure, pending, confirmed, reschedule reservation guidance,
completed reschedule, expired change deadline, cancellation, failed booking and
unauthorized access), plus four email kinds in HTML and text in each language.
Browser cases exercise the built application against isolated API responses;
email cases call the existing `bookingEmail` renderer. Local assertions check
submission fields, private-link authorization, time changes, hidden mutation
controls, retry behavior, email links and conditional message content. Existing
Worker tests continue to own actual scheduling, concurrency and durable recovery.
This is synthetic browser behavior, not a live-provider booking acceptance run.

Only generated fixtures and public application copy can enter the evaluator.
There is no arbitrary file, saved-output or production-data input option. The
capture blocks external requests, intercepts Turnstile and every API, and removes
email addresses/URLs from semantic text after exact checks. No messages or
calendar invitations are sent. Generated reports stay in ignored `work/jev/`;
each run has a new directory. They retain candidate/request text, raw responses,
probabilities, model versions, usage, timings and source/corpus hashes, but no
credentials. `review.md` places flagged text beside its requirement.

### Credentials, spending and CI

Use `CLOUDFLARE_ACCOUNT_ID` (otherwise the local Wrangler account configuration)
and `CLOUDFLARE_API_TOKEN`. Locally, an existing Wrangler login is used if no token
is set. CI requires the explicit token and never opens a login flow. Do not put
tokens in command arguments, fixtures, runtime secrets or committed files.

Trusted main-branch pushes, main-branch manual runs and scheduled checks run the
full gate. Configure repository variable `JEV_CLOUDFLARE_ACCOUNT_ID` and secret
`JEV_CLOUDFLARE_API_TOKEN` using a dedicated token limited to Workers AI for that
account. Missing credentials fail the trusted check. Pull requests and non-main
manual refs run the explicitly named offline step without Jev secrets; they do
not establish semantic acceptance. Do not use `pull_request_target` to run a
contributor's code with the token. Use a separate Workers AI token per consumer
repository so rotation and revocation remain independent; sharing the package
does not require sharing credentials. Provision tokens outside the repository.

The runner permits at most 100 questions, one request attempt per case, with no
automatic retry, fallback, purchase or top-up. Default estimated spending limit:
$0.25; `--max-estimated-usd=...` can lower it or raise it to at most $1. The
conservative reserve is 32,000 input tokens per question at the dated September
23 [TypeSafe reference rate](https://docs.typesafe.ai/models) of $0.042/million.
The current 100 questions reserve $0.1344. This is a local estimate, not a
provider-enforced billing cap. The [Cloudflare model reference](https://developers.cloudflare.com/ai/models/typesafe/jev/) directs pricing checks to the account dashboard.
Gateway cache/logging request headers are disabled; that is not a retention
policy guarantee.

### Judge policy and review

There are 16 calibration and 24 separate validation controls, each a labeled
faithful/flawed example in English or Spanish. The pending-state rubric uses
separate assertions for confirmation in progress and consistent unfinished
status. Twelve additional validation controls cover both languages, completed
confirmation, contradictory claims, missing status and realistic page details. They test pending confirmation,
reservation preservation, failed bookings, calendar errors, cancellation,
change deadlines and reminders. Labels are engineering judgments; they do not
establish native-speaker approval or universal judge accuracy.

`config/jev-policy.json` freezes the 0.10 probability margin and recognized
model `jev-1.13.0`. Its digest binds the shared question protocol and local
requirements/controls; changing those requires deliberate policy review.
The margin is inherited as a conservative starting point from CutNotes, not
claimed to be calibrated to Scheduler. The live run checks both control splits;
it never tunes prompts, labels or thresholds automatically. The September 23
[review record](release-evidence/jev-development-2026-09-23.md#pending-state-rubric-review)
documents an explicit atomic-question revision and fresh validation after a
near-tie blocked release, followed by a failed absence-based rubric and an
affirmative consistency revision with four further held-out controls. The margin
and production copy were unchanged. Shared evidence remains advisory;
the consumer's `schedulerGate.passed` is the mandatory outcome. A complete API
response and `releaseAccepted: false` in shared evidence are not release approval.

Investigate flags against actual source/rendered behavior. Preserve the failing
report, fix a demonstrated product defect or revise a demonstrably wrong rubric,
and use fresh held-out examples after tuning. Do not weaken thresholds or rewrite
correct product copy merely to get a pass. See TypeSafe's [confidence guidance](https://docs.typesafe.ai/confidence).
Jev evaluates text meaning, not screen layout or calendar atomicity. Keep
keyboard/axe, deterministic business rules, deployment, provider and recipient
verification as separate evidence in [STATUS.md](STATUS.md).
