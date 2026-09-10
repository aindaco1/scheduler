# Scheduler 1.0.1 security audit

Engineering audit dated September 10, 2026. Scope: the released 1.0 application plus the meeting-sharing upgrade, its pinned packages, deployment configuration, CI, and fresh-fork setup. Baseline: `2d7a585`. The tested release commit, CI, deployment and final verification are recorded in [STATUS](../STATUS.md). This is a source and runtime review performed during development, not an independent penetration test or certification.

## Method and coverage

Read the architecture, phase 1 contract, runtime code, browser rendering, provider adapters, shared security helpers, existing tests and operational guidance. Trace each Internet route into its owner Durable Object method; inspect awaits around authorization, reservation, credential refresh and external writes. Exercise adverse conditions using synthetic fixtures with unexpected network calls rejected. Query npm and OSV advisories, inspect GitHub security settings and Worker secret names, and rehearse actual Cloudflare point-in-time recovery in a temporary isolated namespace.

| Area | Reviewed boundary and evidence |
| --- | --- |
| Threat model | Public browser → Worker → owner DO → Google/iCloud/Zoom/Resend/Turnstile; private state inventory below; no independent tenant boundary within a deployment |
| Authentication/authorization | Same-origin mutation checks; hashed expiring login/session tokens; logout; OAuth state bound to provider and session, consumed once; 16 unauthenticated owner-route checks; guest token scoping and cross-booking rejection |
| Requests/abuse | Strict bounded input schemas, streamed body byte limits, Turnstile hostname/action/success and production test-key rejection; availability/booking/login limits; new guest-management limits and early reschedule rejection |
| Browser/uploads | Escaped authored text/attributes, safe HTTPS links, restrictive CSP and referrers, no private browser persistence, upload authorization and raster bounds, published-logo-only reads; SSR metadata/JSON-LD injection and public-projection regressions |
| Providers | Fixed Google/Zoom/Resend/Turnstile endpoints, explicit redirect policy, bounded response bodies under deadlines, Apple host allowlist and redirect cap, XML completeness/entities, ICS timezone/recurrence bounds, selected-calendar failure and pagination tests |
| Booking integrity | Final synchronous local conflict check/reservation/job transaction; stable Google event IDs and Zoom uncertain-write markers; two-interval reschedule reservation; overlapping cancellation and late writes; retry idempotency and cache invalidation |
| Email/privacy | Google owns invitations; encrypted frozen Resend payload/body and stable delivery key; stale revision/reminder suppression; held permanent failures and 23-hour uncertainty cutoff; bounded diagnostics |
| Encryption/recovery | AES-GCM with random nonces, authentication and wrong-key/tamper rejection; provider credentials and email encrypted; actual isolated PITR restore and quarantine; key custody/rotation limits documented |
| Supply chain/deployment/forks | Pinned npm/submodule/action revisions, lockfiles, Node 24 checks, generated output exclusions, strict public-origin setup, paused new forks, read-only workflow permissions and disabled checkout credential persistence; npm and Ruby advisory gates |

## Data inventory and trust assumptions

| Data | Storage and access | Retention/recovery |
| --- | --- | --- |
| Public name, descriptions, hours, locations, branding | Owner-authored SQLite settings; allowlisted public projections omit private location instructions and calendar selections | Until edited; published logo bytes can remain cached for one day |
| Guest name/email/topic, meeting times, instructions and owner change notes | Private booking rows, application-level plaintext within Cloudflare storage; owner or matching management token | No automatic deletion; cancelled-list hiding does not erase records |
| Management credential | Random token encrypted on booking; SHA-256 lookup hash; URL fragment and Authorization/body transport | Retained with booking; mutations respect change deadline; read access remains for link holders |
| Provider credentials | AES-GCM encrypted `config` values; ephemeral decrypted access/discovery state in the owner DO | Until disconnect/replacement; provider-side revocation is a separate action |
| Login/session/OAuth records | Hashed lookup tokens; expiring OAuth verifier and session association in private SQLite | Login 15 minutes, OAuth 10 minutes, session 12 hours; cleanup on alarms; logout deletes session |
| Jobs | Durable operation IDs, booking revision, due/lease/retry metadata; sensitive email payload encrypted | Removed after completion/supersession; permanent or uncertain mail retained for review |
| Replay markers and rate counters | Private config hashes/operation references; HMAC-derived IP keys | Replay markers retained with history; rate rows expire and are pruned |
| Busy snapshots | Owner-local memory, bounded windows/count/30-second freshness | Never persistent; no stale fallback; fresh provider reads for writes |
| Backups | Cloudflare SQLite PITR history; encryption key must be preserved separately | Platform recovery window is 30 days; this is not an independent archival backup |

An authenticated owner is allowed to configure public text, locations, calendars and credentials. A private booking link is a bearer capability. Compromise of the Cloudflare account, deploy credentials or encryption key is outside the application login boundary. An external calendar can change between a read and write; cross-provider atomic exclusion is unavailable.

## Findings and disposition

Severity is qualitative for this single-owner deployment. No critical or high finding was confirmed. All confirmed findings below are fixed in the candidate; there are no deferred confirmed findings.

| ID | Severity | Finding and reproduction | Fix and regression evidence |
| --- | --- | --- | --- |
| S101-01 | Medium | Newly constructed outbound fetches defaulted to following redirects. A provider redirect could forward sensitive headers; the shared helper stopped its timeout at response headers, so a stalled body outlived the deadline. No attacker-controlled production redirect was demonstrated. | Consumer `fetchProvider` keeps the pinned timeout through bounded body consumption and forces manual redirects. Only Apple follows validated destinations. Fixtures assert redirect policy, byte limit and cancellation of a stalled body. |
| S101-02 | Medium | Hold a Zoom refresh response, disconnect the connection, then complete refresh: the old response stored a credential again. Reproduced before fix. | Compare the encrypted connection version before saving refresh output, including after encryption; discard stale promises and never overwrite a new/disconnected connection. Deterministic disconnect-during-refresh regression. |
| S101-03 | Low | A reminder passed its initial revision check, then a cancellation during payload decryption still allowed the Resend call. Reproduced before fix. | Re-read booking revision/status and expiry immediately before sending. The race test now verifies zero Resend calls. An already dispatched external message cannot be recalled. |
| S101-04 | Medium | Malformed provider JSON could put private response fragments into parser errors; tsdav could throw raw response diagnostics across the DO boundary. Failure remained closed, but diagnostics were insufficiently bounded. | JSON and iCloud failures become stable application classifications. Invalid JSON and nested REPORT 404/409/423/507 regressions verify safe rejection. |
| S101-05 | Low | Malformed/oversized client JSON was reported as a server outage (503), obscuring client abuse and adding internal-error logs. Reproduced before fix. | Recognize the pinned request-validation error and return 400/413 with private response headers. |
| S101-06 | Medium | Guest-management reads/mutations lacked rate limits, and a valid link could request expensive provider reads for a reschedule outside booking policy. | Per-IP management limits (120 reads/minute, 20 mutations/10 minutes), bounded header tokens, local policy rejection before I/O and deadline recheck after I/O. Tests prove limits prevent booking access and invalid targets make zero provider calls. |
| S101-07 | Low | Build-only Ruby `json` 2.20.0 matched CVE-2026-71847 / GHSA-9hj4-r449-hfvc. Scheduler does not use the affected streaming parser in its Worker runtime. Existing CI queried only npm advisories. | Update only `json` to 2.21.2 and add OSV checks for all locked Ruby packages. Advisory-gate tests reject outage, incomplete/invalid responses and pagination. Checkout credentials are no longer persisted for build steps. |

The Ruby advisory and fixed version are documented by the [Ruby JSON maintainer](https://github.com/ruby/json/security/advisories/GHSA-9hj4-r449-hfvc). Cloudflare documents [header forwarding on followed redirects](https://developers.cloudflare.com/workers/runtime-apis/request/#properties) and the [PITR API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api).

## Recovery rehearsal

The committed `scripts/rehearse-recovery.mjs --live-isolated` runner creates a uniquely named Worker and new SQLite namespace, using the real Scheduler schema and encryption functions. It has no production namespace binding or provider credentials, rejects unauthenticated access, disables observability, and overrides alarms so no provider can be contacted.

It seeds synthetic state across all six tables plus KV and an alarm; takes a platform bookmark; damages only that fixture; restores via `onNextSessionRestoreBookmark` and restarts the DO. It compares the complete snapshot, decrypts credentials/management/email payloads, and checks the returned undo bookmark. It then rehearses quarantine: pause bookings, invalidate restored login/session/OAuth tokens, hold all jobs, and remove the alarm. Finally it deletes the temporary Worker. Sanitized counts and outcomes are retained in the release JSON; secrets and bookmarks stay in ignored local output.

The first attempt reached the new workers.dev endpoint before propagation and returned 404; cleanup succeeded. The runner now waits for authenticated readiness. This was a fixture startup issue, not a production restore or data loss. See [the recovery procedure](../OPERATIONS.md#backup-and-recovery) before any real repair.

## Verification and exclusions

The release JSON and [STATUS](../STATUS.md) record exact test counts, candidate CI, deployed Worker version, read-only smoke results and isolated recovery results separately. Existing local suites exercise booking, confirmation, cancellation, rescheduling, retry and provider failures with synthetic data. Production smoke must avoid creating bookings or sending mail.

Residual product/platform limits remain explicit:

- No automatic booking/history purge or independently stored archival backup. Recovery depends on Cloudflare history and separate key custody; possession of a backed-up production key was not inspected.
- No email-ownership verification, per the agreed Turnstile-only booking policy. Per-IP limits do not stop every distributed abuse campaign or guarantee provider cost bounds.
- Anyone holding a management link can read that booking; guest mutations close at the configured deadline. Restoring old storage can revive tokens or jobs, so quarantine and provider reconciliation are mandatory.
- Provider disconnect removes local credentials and pauses booking; it does not promise provider-side token revocation. In-flight external writes may already have happened.
- Google subscription refresh delay and external-calendar races remain. RSVP reconciliation is Phase 2.
- Cloudflare/Google/Zoom/Resend account IAM, OAuth publishing/consent, production secret entropy, independent penetration/load testing, native screen-reader review and native-speaker Spanish review are not certified by this audit.
- No live test guest invitations, email, calendar writes or real-data restore were performed for this release. Earlier recipient acceptance remains historical evidence.

Follow-up product work stays in [ROADMAP](../ROADMAP.md); the exclusions above are not silently converted into completed integrations.
