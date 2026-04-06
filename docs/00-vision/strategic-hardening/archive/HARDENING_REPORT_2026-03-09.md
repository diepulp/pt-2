# PT-2 Hardening Status Report: Implemented Functionality vs. Marketing Claims

**Date:** 2026-03-09 | **Baseline:** Strategic Hardening Audit (2026-03-01) | **Branch:** `main` (commit `0ad7fb7`)
**Supersedes:** `HARDENING_REPORT_2026-03-08 .md`

---

### What Shipped Since the Audit

| Delivery | Commit | Date | Impact |
|----------|--------|------|--------|
| **PRD-042** Admin Settings | `8de05e8` | Mar 4 | Threshold config UI, gaming day/shift settings |
| **PRD-040** Admin Alerts + Role Guard | `373de2f` | Mar 6 | Admin layout, `/admin/alerts` page, sidebar badge, role guard |
| **EXEC-044** p_casino_id Removal | `97a959c` | Mar 6 | Final 4 spoofable parameters removed |
| **ADR-040** Identity Provenance Rule | `0057086` | Mar 7 | Category A/B identity attribution |
| **EXEC-045** Standards Foundation + ADR-039 | `c298cce` | Mar 7 | Measurement Layer schema, views, RPCs, governance docs |
| **SRM v4.18.0** | same merge | Mar 7 | Measurement Layer registered with full artifact provenance |
| **EXEC-046** Measurement Reports Dashboard (Slice 1) | `324de01` | Mar 8 | 4 measurement widgets on `/admin/reports`, BFF endpoint, service layer |
| **PRD-047** Shift Dashboard Provenance Alignment (Slice 2) | `289c079` | Mar 8 | 8 MEAS rows (005–012), provenance matrix v2.0.0, consistency audit |
| **PRD-048** Pit Dashboard RSC Refactor (Slice 3) | `0ad7fb7` | Mar 9 | RSC prefetch + HydrationBoundary, live coverage data in analytics panel |

#### Hardening Slice Cross-Reference

The hardening slices are numbered 0–3. The table below maps slice numbers to PRD/EXEC identifiers for clarity.

| Slice | PRD / EXEC | Title | Status |
|-------|-----------|-------|--------|
| 0 | EXEC-045 | Standards Foundation (Surface Classification + Provenance Matrix) | Complete |
| 1 | EXEC-046 / PRD-046 | ADR-039 Measurement Reports Dashboard | Complete (PR #21) |
| 2 | PRD-047 / EXEC-047 | Shift Dashboard Provenance Alignment | Complete |
| 3 | PRD-048 / EXEC-048 | Pit Dashboard RSC Refactor | Complete (PR #22) |

Full manifest: `docs/00-vision/PT-ARCH-MAP/HARDENING-SLICE-MANIFEST.md`

---

### Marketing Claim Mapping

#### 1. "Measure theoretical win discrepancies"

| Component | Status | Evidence |
|-----------|--------|----------|
| `computed_theo_cents` materialized on every slip close | **FUNCTIONAL** | 3 RPCs updated (close, move, rollover) |
| `calculate_theo_from_snapshot()` deterministic function | **FUNCTIONAL** | IMMUTABLE, exception-safe (defaults to 0) |
| `legacy_theo_cents` column | **SCHEMA READY** | Column exists; no import pipeline yet |
| Discrepancy query surface | **QUERYABLE** | Index `idx_rating_slip_theo_discrepancy` ready |

**Verdict: 70% operational.** PT-2 computes and stores deterministic theo on every slip close. The comparison capability is structurally ready — the column exists, the index exists, the discrepancy query works — but requires legacy data ingestion to produce actual discrepancies. Without imported legacy theo, the system proves its own computation is deterministic but cannot yet show *what legacy got wrong*.

---

#### 2. "Reduce audit trace time from hours to seconds"

| Component | Status | Evidence |
|-----------|--------|----------|
| `measurement_audit_event_correlation_v` | **FUNCTIONAL** | Joins rating_slip + PFT + MTL + loyalty_ledger |
| `security_invoker=true` RLS enforcement | **FUNCTIONAL** | Caller's casino-scoped RLS applies to all source tables |
| End-to-end slip-to-ledger tracing | **FUNCTIONAL** | Single query: slip → financial txn → MTL entry → loyalty accrual |
| Audit log enrichment | **BLOCKED** | Requires audit_log append-only enforcement |

**Verdict: 85% operational.** An auditor can trace any rating slip through the full financial chain in one query today. The base correlation view is live and queryable via PostgREST. The audit_log JOIN variant is blocked pending append-only immutability enforcement — a documented gap but not a showstopper for the core traceability claim.

---

#### 3. "Quantify telemetry coverage across tables"

| Component | Status | Evidence |
|-----------|--------|----------|
| `measurement_rating_coverage_v` | **FUNCTIONAL** | Per-table-session: open_seconds, rated_seconds, rated_ratio |
| Coverage ratio computation | **FUNCTIONAL** | `rated_ratio = rated_seconds / open_seconds` |
| Provenance quality tracking | **FUNCTIONAL** | `GOOD_COVERAGE` / `LOW_COVERAGE` / `NONE` with coverage_ratio |
| Pit Terminal per-table coverage | **FUNCTIONAL** | Live `rated_ratio`, `untracked_seconds`, `coverage_tier` per table (PRD-048) |
| Ghost/idle time accounting | **PLACEHOLDER** | Always 0 (MVP) |

**Verdict: 85% operational** (up from 80%). PT-2 can answer "what percentage of your table-hours have rating data" right now. The view computes `rated_ratio` per table session. PRD-048 (Slice 3) wired live coverage data into the Pit Terminal analytics panel — operators now see per-table `rated_ratio`, `untracked_seconds`, and `coverage_tier` from `measurement_rating_coverage_v` (MEAS-003). Ghost and idle time remain documented placeholders (always 0).

---

#### 4. "Compute daily loyalty liability exposure"

| Component | Status | Evidence |
|-----------|--------|----------|
| `loyalty_liability_snapshot` table | **FUNCTIONAL** | `(casino_id, snapshot_date)` unique, monetary value in cents |
| `loyalty_valuation_policy` table | **FUNCTIONAL** | `cents_per_point`, partial unique index for one-active-per-casino |
| `rpc_snapshot_loyalty_liability()` | **FUNCTIONAL** | SECURITY DEFINER, idempotent UPSERT, pit_boss/admin gated |
| Append-only loyalty ledger | **FUNCTIONAL** | 3-layer immutability (RLS + REVOKE + trigger guard) |

**Verdict: 95% operational.** This is the most complete measurement surface. Daily snapshots can be taken today — the RPC aggregates `player_loyalty.current_balance`, values it via active policy, and stores with trend history. The only gap is automation (no cron/batch job — requires manual RPC invocation or a scheduled trigger).

---

#### 5. "Eliminate actor spoofing and mutation ambiguity"

| Component | Status | Evidence |
|-----------|--------|----------|
| `set_rls_context_from_staff()` | **FUNCTIONAL** | JWT → staff table → authoritative context derivation |
| `p_actor_id` removal | **COMPLETE** | All RPCs remediated (SEC-007, EXEC-040, EXEC-044) |
| `p_casino_id` removal | **COMPLETE** | All 14 spoofable parameters eliminated |
| ADR-040 Identity Provenance Rule | **SHIPPED** | Category A/B classification with zero-tolerance enforcement |
| 272 SECURITY DEFINER RPCs | **FUNCTIONAL** | All use authoritative context, no spoofable params |
| Admin role guard | **FUNCTIONAL** | RSC layout guard, staff table lookup, no-flash redirect |

**Verdict: 100% operational.** This is fully delivered. Every mutation pathway enforces authoritative actor context derived from JWT + staff table. No RPC accepts user-supplied identity parameters. The admin route group enforces role-based access at both the database and application layers.

---

### Economic Delta Assessment

From the Economic Delta Distillation's four "activation artifacts":

| Artifact | Activation Status | Economic Signal Available |
|----------|------------------|--------------------------|
| `rating_slip.legacy_theo` | Schema ready, data pipeline missing | **Not yet** — needs CSV import |
| `audit_event_correlation_v` | **Live and queryable** | **YES** — end-to-end trace in seconds |
| `telemetry_completeness_v` | **Live and queryable** | **YES** — coverage ratio per table session |
| `loyalty_liability_snapshots` | **Live and callable** | **YES** — daily dollar-valued snapshots |

**3 of 4 economic delta artifacts are functional today.** The fourth (theo discrepancy) has the infrastructure but awaits data.

---

### Aggregate Scorecard

| Wedge | Audit Rating (Mar 1) | Previous (Mar 8) | Current (Mar 9) | Delta (from audit) |
|-------|----------------------|------------------|-----------------|---------------------|
| **A — Theo Integrity** | AMBER (85%) | AMBER (90%) | **AMBER (90%)** | +5pp: computed_theo materialized, provenance views live |
| **B — Compliance Acceleration** | GREEN (90%) | GREEN (95%) | **GREEN (95%)** | +5pp: CRITICAL security fixes shipped, correlation view live |
| **C — Shift Intelligence** | AMBER (40%) | AMBER (55%) | **AMBER (57%)** | +17pp: admin alerts, threshold config, role guard, pit RSC refactor |
| **D — Loyalty Margin Clarity** | AMBER (80%) | GREEN (92%) | **GREEN (92%)** | +12pp: liability snapshot RPC + valuation policy table live |

---

### What "Sellable" Looks Like Today

**Can say with evidence:**
> "PT-2 traces any financial event from rating slip to loyalty ledger in one query. It measures rating coverage per table in real time — visible to pit bosses on the floor. It computes daily reward liability to the dollar. Every mutation is gated by authoritative identity — no actor spoofing is possible."

**Cannot yet say:**
> "PT-2 surfaces theo discrepancies hidden by opaque legacy reporting." *(Needs legacy data import pipeline.)*

**The gap between current state and the full marketing narrative is one data pipeline** — the CSV import for `legacy_theo_cents`. Everything else is either functional or queryable today.

---

### Operational Value Summary

The hardening sprint (Mar 1–9) converted latent architectural advantages into **queryable measurement surfaces**:

- **272 RPCs** enforce authoritative context with zero spoofable parameters
- **2 cross-context views** span bounded contexts under `security_invoker=true` governance
- **1 liability snapshot RPC** produces dollar-valued daily loyalty exposure
- **8 configurable alert thresholds** with admin UI for operator control
- **12 MEAS rows** in the Metric Provenance Matrix (MEAS-001 through MEAS-012)
- **SRM v4.18.0** formally governs all measurement artifacts with provenance tracking
- **4 hardening slices** complete: standards foundation → measurement UI → shift provenance → pit RSC refactor

---

### UI Surface Status: Where Measurement Data Is Displayed

The operative guidance (`PT2_Measurement_Surface_Guidance.md`) prescribes four surface targets. Here is what exists today:

#### Shift Dashboard V3 — PRIMARY PRODUCTION SURFACE

**Status: ACTIVE — substantial measurement data rendered**

The shift dashboard (`components/shift-dashboard-v3/`) is the most measurement-rich surface in PT-2. It displays provenance and quality metadata across all three panels:

| Component | Data Displayed | Location |
|-----------|---------------|----------|
| **CoverageBar** | `snapshot_coverage_ratio`, `coverage_tier` (HIGH/MEDIUM/LOW/NONE) | Header |
| **MetricGradeBadge** | ESTIMATE vs AUTHORITATIVE confidence | Left rail hero, center table |
| **OpeningSourceBadge** | Baseline source (Est. from par / Partial window / No baseline) | Center metrics table |
| **TelemetryQualityIndicator** | GOOD_COVERAGE / LOW_COVERAGE / NONE per table | Center metrics table |
| **ProvenanceTooltip** | Source, quality, coverage_ratio, null_reasons | Hover on any metric |
| **MissingDataWarning** | NULL metric indicators | Inline/block |
| **Quality Summary** | Telemetry quality counts by tier | Left rail |
| **Win/Loss Hero** | `win_loss_estimated_total_cents` with `metric_grade` | Left rail |

**What the dashboard does NOT yet show:** The `measurement_rating_coverage_v` view data (table-session-scoped `rated_seconds`, `rated_ratio`, `untracked_seconds`). The coverage bar uses `snapshot_coverage_ratio` from shift metrics — a related but distinct metric. The guidance prescribes a compact Coverage widget showing casino-level `accounted_ratio` and ranked tables by `untracked_ratio`. This is **not yet built** as a dedicated widget. Four `data-slot` expansion divs remain empty and ready for injection.

#### Pit Terminal — LIVE COVERAGE DATA (PRD-048, Slice 3)

**Status: PARTIAL — live measurement coverage wired, other metrics still mocked**

PRD-048 (Slice 3, commit `0ad7fb7`, PR #22) converted the pit dashboard from a client-only shell to a governed surface with RSC prefetch + HydrationBoundary and wired live measurement data into the analytics panel.

**What is now live:**

| Component | Data Source | Metrics Displayed |
|-----------|------------|-------------------|
| **AnalyticsPanel — Rating Coverage** | `measurement_rating_coverage_v` via `useTableCoverage` hook | `rated_ratio`, `untracked_seconds`, `coverage_tier` (HIGH/MEDIUM/LOW), `slip_count`, `rated_seconds` per selected table |

The coverage section renders real data from MEAS-003 with tier-based color coding, skeleton loading, and empty-state handling. Coverage tier is derived using the canonical `getCoverageTier()` function from `snapshot-rules`.

**What remains mocked (explicitly labeled "Placeholder"):**

Win/Loss, Handle, Avg Session, Active Players — displayed at 60% opacity with a "Placeholder" badge. These are not measurement-layer artifacts and require separate data wiring outside the hardening scope.

**What PRD-048 also delivered:**
- RSC server-side prefetch for tables + stats + gaming day (eliminates client loading waterfall)
- `hooks/dashboard/` module with `useTableCoverage`, key factory, HTTP fetcher, types
- Extended `services/measurement/queries.ts` with coverage query support
- Surface Classification Declaration (`SLICE-3-PIT-DASHBOARD-DECLARATION.md`)

#### Rating Slip Detail — NO AUDIT TRACE PANEL

**Status: NOT IMPLEMENTED**

The guidance prescribes a "Slip Detail → Audit Trace" panel showing the correlation chain (slip close → financial txn → MTL entry → loyalty accrual). The `measurement_audit_event_correlation_v` view exists and is queryable, but no UI component consumes it. The rating slip modal is unchanged. `BuyInThresholdIndicator` exists for compliance threshold display but is not measurement lineage.

#### Admin Reports — FULLY IMPLEMENTED (EXEC-046, Slice 1)

**Status: FULLY IMPLEMENTED — merged to `origin/main` on 2026-03-08 (PR #21, commit `324de01`)**

EXEC-046 (PRD-046) replaces the stub with a full measurement reports dashboard:

| Widget | Metric | Data Source | Filter Support |
|--------|--------|-------------|----------------|
| **Theo Discrepancy** (MEAS-001) | Discrepancy rate, total cents, breakdown | `rating_slip` (computed vs legacy) | Pit, Table |
| **Audit Correlation** (MEAS-002) | Full-chain rate, slip/PFT/MTL/loyalty counts | `measurement_audit_event_correlation_v` | Casino-level only |
| **Rating Coverage** (MEAS-003) | Avg coverage ratio, rated/open/untracked seconds | `measurement_rating_coverage_v` | Pit, Table |
| **Loyalty Liability** (MEAS-004) | Total points, dollar value, valuation rate | `loyalty_liability_snapshot` + `loyalty_valuation_policy` | Casino-level only |

**Architecture:** RSC page with server-side prefetch → HydrationBoundary → client dashboard. BFF endpoint (`GET /api/v1/measurement/summary`) uses `Promise.allSettled` for partial-success (one metric failure does not block others). Dual-layer role guard (admin layout + handler-level). All queries include `.eq('casino_id', casinoId)` as defense-in-depth with RLS.

---

### UI Surface Allocation Summary

| Surface | Guidance Target | Backend Ready | UI Implemented | Status |
|---------|----------------|---------------|----------------|--------|
| **Admin Reports** — 4 measurement widgets | All 4 MEAS artifacts | **YES** | **YES** (EXEC-046) | COMPLETE |
| **Pit Terminal** — Table coverage | Per-table rated/untracked/tier | **YES** | **YES** (PRD-048) — live `rated_ratio`, `untracked_seconds`, `coverage_tier` | COMPLETE (coverage); other metrics remain placeholder |
| **Shift Dashboard** — Coverage widget | `measurement_rating_coverage_v` aggregate | **YES** | **NO** — CoverageBar uses shift-metrics provenance, not measurement view | GAP: Dedicated widget with `accounted_ratio` + table ranking |
| **Slip Detail** — Audit Trace panel | `measurement_audit_event_correlation_v` | **YES** | **NO** — modal unchanged | GAP: Collapsible lineage panel in slip modal |

#### What the Shift Dashboard Already Proves

Despite the measurement view gap, the shift dashboard is already the most data-rich operational surface in the system. Its trust layer components (`CoverageBar`, `MetricGradeBadge`, `OpeningSourceBadge`, `TelemetryQualityIndicator`, `ProvenanceTooltip`) actively communicate data confidence to operators — a capability that does not exist in legacy systems. The provenance metadata (source classification, quality grading, coverage ratios) is rendered inline, not hidden in tooltips or footnotes.

This is structurally significant: operators see **why** a number might be uncertain, not just what the number is. Legacy systems present all numbers with equal confidence regardless of underlying data quality.

---

### Remaining Gaps

#### UI Surface Gaps (backend ready, frontend missing)

| Gap | Prescribed By | Effort | Priority |
|-----|--------------|--------|----------|
| **Shift Dashboard — Coverage widget** | Measurement Surface Guidance §1 | Small — fill existing `data-slot` expansion divs in 3-panel layout | P1 (operational) |
| **Slip Detail — Audit Trace panel** | Measurement Surface Guidance §2 | Medium — collapsible section in rating slip modal + new query hook | P2 (investigative) |

#### Non-UI Gaps

| Gap | Impact | Effort | Priority |
|-----|--------|--------|----------|
| **Legacy theo import pipeline** | Theo discrepancy widget shows empty state; blocks "what legacy got wrong" narrative | Depends on external data source format | P1 |
| **Automated liability snapshots** | RPC works but requires manual invocation; no cron/scheduler | Small — pg_cron or external scheduler | P2 |
| **Audit log append-only enforcement** | Blocks enriched audit trace variant (base variant works) | Small — RLS + trigger (ADR-039 Approval Condition 1) | P2 |
| **Shift baseline service** | Wedge C at 57%; drop/hold/promo anomalies can't fire without rolling median+MAD | Large — 2-3 days | P1 (Wedge C) |
| **Alert persistence + state machine** | Alerts are ephemeral (computed on RPC call, not stored) | Large — 3-4 days | P1 (Wedge C) |

---

### Hardening Slice Completion Summary

All four planned hardening slices are now complete:

| Slice | What It Proved | Key Artifacts |
|-------|---------------|---------------|
| **0 — Standards Foundation** | Governance standards can be created before implementation begins | Surface Classification Standard, Metric Provenance Matrix (4 rows) |
| **1 — Measurement UI** | Cross-cutting measurement data can be surfaced through BFF + RSC with governance compliance | 4 widgets, service layer, BFF endpoint, E2E tests |
| **2 — Shift Provenance** | Existing surfaces can be audited for truth-bearing metric provenance | 8 new MEAS rows (005–012), consistency audit (6/6 PASS), audit template |
| **3 — Pit Refactor** | Existing client-shell surfaces can be refactored to governed surfaces | RSC prefetch, live coverage data, surface classification declaration |

The hardening effort has moved from "building governance standards" (Slice 0) through "proving them on new surfaces" (Slice 1) to "applying them to existing surfaces" (Slices 2–3). The governance framework is now validated across both new and refactored surfaces.

---

### Next Steps

The remaining work falls into two categories:

**Category 1 — UI surface completion (small, bounded):**
- Shift Dashboard coverage widget (slot-fill into existing layout)
- Slip Detail audit trace panel (modal extension)

**Category 2 — Wedge C functional gaps (larger, system-level):**
- Baseline service (rolling median+MAD computation)
- Alert persistence + state machine
- Alert deduplication/throttling

Category 1 is incremental frontend work with all backend infrastructure in place. Category 2 is the long pole — Wedge C remains at 57% and represents the largest distance from the full "operational overlay" claim. The baseline service blocks 60% of anomaly detection value.

---

*Updated 2026-03-09. Previous version: `HARDENING_REPORT_2026-03-08 .md`. Cross-reference: `HARDENING-SLICE-MANIFEST.md` for full artifact inventory per slice.*
