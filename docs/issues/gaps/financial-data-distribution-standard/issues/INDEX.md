# Financial Provenance Trace — Issues Index

> Issues logged against `FINANCIAL-PROVENANCE-TRACE.md` and related financial standard governance docs.
> All issues marked **INTERIM** were identified via targeted grep and ROLLOUT-PROGRESS.md cross-reference.
> Full analysis pending GitNexus knowledge graph re-index and exhaustive audit pass.

---

## Open Issues

| ID | Title | Severity | Type | Status |
|---|---|---|---|---|
| [FPT-001](ISSUE-FPT-001-loyalty-redemption-misclassification.md) | FACT-LOYALTY-REDEMPTION misclassification (Broken/Missing → Implemented) | MEDIUM | Doc error | INTERIM |
| [FPT-002](ISSUE-FPT-002-gap-l2-accrual-caller-unknown.md) | GAP-L2 accrual caller misidentified as UNKNOWN | LOW | Doc error | INTERIM |
| [FPT-003](ISSUE-FPT-003-gap-u1-mtl-compliance-dead-wire.md) | GAP-U1 doc misclassification — CTR aggregate correct; `mtlEntries={[]}` not connected (reason unestablished); `onViewHistory` unwired | MEDIUM | Doc misclassification + omission | INTERIM |
| [FPT-004](ISSUE-FPT-004-phase11-trace-staleness.md) | Trace staleness post Phase 1.1 (4 stale findings + 1 new gap N1) | MEDIUM | Doc staleness | INTERIM |

---

## Legend

- **Doc error** — finding was factually wrong at authoring; code was correct
- **Doc staleness** — finding was correct at authoring; superseded by shipped work
- **Code defect** — an actual runtime/integration defect discovered during audit
- **INTERIM** — identified by grep/doc review; pending full GitNexus-assisted analysis for completeness

---

## Analysis Debt

The following analysis passes are **not yet done** and may surface additional issues:

- GitNexus `cypher` impact trace on `compliance-panel-wrapper.tsx` and `use-mtl-entries.ts` — confirm all consumer surfaces; determine whether `mtlEntries={[]}` is omission or intentional scoping (FPT-003)
- GitNexus `impact` analysis on `types/financial.ts` / `FinancialValue` — confirm Phase 1.1 adoption breadth (FPT-004)
- GitNexus process-trace on `use-close-with-financial.ts` — confirm accrual reliability gap sub-question (FPT-002 open sub-question)
- GitNexus `query` on `finance_outbox` — confirm zero producer finding (GAP-F1 in trace, not yet an issue here)
- Full trace re-review against Phase 1.1 deliverables (S1–S4 may be incomplete)
