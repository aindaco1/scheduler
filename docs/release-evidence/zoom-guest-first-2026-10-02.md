# Zoom guest-first live acceptance — October 2, 2026

## Result

**Passed for a newly booked Brief chat on the reconnected owner deployment.**
A signed-out guest entered the actual Zoom meeting before the host. The Zoom
Web App showed **Participants (1)**, only **Scheduler guest test (Me)**, and a
**Claim Host** control. No host started or joined the meeting.

## Authorized procedure

The owner requested the live test, approved the first available slot and supplied
their own email as the test recipient. The temporary 30-minute booking used
October 5 at 2:15 p.m. America/Denver. Joining was tested immediately on October 2,
before the scheduled date. No unrelated recipient was invited.

1. Submitted the normal public **Brief chat** booking form, with a synthetic
   guest name and a note identifying it as a temporary test. Scheduler reached
   **Confirmed / You’re booked** and supplied a passcode-bearing participant link.
2. Opened the corresponding meeting in the authenticated Zoom portal. Its
   meeting ID and embedded passcode matched the Scheduler joining link. The
   saved time was October 5 at 2:15 p.m. Mountain time. Read the edit form without
   saving: Passcode was checked; Waiting Room and Require authentication to join
   were unchecked. The detail page said **Allow participants to join anytime**.
3. Signed out of Zoom in the test browser; the native Zoom app remained at Home.
   Opened the participant link, chose **Join from browser**, and entered the
   synthetic guest name. Camera and microphone access were declined. The owner
   explicitly approved the Join button's terms acceptance before it was clicked.
4. Entered the meeting. The participant panel confirmed one guest, no host and
   the available Claim Host control. No waiting-room admission or host-start
   action was required. The browser still required the guest's normal **Join**
   click; this does not imply that preview screens are bypassed.
5. Read the corresponding Google event. It was confirmed at the expected
   14:15–14:45 local time, with its Zoom URL in both Location and Description.
6. Left the Zoom call and confirmed the signed-out landing screen. Cancelled
   through Scheduler's private booking page and confirmed **Booking cancelled**.
   Google read-back returned `status: cancelled`. Reopening the Zoom browser
   link returned **This meeting link is invalid (3,001)**, confirming cleanup.

## Evidence and limits

- Local: no functional source change and no new automated test run for this live
  acceptance. Earlier deterministic checks are recorded separately in
  [OAuth recovery](zoom-oauth-recovery-2026-10-02.md).
- CI: no new run.
- Deployed: exercised the existing live deployment. No code, credentials, global
  meeting settings, preview preferences or scheduling rules changed in this test.
- Provider: actual creation, saved joining settings, correct local start time,
  guest-first entry, Calendar cancellation and invalidated Zoom link verified.
- Recipient/client: the owner-designated address was used for the normal booking
  and cancellation notifications. Inbox receipt/rendering was not inspected.
  Entry was verified in the signed-out Zoom Web App, without media access; audio,
  video, a second participant and the native guest app were not tested.
- Historical incident: this new booking does not establish what happened to the
  earlier 12:30 meeting or change its settings. Its ownership and original
  admission failure remain unresolved.

Ignored local screenshots under `work/zoom-guest-first/` record the prepared Join
screen, the guest-only participant panel, Scheduler cancellation and Zoom's
invalid-link response. No real joining URLs, meeting IDs, passcodes, management
tokens, personal email addresses or calendar contents are retained in this file.
