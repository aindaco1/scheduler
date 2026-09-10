# Phase 1 decisions

Confirmed by Alonso on September 9, 2026. The source research is retained in ../research/.

- Single owner; canonical URL https://scheduler.dustwave.xyz/alonso.
- Short introduction, then meeting-type choices. Owner sets Meet or Zoom per video type.
- Booking and guest rescheduling browse calendar weeks starting on Monday in the visitor's selected time zone. Labels show Monday-to-Monday boundaries (for example, Sep 7–Sep 14); the following Monday belongs to the next page. Past times, minimum notice and the booking horizon still restrict selectable slots.
- In-person guests choose owner-defined locations; locations have their own available days/hours. Full street address and optional arrival instructions are separate fields. Calendar Location contains the venue and full address; the description has separate Guest note and Arrival instructions sections. Instructions appear in confirmation/reschedule/reminder emails and the private booking summary, are not published in anonymous configuration, and never overwrite the guest’s Anything to share beforehand? note. Bookings snapshot the selected location details; existing stored bookings remain unchanged.
- Owner chooses blocking Google and directly connected iCloud calendars. Proton via Google is accepted for phase 1, including subscription delay.
- Respect each selected calendar event's Busy/Free setting, including all-day Family events. Free/transparent events do not block bookings.
- New events go to the main Google calendar automatically, with attendee invitations. No host approval queue.
- Weekly hours, recurring blackouts, temporary full/partial-day blackouts, configurable minimum notice (24 elapsed hours by default), configurable booking horizon (30 days by default), and separate gaps for video/in-person. Temporary blackouts can apply to all meetings or only in-person meetings, including whole-day travel blocks that leave video availability open.
- Booker cancellation/rescheduling uses the configured change deadline (24 elapsed hours before the start by default); server enforcement.
- Owners can include an optional message when cancelling or rescheduling from the dashboard. It is sent in the guest’s corresponding email after the calendar change succeeds, and is not repeated in reminders.
- Small private web dashboard. English with optional Spanish (enabled by default). Pool/Store warmth with system light/dark.
- Settings orders Your booking page, Booking boundaries, Reminders, Automatic blackouts, then Calendar connections. Booking boundaries includes minimum notice, booking horizon, guest change deadline, daily cap and default video/in-person gaps. Meeting types inherit the applicable default unless their editable Gap (minutes) field is changed. The field starts with the applicable default and sits in the left desktop column. Entering the current default restores inheritance; there is no default checkbox. Explicit overrides include zero. Meeting types use the label Active. Saved values govern public availability, bookings and rescheduling, including the public week picker and applicable policy copy.
- Spanish can be switched on/off in Your booking page. Turning it off hides Spanish editors, expands English content fields to full width, hides the site language switch, redirects Spanish routes temporarily to English, and removes Spanish search alternates/sitemap entries. Translations are retained for re-enabling. New bookings use English while disabled; existing bookings retain their recorded email language.
- Brand name is editable in Your booking page, separate from the owner display name. `BRAND_NAME` supplies its initial value for new installations and legacy settings. Saved branding is rendered in the initial HTML for all pages, including Privacy, and updates site-name metadata without a build. An uploaded logo replaces the visible text; removing it restores the saved Brand name.
- Branding uses a PNG/JPEG upload with preview, a 1 MB maximum, recommended dimensions of 512 × 512 pixels and a 2048 × 2048 maximum. Uploads publish with Save changes; existing hosted logos remain supported. Desktop places upload/help beside the preview and remove action; mobile stacks the groups. The connected Google account address is separate from booking instructions, below its connection status.
- Owners can set up to three distinct email reminder times, 1–168 hours before a meeting. An empty list disables reminders. The schedule applies to new and rescheduled meetings; already queued reminders keep their timing and delivery IDs.
- Admin remembers its selected section across refreshes and language changes in the same browser tab. The shared tab component stores only the section name in session storage; blocked storage falls back to normal tab navigation. The homepage has one meeting-choice heading: Choose a meeting / Elige una reunión.
- Blackouts, hours and other local settings can be saved during calendar outages. Opening bookings or changing calendar dependencies requires live verification; availability, booking and rescheduling always require successful conflict checks.
- Whole-day blackouts accept an inclusive From/Through date range, stored as one period from midnight on the first date through midnight after the final date. Use the same date for one day. Blackout dates and edits use the schedule time zone, including while the owner travels.
- Settings includes an optional **Block U.S. federal holidays** checkbox, off by default. When enabled, all meeting types are blocked on the 11 annual nationwide holidays and their standard observed weekdays in the schedule time zone. Existing bookings remain in place; the rule governs new bookings and rescheduling.
- Turnstile spam protection without email verification for bookers.
- Jekyll, Cloudflare, Resend, GitHub; pinned Dust Wave shared packages.
- Weekly availability: Monday–Friday 09:00–16:00 and 20:30–22:00, America/Denver. Video gap: 15 minutes. In-person gap: 30 minutes.
- In-person locations: Dust Wave Studio (709 Haines Ave NW, Albuquerque, NM 87102), Slow Burn Coffee (Wells Park), and Bow & Arrow (Albuquerque beerhall). Intersect the owner's hours with each location's hours; see [location sources](../research/location-hours.md).

## Editable initial defaults

Use the larger applicable gap between adjacent scheduler bookings; do not add two ordinary gaps. Existing external events receive the candidate meeting's gap. Settings holds video and in-person defaults (15 and 30 minutes initially); each meeting type can inherit or override. New types inherit. Confirmed bookings keep their resolved gap snapshot, including rescheduling. Legacy type gaps matching the original defaults migrate to inheritance; custom gaps stay explicit overrides.

Initial types: 30-minute Google Meet, 30-minute Zoom, 60-minute in-person. One email reminder 24 hours before the meeting. No daily cap. Launch connections, hours and locations are configured, and bookings are open; new forks start paused until setup is complete.

Meeting durations, reminder timing, and the absence of a daily cap remain editable initial assumptions. Hours, locations, and gaps above were explicitly confirmed. All settings are editable without a Jekyll rebuild.

## Phase 2 boundary

Dust Wave/Volver profiles share the same owner's collision boundary. Prices may be pay-what-you-can, including zero. Direct Proton read/write/invitations require the separate research milestone. Phase 1 does not implement charging, profiles in the public flow, or a Proton bridge.
