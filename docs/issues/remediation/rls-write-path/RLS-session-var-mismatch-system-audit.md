---
title: "RLS Session-Var Mismatch — System-Wide Audit Report"
doc_type: "remediation_audit"
version: "1.1.0"
date: "2026-02-11"
timezone: "America/Los_Angeles"
status: "actionable"
severity_summary: "1 HIGH, 1 MEDIUM, 1 LOW"
audit_corrections: "AUDIT-RLS-session-var-mismatch-system-audit.md (v0.1.0)"
related_docs:
  - "ISSUE-GAMING-TABLE-RLS-WRITE-POLICY-SESSION-VAR-ONLY.md"
  - "RLS-too-restrictive-session-vars-vs-jwt-fallback.md"
  - "ADR-030 (auth pipeline hardening)"
  - "ADR-015 (connection pooling strategy)"
  - "ADR-024 (authoritative context derivation)"
---

# RLS Session-Var Mismatch — System-Wide Audit Report

## Executive Summary

The `gaming_table` bug (ISSUE-GAMING-TABLE-RLS-WRITE-POLICY-SESSION-VAR-ONLY) was not a one-off. Four parallel domain expert agents investigated the entire codebase: migrations, service layer, RPC functions, and ADR-030 critical tables. The core failure mode — **session-var-only RLS policies paired with PostgREST DML** — was found in **two additional active risk areas** and **one spec/implementation gap**.

### Root Cause (Recap)

`SET LOCAL` session variables are **transaction-scoped**. The `withServerAction` middleware calls `set_rls_context_from_staff()` via RPC (Transaction A), then the handler performs PostgREST DML (Transaction B). Session vars evaporate between transactions. Tables with session-var-only policies silently reject the write.

### Second Failure Mode: Silent No-Op Writes

The mismatch is not always a hard RLS violation error. It can manifest as **"0 rows affected"** — the write silently does nothing and the caller may misinterpret this as success. This is the exact bug that hit `setPinAction` before it was moved to an RPC.

**Invariant (INV-ROWCOUNT):** All write operations MUST assert affected rowcount >= 1, unless explicitly allowed. This catches RLS-deny-as-noop failures and prevents "silent success" bugs.

### Correct Mental Model

| Write execution path | Required RLS policy pattern |
|---|---|
| PostgREST DML (`.from(table).insert/update/upsert`) | **Pattern C** — `COALESCE(session_var, jwt_fallback)` |
| Self-contained SECURITY DEFINER RPC | Session-var-only is acceptable |
| Service-role client (break-glass only) | RLS bypassed entirely — see constraints below |

**Service-role constraint:** Service-role usage is **break-glass only**. If ever used, it requires compensating controls:
- Explicit server-side `casino_id` assertion (no trust of caller-supplied values)
- Mandatory `audit_log` entry for the operation
- Dedicated abuse-case tests (cross-casino, role misuse, replay)

---

## Findings Summary

| # | Issue | Severity | Table | Location | Status |
|---|---|---|---|---|---|
| 1 | PostgREST DML vs session-var-only policy | **HIGH** | `staff` | `app/api/v1/casino/staff/route.ts:147` | Active bug |
| 2 | Fallback upsert path vs session-var-only policy | **MEDIUM** | `player_casino` | `services/casino/crud.ts:482` | Latent risk |
| 3 | ADR-030 D4 spec never implemented on player | **LOW** | `player` | Policy never tightened | Spec gap |

---

## Finding 1: `staff` Table — Active Bug (HIGH)

### Symptom

Admin creating staff via `POST /api/v1/casino/staff` will get an RLS policy violation.

### Location

`app/api/v1/casino/staff/route.ts:147-151`:

```typescript
const { data, error } = await mwCtx.supabase
  .from('staff')
  .insert(staffData)
  .select(STAFF_SELECT)
  .single();
```

### Analysis

- `mwCtx.supabase` is the user-authenticated client (from `createClient()`), NOT service-role.
- The `staff` table has **session-var-only** write policies (Category A per auth hardening migration `20260129193824`).
- `withServerAction` middleware calls `set_rls_context_from_staff()` in Transaction A.
- `.from('staff').insert()` executes in Transaction B.
- Session vars from Transaction A are gone. Policy evaluates `casino_id = NULL` and denies.

### Contrast with Working Paths

- `services/casino/crud.ts` `createStaff()` (line 334) uses a **service-role client** (bypasses RLS) — annotated with eslint-disable.
- `rpc_set_staff_pin` uses a self-contained SECURITY DEFINER RPC — session vars available within transaction.

### Fix

Create `rpc_create_staff` SECURITY DEFINER RPC — consistent with INV-030-7 pattern. The RPC must:
- Call `set_rls_context_from_staff()` to validate caller role (admin)
- Derive `casino_id` from context/JWT (no spoofable parameter)
- Insert the staff row within the same transaction
- Write an `audit_log` entry
- Return the created row

**Rejected alternatives:**
- ~~Service-role client~~: Shifts security from RLS to app correctness. One bug = cross-tenant write. Only acceptable as break-glass with full compensating controls.
- ~~Revert to COALESCE~~: Demotes `staff` from Category A — inconsistent with ADR-030 posture for this critical table.

---

## Finding 2: `player_casino` Table — Latent Risk (MEDIUM)

### Location

`services/casino/crud.ts:482-496`:

```typescript
const { data, error } = await supabase
  .from('player_casino')
  .upsert({ player_id, casino_id, enrolled_by, status: 'active' },
    { onConflict: 'player_id,casino_id' })
  .select(...)
  .single();
```

Called from `app/api/v1/players/[playerId]/enroll/route.ts:100` with `mwCtx.supabase` (authenticated client).

### Analysis

- `player_casino` has **session-var-only** INSERT/UPDATE policies (Category A).
- PostgREST upsert will fail if the code path is hit.
- **Mitigation in place**: The enroll route handler (line 95-98) skips the upsert if already enrolled, and `rpc_create_player` atomically handles primary creation including `player_casino` INSERT inside the RPC.
- The `enrollPlayer()` fallback path is **broken but rarely triggered** in practice.

### Fix Options

1. **(Recommended)** Remove the direct PostgREST fallback; rely on `rpc_create_player` for atomic enrollment. Or create `rpc_enroll_player`.
2. Add COALESCE JWT fallback to `player_casino` INSERT/UPDATE policies.

---

## Finding 3: `player` Table — Spec Gap (LOW)

### Analysis

ADR-030 D4 explicitly lists `player` as a critical table requiring session-var-only write policies. However, the auth hardening migration (`20260129193824`) **never updated** the `player` write policies — they still use COALESCE from pre-hardening migrations.

`services/player/crud.ts:201` does `.from('player').update()` via PostgREST, which works **because the policy was never tightened**.

### Risk

If someone later enforces ADR-030 D4 on `player` without migrating `updatePlayer()` to an RPC, it will break silently — the exact same bug class.

### Fix Options

1. **(Recommended)** Update ADR-030 D4 to remove `player` from critical list, acknowledging the COALESCE policy is correct for the PostgREST write path.
2. Migrate `updatePlayer()` to an RPC and tighten policy to session-var-only.

---

## Full System Inventory

### Category A Tables (Session-Var-Only Policies)

| Table | Write Path | RLS Match | Status |
|---|---|---|---|
| `staff` | service-role (crud.ts) + **PostgREST DML (route handler)** | **MISMATCH** | **BUG** |
| `player_casino` | RPC (primary) + **PostgREST upsert (fallback)** | **MISMATCH** | **LATENT RISK** |
| `player_financial_transaction` | RPC only | Match | SAFE |
| `rating_slip_pause` | RPC only | Match | SAFE |
| `dealer_rotation` | No direct writes found | Match | SAFE |
| `staff_invite` | RPC only | Match | SAFE |
| `staff_pin_attempts` | RPC only (deny-all RLS) | Match | SAFE |

### Category B Tables (COALESCE Hybrid — JWT Fallback)

| Table | Write Path | RLS Match | Status |
|---|---|---|---|
| `visit` | RPC + PostgREST DML | Match | SAFE |
| `rating_slip` | RPC + PostgREST DML | Match | SAFE |
| `loyalty_ledger` | RPC only | Match | SAFE |
| `player_loyalty` | RPC only | Match | SAFE |
| `gaming_table` | PostgREST DML | Match | SAFE (fixed by PRD-030) |

### Tables with COALESCE (Not in Auth Hardening Scope)

| Table | Write Path | Status |
|---|---|---|
| `casino`, `casino_settings` | PostgREST DML | SAFE |
| `player` | RPC (create) + PostgREST DML (update) | SAFE (spec gap) |
| `reward_catalog`, `reward_price_points`, `reward_limits`, `reward_eligibility` | PostgREST DML | SAFE |
| `reward_entitlement_tier`, `loyalty_earn_config` | PostgREST DML | SAFE |
| `mtl_entry`, `mtl_audit_note` | PostgREST DML + triggers | SAFE |
| `promo_program`, `promo_coupon` | PostgREST DML / RPC | SAFE |
| `audit_log` | PostgREST DML | SAFE (relaxed insert) |
| `game_settings`, `game_settings_side_bet` | PostgREST DML | SAFE |
| `gaming_table_settings` | PostgREST DML | SAFE |
| `floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation` | PostgREST DML | SAFE |
| `table_fill`, `table_credit`, `table_drop_event` | PostgREST DML | SAFE |
| `player_identity`, `player_note`, `player_tag` | PostgREST DML | SAFE |
| `pit_cash_observation` | RPC | SAFE |
| `finance_outbox`, `loyalty_outbox` | PostgREST DML | SAFE |
| `report` | PostgREST DML | SAFE |

---

## RPC Write Path Audit

| Classification | Count | Description |
|---|---|---|
| SAFE (self-contained RPC) | 35 | Calls `set_rls_context_from_staff()` and writes in same transaction |
| SAFE (documented exception) | 2 | `rpc_bootstrap_casino`, `rpc_accept_staff_invite` — no staff binding exists yet |
| SAFE (inherited context) | 2 | Trigger functions (`fn_bridge_finance_to_telemetry`, `fn_finance_to_mtl_derivation`) |
| SAFE (Pattern C fallback) | 4+ | Direct PostgREST writes against non-critical tables with COALESCE |
| BROKEN | 0 | No broken patterns in the RPC layer itself |

### Documented Exceptions (No `set_rls_context_from_staff()`)

| Function | Justification |
|---|---|
| `rpc_bootstrap_casino` | INV-7 Exception: No staff binding exists yet. Uses `auth.uid()` directly. SECURITY DEFINER. |
| `rpc_accept_staff_invite` | INV-7 Exception: Accepting user has no staff binding yet. Uses `auth.uid()` directly. SECURITY DEFINER. |

**Required:** These are high-trust paths and MUST have dedicated abuse-case tests:
- Role misuse (caller has wrong role or no role)
- Cross-casino attempts (caller tries to act on another casino)
- Replay/idempotency (same invite accepted twice, same bootstrap re-run)

### SECURITY INVOKER RPCs (Session Vars Still Required)

| Function | Table | Safe? |
|---|---|---|
| `rpc_create_financial_txn` | `player_financial_transaction` | YES — SET LOCAL + DML in same transaction |
| `rpc_create_financial_adjustment` | `player_financial_transaction` | YES — same pattern |

---

## Historical Issues (Resolved)

### `gaming_table` INSERT/UPDATE (RESOLVED)

- **Migration**: `20260211060000_prd030_fix_gaming_table_write_policies_coalesce.sql`
- Changed from session-var-only to COALESCE Pattern C.
- Write path: `app/(onboarding)/setup/_actions.ts` lines 300-313, 363-373.
- E2E tests passing after fix.

### `setPinAction` Silent RLS Failure (RESOLVED)

- **Migration**: `20260210134652_rpc_set_staff_pin.sql`
- Previously: `withRLS` middleware set vars (Txn A), then `.from('staff').update()` (Txn B) — 0 rows affected silently.
- Fixed by creating self-contained SECURITY DEFINER RPC.
- Added INV-030-7 invariant and ESLint rule `no-direct-template2b-dml`.

---

## Priority Remediation Plan

### P0 — Fix active production bug: `staff` write path

The `POST /api/v1/casino/staff` route handler does authenticated PostgREST DML against a Category A table — guaranteed failure under transaction pooling.

**Action:** Implement `rpc_create_staff` (SECURITY DEFINER) that:
1. Validates caller role (admin) via `set_rls_context_from_staff()`
2. Derives `casino_id` from context/JWT
3. Inserts staff row in the same transaction
4. Writes `audit_log` entry
5. Returns the created row

**Owner:** Next available backend session.

### P1 — Remove/replace the `player_casino` fallback upsert

"Broken-but-rare" is still broken. It will fail under operational load in the worst scenario.

**Action:** Remove the PostgREST upsert fallback in `enrollPlayer()` (`services/casino/crud.ts:482`). Either:
- Rely solely on `rpc_create_player` for atomic enrollment, OR
- Create `rpc_enroll_player` (SECURITY DEFINER) for the re-enrollment case.

### P2 — Resolve ADR-030 "player is critical" spec gap

`player` currently works because policies were never tightened. If someone later "finishes ADR-030 D4" on `player`, this incident repeats.

**Action (choose one):**
- **(A)** Remove `player` from ADR-030 D4 critical list; standardize COALESCE/JWT fallback as the correct posture.
- **(B)** Move all `player` writes into RPC and then tighten policies.

Option A is recommended unless there is a security justification for session-var-only on `player`.

### P3 — Abuse-case tests for RPC exceptions

`rpc_bootstrap_casino` and `rpc_accept_staff_invite` are high-trust paths without `set_rls_context_from_staff()`. They need dedicated tests:
- Role misuse (wrong role, no role, deactivated staff)
- Cross-casino attempts
- Replay/idempotency (same operation re-run)

---

## Machine-Enforced Guardrails (Must-Have)

Without automated enforcement, this failure class **will recur**. Doc-only norms are insufficient.

### Existing Guards

1. **ESLint rule** `no-direct-template2b-dml` — catches direct PostgREST DML against Template 2b tables.
2. **INV-030-7** in SEC-001 — documents that Template 2b writes must use self-contained RPCs.
3. **Auth hardening migration** — categorizes tables into Cat-A (session-var-only) and Cat-B (COALESCE).

### Gaps in Existing Guards

1. The ESLint rule did not catch the `staff` route handler (`app/api/v1/casino/staff/route.ts`).
2. The `player_casino` upsert in `enrollPlayer()` was not flagged.
3. No automated CI check validates: "if a table has session-var-only policies, no production code does `.from(table).insert/update` with an authenticated client."

### Required: CI-Enforceable Category A Contract

Category A tables MUST NOT be written via authenticated PostgREST DML in production code. Category A tables MUST have RPC entrypoints for all writes. CI must fail if violations are detected.

**Implementation:**

1. **Canonical config file** — Maintain a single-source-of-truth list of Category A tables (from ADR-030 or a dedicated config):
   ```
   CATEGORY_A_TABLES = ['staff', 'player_casino', 'player_financial_transaction', 'rating_slip_pause', 'dealer_rotation', 'staff_invite', 'staff_pin_attempts']
   ```

2. **Static scan (CI step)** — Scan for patterns:
   - `supabase.from('<category_a_table>').insert|update|upsert`
   - Specifically when using the authenticated client (`mwCtx.supabase`, request-scoped supabase client, etc.)
   - Exclude: service-role client paths (annotated with eslint-disable + break-glass justification)

3. **CI failure message** — Include file, line, and remediation:
   ```
   ERROR: Category A table 'staff' written via PostgREST DML at app/api/v1/casino/staff/route.ts:147
   FIX: Category A table writes must occur inside a SECURITY DEFINER RPC (session-var-only posture per ADR-030).
   ```

4. **Migration review gate** — Any new session-var-only policy must include verification that no PostgREST DML exists for that table.

### Required: Rowcount Assertion Invariant (INV-ROWCOUNT)

All write operations MUST assert affected rowcount >= 1, unless explicitly allowed. This catches the "silent no-op" failure mode where RLS denies a write but the operation reports success.

**Enforcement:**
- Add to ESLint rules or PR review checklist.
- Every `.insert()`, `.update()`, `.upsert()` return value must check for empty `data` or 0-length arrays.

### Companion: RLS Lint Checklist (PR Template)

Add to PR review template:
- "If DML is PostgREST, policy must support JWT fallback (Pattern C)."
- "Session-var-only policies require RPC-only write paths."
- "All writes assert rowcount >= 1 unless explicitly exempted."

---

## Methodology

Four parallel investigation agents were deployed:

1. **RLS Policy Scanner** — analyzed all 83+ write policies across all migrations, categorized by pattern.
2. **PostgREST DML Finder** — identified all 40+ direct PostgREST write operations across `services/`, `app/`, and `lib/`.
3. **RPC Write Auditor** — audited all 38 RPC functions for session-var safety and transaction boundaries.
4. **ADR-030 Critical Table Investigator** — cross-referenced each critical table's policy with its actual write execution path.

All four agents independently confirmed the same findings with no contradictions.
