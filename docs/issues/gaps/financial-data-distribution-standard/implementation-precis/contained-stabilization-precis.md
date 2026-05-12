# Post-Implementation Précis — Contained Semantic Stabilization

**Date:** 2026-05-07  
**Commit:** `70937071`  
**Branch:** `feat/transactional-outbox`  
**Follows:** `post-implementation-precis.md` (B-2 / six-surface wave)

---

## Investigation Method

Two parallel Explore agents deployed against the full component tree after
reviewing the strategy doc (`CONTAINED-PRE-WAVE-2-BLOCKER-REMEDIATION-STRATEGY.md`)
and the B-2 post-implementation précis:

- **Agent 1** — surface drift scan: all `<FinancialValue>` usages with `type: 'actual'`,
  raw `formatCents()` on financial fields, fallback logic that could silently
  escalate authority. Excluded the six already-patched B-2 surfaces.
- **Agent 2** — B-1 audit: Wave 2 planning docs checked against the three B-1
  resolution criteria in `wave-2-blockers.md`.

---

## Surface Findings

### S1 — Provenance Risk (replay-dangerous, must patch before Wave 2)

**F1 — `hero-win-loss-compact.tsx:97` — Silent fallback to `'actual'`**

Same class of defect as B-2.2 (`secondary-kpi-stack.tsx`). The ternary
`metricGrade === 'ESTIMATE' ? 'estimated' : 'actual'` defaults to `'actual'`
when `metricGrade` is `undefined` (the prop is optional). On a live shift the
caller does not always pass a grade, so Win/Loss was silently resolving as
ledger-authoritative on the left-rail hero card.

Fix: inverted to `metricGrade === 'AUTHORITATIVE' ? 'actual' : 'estimated'`.
Conservative default is now `'estimated'`.

---

**F2 — `pit-table.tsx:51` — Win/Loss bypasses `FinancialValue` envelope**

The B-2.6 patch wrapped Fills and Credits in `pit-table.tsx` but left the
Win/Loss cell as bare `formatCents(pit.win_loss_estimated_total_cents)`. The
field name includes `_estimated_` yet carried no authority envelope — a
provenance signal mismatch visible to any replay consumer.

Fix: wrapped as `FinancialValue variant="compact"`, `type: 'estimated'`,
`source: 'shift_metrics'`, `completeness: { status: 'partial' }`. Unused
`formatCents` import removed.

---

**F3 — `entitlement-confirm-panel.tsx:111,129` — Catalog config labeled `'actual'`**

`face_value_cents` and `match_wager_cents` from `reward.metadata` (catalog
configuration authored at reward setup time) were both rendered as
`type: 'actual'` with `source: 'reward_catalog'`. These values are not PFT
ledger facts — they are static catalog master data. Labeling them `'actual'`
misrepresents their provenance classification and would propagate incorrect
authority semantics if the loyalty reward issuance surface is ever replayed.

Fix: relabeled to `type: 'compliance'`. The `'compliance'` authority tier
(`bg-purple` badge) is the correct envelope for catalog-configured values:
isolated from the D5 operational degradation chain, non-ledger, non-operational.
`source: 'reward_catalog'` and `completeness: { status: 'complete' }` preserved.

---

### S2 — Surface Semantic Drift (deferred — not replay-blocking)

| Finding | File | Notes |
|---|---|---|
| F4 | `rundown-report-card.tsx` | Acknowledged Phase 1.2 deferral; DTO already has blanket deferral comment |
| F5 | `alerts-panel.tsx`, `cash-observations-panel.tsx`, `alerts-strip.tsx` | Explicit "Observational Only" / "TELEMETRY" labels at surface mitigate risk |
| F6 | `casino-summary-card.tsx` | KPI surface with raw `formatCents`; patch during post-Wave-2 stabilization |

### S3 — Ontology Clarification Only (document, no code)

| Finding | File | Notes |
|---|---|---|
| F7 | `hero-win-loss-compact.tsx:16` | `metricGrade` prop uses `'ESTIMATE'`/`'AUTHORITATIVE'` vocabulary vs ADR-054 `FinancialAuthority`; document mapping; code defect addressed by F1 fix |

---

## B-1 Findings and Closure

B-1 resolution criteria per `wave-2-blockers.md`:

| Criterion | Pre-session state | Post-session state |
|---|---|---|
| 1 — Dependency Event terminology in all Wave 2 planning docs | Mostly met; present in 6 of 7 core docs | ✅ Met — blocker gate doc confirmed already contained the concept |
| 2 — Outbox scope as Projection Input propagation | ✅ Met | ✅ Met — unchanged |
| 3 — Wave 2 UL clarification note produced | ❌ Not met — content distributed, no single artifact | ✅ Met — `WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md` created |

Additional fix: `wave-2-tranactional-outbox-guidance.md` line 279 comment
`// table_id` removed. The comment implied `aggregate_id` is always a `table_id`,
which is incorrect and misleading for teams implementing producer wiring.

**B-1 closed:** `wave-2-blockers.md` updated to RESOLVED; document-level
`status` frontmatter updated to RESOLVED; resolution note and reference to the
clarification note added.

---

## What the Clarification Note Establishes

`WAVE-2-UBIQUITOUS-LANGUAGE-CLARIFICATION.md` codifies six points required for
Wave 2 producer wiring:

1. `projection participation ≠ authority semantics` — the core distinction
2. Dependency Event definition (fills, credits, inventory snapshots)
3. Surface contract preservation (`'actual'` = ledger, `'estimated'` = non-ledger)
4. Projection Input scope (`Authority Fact | Telemetry Fact | Dependency Event`)
5. Conservative authority default (absent provenance must never escalate to `'actual'`)
6. Containment boundary (no expansion into reconciliation, settlement, or accounting ontology)

---

## Provenance Stability Confirmation

No changes to:
- PFT write paths or `player_financial_transaction` authoring
- Grind authoring paths
- MTL or compliance surfaces
- Service layer, hooks, DTOs, migrations, or RPC signatures
- Event lineage or attribution boundaries

All patches corrected surface label discipline only.

---

## Pre-Wave-2 Blocker Gate Status

| Blocker | Status |
|---|---|
| B-1 — UL Semantic Stabilization | **RESOLVED** (`70937071`) |
| B-2 — Surface Violation Patches | **RESOLVED** (`e3765c04`) |

**Wave 2 producer wiring is unblocked.**

Remaining stabilization work (S2/S3 above) must not delay Wave 2. Per
`CONTAINED-PRE-WAVE-2-BLOCKER-REMEDIATION-STRATEGY.md`, broader convergence
passes are post-Wave-2 iterative work.
