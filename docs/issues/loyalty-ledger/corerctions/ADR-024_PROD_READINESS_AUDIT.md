---
title: "ADR-024 Audit — RLS Context Self-Injection Remediation"
date: 2025-12-29
status: "audit"
scope: "production-readiness"
artifacts:
  - "RLS_CONTEXT_SELF_INJECTION_ANTIPATTERN_REMEDIATION_PLAN.md"
  - "ADR-024-rls-context-self-injection-remediation.md"
---

# Verdict

**Directionally correct, but not production-ready as written.** ADR-024 closes the obvious “self-injection” exploit path, yet it still relies on unstated invariants and leaves a few sharp edges that can reintroduce privilege escalation or create an exploitable rollout window.

If this is going to production, **amend the ADR and gate the merge** on the “Must fix before prod” list below.

---

# What ADR-024 gets right

- **Correct trust-boundary diagnosis:** session vars were attacker-settable via `set_rls_context(...)`, and RLS/RPC logic treated `current_setting()` as authority via session-first `COALESCE(...)`.
- **Correct remediation shape:** replace “accept parameters” with “derive from authoritative sources” (JWT + staff table) and write with **`SET LOCAL`** to stay pooler-safe.
- **Reasonable blast radius:** focuses on the affected setter and the RPCs most likely to depend on it.

---

# Production readiness gaps

## 1) Identity binding hole: `staff_id` claim is not bound to `auth.uid()`

ADR treats the JWT `staff_id` claim as “authoritative” and only falls back to `staff.user_id = auth.uid()` when the claim is missing.

That’s safe **only if** your claim issuance pipeline is perfect forever. In reality, any mis-issued token becomes a privilege escalator.

**Fix (production-grade):**
- When `staff_id` claim is present, **still validate it matches the caller**:
  - `WHERE s.id = v_staff_id AND s.user_id = auth.uid()`
- Or pick one identity source and delete the other branch (JWT-only vs user_id-only) so you don’t have two competing truths.

---

## 2) “RLS unchanged is now safe” is an assumption, not a fact

ADR leans on keeping policies as `COALESCE(current_setting(), jwt)` because session vars are “authoritative.”

That remains fragile unless you can *prove* no untrusted pathway can ever set `app.*` again (now or later). This is the exact kind of regression that sneaks back in via “helpful” future SECURITY DEFINER helpers.

**Defense-in-depth options:**
- Adopt the **must-match** guard for critical policies (session must equal JWT where both exist).
- If you refuse must-match due to volume, add a **hard gate**: document the invariant (“no client-callable code can set app.* except the vetted function”) and keep an explicit audit list of remaining `COALESCE` sites with rationale.

> Note: ADR-024 downplays must-match as too expensive, while the remediation plan calls it recommended. Resolve this contradiction.

---

## 3) Rollout sequencing window: “pwn me” gap between migrations

ADR’s phased rollout (create new function → update RPCs → revoke old function) creates a window where:
- the old spoofable setter is still callable, and
- not all RPCs are updated yet.

**Fix (production-grade):**
- Ship as **one atomic deployment** (single migration transaction if feasible):
  1) create `set_rls_context_from_staff()`
  2) update all affected RPCs to use it
  3) revoke old `set_rls_context` from `authenticated`
- If you cannot do one transaction, at minimum do **(2) + (3) together** to eliminate the gap.

---

## 4) Missing constraints/indexes for determinism + performance

ADR suggests an index on `staff(id)`—typically redundant if `id` is already a PK.

What you *actually* need:
- **Unique constraint/index on `staff.user_id`** (or at least an index) because you look up by it.
- Deterministic lookup: avoid `LIMIT 1` without `ORDER BY`.
  - Prefer `SELECT ... INTO STRICT` + uniqueness so multiple matches hard-fail.

---

## 5) SECURITY DEFINER hygiene is incomplete

Setting `search_path` is good, but for production-grade hardening:
- Prefer `SET search_path = pg_catalog, public` to reduce function-hijack risk.
- Define **function ownership** expectations (least privilege; don’t own with a god role if unnecessary).
- Explicitly state that the function reads `staff` under SECURITY DEFINER and why this does not leak data (single-row lookup scoped to caller).

---

## 6) Service-role / backend jobs story is missing

ADR says legacy `set_rls_context()` remains for internal/migration use but does not define:
- who can call it,
- how service-role/automation safely sets context,
- how you prevent accidental exposure to clients.

**Fix (production-grade):**
- Define two lanes:
  - **Client lane:** only `set_rls_context_from_staff()` is callable by `authenticated`.
  - **Ops lane:** separate `set_rls_context_internal(...)` callable only by `service_role` (or a dedicated db role) with strict validation + audit logging.

---

## 7) Verification is too thin for a security remediation

ADR includes basic attack tests and monitoring bullets, but production readiness needs explicit **security gates**.

Minimum gates:
- **Negative tests**
  - calling deprecated `set_rls_context` as `authenticated` fails
  - poisoning attempts can’t cross casino boundary via any updated RPC
  - staff `inactive` blocks context derivation and downstream queries
- **RLS tests**
  - direct table reads under RLS remain casino-scoped anywhere `COALESCE` still exists
- **Pooling tests**
  - transaction pooling + multiple RPC calls does not leak context between requests
- **Auditability**
  - `audit_log` actor/casino attribution comes from derivation, never from caller-supplied params

---

# Must fix before prod (merge blockers)

1. **Bind staff identity**: if `staff_id` claim exists, require `staff.user_id = auth.uid()` (or choose a single identity source and remove the other).
2. **Eliminate rollout gap**: update RPCs + revoke old setter in the same deployment window (preferably same transaction).
3. **Add constraints/indexes**: unique/index on `staff.user_id`; remove nondeterministic `LIMIT 1` patterns.
4. **Define ops lane**: formalize service-role/internal context setting; never expose param-setters to clients.
5. **Either implement must-match RLS for critical tables or document and enforce a strict invariant** + add audit coverage.

---

# Summary

ADR-024 is a solid *fix direction* but still reads like a “dev environment hardening note,” not a production security remediation. Convert assumptions into enforceable invariants, close the rollout window, and add the missing identity binding + test gates.
