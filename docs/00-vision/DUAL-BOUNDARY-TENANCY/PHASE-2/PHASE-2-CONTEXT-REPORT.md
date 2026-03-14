---
id: PHASE-2-CONTEXT-REPORT
title: "Phase 2 Context Report — Multi-Casino Staff Access + Tenant Picker"
status: Ready for Feature Pipeline
date: 2026-03-13
phase: Pre-Design (Context Gathering Complete)
triggered_by: ADR-043 Phase Roadmap (Phase 2)
depends_on: ADR-043 Phase 1 (commit e86e5eb, branch feat/dual-bondary-tenancy)
agents: Lead Architect, RLS Expert, Backend Service Builder, Frontend Design, Devil's Advocate
---

# Phase 2 Context Report — Multi-Casino Staff Access + Tenant Picker

## Executive Summary

Five domain expert agents independently researched Phase 2 of ADR-043's roadmap against the `feat/dual-bondary-tenancy` worktree. This report synthesizes their findings into a consolidated context package for the feature pipeline.

**Verdict**: Phase 2 is architecturally feasible with the Phase 1 foundation in place, but carries **2 P0 blockers** and **3 P1 must-fixes** that require ADR-level resolution before implementation begins. The scope is properly bounded (junction table + RPC amendment + tenant picker UI), but hidden design decisions around parameter validation, revocation semantics, and JWT claims must be frozen first.

**Phase 1 Verification**: Confirmed complete — commit `e86e5eb` on `feat/dual-bondary-tenancy`, 41 files changed, migration `20260312155427_adr043_company_foundation.sql` delivered. Company entity populated, `app.company_id` derived, `casino.company_id` NOT NULL with RESTRICT FK, zero behavioral change.

---

## 1. Current State (Phase 1 Baseline)

### Staff-Casino Binding
- **1:1 binding**: `staff.casino_id` NOT NULL, FK to `casino(id)` with ON DELETE RESTRICT
- **`staff.user_id`**: UNIQUE constraint (ADR-024 INV-6 deterministic lookup)
- **No junction table** exists; no multi-casino concept in schema

### Context Derivation Chain
```
auth.uid() [JWT]
  → staff lookup (user_id UNIQUE)
  → staff.casino_id + staff.role + staff.status
  → JOIN casino → company
  → set_rls_context_from_staff() sets:
      app.actor_id, app.casino_id, app.staff_role, app.company_id
  → injectRLSContext() populates RLSContext {actorId, casinoId, staffRole, companyId}
```

### RLS Posture
- Pattern C Hybrid: `COALESCE(current_setting('app.casino_id'), jwt.app_metadata.casino_id)`
- Write policies: Session-var-only (no COALESCE fallback, ADR-030 INV-030-5)
- **No policy references `app.company_id`** (Phase 1 is inert plumbing)
- 20+ casino-scoped tables enforce `casino_id = <derived value>`

### Frontend
- `useAuth()` hook extracts `app_metadata.{staff_id, casino_id, staff_role}` from JWT
- **Zero visual indicator** of which casino the user is in
- No casino-switching mechanism; all routes assume single casino context
- Zustand stores are domain-specific (pit-dashboard, player-dashboard, shift-dashboard)
- TanStack Query with domain-tiered stale times (REFERENCE 5m, TRANSACTIONAL 30s, REALTIME 10s)

---

## 2. Convergent Findings (All Agents Agree)

### 2.1 New Junction Table: `staff_casino_access`

All five agents converge on the same schema design:

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | uuid | PK, gen_random_uuid() |
| `staff_id` | uuid | FK → staff(id), NOT NULL |
| `casino_id` | uuid | FK → casino(id), NOT NULL |
| `company_id` | uuid | FK → company(id), NOT NULL (denormalized for RLS) |
| `access_level` | text/enum | DEFAULT 'operator' |
| `created_at` | timestamp | DEFAULT now() |
| `created_by` | uuid | FK → staff(id), audit trail |

- UNIQUE constraint on `(staff_id, casino_id)`
- Indexes on `staff_id` and `casino_id`
- Backfill from existing `staff.casino_id` (idempotent, atomic)

### 2.2 Keep `staff.casino_id` as "Home Casino"

All agents recommend **preserving** `staff.casino_id` as the primary/home casino:
- Backward compatible (no existing code breaks)
- Serves as default when no `p_selected_casino_id` is provided
- Audit anchor (staff "reports to" their home casino)
- Phase 3+ can revisit deprecation

### 2.3 Single-Casino-Per-Request Context

All agents agree the session variable `app.casino_id` remains a **single UUID per request**:
- No `app.allowed_casino_ids` array
- RLS policies remain unchanged (still check `casino_id = current_setting('app.casino_id')`)
- Tenant picker switches which single casino is active, not which set is visible
- Cross-casino visibility is Phase 3 scope (requires dedicated RLS policy redesign)

### 2.4 Fail-Closed Validation

All agents require that `set_rls_context_from_staff(p_selected_casino_id)`:
- Validates `p_selected_casino_id` exists in `staff_casino_access` for the authenticated staff
- Validates the casino belongs to the same company
- Validates the casino is active
- RAISES EXCEPTION if any check fails (no partial context, no fallback)

### 2.5 Single-Company Enforcement

Hard constraint: Staff may only access casinos within their company boundary. Cross-company access is permanently out of Phase 2 scope.

---

## 3. Key Design Decisions Required (Pre-Implementation)

### D1: ADR-024 INV-8 Amendment — Parameter Spoofability [P0 BLOCKER]

**Problem**: ADR-024 INV-8 states "context must be derived server-side, never from client input." Phase 2 requires `p_selected_casino_id` as a client-supplied RPC parameter.

**Resolution Required**: Amend INV-8 with a controlled exception:
> "Exception: `p_selected_casino_id` is permitted IF validated against the authenticated staff member's `staff_casino_access` rows with fail-closed semantics (RAISE EXCEPTION on invalid selection). This is a scoped user selection (choosing from their own authorized set), not spoofable identity input."

**Defense-in-depth** (RLS Expert recommendation):
- **Tier 1**: Application middleware validates before RPC call
- **Tier 2**: RPC re-validates inside SECURITY DEFINER before SET LOCAL
- **Tier 3**: RLS policies remain unchanged (casino_id equality check)

### D2: Revocation Semantics [P0 BLOCKER]

**Problem**: When admin removes a `staff_casino_access` row, staff's active session has stale context.

**Options**:
| Option | Behavior | Complexity |
|--------|----------|-----------|
| A (Recommended) | Revocation effective at next RPC call; audit trail documents timing | Low |
| B | Revocation invalidates active sessions (requires session invalidation signal) | High |

**Minimum**: Every RPC call re-validates against `staff_casino_access` (no caching in middleware). This eliminates stale-session risk at the cost of one additional query per RPC.

### D3: JWT Claims for Multi-Casino Staff [P1]

**Problem**: Current JWT carries `casino_id` in `app_metadata`. For multi-casino staff, which casino?

**Options**:
| Option | JWT.casino_id | Fallback Behavior |
|--------|--------------|-------------------|
| A | Home casino (staff.casino_id) | COALESCE fallback reads home casino data |
| B (Recommended) | NULL for multi-casino staff | Forces explicit p_selected_casino_id on every RPC |
| C | Refreshed on every switch | Race window, complex client-side |

**RLS Expert recommendation**: Option B — eliminates silent fallback to wrong casino. Single-casino staff retain JWT fallback (backward compatible).

### D4: Tenant Selection Propagation [P1]

**Problem**: How does the selected casino travel from UI to RPC?

**Options**:
| Option | Mechanism | Tradeoffs |
|--------|-----------|-----------|
| A | RPC parameter `p_selected_casino_id` | Clean, explicit, validated in RPC |
| B (Recommended) | HTTP header `X-Selected-Casino-Id` + RPC parameter | Header for middleware pre-validation; RPC for authoritative derivation |
| C | Secure cookie | Persistent across requests, but adds state |

**Backend recommendation**: Option B — middleware extracts header, pre-validates, passes to RPC. RPC re-validates (defense-in-depth).

### D5: Access Level Granularity [P3 — Defer]

**Decision**: Is `access_level` global (viewer/operator/admin) or per-table?

**Recommendation**: Global for Phase 2. Per-table access control requires capability-based model (separate ADR, Phase 4+).

---

## 4. Threat Model Summary (RLS Expert)

| ID | Threat | Severity | Mitigation |
|----|--------|----------|-----------|
| T1 | Cross-casino tenant escape via spoofed `p_selected_casino_id` | CRITICAL | D1 amendment + fail-closed RPC validation |
| T2 | Context derivation ambiguity (which casino for parameterless calls?) | MEDIUM | Default to home casino; EXCEPTION for multi-casino staff without selection |
| T3 | TOCTOU between picker selection and RPC execution | MEDIUM | Every RPC re-validates against authoritative `staff_casino_access` |
| T4 | Session state desynchronization (UI vs RPC vs JWT) | MEDIUM | RPC is sole source of truth; client state is UX-only |
| T5 | Stale JWT claims after casino switch | MEDIUM | D3 resolution (null JWT.casino_id for multi-casino staff) |
| T6 | Audit trail gaps (no casino-switch logging) | MEDIUM | Audit event on every successful context switch |
| T7 | RLS policy explosion for Phase 3 | HIGH (future) | Phase 2 keeps single-casino-per-request; no policy changes |
| T8 | Permission escalation via casino assignment | MEDIUM | Role is global (staff.role); feature gates must check casino context |

### Security Invariants (Non-Negotiable)

| ID | Invariant |
|----|-----------|
| INV-P2-1 | Active casino must be validated server-side against `staff_casino_access` |
| INV-P2-2 | `app.casino_id` is always a single UUID per request (no arrays) |
| INV-P2-3 | Every mutating RPC must call `set_rls_context_from_staff(p_selected_casino_id)` |
| INV-P2-4 | `staff_casino_access` is queried per-request (no cross-request caching) |
| INV-P2-5 | All casino switches are logged to `audit_log` |
| INV-P2-6 | JWT claims are null/omitted for multi-casino staff's `casino_id` |
| INV-P2-7 | No RLS policy may enable cross-casino visibility in Phase 2 |
| INV-P2-8 | Client-side state is UX convenience only; RPC is authoritative |

---

## 5. Devil's Advocate Findings

### P0 — Showstoppers (Block Implementation)

| ID | Finding | Remediation |
|----|---------|-------------|
| P0-F1 | ADR-024 INV-8 violation — `p_selected_casino_id` is client-spoofable input | ADR amendment required (see D1) |
| P0-F2 | `staff_casino_access` revocation lag — stale sessions persist | Per-request RPC revalidation (see D2) |

### P1 — Must-Fix Before Ship

| ID | Finding | Remediation |
|----|---------|-------------|
| P1-F1 | `rpc_get_accessible_casinos()` info disclosure — leaks company structure | RLS-gate RPC; Silo deployment check |
| P1-F2 | Tenant picker hidden state fragility — accidental multi-assign confuses staff | Admin guardrails (role-based assignment limits) |
| P1-F3 | "Complexity: L" rating misleading — service layer changes deferred to Phase 4 | PRD must clearly bound Phase 2 deliverables |

### P2 — Should-Fix

| ID | Finding | Remediation |
|----|---------|-------------|
| P2-F1 | No tenant-switch audit logging | Audit event in RPC on successful context switch |
| P2-F2 | Single-casino assumption in service layer CRUD | Add `assertCasinoScope(context, casinoId)` guard |
| P2-F3 | Silo escape hatch not enforced in Phase 2 | Feature flag check in `rpc_get_accessible_casinos()` |

### P3 — Nice-to-Fix

| ID | Finding | Remediation |
|----|---------|-------------|
| P3-F1 | Role ambiguity across casinos (global vs per-casino) | Document: global role for Phase 2; defer per-casino |
| P3-F2 | Tenant picker UX state machine unspecified | UX spec in PRD |
| P3-F3 | 1:1 synthetic companies fragment picker view | Document caveat; company merge is Phase 3+ |

### YAGNI Assessment

> "Phase 2 is NOT blocked by MVP. Commit only if Phase 3 RLS design is already in progress. If Phase 3 is 4+ months away, defer Phase 2 to avoid carrying dead code."

---

## 6. Bounded Context Impact Map

| Context | Impact | Change Scope |
|---------|--------|-------------|
| **Staff Domain** | MAJOR | New junction table, RPC amendment, assignment management |
| **Platform/Auth** | MEDIUM | RLSContext interface extended, middleware update, JWT claims policy |
| **Audit Domain** | LOW | New event types (tenant_switch, access_grant, access_revoke) |
| **Casino Domain** | NONE | No changes |
| **Player Domain** | NONE | Still casino-scoped via RLS |
| **Loyalty Domain** | NONE | Still casino-scoped via RLS |
| **Finance Domain** | NONE | Still casino-scoped via RLS |
| **Visit Domain** | NONE | Still casino-scoped via RLS |

---

## 7. Frontend Architecture (Tenant Picker)

### Component Placement
Header bar, right-aligned next to theme switcher. Hidden for single-casino staff (`accessibleCasinosCount <= 1`).

### Component Pattern
`DropdownMenu` with `RadioGroup` (shadcn/ui, matches existing `NavUser` pattern).

### State Management
- **New Zustand store**: `useTenantStore` with `activeCasinoId`, `availableCasinos`, `isSwitching`
- **Persistence**: `sessionStorage` (tab-scoped — prevents cross-tab contamination, security on shared workstations)
- **NOT localStorage** (would leak active casino to other tabs)

### Query Invalidation on Switch
On casino switch, invalidate all casino-scoped query roots:
`casino`, `player`, `visit`, `ratingSlip`, `table`, `pit-overview`, `loyalty`, `mtl`, `shiftDashboard`

### Route Strategy
- **Phase 2**: Implicit RLS-scoping (no route changes, no URL casino segment)
- **Phase 3+**: Consider URL-based scoping (`/casino/[casinoId]/...`) for deep-linkability

### Edge Cases
- **Concurrent tabs**: Independent `sessionStorage` per tab (correct by design)
- **Access revoked mid-session**: Next RPC fails → error toast → auto-fallback to first available casino
- **Deep links without casino context**: Default to home casino or first accessible
- **Offline switch attempt**: Block with "Network required" error

---

## 8. Implementation Sequence (Backend + Architect Convergence)

### Phase 2A: Design Freeze (Pre-Implementation)
1. ADR-024 amendment — INV-8 controlled exception for `p_selected_casino_id`
2. ADR-043 Phase 2 amendment — revocation semantics, JWT claims policy
3. RPC contract spec — `set_rls_context_from_staff()` v2 + `rpc_get_accessible_casinos()`
4. Security review of junction table + RPC validation logic

### Phase 2B: Database Layer
1. Create `staff_casino_access` junction table
2. Backfill from `staff.casino_id` (idempotent, atomic)
3. Amend `set_rls_context_from_staff()` — add `p_selected_casino_id` parameter + validation
4. Create `rpc_get_accessible_casinos()` — tenant picker data source
5. Add audit_log entries for tenant switch events
6. `npm run db:types-local` — regenerate types

### Phase 2C: Middleware + Auth
1. Extend `RLSContext` interface with `accessibleCasinosCount`
2. Update `injectRLSContext()` to pass `selectedCasinoId` option
3. Update middleware chain to extract `X-Selected-Casino-Id` header
4. Update JWT claims handling for multi-casino staff (null `casino_id`)

### Phase 2D: Client
1. New `useTenantStore` Zustand store
2. New hooks: `useAccessibleCasinos()`, `useSwitchCasino()`
3. Tenant picker component (header placement)
4. Query invalidation on casino switch
5. Update `useAuth()` with `selectedCasinoId`, `isMultiCasinoStaff`

### Phase 2E: API Routes
1. `GET /api/v1/staff/accessible-casinos`
2. `POST /api/v1/staff/switch-casino`
3. Admin routes for assignment management (grant/revoke)

### Phase 2F: Validation
1. RLS integration tests (no cross-casino leaks)
2. TOCTOU race condition tests
3. Revocation propagation tests
4. E2E: tenant picker switch → data refresh
5. E2E: single-casino staff → picker hidden
6. Backward compatibility: full existing test suite passes

---

## 9. Security Gates Checklist

### Pre-Implementation
- [ ] ADR-024 INV-8 amendment frozen
- [ ] Revocation semantics documented in ADR
- [ ] JWT claims policy decided (D3)
- [ ] RPC contracts reviewed by security expert

### During Implementation
- [ ] P0-F1 test: Spoofed `p_selected_casino_id` (wrong company) → EXCEPTION
- [ ] P0-F2 test: Post-revocation RPC call → EXCEPTION
- [ ] P1-F1 test: Silo mode → `rpc_get_accessible_casinos()` returns 1 row
- [ ] T3 test: TOCTOU — revoke during in-flight request → next request blocked
- [ ] T5 test: JWT fallback for multi-casino staff → no silent wrong-casino reads

### Before Ship
- [ ] Full existing test suite passes (zero regressions)
- [ ] Multi-casino stress test (5+ casinos assigned)
- [ ] Audit trail verification (switch events logged)
- [ ] Rollback plan documented

---

## 10. Artifacts for Feature Pipeline

This context report provides the input for:

| Artifact | Purpose | Owner |
|----------|---------|-------|
| **ADR-044** | Phase 2 formal decisions + amendments to ADR-024, ADR-023 | Lead Architect |
| **PRD-051** | Product requirements (tenant picker UX, access levels, workflows) | PRD Writer |
| **RFC-002** | Design review (schema, RPC, context derivation) | Backend + Security |
| **EXEC-SPEC** | Implementation specification (from PRD-051) | Build Pipeline |

### Recommended Feature Pipeline Entry Point

```
/feature-start "Dual-Boundary Tenancy Phase 2 — Multi-Casino Staff Access"
```

**Phase 0 (SRM-First)**: Register `staff_casino_access` under Staff/CasinoService ownership.
**Phase 1 (Scaffold)**: FEATURE_BOUNDARY scoping Phase 2 deliverables.
**Phase 2 (Design)**: RFC-002 + SEC_NOTE addressing P0/P1 findings.
**Phase 3 (ADR)**: ADR-044 freezing D1-D5 decisions.
**Phase 4 (PRD)**: PRD-051 with DoD checklist from security gates.
**Phase 5 (Gate)**: 4-agent review of ADR-044 + PRD-051.

---

## Appendix A: Agent Research Summary

| Agent | Files Researched | Key Contribution |
|-------|-----------------|-----------------|
| Lead Architect | SRM, ADR-024, ADR-030, migration, rls-context.ts, database.types.ts, investigation | Architecture impact map, 5 key design decisions, dependency chain |
| RLS Expert | SEC-001, SEC-002, ADR-024, ADR-030, ADR-040, migration, rls-context.ts, RLS policies | 8 threat vectors, 8 security invariants, 10 security gates |
| Backend Service Builder | services/casino/, SLAD, SRM, database.types.ts, rls-context.ts, hooks/, store/ | Junction table schema, service layer changes, 7-step implementation order |
| Frontend Design | app/layout.tsx, components/layout/, hooks/, store/, lib/query/ | Tenant picker design, state management, query invalidation, edge cases |
| Devil's Advocate | ADR-043, investigation, SEC_NOTE, Over-Engineering Guardrail, RFC-001 | 11 findings (2 P0, 3 P1, 3 P2, 3 P3), YAGNI assessment |
