# Proton integration: knowledge captured from Protoxide

Research date: September 9, 2026. Phase 2 research; no Proton credentials were entered, bridge executed, or calendar events created.

**Decision:** preserve Protoxide as a pinned protocol and implementation reference. Keep direct Proton support behind a separate feasibility milestone. Phase 1 continues to use the Proton calendar visible through Google.

Reviewed [Protoxide](https://github.com/mathewcsims/protoxide) at commit `f332c8bf873d2cfa4314d4f155d1acc2b3af0e42` (July 25, 2026). Its [MIT license](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/LICENSE) retains credits for Hydroxide, Ferroxide, and Protoxide. Any copied implementation must preserve the applicable notices. This review used the README and direct source inspection; it is not an integration test or a complete security audit.

## What this gives us

Protoxide is a Go service that uses Proton's internal API, decrypts calendar data, and exposes local CalDAV. Its author reports read/create/edit/delete behavior tested against their own account. It does not implement CalDAV invitation scheduling, and attendee data does not yet round-trip through Proton's encrypted attendee cards. Those omissions directly affect our automatic-invitation requirement. [Upstream status and limitations](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/README.md)

The project is useful because it exposes the details a simple HTTP calendar adapter would otherwise miss: calendar-specific key selection, partitioned encrypted event content, stable event identity, sequence numbers, pagination, incremental synchronization, and cache races. Its current Go process and disk-cache design cannot be imported directly into a Cloudflare Worker. A Worker-native implementation would be a port and a new validation effort; a bridge would introduce a continuously available additional runtime. [Runtime dependencies](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/go.mod)

## Source map and lessons to retain

| Concern | Source evidence | Application to our scheduler |
|---|---|---|
| Calendar discovery and keys | `protonmail/calendar.go`: `ListCalendars`, `BootstrapCalendar`, `DecryptKeyring`, `CalendarEventCard.Read` | Discover calendars and permissions explicitly. Decrypt through the correct calendar/member keys; treat encrypted-only and encrypted-plus-signed card types distinctly. |
| Event identity | `caldav/caldav.go`: `objectToken`, `safeSegment`, `PutCalendarObject`, `DeleteCalendarObject`; `caldav/cache.go`: `findByToken` | Preserve a mapping between booking ID, iCalendar UID/recurrence identity, and provider event ID. A client UID is not a Proton event ID. Incorrect mapping can turn an update into another creation. |
| Update sequence and signing identity | `protonmail/calendar.go`: `eventSequence`, `makeUpdateData`, `entityForEmail` | Preserve the UID, increase `SEQUENCE` for updates, and serialize it as an integer property. Choose the signing identity associated with the destination calendar's member address. This matters for Dust Wave/Volver profiles. |
| Mutation isolation | `caldav/caldav.go`: `PutCalendarObject`, `cloneCalendar`; `protonmail/calendar.go`: `getEventParts` | Encryption partitions mutate the input event. Isolate that work from the canonical booking and cached event. Return an error if cloning fails; Protoxide's fallback returns the original object. |
| Creation and per-entry results | `protonmail/calendar.go`: `UpdateCalendarEvent` | The implementation distinguishes a specific invalid-ID response from other read errors before creating, then inspects the nested sync result. Preserve that distinction. An envelope response alone does not prove a successful calendar write. |
| Full calendar reads | `protonmail/calendar.go`: `ListAllCalendarEvents` | Paginate and deduplicate. Its implementation uses pages of 100 and a 200-page cap. Our adapter must report incomplete results when it hits a cap or an unexplained repeating page instead of returning partial availability as complete. |
| Incremental synchronization | `caldav/poller.go`; `protonmail/calendar.go`: model-event methods | The internal model-event API has cursors, `More`, and `Refresh` signals. Drain pages, handle deletions, and perform a fresh snapshot after an invalid cursor. Polling frequency is a provider constraint to verify, not a promise of instant availability. |
| Concurrent refresh and writes | `caldav/cache.go`: `loadCache`, `cacheStore`, `cacheDelete`, `applyRecentLocked` | A full refresh can replace changes made while it was running. Protoxide overlays recent writes/deletes for six minutes. Retain the race lesson, but use acknowledged versions or a durable mutation record rather than assuming a fixed interval is always sufficient. |

Pinned sources: [calendar protocol implementation](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/protonmail/calendar.go), [CalDAV adapter](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/caldav.go), [cache](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/cache.go), [poller](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/poller.go).

## Behaviors that need different treatment for booking

**Incomplete conflict data must close availability.** In `loadCache`, failed event conversion is logged and skipped; the final cache is still marked loaded. In `pollCalendar`, the cursor advances after `applyModelEvents`, even though that method can skip failed fetches or decryptions without returning an error. Both can leave a booking engine unaware of a conflict. Our adapter must report completeness, freshness, and connection health. Commit applied changes and their cursor together; retry failures or require a complete resync. Do not announce an empty calendar when access, decryption, or synchronization fails. [Cache](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/cache.go), [poller](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/poller.go)

**An event object is not an invitation lifecycle.** `toIcalCalendar` leaves attendee/personal event cards unfinished; the write payload also leaves attendee-related parts unfinished. The scheduler requires actual guest invitations, subsequent time/location updates, cancellation notices, and a stable organizer. A separate email with an ICS attachment does not establish correct Proton attendee state. Reusing Resend transport would still leave invitation semantics and organizer authorization to implement. [Read/write adapter](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/caldav.go), [write payload](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/protonmail/calendar.go)

**Existing verification exceptions are not defaults for the new integration.** Calendar passphrase signature verification is commented out, and the read path logs a signature error while continuing to serve the event. A further read-path verification block is commented out, but the function already consumes `UnverifiedBody` through `io.ReadAll`; this review does not establish that all cryptographic integrity checking is absent. Before adoption, trace the current crypto library's verification behavior and resolve these cases explicitly. Also replace silent signing-key fallback with a clear identity error. [Calendar key/signing code](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/protonmail/calendar.go), [event-card read path](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/caldav.go)

**Session refresh exists, but unattended reliability is unproven.** `auth.authenticate` tries existing authorization, then refresh, and in one error case attempts login again; two-factor/human verification can require intervention. The issue is reliable long-lived operation, not an entirely missing refresh function. Connection health must be visible in the dashboard and must affect availability. Do not carry login passwords or tokens into public configuration, browser storage, or logs. [Authentication implementation](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/auth/auth.go)

**Recurrence and concurrent edits still need independent proof.** `objectInRange` conservatively includes recurring events; it is a transfer filter, not a busy-interval recurrence engine. Use the scheduler's tested iCalendar normalization. The adapter's PUT function has a TODO for conditional options and expects exactly one VEVENT. Verify ETag/conditional behavior through the full server path, recurring overrides, and edits made simultaneously in Proton before claiming parity. [Range filter](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/cache.go), [PUT implementation](https://github.com/mathewcsims/protoxide/blob/f332c8bf873d2cfa4314d4f155d1acc2b3af0e42/caldav/caldav.go)

## Small integration boundary

Keep these provider operations local to the scheduler initially:

- Discover calendars and capabilities, including readable/writable status and supported invitation behavior.
- Read busy intervals for a bounded range, with fetched-at time, completeness, and explicit failures.
- Create, update, or cancel an event using a stable operation ID and explicit organizer/calendar.
- Report connection health and reconcile uncertain writes without creating duplicates.

The scheduler owns working hours, blackouts, gaps, notice, profiles, reservations, pricing, and reminders. Providers do not each implement a second scheduling engine. Calendar content used for conflict checks stays private; the public API exposes available slots only.

One person remains the collision boundary across all profiles. Switching from Google to Proton for a work profile changes the destination and organizer capabilities, not that ownership rule. Branded sender copy cannot substitute for a provider-authorized organizer address.

If a bridge is needed, prefer an authenticated, narrowly scoped service boundary that returns normalized busy data and performs explicit event operations. Do not expose Protoxide's local HTTP/Basic-auth listener directly to the internet. Its current cache stores decrypted event content on disk; a deployment decision must account for where decryption and credential custody occur. A local Mac that sleeps is not a continuously available scheduler backend. These are architecture choices for the phase 2 spike, not new infrastructure being deployed now.

## Phase 2 feasibility milestone

1. Recheck Proton's official integration options. Its [native appointment scheduling](https://proton.me/support/calendar-appointment-scheduling) is a useful feature reference but does not establish a documented third-party Calendar write API.
2. In a designated test calendar, prove complete conflict reads: shared calendars, encrypted event variants, all-day events, transparency/free status, recurrence exceptions, timezones, and DST.
3. Prove create → read-back → update → cancel against the actual Proton UI, preserving UID/provider identity and the intended work organizer.
4. With owner-designated test recipients, prove receipt and calendar interpretation of initial, updated, and cancelled invitations. Include an external non-Proton recipient. Event existence alone does not pass this step.
5. Exercise revoked/expired sessions, interrupted writes, duplicate retries, cold starts, pagination boundaries, failed event decryption, stale cursors, and concurrent refresh/write/edit cases. Establish a freshness threshold and stop offering affected slots when it is exceeded.
6. Resolve verification and credential-storage behavior and choose the runtime. Then decide whether to adopt a maintained bridge, contribute fixes upstream, port a limited adapter, or retain the Google subscription fallback.

Profiles and pay-what-you-can can ship independently of this milestone. Direct Proton support is complete only when conflict checking, automatic booking, and invitations all work reliably.
