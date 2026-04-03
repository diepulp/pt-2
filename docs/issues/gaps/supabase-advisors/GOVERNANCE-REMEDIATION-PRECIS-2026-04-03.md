# Supabase Advisor Governance & Lead-Architect Précis — 2026-04-03

**Source findings:** [SUPABASE-ADVISOR-REPORT-2026-04-02.md](./SUPABASE-ADVISOR-REPORT-2026-04-02.md)  
**Focus:** Governance/doc remediations flagged by the April 2 report + follow-on lead-architect audit  
**Status:** Planning complete — implementation pending per work items below

---

## Summary Dashboard

| Track | Artifact | Owner | Status | Notes |
|-------|----------|-------|--------|-------|
| ADR | Update ADR-018 (Security Definer Governance) | Security / Platform | **Planned** | Extend scope beyond `rpc_*`, enforce pinned search_path & PostgREST inventory linkage |
| ADR | Update ADR-030 (Auth Hardening) | Lead Architect + DevRel | **Planned** | Add sign-out workflow, dashboard settings baseline (HIBP, MFA) |
| Governance | New `DERIVED_READ_MODEL_GOVERNANCE_STANDARD.md` | Lead Architect | **Planned** | Covers access control + refresh/monitoring for views & MVs |
| Runbook | `RUN-006-supabase-postgres-patch-management.md` | DevOps | **Planned** | Monthly cadence for SEC-S8 + version tracking |
| Migration Checklist | Extension install rules | DevOps | **Planned** | Force `extensions` schema usage + lint hooks |
| Governance | `INDEX_HYGIENE_STANDARD.md` | Performance Engineer | **Planned** | FK index policy, unused-index quarterly review |

---

## Lead Architect + Domain Expert Findings

### 1. ADR-018 Requires Broader Scope
- **Gap:** ADR-018 currently governs only SECURITY DEFINER RPCs even though views, materialized views, and trigger helpers can bypass RLS the same way (exposed by SEC-S1 / SEC-S3).  
- **Remediation Plan:**
  - Update ADR-018 front-matter + decision sections to name every owner-privileged surface (RPCs, definer triggers, views/MVs).
  - Mandate pinned `SET search_path = pg_catalog, public` everywhere and add lint checks for non-RPC surfaces.  
  - Require PostgREST inventory linkage + explicit GRANT/REVOKE posture for any governed surface.
  - Update the RLS review checklist and PostgREST surface inventory doc to match the new scope.

### 2. ADR-030 Must Cover Sign-Out + Dashboard Guardrails
- **Gap:** ADR-030 omits user-initiated sign-out and Supabase Auth control-plane settings, leaving SEC-S6/S7 manual.  
- **Remediation Plan:**
  - Add “user sign-out” as a claims-clearing trigger and document the authoritative server action sequence (claims clear → structured events → session termination → client cleanup).
  - Introduce decision `D7` for Supabase dashboard settings (HIBP leaked-password checker + minimum two MFA modalities) with quarterly audits and ownership mapping.
  - Add invariants for dashboard posture, sign-out-only server workflow, and new observability events.
  - Update execution/verification sections so these controls become Definition of Done items.

### 3. Derived Read Model Governance Standard
- **Gap:** `mv_loyalty_balance_reconciliation` lacked refresh cadence and GRANT discipline; no doc governs derived read models.  
- **Remediation Plan:**
  - Create `docs/70-governance/DERIVED_READ_MODEL_GOVERNANCE_STANDARD.md` covering scope, artifact registry metadata, access control defaults, refresh/monitoring requirements, verification/testing expectations, consumer documentation, and operational runbooks.
  - Include an appendix using the loyalty MV as the canonical example.

### 4. Supabase Postgres Patch Runbook (SEC-S8)
- **Gap:** No documented process for tracking `supabase-postgres-*` versions; SEC-S8 remains “manual action.”  
- **Remediation Plan:**
  - Author `docs/50-ops/runbooks/RUN-006-supabase-postgres-patch-management.md` with metadata, triggers, roles, version-tracking checklist, preflight/staging/prod procedures, verification gates, rollback guidance, and audit logging tied to the current vulnerable baseline (`supabase-postgres-17.4.1.074`).

### 5. Extension Install Governance
- **Gap:** Older migrations install extensions (e.g., `pg_trgm`) in `public`; SEC-S4 fix already moved one, but no guardrail prevents regressions.  
- **Remediation Plan:**
  - Update `docs/70-governance/anti-patterns/07-migrations.md` + `MIGRATION_SAFETY_HOOK.md` to require `extensions` schema installs, schema creation boilerplate, required COMMENTS, and schema-qualified operator class usage.
  - Add pre-commit/CI lint rules that reject `CREATE EXTENSION` without `SCHEMA extensions` or installs into `public`.

### 6. Index Hygiene Standard (PERF-P4/P5)
- **Gap:** FK indexing and unused-index reviews are ad-hoc; April 2026 Advisor snapshot shows 68 FK misses + 126 unused indexes despite prior remediation.  
- **Remediation Plan:**
  - Publish `docs/70-governance/INDEX_HYGIENE_STANDARD.md` with policy statements (FK indexes at creation, documented exceptions), automation hooks (psql audit script, CI guard, Advisor reruns), and reporting expectations (issue-based logs with evidence, quarterly deltas).

---

## Next Steps
1. Draft & land the ADR amendments (ADR-018, ADR-030) with linked PRs and updated checklist/inventory references.
2. Produce the new governance artifacts + runbook; wire corresponding lint/CI hooks (extensions, FK indexes, derived read models).
3. Re-run Supabase Advisor after docs + automation merge; close SEC-S6/S7/S8 action items once dashboard settings and Postgres upgrade are complete.
4. Schedule the first quarterly index review + derived read model refresh audit per the new standards.

---

_Document owner: Lead Architecture Guild • Created 2026-04-03_
