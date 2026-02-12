---
title: "RLS Too Restrictive — Root Cause & Fix Pattern (Session Vars vs JWT Fallback)"
doc_type: "implementation_note"
version: "0.1.0"
date: "2026-02-11"
timezone: "America/Los_Angeles"
status: "final"
related_docs:
  - "ISSUE-GAMING-TABLE-RLS-WRITE-POLICY-SESSION-VAR-ONLY.md"
  - "ADR-030 (session-var-only write posture for critical tables)"
  - "PRD-030 / EXECUTION-SPEC-PRD-030 (Setup Wizard)"
---

# RLS “Too Restrictive” During Implementation — What Actually Happened

This note captures the failure mode that surfaced while implementing Setup Wizard table creation/updates: RLS appeared “too restrictive,” but the real issue was **a mismatch between the RLS policy model and the execution path** (RPC sets vars in one transaction, then PostgREST writes in another).

## Executive Summary

- The attempted posture was **session-var-only write policies** (ADR-030 style).
- The implementation path used:
  1) an RPC (`set_rls_context_from_staff()`) to set Postgres session variables via **`SET LOCAL`**, and then
  2) a separate `supabase.from(...).upsert(...)` call (PostgREST) to write `gaming_table` rows.
- **`SET LOCAL` variables are transaction-scoped**. After the RPC returns, that transaction ends and the variables disappear.
- The subsequent PostgREST request runs in a **new transaction** with no session vars set, so **RLS denies the write**.

The fix is to align RLS policies with the execution model:
- For PostgREST DML from server actions: **Pattern C** — `COALESCE(current_setting(...), auth.jwt()->...)`.
- For session-var-only writes: **do the write inside the same RPC** (single-transaction path).

---

## What’s Actually Happening (Failure Mode)

### The intended flow (incorrect assumption)
- “Call `set_rls_context_from_staff()` once per request; now the session has vars; later writes will see them.”

### The real flow (what Postgres/Supabase does)
1) Server calls `set_rls_context_from_staff()`:
   - sets `app.casino_id`, `app.actor_id`, `app.staff_role` using **`SET LOCAL`**
   - transaction commits
2) Server calls PostgREST for `gaming_table` upsert:
   - **new HTTP request**
   - **new DB transaction**
   - `current_setting('app.casino_id', true)` returns NULL
3) Session-var-only RLS policy checks fail → INSERT/UPDATE denied

> Key point: **RPC + separate PostgREST write is not a single transaction**, so `SET LOCAL` cannot carry across.

---

## Correct Mental Model: Pick One of Three Patterns

### Pattern 1 — COALESCE Session Vars → JWT Fallback (Recommended Default)
**Use when:** server actions perform DML via PostgREST (`supabase.from(...).insert/update/upsert`).

**Policy posture:**
- Always scope by `casino_id`
- Authorize by `staff_role`
- Use session vars when present, **fallback to JWT claims** when not.

**Why it works:**
- JWT claims are present on every PostgREST request.
- Session vars become an optimization / compatibility layer, not a hard dependency.

**Typical check shape:**
- `COALESCE(current_setting('app.casino_id', true), auth.jwt()->'app_metadata'->>'casino_id')`

### Pattern 2 — Session-Var-Only, but Writes Must Happen Inside the Same RPC
**Use when:** you want ADR-030 “session-var-only writes” posture.

**Requirement:**
- The write must occur inside a single RPC call:
  - set context → write rows → return result
- No separate PostgREST DML after the context-setting RPC.

**Why it works:**
- All checks and DML occur in one transaction, so `SET LOCAL` is in effect for the write.

### Pattern 3 — Service Role Bypass (Avoid Unless You’re Desperate)
**Use when:** you need a quick unblock and accept elevated risk.

**Reality:**
- Service role bypasses RLS entirely.
- This is the fastest way to accidentally punch a tenant boundary in the face.

---

## Why `gaming_table` Should Use Pattern 1 (Pattern C)

`gaming_table` is an operational configuration table and is not a “critical write-path” entity requiring ADR-030 posture. It also already used a COALESCE/JWT fallback approach for SELECT, so aligning INSERT/UPDATE to the same posture is consistent.

### Benefits
- Works with Supavisor transaction pooling and PostgREST request boundaries.
- Preserves strict casino scoping and role gating.
- Prevents “context evaporated” failures when the write occurs outside the context-setting RPC.

---

## Practical Rule of Thumb (So This Doesn’t Happen Again)

### If your write is done via `supabase.from(...).insert/update/upsert`:
✅ Use **Pattern 1** (COALESCE session vars → JWT).

### If you insist on session-var-only writes:
✅ Put the write in an RPC (Pattern 2).

### Never do this:
❌ “RPC sets `SET LOCAL` vars” **and later** “separate PostgREST write expects vars.”

---

## Next Steps: Prevent Repeat Incidents (Recommended)

1) **Policy scan**
   - Find RLS policies that use `current_setting('app.casino_id', true)` as a hard requirement **without JWT fallback**.
2) **Classify by table criticality**
   - If the table is not in ADR-030 critical list and DML uses PostgREST → convert to Pattern 1.
   - If you want to keep session-var-only → refactor writes into an RPC.
3) **Add a lightweight “RLS lint” checklist**
   - “If DML is PostgREST, policy must support JWT fallback.”
   - “Session-var-only policies require RPC-only write paths.”

---

## Bottom Line

RLS wasn’t “too strict.” It was **strict in a way that assumed a single-transaction write path**, while the implementation used **multiple HTTP requests (multiple transactions)**.

Align the policy with the execution model:
- PostgREST writes → **COALESCE session + JWT fallback**
- Session-var-only posture → **write inside the RPC**

