# Wave 2 – Event & API Integration Detailed Workflow

**Context**: Phase 6 (Loyalty + RatingSlip + MTL) — Wave 2 covers cross-domain orchestration between RatingSlip telemetry (emitter) and Loyalty service (mutator) using the HYBRID pattern. This workflow expands the deliverables listed in `PHASE_6_IMPLEMENTATION_PLAN_v3.md` (Section "Wave 2 – Event & API Integration") and aligns with PT-2 architecture standards (`.claude/CLAUDE.md`).

---

## 1. Scope & Objectives

- **Primary Goal**: Deliver durable event-driven integration so RatingSlip completion and staff-issued manual rewards flow through Loyalty without direct coupling.
- **Tracks in Scope**:
  - **T0** – Event infrastructure + Loyalty listeners (Backend Architect).
  - **T1** – RatingSlip service/action updates (TypeScript Pro).
- **Explicitly Out of Scope**: MTL hooks/UI work (deferred to Wave 3 per plan), analytics stubs, non-Loyalty consumer integrations.

### Success Criteria (from Implementation Plan)
- RatingSlip completion emits telemetry event and awaits Loyalty response; no direct point writes.
- Loyalty service consumes `RATINGS_SLIP_COMPLETED` and `POINTS_UPDATE_REQUESTED`, writing to `loyalty_ledger` via canonical service APIs.
- `manualReward` server action exposed with durable rate limiting and audit enforcement.
- Integration tests demonstrate ledger entries + tier updates with idempotent replay.

---

## 2. Dependencies & Preconditions

1. **Wave 0 schema corrections shipped** (`loyalty_ledger`, `player_loyalty`, RPCs) — verified via Phase 6 developer checklist.
2. **Wave 1 T0 deliverables available**: `services/loyalty/*` business + CRUD modules, manual reward logic, RPC wrappers, unit tests (>80% coverage).
3. **Environment readiness** (from `.claude/CLAUDE.md` and Phase 6 checklist):
   - Supabase migrations applied locally; `npm run db:types` executed to refresh type definitions.
   - No dirty migrations; latest CLI set up for `supabase functions` if using Edge runtime.
   - Teams aligned on slicing decisions per `docs/patterns/BALANCED_ARCHITECTURE_QUICK.md`.

---

## 3. Roles & Communication

| Role | Owner | Primary Responsibilities |
|------|-------|---------------------------|
| Backend Architect | Agent 1 | Event infrastructure (T0), Supabase orchestration, durable rate limiting setup |
| TypeScript Pro | Agent 2 | RatingSlip service/action integration (T1), cross-domain coordination |
| QA / Reviewer | Rotating | Validate integration tests, ensure architectural compliance |

**Checkpoints**: Stand-up at Hour 0 (kickoff), mid-wave sync (~Hour 3.5), final verification (Hour 7 or completion).

---

## 4. High-Level Timeline (7h sequential / ~5.5h parallel)

```
Hour 0-2   : T0.1 Durable event dispatcher foundation
Hour 2-3.5 : T0.2 Loyalty listeners + structured logging
Hour 3.5-4 : T0.3 Server actions (manual reward) + rate limiting hardening
Hour 4-5.5 : T1.1 RatingSlip business/action integration (awaiting loyalty)
Hour 5.5-7 : T1.2 Integration test suite, QA sign-off
```

Parallel option: TypeScript Pro begins T1.1 stubs during T0.2 (after dispatcher contract defined).

---

## 5. Detailed Task Breakdown

### 5.1 Track 0 — Event System & Loyalty Listeners (Backend Architect)

#### Task 2.0.1 — Event Dispatcher Implementation (2h)
- **Architecture Alignment**: HYBRID orchestration → shared infrastructure layer must be horizontal but limited to telemetry + loyalty contexts. Follow `.claude/CLAUDE.md` guidance (functional factories, no globals) and `BALANCED_ARCHITECTURE_QUICK.md` (Action orchestrations for 2-domain scope).
- **Implementation Steps**:
  1. Design TypeScript interfaces for `DomainEvent`, `EventBus`, `emitEvent`, `onEvent`. Keep discriminated unions typed against shared DTO definitions.
  2. Anchor the dispatcher on the existing Supabase trigger pipeline that Wave 1 stood up (per Implementation Plan §5). `emitEvent` should wrap that trigger/RPC combination so domains keep using the agreed channel while letting us swap in a queue worker later without touching domain services.
     - **Future-proofing**: Optionally persist the emitted event into an `event_log` table (if not already created) to permit asynchronous replay. Ensure writes happen inside the same transaction for idempotency.
  3. Implement `createEventBus` factory returning per-request instance; inject `SupabaseClient<Database>` as parameter (no singletons per `.claude/CLAUDE.md`).
  4. Provide `emitEvent` wrapper for server actions/services (ensures consistent logging + error normalization).
- **Artifacts**: `lib/events/dispatcher.ts`, optional SQL migration for `event_log` + indexes, unit tests in `__tests__/lib/events/dispatcher.test.ts` verifying publish/subscribe/idempotent replay.
- **Quality Gates**:
  - Type-safe discriminated unions, no `any` casts.
  - Tests cover multi-subscriber fan-out, duplicate event replay, and error propagation without crashing publisher.
  - Event dispatcher documented in README section for future queue swap.

#### Task 2.0.2 — Loyalty Event Handlers (1.5h)
- **Objective**: Bridge events to Wave 1 loyalty services while maintaining bounded context separation (refer to `Service Responsibility Matrix`).
- **Steps**:
  1. Add handler factories (`createLoyaltyEventHandlers`) that accept `SupabaseClient<Database>` and call existing loyalty business functions.
  2. `RATINGS_SLIP_COMPLETED` handler → call `loyaltyService.calculateAndAssignPoints`, emit structured log using canonical schema (per Implementation Plan §6 Observability and `.claude/CLAUDE.md` no `console.log` in prod; rely on logger util if available).
  3. `POINTS_UPDATE_REQUESTED` handler → call `createLedgerEntry` + `increment_player_loyalty` RPC; enforce non-null `reason`, attach `staffId` for audit.
  4. Register handlers during server startup (`registerLoyaltyListeners()` invoked from Next.js entrypoint; guard for server-only execution).
  5. Ensure idempotency: rely on `loyalty_ledger` composite index; handlers must treat conflict as soft success and avoid rethrow.
- **Quality Gates**:
  - Structured logging aligned with plan (`event_type`, `player_id`, `session_id`, `delta_points`, `transaction_type`, `tier_before`, `tier_after`).
  - Unit/integration tests verifying single ledger row on duplicate events, proper tier updates, error isolation (handler failure doesn’t crash dispatcher).

#### Task 2.0.3 — Server Actions & Rate Limiting Hardening (0.5h)
- **Objective**: Expose manual reward + balance/history actions with durable safeguards.
- **Steps**:
  1. Implement `manualReward` in `app/actions/loyalty-actions.ts` using `withServerAction` wrapper; call `emitEvent` and **await** handler completion (via synchronous dispatcher) before returning.
  2. Integrate Redis-backed rate limiter (`lib/rate-limit-durable.ts`) following `.claude/CLAUDE.md` prohibition on globals: create per-invocation client or reuse safe shared module that exports factory.
  3. Enforce audit reason + staff ID required at action boundary (reject otherwise).
  4. Update read actions (`getPlayerLoyaltyBalance`, `getPlayerLoyaltyHistory`) to leverage loyalty service queries; ensure `select` statements adhere to service responsibility guidelines.
  5. Write tests validating rate limit enforcement, idempotent manual reward, and audit metadata presence.
- **Quality Gates**:
  - Rate limiter persists counts across processes.
  - No UI-visible response before loyalty handler completes.
  - Tests simulate >10 requests/min scenario and verify failure with retry-after messaging.

#### Track 0 Exit Checklist
- [ ] Dispatcher + handlers implemented with tests.
- [ ] Server actions expose manual reward + queries with enforcement.
- [ ] Observability pipeline emits canonical logs.
- [ ] Documentation updated (`docs/phase-6/WAVE_2_READINESS_REPORT.md` or equivalent) summarizing infrastructure changes.

### 5.2 Track 1 — RatingSlip Integration (TypeScript Pro)

#### Task 2.1.1 — RatingSlip Service Refactor (1.5h)
- **Objective**: Remove legacy points coupling and coordinate with Loyalty via events (HYBRID pattern per Balanced Architecture Quick).
- **Steps**:
  1. Audit `services/ratingslip/` for residual points logic (`rg "points" services/ratingslip`) and remove direct balance updates.
  2. Update business service `endSession` to:
     - Fetch completed slip telemetry (existing helper).
     - Call `close_player_session` RPC (schema from Wave 0) without points parameter.
     - Emit `RATINGS_SLIP_COMPLETED` event and await completion (Promise resolves once dispatcher finishes calling handler).
     - Combine telemetry + Loyalty response (points delta + new tier) into return value.
  3. Propagate new return signature through service interface, server action wrappers, and consumers.
  4. Ensure factory signatures stay functional-style; inject dependencies via parameters.
- **Quality Gates**:
  - No `points` column references remain in RatingSlip code.
  - TypeScript interfaces updated with explicit types (no `ReturnType` inference).
  - Unit tests verifying event emission, absence of local points calculation, and synchronous loyalty data availability (<2s).

#### Task 2.1.2 — Server Action & Consumer Updates (1h)
- **Objective**: Expose new service response to UI/other domains.
- **Steps**:
  1. Update `completeRatingSlip` server action to return `{ telemetry, loyalty }` payload.
  2. Adjust downstream consumers (controllers, forms) to display loyalty summary (points delta + tier). If UI not yet implemented, provide typed DTO for Wave 3 team.
  3. Add integration tests comparing ledger entries and returned payload (should match same delta as ledger row).
  4. Document new DTO in API docs and share with MTL/UX teams.

#### Task 2.1.3 — Integration Test Harness (1h)
- **Objective**: Validate cross-domain flow end-to-end.
- **Tests to Implement** (using Jest + Supabase test client or integration harness):
  - **Happy Path**: Create slip → complete → expect single ledger row with `GAMEPLAY`, returned loyalty delta matches ledger.
  - **Duplicate Event**: Replay completion event → ledger unchanged, action returns prior result.
  - **Manual Reward**: Call `manualReward` → ledger row `MANUAL_BONUS`, tier updated, rate limiter respected.
  - **Error Handling**: Simulate loyalty handler failure (mock) → dispatcher surfaces error gracefully, action returns failure without data corruption.
- **Quality Gates**:
  - Tests must run in CI (no reliance on external services beyond approved Supabase local instance/Redis container).
  - Coverage threshold: maintain >90% for touched files (per developer checklist).

#### Track 1 Exit Checklist
- [ ] RatingSlip service/action updated and type-safe.
- [ ] Integration tests passing locally and in CI.
- [ ] API contract docs updated (shared with Wave 3 team).
- [ ] No lint/TypeScript errors.

---

## 6. Quality Gates & Verification Matrix

| Gate | Owner | Timing | Evidence |
|------|-------|--------|----------|
| Dispatcher unit tests | Backend Architect | Post Task 2.0.1 | `npm test -- __tests__/lib/events/dispatcher.test.ts` report |
| Loyalty listener integration test | Backend Architect | Post Task 2.0.2 | `__tests__/services/loyalty/events.test.ts` |
| Manual reward rate limit test | Backend Architect | Post Task 2.0.3 | `__tests__/actions/loyalty-actions.test.ts` |
| RatingSlip unit tests updated | TypeScript Pro | Post Task 2.1.1 | `__tests__/services/ratingslip/business.test.ts` |
| E2E integration suite | Shared | Task 2.1.3 | `__tests__/integration/ratingslip-loyalty.test.ts` |
| Type check | Shared | Final gate | `npx tsc --noEmit` |
| Lint | Shared | Final gate | `npm run lint` |
| Observability validation | Backend Architect | During T0 | Structured log sample captured via logger transport |

---

## 7. Risk Management & Mitigations

| Risk | Mitigation | Trigger Action |
|------|------------|----------------|
| Event dispatcher introduces latency >2s | Keep dispatcher synchronous via RPC; monitor timings; fall back to direct service call if latency spikes | If integration tests show >2s response, hold release and profile RPC |
| Duplicate events produce duplicate ledger rows | Rely on unique index + handler soft-success logic; add regression test | If test fails, patch `createLedgerEntry` conflict handling before proceeding |
| Redis unavailable for rate limiting | Provide graceful degradation (log + deny manual rewards) rather than unlimited access; document runbook | On connection failure, action returns `RATE_LIMIT_UNAVAILABLE` and alerts team |
| Supabase function errors cause system failure | Wrap handler calls in try/catch with structured error logging; surface actionable errors in action responses | On repeated failures, pause dispatcher (feature flag) and notify team |

---

## 8. Deliverables & Documentation Updates

- Code modules: `lib/events/*`, `services/ratingslip/*`, `app/actions/loyalty-actions.ts`, `app/actions/ratingslip-actions.ts`.
- Tests: Unit + integration suites under `__tests__/` hierarchy.
- Docs: Update `docs/phase-6/WAVE_2_READINESS_REPORT.md`, API contract appendix, and changelog entries.
- Ops: Redis/edge function configuration notes in runbook; structured logging schema appended to observability doc.

---

## 9. Handoff Checklist to Wave 3

- [ ] Provide DTO schema for `{ telemetry, loyalty }` response to UI team.
- [ ] Share manual reward action usage guide with MTL team (including rate limit behaviour).
- [ ] Confirm integration test suite included in CI pipeline.
- [ ] Archive structured log sample and attach to observability dashboard ticket.

---

**Status**: Ready for Execution
**Last Updated**: 2025-10-13
**Owner**: Phase 6 Working Group
