---
id: PRD-057
title: Session Close Lifecycle Hardening
owner: Engineering
status: Draft
affects: [PRD-038A, ADR-028, ARCH-SRM, SEC-001]
created: 2026-03-25
last_review: 2026-03-25
phase: Phase 3 (Table Lifecycle)
pattern: A
http_boundary: true
---

# PRD-057 — Session Close Lifecycle Hardening

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Session closure is a terminal state change with no downstream side-effects. The `has_unresolved_items` guardrail — designed to block standard close when rating slips remain open — is never populated and always defaults to `false`. Additionally, two seating RPCs (`rpc_start_rating_slip`, `rpc_check_table_seat_availability`) check only `gaming_table.status` and have zero `table_session` awareness, allowing players to be seated at tables with no active session. This PRD hardens the close lifecycle by wiring the `has_unresolved_items` flag to live state and enforcing the seating invariant: no player can be seated without an active session.

---

## 2. Problem & Goals

### 2.1 Problem

PRD-038A introduced the `has_unresolved_items` column on `table_session` as a forward-compatible placeholder for Finance/MTL integration. The read path is fully wired — the RPC guardrail (`P0005 unresolved_liabilities`), service error mapping, DTO, and UI consumption all exist. But no code path ever sets the flag to `true`. The guardrail can never fire.

Separately, closing a session does not affect player seating. After close, `gaming_table.status` remains `'active'`, and both `rpc_start_rating_slip` and `rpc_check_table_seat_availability` only check that field. A pit boss can close a session and a player can immediately be seated at the same table — creating a rating slip with no session context.

These are not edge cases. They are violated invariants in the core table lifecycle.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: `has_unresolved_items` reflects live state at close time | Flag is `true` when open/paused rating slips exist at the table; `P0005` blocks standard close |
| **G2**: Players cannot be seated at a table without an active session | `rpc_start_rating_slip` raises `NO_ACTIVE_SESSION`; `rpc_check_table_seat_availability` returns `{available: false, reason: 'no_active_session'}` |
| **G3**: Force-close audit trail enumerates orphaned artifacts | `audit_log.details` includes `orphaned_rating_slips` array with slip IDs, visit IDs, statuses |

### 2.3 Non-Goals

- Auto-closing orphaned rating slips on session close (bounded context violation — RatingSlipService owns `rating_slip`)
- Auto-ending orphaned visits on session close (bounded context violation — VisitService owns `visit`)
- Building a reconciliation workflow for `requires_reconciliation` sessions
- Populating `has_unresolved_items` from Finance/MTL fills/credits (not yet implemented)
- Adding `table_session` realtime subscription to dashboard (Issue 6, separate scope)
- Activating the dormant `OPEN → ACTIVE` session gate
- Gaming day auto-rollover automation

---

## 3. Users & Use Cases

- **Primary users:** Pit bosses, floor supervisors

**Top Jobs:**

- As a **pit boss**, I need session close to be blocked when rating slips are still open so that I don't accidentally orphan active play data.
- As a **pit boss**, I need the system to prevent seating a player at a table with no active session so that every rating slip has session context.
- As a **floor supervisor**, I need force-close audit entries to enumerate which slips were orphaned so that shift reconciliation has a concrete checklist.

---

## 4. Scope & Feature List

### 4.1 In Scope

**Close-Time Flag Computation (Issue 5b):**
- Compute `has_unresolved_items` from live `rating_slip` state inside `rpc_close_table_session`
- Compute the same flag inside `rpc_force_close_table_session` (record truth, do not block)
- Remove redundant `hasOpenSlipsForTable` pre-check from service layer (now atomic inside RPC)

**Session-Gated Seating (Issue 5c):**
- Add `table_session` existence check to `rpc_start_rating_slip` — reject with `NO_ACTIVE_SESSION` when no session in `('OPEN', 'ACTIVE', 'RUNDOWN')`
- Add `table_session` existence check to `rpc_check_table_seat_availability` — return `{available: false, reason: 'no_active_session'}`
- Add `NO_ACTIVE_SESSION` error mapping to service layer and UI error messages

**Force-Close Audit Enrichment:**
- Enumerate orphaned slips (slip_id, visit_id, status, seat_number) in `rpc_force_close_table_session` audit log payload
- Include `orphaned_slip_count` in audit details

**Client Cache Invalidation:**
- Add `rating-slip` and `visit` query key invalidation to `useCloseTableSession` `onSuccess`

### 4.2 Out of Scope

- Reconciliation workflow UI consuming `requires_reconciliation` + `has_unresolved_items`
- Cross-context domain event infrastructure (pub/sub, triggers)
- Finance/MTL fill/credit status workflows
- Dashboard realtime subscription for `table_session`

---

## 5. Requirements

### 5.1 Functional Requirements

- `rpc_close_table_session` MUST compute `has_unresolved_items` from `rating_slip` state before the existing `P0005` check
- `rpc_close_table_session` MUST persist the computed flag on the `table_session` row
- `rpc_force_close_table_session` MUST compute and persist `has_unresolved_items` (does not block close)
- `rpc_force_close_table_session` MUST include enumerated orphaned slips in `audit_log.details`
- `rpc_start_rating_slip` MUST reject with `NO_ACTIVE_SESSION` when no `table_session` exists with `status IN ('OPEN', 'ACTIVE', 'RUNDOWN')` for the given table
- `rpc_check_table_seat_availability` MUST return `{available: false, reason: 'no_active_session'}` when no active session exists
- `useCloseTableSession` hook MUST invalidate `rating-slip` and `visit` query caches on success
- Close dialog error messages MUST handle `UNRESOLVED_LIABILITIES` and `NO_ACTIVE_SESSION` codes

### 5.2 Non-Functional Requirements

- Flag computation query MUST use existing index on `rating_slip(table_id, casino_id, status)` — target < 5ms
- Force-close orphan enumeration MUST handle 0–50 slips without measurable latency impact
- All RPC amendments MUST be delivered in a single migration file
- Cross-context reads MUST be read-only (no bounded context writes another context's tables)

> Architecture details: See `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (SRM v4.20.0), `docs/80-adrs/ADR-028-table-status-standardization.md`

---

## 6. UX / Flow Overview

**Flow 1: Standard Close with Open Slips (Now Blocked)**
1. Pit boss opens Close Session dialog
2. Selects close reason, attaches artifact
3. Clicks "Close Session"
4. RPC computes `has_unresolved_items = true` (open slips detected)
5. RPC raises `P0005 unresolved_liabilities`
6. Toast: "Session has unresolved items that must be reconciled before closing."
7. Pit boss must close rating slips first, then retry

**Flow 2: Seating Rejected Without Active Session**
1. Pit boss navigates to table with no active session
2. Attempts to start a rating slip (seat a player)
3. RPC raises `NO_ACTIVE_SESSION`
4. Toast: "Table has no active session. Open a session before seating players."
5. Pit boss opens a session, then seats the player

**Flow 3: Force-Close with Orphaned Slips (Backend — No UI Button)**
1. API call to `POST /api/v1/table-sessions/{id}/force-close`
2. RPC computes `has_unresolved_items = true`, persists on row
3. RPC enumerates orphaned slips into `audit_log.details.orphaned_rating_slips`
4. Session closes with `requires_reconciliation = true`
5. Audit log provides reconciliation checklist

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-038A** — Schema additions (`has_unresolved_items` column, close guardrail RPCs) already landed
- **ADR-028** — Table status standardization (D1 availability/lifecycle decoupling)
- **ADR-024** — Authoritative context derivation (`set_rls_context_from_staff()`)
- **Existing index** — `rating_slip(table_id, casino_id, status)` must exist for performant queries

### 7.2 Risks & Open Questions

- **Session gate blocks existing workflows** — E2E paths that seat players without opening a session will break. Mitigation: verify all test fixtures and seed data open sessions before seating. Add clear error message.
- **`hasOpenSlipsForTable` removal from service layer** — All close paths go through the RPC; service pre-check is defense-in-depth now redundant. Risk is minimal since RPC is the authoritative gate.
- **Cross-context read expansion** — `rpc_start_rating_slip` and `rpc_check_table_seat_availability` will now read `table_session`. These are read-only queries consistent with the existing `hasOpenSlipsForTable` pattern (SRM allowlisted).

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `has_unresolved_items` is computed from live `rating_slip` state at close time in both close RPCs
- [ ] Standard close is blocked when open/paused rating slips exist (`P0005` fires)
- [ ] Force-close records `has_unresolved_items = true` when open slips exist (does not block)
- [ ] Force-close audit log includes `orphaned_rating_slips` array (slip_id, visit_id, status, seat_number)
- [ ] `rpc_start_rating_slip` rejects with `NO_ACTIVE_SESSION` when no active session
- [ ] `rpc_check_table_seat_availability` returns `{available: false, reason: 'no_active_session'}` when no active session
- [ ] `useCloseTableSession` invalidates rating-slip and visit query caches on success

**Data & Integrity**
- [ ] No orphaned rating slips can be created at tables without active sessions
- [ ] `has_unresolved_items` flag reflects truth — never stale `false` when slips are open

**Security & Access**
- [ ] All RPC amendments use `set_rls_context_from_staff()` (ADR-024)
- [ ] Cross-context reads are read-only — no bounded context writes another's tables

**Testing**
- [ ] Integration test: close blocked when open slips exist (flag = true, P0005)
- [ ] Integration test: force-close records flag + audit payload with orphaned slips
- [ ] Integration test: `rpc_start_rating_slip` rejects without active session
- [ ] Integration test: `rpc_check_table_seat_availability` returns `no_active_session`
- [ ] All existing close-session tests pass (no regression)

**Operational Readiness**
- [ ] Migration is reversible (functions use `CREATE OR REPLACE`)
- [ ] Error codes (`NO_ACTIVE_SESSION`, `UNRESOLVED_LIABILITIES`) appear in service error mapping

**Documentation**
- [ ] REMEDIATION-SESSION-CLOSE-LIFECYCLE-GAPS.md updated with implementation status
- [ ] ISSUE-SESSION-CLOSE-DOWNSTREAM-GAPS.md issues 5b and 5c marked resolved

---

## 9. Related Documents

- **Investigation**: `docs/00-vision/table-context-read-model/issues/ISSUE-SESSION-CLOSE-DOWNSTREAM-GAPS.md`
- **Remediation Plan**: `docs/00-vision/table-context-read-model/issues/REMEDIATION-SESSION-CLOSE-LIFECYCLE-GAPS.md`
- **Session Precis**: `docs/00-vision/table-context-read-model/issues/session-open-close-precis.md`
- **Prior PRD**: `docs/10-prd/PRD-038A-table-lifecycle-audit-patch.md`
- **Architecture**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (SRM v4.20.0)
- **ADR-028**: `docs/80-adrs/ADR-028-table-status-standardization.md`
- **ADR-024**: `docs/80-adrs/ADR-024-rls-context-derivation.md`
- **Schema**: `types/database.types.ts`
- **Security**: `docs/30-security/SEC-001-rls-policy-matrix.md`

---

## Appendix A: Schema Reference

**Existing column** (no schema change required):
```sql
-- table_session.has_unresolved_items (from 20260225110509_prd038a_schema_additions.sql)
ALTER TABLE table_session
  ADD COLUMN has_unresolved_items boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN table_session.has_unresolved_items IS
  'PRD-038A Gap A: Placeholder for Finance/MTL integration.
   Write ownership: Finance/MTL RPCs or service_role only.
   TableContextService reads only.';
```

**Existing guardrail** (already wired, now functional):
```sql
-- Inside rpc_close_table_session (20260225110743)
IF v_has_unresolved THEN
  RAISE EXCEPTION 'unresolved_liabilities' USING ERRCODE = 'P0005';
END IF;
```

---

## Appendix B: Implementation Plan

### WS1: Close-Time Flag Computation (P0)

- [ ] Amend `rpc_close_table_session` — compute `has_unresolved_items` from `rating_slip` state, persist on row before existing `P0005` check
- [ ] Amend `rpc_force_close_table_session` — compute flag, persist on row, enumerate orphaned slips in `audit_log.details`
- [ ] Remove `hasOpenSlipsForTable` pre-check from `closeTableSession` service function (now redundant)

### WS2: Session-Gated Seating (P0)

- [ ] Amend `rpc_start_rating_slip` — add `table_session` existence check after `TABLE_NOT_ACTIVE` gate
- [ ] Amend `rpc_check_table_seat_availability` — add `table_session` existence check after table status checks
- [ ] Add `NO_ACTIVE_SESSION` error mapping in `mapRpcError` (service layer)
- [ ] Add `NO_ACTIVE_SESSION` to `ERROR_MESSAGES` in close dialog (and any seating UI error handlers)

### WS3: Client Cache Invalidation (P1)

- [ ] Add `rating-slip` query key invalidation to `useCloseTableSession` `onSuccess`
- [ ] Add `visit` query key invalidation to `useCloseTableSession` `onSuccess`

### WS4: Testing (P0)

- [ ] Integration test: standard close blocked when open slips exist
- [ ] Integration test: force-close records flag + orphan audit payload
- [ ] Integration test: `rpc_start_rating_slip` rejects without active session
- [ ] Integration test: `rpc_check_table_seat_availability` returns `no_active_session`
- [ ] Regression: all existing close-session tests pass

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**TableContext Domain**
- `UNRESOLVED_LIABILITIES` (HTTP 409) — Session has open rating slips; standard close blocked
- `NO_ACTIVE_SESSION` (HTTP 409) — Table has no active session; seating rejected
- `TABLE_HAS_OPEN_SLIPS` (HTTP 409) — Existing service-layer error (may be consolidated with `UNRESOLVED_LIABILITIES`)

**RPC Error Codes (PostgreSQL)**
- `P0005` — `unresolved_liabilities` (maps to `UNRESOLVED_LIABILITIES`)
- New: `NO_ACTIVE_SESSION` exception in `rpc_start_rating_slip`

---

## Appendix D: Cross-Context Query Allowlist

| RPC | Reads From | Direction | Justification |
|-----|-----------|-----------|---------------|
| `rpc_close_table_session` | `rating_slip` (count open) | TableContext → RatingSlip | Already done in service layer; moving to RPC for atomicity |
| `rpc_force_close_table_session` | `rating_slip` (enumerate open) | TableContext → RatingSlip | Audit trail completeness |
| `rpc_start_rating_slip` | `table_session` (existence check) | RatingSlip → TableContext | Seating invariant enforcement |
| `rpc_check_table_seat_availability` | `table_session` (existence check) | TableContext → TableContext | Same bounded context |

All reads are read-only. No bounded context writes another context's tables.

---

## Appendix E: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-03-25 | Engineering | Initial draft from REMEDIATION-SESSION-CLOSE-LIFECYCLE-GAPS investigation |
