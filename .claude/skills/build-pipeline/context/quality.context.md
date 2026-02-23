# Quality Context for PRD Pipeline

This context file is loaded by the build-pipeline skill during EXECUTION-SPEC generation.
It contains test strategy and quality gate requirements.

---

## Test Strategy

**Document**: `docs/40-quality/TEST_STRATEGY.md`

### Coverage Targets

| Layer | Target | Tool |
|-------|--------|------|
| Service layer | 80%+ | Jest |
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

## DoD Checklist Template

Every EXECUTION-SPEC should include a Definition of Done with:

- [ ] All workstream outputs created
- [ ] All gates pass (type-check, lint, test, build)
- [ ] No regressions in existing tests
- [ ] Security invariants validated (ADR-024 + ADR-030 compliance)
- [ ] Write-path RLS on critical tables uses session vars only (ADR-030 INV-030-5)
- [ ] No `skipAuth` in production source files (ADR-030 INV-030-4)
- [ ] Documentation updated if needed
