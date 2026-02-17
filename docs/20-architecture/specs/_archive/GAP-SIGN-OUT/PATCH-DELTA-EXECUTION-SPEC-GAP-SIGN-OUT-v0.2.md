---
title: PATCH-DELTA-EXECUTION-SPEC-GAP-SIGN-OUT-v0.2
applies_to: EXECUTION-SPEC-GAP-SIGN-OUT.md
status: patch-delta
version: 0.2.0
date: 2026-02-10
---

# Patch delta v0.2

This patch applies targeted corrections to reduce **spec drift** and tighten the remaining ambiguities in `EXECUTION-SPEC-GAP-SIGN-OUT.md`. fileciteturn3file0

## 1) z-index constant: remove ambiguity (P0)

### Problem
The spec defines `Z_LOCK_SCREEN` but also references a “scale” concept. This invites drift and inconsistent imports.

### Patch
**REPLACE** the z-index guidance block in **WS6 → Lock Screen Overlay** with a single canonical pattern:

- File: `lib/constants/z-index.ts`
- Export: `Z` object

```ts
// lib/constants/z-index.ts
export const Z = {
  TOASTER: 10000,
  LOCK_SCREEN: 9000,
  MODAL: 8000,
} as const;
```

**REQUIRE**
- Lock screen uses `Z.LOCK_SCREEN` (no inline magic numbers without reference).
- Remove all remaining references to `Z_LOCK_SCREEN` and use the `Z` object everywhere.

**Acceptance criteria add**
- [ ] No usage of `Z_LOCK_SCREEN` remains (single source of truth is `Z.LOCK_SCREEN`).

---

## 2) Rate-limit bucketing: timezone determinism note (P1)

### Problem
The bucketing expression is correct, but the spec doesn’t explicitly state that it’s stable across server timezone settings.

### Patch
**ADD** a short note in WS4 under `rpc_increment_pin_attempt()`:

> **Timezone note:** `v_now` is `timestamptz` (`now()`), which represents an absolute time. Bucketing is deterministic regardless of session timezone. If future changes introduce `timestamp without time zone`, normalize via `timezone('UTC', now())` before computing `v_window`.

---

## 3) PIN reset runbook: make the MVP ops path explicit (P1)

### Problem
The spec says “admin manual reset only” but doesn’t describe how an operator actually does it.

### Patch
**ADD** under “PIN Reset Flow (MVP)”:

- **Runbook (MVP):** Admin resets a staff PIN by setting `staff.pin_hash = NULL` using the existing admin staff edit surface (if present). If no UI exists yet, perform a controlled reset via a Supabase SQL console script (service role) and log the action in `audit_log` with `action='staff.pin_reset'`.

**Acceptance criteria add**
- [ ] The repo contains either (A) an admin UI reset path, or (B) a documented SQL snippet + audit_log requirement for the manual reset procedure.

---

## 4) Remove brittle line-number references for `cleanupClientInstance()` (P0)

### Problem
The spec cites `lib/supabase/client.ts (line ~79)`. Line numbers rot instantly.

### Patch
**REPLACE** the phrase:

- “`cleanupClientInstance()` from `lib/supabase/client.ts` (line ~79, already implemented)”

with:

- “`cleanupClientInstance()` exported from `lib/supabase/client.ts` (stable path; do not reference line numbers).”

**Acceptance criteria add**
- [ ] Spec contains no “line ~” references.

---

## 5) WS3 / WS7 executor mismatch: clarify ownership (P1)

### Problem
WS3/WS7 include UI tests but are assigned to backend executor; this is confusing for ownership and review.

### Patch (choose one)

**Option A (preferred): Split ownership**
- Move component tests to `frontend-design-pt-2` executor.
- Keep server action tests under backend executor.

**Option B (minimal): Declare executor scope**
- Add a note in WS3 and WS7 descriptions:
  > Executor includes React Testing Library/Jest component test ownership for this repo.

---

## 6) One-line invariant: staff_pin_attempts is RPC-only (P0)

### Problem
The spec explains the model, but it’s spread out. Reviewers need a single enforcement sentence.

### Patch
**ADD** in WS4 immediately before the “TABLE ACCESS CONTROL” block:

> **Invariant:** `staff_pin_attempts` is **RPC-only**. App code must never issue direct SELECT/INSERT/UPDATE/DELETE against `staff_pin_attempts`. All access is via `rpc_increment_pin_attempt()` and `rpc_clear_pin_attempts()`.

**Acceptance criteria add**
- [ ] A lint/grep guard (or code review checklist item) exists: forbid `.from('staff_pin_attempts')` in app code.

---

## 7) DoD tightening: banner behavior for Local Cleanup (P1)

### Problem
Local cleanup banner behavior is described, but not pinned to a deterministic mechanism.

### Patch
**ADD** to WS2 acceptance criteria (or `useSignOut()` section):

- Banner trigger mechanism must be deterministic:
  - either redirect includes `?local_cleanup=1`, or
  - the hook sets a `sessionStorage` flag consumed by `/signin`.

**Acceptance criteria add**
- [ ] `/signin` displays the degraded sign-out banner only when the deterministic flag is present.

---

# Unified diff snippets (optional)

## A) Replace Z_LOCK_SCREEN with Z object

```diff
- export const Z_LOCK_SCREEN = 9000;
+ export const Z = { TOASTER: 10000, LOCK_SCREEN: 9000, MODAL: 8000 } as const;
```

```diff
- style={{ zIndex: Z_LOCK_SCREEN }}
+ style={{ zIndex: Z.LOCK_SCREEN }}
```

## B) Replace line-number reference

```diff
- cleanupClientInstance() from lib/supabase/client.ts (line ~79, already implemented)
+ cleanupClientInstance() exported from lib/supabase/client.ts (stable path; do not reference line numbers)
```
