---
title: "Audit: rpc_close_rating_slip Snippet — Problems, Mismatches, and Required Fixes"
date: 2025-12-29
status: audit
scope: PT-2
tags:
  - rpc
  - rls
  - security-definer
  - rating-slip
  - audit-log
---

# Audit: `rpc_close_rating_slip` Snippet — Problems, Mismatches, and Required Fixes

This document captures the problems and policy mismatches identified in the posted `public.rpc_close_rating_slip(...)` SQL snippet, in the context of the hardened RLS-context approach (`set_rls_context_from_staff`) and the ongoing JWT-first / must-match RLS policy update.

---

## Snippet context

- The function is declared as **`SECURITY DEFINER`**
- It begins with `PERFORM set_rls_context_from_staff();`
- It then extracts `app.actor_id`, `app.casino_id`, `app.staff_role` and validates `p_casino_id` and `p_actor_id` against the context before mutating `rating_slip`.

---

# Executive verdict

✅ Directionally correct: uses authoritative context injection and validates scope early.  
⛔ Not congruent enough to ship “as-is”: it mixes an authoritative DEFINER command with redundant/unsafe parameters and omits required authorization checks.

---

# Issues & mismatches

## 1) Missing authorization check (P0)

### Problem
The snippet extracts `v_context_staff_role` but **never uses it**.

**Impact:** any active staff member in the casino who can call the RPC can close a rating slip.

### Required fix
Add an explicit allowlist check before touching data:

```sql
IF v_context_staff_role NOT IN ('pit_boss','supervisor','admin') THEN
  RAISE EXCEPTION 'FORBIDDEN: role % cannot close rating slips', v_context_staff_role
    USING ERRCODE = 'P0001';
END IF;
```

*(Adjust roles to your actual policy.)*

---

## 2) `SECURITY DEFINER` shifts the security boundary from RLS to function logic (design mismatch)

### Problem
With **`SECURITY DEFINER`**, the function executes under the definer’s privileges. Depending on role configuration, it can **bypass RLS** and table privileges.

**Impact:** you must treat the function as an **authoritative command**: correctness depends on explicit checks in code, not “RLS will stop it.”

### Required decision
Choose one:

- **Keep `SECURITY DEFINER` (explicit command gate):**  
  enforce identity + casino scope + role authorization + row ownership explicitly inside the function.

- **Pivot to `SECURITY INVOKER` (RLS is the gate):**  
  remove privileged behavior and encode permissions in RLS policies for `rating_slip` (and `audit_log` if applicable).

**Pilot recommendation:** keep DEFINER if you need multi-table writes (e.g., audit log) and can enforce checks reliably; otherwise prefer INVOKER for simpler safety.

---

## 3) Redundant/unsafe parameter: `p_actor_id` should not be client-supplied (P0)

### Problem
The function accepts `p_actor_id` and validates it matches `v_context_actor_id`.

Even if validated, this is redundant and expands attack surface: the actor is the caller identity derived from `set_rls_context_from_staff()`.

### Required fix
Remove `p_actor_id` from the signature and use the derived context actor for attribution:

- Use `v_context_actor_id` for `audit_log.actor_id`
- Remove the actor mismatch check entirely

If you cannot change the signature immediately, **ignore** `p_actor_id` for all writes/logging and only use the derived actor.

---

## 4) Audit log bug: `previous_status` is not actually previous (P0 correctness)

### Problem
You insert audit log **after** updating the slip, but you use:

```sql
'previous_status', v_result.status
```

At that point `v_result.status` is already `'closed'`, so you record the new status, not the prior status.

### Required fix
Capture `v_prev_status` right after the `SELECT ... FOR UPDATE` and use it in audit details:

```sql
v_prev_status := v_result.status;

-- ... later
'previous_status', v_prev_status
```

---

## 5) Congruency with JWT-first / must-match RLS policy update (P1)

### Problem
The function relies on `current_setting('app.*')` values for validation. This is fine **only if**:
- `set_rls_context_from_staff()` derives identity and scope from authoritative sources (staff table + auth.uid / JWT)
- RLS policies are updated so session vars cannot override JWT (JWT-first or must-match)

If policies remain session-first (`COALESCE(current_setting, jwt)`), you are still vulnerable.

### Required fix (system-level)
- Ensure RLS uses **JWT-first** or **must-match** patterns.
- Ensure `set_rls_context_from_staff()` sets `app.casino_id` consistent with JWT/staff truth.

---

# Recommended corrected shape (minimal churn)

## If keeping SECURITY DEFINER
- [ ] Add role allowlist check
- [ ] Remove/ignore `p_actor_id`; use derived actor
- [ ] Fix audit `previous_status`
- [ ] Keep casino scope check (`p_casino_id` vs derived context)
- [ ] Keep slip row scope in the lock query (`WHERE id = ... AND casino_id = ... FOR UPDATE`)

## If pivoting to SECURITY INVOKER
- [ ] Ensure RLS policies explicitly permit “close slip” for allowed roles
- [ ] Ensure audit logging is handled safely (either via allowed insert policy on `audit_log` or a separate privileged audit writer)
- [ ] Remove redundant identity params; rely on `auth.uid()` / derived context

---

# Ship gate checklist

## P0 blockers
- [ ] Role authorization enforced (`v_context_staff_role` used)
- [ ] `p_actor_id` removed or ignored for writes/logs
- [ ] `previous_status` logged correctly (captured pre-update)

## P1 hardening
- [ ] RLS policies updated to JWT-first / must-match (no session override)
- [ ] Functions schema-qualified where appropriate, and/or search_path is set

---

# Final verdict

The snippet is aligned with the hardened context approach in spirit, but it is not yet congruent with the policy update: **DEFINER requires explicit authorization and correct auditing**, and redundant identity parameters should be removed to avoid future drift and spoofing surface.
