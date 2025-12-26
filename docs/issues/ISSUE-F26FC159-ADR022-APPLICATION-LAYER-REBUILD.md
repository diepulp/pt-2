---
issue_id: ISSUE-F26FC159
title: ADR-022 Application Layer Rebuild
status: open
severity: critical
created: 2025-12-26
category: regression
service: PlayerService
prd: PRD-001
adr: ADR-022

workstreams:
  - id: WS1
    name: Transport Layer
    priority: P0
    status: pending
    skill: api-builder
    description: Create missing identity API endpoint and HTTP fetchers
    deliverables:
      - app/api/v1/players/[playerId]/identity/route.ts (CREATE)
      - services/player/http.ts:upsertIdentity() (CREATE)
      - services/player/http.ts:getIdentity() (CREATE)
    gates:
      - Route handler uses withServerAction middleware
      - HTTP fetcher uses IDEMPOTENCY_HEADER constant
      - Returns ServiceHttpResult contract

  - id: WS2
    name: Service Layer Correction
    priority: P1
    status: pending
    skill: backend-service-builder
    description: Fix bounded context violations and delete bypassing code
    deliverables:
      - app/actions/player.ts (DELETE)
      - services/player/http.ts:enrollPlayer() → services/casino/http.ts (MOVE)
      - services/player/index.ts - wire identity operations (REFACTOR)
    gates:
      - No direct Supabase access outside service layer
      - Bounded context ownership per ADR-022
      - PlayerServiceInterface exposes identity operations

  - id: WS3
    name: Frontend Refactoring
    priority: P2
    status: pending
    skill: frontend-design-pt-2
    description: Fix cross-context orchestration in enrollment modal
    deliverables:
      - components/enrollment/enroll-player-modal.tsx (REFACTOR)
    gates:
      - Uses service layer HTTP fetchers exclusively
      - No direct mutateJSON calls with hardcoded paths
      - enrollPlayer imported from services/casino/http

  - id: WS4
    name: Architecture Governance
    priority: P3
    status: pending
    skill: lead-architect
    description: Update SRM and fix ADR-021 header violations
    deliverables:
      - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md (UPDATE)
      - services/*/http.ts - IDEMPOTENCY_HEADER constant (FIX)
      - services/player/index.ts - remove HTTP re-export (REMOVE)
    gates:
      - SRM aligns with ADR-022 table ownership
      - All HTTP clients use IDEMPOTENCY_HEADER constant
      - No HTTP re-exports from service index files

  - id: WS5
    name: Quality Validation
    priority: P4
    status: pending
    skills:
      - qa-specialist
      - e2e-testing
      - validation-gate
    description: Validate rebuild with tests and quality gates
    deliverables:
      - E2E test for player enrollment + identity flow
      - Unit tests for identity HTTP fetchers
      - Bounded context ownership test
    gates:
      - npm run type-check passes
      - npm test -- -t "player-identity" passes
      - npm test -- -t "Bounded Context Ownership" passes
      - E2E enrollment flow succeeds

dependencies:
  - WS2 depends on WS1 (need API endpoint before refactoring service layer)
  - WS3 depends on WS1, WS2 (need HTTP fetchers before frontend refactor)
  - WS4 can run in parallel with WS1-WS3
  - WS5 runs after WS1-WS4 complete

estimated_files_changed: 12
estimated_lines_deleted: 300
estimated_lines_added: 150
---

# ISSUE-F26FC159: ADR-022 Application Layer Rebuild

**Status:** OPEN
**Severity:** CRITICAL
**Created:** 2025-12-26
**Category:** Regression
**Service:** PlayerService
**PRD:** PRD-001

---

## Executive Summary

Comprehensive audit of ADR-022 Player Identity & Enrollment revealed **15 CRITICAL** and **18 HIGH** severity issues across frontend, backend, and API domains. The database/service layer is sound but the application layer (server actions, API routes, frontend) bypasses the architecture entirely.

**Root cause:** Outdated agents deployed code that violates PT-2 patterns.

**Decision:** Surgical delete + rebuild approach approved. Keep database layer, delete broken application layer code, rebuild using existing service functions.

---

## Expert Panel Audit

| Expert | Domain | Verdict |
|--------|--------|---------|
| Lead Architect | ADR-022 Compliance | 15 CRITICAL + 18 HIGH violations |
| API Builder | Endpoints & ADR-021 | Missing endpoint + 25 header violations |
| Backend Service Builder | Service Layer | 1 CRITICAL bypass, SRM inconsistency |
| RLS Expert | Security Policies | **PASS** - All compliant |

---

## Critical Issues

### 1. Missing Identity API Endpoint

**Severity:** CRITICAL
**Location:** Does not exist: `app/api/v1/players/[playerId]/identity/route.ts`

The frontend component at `enroll-player-modal.tsx:140` calls:
```typescript
await mutateJSON(`/api/v1/players/${data.playerId}/identity`, ...)
```

But no API route handler exists. The service layer (`services/player/identity.ts:upsertIdentity()`) is correctly implemented but has no transport layer binding.

**Error:** 404 - endpoint does not exist

**Fix:** Create API route with POST/GET handlers using `withServerAction` middleware.

---

### 2. Complete Service Layer Bypass

**Severity:** CRITICAL
**Location:** `app/actions/player.ts` (entire file, 254 lines)

This server action file implements a parallel, outdated player service that:
- Directly accesses Supabase tables (`player`, `player_casino`) bypassing the service factory pattern
- Defines duplicate DTOs (lines 11-26) that conflict with `services/player/dtos.ts`
- Implements enrollment at lines 28-54 that violates ADR-022 D5 (CasinoService owns `player_casino`)
- Contains no RLS context injection via `withServerAction` middleware
- Search implementation (lines 189-253) duplicates `services/player/crud.ts:searchPlayers()`
- Raw Postgres errors leak to callers (no `mapDatabaseError()`)

**Violations:**
- GOV-PAT-001 Section 3: "Keep Orchestration Inside Service Factories"
- Anti-patterns 01-service-layer.md: "NEVER inline repo construction in controllers"
- Anti-patterns 01-service-layer.md: "NEVER let raw Postgres errors leak to callers"

**Fix:** DELETE entire file. All operations must flow through service layer.

---

### 3. Frontend Cross-Bounded-Context Orchestration

**Severity:** CRITICAL
**Location:** `components/enrollment/enroll-player-modal.tsx:127-165`

The enrollment mutation performs two bounded-context operations in a single client-side mutation:

```typescript
// Line 133-134: Step 1 - Enrollment (CasinoService domain)
const enrollment = await enrollPlayer(data.playerId);

// Line 140-144: Step 2 - Identity capture (PlayerService domain)
const identityResult = await mutateJSON(
  `/api/v1/players/${data.playerId}/identity`,
  data.identity,
  crypto.randomUUID(),
);
```

**Problems:**
1. Identity capture calls a non-existent API route
2. Cross-bounded-context orchestration should happen at the API layer
3. No atomic transaction guarantee between enrollment and identity capture
4. Direct `mutateJSON` bypasses service layer HTTP fetchers

**Violation:** SRM "Cross-Context Consumption Rules" - frontend cannot orchestrate cross-service operations

**Fix:** Use service layer HTTP fetchers exclusively; create missing identity HTTP fetcher.

---

### 4. Enrollment HTTP Fetcher in Wrong Bounded Context

**Severity:** HIGH
**Location:** `services/player/http.ts:119-134`

The `enrollPlayer()` HTTP fetcher is in PlayerService, but ADR-022 D5 states CasinoService owns enrollment operations.

**Fix:** Move to `services/casino/http.ts`

---

## High Priority Issues

### 5. ADR-021 Header Violations

**Severity:** HIGH
**Location:** 6 HTTP client files (~25 occurrences)

Uses hardcoded `'idempotency-key'` string instead of `IDEMPOTENCY_HEADER` constant.

| File | Occurrences |
|------|-------------|
| `services/player/http.ts` | Multiple |
| `services/casino/http.ts` | Multiple |
| `services/visit/http.ts` | Multiple |
| `services/rating-slip/http.ts` | Multiple |
| `services/table-context/http.ts` | Multiple |
| `services/player-financial/http.ts` | Multiple |

**Required Pattern (per ADR-021):**
```typescript
import { IDEMPOTENCY_HEADER } from '@/lib/http/headers';

headers: {
  'Content-Type': 'application/json',
  [IDEMPOTENCY_HEADER]: generateIdempotencyKey(),
}
```

---

### 6. SRM Inconsistency with ADR-022

**Severity:** HIGH
**Location:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md:97`

The SRM lists `player_casino` under PlayerService:
```
| **Identity** | PlayerService | player, player_casino, *player_identity* | Identity & enrollment management |
```

But ADR-022 v8.0 explicitly states:
```
| **CasinoService** | `player_casino` | Enrollment relationship |
| **PlayerService** | `player`, `player_identity` | Identity artifacts |
```

**Fix:** Update SRM to align with ADR-022 ownership.

---

### 7. Identity Operations Not Wired Through Interface

**Severity:** HIGH
**Location:** `services/player/index.ts`

The identity operations in `services/player/identity.ts` are not exposed through the `PlayerServiceInterface`. These functions exist but aren't accessible through the factory pattern:
- `upsertIdentity()`
- `getIdentityByPlayerId()`
- `verifyIdentity()`

**Fix:** Add identity operations to `PlayerServiceInterface` and wire them in the factory.

---

## Compliant Components (No Changes Required)

| Component | Status | Notes |
|-----------|--------|-------|
| RLS Policies | PASS | All migrations follow ADR-015/020/022 |
| `services/player/identity.ts` | PASS | Correctly implements ADR-022 |
| `services/player/crud.ts` | PASS | Proper `mapDatabaseError()`, bounded context reads |
| `services/casino/crud.ts:enrollPlayer()` | PASS | Correct ownership per ADR-022 D5 |
| `services/player/index.ts` | PASS | Follows GOV-PAT-001 factory pattern |
| `services/player/dtos.ts` | PASS | Canonical DTO source |
| `app/api/v1/players/[playerId]/enroll/route.ts` | PASS | Uses `withServerAction`, correct imports |
| ADR-022 migrations (20251225120000-120006) | PASS | Full ADR-015/020 compliance |

---

## Rebuild Action Plan

### Phase 1: Critical Path (Transport Layer)

| Priority | Action | File |
|----------|--------|------|
| P0 | CREATE | `app/api/v1/players/[playerId]/identity/route.ts` |
| P0 | CREATE | `services/player/http.ts:upsertIdentity()` |

**Identity Route Handler:**
```typescript
// app/api/v1/players/[playerId]/identity/route.ts
import { withServerAction } from "@/lib/middleware/with-server-action";
import { upsertIdentity, getIdentityByPlayerId } from "@/services/player/identity";

export const POST = withServerAction(async (req, { params, mwCtx }) => {
  const playerId = (await params).playerId;
  const input = await req.json();
  const result = await upsertIdentity(mwCtx.supabase, mwCtx.casinoId, playerId, input, mwCtx.actorId);
  return Response.json(result, { status: 201 });
});

export const GET = withServerAction(async (req, { params, mwCtx }) => {
  const playerId = (await params).playerId;
  const result = await getIdentityByPlayerId(mwCtx.supabase, playerId);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(result);
});
```

### Phase 2: Bounded Context Correction

| Priority | Action | File |
|----------|--------|------|
| P1 | MOVE | `enrollPlayer()` from `services/player/http.ts` to `services/casino/http.ts` |
| P1 | DELETE | `app/actions/player.ts` (entire file) |

### Phase 3: Frontend Refactoring

| Priority | Action | File |
|----------|--------|------|
| P2 | REFACTOR | `components/enrollment/enroll-player-modal.tsx` |

- Replace direct `mutateJSON` with `upsertIdentity()` HTTP fetcher
- Update `enrollPlayer` import to use `services/casino/http.ts`
- Add error boundary for partial failure scenarios

### Phase 4: Standards Cleanup

| Priority | Action | File |
|----------|--------|------|
| P3 | FIX | 6 HTTP client files - use `IDEMPOTENCY_HEADER` constant |
| P3 | UPDATE | `SERVICE_RESPONSIBILITY_MATRIX.md` - fix `player_casino` ownership |
| P3 | REMOVE | `export * from "./http"` from `services/player/index.ts` |

---

## File Disposition Matrix

| File | Action | Reason |
|------|--------|--------|
| `app/actions/player.ts` | **DELETE** | Complete service bypass |
| `app/api/v1/players/[playerId]/identity/route.ts` | **CREATE** | Missing transport binding |
| `services/player/http.ts` | **REFACTOR** | Move enrollPlayer, add upsertIdentity |
| `services/casino/http.ts` | **ADD** | Add enrollPlayer fetcher |
| `components/enrollment/enroll-player-modal.tsx` | **REFACTOR** | Fix orchestration pattern |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | **UPDATE** | Align with ADR-022 |
| `services/player/index.ts` | **MINOR** | Remove HTTP re-export |

---

## Verification Checklist

After rebuild, verify:

- [ ] `app/actions/player.ts` is deleted
- [ ] `app/api/v1/players/[playerId]/identity/route.ts` exists with POST/GET handlers
- [ ] All handlers use `withServerAction` middleware
- [ ] `enroll-player-modal.tsx` uses service layer HTTP fetchers exclusively
- [ ] No direct `mutateJSON` calls with hardcoded paths
- [ ] `npm run type-check` passes
- [ ] `npm test -- -t "player-identity"` passes
- [ ] `npm test -- -t "Bounded Context Ownership"` passes

---

## Reproduction Steps

1. Open enrollment modal
2. Create new player
3. Attempt to capture identity
4. Observe 404 error - endpoint does not exist

---

## References

- ADR-022: `docs/80-adrs/ADR-022-player-identity-enrollment.md`
- ADR-022 Decisions: `docs/80-adrs/ADR-022_Player_Identity_Enrollment_DECISIONS.md`
- EXEC-SPEC-022: `docs/20-architecture/specs/ADR-022/EXEC-SPEC-022.md`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- GOV-PAT-001: `docs/70-governance/patterns/domain-modeling/GOV-PAT-001-service-factory-pattern.md`
- ADR-021: `docs/80-adrs/ADR-021-idempotency-header-standardization.md`
