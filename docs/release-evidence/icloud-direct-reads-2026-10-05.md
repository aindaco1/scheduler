# iCloud confirmation follow-up — October 5, 2026

## Reproduction

The owner reported the same booking error after 1.0.5. The supplied console
capture contains a real HTTP 503 from `/api/bookings`; Turnstile iframe warnings
do not explain this backend failure. Production diagnostics at 18:31 and 18:51
UTC identify `icloud_unavailable`, `http_error`, upstream status 503. Those
requests finished in roughly 0.5–1.9 seconds and did not retry.

A private Wrangler remote preview used the existing production Durable Object
binding for read-only diagnosis. It created no reservation, provider event or
email. Its outputs contained only result counts, elapsed time and fixed HTTP
classifications, never credentials, calendar URLs, event contents or guest data.
The preview had no deployed public route.

The exact confirmation read window was October 5 at 19:30 UTC through October 7
at 20:30 UTC, matching the reported October 6 meeting with the coordinator's
one-day conflict margins. The deployed coordinator succeeded once, confirming
the intermittent nature of the failure. A cold adapter reproduction then
failed on the calendar-home PROPFIND with HTTP 503 and `Retry-After: 3600`.
The existing retry correctly declined to repeat that request after 500 ms.

The candidate adapter queried the already selected calendar directly. Two
fresh REPORTs returned HTTP 207, each with five busy intervals, in 330 and
523 ms inside the preview. This establishes a functioning selected calendar
despite the account-wide discovery failure; it does not prove Apple's internal
reason for the 503 or actual invitation delivery.

## Change and regression coverage

Conflict reads use the pinned tsdav authenticated REPORT implementation with
the saved collection URL. Discovery remains in the owner's calendar picker,
where it is needed. Availability, confirmation, rescheduling and durable jobs
share the same adapter. Busy/Free parsing, recurrence handling, URL validation,
timeouts, size limits, complete-response checks and reservation ordering remain
in force. Recovery rereads all selected calendars; no partial/stale result can
authorize a booking.

New cases cover discovery failure with a one-hour Retry-After followed by a
successful selected-calendar read, authenticated REPORT bounds for the exact
confirmation window, deletion, unsafe selected URLs and redirects. A fixture
also exposed tsdav silently discarding valid XML when Content-Type is missing
or non-XML; the adapter now normalizes that header only after strict XML
validation. Three header regressions retain the actual busy intervals.
Existing provider,
conflict, persistent-failure and concurrent-reservation tests run through the
direct REPORT fixtures.

## Verification

- Local: final `npm run check` passed all deterministic stages, including 251
  Worker tests in 19 files, package/type checks, build, 327 paired messages,
  fork setup, browser/accessibility flows, 40 admin and 84 public responsive
  cases, and dry deployment. Live Jev exited incomplete after one request;
  the local Wrangler login lacks Workers AI write permission. No evaluation
  policy or approval was changed.
- CI: source `8c460fd9bfd88826d65a99b2acd7ee0c9b174251` passed
  [trusted-main CI](https://github.com/aindaco1/scheduler/actions/runs/37361236381)
  on Node 24 / Ruby 3.3. All 251 Worker checks and dependency audits passed.
  Live Jev completed with 40 correct controls, 33 rendered passes, the existing
  approved exact-copy review and zero blocking findings.
- Deployment: Worker `a853514c-9a80-4eeb-a1bf-1ad3d888977b`, 100% traffic
  at 19:12:44 UTC. Public settings fingerprint, credential binding names and
  Durable Object namespace matched the preceding deployment. All eleven
  route/private-boundary checks and nine compiled asset hashes passed.
- Provider: three uncached reads through the deployed coordinator checked both
  Google and iCloud for the exact reported confirmation window. All returned
  successfully at 19:13:06–19:13:07 UTC; elapsed times inside the diagnostic
  preview were 742, 386 and 409 ms. Each also applied the real booking policy
  with fresh local reservations and confirmed the requested time was permitted
  with an unchanged settings revision. No reservation or write job was created.
  Ten public availability reads across two windows and every active type/place
  also returned 200. Production warning/error logs were empty from deployment
  through the verification sweep. These checks do not reserve or hold the time.
- Recipient: no live booking/invitation sent or inbox receipt asserted.
- Cleanup: the private remote diagnostic preview was stopped after verification.
  No production diagnostic endpoint or credentials were committed.
- Rollback: `c463e769-62c6-4523-b5be-8d7dd4f52b07` retains compatible
  credentials/storage but restores the unnecessary discovery dependency.
