# Phase 1 decisions

Confirmed by Alonso on September 9, 2026. The source research is retained in ../research/.

- Single owner; canonical URL https://scheduler.dustwave.xyz/alonso.
- Short introduction, then meeting-type choices. Owner sets Meet or Zoom per video type.
- In-person guests choose owner-defined locations; locations have their own available days/hours.
- Owner chooses blocking Google and directly connected iCloud calendars. Proton via Google is accepted for phase 1, including subscription delay.
- Respect each selected calendar event's Busy/Free setting, including all-day Family events. Free/transparent events do not block bookings.
- New events go to the main Google calendar automatically, with attendee invitations. No host approval queue.
- Weekly hours, recurring blackouts, temporary full/partial-day blackouts, minimum notice (24 elapsed hours), 30-day horizon, and separate gaps for video/in-person.
- Booker cancellation/rescheduling until 24 elapsed hours before the start; server enforcement.
- Owners can include an optional message when cancelling or rescheduling from the dashboard. It is sent in the guest’s corresponding email after the calendar change succeeds, and is not repeated in reminders.
- Small private web dashboard. English/Spanish. Pool/Store warmth with system light/dark.
- Turnstile spam protection without email verification for bookers.
- Jekyll, Cloudflare, Resend, GitHub; pinned Dust Wave shared packages.
- Weekly availability: Monday–Friday 09:00–16:00 and 20:30–22:00, America/Denver. Video gap: 15 minutes. In-person gap: 30 minutes.
- In-person locations: Dust Wave Studio (709 Haines Ave NW, Albuquerque, NM 87102), Slow Burn Coffee (Wells Park), and Bow & Arrow (Albuquerque beerhall). Intersect the owner's hours with each location's hours; see [location sources](../research/location-hours.md).

## Editable initial defaults

Use the larger applicable gap between adjacent scheduler bookings; do not add two ordinary gaps. Existing external events receive the candidate meeting's gap.

Initial types: 30-minute Google Meet, 30-minute Zoom, 60-minute in-person. One email reminder 24 hours before the meeting. No daily cap. Launch connections, hours and locations are configured, and bookings are open; new forks start paused until setup is complete.

Meeting durations, reminder timing, and the absence of a daily cap remain editable initial assumptions. Hours, locations, and gaps above were explicitly confirmed. All settings are editable without a Jekyll rebuild.

## Phase 2 boundary

Dust Wave/Volver profiles share the same owner's collision boundary. Prices may be pay-what-you-can, including zero. Direct Proton read/write/invitations require the separate research milestone. Phase 1 does not implement charging, profiles in the public flow, or a Proton bridge.
