# Spanish rescheduling email Jev finding — October 13, 2026

## Evidence and diagnosis

The October 5 [scheduled run](https://github.com/aindaco1/scheduler/actions/runs/37373972322)
passed. The subsequent [main push](https://github.com/aindaco1/scheduler/actions/runs/37379758624)
passed deterministic checks but stopped on one unapproved semantic review:
`email-rescheduled-es-text`, question `meaning`.

Both saved artifacts have the same complete corpus SHA-256:
`59fc506e9e66d05d57a40c48127183a054f400ddb6e1772b097fb7f6deb77476`.
The candidate SHA-256 is
`27ccd17a45af0f494fc3ecd7a61db879304c0ef8514836d7c35a7350ac06539e`.
The request, recognized model (`jev-1.13.0`) and policy match. The only intervening
commit, `d0382a0`, changed release documentation.

| Run | Pass | Fail | Uncertain | Margin | Decision |
| --- | --- | --- | --- | --- | --- |
| Scheduled | 0.62 | 0.33 | 0.05 | 0.29 | pass |
| Main push | 0.51 | 0.43 | 0.06 | 0.08 | review |

The requirement is that the meeting has been rescheduled to the shown time,
rather than merely requested. The rendered text begins **Tu reunión se ha
reprogramado**, then shows the meeting date, time and time zone. The closing
sentence permits a subsequent cancellation or reschedule before the deadline;
it does not say this completed change is pending. Source inspection of
`bookingEmail` and its synthetic capture found no demonstrated translation or
rendering defect. Both runs passed all 16 calibration and 24 validation controls.

These observations establish differing judge scores for identical inputs. They
do not establish universal translation quality or a calibrated error rate. The
0.08 result correctly blocked under the frozen 0.10 minimum margin. The existing
English pending-state approval covered a different finding and did not waive it.

## Resolution and limits

Preserve the original failure. Do not change product copy, questions, controls,
model allowlist, threshold or approvals merely to obtain a pass. Maintenance
candidates receive a fresh complete check, with no automatic evaluation retries.
Any new uncertain finding remains blocking and needs its own investigation;
this record grants no review exception.

The original synthetic `report.json`, `corpus.json` and `review.md` were retained
locally under ignored `work/ci-maintenance-2026-10-13/prior/{run-id}/`.
The report byte hashes are:

- Scheduled: `055ccf19ff6fd20a7ac03c5263906e73e0dc7bb62f0d064b9e1d59156484311e`.
- Main push: `cf65b7396d526a25962c12ae918f7c34102f4f3b27c046a374e43b057a27ac4d`.

GitHub retains these artifacts for 14 days; the hashes and selected findings
above remain available after expiry. New validation belongs in
[maintenance evidence](../release-evidence/ci-maintenance-2026-10-13.md).

## Fresh maintenance candidates

The complete corpus hash above remained identical in both fresh runs. No
question, candidate, threshold, model allowlist or approval was changed.

| Candidate | Live run | Pass | Fail | Uncertain | Margin | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| PR #16 `ba6860b` | [38494210890](https://github.com/aindaco1/scheduler/actions/runs/38494210890) | 0.72 | 0.24 | 0.04 | 0.48 | pass |
| PR #17 `4fa130d` | [38494442612](https://github.com/aindaco1/scheduler/actions/runs/38494442612) | 0.49 | 0.46 | 0.05 | 0.03 | review |

Both completed their deterministic checks and passed every labeled control.
The PR #17 result blocked before the owner decision below. No automatic rerun
or exception was applied to that run.
Under [the existing review policy](../QUALITY.md#judge-policy-and-review), a new
exact-copy approval requires an explicit owner decision; otherwise this candidate
cannot merge. The remaining semantic question is whether the text below clearly
communicates a completed reschedule to its displayed time.

### Exact candidate for owner review

> Tu reunión se ha reprogramado
>
> Información de tu reserva con Fixture Host en scheduler.example.
>
> Mensaje de Fixture Host:
> Gracias por tu flexibilidad.
>
> Una conversación · Fixture Host
>
> lunes, 14 de septiembre de 2026, 16:00 (UTC)
>
> 30 min
>
> 123 Example Street
>
> Instrucciones de llegada:
> Entra por la puerta lateral.
>
> Gestionar reunión: [link]
>
> Puedes cancelar o reprogramar hasta 24 horas antes.

### Owner decision

On October 13, 2026 (recorded at 2026-10-14T01:20:48Z), the owner answered
**Approve this exact-copy review** after receiving the full candidate, diagnosis
and proposed limits. This explicit decision authorizes the new entry in
`config/jev-reviews.json` under the existing policy.

The approval binds only this candidate, its `meaning` question, current policy
and `jev-1.13.0`. It never accepts a `fail`, changed text, another finding,
failed controls or incomplete evidence. Raw decisions and distributions remain
in each report; the gate lists any applied owner reviews separately.

- Candidate SHA-256: `27ccd17a45af0f494fc3ecd7a61db879304c0ef8514836d7c35a7350ac06539e`.
- Requirement SHA-256: `1713503c7add35e5cd1c4876028c5f9624f7c2381af1fceb43acc152d564fb11`.
- Policy SHA-256: `b4086fb3e32f527303a1fd667b2eb4ff7129dd2e96d220720dac2e1141fc8093`.

Fresh full candidate validation is required before merging. The earlier failure
is retained and is not relabeled as a historical passing CI run.
