# Email deliverability rollout — September 9, 2026

Scheduler phase 1 is live at [scheduler.dustwave.xyz/alonso](https://scheduler.dustwave.xyz/alonso). The latest authorized email passed Gmail authentication and forwarded successfully to HEY. Core booking, calendar conflict, Meet/Zoom/in-person, reschedule, cancellation and scheduled-reminder acceptance are documented in [Scheduler status](https://github.com/aindaco1/scheduler/blob/main/docs/STATUS.md).

## Shared changes

[Platform PR #40](https://github.com/aindaco1/dust-wave-platform/pull/40) adds Worker Core 0.13.0 in Platform 0.36.0, pinned by consumers at `af2a5e5e4b65f218e627652b8243feb9704c48a1`. The helper supplies a configured reply address and automatic-message headers while retaining explicit existing headers, unsubscribe controls, content, recipients and attachments. Its [operations guide](https://github.com/aindaco1/dust-wave-platform/blob/main/docs/email-deliverability.md) makes the same rules reusable for future projects.

| Sender | Result | Verification / release |
| --- | --- | --- |
| Scheduler | Shared reply/header defaults; permanent failures held; Retry-After honored; immutable retries | 65 tests, browser/axe checks, [CI](https://github.com/aindaco1/scheduler/actions/runs/34399237652); deployed Worker `5b78c1e5-1b62-44bb-af13-b4bc6ad69f0d`; actual received header and forwarding check |
| Dust Wave Podcasts | Shared defaults through the existing central sender; configured owner reply fallback; unsubscribe and disabled announcement modes preserved | 791 tests, security/type gates and both dry runs; [PR #98](https://github.com/aindaco1/dust-wave-podcast/pull/98) merged; staging `ab1ce7f1-31f7-48d3-bde7-72bbb3aea340`, production `81009c87-9064-40d4-843d-aaeb43d16890`; both health endpoints returned 200 |
| Film | Shared defaults for sign-in and workspace invitations; existing support reply address; provider gates and suppression preserved | Full local build/unit/browser/offline/D1 checks and both dry runs; [PR #1](https://github.com/aindaco1/film/pull/1) merged with CI passing; Worker `900ddef8-4fc8-4af1-9098-b46c77bd4df8`; health returned 200 |
| Dust Wave newsletter | Shared defaults; existing opt-out footer connected to a signed branded endpoint; one-click headers; coarse signup throttle and origin checks | Six focused tests and zero-vulnerability dependency audit pass; [PR #20](https://github.com/aindaco1/dust-wave-new/pull/20) merged after CI; Worker `48a5947b-6fec-420a-b831-d3c7a37c6be7` deployed; website rollout completed |
| RSS Feed Digest | Plain-text alternative derived from unchanged HTML; shared headers and configured owner reply; schedule unchanged | 99 tests and feed configuration validation; [PR #2](https://github.com/aindaco1/rss-feed-digest/pull/2) merged; push/PR CI passed. Next normal scheduled run uses this source; no extra digest send was triggered |
| Pool and Store | Audited existing reply routing, HTML/text, unsubscribe/suppression and durable retry policies; no email source changes needed | Their Resend sending domains were verified live with tracking disabled; this task did not send customer mail or claim new recipient acceptance |
| GitHub repository scan, Opportunity Radar and Community | Retain their Cloudflare Email Sending transport, restricted recipients and existing operational policies | Source audit only for this rollout; no transport replacement or new scheduled send |
| Website contact forms and manually composed broadcasts | Remain with their existing provider/workflow | No contact-form content, campaign or audience rewrite; future mail follows the shared guide |

The inventory covered the identified production senders, a targeted scan of 27 local Git checkouts and a GitHub code-search cross-check. Two broad local scans timed out; these are not evidence that every historical repository or external provider account is certified. The known repository-scan mail path was inspected separately. Native apps that delegate purchases/licenses to Store benefit from Store's existing sending policy.

## Content preservation

Film and Podcast message renderers are unchanged. The RSS HTML renderer and subject are unchanged; readable text is derived from the same HTML. Newsletter's main message and design are unchanged; its already-authored optional unsubscribe footer is now populated. Scheduler retains its booking information and branding, adds a short identifying sentence, and corrects the cancellation footer to say no further action is needed.

No marketing campaign was sent, no existing contact was unsubscribed during testing, and no third-party meeting invite was created. The newsletter opt-out is explicit: Resend's current contact API unsubscribes a contact from all marketing Broadcasts, while transactional service mail is unaffected. A GET from a link scanner cannot unsubscribe; a signed one-click POST or confirmation form can.

## Authentication and receipt

The Resend domains `dustwave.xyz`, `shop.dustwave.xyz` and `pool.dustwave.xyz` were verified with open/click tracking disabled. The root sender uses the existing `info.dustwave.xyz` Return-Path, aligned DKIM and a DMARC `p=none` policy. The shared root enforcement policy was retained because it serves multiple legitimate sending systems.

The initial Scheduler lifecycle emails passed authentication but landed in Gmail Spam, preventing forwarding. The final 14:20 owner-authorized transport check passed SPF/DKIM/DMARC, used TLS 1.3, supplied HTML and plain text, and included the intended Reply-To and Auto-Submitted headers. The matching message was observed in HEY after Gmail's existing forwarding/delete-copy rule ran. No mailbox rule or DNS policy was changed to force this result. The additional check used the same source transport and shared helper locally against Resend; it created no calendar event and was not another production outbox lifecycle test.

One successful delivery cannot guarantee future Inbox placement. Domain/IP reputation and recipient filtering still matter. [Gmail's sender guidance](https://support.google.com/mail/answer/81126?hl=en) and [Resend's deliverability guidance](https://resend.com/docs/knowledge-base/how-do-i-avoid-gmails-spam-folder) explain that distinction. API acceptance, recipient-server delivery and actual mailbox placement are recorded separately here.

## Rollback and operation

Each consumer documents its exact prior pin and independent deployment rollback. Retain the newsletter signing secret and opt-out endpoint after issuing links; rolling those away would break recipients' existing unsubscribe controls. Do not replay previously attempted payloads under a changed idempotency key or after the provider's deduplication window without reconciling delivery history. Provider suppression remains in force for hard bounces and complaints.

## Newsletter final rollout

PR #20 passed the complete Pages/WebP build, shared-pin/security checks, Community checks, and the newly added newsletter tests/audit. The merged source is `e512d65` and the Newsletter Worker is `48a5947b-6fec-420a-b831-d3c7a37c6be7`.

Live checks verified the branded signed-link confirmation returned 200 with no-store/no-referrer headers; a tampered link returned 400, a foreign-origin signup returned 403, and an invalid address returned 400. None of these checks called the contact mutation API or sent a newsletter. The signed POST persistence and provider-failure behavior were verified with mocks. The main website’s [Pages deployment and Cloudflare cache purge](https://github.com/aindaco1/dust-wave-new/actions/runs/34401290007) completed successfully for the same merged source. The two unrelated untracked News drafts were preserved and were not published.
