---
title: "Gap Analysis: Table Rundown → Shift Dashboards Data Pipeline (Rewritten w/ Guardrails)"
doc_id: "GAP-TBL-RUNDOWN-SHIFT-PIPELINE"
version: "v0.4.0"
status: "PATCH"
date: "2026-01-15"
owner: "TableContext"
audience: ["Engineering", "Ops", "Compliance"]
depends_on:
  - "SRM v4.0.0 (2025-12-06) (canonical bounded-context ownership)"
  - "ADR-024 RPC Self-Injection (set_rls_context_from_staff)"
  - "ADR-014 Ghost/Shadow Player semantics"
related_docs:
  - "docs/20-architecture/specs/ADDENDUM_TABLE_RUNDOWN_READMODEL_v0.3_PATCH.md"
  - "docs/20-architecture/specs/PRD-SHIFT-DASHBOARDS-v0.2-*"
---

# Executive Summary

The **Shift Dashboards** read model can be correct and still report junk if the **Table Rundown** pipeline fails to emit the operational buy-in/drop signals that the rollups depend on.

This doc rewrites the prior gap analysis to do three things:

1. **Make the gaps falsifiable** (what’s missing, where, and how we know).
2. **Resolve the taxonomy ambiguity** (“grind” means two different things; DB must pick one).
3. **Add database-side guardrails** so bridging does not become a security/leak amplifier under connection pooling.

**Canonical decisions included:**
- **Q2 (Schema mismatch):** Use `RATED_BUYIN` whenever a rating slip exists (amount is irrelevant).
- **Q3 (When to log RATED_BUYIN):** Primary = automatic bridge from Finance (`player_financial_transaction`), Secondary = manual telemetry-only for sub-threshold rated buy-ins.

---

# Scope

## In Scope (This Patch)
- Telemetry semantics + ingestion rules (`RATED_BUYIN` vs `GRIND_BUYIN`)
- Rated buy-in bridge trigger/hook (Finance → telemetry)
- Manual telemetry-only path for rated sub-threshold buy-ins (no Finance mutation)
- Guardrails: fail-closed checks on context + tenant isolation invariants

## Out of Scope (Explicit)
- Full table session lifecycle state machine (“open/close/rundown sessions” table)
- Soft Count integration (still operationally important; not in MVP implementation scope)
- Promotional instrument accounting (separate dimension; do not overload telemetry_kind)

---

# Current State (Unambiguous)

> If you want fewer arguments later: stop using “100% complete” without qualifiers.

## Implemented
- Shift dashboards rollups + read model tables/RPCs **exist** (aggregate layer).
- `table_buyin_telemetry` schema + baseline RPC(s) **exist** (storage layer).

## Missing (The Actual Blocker)
- **End-to-end ingestion paths** that write `table_buyin_telemetry` reliably:
  1) **Automatic** (Finance insert → telemetry)
  2) **Manual** (Ops logs telemetry-only when Finance does not exist)

If these ingestion paths are missing, dashboards are *mathematically correct and operationally useless.*

---

# Domain Semantics: "Grind" (Canonical)

“Grind” is overloaded. The DB cannot tolerate that. We define grind **only** by identity/linkage.

## 1) Threshold-based grind (rated player, sub-$100 buy-in)
- Player is identified and rated
- `visit_id` and `rating_slip_id` exist
- Amount below a mandatory logging/UI threshold
- May not be captured in `player_financial_transaction`
- Still subject to CTR monitoring in aggregate

**Canonical classification:** `RATED_BUYIN` (amount does not change telemetry_kind)

## 2) Identity-based grind (ghost/unrated player)
- No player record OR player declines identification such that session is not linkable
- `gaming_ghost_unrated` visit kind (ADR-014) OR equivalent unlinked workflow
- Compliance-only observation
- No loyalty accrual

**Canonical classification:** `GRIND_BUYIN` (must remain unlinked: `visit_id IS NULL AND rating_slip_id IS NULL`)

## Shadow player (ADR-014)
Shadow player is **identified** but opts out of **loyalty accrual**.  
That is not anonymity. Telemetry_kind does not encode loyalty policy.

- If `visit_id` + `rating_slip_id` exist → treat as `RATED_BUYIN`
- Loyalty opt-out is modeled outside telemetry (visit/loyalty), not by telemetry_kind

---

# Q2 Resolution: Schema Mismatch

## Current Schema Intent
- `RATED_BUYIN` → requires `visit_id` AND `rating_slip_id`
- `GRIND_BUYIN` → requires both to be NULL

## Decision
**Option (c):** Always use `RATED_BUYIN` whenever a rating slip exists, regardless of amount.

## Rejected
- (a) `RATED_GRIND_BUYIN`: taxonomy explosion driven by UI policy
- (b) Allow linkage on `GRIND_BUYIN`: destroys interpretability and forces downstream inference

---

# Q3 Resolution: Rated Buy-in Bridge Trigger

## Question
When should a `RATED_BUYIN` row be logged into `table_buyin_telemetry`?

## Decision (Normative)
- **Primary path:** **Automatic** bridge from Finance on insert of `player_financial_transaction`
  - condition: `direction = 'in' AND rating_slip_id IS NOT NULL`
- **Secondary path:** **Manual telemetry-only** for rated sub-threshold buy-ins that do not create Finance rows
  - still requires `visit_id` + `rating_slip_id`
  - does **not** create/modify `player_financial_transaction`

## Rejected
- Button-only logging for all rated (guaranteed missingness)
- Threshold-gated ingestion as a pipeline rule (thresholds drift; pipelines should not)

---

# Data Pipeline Contract (Normative)

## Ingestion rules

### Rule 1: Rated buy-in
If a buy-in is linked to a rating slip:
- Write `table_buyin_telemetry.kind = 'RATED_BUYIN'`
- Require `visit_id` + `rating_slip_id`
- Amount may be any positive value (including sub-$100)

### Rule 2: Grind buy-in (identity-based)
If buy-in is *unlinked* (ghost/unrated):
- Write `table_buyin_telemetry.kind = 'GRIND_BUYIN'`
- Enforce `visit_id IS NULL AND rating_slip_id IS NULL`

## Recommended dimensions (do not overload kind)
Add a separate dimension for provenance:
- `source = 'finance_bridge' | 'manual_ops'`
This prevents manual telemetry from silently becoming shadow Finance.

If schema changes are frozen, store this in `metadata` (JSON) **temporarily** with a planned migration to a real enum column.

---

# Guardrails (Fail-Closed) — Required

These are non-negotiable if you’re using connection pooling and ADR-024 context injection.

## Guardrail G1: Context must exist
Any bridge logic (trigger/RPC) must assert:
- `current_setting('app.casino_id', true)` is set and parseable as UUID
- `current_setting('app.actor_id', true)` is set and parseable as UUID (or explicitly documented fallback)

If missing → `RAISE EXCEPTION` (fail closed, do not “best effort”).

## Guardrail G2: Tenant invariants must match
On any bridging write, assert:
- `NEW.casino_id = current_setting('app.casino_id')::uuid`

If mismatch → `RAISE EXCEPTION`.  
This prevents a compromised/buggy Finance insert from being replicated into telemetry and rollups.

## Guardrail G3: Actor invariants (if available)
If Finance rows carry `created_by_staff_id` (or similar), assert:
- `NEW.created_by_staff_id = current_setting('app.actor_id')::uuid`

If not available, state explicitly that actor binding is enforced at the RPC layer and audited.

## Guardrail G4: No spoofable parameters
Bridge function/RPC must not accept `casino_id`/`actor_id` from clients.  
Context must be derived from `set_rls_context_from_staff()` per ADR-024.

## Guardrail G5: Idempotency must be real
If `ON CONFLICT` is used, the corresponding **unique index/constraint must exist** and match the conflict target.

Example (partial unique index):
- unique on `(casino_id, idempotency_key)` where `idempotency_key IS NOT NULL`

If you don’t define the index, your “idempotency” is fan fiction.

---

# Implementation Guidance (Concrete)

## Automatic bridge: trigger vs service hook
Preferred: **DB trigger** on `player_financial_transaction` insert, because it guarantees the bridge runs regardless of application path (RPC/UI/import).

But: triggers are only safe if Guardrails G1–G5 are implemented.

### Trigger sketch (Pseudo-code — MUST be adapted to canonical schema)
- AFTER INSERT ON `player_financial_transaction`
- WHEN `NEW.direction = 'in' AND NEW.rating_slip_id IS NOT NULL`
- Determine table identity:
  - prefer direct `gaming_table_id` on Finance row, else
  - join via `rating_slip` to get `gaming_table_id`
- Insert into `table_buyin_telemetry` with:
  - `casino_id = NEW.casino_id`
  - `gaming_table_id = ...`
  - `visit_id = NEW.visit_id` (or join via slip)
  - `rating_slip_id = NEW.rating_slip_id`
  - `amount = NEW.amount` (or normalize cents/numeric)
  - `kind = 'RATED_BUYIN'`
  - `source = 'finance_bridge'`
  - `idempotency_key = 'pft:' || NEW.id` (recommended)

**Important:** This sketch references fields that may differ in the canonical schema. Treat it as behavior, not copy/paste SQL.

## Manual telemetry-only: rated sub-threshold
Add an RPC/UI action that inserts `table_buyin_telemetry`:
- `kind = 'RATED_BUYIN'`
- requires `visit_id` + `rating_slip_id` (and table id)
- `source = 'manual_ops'`
- does **not** mutate Finance

This satisfies dashboards without forcing Finance to store sub-threshold noise.

---

# Integration with Shift Dashboards (What the rollups should assume)

Rollups should treat telemetry as:
- authoritative for **table-level operational signals** (buy-ins observed at pit)
- not authoritative for **cashier ledger truth** (that’s Finance/MTL)

Dashboards may optionally display:
- Rated buy-ins (from Finance bridge)
- Unrated buy-ins (manual grind)
- Coverage quality (`GOOD_COVERAGE / LOW_COVERAGE / NONE`) based on deterministic rules

---

# Quality Rules (Make “coverage” real)

Define coverage quality in measurable terms (examples):

- `GOOD_COVERAGE`:
  - For a given shift/table, at least one telemetry buy-in exists **OR**
  - grind entries exist for ≥ X% of open tables (choose X, document it)

- `LOW_COVERAGE`:
  - Shift has rated activity (slips/finance) but telemetry buy-in events are missing

- `NONE`:
  - No telemetry events at all

Do not ship “quality” as vibes.

---

# Risk Register (Updated)

| Risk | Failure Mode | Impact | Guardrail / Mitigation |
|------|--------------|--------|------------------------|
| Cross-tenant bleed via pooled sessions | Context not injected; trigger runs anyway | Critical security breach | G1 + G2 fail-closed |
| Phantom idempotency | ON CONFLICT without matching unique index | Duplicate rows, wrong rollups | G5 + explicit index |
| Schema drift | Trigger references non-existent columns | Migration fails / silent no-op | Compile-time migration tests; align with database.types.ts |
| Manual path becomes shadow Finance | Ops logs “rated” without provenance | Confusing totals and audits | `source` dimension + UI labeling |
| “Grind” semantic collapse | GRIND_BUYIN used for rated sub-$100 | Downstream confusion | Q2/Q3 decisions; enforce constraints |

---

# Open Questions (Remaining)
1. Exact canonical field mapping for:
   - `player_financial_transaction` amount + table reference
   - `rating_slip` table reference (`gaming_table_id` vs legacy name)
2. Should Finance enforce `visit_id NOT NULL` for direction='in' rows? (If yes, add constraint/migration.)
3. Do we require `idempotency_key` for manual telemetry writes? (Recommended yes; define format.)

---

# Definition of Done (This Patch)
- Automatic bridge exists (trigger or equivalent) and passes Guardrails G1–G5
- Manual telemetry-only path exists for rated sub-threshold buy-ins
- `RATED_BUYIN` vs `GRIND_BUYIN` semantics are enforced by constraints and doc
- Shift dashboards show non-zero buy-in signals in realistic workflows
- Migration tests prove trigger compiles against canonical schema

## References

- **Lifecycle Vision**: `table-inventory-rundown-lifecycle.md`
- **Read Model Addendum**: `ADDENDUM_TABLE_RUNDOWN_READMODEL_v0.3_PATCH.md`
- **EXEC-SPEC**: `docs/20-architecture/specs/ADDENDUM-TBL-RUNDOWN/EXECUTION-SPEC-ADDENDUM-TBL-RUNDOWN.md`
- **PRD**: `docs/10-prd/PRD-Shift-Dashboards-Implementation-v0.2.md`
- **Telemetry RPC**: `supabase/migrations/20260114004141_rpc_log_table_buyin_telemetry.sql`
- **Telemetry Table**: `supabase/migrations/20260114003530_table_buyin_telemetry.sql`
- **Shift Metrics RPC**: `supabase/migrations/20260114004336_rpc_shift_table_metrics.sql`
- **Chip Custody**: `supabase/migrations/20251108195341_table_context_chip_custody.sql`

