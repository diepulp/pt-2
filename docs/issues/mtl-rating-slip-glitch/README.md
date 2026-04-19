# MTL Rating-Slip Buy-In Glitch — Issue Index

Production-observed glitch (2026-04-15): a pit boss saw a threshold-acknowledgement toast for a $3,000 buy-in and dismissed the rating-slip modal inside the ~1s POST window; the browser aborted the in-flight request; no `player_financial_transaction` row and no derived `mtl_entry` row committed; `/compliance` correctly rendered nothing, but the operator had already been given success-like feedback.

## Artifacts

| File | Purpose |
|------|---------|
| [`RATING-MTL-ISSUE.md`](./RATING-MTL-ISSUE.md) | Incident record and Phase-1 root-cause triage. |
| [`hardening-direction-audit.md`](./hardening-direction-audit.md) | Audit of the initial fix proposal; classifies P0.1–P0.3 and P1.4 as containment-slice, the rest as adjacent work. |
| [`arch-flaw.md`](./arch-flaw.md) | Architectural reasoning — names the five smells and the operator-side atomicity gap; inputs to ADR-049. |
| [`PROPOSED-FIXES.md`](./PROPOSED-FIXES.md) | Source proposal that `hardening-direction-audit.md` responds to. |
| [`7-findings.md`](./7-findings.md) | Phase-1 agent findings. |
| [`../../10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md`](../../10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md) | PRD-064 — containment slice (P0.1/P0.2/P0.3/P1.4). Short-term release path. Codifies `INV-MTL-BRIDGE-ATOMICITY`. |
| [`../../80-adrs/ADR-049-operator-action-atomicity-boundary.md`](../../80-adrs/ADR-049-operator-action-atomicity-boundary.md) | ADR-049 — parallel architectural ADR (composite client mutation vs single server-side command contract). Direction affirmed, packaging deferred. Non-blocking for PRD-064. |
| [`../../../e2e/repro-mtl-glitch.spec.ts`](../../../e2e/repro-mtl-glitch.spec.ts) | Playwright headless reproduction; confirms the race is not transient. |
| [`POST-IMPL-PRECIS.md`](./POST-IMPL-PRECIS.md) | What PRD-064 shipped; commit pointer and test inventory. |
| [`PRD-065-DEFERRAL-RATIONALLE.md`](./PRD-065-DEFERRAL-RATIONALLE.md) | Rationale for deferring ADR-049 packaging; trigger gates for un-deferral. |
| [`DOWNSTREAM-CONSUMER-POSTURE.md`](./DOWNSTREAM-CONSUMER-POSTURE.md) | Read-plane investigation; origin of H2/H3 scope. |
| [`HARDENING-BACKLOG.md`](./HARDENING-BACKLOG.md) | Consolidated remediation-priority map across PRD-064 §2.3 + `PRD-065-DEFERRAL-RATIONALLE` + `DOWNSTREAM-CONSUMER-POSTURE`; Phase H / K / F / G / hygiene structure. |

## Invariant

`INV-MTL-BRIDGE-ATOMICITY` lives in [`docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md`](../../70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md). A qualifying pit buy-in succeeds if and only if a `player_financial_transaction` row AND its derived `mtl_entry` row both commit in the same Postgres transaction. Client code must not present success-like UI before 2xx, and the UI must not be dismissible during the in-flight save interval.
