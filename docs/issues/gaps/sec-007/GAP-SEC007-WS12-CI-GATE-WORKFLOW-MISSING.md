# GAP-SEC007-WS12-CI-GATE-WORKFLOW-MISSING

**Severity**: P1
**Domain**: Security, CI/CD, DevOps
**Discovered**: 2026-03-03
**Status**: Open
**Affects**: EXEC-040 WS12, SEC-007, `.github/workflows/`
**Source**: Post-SEC-007 callsite audit — checkpoint vs reality discrepancy

---

## Summary

EXEC-040 WS12 ("CI Security Assertion Gates") created 7 standalone security test scripts in `supabase/tests/security/` but **did not create the GitHub Actions workflow** that runs them on PRs. The EXEC-040 checkpoint (`EXEC-040.json`) marks WS12 as "completed" and `phase_4_ci_security_tests` as a passed gate. This is overstated — the scripts exist but provide zero automated regression protection.

---

## What Was Delivered

All 7 security gate scripts exist in `supabase/tests/security/` (committed in `9ee2850`):

| # | File | Type |
|---|---|---|
| 01 | `01_permissive_true_check.sql` | SQL assertion |
| 02 | `02_overload_ambiguity_check.sql` | SQL assertion |
| 03 | `03_identity_param_check.sql` | SQL assertion |
| 04 | `04_public_execute_check.sql` | SQL assertion |
| 05 | `05_deprecated_context_check.sh` | Bash grep |
| 06 | `06_context_first_line_check.sh` | Bash lint |
| 07 | `07_dashboard_rpc_context_acceptance.sql` | SQL assertion |

WS14 governance artifacts also delivered:
- `docs/30-security/templates/RLS_RPC_SECURITY_REVIEW_CHECKLIST.md`
- `docs/30-security/ROLE_GATING_CANON.md`
- `supabase/scripts/postgrest_surface_inventory.sql`
- `docs/30-security/postgrest_surface_inventory.md`

## What Is Missing

**A GitHub Actions workflow file** (e.g., `.github/workflows/security-gates.yml`) that:

1. Triggers on PRs touching `supabase/migrations/`
2. Spins up an ephemeral Supabase instance (`supabase db reset`)
3. Runs the 7 SQL/bash assertion scripts against it
4. Fails the PR if any gate fails

This is explicitly specified in EXEC-040 WS12 (line 602):

> **CI approach**: GitHub Actions workflow on PRs touching `supabase/migrations/`. Uses ephemeral Supabase instance (`supabase db reset`) + SQL assertion files + bash checks.

## Current CI State

| Workflow | Security References |
|---|---|
| `.github/workflows/ci.yml` | None |
| `.github/workflows/migration-lint.yml` | Stale — references deprecated `set_rls_context()` pattern |
| `.github/workflows/check-srm-links.yml` | None (doc link checker) |

## Impact

Without the workflow, the 7 gate scripts are inert. A migration introducing any of the following would merge uncaught:
- `USING(true)` permissive policy
- Phantom function overload with DEFAULT-arg ambiguity
- Spoofable `p_actor_id` / `p_casino_id` parameters on exposed RPCs
- `PUBLIC EXECUTE` grant on `rpc_*` functions
- Deprecated `set_rls_context()` usage
- Missing `set_rls_context_from_staff()` in security-relevant RPCs

These are the exact regression vectors SEC-007 remediated.

## Checkpoint Correction Needed

`EXEC-040.json` should reflect:
- WS12 status: **partial** (scripts delivered, workflow missing)
- `phase_4_ci_security_tests` gate: should not be marked as passed
- Or: split WS12 into WS12a (scripts, done) and WS12b (workflow, open)

## Remediation

Use `/devops-pt2` or `/build` to implement the missing workflow. The 7 test scripts are ready — the work is wiring them into a GitHub Actions job with `supabase db reset` as the test database.

## Relation to Other Gaps

- **Distinct from WS11 (P2 backlog)**: WS11 concerns deferred P2 findings (parameter removal, ADR-024 compliance). This gap is about CI automation for already-implemented P0/P1 gates.
- **Logged as**: ISSUE-7E156DDB in Memori issues namespace
