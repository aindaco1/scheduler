# Zoom joining investigation — October 2, 2026

After OAuth recovery, a separate owner-authorized new booking passed actual
guest-first entry in the signed-out Zoom Web App. Zoom's saved settings allowed
joining anytime, with passcode security and no waiting room. The test booking
was cancelled and provider cleanup verified. See [live acceptance](../release-evidence/zoom-guest-first-2026-10-02.md).
This does not identify the cause of the original 12:30 incident below.

## Open investigation: preview is not proof of joining

The owner reported that opening a scheduled meeting link launched Zoom without
entering the meeting immediately. They subsequently identified the intervening
screen as the camera/audio preview with a Join button. They then clarified that
the call does not start, they do not enter it, and the guest cannot join either.
The earlier conclusion that this was only a preview preference was premature.

Direct inspection of Zoom Workplace 7.2.2 (88465) on the owner's Mac found
**Settings → Meetings & webinars → Join experience → Show video preview first**
enabled. Turning off that local preference is the relevant way to skip the
preview. This investigation left it unchanged and left the settings pane open.
The preference explains the preview screen, but does not establish the cause of
the unsuccessful host and guest joining. The incident remains unresolved pending
the outcome after clicking Join and verification of the actual meeting's host
account and saved admission settings.

The desktop app's signed-in account was inspected. The reported meeting was
not found in the web portal's visible hosted-meeting lists, and opening its
meeting-detail route in that session returned an invalid-meeting-ID error.
Those observations do not establish the meeting's owner or prove that its
participant link is invalid. An account mismatch remains a hypothesis.
Scheduler's dashboard session had expired, and the Zoom connector required
reauthentication. At this initial stage, no account had been switched or reconnected. No attempt
was made to join, start, end, or modify a live meeting.

Further read-only account inspection confirmed that the Zoom Marketplace browser
session matched the desktop account. Its My library table showed two authorized
published integrations (Zoom for ChatGPT & Codex and Proton Calendar), with no
Scheduler entry. Its developer Created apps page was empty. These observations
support checking for a different connected account, but do not identify the
OAuth user stored by the production Scheduler. The application currently exposes
only a Zoom connected boolean; unlike Google, it does not store or display the
connected user's email. No connection had changed at that stage.

## Reconnect failure and missing app

The owner subsequently reported that **Reconnect Zoom** led to
`https://marketplace.zoom.us/error`. After the dashboard session was available,
the same route was reproduced: Zoom displayed a generic error before presenting
an authorization screen. Scheduler still displayed its saved connection as
connected. That badge proves only that a connection record exists; it is not
evidence of the current OAuth account or a valid grant.

The owner's supplied Marketplace **Apps on account → Created apps** page showed
**Created apps (0)** and an empty OAuth-app table. The owner also reported that
the original app appeared to be gone. This is consistent with a missing app or
an app belonging to another account; no deletion record or provider error code
was obtained, so deletion is not confirmed. Browser automation was subsequently
blocked on the current browser URL, preventing further inspection there.

A read-only production `wrangler secret list` confirmed that `ZOOM_CLIENT_ID`
and `ZOOM_CLIENT_SECRET` bindings still exist. Their values were not printed or
changed. The documentation records development credentials and local-test
distribution, but does not retain the original app identifier or creator's
account. At that point no replacement app, grant, credential change or deployment
had been performed. The recovery procedure is in
[Operations](../OPERATIONS.md#zoom-reconnection-and-app-replacement).

After the owner signed into a dedicated Codex browser tab, inspection resumed
successfully. The developer portal's unfiltered **Created apps** list was empty,
and **API Call Logs** showed no data for its stated 30-day retention window.
The account domain was verified as the owner's intended Zoom account; no private
email address is retained here. Selecting **Build app** displayed Zoom's API
License and Terms of Use before app creation. The owner accepted the agreement
directly. The prompt itself does not prove whether a previous app was deleted.

A replacement **Scheduler** General app was then created in that account. It is
user-managed, uses development/local-test distribution, and requests the six
scopes in the [fork guide](../FORKING.md#zoom-for-your-own-scheduler). Its redirect
and allow-list URL are both
`https://scheduler.dustwave.xyz/api/admin/callback/zoom`, with strict matching.
Zoom reported it ready for local testing. After a private credential handoff,
only the two Zoom credential bindings were staged in version
`47c125f9-aa61-4e58-b826-4840f09d65cd`. Its script hash and Durable Object namespace
matched the previous live version. Once the owner signed into admin, new bookings
were paused and the staged version was deployed at 100% traffic.

Reconnect then reached Zoom consent. The owner completed authorization directly,
and Scheduler returned with `connected=zoom`. Verify connections completed
successfully. Active was restored and saved, with **Ready to book** displayed.
The new app's name and icon also now match Scheduler's current branding in both
light and dark mode. This confirms recovery of the current authorization path;
it does not establish why the original app could not be found or which account
owned its earlier grant. See the separate
[recovery evidence](../release-evidence/zoom-oauth-recovery-2026-10-02.md).

The original meeting's ownership and admission settings remain unverified.
Repairing OAuth alone would not establish that the reported meeting can be
started or joined, and must not silently replace the original meeting or
redistribute invitations.

## Scheduler findings and limits

The current source requests `waiting_room: false`, `join_before_host: true` and
`jbh_time: 0` for new meetings. Existing meetings retain their settings, including
when rescheduled. The September 25 changes and their acceptance limits remain
documented in the [joining-policy evidence](../release-evidence/zoom-joining-policy-2026-09-25.md).

The adapter supplies no explicit passcode and checks only the returned meeting
ID and joining URL. It does not inspect effective meeting security or joining
settings. Zoom's [security rules](https://developers.zoom.us/docs/api/references/meeting-api-security-enhancements/)
allow the provider to enable a waiting room when no other required security
option applies. [Automatic passcode generation](https://developers.zoom.us/docs/api/meetings/)
also depends on the user's passcode settings. This is a separate source-level
reliability gap, not the diagnosis of the reported preview screen. The reported
event already contains a joining URL with an embedded passcode.

Calendar invitations and booking emails use Zoom's participant `join_url`, not
the host-only `start_url`. Zoom [documents](https://developers.zoom.us/docs/api/meetings/)
that the latter carries host access and normally expires after two hours; it
must not be substituted into guest invitations. Host recognition, waiting-room
admission and the local preview are distinct behaviors.

Google read-back found the original event's Location empty while its description
retained the Zoom link. No cause for the missing field was established, and no
calendar repair was performed. The native Zoom calendar recognized that link.
The original meeting's Zoom admission settings were not retrieved. The later
controlled booking did honor Scheduler's joining defaults, as recorded in the
live acceptance above; it does not establish the original meeting's settings.

No meeting IDs, real joining URLs, passcodes, guest details or calendar contents
are retained here. [Status](../STATUS.md#zoom-pre-join-preview-investigation--october-2)
records local tests, deployment read-back and provider/recipient limits separately.
