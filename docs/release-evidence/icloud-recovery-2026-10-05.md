# iCloud recovery — October 5, 2026

## Incident and limits

The reported in-person form showed the generic service-unavailable message after
the spam check succeeded. Read-only production investigation found booking POST
responses of 503 at 17:38:48, 17:38:57 and 17:45:42 UTC (11:38/11:45 Mountain).
The previous release logged application codes only for availability requests;
the exact booking codes and recipient identity were not retrieved.

Availability logs showed `icloud_unavailable` at 16:45 and 17:09 UTC. A direct
read reproduced `icloud_incomplete` at 17:51:36 UTC; a later complete pass at
17:53 UTC returned 28/25/1 slots for the three configured in-person locations.
This establishes an intermittent iCloud read failure, not a proved expired
credential or the exact upstream response defect. No calendar contents or guest
information were retained in this evidence.

Production initially served Worker `e9b50b30-ff94-4ca7-8529-fb3a33f9e98c` at
100% traffic. Source baseline: `cc85461a4b4930082aec940ed38e0eb7da36ea5e`.

## Change

The shared iCloud reader now permits one retry after 500 ms for a transient
failure that finishes within ten seconds. Recovery discards discovery and the
whole partial event result, then rereads every selected iCloud calendar.
Availability, booking, rescheduling, explicit verification and durable jobs use
the same reader. The retry never wraps a booking submission or external write.

Rejected credentials/access, throttling, long Retry-After instructions, unsafe
hosts/entities, size limits and slow first failures do not initiate another
logical read. Nonretryable errors from any selected calendar take precedence
over another calendar's transient failure. The browser does not stack another
iCloud retry. Persistent failure still withholds availability and reservations.

Owner guidance distinguishes rejected access from temporary failures in both
languages. Diagnostics retain only recovery outcome, operation and bounded code;
booking/rescheduling 503s now record their application classification without
guest data, calendar data, request IDs, private URLs or provider response bodies.

## Local validation

- 243 Worker tests across 19 files passed on the final runtime source.
- New regressions cover transient discovery/REPORT/transport failures, recovered
  conflicts, persistent failure, complete multi-calendar rereads, auth/throttling
  precedence, Retry-After, slow attempts, discovery reuse, concurrent reservation,
  unchanged original bookings after rejected rescheduling and private diagnostics.
- Browser regressions cover exhausted iCloud failures without another automatic
  retry, preserved picker context, and owner guidance with empty password fields.
- `npm run check` completed every deterministic stage on the final source:
  template, type, audit, package-pin and Jev-unit checks; Jekyll build; eight
  localized pages / 327 paired messages; fork setup; browser flows and axe;
  40 responsive admin and 84 responsive public cases; Wrangler dry deployment.
  Local live Jev stopped incomplete
  on its first request with no evaluated results. `wrangler whoami` reports no
  `ai:write` scope; no policy or approval was changed to bypass the gate.
- Dependency audit at 18:09 UTC: zero npm vulnerabilities and zero findings for
  all 34 locked Ruby packages. Pinned dependencies/submodules are unchanged.

## CI, deployment and live verification

Source `36a01633e44bcc143c5eefa10faab242f85f6bca` passed
[trusted-main CI](https://github.com/aindaco1/scheduler/actions/runs/37354353116),
including all 243 Worker tests, browser checks and live Jev: 40 correct controls,
33 rendered passes, the existing exact-copy approved review and zero blocking
findings. It deployed as `bedd71a5-3ba3-4859-987c-bb8b6d3753d5` at
18:17:26 UTC with 100% traffic. Secret binding names and the Durable Object
namespace were unchanged; public settings matched their pre-deployment hash.

Initial deployed verification: all eleven route/security checks and nine asset
hashes passed. Eight of ten availability reads passed, including all six
in-person reads across two date windows. The first two video availability reads
returned `icloud_unavailable` and `icloud_incomplete`; the latter exhausted its
retry. This is not complete provider acceptance. A diagnostic follow-up adds
only fixed reason labels and numeric upstream status, never response contents,
to identify the remaining failure before calling the connection repaired.

No live booking or invitation test was sent; actual recipient acceptance remains
a separate outcome. Existing credentials, owner state and selected calendars
are retained. Credential-compatible rollback: the initial Worker above.
