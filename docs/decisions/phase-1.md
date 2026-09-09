# Phase 1 decisions

Confirmed by Alonso on September 9, 2026. The source research is retained in ../research/.

- Single owner; canonical URL https://scheduler.dustwave.xyz/alonso.
- Short introduction, then meeting-type choices. Owner sets Meet or Zoom per video type.
- In-person guests choose owner-defined locations; locations have their own available days/hours.
- Owner chooses blocking Google and directly connected iCloud calendars. Proton via Google is accepted for phase 1, including subscription delay.
- New events go to the main Google calendar automatically, with attendee invitations. No host approval queue.
- Weekly hours, recurring blackouts, temporary full/partial-day blackouts, minimum notice (24 elapsed hours), 30-day horizon, and separate gaps for video/in-person.
- Booker cancellation/rescheduling until 24 elapsed hours before the start; server enforcement.
- Small private web dashboard. English/Spanish. Pool/Store warmth with system light/dark.
- Turnstile spam protection without email verification for bookers.
- Jekyll, Cloudflare, Resend, GitHub; pinned Dust Wave shared packages.

## Editable initial defaults

No response was received for exact gaps: start at 15 minutes for video and 30 minutes for in-person. Use the larger applicable gap between adjacent scheduler bookings; do not add two ordinary gaps. Existing external events receive the candidate meeting's gap.

Initial types: 30-minute Google Meet, 30-minute Zoom, 60-minute in-person. Proposed weekly hours: weekdays 09:00–17:00 America/Denver. One email reminder 24 hours before the meeting. No daily cap. In-person types remain unavailable until a real location is configured. All booking remains paused until required connections and working hours are reviewed in the dashboard.

These defaults are assumptions, not confirmed personal availability. They are editable without a Jekyll rebuild.

## Phase 2 boundary

Dust Wave/Volver profiles share the same owner's collision boundary. Prices may be pay-what-you-can, including zero. Direct Proton read/write/invitations require the separate research milestone. Phase 1 does not implement charging, profiles in the public flow, or a Proton bridge.
