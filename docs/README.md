# Documentation

Use this index to find the guide that owns a task. The root [README](../README.md) introduces Scheduler and provides installation steps; these guides describe the current product, operating procedures and future plans.

## Start here

| Task | Guide |
| --- | --- |
| Install Scheduler or configure a fork | [Installation and setup](../README.md#installation-and-setup), [fork guide](FORKING.md) |
| Understand the architecture, develop locally or deploy | [Operations](OPERATIONS.md) |
| Contribute a change | [Contributing](CONTRIBUTING.md) |
| Find repository-wide working rules | [AGENTS](../AGENTS.md) |

## Configure and operate

| Task | Guide |
| --- | --- |
| Connect calendars, provision accounts and verify bookings | [Owner setup](OPERATIONS.md#owner-setup), [fork credentials](FORKING.md#3-provision-your-accounts-and-secrets) |
| Set hours, gaps, blackouts, reminders and branding | [Product decisions](decisions/phase-1.md), [operating guidance](OPERATIONS.md) |
| Investigate provider failures and interrupted bookings | [Booking recovery](OPERATIONS.md#booking-consistency-and-recovery), [availability failures](OPERATIONS.md#intermittent-availability-failures) |
| Review mail delivery and guest receipt | [Email operations](OPERATIONS.md#email-delivery-and-held-failures), [delivery audit](research/email-deliverability-audit.md) |
| Release or clean the local checkout | [Cleanup and releases](OPERATIONS.md#local-cleanup-and-releases) |

## Develop and verify

| Task | Guide |
| --- | --- |
| Work on the browser or API | [Browser entry point](../web/README.md), [API contract](API.md) |
| Run checks and understand their limits | [Quality checks](QUALITY.md#commands-and-evidence) |
| Review authentication, private data and vulnerability reporting | [Security](SECURITY.md) |
| Maintain accessible layouts and translations | [Accessibility and localization](QUALITY.md#accessibility-and-localization-contract) |
| Maintain performance, calendar caching and search metadata | [Quality review](QUALITY.md), [calendar cache contract](QUALITY.md#calendar-cache-contract) |
| Review dependency licenses | [Third-party notices](THIRD_PARTY_NOTICES.md), [MIT license](../LICENSE) |

## Releases and future work

- [Roadmap](ROADMAP.md): planned 1.0.1 security audit and Phase 2 features, including Google Calendar reconciliation.
- [Changelog](../CHANGELOG.md): completed releases and changes under Unreleased.
- [Release status](STATUS.md): current deployment and the limits of its verification.
- [Release evidence](release-evidence/): dated metrics and verification records, separated from research.
- [Pre-1.0 history](history/pre-1.0.md): older implementation and acceptance records.

## Research and decisions

- [Phase 1 decisions](decisions/phase-1.md): agreed behaviour and editable defaults.
- [Original scheduler research](research/scheduler-research-and-scope.md): project comparisons and initial scope.
- [Design and code reuse](research/design-reuse-notes.md): Pool/Store styling and shared-package references.
- [Proton and Protoxide](research/proton-integration-notes.md): feasibility research for a direct integration.
- [Location hours](research/location-hours.md): dated sources for the owner's initial venues.

## Documentation ownership

Following Pool's structure, keep detailed maintainer guides here and use the root README as an entry point. Operations owns procedures; Forking owns installation/account setup; API owns route contracts; Quality owns validation and its limits; Security owns reporting and security boundaries. Link to those guides rather than duplicating their instructions.

Roadmap owns prospective work. Changelog records completed changes; Status and `release-evidence/` preserve dated verification. Keep original investigations in `research/` and older narrative records in `history/`. Historical evidence is not a statement that a setting or provider status is still current.

README, LICENSE, AGENTS and CHANGELOG remain at the repository root, as in Pool. Contribution, security and third-party notice guides live only here in `docs/`; there are no duplicate root pointer files. Component READMEs stay beside their code. Preserve links and heading anchors when moving material. These maintainer documents remain excluded from the public Jekyll build.
