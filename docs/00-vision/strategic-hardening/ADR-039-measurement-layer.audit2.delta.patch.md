# ADR-039 Measurement Layer — Audit #2 Delta Patch

This patch fixes remaining ownership/naming inconsistencies and tightens operational claims.

```diff
diff --git a/ADR-039-measurement-layer.md b/ADR-039-measurement-layer.md
index 0000000..0000000 100644
--- a/ADR-039-measurement-layer.md
+++ b/ADR-039-measurement-layer.md
@@ -47,7 +47,7 @@ The Economic Delta Distillation (2026-03-01) identified four structural advantage

 ### D1 — Measurement Layer as Cross-Cutting Read-Model Concern

-**Context:** PT-2's SRM enforces strict bounded context ownership: services own tables, cross-context access happens via DTOs and RPCs, never via direct table reads. Measurement artifacts inherently span contexts — an audit correlation view must join `rating_slip` (RatingSlipService), `player_financial_transaction` (PlayerFinancialService), `mtl_entry` (MTLService), and `loyalty_ledger` (LoyaltyService). This would normally violate SRM ownership boundaries.
+**Context:** PT-2's SRM enforces strict bounded context ownership: services own tables, cross-context access happens via DTOs and RPCs, never via direct table reads. Measurement artifacts inherently span contexts — an audit correlation view must join `rating_slip` (RatingSlipService), `player_financial_transaction` (PlayerFinancialService), `mtl_entry` (MTLService), `loyalty_ledger` (LoyaltyService), and (optionally) `audit_log` (CasinoService) for actor/action traceability. This would normally violate SRM ownership boundaries.
@@ -96,11 +96,11 @@ SELECT AVG(ABS(computed_theo_cents - legacy_theo_cents)::numeric

 #### Artifact 2: `measurement_audit_event_correlation_v` (Cross-Context Read Model View)

 | Property | Value |
 |---|---|
-| **Type** | SQL view with `security_invoker = true` |
+| **Type** | SQL view in `public` schema with `security_invoker = true` |
 | **Owning Context** | Platform/Cross-Cutting (Measurement Layer) |
-| **Source Tables** | `rating_slip` (RatingSlipService), `player_financial_transaction` (PlayerFinancialService), `mtl_entry` (MTLService), `loyalty_ledger` (LoyaltyService), `audit_log` (Platform) |
+| **Source Tables** | `rating_slip` (RatingSlipService), `player_financial_transaction` (PlayerFinancialService), `mtl_entry` (MTLService), `loyalty_ledger` (LoyaltyService), `audit_log` (CasinoService) |
 | **Refresh Strategy** | Live — SQL view over current data |
 | **RLS Posture** | `security_invoker = true` — each source table's RLS applies under caller identity |
 | **Role Gate** | pit_boss, admin (route-level, matching ADR-025 MTL read access) |
@@ -257,7 +257,7 @@ Enforced: PRD review checklist must include "Measurement Layer artifact reference

 ### `security_invoker = true` — Operational Gotchas

-1. **PostgreSQL version requirement:** `security_invoker` is a PG15+ feature (`CREATE VIEW ... WITH (security_invoker = true)`). Supabase projects created after late 2023 run PG15+; verify with `SELECT version()` before migration.
+1. **PostgreSQL version requirement:** `security_invoker` is a PG15+ feature (`CREATE VIEW ... WITH (security_invoker = true)`). Verify with `SELECT version()` before migration.
 2. **GRANTs still required:** `security_invoker` changes *whose* RLS policies are evaluated (caller, not view owner), but the caller must still hold `SELECT` on the view itself. Ensure `GRANT SELECT ON measurement_*_v TO authenticated;` (or role-specific grants) is included in migration scripts.
 3. **PostgREST / Supabase exposure:** Views with `security_invoker = true` are auto-exposed by PostgREST like any other relation. If the view should only be accessible via route-level gating (not direct PostgREST query), apply RLS on the view itself or restrict grants to service roles only.
 4. **Pre-PG15 fallback (not expected for PT-2):** On older Postgres, the equivalent effect requires the view to be owned by a non-superuser role that does not bypass RLS. This is not needed for PT-2's Supabase deployment but is documented for completeness.
@@ -278,7 +278,7 @@ Views scoped to a single bounded context do not require this governance — any
 | `rating_slip.legacy_theo_cents` | `ALTER TABLE rating_slip ADD COLUMN legacy_theo_cents bigint` | RatingSlipService | None |
 | `rating_slip.computed_theo_cents` | `ALTER TABLE rating_slip ADD COLUMN computed_theo_cents bigint` + CHECK constraint | RatingSlipService | None |
 | `measurement_audit_event_correlation_v` | `CREATE VIEW ... WITH (security_invoker = true)` | Platform | Phase 1 columns; `audit_log` append-only invariant (see Artifact 2 prerequisite) |
-| `measurement_rating_coverage_v` | `CREATE VIEW ... WITH (security_invoker = true)` | Platform | None |
+| `measurement_rating_coverage_v` | `CREATE VIEW ... WITH (security_invoker = true)` | Platform | Depends on finalized table-lifecycle contract (ADR-038) for the authoritative “active table-hours” source |
 | `loyalty_liability_snapshot` | `CREATE TABLE` + RLS policies + `rpc_snapshot_loyalty_liability` | LoyaltyService | None |
```