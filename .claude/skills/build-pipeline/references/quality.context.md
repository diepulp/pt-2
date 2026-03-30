# Quality Context for PRD Pipeline

This context file is loaded by the build-pipeline skill during EXECUTION-SPEC generation.
It contains test strategy and quality gate requirements.

---

## Test Strategy

**Document**: `docs/40-quality/TEST_STRATEGY.md`

### Coverage Targets

| Layer | Target | Tool |
|-------|--------|------|
| Service layer | 80%+ (governance target) | Jest |
| Mappers | 100% | Jest |
| Route handlers | Happy path + error cases | Jest (integration) |
| E2E critical paths | All user journeys | Playwright |

### Test Types by Workstream

| Workstream Type | Required Tests | Location |
|-----------------|----------------|----------|
| Database/Service | Unit + Integration | `services/{domain}/__tests__/` |
| Route Handlers | HTTP contract tests | `services/{domain}/__tests__/http-contract.test.ts` |
| RPCs | RPC contract tests | `services/{domain}/__tests__/rpc-contract.test.ts` |
| React components | Component tests | `components/{domain}/__tests__/` |
| E2E flows | Playwright specs | `e2e/` |

---

## Quality Gates (Required)

### Phase 1: Schema Changes

```bash
# After migration
npm run db:types
# Verify: Exit code 0, types regenerated successfully
```

### Phase 2: Service Layer

```bash
# Type check
npm run type-check
# Verify: Exit code 0, no type errors
```

### Phase 3: Tests

```bash
# Run domain tests
npm test services/{domain}/
# Verify: All tests pass
```

### Phase 4: Build

```bash
# Full build
npm run build
# Verify: Exit code 0, no build errors
```

---

## RLS Policy Testing

**Document**: `docs/30-security/SEC-001-rls-policy-matrix.md`

### Required RLS Tests

1. **Casino isolation**: Verify user A cannot see casino B's data
2. **Role enforcement**: Verify dealer cannot access admin-only data
3. **Context derivation**: Verify `set_rls_context_from_staff()` works correctly

### Test Pattern

```typescript
describe('RLS policies', () => {
  it('should isolate data by casino', async () => {
    // Set context for casino A
    await supabase.rpc('set_rls_context_from_staff');

    // Query should only return casino A data
    const { data } = await supabase.from('table').select();
    expect(data.every(row => row.casino_id === CASINO_A_ID)).toBe(true);
  });
});
```

---

## Integration Test Fixtures

### Gaming Day Boundary Testing

When testing gaming day boundaries, use controlled timestamps:

```typescript
// Test fixture for gaming day boundary
const GAMING_DAY_CUTOFF = '06:00:00'; // Casino's gaming_day_start_time

const YESTERDAY_EVENING = '2026-01-15T22:00:00Z'; // Before cutoff
const TODAY_MORNING = '2026-01-16T08:00:00Z';     // After cutoff
const TODAY_EVENING = '2026-01-16T22:00:00Z';     // Same gaming day as morning
```

### RPC Testing Pattern

```typescript
it('should derive casino_id from context, not parameter', async () => {
  // Attempt to call RPC without setting context
  await expect(
    supabase.rpc('rpc_example', { p_slip_id: someId })
  ).rejects.toThrow('UNAUTHORIZED');

  // Set context via set_rls_context_from_staff (automatic via authenticated call)
  // Then RPC should work
  const { data, error } = await authenticatedSupabase.rpc('rpc_example', {
    p_slip_id: someId
  });
  expect(error).toBeNull();
});
```

---

## E2E Test-per-PRD Mandate

**Ref:** `docs/issues/gaps/testing-arch-remediation/playwright-gate-e2e/workflows-gaps.md` §3

Every PRD that ships write paths (INSERT/UPDATE/DELETE through server actions, RPCs, or
form submissions) MUST include a Playwright E2E spec in its Definition of Done.

| PRD Type | E2E Required? | Rationale |
|----------|---------------|-----------|
| Write-path (mutations, server actions) | **Yes** | Tier 1 critical paths — DB writes need real-DB E2E |
| Read-only UI rendering | No (recommended) | Tier 2 — rendering validation is desirable but not mandated |
| Infrastructure/migration-only | No | No user-facing workflow to test |

### E2E Workstream Pattern

```yaml
WS_E2E:
  name: E2E Write-Path Tests
  description: Playwright specs covering write-path user journeys for {domain}
  executor: e2e-testing
  executor_type: skill
  depends_on: [all implementation workstreams]
  outputs:
    - e2e/{domain}/*.spec.ts
  gate: e2e-write-path
  estimated_complexity: medium
```

### E2E Gate

```bash
npx playwright test e2e/{domain}/ --reporter=list
# Verify: At least 1 spec file exists, all tests pass
```

---

## DoD Checklist Template

Every EXECUTION-SPEC should include a Definition of Done with:

- [ ] All workstream outputs created
- [ ] All gates pass (type-check, lint, test, build)
- [ ] **E2E specs pass for write-path PRDs** (e2e-write-path gate)
- [ ] No regressions in existing tests
- [ ] Security invariants validated (ADR-024 + ADR-030 compliance)
- [ ] Write-path RLS on critical tables uses session vars only (ADR-030 INV-030-5)
- [ ] No `skipAuth` in production source files (ADR-030 INV-030-4)
- [ ] Documentation updated if needed
