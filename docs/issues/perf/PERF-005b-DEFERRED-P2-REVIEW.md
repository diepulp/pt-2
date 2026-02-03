# PERF-005b: Deferred P2 Items — Review & Triage

**Status:** Open (pending PERF-005 Phase 2 completion)
**Parent:** [PERF-005](./PERF-005-RATING-SLIP-COMPREHENSIVE-PERFORMANCE-AUDIT.md)
**EXEC-SPEC:** `docs/20-architecture/specs/PERF-005/EXECUTION-SPEC-PERF-005.md`
**Created:** 2026-01-29
**Category:** Performance / Architecture

---

## Context

PERF-005 scoped its EXEC-SPEC to P0 + P1 + select P3 findings (11 workstreams, 5 phases). Seven P2 items were explicitly deferred. This document captures the triage rationale and flags two items for potential promotion.

---

## Promotion Candidates

### P2-3: Start Slip 2-3 Sequential HTTP Calls (600-1000ms)

**File:** `components/dashboard/new-slip-modal.tsx:199-245`

Starting a new slip requires `getActiveVisit()` → (optional) `startVisit()` → `startRatingSlip()`. Each pays the 3-DB middleware tax independently. Total: 8-12 DB queries, 600-1000ms.

**Fix:** Create BFF endpoint `POST /api/v1/rating-slips/start-with-visit` backed by a composite RPC that atomically ensures visit + creates slip.

**Promotion case:** Same pattern as WS7 (composite save RPC). 600-1000ms latency hits every new slip creation. If WS7 establishes the composite RPC pattern, marginal effort to add start-with-visit is low.

**Risk:** Crosses into visit bounded context (not just rating-slip).

**Recommendation:** Evaluate after WS7 lands. If composite RPC pattern proves clean, promote to PERF-005 Phase 2 addendum or standalone workstream.

---

### P2-7: Financial Adjustment Triggers 13 HTTP Requests (225% overhead)

**File:** `hooks/player-financial/use-financial-mutations.ts:130-160`

`useCreateFinancialAdjustment` uses `playerFinancialKeys.visitSummaryScope` (all visits) + `ratingSlipModalKeys.scope` (all modals). With 3 cached modals and 5 visit summaries, a single adjustment triggers up to 13 refetches when only 4 are needed.

**Fix:** Replace broad scope keys with targeted `visitSummary(visitId)` + `ratingSlipModalKeys.detail(slipId)`. ~10-line change.

**Promotion case:** Identical pattern to WS2 (cache invalidation scoping). Worst overhead ratio in the entire audit (225%). Trivial to implement once WS2 establishes the pattern.

**Risk:** Different bounded context (`player-financial`), but the fix is mechanical.

**Recommendation:** Could be folded into WS2 scope immediately. Alternatively, execute as first item in PERF-005b.

---

## Correctly Deferred Items

### P2-1: Triple Auth/Context Overhead (~30-60ms/request)

**Files:** `lib/server-actions/middleware/auth.ts:47`, `lib/supabase/rls-context.ts:30-112`, `supabase/migrations/20251229152317_adr024_rls_context_from_staff.sql`

Every RPC-backed API request runs auth setup in 3 overlapping phases, querying the staff table 5-7 times:

1. `withAuth` middleware — `getUser()` + staff SELECT
2. `withRLS` middleware — `set_rls_context_from_staff()` RPC (2-3 internal queries)
3. RPC self-injection — `PERFORM set_rls_context_from_staff()` inside each RPC (2-3 more)

**Why deferred:** RPC self-injection is an ADR-024 security invariant. Removing it requires security review and potentially a new ADR. Middleware consolidation (`withAuth` + `withRLS` → single pass) is safe but touches the entire request pipeline — high blast radius.

**Systemic impact:** 30-60ms tax on every API call. At 50 req/s peak, that's 1.5-3s cumulative wasted DB time per second. Warrants its own investigation with security sign-off, not a side-effect of a performance sprint.

**Prerequisite:** Security review of ADR-024 self-injection requirement.

---

### P2-2: getPlayerSummary() Browser-Side 5+1 Waterfall (350-700ms)

**File:** `services/player360-dashboard/crud.ts:82-306`

5 parallel Supabase queries from browser (visit, transactions, loyalty, timeline, ledger) + conditional 6th (rating_slip). Each is a separate browser-to-Supabase roundtrip.

**Why deferred:** Requires new `rpc_get_player_summary` server-side RPC — significant migration with 5-6 joined queries. Player 360 bounded context, not rating-slip. Different ownership surface entirely.

**Recommendation:** Centerpiece of a future Player 360 performance pass. Not related to the pit dashboard critical path.

---

### P2-4: RATING_SLIP_SELECT Over-Fetches JSONB Blobs (16KB+ waste)

**File:** `services/rating-slip/selects.ts:21-37`

`RATING_SLIP_SELECT` includes `game_settings` and `policy_snapshot` JSONB fields in every list query. Never displayed in list views. ~128KB wasted across 8 active slips.

**Why deferred:** Requires creating `RATING_SLIP_LIST_SELECT` and threading through all list query call sites. Every consumer needs verification for JSONB field access.

**Assessment:** Bandwidth optimization, not latency bottleneck. Low urgency.

---

### P2-5: Missing Optimistic Updates in Basic Mutation Hooks

**File:** `hooks/rating-slip/use-rating-slip-mutations.ts:71-186`

4 basic hooks (`usePause`, `useResume`, `useClose`, `useUpdateBet`) lack `onMutate` optimistic updates. Modal hooks have them. Users see delay between click and UI update.

**Why deferred:** WS8 (mutation consolidation) is refactoring these exact hooks. Adding optimistic updates during the same refactor increases scope and risk.

**Recommendation:** Immediate follow-up after WS8 lands. Once mutations are consolidated, porting the `onMutate` pattern from modal hooks is straightforward. Single-workstream addendum.

---

### P2-6: Split Key Factories Create Invalidation Blind Spot

**Files:** `hooks/player-360/keys.ts` (root: `['player-360']`), `services/player360-dashboard/keys.ts` (root: `['player360-dashboard']`)

Invalidating one factory doesn't invalidate the other. Mutations must know about both independently.

**Why deferred:** Architectural design question (unify vs. bridge), not a code fix. Unifying requires deciding which root wins and migrating all consumers.

**Assessment:** Causes stale data in edge cases (Player 360 showing outdated data after mutation). Not a latency or correctness issue on the rating slip critical path. Belongs in Player 360 data architecture pass.

---

## Execution Order (when PERF-005b begins)

| Priority | Item | Effort | Blocked By |
|----------|------|--------|------------|
| 1 | P2-7 (financial 13 requests) | Low (~10 lines) | WS2 pattern |
| 2 | P2-5 (optimistic updates) | Medium | WS8 consolidation |
| 3 | P2-3 (start-with-visit RPC) | Medium-High | WS7 pattern |
| 4 | P2-4 (JSONB over-fetch) | Medium | None |
| 5 | P2-6 (key factory split) | Medium | Architecture decision |
| 6 | P2-2 (player summary RPC) | High | Player 360 scope |
| 7 | P2-1 (auth consolidation) | High | Security review + ADR |

---

## Related

- [PERF-005 Audit](./PERF-005-RATING-SLIP-COMPREHENSIVE-PERFORMANCE-AUDIT.md) — Parent investigation
- [PERF-005 EXEC-SPEC](../../20-architecture/specs/PERF-005/EXECUTION-SPEC-PERF-005.md) — Active execution plan
- [PERF-004](./PERF-004-RATING-SLIP-SAVE-WATERFALL.md) — Original save waterfall (superseded by PERF-005)
