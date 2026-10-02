# Zoom OAuth recovery and branding — October 2, 2026

## Scope

Repair the owner's Zoom reconnect error, align the app with current Scheduler
branding, and document setup for other owners running separate installations.
No runtime source or meeting data changed. The original host/guest joining
report remains a separate [open investigation](../research/zoom-start-investigation-2026-10-02.md).

## Provider configuration and branding

The intended account's unfiltered Created apps page was empty. This is not proof
of deletion; the original creator account and provider error code were not
recovered. The owner accepted Zoom's API agreement directly before app creation.

A replacement user-managed General app, **Scheduler**, was created with the six
user scopes in the [fork guide](../FORKING.md#zoom-for-your-own-scheduler).
The redirect and allow list both use
`https://scheduler.dustwave.xyz/api/admin/callback/zoom`, with strict matching.
Public-client OAuth is disabled. The builder reported ready for Local Test.

The app icon was rendered at 512 × 512 from `assets/icon.svg` with
`_includes/scheduler-mark.svg`, preserving the current clock mark, off-white
foreground and dark rounded background. It was uploaded with **Apply this app
icon to dark mode** checked. After saving, the app detail page visibly showed
the name and matching icon. The local screenshot and generated PNG are ignored
under `work/zoom-branding/`; no credentials appear in them. They were moved to
a private recoverable archive during the 1.0.4 cleanup. Zoom branding is
separate from Scheduler's runtime branding and does not synchronize automatically.

The app remains in Development / Local Test. Its detail page's “Any user” role
label does not establish external distribution approval. Each independent
Scheduler owner provisions their own app and callback. Zoom's
[local testing](https://developers.zoom.us/docs/build-flow/local-test/) and
[publication](https://developers.zoom.us/docs/build-flow/publish/) rules distinguish
internal use from a shared app for external accounts.

## Deployment and authorization

1. The owner supplied the new client pair through a private temporary handoff.
   No secret value was printed or added to the repository.
2. `wrangler versions secret bulk` staged only `ZOOM_CLIENT_ID` and
   `ZOOM_CLIENT_SECRET` in `47c125f9-aa61-4e58-b826-4840f09d65cd`.
3. The staged version matched the previous active
   `e7a53911-e9eb-4b78-98a1-6cc1ebbf7830` script hash
   `2a96aef4b500d5571d5f1001b51923a90120b04473c9bf9859c483a2ad7e167f`
   and Durable Object namespace. No rebuilt source was deployed.
4. After admin sign-in, the visible booking list had four confirmed records and
   no visible pending, rescheduling or cancelling records. New bookings were
   paused and the saved state was confirmed before deploying the replacement
   credential version at 100% traffic.
5. Reconnect reached Zoom consent instead of `marketplace.zoom.us/error`.
   The owner completed authorization directly. Scheduler returned with
   `connected=zoom` and a saved Zoom connection.
6. **Verify connections** completed with **Ready to book**. **Active** was
   restored, saved and read back as checked with **All changes saved**.

The current connection uses the intended Volver account. The reconnect identity
guard rejects a different account when pending operations or future confirmed
bookings exist, but the visible records were not classified by future/past time.
Therefore successful reconnect alone does not prove the identity of the old
connection. The replacement token grant now belongs with the new client pair;
rolling back only Worker credentials would not restore the prior grant.

## Verification boundaries

- Local: `npm run build` and `npm run test:setup` passed. The independent fork
  fixture uses its own origin, slug, owner, brand and timezone and checks English,
  Spanish, private routes and reserved-route rejection. An initial setup run
  failed because generated `_data/build.json` was absent; the required build
  resolved it without a source change.
- Local: 85 tests passed across `audit.test.ts`, `provider-regressions.test.ts`
  and `zoom-calendar-link.test.ts`, including owner authorization, session-bound
  one-time OAuth state, Zoom refresh/disconnect races, uncertain provider writes,
  timestamps and preserved joining links. Providers are mocked in these tests.
  No functional code changed; the complete `npm run check` was not rerun.
- CI: no new run.
- Deployed: credential-only version active, reconnect successful, verification
  successful and bookings reopened. No source build deployment.
- Provider: actual OAuth consent and token verification succeeded for this owner.
  No second real owner account, new meeting creation, original meeting settings,
  or host/guest admission was verified.
- Recipient: no new booking, invitation, email, calendar or meeting write.

The client's camera/audio preview preference remains unchanged. Recovery of
OAuth does not prove the original meeting now admits either participant.

The subsequent [authorized live test](zoom-guest-first-2026-10-02.md) verified new
meeting creation and guest-first admission, then cancelled the test and confirmed
provider cleanup. The boundaries above describe the recovery stage itself.
