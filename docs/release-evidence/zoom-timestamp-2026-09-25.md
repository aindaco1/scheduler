# Zoom scheduled-time mismatch — September 25, 2026

## Evidence and diagnosis

Both owner-reported Google events retained their intended start instants on
fresh reads. The corresponding Zoom detail pages and calendar-export UTC
parameters showed saved instants seven hours later. This establishes a stored
time disagreement, not merely two interfaces displaying different timezones.
Guest information, actual event/meeting IDs and private URLs are excluded.

The Zoom adapter used `new Date(timestamp).toISOString()` on creation and
rescheduling, producing a fractional-second suffix such as `.000Z`. This format
was present in the initial implementation, rather than introduced by the
calendar-link or joining-policy changes.

The current [Zoom Meetings API](https://developers.zoom.us/docs/api/meetings/)
documents `yyyy-MM-ddTHH:mm:ssZ` for UTC `start_time`. It separately supports
local timestamps without `Z` with a timezone. Scheduler's UTC path should use
the former and retain the chosen timezone for meeting presentation.

In [a firsthand report acknowledged by Zoom staff](https://devforum.zoom.us/t/accept-iso8601-dates-with-milliseconds/12507),
the same JavaScript serialization caused an exact seven-hour shift associated
with America/Los_Angeles. Removing milliseconds restored the intended instant.
[Zoom staff also explicitly confirmed that milliseconds are unsupported](https://devforum.zoom.us/t/getting-wrong-timezones-while-creating-events-through-the-api/55486).
The source defect and observed offset strongly support the same explanation
here. The historical creation responses are unavailable, and no new live API
A/B reproduction was performed; this record does not claim one.

## Correction

One private formatter in `worker/src/providers/zoom.ts` removes the fractional
seconds from the ISO UTC timestamp. Both creation and rescheduling use it.
For a synthetic example, `2026-10-05T17:15:00.000Z` becomes
`2026-10-05T17:15:00Z`; no timezone arithmetic is applied. The booking timestamp,
duration, timezone, existing meeting identity and uncertain-write recovery stay
unchanged. No existing provider meeting is automatically retimed.

## Verification

- Regression before correction: all 16 new table cases and the tightened
  existing creation expectation failed on the unwanted `.000Z` suffix; the
  other 43 provider regressions passed.
- Local: complete `npm run check` passed 223 Worker tests and 11 Jev gate
  regressions, type checks, localized quality/fork checks, browser/accessibility
  flows, 40 admin and 84 public responsive cases, and Wrangler dry deployment.
  Creation and rescheduling are each checked for Central/Pacific dates, both
  sides of spring DST, both repeated fall hours, UTC, and a half-hour-offset
  timezone crossing the UTC date boundary. Tests assert exact serialized values,
  equal parsed instants, unchanged timezone/duration, and PATCH of the existing
  meeting with only the intended fields.
- Live Jev: complete, 74 requests / 100 questions; all 40 controls correct and
  all 34 rendered cases passed, with no reviews or blocking findings. Ignored
  synthetic evidence: `work/jev/2026-09-25T18-51-44-259Z-b24c77`.
- CI: not run for this change.
- Deployment: Worker `3c9b0134-bfd0-4da3-a958-9ef72bf0896c` was deployed at
  18:55 UTC and confirmed at 100% traffic. Health and all eight localized shells
  returned 200; unauthenticated admin settings returned 401. All nine compiled
  assets matched local SHA-256 hashes and public config remained enabled/ready.
  The tested working tree was based on `e208692`; the deployed Zoom adapter
  SHA-256 was `e94ef53789416f5a8d47b9338f67fc3df672a56f89a08499ad08e080a082626c`.
  Rollback target: `7310f571-928c-4f05-a534-ca0a2d726d7d`. No provider connection,
  account setting, secret or schema was changed by deployment.
- Actual provider: existing Google reads and Zoom observations support the
  mismatch above. No new live Zoom write/read-back acceptance, application
  booking, diagnostic meeting or guest invitation was performed. Today's
  existing meetings were not retimed.
- Recipient: no new calendar-client or inbox acceptance is claimed.

The earlier bounded primary-calendar audit found no additional future
Scheduler Zoom events needing repair. That audit did not read the private
Scheduler booking inventory, so it is not a complete internal booking audit.
