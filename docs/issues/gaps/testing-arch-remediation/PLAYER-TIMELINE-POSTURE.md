# PlayerTimeline Bounded Context -- Testing Posture Statement

**Verification Tier:** Trusted-Local (S5)
**Achieved:** 2026-04-02
**Governance:** ADR-044, TESTING_GOVERNANCE_STANDARD v2.0.0
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Tier 2

---

## Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (mappers, source categories, event labels) | Trusted-Local | Healthy | `npm run test:slice:player-timeline` |
| Integration (RPC contract, ADR-024 security, cursor validation) | Trusted-Local | Gated | `RUN_INTEGRATION_TESTS` env var required |

---

## File Inventory

| File | Canonical Layer | Classification | Runtime | Gate |
|------|----------------|----------------|---------|------|
| `mappers.test.ts` | Server-Unit (S3.3) | Unit | node | N/A |
| `timeline.integration.test.ts` | Integration (S3.5) | Integration | node | `RUN_INTEGRATION_TESTS` |

---

## Route Surface

PlayerTimeline has **no `http.ts`** and **no API routes**. The context exposes data
via the `rpc_get_player_timeline` PostgreSQL RPC, consumed directly by the frontend
through Supabase client calls. No route-handler exemplar is needed.

---

## Unit Test Coverage (mappers.test.ts)

The unit test file validates RPC row-to-DTO mapping with metadata type validation
per ADR-029 (Player 360 Interaction Event Taxonomy). It covers:

1. **mapRpcRowToEvent** -- All event type families:
   - **Visit events**: `visit_start` with validated metadata, `visit_end` with defaults for missing fields
   - **Rating events**: `rating_start` with table/seat metadata, `rating_close` with duration and average bet
   - **Financial events**: `cash_in` with direction/source/tender, `cash_out` with note
   - **Loyalty events**: `points_earned` with reason/slip/visit, `points_redeemed` with note
   - **Compliance events**: `mtl_recorded` with direction/txnType/source/gamingDay
   - **Staff interaction events**: `note_added` with content/visibility, `tag_applied`/`tag_removed` with tagName/tagCategory
   - **Unknown/missing metadata**: defaults for missing fields

2. **mapRpcResultToTimelineResponse** -- Empty array, single row, multi-row with
   pagination extraction from last row, mixed event types.

3. **getSourceCategory** -- All source category mappings: session, gaming, financial,
   loyalty, staff, compliance, identity.

4. **getEventTypeLabel** -- Human-readable label mapping for all event types.

All assertions are behavioural (DTO shape, field values, pagination state), not
shallow.

---

## Integration Test Coverage (timeline.integration.test.ts)

The integration test file validates the `rpc_get_player_timeline` RPC contract
against a live Supabase database. Gated behind `RUN_INTEGRATION_TESTS`.

Test categories:

1. **ADR-024 Security Compliance** -- Rejects RPC calls without staff identity
   (UNAUTHORIZED), validates cursor pair before auth check (cursor errors take
   precedence), validates cursorId-without-cursorAt rejection.
2. **RPC Existence** -- Confirms `rpc_get_player_timeline` function exists in the
   database (error is auth-related, not "function does not exist").

**Note:** Full E2E tests with authenticated staff users are deferred to Playwright
tests in `e2e/player-timeline.spec.ts`.

---

## Tenancy Verification Gap

Unit tests verify mapper logic with test data factories. They do NOT verify tenant
isolation or RLS enforcement. Cross-tenant abuse verification requires integration
tests with authenticated staff users against a running Supabase instance. The
integration tests confirm ADR-024 auth enforcement but do not exercise multi-tenant
data isolation through the timeline RPC.

---

## Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in PlayerTimeline context
- Both existing test files contain genuine behavioural assertions
- New tests must follow established patterns (data factories for unit, `describeIntegration` gate for integration)

---

## Shallow Test Reclassification (S9.2)

No tests reclassified. Both files contain genuine behavioural assertions:
- Unit tests: DTO field values, metadata shape, pagination state, category classification
- Integration tests: RPC error messages, cursor validation semantics, function existence

---

## Skipped Tests

None. All unit tests pass under node runtime. Integration tests are gated (not
skipped) via `RUN_INTEGRATION_TESTS` env var and `describeIntegration` pattern.

---

## Slice Script

```bash
npm run test:slice:player-timeline
```

Runs all `services/player-timeline/__tests__/*.test.ts` files under `jest.node.config.js`.
Integration tests (`.integration.test.ts`) are included in the glob but skip
automatically without `RUN_INTEGRATION_TESTS=true`.

---

## Change-Control Disclosure (S12)

1. **What changed:** PlayerTimeline testing posture documented. No test file
   modifications required -- both files already had `@jest-environment node`
   directives and integration gate via `describeIntegration` pattern.
2. **Why:** Testing governance remediation per ADR-044 / Tier 2 rollout.
3. **Layers gained:** Server-Unit, Integration (gated) -> Trusted-Local.
4. **Confidence:** Baseline established -- PlayerTimeline has honest local
   verification of mapper logic and RPC contract under correct runtime.
5. **Compensating controls:** N/A (confidence established, not reduced).
6. **Exit criteria for advisory layers:** N/A -- no advisory layers in PlayerTimeline context.
