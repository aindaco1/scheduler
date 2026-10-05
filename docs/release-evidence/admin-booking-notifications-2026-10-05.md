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
- CI: pending trusted-main full check and dependency audits.
- Deployment: pending; production remains on 1.0.6.
- Provider/recipient: no live admin notification sent or inbox receipt
  asserted. The earlier guest delivery observed under 1.0.6 does not verify
  the new admin message. Real email-client rendering remains unverified.

## Compatibility

Uses the existing `ADMIN_EMAIL`, Resend credentials, namespace and job schema;
no migration, calendar reconnection or new secret is required. A rollback to
1.0.6 must first reconcile/hold any queued `admin_confirmed` jobs because the
older application does not recognize the new mail kind. Provider bookings and
guest emails keep their existing formats and IDs.
