# PRD Audit — PRD-043: SEC-007 Remaining RPC `p_casino_id` Remediation (Second Pass)

Date: 2026-03-04  
Scope: Second audit pass of PRD-043 (“SEC-007 Remaining RPC `p_casino_id` Remediation (14 RPCs)”).

---

## Executive take

The PRD is now much tighter than the first draft: you converted key assumptions into enforceable requirements (FR-0), standardized the migration template (DROP+CREATE), and added real acceptance criteria for delegation and callsite inventory.

The main remaining fragility is **deployment atomicity**: the PRD claims “zero downtime / no window where DB and app disagree,” but strict DROP+CREATE across two independent deploy systems (Supabase migrations + Vercel deploy) does not guarantee that. This is the one place where the PRD still reads like wishful thinking.

Fix that, and this becomes a boring, mechanical remediation plan—which is exactly what you want.

---

## What improved since last pass (good changes)

- **FR-0 added**: `set_rls_context_from_staff()` must be the first executable statement, with per-RPC assertion. This kills “one weird RPC drift.”
- **Template consistency**: FR-2 + Appendix C align on **strict** `DROP FUNCTION ...; CREATE FUNCTION ...;` (no `OR REPLACE`) to avoid PostgREST ambiguity.
- **Delegation clarity**: FR-5/FR-6 now define acceptance criteria for “delegation allowed” vs “delegation removed.”
- **NFR honesty**: NFR-3 now admits the parameter/error surface may change even if business outputs for valid callers remain stable.

---

## The big remaining hole: “Zero Downtime” isn’t actually satisfied

### The contradiction
- You require strict `DROP (old signature) + CREATE (new signature)`.
- You also require **no window where DB and app disagree**.

In practice:
- Deploy **DB first** → old app still sending `p_casino_id` breaks.
- Deploy **app first** → new app not sending `p_casino_id` breaks until migration lands.
- “Atomic” coordination across Supabase + Vercel is not guaranteed.

### What to add to the PRD
Add an explicit rollout strategy. Two viable options:

**Option A — Compatibility window (recommended):**
- Temporarily support **both** signatures:
  - Old signature (requires `p_casino_id`, no DEFAULTs)
  - New signature (no `p_casino_id`)
- This can be **non-ambiguous** to PostgREST as long as the old signature requires `p_casino_id`.
- After deploy confirmation (no remaining callers), drop the old signature in a follow-up migration.

**Option B — Coordinated deploy (accept risk):**
- Keep strict DROP+CREATE, but rewrite NFR-1 as “coordinated deploy” and document:
  - exact deploy order
  - rollback behavior
  - expected failure mode
- This admits reality but accepts a higher risk profile.

Right now the PRD is trying to demand both purity (no overloads) and operational safety (no disagreement window). Pick one and document the mechanics.

---

## Security model inconsistencies to pin down

### 1) SECURITY DEFINER usage is implied in the pattern but not governed
Appendix C’s pattern uses `SECURITY DEFINER` and `SET search_path = pg_catalog, public`.

If these 14 RPCs are mixed (some invoker, some definer), the PRD should require:
- Do not change `SECURITY DEFINER/INVOKER` posture unless explicitly called out.
- If definer is used, require `SET search_path` (pattern shows it, PRD should enforce it).

### 2) Mutation authorization is asserted, not verified
The PRD states mutation auth is already handled via app staff_role checks (or similar), but does not enforce a verification step.

Add a requirement:
- Each mutation RPC must have a test proving disallowed roles cannot perform the action (either body-gated or via RLS).

Otherwise the broad EXECUTE grants to `authenticated` become dangerous over time.

---

## Scope / callsite hygiene: close, but add one explicit rule

Appendix A includes “no production callsite found” / “verify catalog status” notes. That’s fine, but formalize:

- **Catalog truth wins**: if the function exists in Postgres with `p_casino_id`, it’s in scope, regardless of whether ripgrep finds a TS callsite.

This prevents “dead code” assumptions from leaving allowlist leftovers.

---

## Minor clarity nits (cheap fixes)

- FR-1 says “derive `casino_id` from `current_setting('app.casino_id')`”, while Appendix C adds `NULLIF(..., '')::uuid` and a “no casino context” exception. Promote that exception behavior to an explicit invariant if it’s intended.
- Callsite grep: ensure FR-3/G2 include any server routes/edge functions if the TS layer calls an API wrapper rather than the RPC directly. Otherwise “no p_casino_id in TS” can be a false sense of completion.

---

## Verdict (second pass)

You’re now tight on mechanics and acceptance criteria. The remaining blocker is the “zero downtime” requirement conflicting with strict DROP+CREATE. Add an explicit compatibility rollout strategy (recommended) or rewrite NFR-1 to reflect coordinated deploy reality.

After that, the PRD is in “ship it” territory.
