# Security

Please report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/aindaco1/scheduler/security/advisories/new). Include the affected version, reproduction steps using synthetic data, and the expected impact. Do not post calendar contents, guest information, credentials, session cookies, or booking links in public issues.

Fork maintainers should enable private reporting under their repository's Security settings and replace the reporting URL above. There is no promised response-time SLA or independent security certification.

## Boundaries

- Each deployment is for one owner. Guests can book public meeting types and manage only the booking authorized by their high-entropy private link. This is not a shared multi-tenant SaaS.
- Owner sessions and one-time sign-in tokens are hashed, time-limited, and revocable by expiry. Mutations enforce same-origin requests and authenticated owner or booking scope. Turnstile and rate limits protect public booking/login.
- Provider credentials and sensitive queued email payloads are encrypted with the deployment's `ENCRYPTION_KEY`. Guest booking records are private Durable Object data, not application-encrypted individually; Cloudflare's platform storage boundary still applies.
- Google Calendar owns event invitations; the durable queue reserves and reconciles operations before declaring success. Viewing an opening is not a reservation. Every confirmation/reschedule performs a fresh provider conflict read.
- Calendar browsing snapshots are bounded, owner-local memory with a 30-second maximum age, no stale-on-error fallback, and no persistence. Credentials, events, and guest data never enter CDN caches or browser storage. Raw event details are not returned to guests.
- HTML responses disallow intermediary transformations so zone-wide analytics/security-script injection cannot conflict with CSP. Explicit Turnstile remains active.
- Admin, management and API responses are private/no-store/no-transform with noindex, strict referrer policy and restrictive CSP. Only content-addressed public assets/logos have long cache lifetimes.
- Apple requests use validated HTTPS Apple CalDAV hosts and bounded redirects/bodies. XML entities and incomplete snapshots are rejected. The app reads iCloud only, but Apple's app-specific password itself grants broader access.

The scoped audit, accepted limitations, and regression commands are in [the quality review](QUALITY.md). Keep `npm run check` and the dependency advisory check green. Do not weaken provider failure handling to improve apparent uptime.
