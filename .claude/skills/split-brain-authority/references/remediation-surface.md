# Remediation Surface — Where the Disease Still Lives

This reference owns the **system-wide map of remaining split-brain fractures**: two domains remediated, four candidates outstanding, the legacy-artifact grep map, and the prioritized order of attack. Keep each candidate's fractures distinct — they are different diseases in different organs, not one blended problem.

**CONFIRMED** = direct code/doc evidence. **SUSPECTED** = named in governance docs, not yet verified in code.

## Table of Contents
1. Baseline — The Two Remediated Exemplars
2. The Four Candidate Domains
3. Legacy-Artifact Grep Map
4. Prioritized Order of Attack
5. Evidence Quotes

---

## 1. Baseline — The Two Remediated Exemplars (not candidates)

- **Financial Outbox / Wave 2** — closed via PRD-089; reviewed in SIGP-001. The transport spine is **CLEAR** (structurally sound); residual debt is at the render/consumption boundary (SR-001..008), not transport. Owner: `financial-model-authority`.
- **Table Inventory Accounting (TIA)** — reviewed in SIGP-002; canonized via FIB-H-TIA-CANON-001 / SRL-TIA-001 / ADR-059/060/061. The "two win/loss streams" and "drop = three things" fractures are the canonical remediation pattern. Owner: `tia-canon-authority`. *Its four registered fractures (SRR-002-001..004) belong to TIA — do not blend them into the candidates below.*

---

## 2. The Four Candidate Domains (SIGP §14)

### 2.1 Visit vs Rating Slip — CONFIRMED (Aggregate Split-Brain + Lifecycle Ambiguity)

Two stores own overlapping lifecycle state with no cascading closure and two incompatible definitions of "active."

- **Visit** owns player-level lifecycle via `ended_at` ("active" = `ended_at IS NULL`; `services/visit/schemas.ts:120` enum `['active','closed']`).
- **Rating Slip** owns table-segment lifecycle via a 4-state machine ("active" = `status IN ('open','paused')`; `services/rating-slip/dtos.ts:26-39`, schema enum at `services/rating-slip/schemas.ts:35-41` includes both an `'active'` alias and `open/paused/closed/archived`).
- **No cascade (CONFIRMED):** `closeVisit()` sets `visit.ended_at` but does not touch `rating_slip.status`; the only auto-close path is gaming-day rollover (`supabase/migrations/20260116220541_..._start_or_resume_visit.sql:107-127`, "STEP 6: Close rating slips for stale visits"). A visit can be CLOSED with slips still `'open'`, or stay open while slips are force-closed on rollover.
- **Overloaded "active" and "session"** — same word, different cardinality, different store; Visit uses `visit_group_id`, Rating Slip uses `move_group_id` for "session" continuity (different time boundaries).
- **Third lifecycle owner for financial reconstruction:** `getVisitClassACompleteness()` derives complete/partial from `gaming_day_lifecycle`, not visit state (`services/player-financial/crud.ts:212-248`).
- **Cure fit:** single-formula-owner for lifecycle (name the canonical lifecycle owner + forbidden reconstruction paths). **Deepest fracture, but operationally masked** by the rollover safety net → lower acute risk, high remediation cost (touches all `visit_financial_summary` consumers).

### 2.2 Loyalty — CONFIRMED (Propagation Ambiguity + Authority Ambiguity)

Accrual is simultaneously an authority fact, a projection (balance cache), and a liability (promo coupon); the outbox propagates only a subset.

- **Accrual writes ledger + balance cache but emits NO outbox event** (`rpc_accrue_on_close` inserts `loyalty_ledger` + updates `player_loyalty.current_balance`; no `loyalty_outbox` insert).
- **Promo events emit outbox but write NO ledger entry** (`rpc_issue_promo_coupon` / `rpc_void_promo_coupon` emit to `loyalty_outbox`; coupons live in `promo_coupon`; outbox `ledger_id` nullable for promo). **Accrual = ledger-only; promo = outbox-only — a structural propagation split.**
- **Balance cache vs ledger sum non-reconciliation:** balance "MUST equal SUM(loyalty_ledger.points_delta)" enforced only by RPC discipline + on-demand drift-detection MV; it detects drift, does not prevent it.
- **`reversal` reason defined but has NO RPC** (`services/loyalty/dtos.ts:38`) — correction model undefined.
- **Cure fit:** transactional outbox (make accrual emit; unify event taxonomy with ledger reason codes) + single-owner for the balance projection. **Contained today** (drift detectable, promo liability not yet in financial reporting); urgent when loyalty liability enters financial reporting.

### 2.3 MTL / Compliance — CONFIRMED data-layer separation, CONFIRMED UI-merge + atomicity gap

The fracture is **not** in the data layer (clean) — it is at the UI consumption boundary and the operator-side atomicity contract.

- **Data layer CLEAN:** `mtl_gaming_day_summary` aggregates only `mtl_entry`, never PFT; bridge trigger fires narrowly; isolation rule codified — *"MUST NEVER be aggregated with non-compliance authorities"* (`services/mtl/dtos.ts:15-16`).
- **UI-layer semantic merge (CONFIRMED, HIGH):** the compliance dashboard imports `useCreateFinancialAdjustment` and lets operators create *financial adjustments* (→ PFT) from the *compliance* surface (`components/mtl/compliance-dashboard.tsx:45,104-225`).
- **Bridge atomicity gap (CONFIRMED):** *"No HTTP contract for the compliance side-effect… any future drift (async bridge, fail-open, outbox pattern) silently breaks the compliance guarantee"* (`docs/issues/mtl-rating-slip-glitch/arch-flaw.md:12`). Invariant `INV-MTL-BRIDGE-ATOMICITY`: qualifying buy-in succeeds ⇔ financial_transaction AND mtl_entry both committed. Client spans two HTTP transactions; server spans one DB transaction — atomicity mismatch.
- **Cure fit:** domain-boundary restoration (Domain Boundary Leak) + atomicity contract. **Highest blast radius** — CTR/AML correctness; silent bridge failure breaks a compliance guarantee with no operator signal. Partly scoped already (H1–H4 backlog, PRD-065 deferral).

### 2.4 Operational Intelligence (hold%) — CONFIRMED (Projection Drift + Vocabulary Overload)

The same operational facts computed in two decoupled pipelines, with hold% surfaced in only one.

- **Hold% in two decoupled paths (ISSUE-005):** intelligence path divides `win_loss_inventory_cents / estimated_drop_buyins_cents * 100` (`supabase/migrations/20260323165908_create_shift_baseline_service.sql:172-177`; re-derived in `rpc_get_anomaly_alerts`), surfacing **only** as an anomaly trigger; live-metrics path returns both inputs but never divides — no DTO carries `hold_percent` (`services/table-context/shift-metrics/dtos.ts:66-129`); shift report hardcodes `holdPercent: null`.
- **Win/loss suppressed in DTO, re-derived in mapper** — the seam where OpsIntel still consumes legacy TIA inputs (`dtos.ts:107-110` "suppressed per PRD-090 WS5 / SRL-TIA-001"; `service.ts:224-226` re-sums `estimated_drop_buyins_cents`).
- **Two quality vocabularies:** `telemetry_quality: GOOD/LOW/NONE_COVERAGE` vs `readinessState: ready/stale/missing/insufficient_data/compute_failed` — operators cannot relate them.
- **Cure fit:** single-formula-owner / read-time derivation (ISSUE-005 recommends client-side derivation in the mapper across all three DTO levels — no migration). **Cheapest, clearest win** and the natural continuation of the TIA exemplar.

---

## 3. Legacy-Artifact Grep Map

- **`win_loss_inventory_cents` / `win_loss_estimated_cents` / `estimated_drop_buyins_cents`** — referenced in `services/table-context/shift-metrics/{dtos.ts,service.ts}`, `services/reporting/shift-report/{dtos.ts,assembler.ts}`, `services/shift-intelligence/__tests__/`, `services/player-financial/{crud.ts,mappers.ts,index.ts}`, `services/visit/crud.ts`, `services/rating-slip/mappers.ts`. Mostly suppressed/commented in DTOs (TIA remediation in progress) but **still computed live** in migrations `20260114004336` and `20260323165908`. Only component touch is a test (`components/shift-dashboard-v3/__tests__/metrics-table.test.tsx`).
- **`visit_financial_summary`** — view (`20251213180125`; pit-cash-observation UNION added `20260218203729`); consumed by `services/visit/crud.ts`, `services/rating-slip/mappers.ts`, `services/player-financial/{crud.ts,mappers.ts,index.ts}`. This is the cross-context reconstruction surface binding Visit + Rating Slip + Player-Financial — the shared dependency of the §2.1 fracture.

> These statuses drift as remediation proceeds. Re-grep and confirm against the owning domain skill before acting.

---

## 4. Prioritized Order of Attack

| Rank | Domain | Fracture class | Evidence | Why this rank |
|---|---|---|---|---|
| **1** | **MTL / Compliance** | Domain Boundary Leak + atomicity | CONFIRMED, dedicated issue arc | Regulatory blast radius; silent bridge failure breaks a compliance guarantee; UI already merges compliance + financial writes. Partly scoped (H1–H4, PRD-065). |
| **2** | **OpsIntel (hold%)** | Projection Drift + Vocabulary Overload | CONFIRMED + written ISSUE-005 + low-risk fix | Lowest-cost, highest-clarity win; natural continuation of TIA (same win/loss/drop inputs, PRD-090 WS4 TODO). Ships fast, proves the OpsIntel boundary. |
| **3** | **Loyalty** | Propagation + Authority Ambiguity | CONFIRMED structural split | Latent liability; real but contained (drift detectable). Becomes urgent when loyalty liability enters financial reporting. |
| **4** | **Visit vs Rating Slip** | Aggregate + Lifecycle Ambiguity | CONFIRMED, currently inert | Structurally deepest, but masked by gaming-day rollover; highest remediation cost (most surfaces). Best sequenced after cheaper wins establish the pattern. |

**Two readings:** if the goal is **risk reduction**, start with MTL/Compliance. If the goal is a **fast exemplar to extend the proven pattern**, start with OpsIntel hold%.

---

## 5. Evidence Quotes

1. *Visit/Rating-Slip cascade gap* — `supabase/migrations/20260116220541_..._start_or_resume_visit.sql:107`: only auto-close path is `-- STEP 6: Close rating slips for stale visits (INV-6)`.
2. *Loyalty balance is a verified-post-hoc projection* — `supabase/migrations/20251213003000_prd004_loyalty_service_schema.sql:175`: "Balance MUST equal SUM(loyalty_ledger.points_delta) - enforced by RPCs and verified by drift detection."
3. *Loyalty reversal defined but unimplemented* — `services/loyalty/dtos.ts:38`: `| 'reversal'`.
4. *MTL isolation rule* — `services/mtl/dtos.ts:15-16`: "MUST NEVER be aggregated with non-compliance authorities."
5. *MTL bridge atomicity hole* — `docs/issues/mtl-rating-slip-glitch/arch-flaw.md:12`: "No HTTP contract for the compliance side-effect… silently breaks the compliance guarantee and the client has no way to notice."
6. *Hold% computed only in intelligence path* — `supabase/migrations/20260323165908_create_shift_baseline_service.sql:172-177`.
7. *Win/loss suppressed in live DTO* — `services/table-context/shift-metrics/dtos.ts:107`: "Win/Loss (suppressed per PRD-090 WS5 / SRL-TIA-001 legacy_alias_disposition)".
8. *ISSUE-005 diagnosis* — `docs/issues/gaps/financial-data-distribution-standard/issues/ISSUE-005-HOLD-SPLIT-BRAIN.md:8`: "Hold percent lives in two completely decoupled paths."

### Key file references
- SIGP §14 candidate reviews: `docs/70-governance/SIGP/SEMANTIC_INTEGRITY_GOVERNANCE_PROTOCOL.md:705`
- Exemplar reviews: `docs/70-governance/SIGP/reviews/post-wave-2/SIGP-001-post-wave-2-financial-surface-truth.md`, `docs/70-governance/SIGP/reviews/table-lifecycle/SIGP-002-table-inventory-win-loss-split-brain.md`
- Hold% issue: `docs/issues/gaps/financial-data-distribution-standard/issues/ISSUE-005-HOLD-SPLIT-BRAIN.md`
- MTL glitch arc: `docs/issues/mtl-rating-slip-glitch/{arch-flaw.md,HARDENING-BACKLOG.md,PRD-065-DEFERRAL-RATIONALLE.md}`
