# Zoom calendar joining-link investigation — September 25, 2026

## Observations and limits

An existing confirmed booking's Google event had no location or joining details
in its description. Its original confirmation and latest reminder contained the
same Zoom URL and had Resend `delivered` status. Restoring that URL to both fields
on the original event preserved its time and all three accepted attendees. Google
read-back and the Zoom desktop calendar showed the repaired joining details.

The owner confirmed adding an attendee through Apple Calendar. The event had
indeed changed from Scheduler's original two-attendee construction. A historical
Apple Calendar observation already showed the missing location before this
investigation, but no recorded edit established when the link disappeared.
Scheduler does not retain provider payloads or a Google event-version history.
The available evidence therefore does **not** prove that Apple Calendar cleared
the location or that Google's initial insert omitted it.

With explicit owner approval, one private, free diagnostic event was created with
no attendees, no reminders and a synthetic Zoom URL. Apple Calendar recognized
the URL and exposed a Join control. An attempted notes edit remained locally
visible, while Google read-back retained the earlier text and location. Apple
Calendar reported an account connection error. This is an inconclusive sync
diagnostic, not a successful reproduction of the reported attendee edit. The
fixture was removed through Google and a bounded search confirmed no remaining
matching event. No diagnostic invitations or Zoom meetings were created.

No guest identities, real event identifiers, joining URLs, management credentials
or personal calendar contents are included in this record.

## Reproducible Scheduler weakness and correction

The prior implementation put the Zoom URL only in the mutable Google location
field. It omitted it from the description and accepted an existing event during
recovery without checking either field. Losing Location could therefore remove
the only calendar-visible joining URL while confirmations/reminders still worked.

New invitations include a localized, HTML-escaped joining section in the
description. Creation, recovery and rescheduling restore an empty location and
append missing joining details to the current description. Nonempty custom
locations, notes, titles and attendees are retained. Conditional `If-Match`
updates prevent overwriting concurrent edits; uncertain writes are reconciled
through the existing job and event identity. A missing saved Zoom URL or an
incomplete repair never confirms the booking. Zoom bookings retain their Zoom
URL even if Google exposes an unrelated Meet conference.

Google's [patch contract](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)
preserves unspecified fields; its [versioned modification contract](https://developers.google.com/workspace/calendar/api/guides/version-resources)
uses HTTP 412 for a stale event version. These were checked during implementation.

There is no bulk rewrite or background sync of confirmed events. The description
copy protects future invitations against losing Location; it does not promise
recovery if an external client removes both copies after confirmation.

## Verification

- Focused local provider tests: 55 passed, including 12 new Zoom-link cases.
- Local coordinator recovery tests: 16 passed, including a new failed-repair →
  pending → successful-retry → exactly-one-confirmation case. TypeScript passed.
- Reproduction against the unchanged pre-fix provider/description source: nine
  of the 12 new cases failed; three existing safety expectations passed. The
  working fix was restored byte-for-byte after this isolated comparison.
- Full local `npm run check`: passed 206 Worker tests, 11 gate regressions,
  build/fork/privacy/localization/browser/accessibility checks, 40 admin and
  84 public responsive cases, and Wrangler dry deployment. Live Jev passed all
  40 controls with 33 rendered passes and the existing exact-copy approved
  pending-message review; zero blocking findings. No rubric/approval changed.
- Dependency audits: zero npm advisories and no findings across 34 Ruby packages.
- CI: [PR checks](https://github.com/aindaco1/scheduler/actions/runs/36162527757)
  and [trusted main checks](https://github.com/aindaco1/scheduler/actions/runs/36162804283)
  passed. Main ran the complete check, including live Jev: all 40 controls
  correct, 33 rendered passes, the existing exact-copy approved review and zero
  blocking findings.
- Deployment: source `db7134b246f4c1f8c11b84a5e46865d013b0ef25` was deployed at
  16:49 UTC as Worker `b6cbf295-0a79-4b67-901f-bdbc549b9eb3`, confirmed at 100%
  traffic. Health and eight localized shells returned 200; unauthenticated admin
  settings returned 401. All nine compiled assets and both social images matched
  local SHA-256 hashes. Public configuration was enabled/ready. Five bounded
  September 28–October 5 availability reads passed (64/46 video slots and
  40/31/16 in-person slots). Rollback version:
  `1316ceae-f045-4796-8232-139bfb915fba`. Settings, secrets, provider connections
  and schema were unchanged. Current release summary: [STATUS](../STATUS.md).
- Actual provider/client: the existing meeting repair and diagnostic cleanup
  above are verified. Final Google read-back retained both joining fields,
  original time and all three accepted attendees. Apple Calendar also displayed
  the restored Zoom location. The application change has not created live invitations;
  recipient-side rendering/delivery of the new description is not yet verified.
