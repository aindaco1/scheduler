# CI and dependency maintenance — October 28, 2026

## Investigation and changes

The October 26 [scheduled Check run](https://github.com/aindaco1/scheduler/actions/runs/40386241548)
stopped at the dependency audit, before functional checks or Jev. It reported
Undici 7.30.0 and both the direct and Cloudflare test pool's nested Zod as
vulnerable. The existing scoped Miniflare override now selects Undici 7.30.1;
the direct Zod update to 4.6.6 also supplies the test pool's Zod through a scoped
override. No force/legacy peer flags or audit exemptions are used.

Advisories: [Undici EventSource memory](https://github.com/advisories/GHSA-4qv8-2p9j-2685),
[integrity tokens](https://github.com/advisories/GHSA-f72v-6w45-q472),
[content encodings](https://github.com/advisories/GHSA-xjj6-f33q-929c), and
[Zod collection validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5).

The October 21 [PR #24 check](https://github.com/aindaco1/scheduler/actions/runs/39691015164)
passed its then-current audit and Worker tests but failed the browser accessibility
gate. Axe 4.14 found `label-content-name-mismatch`: the header link's fixed
"Booking home" name omitted the visible "SCHEDULER" text after clearing branding.
Removing the overriding ARIA label lets native link naming follow the visible
text or logo alt text, including saved branding changes and both languages.
Existing browser fixtures now explicitly check these accessible names.

The combined candidate retains the actual heads of [PR #18](https://github.com/aindaco1/scheduler/pull/18),
[PR #19](https://github.com/aindaco1/scheduler/pull/19),
[PR #21](https://github.com/aindaco1/scheduler/pull/21),
[PR #22](https://github.com/aindaco1/scheduler/pull/22), and
[PR #24](https://github.com/aindaco1/scheduler/pull/24) in its history so their
updates can be validated and merged together. Both shared-package pins,
workerd 1.20260908.1 and supported Vitest 4.1.12 are retained.

The [tsdav 2.4.0 release](https://github.com/natelindev/tsdav/releases/tag/v2.4.0)
adds Digest authentication negotiation. Scheduler's bounded Apple transport
continues to reject credential challenges before the library can negotiate.
A new synthetic regression verifies a Digest challenge fails closed without a
credential retry; existing coverage checks explicit Basic headers, unsafe
redirects, incomplete snapshots, recovery, authorization and competing bookings.

## Local verification

- `npm ci` succeeded without peer-dependency bypasses.
- `npm run audit:dependencies` passed on October 28 at 17:16:19 UTC: zero npm
  findings and no findings across all 34 locked Ruby packages.
- `npm ls` confirms Zod 4.6.6 and Undici 7.30.1 throughout the affected trees.
- Full local check is in progress; hosted checks are recorded separately below.

## Hosted verification

Pending validation of the combined candidate. Historical failures remain failed;
new successful evidence will supersede their affected source revisions.

## Deployment and actual providers

This maintenance does not deploy production or send any calendar invitations,
bookings or email. Production remains the separately recorded 1.0.8 deployment.
Actual admin-notification delivery and recipient receipt remain unverified.
