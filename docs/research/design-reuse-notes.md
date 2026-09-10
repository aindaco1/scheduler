# Scheduler design and shared-code reuse

Reviewed September 9, 2026. **Chosen direction: Pool/Store warmth with system light/dark.** The booking page opens with a short introduction and meeting-type choices. The owner chooses Meet or Zoom per meeting type.

Also confirmed: English and Spanish; a 30-day booking window; separate available days/hours per in-person location; Cloudflare Turnstile with no booker email-verification step.

Canonical public URL: `https://scheduler.dustwave.xyz/alonso`, now deployed. Keep it stable as profiles are added in phase 2.

The original research below is a dated design reference; the scheduler is now built. See [current status](../STATUS.md) for shipped behavior and release evidence. Review included live desktop pages for Pool, Store, Dust Wave, and the signed-out Podcast admin, plus local source. Authenticated dashboard behavior and mobile layouts were not exercised. The exact colors below come from source; a matching live deployment revision was not established.

## What to carry forward

| Reference | Observed design and behavior | Scheduler use |
|---|---|---|
| [Pool](https://pool.dustwave.xyz/) | Warm off-white page, constrained central column, clear display heading, white rounded campaign surfaces, black primary actions, generous whitespace | Primary visual base: calm intro, readable meeting descriptions, restrained selected states, consistent form spacing |
| [Store](https://shop.dustwave.xyz/) | Closely related shell and typography, compact category chips, orderly product grid, simple controls | Meeting-type choices and location options; reuse existing control geometry without importing catalog/cart behavior |
| [Dust Wave](https://dustwave.xyz/) | Bold wordmark, monochrome navigation, ruled editorial project list, cinematic dark background | Brand recognition and concise editorial copy; use a quiet solid surface behind the actual booking controls |
| [Podcast admin](https://dustwave.xyz/admin/podcasts/) | Dark background, warm light text, clear sign-in panel, coral accent, large controls; source includes show context, tabbed work areas, status messages, dirty-state handling | Dashboard hierarchy, persistent current context, clear save/status behavior; phase 2 profile switching can follow the show-context pattern |
| Film source | Neutral light/dark tokens, system preference with explicit override, synchronized preference across tabs, strong focus rules | Adapt the small appearance mechanism and semantic token pattern to the warmer Pool/Store palette |
| Dust Wave Platform | Shared Sass primitives and intentionally unstyled browser/admin helpers | Import the actual common implementation and keep scheduler content, state, and styling local |

`dust-wave-podcast` supplies the backend. Its public/admin UI lives in `dust-wave-new`; that site currently uses Eleventy/Nunjucks, Sass, and Bootstrap. Reuse its interaction patterns and shared Platform modules while implementing the scheduler shell in Jekyll. Moving its build system or full admin CSS into the new site would add unrelated dependencies.

## Colors and typography

These values are current reference tokens, not a claim that the scheduler already has a finished theme.

| Role | Pool / Store source | Proposed scheduler treatment |
|---|---|---|
| Page | Pool `#f5f5f2`; Store `#f7f7f4` | Start with Pool's warm page in light mode |
| Primary surface | `#ffffff` | Light cards/forms; dark counterpart starts at `#1c1c1c` |
| Subtle surface | `#f0f1ed` | Quiet grouping and hover states; assign a separate dark token |
| Body text | `#252930` | Main light-mode text |
| Strong text / primary action | `#101215` | Headings and light-mode primary buttons |
| Muted text | `#5d6573` | Supporting text with readable contrast |
| Border | `#d2d7df`; strong `#9ea7b5` | Subtle grouping; stronger boundary where a control needs it |
| Dark page / text reference | Podcast `#111111` / `#f7f4ee` | Warm dark foundation; verify all states as a complete theme |
| Dark supporting text reference | Podcast `#c7c2bb` | Secondary text starting point |
| Dark border reference | Film `#787878`; soft `#343434` | Distinguish form boundaries from decorative dividers |

Use semantic variables for page, surface, text, muted text, border, focus, primary, success, and error. Define complete light and dark sets; avoid a global color-inversion filter. Primary button text must change with its background. State labels/icons accompany color so errors and selected slots remain understandable without color alone.

Pool/Store use **Inter** for body text and **Gambado Sans** for display type. Inter is the practical open-source default. Gambado can be an owner-supplied brand font where licensed: Store's font README explicitly identifies those binaries as deployment-provided and requiring the appropriate license. Keep the generic open-source distribution usable without them. Podcast's bundled **Datatype** font has OFL provenance and is used for analytics charts, not as a replacement body/display font for the scheduler. [Store font notes](https://github.com/aindaco1/store/blob/b4fee63356da83a0be742adcfe90952312aed8c0/worker/src/assets/fonts/README.md)

Keep a roughly 1,000px public content maximum from Pool/Store, one consistent spacing scale, restrained corners, and at least 44px touch controls. Pool's configured medium/extra-large radii are 10/14px; Store's are 8/10px. Choose one coherent set for the scheduler. Avoid importing Film's compact 34px desktop control sizing into public mobile booking.

System light/dark is confirmed. An optional System / Light / Dark override is proposed, following Film's behavior. Use a scheduler-specific preference key. Changes to the system theme should update the page when System is selected. Provide a visible focus outline in both themes; Pool's low-opacity primary focus-ring token should not become the only focus indicator.

## Public booking flow

1. **Introduction and meeting types.** Show the owner's short introduction, then concise choices with duration, video/in-person format, and the applicable notice. A meeting type already knows its video provider. Direct meeting-type URLs can reuse the same screen components; their public/unlisted policy remains to be chosen.
2. **Location, date, and time.** An in-person booking chooses an allowed location before requesting slots within that location's days/hours and the 30-day horizon. Display the active timezone prominently and allow changing it. On a wide screen, the meeting summary can sit beside date/time controls; stack these in logical order on small screens.
3. **Details and confirmation.** Request name and email, with an optional topic field proposed. Repeat the email, exact date, timezone, duration, and location/provider near the final action. Validate Turnstile server-side before creating a booking; do not add email verification. The backend determines the end time and enforces the rules again. Bookers should see a clear pending state while providers finish.
4. **Confirmed booking and management.** Show confirmation only after calendar creation succeeds. Include meeting details, a manage-booking link, and the cancellation/reschedule cutoff. The confirmed policy permits self-service changes until 24 elapsed hours before the meeting starts. Rescheduling must also satisfy the new slot's notice and availability rules.

Do not show private calendar titles, event details, or reasons a time is occupied to bookers. If a required conflict source is unavailable, show that booking is temporarily unavailable. A missing integration response is not an empty calendar.

Use a single reusable booking-summary component across selection, review, confirmation, management, and phase 2 payment. Localized dates and the explicit timezone should be consistent throughout. Preserve user input when a slot becomes unavailable or a provider call needs retrying.

English and Spanish cover the booking and management pages, validation, confirmation, and reminder templates. Store the chosen language with the booking. Reuse the existing language-navigation helpers and dictionary pattern; changing language should preserve the selected meeting and date. Owner-authored introduction, descriptions, and location instructions need editable translations. Configure Turnstile to follow the page language and appearance using its supported settings. [Widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/)

## Private dashboard

Start with four small areas using shared responsive navigation:

- **Bookings:** upcoming bookings, details, cancellation/rescheduling controls, and operational failures requiring attention.
- **Availability:** weekly and location-specific hours, recurring exclusions, temporary blackouts, notice, gaps, and the editable 30-day booking horizon. The daily-cap setting can remain disabled unless requested.
- **Meeting types:** duration, description, video provider or allowed locations, and availability overrides.
- **Settings:** selected conflict calendars, destination connection, connection health, branding, and notification preferences.

Keep saved/unsaved state clear, provide explicit save feedback, and reuse shared dirty/unsaved-change controls. Show connection status with the latest successful synchronization. Phase 2 can introduce profile context above these areas, similar to Podcast's current-show context; shared-person conflicts remain visible to the owner across profiles.

Avoid recreating Podcast's publishing workflow, Store's inventory/admin model, or Pool's campaign editor. Their business rules do not belong in a scheduler.

## Concrete DRY boundaries

| Component | Reuse directly or through its existing consumer adapter | Scheduler still owns |
|---|---|---|
| `@dustwave/design-core` | Selected compile-time Sass: base, buttons, forms, layout, utilities, appropriate dialogs | Tokens, markup, responsive arrangement, scheduler-specific states; import only used components |
| `@dustwave/site-shell` | Header/language navigation, live announcements, form identity helpers where appropriate | Page flow, routes, localized content, booking interactions |
| `@dustwave/admin-shell` | Passwordless session coordination, API client, responsive tabs, confirmation dialogs, dirty controls, unsaved changes, Turnstile sizing | Owner authorization, session/server policy, booking state and labels; the package is unstyled |
| `@dustwave/worker-core` | Provider transport, validation/session helpers, outbox mechanics, Stripe transport/signature helpers, Resend webhook/failure helpers | Calendar adapter, scheduling rules, storage, email sending adapter/templates, retry policy and business orchestration |
| Jekyll Template | Its explicitly shared includes/plugins using the existing pin/update workflow | Public/admin layouts, config, content, routes and build composition |
| Film appearance code | Adapt the small system/override mechanism and event handling | Warm theme token values and scheduler preference namespace; do not create a new global package solely for one adoption |

The shared Resend module is not a complete send-email service, and timezone choices are not a recurrence/availability engine. Likewise, inventory reservations are not time-interval reservations. Reuse the tested primitives while writing the small scheduler-specific logic once.

Platform's accepted design boundary keeps framework-neutral components there and Liquid/Ruby integration in the separate Jekyll template. New shared extractions need demonstrated reuse and characterization; scheduler-only components remain local. Pin immutable package/template revisions and follow the existing consumer adoption workflow. [Platform design ADR](https://github.com/aindaco1/dust-wave-platform/blob/5fac9d36456906600c524395b869491ea7362f3f/docs/adr/0002-design-system-and-jekyll-boundary.md)

## Easy branding without configuration duplication

Follow Pool/Store's token bridge: curated values drive CSS and a smaller subset drives Worker-rendered email. For the scheduler, repository defaults provide a usable open-source theme; dashboard settings can provide runtime overrides from one authoritative settings record. Public configuration exposes only intended name/logo/copy/theme fields. Do not maintain separate brand values for booking pages, email, and payment UI.

Start with a curated set rather than a full theme editor: name, introduction, logo, optional licensed display font, primary color, and light/dark surface/text presets. Validate readable combinations and preview both appearances. Profiles can override these same fields in phase 2.

Email should remain readable in clients that ignore web fonts or restyle dark mode. Stripe-hosted Checkout has its own supported branding controls; do not promise pixel-identical CSS theming. The free phase 2 path uses the ordinary confirmation flow without payment controls.

## Evidence and checks for implementation

Source snapshots inspected:

| Repository | Commit | Main references |
|---|---|---|
| [dust-wave-platform](https://github.com/aindaco1/dust-wave-platform/tree/5fac9d36456906600c524395b869491ea7362f3f) | `5fac9d3` | Design-core, admin-shell, site-shell, worker-core, consumer guidance and design ADR |
| [pool](https://github.com/aindaco1/pool/tree/99ec9f56bf107040147509fca19d51d7ff83ebf0) | `99ec9f5` | `_config.yml`, `_includes/theme-vars.css`, `docs/CUSTOMIZATION.md`, live homepage |
| [store](https://github.com/aindaco1/store/tree/b4fee63356da83a0be742adcfe90952312aed8c0) | `b4fee63` | Config/theme bridge, font provenance, live storefront |
| [dust-wave-podcast](https://github.com/aindaco1/dust-wave-podcast/tree/2d93615b97554156e0b6e1f3e0f0549696322b57) | `2d93615` | Backend/UI ownership and shared-code boundaries |
| [dust-wave-new](https://github.com/aindaco1/dust-wave-new/tree/a502686d3256c2508d50bbd8f720b3edabc524ca) | `a502686` | Theme Sass, Podcast shell/templates, font provenance, live homepage and signed-out admin |
| [film](https://github.com/aindaco1/film/tree/35768e6dea7b9b88db487b6e55d1b787afc0b0b6) | `35768e6` | `apps/web/public/theme.css`, `appearance.js` |

Before UI completion, verify both themes and system switching; keyboard/focus and screen-reader states; narrow/mobile/tablet/desktop layouts; long meeting names and translated labels; timezone/DST display; loading, no-availability, disconnected-calendar, retry, and cancellation-cutoff states. Source review and the inspected reference pages do not substitute for testing the new scheduler.

## Scheduler icon and copy refinement

The September 9 follow-up replaces the decorative star with a monochrome clock ring and a detached square marking a chosen time. References inspected directly: CutNotes `assets/AppIconSource.png` for bold geometry, Auto Subtitle `resources/app-icon/auto-subtitle-1024.png` for a marked choice, and MKV Magic `Assets/AppIcon/MKVMagic.iconset/icon_512x512.png` for a clear centered silhouette. The final icon uses flat shapes and no lettering, shading or glow so it remains legible at browser-tab size.

The built-in image-generation tool explored this prompt: "A bold white clock face on a flat near-black rounded-square tile, with an open upper-right ring, one solid square marking the chosen time, and simple up/right hands; generous negative space, monochrome geometry, no text or decorative effects." The production SVG is defined once in `_includes/scheduler-mark.svg` and included in both the theme-aware header and `assets/icon.svg`. The raster concept is a visual reference, not a runtime asset or dependency.

Public/admin hero taglines are removed in English and Spanish, the footer reads **SCHEDULER**, and starter introduction/description copy omits the removed phrase. Existing customized introductions are preserved. Native dropdown controls share a small inset chevron and reserved text padding; forced-color modes retain the system arrow.
