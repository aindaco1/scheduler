# Zoom joining policy and second calendar repair — September 25, 2026

## Owner request and implementation

The owner requested joining before the host with no waiting room after being
unable to start a scheduled call. New Scheduler-created Zoom meetings now set
`waiting_room: false`, `join_before_host: true`, and `jbh_time: 0` (anytime).
The existing meeting identity and uncertain-write recovery remain unchanged.
Rescheduling retains existing provider options; deployment is not a bulk rewrite.

The [Zoom API contract](https://developers.zoom.us/docs/api/meetings/) documents
the three joining settings. No account-wide Zoom settings were changed.

## Existing meetings and calendar investigation

- The earlier reported meeting's provider details now show joining anytime, with
  its waiting room disabled. Its existing meeting ID and link were retained.
- The later reported Google event had an empty Location and only whitespace in
  its description. Its Zoom meeting's Scheduler reference matched the original
  Google event identity. The original provider joining URL was restored to both
  fields. A fresh Google read confirmed both copies, unchanged title and times,
  and an unchanged attendee list. No replacement event or meeting was created.
- The later Zoom meeting still had its waiting room on and join-before-host off.
  Zoom rejected the requested update because the meeting was in progress. A
  reload confirmed that the change had not persisted. The active call was left
  intact; no host-free admission claim is made for that meeting.
- The earlier link-protection deployment repairs during creation, recovery, or
  rescheduling; it does not revisit all already-confirmed events. Thus the second
  missing link does not establish a regression in the newly deployed protection.
  There is no event-version history proving how either original link disappeared.
- Zoom's saved scheduled time also disagreed with the Google event. Its page
  exposed a seven-hour shift for the later meeting. No time was changed during
  the active call. The source sends an ISO UTC timestamp with milliseconds plus
  a timezone; Zoom documents a seconds-resolution UTC format. This is a candidate
  cause at this stage, not a verified provider reproduction. The subsequent
  [timestamp investigation and correction](zoom-timestamp-2026-09-25.md) records
  the source defect, supporting Zoom evidence, tests and deployment separately.

No guest names, addresses, event IDs, real joining links, or credentials are
included in this record. Calendar read-back does not prove recipient client
sync or inbox delivery, and no separate email was sent.

## Verification

- Local: `npm run check` passed all 207 Worker tests, including the new Zoom
  joining-policy regression, 11 Jev gate regressions, type checks, quality/fork
  checks, browser/accessibility flows, 40 admin and 84 public responsive cases,
  and Wrangler dry deployment. Live Jev completed with all 40 controls correct,
  33 rendered passes, the existing exact-copy approved review, and no blocking
  findings. No policy or approval was loosened.
- CI: not run for this change.
- Deployment: Worker `7310f571-928c-4f05-a534-ca0a2d726d7d` was deployed at
  18:41 UTC and confirmed at 100% traffic. Health and eight localized shells
  returned 200, unauthenticated admin settings returned 401, all nine compiled
  assets matched local SHA-256 hashes, and public config remained enabled/ready.
  The tested working tree was based on `e208692`; the deployed Zoom adapter SHA-256
  was `5b6a6f3f2105722f1556a4d8aa0f0cb9fa4bb3a16f8b4068e100293081f801c6`.
  Rollback version: `b6cbf295-0a79-4b67-901f-bdbc549b9eb3`. No provider connection,
  account-wide setting, secret, or schema was changed by deployment.
- Actual provider: the earlier Zoom settings and later Google event repair were
  read back as described above. No new application booking or test invitation
  was created. Host-free admission for a newly created meeting remains untested.
- Recipient: calendar-client refresh and guest receipt were not independently
  verified.
