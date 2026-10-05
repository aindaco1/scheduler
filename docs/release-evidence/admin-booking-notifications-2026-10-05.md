# Admin booking notifications — October 5, 2026

## Behavior

The owner requested a separate admin notification after locating a real guest
booking. New bookings now queue mail to `ADMIN_EMAIL` in the same storage
transaction that confirms the booking and queues the guest confirmation.
Provider event creation and required joining-detail repairs complete first.
Already confirmed records are not backfilled.

The notification includes guest name/email, meeting type, date/time in the
owner's configured time zone, duration, location or joining URL, and optional
guest note. It uses the booking's English/Spanish language, replies to the
guest, and links to the authenticated dashboard without a guest management
token. Guest-provided HTML is escaped.

The existing encrypted outbox freezes payload/sender on first dispatch and
uses a separate durable Resend delivery ID for each recipient. Transient
failures retry within the existing 23-hour uncertainty limit. Permanent or
expired uncertain sends remain held. One successful recipient cannot clear
the other's outstanding error; held failures take display priority. A booking
revision check prevents sending stale mail after cancellation/rescheduling.

## Verification

- Local: `npm run check` passed all deterministic stages with 264 Worker tests
  in 19 files, type/build/package checks, 327 paired messages, fork setup,
  browser/accessibility checks and dry deployment. The local live Jev stage
  exited incomplete because Wrangler OAuth lacks Workers AI write permission.
  The evaluation policy and existing approval were unchanged.
- Coverage: queue only after provider completion, repeat job recovery without
  duplicate mail, independent guest/admin success and failure, permanent versus
  retryable failures, frozen payload/idempotency across settings changes,
  cancellation during dispatch, owner versus guest time zone, escaped notes,
  meeting destinations, private dashboard link, English and Spanish.
- Rendering: isolated browser fixtures passed keyboard/link/language checks
  at 320 and 768 pixels for both languages, with no horizontal overflow.
  English phone and Spanish tablet captures were visually inspected. Fixtures
  use synthetic guests and block network requests; they do not send mail.
- CI: source `031d110ed4f3a2e8ab43faaa2d66d34015012bac` passed
  [trusted-main attempt 2](https://github.com/aindaco1/scheduler/actions/runs/37365991450/attempts/2)
  on Node 24 / Ruby 3.3 at 21:58:56 UTC. All 264 Worker tests, the full browser
  matrix and dependency audits passed. Live Jev completed with 40 correct
  controls, 33 rendered passes, the existing approved exact-copy review and
  zero blocking findings. This existing semantic corpus covers public/guest
  output; the new admin template has the separate deterministic renderer and
  browser checks described above. No evaluation policy or approval changed.
  Attempt 1 failed without running tests because GitHub could not acquire a
  hosted runner during the Actions incident.
- Deployment: Worker `9c23862c-090c-4f3d-9bbe-be61bf3b7b6b` serves 100%
  of traffic from 21:59:33 UTC. No static asset upload was needed. Public
  settings fingerprint, credential binding names and Durable Object namespace
  match 1.0.6. Eleven route/private-boundary checks and nine asset hashes passed.
- Provider: all ten read-only availability checks returned 200 across two date
  windows and every active type/location. Production warning/error logs were
  empty from deployment through the 21:59:57 UTC verification query. No provider
  event or invitation was created by the release verification.
- Provider/recipient: no live admin notification sent or inbox receipt
  asserted. The earlier guest delivery observed under 1.0.6 does not verify
  the new admin message. Real email-client rendering remains unverified.

## Compatibility

Uses the existing `ADMIN_EMAIL`, Resend credentials, namespace and job schema;
no migration, calendar reconnection or new secret is required. A rollback to
1.0.6 must first reconcile/hold any queued `admin_confirmed` jobs because the
older application does not recognize the new mail kind. Provider bookings and
guest emails keep their existing formats and IDs.

## Release and cleanup

[Version 1.0.7](https://github.com/aindaco1/scheduler/releases/tag/v1.0.7) targets
the CI-tested source above. Documentation recording deployment follows in a
separate commit and does not change the runtime artifact.

After verification, `npm run clean -- --dry-run` reviewed the fixed output list
and `npm run clean` removed generated Jekyll/assets/manifests, caches, Wrangler
packaging and browser/audit/Jev output. An empty fork-test scaffold was removed.
Operational iCloud/notification scratch, release logs and three stale duplicate
documentation copies were preserved in a private local archive outside the
checkout. Canonical documentation and committed release findings remain here;
CI retains its synthetic evidence under its normal 14-day retention.

The cleanup verified 23 local configuration/state files were unchanged and
retained `node_modules`, installed Ruby dependencies, source/tests, both pinned
submodules, `.wrangler/state` and the read-only local preview helper. A pruned
remote fetch found only `main` locally and remotely, with no open pull requests,
other worktrees or stale branches to remove.
