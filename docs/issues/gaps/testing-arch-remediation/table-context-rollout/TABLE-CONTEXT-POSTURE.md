# TableContext Bounded Context — Testing Posture Statement

**Verification Tier:** Trusted-Local (TESTING_GOVERNANCE_STANDARD v2.0.0, Section 5)
**Achieved:** 2026-04-01
**Governance:** ADR-044, CONTEXT-ROLLOUT-TEMPLATE Steps 1-8
**Intake:** REMAINING-SERVICES-REMEDIATION-PLAN.md Section 4 Tier 1

---

## Layer Health

| Layer (Section 3) | Verification Tier | Health State | Evidence |
|---|---|---|---|
| Server-Unit (schemas, mappers, guardrails) | Trusted-Local | Healthy | `npm run test:slice:table-context` |
| Route-Handler (drop-events GET) | Trusted-Local | Healthy | `drop-events-route-boundary.test.ts` |
| Integration (6 files, RPC canaries) | Trusted-Local | Healthy | `*.int.test.ts`, gated by `RUN_INTEGRATION_TESTS` |
| Smoke (http-contract) | Advisory | Compromised | Reclassified per Section 9.2 — see below |

---

## File Inventory (32 files)

### Server-Unit Tests (19 files)

| File | Classification | Directive | Status |
|---|---|---|---|
| `mappers.test.ts` | Server-Unit | Added | Pass |
| `mappers-confirmation.test.ts` | Server-Unit | Pre-existing | Pass |
| `table-settings.test.ts` | Server-Unit | Added | Pass |
| `rundown.test.ts` | Server-Unit | Added | Pass |
| `rundown-report-schemas.test.ts` | Server-Unit | Pre-existing | Pass |
| `rundown-report-mappers.test.ts` | Server-Unit | Pre-existing | Pass |
| `shift-cash-obs.test.ts` | Server-Unit | Added | Pass |
| `shift-cash-obs-guardrails.test.ts` | Server-Unit | Added | Pass |
| `shift-read-model-audit.test.ts` | Server-Unit | Added | Pass |
| `shift-metrics-opening-baseline.test.ts` | Server-Unit | Added | Pass |
| `shift-metrics-snapshot-gaps.test.ts` | Server-Unit | Added | Pass |
| `shift-provenance-rollup.test.ts` | Server-Unit | Added | Pass |
| `shift-checkpoint-schemas.test.ts` | Server-Unit | Pre-existing | Pass |
| `shift-checkpoint-mappers.test.ts` | Server-Unit | Pre-existing | Pass |
| `close-guardrails.test.ts` | Server-Unit | Added | Pass |
| `close-reason-schema.test.ts` | Server-Unit | Added | Pass |
| `close-reason-labels.test.ts` | Server-Unit | Added | Pass |
| `session-mapper.test.ts` | Server-Unit | Added | Pass |
| `chip-custody-confirmation.test.ts` | Server-Unit | Pre-existing | Pass |

### Display/Presentation Tests (2 files)

| File | Classification | Directive | Status |
|---|---|---|---|
| `admin-display.test.ts` | Server-Unit | Added | Pass |
| `pit-display.test.ts` | Server-Unit | Added | Pass |

### Stub Tests (3 files)

| File | Classification | Directive | Status |
|---|---|---|---|
| `chip-custody.test.ts` | Server-Unit (stub) | Added | Pass (todo only) |
| `dealer-rotation.test.ts` | Server-Unit (stub) | Added | Pass (todo only) |
| `table-lifecycle.test.ts` | Server-Unit (stub) | Added | Pass (todo only) |

### Route-Handler Boundary Test (1 file)

| File | Classification | Directive | Status |
|---|---|---|---|
| `drop-events-route-boundary.test.ts` | Route-Handler (Section 3.4) | Created with directive | Pass |

### Smoke Test — Reclassified (Section 9.2) (1 file)

| File | Classification | Directive | Reclassification Reason |
|---|---|---|---|
| `http-contract.test.ts` | Smoke (was Route-Handler) | Pre-existing | Only asserts `typeof === 'function'` for exports; no status code, body shape, or error path assertions |

### Integration Tests (6 files)

| File | Classification | Directive | Gate | Status |
|---|---|---|---|---|
| `table-context.integration.test.ts` | Integration (stub) | Added | **Newly added** | Skips without `RUN_INTEGRATION_TESTS` |
| `rpc-activate-table-session.int.test.ts` | Integration | Added | Pre-existing | Skips without `RUN_INTEGRATION_TESTS` |
| `rpc-close-table-session-cancel.int.test.ts` | Integration | Added | Pre-existing | Skips without `RUN_INTEGRATION_TESTS` |
| `rpc-open-table-session.int.test.ts` | Integration | Added | Pre-existing | Skips without `RUN_INTEGRATION_TESTS` |
| `session-close-lifecycle.int.test.ts` | Integration | Added | Pre-existing | Skips without `RUN_INTEGRATION_TESTS` |
| `table-opening-attestation-rls.int.test.ts` | Integration | Added | Pre-existing | Skips without `RUN_INTEGRATION_TESTS` |

---

## Tenancy Verification Gap

Route-handler boundary tests verify handler contracts with mocked middleware context.
They do NOT verify tenant isolation or RLS enforcement. Cross-tenant abuse
verification requires integration tests against a running Supabase instance
(see `rpc-*` integration test pattern in this context).

---

## Theatre Freeze (Section 9.1)

- No new shallow/mock-everything tests in TableContext service
- New route-handler tests must follow the boundary test exemplar pattern (`drop-events-route-boundary.test.ts`)
- Existing shallow test (`http-contract.test.ts`) reclassified as smoke, not removed
- **Test tier distinction**: Boundary tests (mock middleware) verify handler contracts. Integration tests (live DB) verify tenant isolation and business behavior. Do not conflate the two.

---

## Skipped Tests

None. All tests pass or are skipped via `RUN_INTEGRATION_TESTS` gate (integration tests require Supabase).

---

## Remediation Summary

| Operation | Count | Detail |
|---|---|---|
| `@jest-environment node` directive added | 24 | All files missing directive now have it as line 1 |
| `RUN_INTEGRATION_TESTS` gate added | 1 | `table-context.integration.test.ts` (5 other int files already gated) |
| Route-handler boundary test created | 1 | `drop-events-route-boundary.test.ts` |
| Smoke reclassification | 1 | `http-contract.test.ts` (Section 9.2) |
| Slice script added | 1 | `test:slice:table-context` in package.json |

---

## Change-Control Disclosure (Section 12)

1. **What changed**: TableContext tests migrated to node runtime (24 directives), integration gate added to 1 file, route-handler boundary exemplar created, shallow test reclassified as smoke
2. **Why**: Testing governance remediation per ADR-044 / CONTEXT-ROLLOUT-TEMPLATE
3. **Layers gained**: Server-Unit, Route-Handler, Integration (canary) -> Trusted-Local. Shallow test -> Advisory/Smoke reclassification.
4. **Confidence**: Increased — TableContext now has honest local verification under correct runtime with behavioural assertions
5. **Compensating controls**: N/A (confidence increased)
6. **Exit criteria for advisory layers**: Shallow test (`http-contract.test.ts`) replaced incrementally as routes are touched (Section 9.5)
