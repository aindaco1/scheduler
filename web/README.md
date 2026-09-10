# Browser implementation

Jekyll emits one localized shell for each public, management, and admin route.
`booking.ts`, `manage.ts`, and `admin.ts` own their page state. `slots.ts` is the
shared availability picker; `common.ts` owns localized formatting, escaped HTML,
branding, appearances, Turnstile, and the shared API client adapter.

The browser uses the server's availability and booking decisions. It never
creates calendar events directly. Management credentials remain in the URL
fragment and use a bearer header for reads, including rescheduling availability.
Guest names, email addresses, topics, and management credentials are never put in
browser storage. Only appearance and the last admin tab are stored as browser preferences.

The pinned Dust Wave admin-shell supplies API requests, accessible responsive
tabs, dirty-button state, unsaved-change guards, and Turnstile sizing. The local
declarations describe the inspected exports; they add no second implementation.
The stylesheet imports the shared layout/stack mixins and keeps all scheduler
tokens and composition local. The package's current Sass integration uses its
documented import contract and emits Sass's upstream deprecation notice.

## Verification

```sh
npm run build
npx playwright install chromium
node web/tests/browser.mjs
```

The browser test serves `_site` locally and intercepts every API and Turnstile
request. It exercises public booking, in-person location selection, rescheduling,
the change cutoff, terminal failure recovery, language navigation retaining the
selected meeting/time, admin optimistic settings saves, and the iCloud credential
form. It runs axe WCAG scans across the main flows, English/Spanish, light/dark,
desktop/mobile, checks narrow-screen overflow, and checks that private guest
details do not enter localStorage. Fixture screenshots are written under
`work/frontend/` for visual inspection.

These checks verify the browser against the API contract. They do not verify
live OAuth, Turnstile provider acceptance, calendar synchronization, invitations,
or recipient email delivery. Those are tracked in the project status document.
