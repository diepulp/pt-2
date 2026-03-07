# EXEC-045 (ADR-039) — Audit #2 Delta Patch

This patch fixes remaining correctness/security gaps: branch typo, WS5 dependency, PostgREST exposure ambiguity, fan-out warning, and likely schema drift in rating coverage join.

```diff
diff --git a/EXEC-045-adr039-measurement-layer.md b/EXEC-045-adr039-measurement-layer.md
index 0000000..0000000 100644
--- a/EXEC-045-adr039-measurement-layer.md
+++ b/EXEC-045-adr039-measurement-layer.md
@@ -6,7 +6,7 @@ prd: ADR-039
 prd_title: "Measurement Layer — Cross-Cutting Read Models for Structural Measurability"
 service: Platform/Cross-Cutting
 mvp_phase: 2
-branch: feat/strategic-hardnening
+branch: feat/strategic-hardening
@@ -55,11 +55,11 @@ workstreams:
   WS5:
     name: Cross-Context Measurement Views
     description: Create measurement_audit_event_correlation_v and measurement_rating_coverage_v with security_invoker=true
     executor: backend-service-builder
     executor_type: skill
-    depends_on: []
+    depends_on: [WS1]  # uses computed_theo_cents + legacy_theo_cents columns
     outputs:
       - supabase/migrations/{TS5}_adr039_measurement_views.sql
     gate: schema-validation
     estimated_complexity: medium
@@ -139,6 +139,18 @@ risks:
   - risk: "security_invoker=true requires PostgreSQL 15+"
     mitigation: "Supabase deployment uses PG15+ — verify with SELECT version() in migration"

+  - risk: "Views are directly queryable via PostgREST; 'pit_boss/admin only' cannot rely on route-level gating alone"
+    mitigation: "Choose ONE exposure mode: (A) GRANT SELECT on measurement_* only to service_role and expose via RPC/BFF, OR (B) GRANT to authenticated and enforce staff_role gating at the DB boundary (RLS/policies on the view or a dedicated API role). Document the choice in the migration."
+
+  - risk: "Correlation view fan-out (N×M×K) can explode rows and lead to double-counting in UI/analytics"
+    mitigation: "Ship an additional consumer-safe summary variant (one row per rating_slip with JSON aggregates for child tables) or document mandatory aggregation guidance in view COMMENT + UI usage notes."
+
+  - risk: "Column names in view SQL may drift from canonical schema"
+    mitigation: "Before writing TS5 migration, verify column names against canonical database.types.ts (e.g., rating_slip.gaming_table_id vs table_id; started_at vs start_time; amount_cents vs amount). Adjust view SQL accordingly."
@@ -214,6 +226,10 @@ v_loyalty_snapshot := v_result.policy_snapshot->'loyalty';
 ELSE
   v_computed_theo_cents := 0;
 END IF;
+
+-- NOTE: Defaulting to 0 preserves write-path availability but can mask data-quality issues.
+-- Surface malformed/missing snapshot incidence via a separate discrepancy query (e.g., where status='closed' and computed_theo_cents=0 and duration_seconds>0).
 ```
@@ -403,6 +419,12 @@ View 1: `measurement_audit_event_correlation_v`** (BASE variant)
 SELECT
   rs.id AS rating_slip_id,
   rs.casino_id,
   rs.visit_id,
   rs.status AS slip_status,
-  rs.start_time, rs.end_time,
+  rs.start_time, rs.end_time,
   rs.duration_seconds, rs.computed_theo_cents, rs.legacy_theo_cents,
-  pft.id AS pft_id, pft.amount AS pft_amount, pft.txn_kind AS pft_txn_kind,
+  pft.id AS pft_id, pft.amount AS pft_amount, pft.txn_kind AS pft_txn_kind,
   pft.direction AS pft_direction, pft.created_at AS pft_created_at,
   me.id AS mtl_entry_id, me.amount AS mtl_amount, me.txn_type AS mtl_txn_type,
   me.direction AS mtl_direction, me.occurred_at AS mtl_occurred_at,
   ll.id AS loyalty_ledger_id, ll.points_delta AS loyalty_points_delta,
   ll.reason AS loyalty_reason, ll.created_at AS loyalty_created_at
@@ -411,6 +433,11 @@ FROM rating_slip rs
 LEFT JOIN player_financial_transaction pft ON pft.rating_slip_id = rs.id
 LEFT JOIN mtl_entry me ON me.rating_slip_id = rs.id
 LEFT JOIN loyalty_ledger ll ON ll.rating_slip_id = rs.id;
+
+-- NOTE: validate money column naming: if canonical schema uses *_cents fields (per ADR-031),
+-- rename pft.amount/me.amount projections accordingly in the TS5 migration.
+-- The exec spec keeps placeholders until verified against database.types.ts.
@@ -457,7 +484,7 @@ LEFT JOIN LATERAL (
   SELECT
     SUM(COALESCE(rs.final_duration_seconds, rs.duration_seconds, 0))::integer AS rated_seconds,
     COUNT(*)::integer AS slip_count
   FROM rating_slip rs
-  WHERE rs.table_id = ts.gaming_table_id
+  WHERE rs.gaming_table_id = ts.gaming_table_id
     AND rs.casino_id = ts.casino_id
     AND rs.status = 'closed'
     AND rs.start_time >= ts.opened_at
     AND (ts.closed_at IS NULL OR rs.start_time < ts.closed_at)
 ) slip_agg ON true;
@@ -471,9 +498,20 @@ GRANTs:
 ```sql
-GRANT SELECT ON measurement_audit_event_correlation_v TO authenticated;
-GRANT SELECT ON measurement_rating_coverage_v TO authenticated;
+-- Choose ONE approach:
+-- A) Route-only exposure (recommended if "pit_boss/admin only" is a hard requirement):
+--    GRANT SELECT ON measurement_* TO service_role; expose via RPC/BFF.
+-- B) Direct PostgREST exposure:
+--    GRANT SELECT ON measurement_* TO authenticated;
+--    AND enforce staff_role gating at the DB boundary (RLS/policies on the views or a dedicated API role),
+--    not only via frontend routing.
 ```
@@ -522,7 +560,7 @@ Definition of Done
 - [ ] SRM v4.17.0 with Measurement Layer section
 - [ ] ADR-039 status updated to "Accepted" (conditional on SRM completion)
 - [ ] `computed_theo_cents` materialized on every new slip close (all 3 RPCs: close, move, gaming day rollover)
-- [ ] Both measurement views queryable via PostgREST
+- [ ] Exposure choice for measurement views is implemented (route-only via RPC/BFF OR direct PostgREST with DB-enforced staff_role gating)
 - [ ] `rpc_snapshot_loyalty_liability` functional with idempotent UPSERT
 - [ ] Blocked artifact (audit-enriched correlation view) documented
```