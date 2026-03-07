# Delta Patch — Align EXEC-040 + SEC-007 (tenant isolation enforcement)

This patch tightens WS3 to explicitly REVOKE from PUBLIC/anon/authenticated and replaces hard-coded function
signatures in acceptance tests with catalog-based `regprocedure` checks to avoid overload/signature drift.

```diff
--- a/docs/30-security/EXEC-040-sec007-tenant-isolation-enforcement.md
+++ b/docs/30-security/EXEC-040-sec007-tenant-isolation-enforcement.md
@@
-  WS3:
-    name: "P0 RPC Context Fixes"
-    description: "REVOKE rpc_get_rating_slip_duration from authenticated (internal-only). P0-5 verified resolved — regression migration never committed."
+  WS3:
+    name: "P0 RPC Context Fixes"
+    description: "Remove PostgREST-callable surface for rpc_get_rating_slip_duration (internal-only). Explicitly REVOKE EXECUTE from PUBLIC/anon/authenticated, then (optionally) GRANT only to service_role or wrapper RPC(s) as required."
@@
-    notes: "P0-5 already resolved — current rpc_get_dashboard_tables_with_counts uses set_rls_context_from_staff() correctly (migration 20251229154013)"
+    notes: |
+      P0-5 already resolved — current rpc_get_dashboard_tables_with_counts uses set_rls_context_from_staff() correctly (migration 20251229154013).
+      IMPORTANT: Do not rely on implicit privilege state. Always REVOKE from PUBLIC (and anon/authenticated) explicitly; PostgREST surfaces anything executable.
@@
-**Acceptance Tests**:
-- `SELECT has_function_privilege('authenticated', 'rpc_get_rating_slip_duration(uuid,timestamptz)', 'EXECUTE');` → false
+**Acceptance Tests**:
+- Catalog sanity: `SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_get_rating_slip_duration';` → returns 0 rows (preferred: function dropped) OR returns 1 row (kept internal).
+- If kept internal: all non-service roles cannot EXECUTE:
+  - `SELECT has_function_privilege('PUBLIC',      '<regprocedure_from_catalog>', 'EXECUTE');` → false
+  - `SELECT has_function_privilege('anon',        '<regprocedure_from_catalog>', 'EXECUTE');` → false (if role exists)
+  - `SELECT has_function_privilege('authenticated','<regprocedure_from_catalog>', 'EXECUTE');` → false
+- If an internal wrapper exists (e.g. rpc_get_visit_live_view): wrapper is executable by authenticated, but it must enforce tenant isolation via context + RLS, and must not accept actor/casino as caller-controlled inputs.

--- a/docs/30-security/SEC-007-tenant-isolation-enforcement-contract.md
+++ b/docs/30-security/SEC-007-tenant-isolation-enforcement-contract.md
@@
-- If REVOKE path chosen: `SELECT has_function_privilege('authenticated', 'rpc_get_rating_slip_duration(uuid)', 'EXECUTE');` → false
+- If REVOKE path chosen: avoid hard-coding a signature. Discover the exact regprocedure from the catalog, then assert no EXECUTE for PUBLIC/anon/authenticated:
+  - `SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='rpc_get_rating_slip_duration';`
+  - `SELECT has_function_privilege('PUBLIC',      '<regprocedure_from_catalog>', 'EXECUTE');` → false
+  - `SELECT has_function_privilege('anon',        '<regprocedure_from_catalog>', 'EXECUTE');` → false (if role exists)
+  - `SELECT has_function_privilege('authenticated','<regprocedure_from_catalog>', 'EXECUTE');` → false
```
