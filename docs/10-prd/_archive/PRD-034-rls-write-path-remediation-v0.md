---
id: PRD-034
title: "RLS Write-Path Remediation & Enforcement"
owner: Platform / Security
status: Draft
affects: [ADR-034, ADR-030, SEC-001, ARCH-SRM]
created: 2026-02-11
last_review: 2026-02-11
phase: "Phase 0 (Security Remediation)"
pattern: B
http_boundary: false
---

# PRD-034 — RLS Write-Path Remediation & Enforcement

## 1. Overview

- **Owner:** Platform / Security
- **Status:** Draft
- **Summary:** A system-wide audit (RLS-session-var-mismatch-system-audit v1.1.0) identified a recurring production failure class: RLS policies that require Postgres session variables (`SET LOCAL`) are incompatible with PostgREST DML because each PostgREST request runs in a separate transaction where session variables have evaporated. This PRD remediates 3 confirmed findings (1 active bug, 1 latent risk, 1 spec gap), introduces machine-enforced CI guardrails to prevent recurrence, and gates on ratification of ADR-034 as the canonical decision for RLS write-path compatibility.

---

## 2. Problem & Goals

### 2.1 Problem

PT-2 uses two write mechanisms against Supabase: **PostgREST DML** (via `supabase.from(table).insert/update/upsert`) and **self-contained SECURITY DEFINER RPCs**. The middleware pipeline calls `set_rls_context_from_staff()` to set Postgres session variables (`app.casino_id`, `app.actor_id`, `app.staff_role`) via `SET LOCAL` — but `SET LOCAL` is **transaction-scoped**. When the RPC transaction commits and the app subsequently performs PostgREST DML (new HTTP request = new transaction), the session variables are gone.

Tables with "session-var-only" RLS write policies (Category A per ADR-030) silently deny or reject these writes. The audit found:

- **1 active production bug** (`staff` table: `POST /api/v1/casino/staff` route handler does authenticated PostgREST DML against a session-var-only policy).
- **1 latent risk** (`player_casino` table: `enrollPlayer()` fallback upsert via PostgREST against a session-var-only policy).
- **1 spec gap** (`player` table: ADR-030 D4 lists it as critical but policies were never tightened — a future tightening would break existing PostgREST writes).

The root cause has manifested **four times** (gaming_table, setPinAction, staff, player_casino). Without machine-enforced guardrails, it will recur with every new table or policy change.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Eliminate active `staff` write-path bug | `POST /api/v1/casino/staff` succeeds under transaction pooling; integration test passes |
| **G2**: Remove broken `player_casino` fallback path | `enrollPlayer()` PostgREST upsert code path deleted or replaced with RPC; no PostgREST DML against `player_casino` in codebase |
| **G3**: Resolve `player` spec gap | ADR-030 D4 updated to remove `player` from critical list OR `updatePlayer()` migrated to RPC with policy tightened |
| **G4**: CI prevents future regressions | CI lint fails if authenticated PostgREST DML targets any Category A table; green CI requires zero violations |
| **G5**: Silent no-op writes are detectable | Rowcount assertion helper exists and is applied to all write paths in affected services |
| **G6**: Privileged RPC exceptions have abuse-case coverage | `rpc_bootstrap_casino` and `rpc_accept_staff_invite` have tests for cross-casino, role-misuse, and replay scenarios |

### 2.3 Non-Goals

- Migrating all PostgREST DML to RPCs system-wide (Category B tables remain PostgREST-compatible by design)
- Rewriting the `withServerAction` middleware pipeline (the pipeline is correct; the mismatch is in policy/write-path pairing)
- Implementing Track B (JWT-only) migration per ADR-020 (deferred per existing decision)
- Adding new tables or schema changes beyond what is needed for `rpc_create_staff`
- Full ESLint AST-based rule — minimum viable CI lint (grep/regex) is sufficient for this PRD

### 2.4 ADR Standard Conformance (ADR-034)

- **Write posture taxonomy:** Category A tables are **RPC-only** for authenticated writes. Category B tables must be **PostgREST-compatible**.
- **Category A registry (canonical):** Category A membership is governed by **ADR-030**. Any configuration artifacts (e.g., `categoryA.tables.json`) are derived from ADR-030 and must not become a competing authority. PRD-034 may cite examples, but must not maintain a competing authoritative list.
- **Category B RLS requirement:** Category B RLS policies must scope tenancy via **COALESCE(session vars, JWT claims)** (PostgREST-safe).
- **Enforcement:** CI must prevent authenticated PostgREST DML to Category A tables, with tightly defined exemptions and a reliable rowcount invariant.

---

## 3. Users & Use Cases

- **Primary users:** Platform engineers, backend developers writing server actions / route handlers

**Top Jobs:**

- As a **backend developer**, I need CI to tell me if I accidentally write PostgREST DML against a Category A table so that I don't ship a broken write path.
- As a **pit boss (admin)**, I need staff creation via the admin dashboard to work reliably so that I can onboard new employees.
- As a **platform engineer**, I need a canonical Category A table list and rowcount assertion pattern so that I can prevent silent RLS-deny failures across all services.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Write-Path Bug Fixes (P0/P1):**
- Create `rpc_create_staff` (SECURITY DEFINER) and update `POST /api/v1/casino/staff` route handler
- Remove or replace `enrollPlayer()` PostgREST upsert fallback in `services/casino/crud.ts`

**Spec Gap Resolution (P2):**
- Update ADR-030 D4 to remove `player` from critical table list (recommended) OR migrate `updatePlayer()` to RPC

**CI Enforcement (P0):**
- Canonical Category A table config file (derived from ADR-030; `categoryA.tables.json` is generated, manual edits are prohibited)
- CI lint script that fails builds on authenticated PostgREST DML against Category A tables
- Update existing ESLint rule `no-direct-template2b-dml` to cover `staff` and `player_casino`
- **Category B policy-lint (automated):** CI check scanning RLS policy SQL for Category B tables — **FAIL** if policy references `current_setting('app.casino_id')` (or `app.*`) without a JWT fallback; **PASS** only when the COALESCE fallback pattern is present.
  **Mechanism:** CI step runs `scripts/lint-rls-category-b-policies.sh` which:
  1. Starts Supabase local (`supabase start` or reuses existing instance) and applies all migrations — policies being linted are exactly what the repo defines
  2. Queries `SELECT polname, polqual::text, polwithcheck::text FROM pg_policy WHERE polrelid = '<category_b_table>'::regclass` for each Category B table
  3. Normalizes the policy expression text (collapse whitespace, lowercase) then checks for `current_setting('app.` not enclosed in a `coalesce(` wrapper (case-insensitive grep via `grep -iP`)
  4. Exits non-zero on any match, with table name + policy name in the error output

**Rowcount Invariant (P1):**
- `assertRowsAffected()` helper utility
- Apply to write paths in affected services (casino, player)

**Abuse-Case Tests (P2):**
- Integration tests for `rpc_bootstrap_casino`: cross-casino, role-misuse, replay
- Integration tests for `rpc_accept_staff_invite`: cross-casino, role-misuse, replay

**Category B RLS Template Conformance (P1):**
- Inventory Category B tables in-scope (reference ADR-030)
- Verify all Category B policies use **COALESCE(session_var, JWT claim)** for tenant scoping
- CI policy-lint or migration gate to prevent regression (see Enforcement below)

**Category A Write Callsites Inventory (one-time, P1):**
- Enumerate all Category A PostgREST write callsites (files + functions)
- Resolution for each: refactor to RPC or annotate with structured break-glass exemption (with expiry)

**ADR Ratification (gate):**
- ADR-034 ratification is a **prerequisite gate** for this PRD. WS5 must confirm ADR-034 status is "Accepted" in the repo before CI lint config is considered canonical. No implementation work in WS1–WS4 is blocked, but the CI gate (WS3) must not merge until ADR-034 is accepted.

### 4.2 Out of Scope

- Migrating Category B tables to RPC-only writes
- AST-based ESLint rule rewrite (regex/grep CI lint is the MVP)
- Service-role client removal or refactoring beyond documented break-glass paths
- UI changes (no frontend work in this PRD)
- New dashboard features or workflows

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1**: `rpc_create_staff` MUST call `set_rls_context_from_staff()`, validate caller role (admin), derive `casino_id` from context, insert staff row, write `audit_log`, and return the created row — all in a single transaction.
- **FR-2**: `POST /api/v1/casino/staff` route handler MUST call `rpc_create_staff` instead of direct PostgREST DML.
- **FR-3**: The `enrollPlayer()` function in `services/casino/crud.ts` MUST NOT perform PostgREST DML against `player_casino`. Either delete the fallback path or replace with `rpc_enroll_player`.
- **FR-4**: A canonical config file MUST list all Category A tables. The CI lint MUST read from this file.
- **FR-5**: The CI lint MUST fail the build if it detects `supabase.from('<category_a_table>').insert|update|upsert|delete` using an authenticated client in production code.
  - **Targeted client identifiers** (positive match): `ctx.supabase`, `mwCtx.supabase`, `createBrowserClient`, `createServerClient`, any variable annotated `AUTHENTICATED_SUPABASE_CLIENT`
  - **Excluded client identifiers** (negative match / skip): `serviceSupabase`, `adminClient`, `supabaseAdmin`, any variable annotated `SERVICE_ROLE_CLIENT`
  - **Scanned directories**: `app/`, `services/`, `lib/`
  - **Excluded paths**: `__tests__/`, `*.test.ts`, `*.spec.ts`, `e2e/`, `*.int.test.ts`
  - **Exemption**: Lines with a complete structured `// rls-break-glass` block (all 5 fields required; see WS3)
- **FR-6**: The `assertRowsAffected()` helper MUST throw a typed error when affected rows = 0 on write operations.
- **FR-7**: ADR-030 D4 MUST be updated to either remove `player` from the critical list or document the RPC migration path.

### 5.2 Non-Functional Requirements

- **NFR-1**: `rpc_create_staff` must complete within the existing RPC performance budget (< 200ms p95).
- **NFR-2**: CI lint must complete in < 10 seconds for the full codebase scan.
- **NFR-3**: CI lint false positives must be resolvable via the structured exemption block (`// rls-break-glass`). Any false positive that cannot be resolved by exemption is a lint bug to be fixed. Exemptions are tracked, reviewed, and time-bounded (see WS3 exemption format).

> Architecture details: See ADR-034, ADR-030, SEC-001, SLAD §308-348

---

## 6. UX / Flow Overview

**Flow 1: Staff Creation (After Fix)**
1. Admin submits "Create Staff" form in dashboard
2. Route handler `POST /api/v1/casino/staff` validates input via Zod
3. Route handler calls `supabase.rpc('rpc_create_staff', { ... })`
4. RPC validates caller role, derives casino_id, inserts row, writes audit_log
5. Route handler returns created staff DTO

**Flow 2: CI Lint (New)**
1. Developer pushes code that includes `.from('staff').insert(...)` using authenticated client
2. CI pipeline runs `scripts/lint-rls-write-path.sh` (or equivalent)
3. Lint detects Category A table DML violation
4. CI fails with actionable message: file, line, table, remediation instruction
5. Developer refactors to use RPC; CI passes

**Flow 3: Rowcount Assertion (New)**
1. Service performs `.from(table).update(...).select('id')` via PostgREST (mandatory `.select('id')` for reliable rowcount)
2. `assertRowsAffected(result)` checks `data` array length (reliable because returning is enabled)
3. If 0 rows affected → throws `RlsDenyError` (or similar typed error)
4. Caller handles error explicitly rather than silently succeeding

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **ADR-034 ratification (gate)** — Must be accepted before WS3 CI lint merges; WS1/WS2/WS4 may proceed in parallel
- **ADR-030 D4 update** — Must land before or alongside P2 (player spec gap)
- **Existing ESLint rule `no-direct-template2b-dml`** — Must be audited for coverage gaps as part of WS3

### 7.2 Risks & Open Questions

- **Risk: `enrollPlayer()` fallback removal may affect edge cases** — Mitigated by audit showing `rpc_create_player` already handles the primary path atomically. The fallback is broken anyway.
- **Risk: CI lint false positives on test files or service-role paths** — Mitigated by excluding `__tests__/`, `*.test.ts`, `*.spec.ts`, and annotated service-role paths.
- **Open: Player spec gap resolution direction** — Recommend Option A (remove from critical list). If stakeholders prefer Option B (RPC migration), scope increases and this becomes a separate workstream.
- **Resolved: ADR number assignment** — ADR-034 is assigned. Ratification is a gate (see WS5).

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `POST /api/v1/casino/staff` creates staff via `rpc_create_staff` under transaction pooling
- [ ] `enrollPlayer()` no longer performs PostgREST DML against `player_casino`
- [ ] ADR-030 D4 updated to resolve `player` table posture

**Data & Integrity**
- [ ] `rpc_create_staff` writes `audit_log` entry on every staff creation
- [ ] No orphaned staff records from partial creation failures (RPC is atomic)
- [ ] `assertRowsAffected()` catches 0-row writes in all modified services

**Security & Access**
- [ ] `rpc_create_staff` enforces admin role via `set_rls_context_from_staff()`
- [ ] No authenticated PostgREST DML against Category A tables in production code
- [ ] Service-role paths annotated with break-glass justification and compensating controls documented

**Testing**
- [ ] Integration test: `rpc_create_staff` succeeds with valid admin caller
- [ ] Integration test: `rpc_create_staff` rejects non-admin caller
- [ ] Integration test: `rpc_create_staff` rejects cross-casino attempt
- [ ] Abuse-case tests for `rpc_bootstrap_casino` (cross-casino, role-misuse, replay)
- [ ] Abuse-case tests for `rpc_accept_staff_invite` (cross-casino, role-misuse, replay)
- [ ] CI lint passes on clean codebase (zero Category A violations)
- [ ] CI lint correctly fails on synthetic violation (regression test)

**Operational Readiness**
- [ ] CI pipeline includes RLS write-path lint as a required gate
- [ ] `assertRowsAffected()` logs structured error with table name and operation for debugging
- [ ] Rollback: RPC can be dropped and route handler reverted if needed (migration is additive)

**ADR-034 Conformance**
- [ ] Category A membership is referenced from ADR-030 only (no duplicate authoritative lists in PRD)
- [ ] CI prevents authenticated PostgREST DML to Category A tables; exemptions are structured and expirable
- [ ] Category B RLS policies touched by this effort conform to COALESCE fallback (PostgREST-safe), enforced by CI policy-lint or a migration gate
- [ ] Rowcount invariant is reliable via mandatory `.select('id')` (or exact count) on PostgREST writes
- [ ] One-time inventory of Category A PostgREST write callsites is completed; all are removed or explicitly exempted
- [ ] No write-path uses rowcount assertions unless returning/count is enabled per the chosen pattern

**Documentation**
- [ ] ADR-034 ratified (status: Accepted)
- [ ] SEC-001 updated with Category A/B posture references
- [ ] Category A table config file documented in repo (location, format, update procedure)

---

## 9. Related Documents

- **Root Cause Analysis**: `docs/issues/remediation/RLS-too-restrictive-session-vars-vs-jwt-fallback.md`
- **System Audit**: `docs/issues/remediation/RLS-session-var-mismatch-system-audit.md` (v1.1.0)
- **Audit Corrections**: `docs/issues/remediation/AUDIT-RLS-session-var-mismatch-system-audit.md`
- **Original Issue**: `docs/issues/ISSUE-GAMING-TABLE-RLS-WRITE-POLICY-SESSION-VAR-ONLY.md`
- **ADR (ratified)**: `docs/80-adrs/ADR-034-RLS-write-path-compatibility-and-enforcement.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.12.0)
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Auth Hardening**: `docs/80-adrs/ADR-030-auth-system-hardening.md`
- **Schema / Types**: `types/database.types.ts`

---

## Appendix A: Workstream Plan

### WS1: `rpc_create_staff` + Route Handler Fix (P0)

**Bounded context:** CasinoService
**Type:** database + rls + api
**Dependencies:** None

- [ ] Create migration `YYYYMMDDHHMMSS_rpc_create_staff.sql`
  - SECURITY DEFINER RPC
  - Calls `set_rls_context_from_staff()` internally
  - Validates caller role = admin
  - Derives `casino_id` from `app.casino_id` session var
  - Inserts into `staff` table
  - Inserts into `audit_log`
  - Returns created staff row
- [ ] Update `app/api/v1/casino/staff/route.ts` POST handler to call `rpc_create_staff` instead of direct `.from('staff').insert()`
- [ ] Run `npm run db:types` to regenerate types
- [ ] Integration test: valid admin creates staff
- [ ] Integration test: non-admin rejected
- [ ] Integration test: cross-casino rejected

### WS2: `player_casino` Fallback Removal (P1)

**Bounded context:** CasinoService
**Type:** service-layer
**Dependencies:** None (parallel with WS1)

- [ ] Remove or replace `enrollPlayer()` PostgREST upsert fallback at `services/casino/crud.ts:482`
- [ ] If re-enrollment is needed: create `rpc_enroll_player` (SECURITY DEFINER) OR confirm `rpc_create_player` handles all cases
- [ ] Update `app/api/v1/players/[playerId]/enroll/route.ts` if caller changes
- [ ] Integration test: enrollment via RPC path only

### WS3: CI Write-Path Lint (P0)

**Bounded context:** Platform / DevOps
**Type:** ci-tooling
**Dependencies:** None (parallel with WS1/WS2)

- [ ] Create canonical Category A table config: `config/rls-category-a-tables.json`
  - `categoryA.tables.json` is **generated** from ADR-030 (or SRM table ownership registry) via `scripts/generate-category-a-config.ts`; **manual edits are prohibited** and CI must reject hand-edited changes (checksum or generator-header validation)
  - Generator reads the ADR-030 Category A registry and emits the JSON artifact
  - Illustrative output shape (do **not** copy this into the repo — use the generator):
  ```json
  {
    "// GENERATED — do not edit. Run: npm run generate:category-a": "",
    "categoryA": ["<populated by generator from ADR-030>"]
  }
  ```
- [ ] Create CI lint script: `scripts/lint-rls-write-path.sh`
  - Reads Category A table list
  - Scans `app/`, `services/`, `lib/` for `.from('<table>').insert|update|upsert|delete`
  - **"Authenticated client" definition:** Any supabase client instance created from:
    - Request context (`ctx.supabase`, `mwCtx.supabase`, etc.), or
    - User session (`createBrowserClient`, `createServerClient`), or
    - Any wrapper clearly marked `AUTHENTICATED_SUPABASE_CLIENT`
  - **Excluded clients:** Service-role/admin clients (explicitly identified; e.g., `serviceSupabase`, `adminClient`)
  - Excludes `__tests__/`, `*.test.ts`, `*.spec.ts`, `e2e/`
  - **Structured exemption format** (all fields required, CI fails if missing):
    ```
    // rls-break-glass
    // table: <table_name>
    // reason: <why Category A write via PostgREST is unavoidable>
    // compensating_controls: <what prevents tenant bleed / ensures correctness>
    // expires: <date or ticket>
    ```
  - Exemptions are reviewed and time-bounded
  - Outputs file:line + table + remediation on violation
  - Exits non-zero on any violation
- [ ] Add lint script to CI pipeline (GitHub Actions or equivalent)
- [ ] Update ESLint rule `no-direct-template2b-dml` to cover `staff` and `player_casino`
- [ ] Regression test: synthetic violation file triggers CI failure

### WS4: Rowcount Assertion Helper (P1)

**Bounded context:** Platform / lib
**Type:** utility
**Dependencies:** None (parallel)

- [ ] Create `lib/supabase/assert-rows-affected.ts`
  - `assertRowsAffected(result, options?)` — throws if `data` is null/empty
  - Typed error: `RlsWriteDeniedError` or similar
  - Structured logging: table name, operation, caller context
  - **Rowcount invariant:** All PostgREST writes in this PRD must use `.select('id')` (or equivalent minimal returning) so rowcount checks are reliable. No write-path uses rowcount assertions unless returning is enabled per this pattern.
- [ ] Apply to write paths in `services/casino/crud.ts` (staff, player_casino paths)
- [ ] Apply to write paths in `services/player/crud.ts` (updatePlayer)
- [ ] Verify all write callsites use `.select('id')` to ensure `data.length` is reliable
- [ ] Unit test: helper throws on empty result
- [ ] Unit test: helper passes on non-empty result

### WS5: ADR-030 D4 Spec Gap + ADR-034 Ratification (P2)

**Bounded context:** Architecture / Governance
**Type:** documentation
**Dependencies:** WS1, WS3 (ADR-034 ratification after CI lint is in place)

- [ ] Update ADR-030 D4: remove `player` from critical table list (Option A recommended)
- [ ] Confirm ADR-034 status is "Accepted" in `docs/80-adrs/ADR-034-RLS-write-path-compatibility-and-enforcement.md`; if still "Proposed," update to "Accepted" (this is a **gate** — WS3 CI lint must not merge until this is done)
- [ ] Update SEC-001 with Category A/B posture cross-reference
- [ ] Update SRM if bounded context ownership annotations change

### WS6: Abuse-Case Tests for Privileged RPCs (P2)

**Bounded context:** CasinoService
**Type:** testing
**Dependencies:** None (parallel with WS5)

- [ ] `rpc_bootstrap_casino` abuse-case tests:
  - [ ] Cross-casino: caller tries to bootstrap a casino they don't own
  - [ ] Role misuse: non-admin caller
  - [ ] Replay: bootstrap called twice for same casino
- [ ] `rpc_accept_staff_invite` abuse-case tests:
  - [ ] Cross-casino: caller accepts invite for wrong casino
  - [ ] Role misuse: already-staff user re-accepts
  - [ ] Replay: same invite token accepted twice

---

## Appendix B: Category A/B Reference (Non-Authoritative)

> **Canonical ownership:** Category A membership is governed by **ADR-030** (canonical). This appendix is intentionally non-authoritative and provided for convenience only. See ADR-030: Category A table registry for the source of truth.

### Category A — Findings From This Audit Only

> These are the tables with confirmed findings in this PRD. This is **not** the full Category A list. Do not extend this table here — Category A membership is governed by ADR-030.

| Table | Finding | Resolution |
|---|---|---|
| `staff` | **BUG** — PostgREST DML in route handler | Fix in WS1 (`rpc_create_staff`) |
| `player_casino` | **LATENT** — PostgREST fallback upsert | Fix in WS2 (remove fallback) |

### Category B — No Findings (Reference Only)

> Category B tables were verified PostgREST-safe during the audit. See ADR-030 for the full Category B registry.

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-02-11 | Lead Architect | Initial draft from system audit findings |
| 0.2.0 | 2026-02-11 | Lead Architect | Applied ADR-034 conformance delta patch (6 patches): canonical Category A ownership via ADR-030, Category B COALESCE enforcement, CI lint spec tightening, rowcount invariant `.select('id')`, callsite inventory, ADR-034 numbering hygiene |
| 0.3.0 | 2026-02-11 | Lead Architect | Review fixups: (1) replaced hardcoded JSON with generator-only contract, (2) resolved ratified-now/later contradiction — ADR-034 acceptance is a gate, (3) Category B policy-lint concrete mechanism via `pg_policy` query, (4) FR-5 bound to explicit client identifiers and scan/exclude paths, (5) NFR-3 replaced "zero false positives" with exemption-resolvable contract |
| 0.3.1 | 2026-02-11 | Lead Architect | Nit fixups: Appendix B scoped to audit findings only (full Category A list removed), Category B policy-lint hardened (case-insensitive grep, whitespace normalization, post-migration DB as lint target) |
