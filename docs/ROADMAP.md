# Roadmap

Prospective work, updated September 10, 2026. Version 1.0.0 is released; the work below is planned, not implemented or audited. Version 1.0.1 is the target for the security audit and resulting fixes. Phase 2 has no release date yet.

Current behaviour belongs in the [documentation index](README.md), completed changes in the [changelog](../CHANGELOG.md), and validation in [release status](STATUS.md) and [release evidence](release-evidence/).

## Version 1.0.1 — thorough security audit

Audit the released application, its deployment configuration and the setup path for a new fork. Build on the [existing quality review](QUALITY.md#security-review-scope-and-accepted-limitations) and [security boundaries](SECURITY.md), then verify them against the actual release candidate.

| Review area | Required coverage |
| --- | --- |
| Threat model and data inventory | Trace guest, owner, browser, Worker, Durable Object and provider trust boundaries; identify stored data, credentials, retention and deletion paths. |
| Authentication and authorization | Review owner login, single-use links, session hashing/expiry, OAuth state and callback validation, guest management tokens, cross-booking access, and privilege checks on every private route. |
| Request validation and abuse | Exercise Origin/CSRF checks, Turnstile validation, replay, rate limits, payload bounds, malformed inputs and resource exhaustion. Check that public errors do not expose private details. |
| Browser and uploads | Test injection/XSS, user-authored text, image validation and publication, safe links, CSP/security headers, referrers, browser storage and public/private cache boundaries. |
| Calendar providers | Review credential scope, token refresh and revocation, outbound URL/redirect validation, XML/ICS parsing, recurrence limits, incomplete responses and fail-closed conflict checking. |
| Booking integrity and recovery | Exercise concurrent reservations, stale reads, retries, interrupted calendar writes, cancellation/rescheduling races and durable job recovery. Confirm operations cannot duplicate events or bypass availability rules. |
| Email and private data | Inspect reminder/change-message authorization, durable delivery/idempotency, secret and guest-data redaction, public projections, logs, telemetry and generated artifacts. |
| Encryption, backup and restore | Review key handling, credential encryption and rotation/revocation procedures; define and rehearse a recovery path with isolated data, documenting any infrastructure needed. |
| Dependencies, CI and deployment | Audit runtime and development dependencies, pinned submodules/actions, lockfile integrity, Node runtime, GitHub permissions, Cloudflare configuration, secret handling and safe fork defaults. |

Completion criteria:

- [ ] Produce a dated report with scope, methods, evidence, severity, reproduction steps using synthetic data, and clear exclusions.
- [ ] Fix confirmed findings and add meaningful regression coverage. Resolve critical/high findings before release; document the disposition and rationale for every remaining finding.
- [ ] Run the complete local and CI checks against the candidate, and perform authorized deployment/provider checks separately. Use isolated calendars and consenting recipients for any external lifecycle tests.
- [ ] Publish 1.0.1 release evidence and update the security policy, quality review and operational guidance to match the verified result. An independent audit or certification must only be claimed if actually performed.

## Phase 2 — paid bookings with a sliding scale

- [ ] Add Stripe payments with an owner-configurable pay-what-you-can amount, including a free option. A zero-price booking must work without collecting payment details.
- [ ] Define suggested pricing, any minimum/maximum amounts, currency, cancellation/refund policy and the guest's final price before checkout.
- [ ] Coordinate payment, temporary slot holds, confirmation, expiry, retries and refunds through the existing reservation and durable job paths. Prevent duplicate charges and orphaned bookings.
- [ ] Reuse the relevant Dust Wave payment/email packages and patterns. Verify paid and free booking lifecycles with Stripe test mode before authorized production acceptance.

## Phase 2 — booker-selectable profiles

- [ ] Let guests choose profiles such as **Dust Wave** or **Volver**, with the appropriate branding, meeting types, locations and destination calendar.
- [ ] Keep one person as the availability and conflict boundary across profiles; choosing another profile cannot allow double-booking the same owner.
- [ ] Use provider-authorized organizer identities and make the selected profile clear in the booking, invitation and messages. Share configuration and scheduling logic instead of maintaining separate schedulers.

## Phase 2 — direct Proton integration

- [ ] Revisit current integration options and use [the Protoxide research](research/proton-integration-notes.md) as the starting reference.
- [ ] Complete its [feasibility milestone](research/proton-integration-notes.md#phase-2-feasibility-milestone): conflict reads, event identity, create/update/cancel, actual invitation delivery, recurrence, Busy/Free behaviour, recovery, credential custody and an appropriate always-available runtime.
- [ ] Support the work profile's Proton calendar directly only once the full booking and invitation lifecycle is proven. Keep the existing Google subscription as the fallback while feasibility is unresolved.

## Phase 2 — two-way Google Calendar sync

The required guest-facing case: **when the booked guest declines the invitation through their calendar and that response reaches Google Calendar, the booking must appear as cancelled in Scheduler.** Version 1.0 does not yet reconcile that response into its own booking state.

- [ ] Reconcile changes to Google events created by Scheduler with the matching booking. Match the stored calendar/event identity and the booked guest; unrelated events or another attendee's RSVP must not cancel a booking.
- [ ] On a confirmed guest decline, use the existing cancellation state and recovery path, stop future reminders, and apply the configured cancelled-booking visibility period. Reconcile the associated provider event so a cancelled reservation does not leave an orphaned busy event blocking the time.
- [ ] Reflect organizer cancellations/deletions and externally changed meeting times in Scheduler. Define the conflict policy for external time edits and the notification/provider-cleanup policy before implementation; keep existing Scheduler-to-Google changes working.
- [ ] Evaluate authenticated change notifications with durable reconciliation and catch-up for missed updates. Confirm provider state before applying changes; handle duplicates, delayed/out-of-order updates, expired subscriptions, revocation and failed reads without feedback loops or duplicate notices.
- [ ] Verify the full cycle with designated test calendars: Scheduler booking → Calendar decline/cancellation/time edit → matching Scheduler state, reminders and availability. Include a late decline, a repeated update and recovery after a missed notification. Treat a local-only deletion that never reaches Google separately from an actual declined RSVP.

## Scope and sequencing

The 1.0.1 audit precedes new Phase 2 features. Profiles, payments and Google reconciliation can proceed independently of the Proton feasibility milestone. Phase 2 remains centred on one owner's schedule; public multi-owner hosting is a separate scope decision.

Keep the Jekyll, Cloudflare, Resend, Stripe and GitHub stack, reuse pinned shared packages, and extend the existing scheduling/reservation logic. Move completed work into the changelog with its evidence rather than treating a roadmap checkbox as release acceptance.
