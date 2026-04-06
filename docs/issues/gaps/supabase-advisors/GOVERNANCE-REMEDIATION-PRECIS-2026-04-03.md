# Supabase Advisor Governance & Lead-Architect Précis — 2026-04-03

**Source findings:** [SUPABASE-ADVISOR-REPORT-2026-04-02.md](./SUPABASE-ADVISOR-REPORT-2026-04-02.md)  
**Focus:** Governance/doc remediations flagged by the April 2 report + post-implementation audit  
**Status:** Implemented (real gaps patched), theater items dropped

---

## Summary Dashboard

| # | Work Item | Verdict | Status | Implementation |
|---|-----------|---------|--------|----------------|
| 0 | **Search_path / body consistency guardrails** | **CRITICAL (was missing)** | **Done** | Pre-commit hook + CI gate + ADR-018 amendment |
| 1 | ADR-018 scope expansion + search_path standard | PARTIALLY SOUND → fixed | **Done** | ADR-018 amended: broader scope, canonical `''` value, anti-pattern documented |
| 2 | ADR-030 sign-out + dashboard guardrails | SOUND | **Done** | D7 added (HIBP, MFA, sign-out lifecycle), INV-030-9 |
| 3 | Derived read model governance standard | OVER-SCOPED → dropped | **Dropped** | 1 MV, 3-line GRANT fix. Covered by ADR-018 non-RPC surfaces |
| 4 | Postgres patch runbook (RUN-006) | SOUND | **Deferred** | Ops task — not a code/governance doc gap |
| 5 | Extension install governance | GOVERNANCE THEATER → dropped | **Dropped** | One-time SEC-S4 fix. Covered by ADR-018 extensions rule |
| 6 | Index hygiene standard | PREMATURE → dropped | **Dropped** | Pre-launch system — revisit 30 days post-launch per PERF-P5 |

---

## What Was Actually Delivered

### Work Item 0 (was missing from original précis): Search Path Safety

The original précis proposed zero automated validation. The actual critical gap — `ALTER FUNCTION SET search_path = ''` without body rewrites — was not mentioned. This was the regression that broke 17 functions.

**Delivered:**
- `.husky/pre-commit-search-path-safety.sh` — blocks `ALTER FUNCTION SET search_path` without `CREATE OR REPLACE` or `SEARCH_PATH_SAFE` marker
- `supabase/tests/security/09_search_path_body_check.sql` — CI gate querying `pg_proc` for functions with empty search_path + unqualified references
- ADR-018 amendment: canonical `search_path = ''` standard, anti-pattern documentation, enforcement pointers

### Work Item 1: ADR-018 Scope Expansion

**Delivered:**
- `Applies to` field extended to all owner-privileged surfaces (views, MVs, triggers)
- Canonical `search_path` value standardized as `''` (empty string); `SET search_path = public` deprecated
- Non-RPC governance rules table (views → `security_invoker`, MVs → explicit GRANT, extensions → `extensions` schema)
- Compliance matrix updated with SEC-S1/S3/S4/S5 implementations

### Work Item 2: ADR-030 D7

**Delivered:**
- D7: Dashboard auth settings baseline (HIBP enabled, TOTP + WebAuthn MFA)
- Sign-out lifecycle (server action → claims clear → session terminate → client cleanup)
- INV-030-9: Server-side sign-out invariant

### Work Items 3, 5, 6: Dropped

These were either over-scoped (full governance standard for 1 materialized view), governance theater (extension install lint for a one-time fix), or premature (index hygiene for a pre-launch system). Their actual remediation is already covered:
- MV access control → ADR-018 non-RPC surfaces table
- Extension schema → ADR-018 non-RPC surfaces table
- Index hygiene → UNUSED-INDEX-REVIEW.md 30-day post-launch process

### Work Item 4: Deferred

RUN-006 (Postgres patch management runbook) is an ops task, not a governance gap. It requires a runbook author and quarterly cadence setup, which is operational work outside the scope of this code-level remediation.

---

## Anti-Patterns Documented

The migration anti-patterns doc (`docs/70-governance/anti-patterns/07-migrations.md`) now includes:
- **Anti-pattern #6:** Metadata-only `search_path` changes — `ALTER FUNCTION SET search_path` without body rewrite
- Quick checklist updated with search_path verification item

The Migration Safety Hook doc (`docs/70-governance/MIGRATION_SAFETY_HOOK.md`) now documents:
- **Check 5:** Search path / function body consistency (blocking + warning)
- Hook architecture section updated to reflect all 8 hooks
- Version bumped to 2.0.0

---

## Post-Mortem Note

This précis was originally authored by the same cloud agent that produced the broken SEC-S3 migration. The agent's blind spot was systematic: it could identify advisory findings and propose documentation-level responses, but could not recognize that its own remediation approach (metadata-only `ALTER FUNCTION`) was fundamentally unsound. The lesson: **governance artifacts produced by automated agents require validation against the actual code changes, not just the advisory findings.**

---

_Document owner: Lead Architecture Guild • Created 2026-04-03 • Revised 2026-04-03_
