# ADR-039 Measurement Layer — Re-audit Delta Patch

This patch resolves remaining internal inconsistencies discovered in the re-audit.

```diff
diff --git a/ADR-039-measurement-layer.md b/ADR-039-measurement-layer.md
index 0000000..0000000 100644
--- a/ADR-039-measurement-layer.md
+++ b/ADR-039-measurement-layer.md
@@ -113,7 +113,7 @@ Each artifact is assigned to the bounded context that owns the majority of its d
 **Purpose:** Provide end-to-end financial lineage: `rating_slip` → `player_financial_transaction` → `mtl_entry` → `loyalty_ledger` — correlated with the `audit_log` trail — in one query. Designed for auditor and regulator demonstration.

-**Prerequisite:** `audit_log` must be append-only (immutable after insert). The Strategic Hardening Report identifies audit-log immutability as an open gap — this must be resolved before the view is created. Until then, the view can be deployed without the `audit_log` join and amended once the append-only invariant is enforced.
+**Prerequisite:** `audit_log` must be append-only (immutable after insert). The Strategic Hardening Report identifies audit-log immutability as an open gap — this must be resolved before deploying the *audit-enriched* variant of the view. Until then, deploy the view **without** the `audit_log` join and amend it once the append-only invariant is enforced.
@@ -132,12 +132,12 @@ Each artifact is assigned to the bounded context that owns the majority of its d

 | Property | Value |
 |---|---|
-| **Type** | SQL view with `security_invoker = true` |
+| **Type** | SQL view in `public` schema with `security_invoker = true` |
 | **Owning Context** | Platform/Cross-Cutting (Measurement Layer) |
-| **Source Tables** | `table_session` (TableContextService), `rating_slip` (RatingSlipService) |
+| **Source Tables** | `table_session` (TableContextService) *or equivalent ADR-038 lifecycle surface*, `rating_slip` (RatingSlipService) |
 | **Refresh Strategy** | Live — SQL view over current data |
 | **RLS Posture** | `security_invoker = true` — each source table's RLS applies under caller identity |
 | **Role Gate** | pit_boss, admin (route-level) |
```