# Quality & Testing Context (QA - 40-quality/)
canonical_source: docs/patterns/SDLC_DOCS_TAXONOMY.md
owner: QA Lead
docs:
  - docs/40-quality/QA-001-service-testing-strategy.md
  - docs/40-quality/QA-002-quality-gates.md
  - docs/80-adrs/ADR-002-test-location-standard.md
  - docs/80-adrs/ADR-005-integrity-enforcement.md

## Test Location Standard (ADR-002)

**Chosen Pattern**: Root-level `__tests__/services/`

```
__tests__/
└── services/
    ├── player/
    │   └── player-service.test.ts
    ├── casino/
    │   └── casino-service.test.ts
    └── visit/
        └── visit-service.test.ts
```

**Rationale**: Separation of test vs production code, easier to exclude from builds, matches Next.js conventions.

## Four-Layer Integrity Enforcement (ADR-005)

### Layer 1: IDE & Editor (Real-time)
- TypeScript Language Server for immediate type checking
- ESLint for bounded context rule enforcement
- Catches: 80% of issues immediately during development

### Layer 2: Pre-commit Hooks (Commit-time)
- Schema verification test blocks commits with schema drift
- lint-staged for automatic linting and formatting
- Catches: 15% of issues before code enters repository

### Layer 3: CI/CD Pipeline (PR-time)
- Mandatory schema verification step (cannot be skipped)
- Full type checking across entire codebase
- Comprehensive test suite execution
- Catches: 4% of issues before code reaches production

### Layer 4: Runtime Guards (Production)
- Service operation wrappers for graceful error handling
- Monitoring and alerting for schema violations
- Catches: 1% of issues in production with graceful handling

## Quality Gates Checklist

### Pre-Commit
- [ ] `npm run lint:check` passes (ESLint with max-warnings=0)
- [ ] `npm run type-check` passes (TypeScript strict mode)
- [ ] Schema verification test passes (if schema changed)
- [ ] Types regenerated after migrations (`npm run db:types`)

### Pre-Merge (CI)
- [ ] All tests pass (`npm test`)
- [ ] Coverage thresholds met (80% lines, 70% branches)
- [ ] No console.log in production paths
- [ ] API contracts updated if endpoints changed
- [ ] Documentation updated for new features

### Pre-Release
- [ ] Integration tests pass
- [ ] Performance budgets met (lighthouse scores)
- [ ] Accessibility checks pass (a11y audit)
- [ ] Security scan clean (no critical vulnerabilities)
- [ ] Rollback plan documented

## Test Strategy Patterns

### Service Layer Tests
```typescript
// __tests__/services/player/player-service.test.ts
describe('PlayerService', () => {
  it('creates player with valid data', async () => {
    const result = await playerService.create(validDTO);
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject(validDTO);
  });

  it('validates casino_id presence (tenancy)', async () => {
    const result = await playerService.create({ ...validDTO, casino_id: null });
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
  });
});
```

### Schema Verification Test
```typescript
// __tests__/schema-verification.test.ts
describe('Schema Verification', () => {
  it('player_loyalty table has current_balance field', () => {
    const validField: keyof PlayerLoyaltyRow = 'current_balance';
    expect(validField).toBeDefined();
  });

  // @ts-expect-error - should fail if field doesn't exist
  it('player_loyalty does not have points_balance field', () => {
    const invalidField: keyof PlayerLoyaltyRow = 'points_balance';
  });
});
```

### Integration Tests
```typescript
// __tests__/workflows/loyalty-points.test.ts
describe('Loyalty Points Workflow', () => {
  it('awards points when rating slip completes', async () => {
    const visit = await createTestVisit();
    const ratingSlip = await completeRatingSlip(visit.id);
    const loyalty = await getLoyalty(visit.player_id);

    expect(loyalty.current_balance).toBeGreaterThan(0);
  });
});
```

## Coverage Targets

| Layer | Lines | Branches | Enforcement |
|-------|-------|----------|-------------|
| Services | ≥80% | ≥70% | CI blocks merge |
| Hooks | ≥75% | ≥65% | CI warns |
| Components | ≥70% | ≥60% | CI warns |
| Overall | ≥80% | ≥70% | CI blocks merge |

## Performance Budgets

| Metric | Target | Tool |
|--------|--------|------|
| First Contentful Paint | <1.8s | Lighthouse |
| Time to Interactive | <3.8s | Lighthouse |
| Total Bundle Size | <200kb | next-bundle-analyzer |
| Service Response Time | <200ms | Jest tests |

## When to Reference Full Docs

- **Test strategy details**: Read docs/40-quality/QA-001-service-testing-strategy.md
- **CI gate configuration**: Read docs/40-quality/QA-002-quality-gates.md
- **Integrity framework**: Read docs/80-adrs/ADR-005-integrity-enforcement.md
