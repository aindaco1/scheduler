# Quality review and ongoing checks

Initially reviewed September 9, 2026 and refreshed for 1.0 on September 10 against the current application, generated pages, Workers-runtime fixtures, and the Pool/Store documentation. This is an engineering review with regression fixes, not an independent penetration test, formal WCAG conformance statement, or native-speaker translation certification. Deployment and measured production results are recorded separately in [STATUS.md](STATUS.md).

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
- Static deployment metadata can differ from a later dashboard rename until the deployment name is updated/rebuilt.
- This review did not perform intrusive penetration/load testing on live providers or claim a restore drill. Preserve namespace identity and the encryption key; review backup/recovery needs before expanding beyond personal use.

## Accessibility and localization contract

All public booking, management, admin and privacy routes ship in English and Spanish, with Spanish enabled by default and an owner setting to turn it off. Disabled Spanish routes temporarily redirect to English; runtime language links, alternates and sitemap entries follow the preference. Translations and existing booking email languages are preserved. Native controls, labels, dialogs, skip links and focus styles remain the default. Dates use `Intl`/Temporal with IANA zones; the browser selects its reported timezone and guests can override it. Monday-week and DST boundaries are covered separately. Owner calendar names and authored content are not automatically translated.

The compact `t(en, es)` convention remains the existing UI catalog, avoiding a second translation framework. The quality script parses TypeScript compiled to JavaScript, rejects missing/empty paired literal translations and mismatched template placeholders, and exports a review packet. This validates the paired calls; it cannot detect every newly hardcoded string or judge translation quality. Email and static privacy copy are reviewed alongside their paired language sources and tested in their existing flows.

For a new locale, deliberately extend `Locale`, input schemas, formatting, route generation, email/static copy, translation catalog contract and language navigation. Do not merely add a route that silently serves English. Have a fluent speaker review the generated packet and actual rendered flows before declaring a locale complete.

The launch review adds 84 public-flow checks across 320, 390, 768 and 1024 pixels in English/Spanish and both system themes, including booking details, guest management, dialogs, privacy, sign-in and 200% text. It checks address clearance from the location focus outline, summary spacing, overflow, control size and keyboard focus. Narrow-screen nested summary padding is capped to leave more room for enlarged text.

The admin browser suite also exercises all four tabs at 320, 390, 768, 1024 and 1280 pixels in both languages. It checks independent Active switches and card disclosures, normalized vertical gaps, connection-divider spacing, compact saved states and full-size unsaved actions. Saved and unsaved controls are centered at phone/tablet widths; desktop retains the status/action layout. The cancelled-booking suite verifies elapsed-time cutoffs, old settings/data, email retry timestamps, filtering before the result limit and continued private access without deleting records.

Manual follow-up remains appropriate for VoiceOver/Safari or NVDA/Firefox speech, mobile screen readers, and native-speaker Spanish review. The current evidence is Chromium keyboard/DOM/axe and high-zoom/reduced-motion testing, not an assistive-technology certification.

## Commands and evidence

```sh
npm run check
npm audit --audit-level=moderate
npm run benchmark:availability -- --samples 30
```

`check` runs the pinned shared-template contract, TypeScript, Workers-runtime tests, production build, quality gates, independent fork setup, browser flows/axe and a Wrangler dry run. `config/quality-budgets.json` owns the asset limits. The booking and management pages load the timezone/slot-picker code only when a picker opens. Budgets count initial shared imports separately from lazy code, with all code still subject to the aggregate limit. Exact footprints are written to the quality artifact. Calendar responses remain private/no-store; only content-addressed assets and saved public logos receive long-lived cache headers.

Local evidence goes to ignored `work/audit` and `work/frontend`. CI retains fixture screenshots, quality metrics and the translation packet for 14 days. It never calls real calendars or sends invitations. The read-only availability benchmark collects sequential duration/status samples without event/guest bodies; its p95 is emitted only for 30 samples. It is not real-user LCP/INP/CLS or sustained-load evidence.

SEO checks verify eight localized shells, exact public sitemap membership, reciprocal alternates, canonical origins, asset existence and private noindex. Management shells stay crawlable so bots can see noindex, following [Google's localized-page guidance](https://developers.google.com/search/docs/specialty/international/localized-versions) and the Store crawl policy. Search-engine indexing and actual social-card rendering are external outcomes, not guaranteed by a passing build.

Cloudflare documents `no-transform` for preventing automatic [Web Analytics injection](https://developers.cloudflare.com/web-analytics/faq/) and [JavaScript Detections injection](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/javascript-detections/). Scheduler's explicit Turnstile and server verification remain required. Do not add a zone rule that requires a JSD-passed signal for these no-transform pages; the signal is intentionally absent. No zone-wide settings were changed.

Final source/CI/deployment results and measured latency/Lighthouse outcomes are recorded in [the pre-1.0 verification history](history/pre-1.0.md#final-quality-release-verification), with a [metrics-only evidence file](release-evidence/quality-evidence-2026-09-09.json).
