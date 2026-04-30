# Open Issues & Analysis Debt — Financial Model

All issues are status INTERIM: identified via grep/doc review. Full analysis pending
GitNexus-assisted trace passes noted below.

---

## GAP-F1 — finance_outbox Has Zero Producers

**Severity:** Structural  
**Impact:** ADR-054 (transactional outbox, propagation contract) is not enforced in code

### Detail

The `finance_outbox` table exists in the schema but no authoring RPC produces rows in it.
Both the PFT write path (Class A) and the grind write path (Class B) are missing outbox
insert coupling. This means:

- At-least-once propagation is not active
- `origin_label` immutability in transit cannot be enforced (nothing to enforce)
- Dashboard/projection consumers cannot subscribe to events
- ADR-054 D1 (outbox as sole propagation path) is aspirational, not implemented

**What this means for implementation work:**
- Any spec that says "consumers subscribe to finance_outbox" must flag this gap explicitly
- Do not design features that depend on outbox delivery being available until producers are wired
- The outbox wire-up is a prerequisite workstream for Phase 1.2+

**Pending analysis:**
- GitNexus `query` on `finance_outbox` to confirm zero-producer finding and check for any partial wiring

---

## FPT-001 — FACT-LOYALTY-REDEMPTION Misclassification

**Severity:** MEDIUM  
**Type:** Doc error  
**Status:** INTERIM

### Detail

The FINANCIAL-PROVENANCE-TRACE doc classified `FACT-LOYALTY-REDEMPTION` as "Broken/Missing."
Targeted investigation showed the implementation exists and is correct. The doc was wrong at
authoring time; the code was fine.

**Correct state:** FACT-LOYALTY-REDEMPTION is implemented via a ratified RPC and writes to `loyalty_ledger`.

**Action:** Update FINANCIAL-PROVENANCE-TRACE when a full re-audit pass is scheduled.

---

## FPT-002 — GAP-L2 Accrual Caller Misidentified

**Severity:** LOW  
**Type:** Doc error  
**Status:** INTERIM

### Detail

FINANCIAL-PROVENANCE-TRACE identified GAP-L2's accrual caller as UNKNOWN. The caller
is `use-close-with-financial.ts`. The doc was wrong.

**Open sub-question:** Whether there is a reliability gap in accrual (does the close flow
always trigger accrual correctly under all paths, or is there a race/miss condition?).

**Pending analysis:**
- GitNexus process-trace on `use-close-with-financial.ts` to confirm accrual reliability

---

## FPT-003 — Compliance Panel: `mtlEntries={[]}` Not Connected

**Severity:** MEDIUM  
**Type:** Doc misclassification + omission  
**Status:** INTERIM

### Detail

Two symptoms:
1. `compliance-panel-wrapper.tsx` passes `mtlEntries={[]}` — hard-coded empty array instead of live data
2. `onViewHistory` prop is unwired

Whether this is an intentional scoping decision (compliance panel stubbed for pilot) or an
accidental omission is not yet established. The trace doc misclassified this as GAP-U1 without
fully characterizing the omission vs intentional scope question.

**Pending analysis:**
- GitNexus `cypher` on `compliance-panel-wrapper.tsx` and `use-mtl-entries.ts` to confirm all consumer surfaces and establish whether the empty array is intentional scoping or omission

---

## FPT-004 — Trace Staleness Post Phase 1.1

**Severity:** MEDIUM  
**Type:** Doc staleness  
**Status:** INTERIM

### Detail

FINANCIAL-PROVENANCE-TRACE was authored before Phase 1.1 shipped. Four findings in the
trace are stale (superseded by Phase 1.1 deliverables S1–S4). One new gap (N1) was identified
that is not in the trace.

**Stale findings (approximately):**
- S1–S4: Phase 1.1 deliverables resolved these; trace still shows them as open

**New gap N1:** Detail pending full trace re-review.

**Pending analysis:**
- Full trace re-review against Phase 1.1 deliverables
- GitNexus `impact` analysis on `types/financial.ts` / `FinancialValue` to confirm Phase 1.1
  adoption breadth

---

## Analysis Debt Summary

The following GitNexus passes are explicitly deferred pending re-index or prioritization:

| Pass | Target | Purpose |
|---|---|---|
| `cypher` impact trace | `compliance-panel-wrapper.tsx`, `use-mtl-entries.ts` | Confirm consumer surfaces; establish whether `mtlEntries={[]}` is intentional (FPT-003) |
| `impact` analysis | `types/financial.ts` / `FinancialValue` | Confirm Phase 1.1 adoption breadth (FPT-004) |
| process-trace | `use-close-with-financial.ts` | Confirm accrual reliability sub-question (FPT-002) |
| `query` | `finance_outbox` | Confirm zero-producer finding; check for partial wiring (GAP-F1) |
| Full trace re-review | FINANCIAL-PROVENANCE-TRACE vs Phase 1.1 deliverables | Establish S1–S4 staleness and N1 gap scope (FPT-004) |
