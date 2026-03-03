# SEC Audit Consensus & Improvement Plan (Folded)

**Date:** 2026-03-01  
**Artifact:** Consolidated Findings → *folded summary + gaps + improvement plan*  
**Scope:** PT‑2 / Supabase RLS + RPC security posture

---

## Executive Consensus

You’re mostly compliant on paper, but the remaining non-compliant slice contains **tenant-boundary breakers** (cross-casino PII exposure, log poisoning, actor spoofing). This is the “one bad policy ruins the whole system” category.

**High-level read:** architecture direction is sound; **governance + CI enforcement is not yet strong enough** to prevent regressions (especially via deprecated primitives and overload ambiguity).

---

## Primary Risk Statement (what matters)

### Catastrophic class (must-fix)
These are not style issues — they’re **cross-tenant / integrity compromises**:

- **Cross-casino staff exposure** (e.g., permissive `staff` SELECT policy patterns like `USING (true)`).
- **Audit log poisoning** (e.g., permissive `audit_log` INSERT `WITH CHECK (true)`).
- **Operational controls mutation** (e.g., overly broad `casino_settings` policies / missing role gates).
- **RPC spoof surfaces** from phantom overloads and identity parameters (e.g., `p_actor_id`) surviving in signatures.

### Systemic failure mode
- **Deprecated context primitives** still exist → they get copy-pasted → regressions repeat.
- **PostgREST named args + DEFAULT params** → overload candidate sets overlap → ambiguity/bypass risk unless old signatures are dropped.
- **Pooling TOCTOU** → `current_setting('app.casino_id')` used without reliably setting context at start of RPC.

---

## Improvements (high signal / low drama)

### 1) Close the “catastrophic three” in RLS (first)
**Goal:** tenant isolation + integrity restored.

- Replace any `USING (true)` on tenant-scoped tables with casino-scoped predicates.
- Replace any `WITH CHECK (true)` on write paths with: casino scope + role gate + row ownership checks as needed.
- Split policies by operation (SELECT vs INSERT vs UPDATE vs DELETE) rather than “FOR ALL” if role gates differ.

**Deliverable:** one migration that:
- fixes `staff` read scoping
- fixes `audit_log` insert scoping
- fixes `casino_settings` write scoping (pitboss vs admin vs service paths)

---

### 2) Delete deprecated `set_rls_context()` for real (DROP, don’t “revoke”)
**Goal:** make future regressions impossible.

- If deprecated function exists, people will use it.
- **DROP** deprecated context setters so mistakes fail at migration-time instead of prod-time.

**Deliverable:** migration that `DROP FUNCTION ...` (all overloads) and updates callers to canonical context setter.

---

### 3) Make “no phantom overloads” a hard gate
**Goal:** end PostgREST ambiguity and spoof surfaces.

- For `rpc_*` functions:
  - Avoid overloads unless explicitly allowlisted.
  - Avoid DEFAULT params that create overlapping call signatures.
  - **DROP old signatures** during upgrades; don’t keep “compat” overloads.

**Deliverable:** migration that removes residual overloads and a CI rule that fails if:
- multiple overloads exist for `rpc_*` (except allowlist)
- any `rpc_*` contains identity args like `p_actor_id` unless explicitly justified + audited

---

### 4) Enforce “context set first line” (pooling reality / TOCTOU)
**Goal:** eliminate stale session-variable reads on pooled connections.

Rule: every security-relevant RPC must do:

1. set context (canonical helper)
2. assert required settings exist (fail closed)
3. then proceed

**Deliverable:** patch set to move context set to the top of each flagged RPC.

---

### 5) Standardize GRANT/REVOKE boilerplate (defense-in-depth)
Even if RLS protects tables, leaving EXECUTE on PUBLIC is a footgun and violates least privilege.

**Template:**
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC;`
- `GRANT EXECUTE ON FUNCTION ... TO authenticated;`
- `GRANT EXECUTE ON FUNCTION ... TO service_role;` (only if needed)

**Deliverable:** batch migration applying the template to all `rpc_*`.

---

## Gaps / Blind Spots (what to add)

### A) “Performance migrations” need a security review protocol
A single “performance optimization” migration caused broad RLS regressions. That’s a process bug.

**Add:** required checklist for any migration touching RLS/policies:
- no permissive `true` policies on tenant tables
- casino scoping present
- writes gated by role
- PostgREST surface reviewed (RPC grants + signature sanity)

### B) Inconsistent role gating (read vs write)
Define canonical policy patterns by table class:

- **Tenant core tables** (player/staff/visit/etc.): strict casino scope on all reads.
- **Operational logs** (audit_log): strict casino scope, inserts constrained, no arbitrary actor attribution.
- **Settings tables** (casino_settings): role-gated updates; read scope as needed.

### C) Identity attribution rules aren’t fully enforced
Adopt explicit invariants:

- **actor_id** derived from session/JWT only (never passed).
- **casino_id** derived from session/JWT only (never passed).
- Any delegated actions (e.g., finance ops) must be **explicitly modeled and audited**, not “free-form staff_id in params.”

### D) PostgREST surface inventory is missing
Add a gate that enumerates:
- exposed `rpc_*`
- required grant state
- signature invariants (no spoof params, no ambiguous overloads)

---

## Recommended Ship Order (coherent stance)

### P0 — immediate (blocker severity)
- Fix the tenant boundary breaks in RLS (staff, audit_log, casino_settings).
- Drop any remaining spoof/overload surfaces (phantom overloads; remove dead identity params).
- Drop deprecated `set_rls_context()` and update callers.
- Fix any directly exposed helper RPCs not meant for PostgREST.

### P1 — next
- TOCTOU fixes: context-set-first-line across RPC set.
- Casino scoping for remaining log/report read paths.
- Batch GRANT/REVOKE normalization.

### P2 — cleanup / convergence
- Remove “validate-pattern” RPCs that still take `p_casino_id`.
- Resolve finance delegation semantics with an explicit contract and audit trail.
- Consistency refactors and doc alignment.

---

## Definition of Done (so it doesn’t regress)

**CI gates (must be real):**
- Fail if any tenant table has `USING (true)` / `WITH CHECK (true)` unless allowlisted & documented.
- Fail if any `rpc_*` has multiple overloads (except allowlist).
- Fail if any `rpc_*` includes `p_actor_id` or accepts `p_casino_id` (except allowlist).
- Fail if any `rpc_*` is executable by PUBLIC.
- Optional: snapshot & diff `pg_proc` + `pg_policies` as part of migration verification.

---

## Quick Checklist (copy/paste into PR)

- [ ] RLS: no permissive `true` policies on tenant-scoped tables
- [ ] RLS: writes have role gates + casino scope
- [ ] RPC: context set first line
- [ ] RPC: no identity params (actor/casino) passed
- [ ] RPC: no ambiguous overloads / default overlap
- [ ] GRANTS: PUBLIC revoked on all `rpc_*`
- [ ] PostgREST surface reviewed (exposed RPC list matches intent)
