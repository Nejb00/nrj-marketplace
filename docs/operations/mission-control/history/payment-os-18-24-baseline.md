# Archive baseline — Payment OS coverage #18–#24

- **Archive type:** documented coverage snapshot
- **Last checked:** 2026-10-18
- **Notion record:** https://app.notion.com/p/3fd0f09830e181c78e74f9ceee4689d2?pvs=204
- **Source matrix:** https://github.com/Nejb00/nrj-marketplace/blob/main/docs/nrj-self-healing-attack-matrix.md

## Coverage described in the source matrix

| ID | Described control / audit | Caution |
|---|---|---|
| #18 | Provider-reference recovery audit, read-only | Does not imply a live provider transaction was executed. |
| #19 | Callback/webhook reconciliation audit, read-only | Does not prove every external callback path was exercised in production. |
| #20 | Payment-to-order state-machine audit | Deterministic audit coverage, not a production deployment assertion. |
| #21 | Financial processing error observability audit | Documented deterministic audit. |
| #22 | Anti-double-submit and idempotency | Test/control coverage documented. |
| #23 | Full payment E2E path gate | Gate requires coverage of lifecycle stages. |
| #24 | Controlled OpenPay activation gate | The matrix explicitly says no automatic activation. |

## Interpretation

This is a snapshot of what the current source document states. It must not be read as proof that each attack was separately executed end-to-end in production or that a live payment was attempted.

## Safety constraint

The source matrix states that evidence of integrity, security, payment or correlation alone does not authorize database changes, migrations, provider activation or PR merges. Keep that boundary.


## Historical branch references found during audit (2026-10-18)

The local checkout's remote-tracking branch list contained the following named references at audit time:

- [#18 — provider-reference recovery](https://github.com/Nejb00/nrj-marketplace/tree/feat/payment-recovery-attack-18)
- [#19 — webhook reconciliation](https://github.com/Nejb00/nrj-marketplace/tree/feat/payment-webhook-reconciliation-attack-19)
- [#20 — Payment → Order state machine](https://github.com/Nejb00/nrj-marketplace/tree/feat/payment-order-state-machine-attack-20)
- [#21 — financial audit observability](https://github.com/Nejb00/nrj-marketplace/tree/feat/payment-audit-observability-attack-21)
- [#22 — anti-double-submit](https://github.com/Nejb00/nrj-marketplace/tree/feat/payment-anti-abuse-attack-22)
- [#23 — payment E2E gate](https://github.com/Nejb00/nrj-marketplace/tree/feat/payment-e2e-attack-23)
- [#24 — controlled OpenPay activation](https://github.com/Nejb00/nrj-marketplace/tree/feat/payment-openpay-controlled-activation-attack-24)

These are reference pointers for further investigation, not evidence that each branch is still current, each PR merged, or each scenario ran in production. In particular, do not activate OpenPay or perform a live payment as part of this archive.