# Patch Delta: Add Blast Radius & Call-Site Audit Section to Security Contract

**Date:** 2026-03-02  
**Applies to:** `SEC-FULL-AUDIT-2026-03-01-CONSOLIDATED-FINDINGS.md`  
**Intent:** Formalize the *blast radius* and the required *call-site audit* / rollout safety steps for signature and policy remediations.

---

## ✅ Insert: “Blast Radius & Rollout Safety” (after Test Harness Setup)

### Blast Radius & Rollout Safety (Call-Site Audit Required)

This contract is being introduced late. Several remediations are **breaking** by design (signature drops, overload removal, removal of deprecated context setters). Therefore, **all call sites MUST be audited** before merge, and the rollout must be staged to avoid “silent routing” and production breakage.

#### Primary blast-radius drivers
1. **RPC signature changes / overload removal**
   - Dropping overloads (especially with DEFAULT params) can change which function PostgREST resolves under named-arg calls.
   - Any removal of parameters (e.g., `p_actor_id`) will break callers that still pass them.

2. **Context derivation changes**
   - Forcing `set_rls_context_from_staff()` early will surface callers that previously “worked” accidentally due to stale pooled context.

3. **Policy tightening**
   - Tightened RLS policies can break UI flows that depended on overly permissive reads/writes (even unintentionally).

#### Required Call-Site Audit (pre-merge gate)
Before merging any Sprint 1 (P0) remediation, produce a **call-site inventory** and confirm it is clean.

**Minimum required searches (repo-wide):**
- Deprecated context usage:
  - `rg -n "set_rls_context\("`
- Targeted RPCs with breaking changes (examples; expand as findings require):
  - `rg -n "rpc_start_rating_slip\b"`
  - `rg -n "rpc_update_table_status\b"`
  - `rg -n "rpc_get_rating_slip_duration\b"`
- Removed identity parameters:
  - `rg -n "\bp_actor_id\b"`
  - `rg -n "\bp_casino_id\b"`
- PostgREST direct RPC usage patterns:
  - `rg -n "/rpc/|\.rpc\(|supabase\.rpc\("`

**Deliverable:** a short markdown list in the PR description (or a tracked file under `docs/30-security/`) containing:
- each impacted RPC name
- each consumer file path (UI, server actions, services, workers)
- whether the call is **client-side** or **server-side**
- expected change (signature/params/context)

#### Rollout sequencing (to reduce breakage)
1. **Land DB changes + keep compatibility only when safe**
   - If compatibility is needed, prefer **single signature + optional params** *without creating overlap*.
   - Avoid “dual signatures” for PostgREST-facing RPCs unless explicitly proven non-overlapping.

2. **Update application call sites**
   - Apply TS changes immediately after the migration in the same PR where possible.
   - Regenerate `database.types.ts` and ensure type-check passes.

3. **Run acceptance tests + compile gates**
   - Run the P0 acceptance tests listed in this contract.
   - Enforce CI gates (see CI section) to ensure no deprecated usage remains.

#### Potential dangers if mishandled
- **Silent routing:** PostgREST may resolve to the wrong overload if multiple candidates exist.
- **Partial fixes:** dropping deprecated context setter in DB but leaving call sites will cause runtime failures.
- **False security:** tightening policies without ensuring the app uses the canonical context setter can “break auth” in ways that look like outages.

---

## ✅ Insert: “Breaking Change Registry” (near Remediation Priority Matrix)

### Breaking Change Registry (Mandatory for P0/P1)

For any remediation that changes:
- RPC signatures
- function name resolution (overloads)
- parameter sets (removal of `p_actor_id`, `p_casino_id`)
- GRANT exposure (PUBLIC revoke changes)
- RLS access patterns

…add an entry in this registry:

- **Change ID:** SEC-BC-###
- **RPC/Table:** `<name>`
- **Change type:** signature | overload | policy | grants | context
- **Consumer list:** `<paths>`
- **Compatibility plan:** none | temporary shim (non-overlapping) | coordinated deploy
- **Verification:** `<acceptance test ids>`
- **Rollback plan:** `<what gets reverted>`

---

## ✅ CI Gate Addendum (tighten existing gates)

Add the following CI assertions:

- Fail if repo still contains deprecated context references:
  - `rg -n "set_rls_context\("` (excluding the canonical replacement names)
- Fail if any call site passes removed identity parameters:
  - `rg -n "\bp_actor_id\b"` / `\bp_casino_id\b"` (allowlist only for vetted cases)
- Fail if any PostgREST-facing RPC has >1 signature:
  - `SELECT proname, count(*) FROM pg_proc WHERE proname LIKE 'rpc_%' GROUP BY proname HAVING count(*) > 1;`

---

## Notes
This patch formalizes the **blast radius** that the findings imply and makes “audit call sites” a **hard pre-merge requirement**, reducing the probability of a late-contract remediation causing production breakage.
