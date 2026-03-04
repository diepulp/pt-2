# Delta Patch — EXEC-040 alignment to SEC-007 (P0-5 + CI gates + governance)

This patch updates **EXEC-040** to address the re-audit findings:

- Adds **WS13** for **P0-5** (`rpc_get_dashboard_tables_with_counts`) remediation + acceptance tests.
- Expands **WS12 gates** to match SEC-007 DoD:
  - Gate 2: overloads **and** DEFAULT-arg overlap ambiguity
  - Gate 3: flags **p_actor_id** **and** **p_casino_id**
  - Gate 6: scans **all security-relevant rpc_***, not just DEFINER
- Adds **WS14** governance/prevention deliverables (checklist, role-gating canon, PostgREST surface inventory).
- Updates execution phases to include WS13 (Phase 1b) and WS12+WS14 (Phase 4).
- Replaces the “P0-5 non-issue” narrative with an **active-until-proven** stance (catalog + acceptance based).

```diff
--- EXEC-040-sec007-tenant-isolation-enforcement.md
+++ EXEC-040-sec007-tenant-isolation-enforcement.md
@@ -165,7 +165,7 @@
 
   WS12:
     name: "CI Security Assertion Gates"
-    description: "7 CI gates: permissive-true, overload, identity param, PUBLIC EXECUTE, deprecated context, context-first-line, audit_log write lane"
+    description: "7 CI gates: permissive-true, overload+DEFAULT-arg ambiguity, identity params (p_actor_id/p_casino_id), PUBLIC EXECUTE, deprecated context, context-first-line (all security-relevant rpc_*), audit_log write lane"
     executor: backend-service-builder
     executor_type: skill
     depends_on: [WS6, WS10]
@@ -180,6 +180,33 @@
     gate: build
     estimated_complexity: medium
 
+
+  WS13:
+    name: "P0-5 Dashboard RPC Context Regression Remediation"
+    description: "Restore and enforce context-first-line + correct grants for rpc_get_dashboard_tables_with_counts; run SEC-007 acceptance tests; required for INV-4 proof"
+    executor: backend-service-builder
+    executor_type: skill
+    depends_on: [WS3]
+    outputs:
+      - supabase/migrations/YYYYMMDDHHMMSS_sec007_p0_5_dashboard_rpc_context_fix.sql
+      - supabase/tests/security/08_p0_5_dashboard_rpc_acceptance.sql
+    gate: schema-validation
+    estimated_complexity: low
+    findings: [P0-5]
+
+  WS14:
+    name: "Governance + Prevention Controls (SEC-007 Gaps/Blind Spots)"
+    description: "Add repo-level prevention artifacts: RLS/RPC security review checklist, role-gating canon, and PostgREST surface inventory check (pre-merge)"
+    executor: backend-service-builder
+    executor_type: skill
+    depends_on: [WS6]
+    outputs:
+      - docs/30-security/checklists/RLS_RPC_SECURITY_REVIEW_CHECKLIST.md
+      - docs/30-security/ROLE_GATING_CANON.md
+      - supabase/tests/security/09_postgrest_surface_inventory.sql
+    gate: build
+    estimated_complexity: medium
+
 # Execution Phases
 execution_phases:
   - name: "Phase 1a — P0 Critical (Parallel SQL)"
@@ -187,9 +214,9 @@
     gates: [schema-validation]
 
   - name: "Phase 1b — P0 Critical (Sequential Deps)"
-    parallel: [WS4, WS5]
+    parallel: [WS4, WS5, WS13]
     gates: [schema-validation]
-    notes: "WS4 depends on WS3; WS5 depends on WS2"
+    notes: "WS4 depends on WS3; WS5 depends on WS2; WS13 depends on WS3"
 
   - name: "Phase 1c — P0 Validation Gate"
     parallel: [WS6]
@@ -202,6 +229,11 @@
   - name: "Phase 2b — P1 Validation Gate"
     parallel: [WS10]
     gates: [type-check, build]
+
+  - name: "Phase 4 — CI + Governance Hardening"
+    parallel: [WS12, WS14]
+    gates: [build]
+    notes: "WS12 implements SEC-007 DoD gates; WS14 lands prevention artifacts required by SEC-007 Gaps/Blind Spots"
 
   - name: "Phase 3 — P2 Backlog (DEFERRED)"
     parallel: [WS11]
@@ -271,7 +303,7 @@
 - P2-5: Add WITH CHECK to `player_tag` UPDATE
 
 **Verified Non-Issue:**
-- P0-5: `rpc_get_dashboard_tables_with_counts` regression — the referenced migration (`20260301015320`) does not exist in the repo or git history. The SEC-007 audit was run against uncommitted local state that was never committed. Current version (migration `20251229154013`, line 64) calls `set_rls_context_from_staff()` correctly. WS12 CI Gate 5 (deprecated context grep) will prevent re-introduction.
+- P0-5: `rpc_get_dashboard_tables_with_counts` regression — treat as **ACTIVE** until proven otherwise by catalog + acceptance tests. Implement WS13 to (a) re-apply `set_rls_context_from_staff()` as the first line, (b) enforce correct EXECUTE grants/REVOKEs, and (c) run SEC-007 acceptance tests. Only after WS13 passes can INV-4 be considered satisfied.
 
 ## Architecture Context
 
@@ -473,6 +505,38 @@
 
 ---
 
+
+### WS13: P0-5 Dashboard RPC Context Regression Remediation (Phase 1b, after WS3)
+
+**Purpose**: Restore and lock down `rpc_get_dashboard_tables_with_counts` so it cannot read cross-tenant data under pooling. This is treated as P0 until proven safe by catalog + acceptance tests.
+
+**Actions**:
+- Ensure the function body calls `PERFORM set_rls_context_from_staff();` as the **first executable line**.
+- Confirm no alternate exposed wrapper bypasses context.
+- Enforce grant posture: `REVOKE ALL FROM PUBLIC` + `REVOKE ALL FROM anon` + explicit GRANTs only to intended roles (typically `authenticated` + `service_role`).
+
+**Acceptance Tests (catalog-based)**:
+```sql
+-- 1) Context-first-line: the first non-comment statement must be set_rls_context_from_staff()
+SELECT 1
+FROM pg_proc p
+JOIN pg_namespace n ON n.oid = p.pronamespace
+WHERE n.nspname = 'public'
+  AND p.proname = 'rpc_get_dashboard_tables_with_counts'
+  AND regexp_replace(pg_get_functiondef(p.oid), E'\\s+', ' ', 'g')
+      NOT LIKE '%BEGIN PERFORM set_rls_context_from_staff()%';
+-- Expected: 0 rows
+
+-- 2) No PUBLIC/anon execute
+SELECT p.oid::regprocedure AS sig,
+       has_function_privilege('PUBLIC', p.oid, 'EXECUTE') AS public_exec,
+       has_function_privilege('anon',   p.oid, 'EXECUTE') AS anon_exec,
+       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_exec
+FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
+WHERE n.nspname = 'public' AND p.proname = 'rpc_get_dashboard_tables_with_counts';
+-- Expected: public_exec=false, anon_exec=false, authed_exec=true (or as explicitly intended)
+```
+
 ### WS7: P1 RLS Casino Scoping + WITH CHECK (Phase 2)
 
 **Findings**: P1-1, P1-2, P1-3, P1-4
@@ -509,14 +573,30 @@
 
 **Gates**:
 1. **Permissive-true policy check** — `SELECT * FROM pg_policies WHERE qual LIKE '%true%' OR with_check LIKE '%true%'` with allowlist governance
-2. **Overload/ambiguity check** — `SELECT proname, count(*) FROM pg_proc WHERE proname LIKE 'rpc_%' GROUP BY proname HAVING count(*) > 1` with allowlist
-3. **Identity param check** — `p_actor_id` in `rpc_*` function args (pg_get_function_identity_arguments)
+2. **Overload/ambiguity check** — FAIL if (a) any `rpc_*` has >1 overload *unless allowlisted* **OR** (b) any pair of overloads can be matched ambiguously under PostgREST named-arg resolution due to DEFAULTs (SEC-007 overlap query; no DEFAULT-arg overlap).
+3. **Identity param check** — FAIL if any exposed `rpc_*` function accepts **either** `p_actor_id` **or** `p_casino_id` in its argument names (even if removal is deferred).
 4. **PUBLIC EXECUTE check** — `has_function_privilege('public', oid, 'EXECUTE')` for all `rpc_*`
 5. **Deprecated context grep** — `grep -r 'set_rls_context(' supabase/migrations/ | grep -v 'set_rls_context_from_staff\|set_rls_context_internal'`
-6. **Context-first-line lint** — v1 heuristic: DEFINER functions should call `set_rls_context_from_staff()` early in body
+6. **Context-first-line lint** — scan every security-relevant `rpc_*` (any function with EXECUTE granted to `PUBLIC`, `anon`, or `authenticated`) and require `set_rls_context_from_staff()` occurs before any table access; allowlist only REVOKE’d internal helpers.
 7. **Audit log write lane check** — any non-DEFINER function body containing `INSERT INTO audit_log` = FAIL (see Audit Log Write Lane Contract)
 
 **CI approach**: GitHub Actions workflow on PRs touching `supabase/migrations/`. Uses ephemeral Supabase instance (`supabase db reset`) + SQL assertion files + bash checks.
+
+
+### WS14: Governance + Prevention Controls (SEC-007 Gaps/Blind Spots) (Phase 4)
+
+**Purpose**: Land the prevention controls SEC-007 calls out so this class of tenant isolation regressions cannot re-enter via “helpful” migrations.
+
+**Deliverables**:
+- `docs/30-security/checklists/RLS_RPC_SECURITY_REVIEW_CHECKLIST.md` — required checklist for any migration touching RLS policies or `rpc_*` functions (reviewer must sign).
+- `docs/30-security/ROLE_GATING_CANON.md` — canonical rules for EXECUTE grants (PUBLIC/anon defaults, when SECURITY DEFINER is allowed, and required REVOKE patterns).
+- `supabase/tests/security/09_postgrest_surface_inventory.sql` — inventory query of exposed PostgREST surface (all `rpc_*` + grants), used in PR review and optionally as CI output artifact.
+
+**Acceptance**:
+- Checklist template exists and is referenced by the PR template or contributing guide.
+- Role-gating canon exists and is referenced by EXEC specs going forward.
+- Surface inventory query runs in CI and prints the current callable surface for review.
+
 
 ---
 
```
