---
title: 'ADR-034: RLS Write-Path Compatibility & Enforcement'
doc_type: 'adr'
version: '0.1.0'
date: '2026-02-11'
timezone: 'America/Los_Angeles'
status: 'proposed'
owners:
  - 'Platform / Security'
related:
  - 'ADR-030: Session-Var-Only Write Posture for Critical Tables'
  - 'ADR-015/ADR-027: RLS context injection (set_rls_context_from_staff / SET LOCAL)'
  - 'RLS-session-var-mismatch-system-audit.md'
  - 'AUDIT-RLS-session-var-mismatch-system-audit.md'
  - 'RLS-too-restrictive-session-vars-vs-jwt-fallback.md'
tags:
  - 'rls'
  - 'supabase'
  - 'supavisor'
  - 'security'
  - 'multi-tenancy'
---

# ADR-034: RLS Write-Path Compatibility & Enforcement

## Decision

We standardize **two RLS write postures** and make the choice **enforceable** by CI:

1. **Category A (Session-var-only write posture; “ADR-030 critical”)**
   - **All writes MUST occur inside RPCs** (single-transaction).
   - **No authenticated PostgREST DML** (`insert/update/upsert/delete`) is allowed against Category A tables.
   - RLS policies may rely on `current_setting('app.*', true)` without JWT fallback.

2. **Category B (Hybrid write posture; “PostgREST-compatible”)**
   - Authenticated PostgREST DML is allowed.
   - RLS policies MUST authorize using **`COALESCE(session_var, JWT claim)`** so they function when session vars are absent.
   - Session vars remain an optimization/compatibility layer; they are **not required**.

**Enforcement**

- A CI “RLS write-path lint” MUST fail builds if authenticated PostgREST DML targets Category A tables.
- All write operations MUST assert affected rows ≥ 1 unless explicitly allowed (“no-op permitted”) to prevent silent RLS-deny failures.

## Status

Proposed. Acceptance gate: CI write-path lint (Phase 2) must be merged before enforcement is considered active.

---

## Context

PT‑2 uses Supabase with Supavisor (transaction pooling) and a request-scoped RPC (`set_rls_context_from_staff`) to set Postgres session variables (`app.casino_id`, `app.actor_id`, `app.staff_role`) via `SET LOCAL`.

A production failure class was observed:

- The app calls `set_rls_context_from_staff()` (RPC) to set `SET LOCAL` vars in **Transaction A**.
- The app then performs `supabase.from('<table>').upsert(...)` via PostgREST, which runs as **a separate HTTP request** and therefore **Transaction B**.
- `SET LOCAL` is **transaction-scoped**, so session variables do not persist into Transaction B.
- If an RLS policy requires session vars (“session-var-only writes”), PostgREST DML in Transaction B is denied.

This is not an “overly strict RLS” issue; it is an **execution-path mismatch** between RLS posture and the write mechanism.

---

## Problem Statement

We need a system-wide, non-ambiguous rule that answers:

- When may a table use “session-var-only write” policies?
- When must policies support JWT fallback?
- How do we prevent future regressions where a developer tightens a policy and silently breaks PostgREST writes?

Without standardization and enforcement, the mismatch will recur across tables and workflows, especially during onboarding/setup and operational tooling.

---

## Options Considered

### Option A — Session-var-only policies everywhere

**Rejected.**

- Incompatible with PostgREST DML unless every write is moved into an RPC.
- Forces high RPC surface area and pushes complexity into SQL/RPC.
- High risk of “works in some paths, fails in others” unless strictly enforced.

### Option B — Hybrid COALESCE policies everywhere

**Not chosen as universal.**

- Correct for most operational tables and PostgREST usage.
- But for truly critical write-path tables (ADR-030), session-var-only posture provides a tighter and more controllable boundary, and allows explicit RPC gatekeeping.

### Option C — Mixed model with explicit categories + enforcement

**Chosen.**

- Enables ADR-030’s strict posture where warranted.
- Maintains PostgREST ergonomics elsewhere.
- Prevents mismatch with a CI guardrail.

---

## Detailed Policy

### Category A: Session-var-only write posture (RPC-only writes)

**Applies to:** “critical” tables designated by ADR-030 (and any others explicitly added).

**Requirements**

- RLS write policies may require session vars:
  - `current_setting('app.casino_id', true)` etc.
- All writes MUST be executed in the same transaction that sets context:
  - either the context is set earlier in the same RPC, or the RPC is invoked after middleware has established context for that transaction.
- App code MUST NOT call authenticated PostgREST DML on Category A tables.

**Typical access shape**

- `USING` and `WITH CHECK` clauses reference `current_setting('app.*')` only (no JWT fallback).

### Category B: Hybrid COALESCE (PostgREST-compatible)

**Applies to:** non-critical operational tables written through PostgREST and/or server actions using the authenticated Supabase client.

**Requirements**

- RLS write policies MUST use COALESCE fallback:
  - `COALESCE(current_setting('app.casino_id', true), auth.jwt()->'app_metadata'->>'casino_id')`
  - `COALESCE(current_setting('app.staff_role', true), auth.jwt()->'app_metadata'->>'staff_role')`
- Session vars are optional; JWT claims must be sufficient.
- **Actor identity**: derives from JWT `sub` (`auth.uid()`). The session variable `app.actor_id` is optional telemetry/audit context and MUST NOT be required for Category B authorization decisions.

---

## Write-Path Compatibility Matrix

| Write Mechanism                                                      | Transaction Boundary       |  Category A Allowed? |  Category B Allowed? |
| -------------------------------------------------------------------- | -------------------------- | -------------------: | -------------------: |
| Authenticated PostgREST DML (`supabase.from().insert/update/upsert`) | New HTTP request ⇒ new txn |               **NO** |              **YES** |
| RPC performs DML (single RPC call)                                   | Single txn                 |              **YES** |              **YES** |
| Service role (bypass RLS)                                            | N/A (bypasses)             | **Break-glass only** | **Break-glass only** |

**Rule of thumb**

- If the code path uses PostgREST DML: the target table must be Category B (or the write must be refactored into RPC).

---

## Enforcement & Guardrails (Must-Haves)

### 1) CI: RLS Write-Path Lint (Required)

- Maintain a canonical list of Category A tables (see “Canonical Sources” below).
- Fail CI if authenticated PostgREST DML targets Category A tables.
- The lint should emit actionable output:
  - file path + line number
  - table name
  - remediation: “Use RPC for Category A writes”

**Detection (minimum viable)**

- Static scan for `from('<table>')` + `.insert|.update|.upsert|.delete` on authenticated clients (`mwCtx.supabase`, request-scoped supabase client, etc.).
- Prefer AST-based scanning to reduce false positives.

**Lint Contract**

- **Targets**: request-scoped authenticated clients (`ctx.supabase`, `mwCtx.supabase`, and any client created from the user's JWT session).
- **Excludes**: service-role / admin clients (`supabaseAdmin`, `createServiceClient()`, or any client explicitly constructed with the `service_role` key).
- **Exemptions**: a structured `// rls-break-glass: <ticket> expires:<YYYY-MM-DD>` comment on the preceding line suppresses the lint for that call. Expired exemptions fail CI.
- Detailed implementation (file globs, AST visitor config) lives in the PRD / implementation doc; this ADR defines the contract only.

### 2) Rowcount Invariant (Required)

- All write operations must assert affected rows ≥ 1 unless explicitly allowed.
- Treat 0 rows affected as an error, to prevent silent RLS-deny/no-op failures.
- For PostgREST writes, the call must request returning data (e.g., `.select('id')`) or `count: 'exact'` so the rowcount check is reliable.

### 3) Exception Policy (Required)

- **Service role** is break-glass only.
  - Must include explicit `casino_id` assertions in code
  - Must write `audit_log`
  - Must include abuse-case tests
- Privileged RPC exceptions (bootstrap, invite acceptance) must have dedicated abuse-case tests:
  - cross-casino attempts
  - role misuse
  - replay/idempotency where applicable

---

## Canonical Sources of Truth

- Category A table list is owned by **ADR-030** (critical tables).
- Any addition/removal MUST:
  1. update ADR-030 list,
  2. update CI lint config,
  3. update or add RPC entrypoints if moving into Category A.

---

## Consequences

### Positive

- Eliminates a recurring production failure class (session-var mismatch).
- Preserves strict boundaries for critical tables (ADR-030) without harming developer velocity elsewhere.
- Makes security posture reviewable and enforceable (CI gate, not tribal knowledge).

### Negative / Trade-offs

- Requires maintaining a Category A table list and a lint configuration.
- Category A expands the SQL/RPC surface area (by design).
- Some refactors will be needed when a table migrates from B → A (write path must move into RPC).

---

## Implementation Plan (Phased)

### Phase 1 — Standardize

- Ratify this ADR.
- Publish Category A table list reference (ADR-030) and create lint config file.

### Phase 2 — Enforce

- Implement CI “RLS write-path lint” and add to pipeline gates.
- Add “rowcount invariant” helper and apply to services/actions.

### Phase 3 — Harden

- Add abuse-case tests for privileged RPC exceptions.
- Audit tables for posture mismatch and remediate.

---

## Appendix: Example Patterns (Illustrative)

### Category B policy snippet (illustrative)

- Casino scope:
  - `casino_id = COALESCE(current_setting('app.casino_id', true)::uuid, (auth.jwt()->'app_metadata'->>'casino_id')::uuid)`

### Category A policy snippet (illustrative)

- Casino scope:
  - `casino_id = current_setting('app.casino_id', true)::uuid`

> Note: examples are illustrative; exact policy templates remain owned by SRM/SLAD policy docs.
