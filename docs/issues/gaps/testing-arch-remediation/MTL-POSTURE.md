# MTL Bounded Context — Testing Posture Statement

## MTL Bounded Context

**Verification Tier:** Trusted-Local (Phase A only)
**Achieved:** 2026-04-01

### Layer Health

| Layer (S3) | Verification Tier | Health State | Evidence |
|------------|-------------------|--------------|----------|
| Server-Unit (mappers, view-model) | Trusted-Local | Healthy | `npm run test:slice:mtl` |
| Route-Handler (gaming-day-summary GET) | Trusted-Local | Healthy | `gaming-day-summary-route-boundary.test.ts` |
| Integration | N/A | N/A | MTL has no integration tests; no Phase B needed |

### File Inventory

| File | Canonical Layer | Runtime | Status |
|------|----------------|---------|--------|
| `mappers.test.ts` | Server-Unit (S3.3) | node | Healthy — `@jest-environment node` added |
| `view-model.test.ts` | Server-Unit (S3.3) | node | Healthy — `@jest-environment node` added |
| `gaming-day-summary-route-boundary.test.ts` | Route-Handler (S3.4) | node | New — boundary exemplar |

### Route Surface (4 routes)

| Route | Handler | Boundary Test |
|-------|---------|---------------|
| `GET /api/v1/mtl/entries` | `app/api/v1/mtl/entries/route.ts` | Not yet |
| `POST /api/v1/mtl/entries` | `app/api/v1/mtl/entries/route.ts` | Not yet |
| `GET /api/v1/mtl/entries/[entryId]` | `app/api/v1/mtl/entries/[entryId]/route.ts` | Not yet |
| `POST /api/v1/mtl/entries/[entryId]/audit-notes` | `app/api/v1/mtl/entries/[entryId]/audit-notes/route.ts` | Not yet |
| `GET /api/v1/mtl/gaming-day-summary` | `app/api/v1/mtl/gaming-day-summary/route.ts` | Exemplar |

### Integration Tests

MTL has **no integration test files**. The bounded context's compliance logic (badge derivation, threshold comparison) is fully covered by server-unit tests in `mappers.test.ts`. No Phase B integration canary is needed at this time.

### Tenancy Verification Gap

Route-handler boundary tests verify handler contracts with mocked middleware context.
They do NOT verify tenant isolation or RLS enforcement. Cross-tenant abuse
verification requires integration tests against a running Supabase instance.

### Theatre Freeze (S9.1)

- No new shallow/mock-everything tests in MTL context
- New route-handler tests must follow the boundary test exemplar pattern
- Existing server-unit tests are genuine behavioural tests (badge derivation, mapper correctness)

### Shallow Test Reclassification (S9.2)

No tests reclassified as shallow/theatre. Both `mappers.test.ts` and `view-model.test.ts` contain genuine behavioural assertions (badge derivation logic, DTO shape enforcement, compliance threshold boundary testing).

### Skipped Tests

None. All tests pass under node runtime.

### Change-Control Disclosure (S12)

1. **What changed**: MTL tests migrated to node runtime, route-handler boundary exemplar added, slice script added
2. **Why**: Testing governance remediation per ADR-044 / CONTEXT-ROLLOUT-TEMPLATE
3. **Layers gained**: Server-Unit, Route-Handler -> Trusted-Local
4. **Confidence**: Increased — MTL now has honest local verification under correct runtime with behavioural assertions
5. **Compensating controls**: N/A (confidence increased)
6. **Exit criteria for advisory layers**: N/A — no advisory layers in MTL
