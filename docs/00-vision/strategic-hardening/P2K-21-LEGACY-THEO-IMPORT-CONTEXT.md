# P2K-21: Legacy Theo Import Pipeline — Context & Scoping Report

**Date:** 2026-03-27 | **Jira:** P2K-21 (High) | **Wedge:** A — Theo Integrity
**Status:** Pre-development context gathering | **Author:** Agent (requested by operator)

---

## 1. What Exists Today

| Component | Status | Location |
|-----------|--------|----------|
| `rating_slip.legacy_theo_cents` column | **DEPLOYED** | Migration `20260307114435` |
| `rating_slip.computed_theo_cents` column | **DEPLOYED** | Migration `20260307114435` |
| Partial index for discrepancy queries | **DEPLOYED** | `idx_rating_slip_theo_discrepancy` — covers rows where both columns are non-null |
| Theo materialization at slip close | **OPERATIONAL** | `rpc_close_rating_slip` writes `computed_theo_cents` via `calculate_theo_from_snapshot()` |
| Discrepancy widget (UI) | **DEPLOYED** | `components/measurement/theo-discrepancy-widget.tsx` — renders empty state, waiting on data |
| Discrepancy query service | **DEPLOYED** | `services/measurement/queries.ts` — `queryTheoDiscrepancy()` with table/pit filters |
| Player CSV import pipeline (Lane 1) | **OPERATIONAL** | `services/player-import/` — identity-only, does NOT populate theo |
| **Legacy theo import pipeline** | **NOT STARTED** | No code, no format spec, no RPC |

**Bottom line:** The entire read path (schema, index, query, UI) is wired and waiting. The only missing piece is a write path that populates `legacy_theo_cents`.

---

## 2. What "Legacy" Means — and the Bridge Mechanism

### The Bridge Is Always a CSV Upload

The hardening reports and ADR-039 reference "legacy data" and an "external partner dependency" without specifying the mechanism. In practice, **the bridge between any legacy pit management system and PT-2 is always a CSV upload** — the same operational motion as the existing player onboarding pipeline (Lane 1). There is no live API integration, no real-time feed, no parallel system coupling. Someone exports a file from the old system, uploads it to PT-2, and PT-2 maps it to its own data model.

This is true regardless of timing:
- Data from before PT-2 existed at the casino → CSV upload
- Data from a period when both systems were running → CSV upload
- Data from a casino that just signed up → CSV upload

### The Real Distinction: Do Matching Slips Exist in PT-2?

The word "legacy" in ADR-039 is ambiguous. It could refer to data from an enrolled casino or a brand-new casino. The scoping question isn't *when* the data comes from — it's **whether PT-2 already has rating slips that the imported theo values can be matched against**.

| | Slips exist in PT-2 | No slips in PT-2 |
|---|---|---|
| **What it means** | Casino was on PT-2 during the period covered by the CSV — both systems tracked the same sessions | Casino wasn't on PT-2 yet — only legacy data exists for that period |
| **Import action** | UPDATE `legacy_theo_cents` on matched rows | Must CREATE entire entity chains: `player` → `visit` → `rating_slip` |
| **Comparison possible?** | Yes — both `computed_theo_cents` and `legacy_theo_cents` populated on the same slip | No — only `legacy_theo_cents` exists; PT-2 never computed theo for these sessions |
| **Value proposition** | "Here's what your old system got wrong" — side-by-side discrepancy | Historical context only — no PT-2 computation to compare against |

This yields two scenarios with the **same upload mechanism** but fundamentally different pipeline complexity.

### Scenario A: Backfill — Matching Slips Exist

> The casino used PT-2 during a period also covered by legacy system data. An admin exports theo values from the old system as CSV, uploads to PT-2, and PT-2 matches each row to an existing `rating_slip` by natural keys (`gaming_day` + `table` + `player`). The import is a columnar UPDATE — it writes `legacy_theo_cents` onto rows that already have `computed_theo_cents`, enabling the discrepancy widget.

**Characteristics:**
- Rating slips already exist in `rating_slip` with valid `computed_theo_cents`
- Import is a **columnar backfill** — UPDATE existing rows, not INSERT new ones
- Match key: `gaming_day` + `table_id` (resolved from CSV identifier) + `player_id` (resolved from CSV identifier) + optional `session_start` for disambiguation
- Row count: hundreds to low thousands per casino
- CSV format: flat, one row per slip/session, ~5-6 columns
- Pipeline: CSV upload → stage → resolve identifiers → match to slips → preview → batch UPDATE → audit trail
- **This is what P2K-21 currently describes and is sized for (2-3 days)**

### Scenario B: Onboarding — No Matching Slips

> A new casino adopts PT-2 and wants to bring historical session data from their legacy system. No rating slips exist in PT-2 for that period. The import must create entire entity chains — resolving or creating players, opening visits, inserting rating slips — and populate `legacy_theo_cents` as the only theo value. There is no `computed_theo_cents` because PT-2 never saw these sessions (and may lack the game settings snapshots needed to retroactively compute one).

**Characteristics:**
- No existing rating slips to match against — the import creates rows
- Must also resolve or create `player`, `visit`, and potentially `table` records
- `computed_theo_cents` will be null — PT-2 can't compute theo without the original game settings snapshot from that session
- Row count: tens of thousands to hundreds of thousands (years of history)
- CSV format: complex multi-entity export (players, sessions, slips, theo, comps) or multiple coordinated CSVs
- Pipeline: multi-stage ETL with entity resolution, deduplication, referential integrity, cascading rollback
- Dependencies: player import (Lane 1) must run first; table/game setup must exist
- **This is NOT what P2K-21 describes — it's a separate, much larger effort**

### Side-by-Side Comparison

| Dimension | Scenario A (Backfill) | Scenario B (Onboarding) |
|-----------|----------------------|------------------------|
| Upload mechanism | CSV upload | CSV upload (same) |
| Rating slips exist? | Yes — UPDATE only | No — INSERT required |
| Entities touched | `rating_slip` only | `player`, `visit`, `rating_slip`, possibly `table`, `game_settings` |
| Match strategy | Natural key resolution (table + player + day) | Entity resolution (fuzzy match on player identity, create missing entities) |
| `computed_theo_cents` | Already populated by PT-2 | Null — PT-2 never saw the session |
| Row volume | 100s–1,000s | 10,000s–100,000s |
| Effort | 2-3 days (P2K-21) | 2-4 weeks (separate epic) |
| External dependency | Legacy CSV export format | Legacy CSV export format + full schema mapping + entity resolution rules |
| Validates PT-2 value prop? | **Yes** — discrepancy proves PT-2 accuracy | No — provides historical baseline but no comparison is possible |
| ADR-039 alignment | Direct — this is what D2/Artifact 1 describes | Extends beyond ADR-039 scope |
| Reuses Lane 1 pattern? | Yes — same CSV upload UX, staging tables, batch RPCs | Partially — same upload UX but pipeline is multi-entity ETL |

---

## 3. Recommendation: Scope P2K-21 as Scenario A Only

P2K-21 should be scoped strictly to **Scenario A (backfill onto existing slips)**. Reasons:

1. **ADR-039 intent:** The measurement layer was designed to surface "what legacy got wrong." This comparison only works when both `computed_theo_cents` (from PT-2) and `legacy_theo_cents` (from the CSV) exist on the same slip. Scenario B produces slips with only legacy values — no comparison is possible.
2. **Wedge A value claim:** The hardening narrative is "PT-2's deterministic theo exposes discrepancies in legacy opaque calculations." Scenario A delivers this directly. Scenario B does not.
3. **Same upload mechanism, different pipeline:** Both scenarios use CSV upload, but Scenario A is a columnar UPDATE while Scenario B is multi-entity INSERT with cascading dependencies. The upload UX is reusable; the backend pipeline is not.
4. **Effort containment:** 2-3 days for Scenario A vs. 2-4 weeks for Scenario B. P2K-21 was sized at 2-3 days in every hardening report.
5. **Pilot containment protocol:** Scenario B (onboarding ETL) would fail the seven-question filter — it's a separate bounded problem with different stakeholders, different data volumes, and different rollback requirements.

**Scenario B should be tracked as a separate epic** (e.g., P2K-XX "Historical Casino Onboarding Pipeline") with its own design phase, since it involves multi-entity ETL, entity resolution, and potentially a different data contract per legacy vendor.

---

## 4. P2K-21 Scope Definition (Scenario A)

### 4.1 Input Contract

A CSV file exported from the legacy pit management system with at minimum:

| Column | Type | Required | Purpose |
|--------|------|----------|---------|
| `gaming_day` | DATE | Yes | Match key — which day |
| `table_identifier` | TEXT | Yes | Match key — legacy table name or number |
| `player_identifier` | TEXT | Yes | Match key — player card number, external_id, or email |
| `session_start` | TIMESTAMP | No | Disambiguation for multi-session days |
| `legacy_theo` | NUMERIC | Yes | The legacy system's theo value (dollars or cents — must declare) |
| `currency_unit` | TEXT | No | `dollars` or `cents` — default `dollars`, converted to cents on import |

**Match strategy:** `gaming_day` + `table_id` (resolved from `table_identifier`) + `player_id` (resolved from `player_identifier`) → finds the `rating_slip` row. If `session_start` is provided, uses it to disambiguate multiple slips on the same day/table/player.

### 4.2 Pipeline Shape

```
CSV Upload → Parse & Validate → Stage (staging table)
  → Resolve Identifiers (table, player)
    → Match to Existing Slips
      → Preview (show match rate, unmatched rows, conflicts)
        → Execute (batch UPDATE rating_slip SET legacy_theo_cents = ?)
          → Audit Trail (import batch record with row-level results)
```

### 4.3 Required Artifacts

| Artifact | Type | Notes |
|----------|------|-------|
| `legacy_theo_import_batch` | Table | Staging + audit trail (mirrors `player_import_batch` pattern) |
| `legacy_theo_import_row` | Table | Per-row staging with match status |
| `rpc_import_legacy_theo_stage` | RPC (DEFINER) | Stage rows with validation |
| `rpc_import_legacy_theo_execute` | RPC (DEFINER) | Resolve matches + batch UPDATE |
| `services/measurement/legacy-import.ts` | Service | Factory following service layer pattern |
| Admin UI panel | Component | Upload + preview + execute (can reuse player-import wizard pattern) |
| API routes | Route handlers | `/api/v1/measurement/legacy-theo-import/` |

### 4.4 Security Requirements

- All RPCs: SECURITY DEFINER with `set_rls_context_from_staff()` (ADR-024)
- Casino-scoped: import only touches `rating_slip` rows within the actor's casino
- Role gate: `admin` only (pit_boss should not run data imports)
- Immutability: `legacy_theo_cents` is write-once — reject re-import for already-populated slips unless explicit `overwrite` flag
- Audit: every import creates a batch record with row-level success/failure/skip counts

### 4.5 Reuse from Player Import (Lane 1)

The existing `services/player-import/` pipeline provides a proven pattern:

| Pattern | Reusable? | Notes |
|---------|-----------|-------|
| Batch lifecycle (create → stage → execute) | Yes | Same 3-phase pattern |
| Papa Parse CSV parsing | Yes | Same client-side parser |
| Column auto-detection | Partially | Different column names but same approach |
| Chunked row staging (500/request) | Yes | Same chunking strategy |
| Admin wizard UI (6-step) | Partially | Simpler — fewer columns, but same flow |
| Staging table + RPC pattern | Yes | Same architecture |
| RLS/DEFINER pattern | Yes | Same security model |

---

## 5. Scenario B: What a New Casino Onboarding Pipeline Would Require

For the record — this is **out of scope for P2K-21** but should be documented so it doesn't get conflated.

### 5.1 The Problem

When a new casino adopts PT-2, they may want to import historical data:
- **Players** — already handled by Lane 1 (`services/player-import/`)
- **Tables** — currently manual setup; no import pipeline exists
- **Historical sessions** — visits + rating slips with theo, avg bet, duration, etc.
- **Historical loyalty** — points balances, tier history, comp history

### 5.2 Why It's Different

| Concern | Scenario A (P2K-21) | Scenario B (Onboarding) |
|---------|---------------------|------------------------|
| Entity creation | None — UPDATE only | Must INSERT visits, rating slips |
| Referential integrity | Slips already linked to players/tables | Must resolve player → create visit → create slip chain |
| Game settings | Already configured (casino is live) | Must be reconstructed or imported to compute theo |
| Computed theo | Already materialized by PT-2 | Cannot be computed — PT-2 never saw the session |
| Deduplication | Match on natural keys | Must handle vendor-specific ID schemes |
| Error surface | Small — bad match → skip row | Large — cascading failures across entities |
| Rollback | Simple — SET legacy_theo_cents = NULL | Complex — must delete across multiple tables |

### 5.3 Estimated Scope

- **Design phase:** 1 week (data contract per legacy vendor, entity resolution strategy, rollback plan)
- **Implementation:** 2-3 weeks (multi-entity pipeline, admin UI, validation, testing)
- **Separate PRD required** — not an extension of P2K-21
- **Separate Jira epic** recommended

---

## 6. External Dependencies & Open Questions

### For P2K-21 (Scenario A) — Answers Needed Before Development

| # | Question | Why It Matters | Default If No Answer |
|---|----------|---------------|---------------------|
| 1 | What legacy system(s) are in play? (CMP, Table Master, InfoGenesis, custom?) | Determines CSV column names and data quirks | Generic CSV with documented column contract |
| 2 | Is theo reported in dollars or cents? | Unit mismatch = 100x discrepancy | Assume dollars, convert to cents on import |
| 3 | What identifies a session in legacy? (slip ID, timestamp, table+time?) | Determines match strategy | `gaming_day` + `table` + `player` composite match |
| 4 | What period does the legacy data cover? Does it overlap with PT-2 usage? | Determines whether matching slips exist (Scenario A) or not (Scenario B) | Validate at preview step — match rate reveals overlap |
| 5 | Can we get a sample CSV export? | Validates our column mapping assumptions | Build generic, let admin map columns |

### For Scenario B (Onboarding) — Future Epic

| # | Question |
|---|----------|
| 1 | How many legacy vendors do we need to support? |
| 2 | Is historical visit/session data available or only summary stats? |
| 3 | Do we need historical loyalty import or just current balances? |
| 4 | What's the expected data volume per casino? |
| 5 | Is there a sales/onboarding timeline driving this? |

---

## 7. Development Plan (P2K-21 Only)

**Estimated effort:** 2-3 days (assumes Scenario A scope)

| Day | Deliverable |
|-----|------------|
| 1 | PRD-0XX + migrations (staging tables, RLS) + RPCs (stage + execute) |
| 2 | Service layer + API routes + integration tests |
| 3 | Admin UI (upload + preview + execute) + E2E test + SRM update |

**Prerequisite:** At minimum, answers to questions #1-#3 above, or a decision to build a generic column-mapping pipeline that doesn't assume a specific legacy vendor format.

---

## 8. Summary

| Statement | |
|-----------|--|
| Bridge mechanism | Always a CSV upload — same motion as Lane 1 player import. No live integration. |
| P2K-21 as scoped in Jira | Scenario A — backfill `legacy_theo_cents` onto existing slips via CSV upload |
| "Legacy" in ADR-039 context | Theo values from any prior system, uploaded as CSV. Comparison requires matching PT-2 slips to exist. |
| Broader onboarding gap | Scenario B — full historical import for new casinos. Same upload UX, different pipeline (multi-entity INSERT vs. columnar UPDATE). Separate effort. |
| Blocks Wedge A 92% → ~97% | Yes — completes the theo discrepancy narrative |
| External dependency | Legacy CSV export format (sample file needed) |
| Ready to develop? | Yes, once external format is clarified or generic column-mapping is chosen |

---

*Report generated 2026-03-27. Informs PRD authoring for P2K-21 build phase.*
