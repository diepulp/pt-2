# PT-2 Economic Delta Distillation

**Date:** 2026-03-01
**Precondition:** Strategic Hardening Audit (STRATEGIC_HARDENING_REPORT.md)
**Posture:** Full replacement system of record (PT2_Marketing_Narrative_Replacement_Positioning.md)
**Question:** What measurable economic value does PT-2 surface that legacy systems structurally cannot?

---

## The Honest Assessment

**PT-2 today computes financial truth. It does not yet expose it.**

The audit confirmed mature governance infrastructure — deterministic theo, immutable MTL, append-only loyalty ledger, provenance-classified baselines. But when you ask "what can PT-2 show a property that their legacy system cannot?", the answers are almost there but not yet queryable:

| Capability | What PT-2 Can Prove | What's Missing | Legacy Status |
|------------|---------------------|----------------|---------------|
| **Theo integrity** | Deterministic computation with transparent inputs, provenance-classified baselines (5-source cascade) | No ingestion of legacy-reported theo for discrepancy surfacing | Opaque — calculation layers hidden behind vendor reporting |
| **Audit traceability** | Immutable MTL, append-only audit log, 61+ gated RPCs, authoritative actor context | No unified correlation query — auditor must manually join 4 tables | Hours of manual reconciliation across disconnected systems |
| **Telemetry coverage** | Per-table `coverage_ratio` (0-1.0), shift-level metrics | No casino-wide aggregate, no historical tracking | Not measured — rating gaps are invisible by design |
| **Loyalty liability** | Append-only points ledger, signed delta model, liability computable to the cent | No historical snapshots, no dollar valuation, no trend line | Outstanding liability is estimated, not computed |

Legacy systems cannot produce these measurements. Not because they choose not to — because their architecture makes it structurally impossible. Opaque calculation layers, mutable records, and configuration-based compliance mean the data to prove integrity does not exist.

PT-2's architecture makes it possible. The measurement layer simply hasn't been activated yet.

---

## The Root Cause

**PT-2 was built to compute correct values. It was not yet built to surface what those values prove.**

A replacement system of record does not need to compare itself against the incumbent. It needs to demonstrate capabilities the incumbent structurally cannot match. PT-2's deterministic financial lineage, immutable ledger, and provenance tracking create a foundation that legacy systems do not have. But that foundation is latent — the infrastructure exists, the measurement surfaces do not.

The gap is not architectural. It is presentational. Four small artifacts activate the measurement layer.

---

## What Activates the Measurement Layer

Exactly 4 artifacts surface what PT-2's architecture uniquely enables. Each is small. None requires redesign.

### 1. `rating_slip.legacy_theo` column

**Type:** 1 migration + import pipeline change
**Effort:** 1-2 days

During migration, properties bring historical data. Storing the legacy-reported theo alongside PT-2's deterministic computation surfaces discrepancies that were previously invisible:

```sql
SELECT AVG(ABS(theoretical_win - legacy_theo) / NULLIF(legacy_theo, 0))
FROM rating_slip
WHERE legacy_theo IS NOT NULL;
```

**Surfaces:** Theo discrepancies that legacy systems structurally hide behind opaque reporting. Not a comparison — a revelation. The legacy number was accepted on faith. PT-2 proves whether it was correct.

### 2. `audit_event_correlation_v` view

**Type:** 1 SQL view
**Effort:** 1 day

Joins audit_log + MTL + financial_txn + loyalty_ledger by correlation. Enables:

> "Trace slip #123 from close → financial txn → MTL entry → loyalty accrual" in one query.

**Surfaces:** End-to-end financial lineage in seconds. This is not an improvement over legacy audit prep — it is a capability that does not exist in legacy systems. They cannot trace a financial event from origin to ledger because the chain of custody is not recorded.

### 3. `telemetry_completeness_v` view

**Type:** 1 SQL view + 1 dashboard widget
**Effort:** 1 day

Aggregates `coverage_ratio` across all tables in a shift/casino. Enables:

> "85% of your table-hours have rating data. Industry benchmark is 60%."

**Surfaces:** Rating coverage as a measurable metric. Legacy systems do not compute this — unrated table-hours are silent voids. PT-2 makes the gap visible because it tracks table lifecycle independently of player sessions. Coverage itself is the value — you cannot improve what you cannot measure.

### 4. `loyalty_liability_snapshots` table

**Type:** 1 migration + 1 batch function
**Effort:** 2-3 days

Daily snapshot: casino_id, date, total_outstanding_points, total_monetary_value. Enables:

> "Your outstanding reward liability is $47,200 today, down from $52,100 last week."

**Surfaces:** Daily loyalty liability to the dollar with trend visibility. Legacy systems estimate this figure quarterly at best, often from spreadsheets. PT-2's append-only ledger with signed deltas makes real-time computation possible — the snapshot is a lightweight materialization of data that already exists.

---

## The One-Sentence Test

### After those 4 artifacts:

> "PT-2 surfaces theo discrepancies hidden by opaque legacy reporting, traces financial events end-to-end in seconds, measures rating coverage that legacy systems cannot see, and computes daily reward liability to the dollar — capabilities structurally impossible in the systems it replaces."

### Without them:

> "PT-2 computes theo deterministically, logs audit events, tracks sessions, and accrues loyalty points correctly."

The first is a system of record that proves its own integrity. The second is a feature list that asks you to take it on faith.

---

## Effort to Activate

| Artifact | Effort | What It Surfaces |
|----------|--------|-----------------|
| `rating_slip.legacy_theo` | 1-2 days | Theo discrepancies invisible in legacy systems (Wedge A) |
| `audit_event_correlation_v` | 1 day | End-to-end financial lineage (Wedge B) |
| `telemetry_completeness_v` | 1 day | Rating coverage measurement (Wedge A/C) |
| `loyalty_liability_snapshots` | 2-3 days | Daily liability computation with trend (Wedge D) |
| **Total** | **5-7 days** | **All four structural advantages become visible** |

Five to seven days of focused work. That is the distance between an architecture that enables measurability and a system that demonstrates it.

---

## Decision Framework

If you cannot walk into a property and say:

> "Your current system cannot show you this. PT-2 can. Here it is."

You have a superior architecture with no visible proof.

These 4 artifacts are the minimum viable measurement layer that makes structural superiority tangible. Everything else in the hardening roadmap (alerting, dashboards, anomaly detection) amplifies what PT-2 can show. These 4 make it undeniable.
