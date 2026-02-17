---
title: PATCH-DELTA-EXECUTION-SPEC-GAP-SIGN-OUT
applies_to: EXECUTION-SPEC-GAP-SIGN-OUT.md
status: patch-delta
version: 0.1.0
date: 2026-02-10
---

# Patch delta

This document captures the **corrections** required to eliminate spec drift and close remaining implementation traps identified in the latest audits.

## 0) Canonicalization (P0)

**ADD** (immediately under YAML front-matter in `EXECUTION-SPEC-GAP-SIGN-OUT.md`):

> **Canonical Spec Notice**  
> This document is the **single source of truth** for the Sign-out + Lock Screen gap closure.  
> Any prior or copied variants containing the following patterns are **obsolete and must not be implemented**:
> - “call `verifyPinAction` with an empty PIN to detect setup mode”
> - “clear `staff_pin_attempts` via raw `DELETE` from TypeScript”
> - “emit `auth.lock_screen.*` telemetry from `lock-store.ts`”
> - “LockScreen uses `z-[100]` based on a one-time portal z-index audit”

**ADD** to the “Non-goals / Scope” section:

- Cross-tab lock state synchronization is **out of scope** (lock is per-tab). Recommended ops posture: single active tab/session per staff workstation.

---

## 1) PIN setup detection must use `getPinStatusAction` (P0)

### Replace language

**REMOVE** anywhere in the doc:

- “call `verifyPinAction` with empty check”  
- “pass empty PIN to detect NOT_FOUND”  
- “(or check `pin_hash` status)”

**ADD / REQUIRE**:

- A dedicated `getPinStatusAction()` that returns `{ has_pin: boolean }` and is the only allowed method to select the LockScreen mode (setup vs verify).

### Insert into WS5 outputs

**ADD** to WS5 deliverables:

- `app/actions/auth/get-pin-status.ts`  
  - Returns `{ has_pin: boolean }`  
  - Uses authed client + compositor (`withServerAction`)  
  - No PIN value accepted.

### Flow update (LockScreen)

**REPLACE** LockScreen mode selection with:

1. On mount (and whenever auth context changes): call `getPinStatusAction()`.
2. If `has_pin = false`: show **Create PIN** + **Confirm PIN**.
3. If `has_pin = true`: show **Enter PIN**.

---

## 2) Attempt clearing on successful PIN verify must be RPC-only (P0)

### Replace attempt reset approach

**REMOVE** any step that says:

- “on success, `DELETE` from `staff_pin_attempts` in TS”
- “clear attempts by direct DML”

**ADD / REQUIRE**:

- `rpc_clear_pin_attempts()` (SECURITY DEFINER)
  - Takes **no parameters**
  - Derives `staff_id` + `casino_id` from session context (`set_rls_context_from_staff()` / session vars)
  - Deletes attempts for the current actor in the current casino
  - Performs lazy cleanup for old windows (optional but recommended)

### Migration delta (SQL)

**ADD** (or ensure present) in WS4 migration section:

- Revoke direct table access, expose only RPCs:

```sql
REVOKE ALL ON TABLE public.staff_pin_attempts FROM PUBLIC;
REVOKE ALL ON TABLE public.staff_pin_attempts FROM authenticated;

REVOKE ALL ON FUNCTION public.rpc_increment_pin_attempt() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_increment_pin_attempt() TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_clear_pin_attempts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_clear_pin_attempts() TO authenticated;
```

### Code path requirement

**ADD** to WS6 / verify flow:

- On successful verify:
  - Call `rpc_clear_pin_attempts()` **before** returning success.

---

## 3) Telemetry emission must be component-layer, not store-layer (P0)

### Replace telemetry source

**REMOVE** from telemetry tables / notes:

- “`lock-store.ts` emits `auth.lock_screen.locked/unlocked`”

**ADD / REQUIRE**:

- `lock-store.ts` is **pure state** (no telemetry side effects, no auth hook imports).
- UX-grade telemetry (`auth.lock_screen.locked/unlocked`, `auth.lock_screen.idle_locked`, etc.) is emitted from:
  - `LockScreen.tsx` or the root dashboard layout component where `useAuth()` is available.

### Telemetry trust classification

**ADD** a short classification note:

- **Audit-grade** events: emitted server-side only (PIN verify success/fail, rate limit exceeded, sign-out start/end/fail).
- **UX-grade** events: may be client-side (manual lock click, idle lock trigger).

---

## 4) z-index contract must be explicit and durable (P0)

### Replace brittle z-index statement

**REMOVE**:

- “LockScreen uses `z-[100]` because portals are `z-50` (audit)”

**ADD / REQUIRE**:

- A central z-index scale constant, e.g. `lib/constants/z-index.ts`:

```ts
export const Z = {
  TOASTER: 10000,
  LOCK_SCREEN: 9000,
  MODAL: 8000,
} as const;
```

- LockScreen must render at `z-index: Z.LOCK_SCREEN`, and must overlay **all app UI** (except toaster, if desired).

---

## 5) Rate limiting window bucketing invariant (P0)

**ADD / ENSURE** in WS4 / RPC section:

- Attempt bucketing is computed **inside** `rpc_increment_pin_attempt()`:
  - Bucket = floor(now() to 15-minute boundary)
  - Unique key is `(casino_id, staff_id, bucket_start)`

**REMOVE** any mention of `window_start DEFAULT now()` being used directly for uniqueness without bucketing.

---

## 6) `cleanupClientInstance()` must be real or removed (P1)

**ADD** acceptance criteria (WS1 / WS2):

- `cleanupClientInstance()` exists and guarantees a fresh Supabase client instance after sign-out.
- Include a unit test that:
  - calls `cleanupClientInstance()`
  - asserts a new client reference is created.

**IF NOT IMPLEMENTED**, replace with explicit “local cleanup” steps that do not mention it.

---

## 7) Tests / DoD tightening (P0)

**ADD** to DoD:

- `verifyPinAction` success path must call `rpc_clear_pin_attempts()` (test asserts invocation).
- LockScreen setup/verify mode must be based on `getPinStatusAction()` (test asserts behavior).
- `lock-store.ts` must not import auth hooks or telemetry modules (lint/test guard).
- LockScreen z-index must reference `Z.LOCK_SCREEN` (test or static assertion).

---

# Unified diff snippets (optional paste-in)

## A) Replace “empty PIN” setup detection

```diff
- If pin_hash status is unknown, call verifyPinAction with an empty PIN to detect NOT_FOUND.
+ LockScreen MUST call getPinStatusAction() to determine mode:
+ - has_pin=false => Create/Confirm PIN setup
+ - has_pin=true  => Verify PIN entry
```

## B) Replace raw DELETE attempt clearing

```diff
- On successful PIN verify: DELETE FROM staff_pin_attempts WHERE staff_id = actorId AND casino_id = casinoId;
+ On successful PIN verify: call rpc_clear_pin_attempts() (SECURITY DEFINER; identity derived from session context).
+ Direct DML on staff_pin_attempts from TypeScript is forbidden.
```

## C) Move telemetry out of store

```diff
- lock-store.ts emits auth.lock_screen.locked/unlocked events.
+ lock-store.ts is pure state only. Emit UX-grade lock/unlock telemetry from LockScreen/layout component.
```

## D) Replace z-[100] with constant scale

```diff
- LockScreen uses z-[100] based on current portal z-index audit.
+ LockScreen uses Z.LOCK_SCREEN from a shared z-index scale (e.g., 9000). Requirement: overlays all app UI (except toaster if desired).
```
