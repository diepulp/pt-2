# Controlled Hybrid Refactor Model

> **Pattern**: Strategic balance between TDD greenfield and PT-1 pattern mining
> **Source**: Phase 2 Player Service Implementation
> **Status**: Active operational model

## Three-Phase Approach

| Phase | Purpose | Output |
|-------|---------|--------|
| **Slice → Proof** | Use small TDD slices to validate the new PT-2 patterns in practice | Verified `create()` → `update()` flows; CI + RLS guardrails proven |
| **Mine → Integrate** | Revisit PT-1 for mature constructs (search logic, query joins, error mapping) | Re-implemented modules, PRD-compliant and debt-free |
| **Document → Template** | Capture the pattern while it's still fresh | `SERVICE_TEMPLATE.md` canonical playbook for all domains |

## Operational Guardrails

To prevent relapse into full PT-1 migration mode:

### 1. Rule of Three
**Do not refactor or generalize any helper until you've repeated it in three slices.**

Example: Don't create `services/shared/validation.ts` until 3 services need the same validation pattern.

### 2. One-Violation Rule
**If a PT-1 artifact breaks even ONE PRD clause, rewrite it rather than patching.**

Violations:
- ❌ `ReturnType<typeof createXService>`
- ❌ `supabase: any`
- ❌ `@/types/database-rebuilt` imports
- ❌ `services/x/types.ts` files
- ❌ `@deprecated` code
- ❌ `class BaseService` abstractions

Action: If PT-1 code contains ANY → **rewrite using template**, don't import.

### 3. Time-Box Mining
**Cap PT-1 exploration to ≤4 hours per module; anything longer means rebuild.**

Reasoning: If understanding PT-1 code takes longer than rewriting it, you're debugging legacy debt instead of building new features.

### 4. End-of-Week Audit
**After each vertical slice, run the same audit checklist to ensure you didn't re-introduce legacy imports or ReturnType inference.**

See: [SERVICE_TEMPLATE.md § End-of-Week Audit](./SERVICE_TEMPLATE.md#end-of-week-audit)

### 5. Document as You Code
**Inline JSDoc before separate ADRs; prevents doc drift.**

```typescript
/**
 * Creates a new player with duplicate email detection.
 *
 * @param data - Player creation payload
 * @returns ServiceResult with created player or DUPLICATE_EMAIL error
 *
 * @example
 * const result = await playerService.create({
 *   email: "test@example.com",
 *   firstName: "John",
 *   lastName: "Doe"
 * });
 * if (result.success) console.log(result.data.id);
 */
```

## Implementation Timeline

### Week 1: Player Service (Hybrid)

**Day 1** ✅ Complete
- TDD Slice 1: `create()` operation
- Shared infrastructure (types, operation-wrapper)
- Test suite foundation

**Day 2** 🔄 In Progress
- TDD Slice 2: `update()` + `getById()` operations
- Duplicate email on update validation
- Complete core CRUD cycle

**Day 3-4** (4h)
- Mine PT-1's `search.ts` (multi-word search, relevance scoring)
- Mine PT-1's `queries.ts` (JOIN patterns, active player queries)
- Rewrite using canonical Database types + explicit interfaces
- Test all borrowed patterns

**Day 5** (2h)
- Integration smoke tests
- End-of-week audit checklist
- `SERVICE_TEMPLATE.md` finalization

**Output**: Canonical Player service + reusable template

### Week 2: Visit Service (Accelerated)

**Day 1-2** (6h)
- Apply Player template
- TDD core operations (start, end, cancel)
- State transition validation

**Day 3-4** (6h)
- Business logic (lifecycle management)
- Queries (active visits, history)
- Integration tests

**Expected Velocity**: **50% faster** than Player (12h vs 18h)

### Week 3: RatingSlip Service (Accelerated)

**Day 1-2** (6h)
- Apply proven patterns
- TDD rating calculations
- Point accrual logic

**Day 3-4** (6h)
- Table/seat assignment
- Status transitions
- Integration tests

**Expected Velocity**: **50% faster** than Player (12h vs 18h)

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **PRD Compliance** | 100% | 0 violations in end-of-week audit |
| **Velocity Improvement** | +50% | Week 2-3 services vs Week 1 |
| **Code Reuse** | 60% | Template usage across services |
| **Test Coverage** | >80% | Jest coverage report |
| **Type Safety** | 100% | `npx tsc --noEmit` passes |

## Risk Mitigation

### Risk: Pattern Drift
**Symptom**: Each service implements slightly different patterns
**Mitigation**: Mandatory template review before starting new service

### Risk: PT-1 Contamination
**Symptom**: Legacy imports creep back in
**Mitigation**: End-of-week audit + CI lint rules

### Risk: Over-Engineering
**Symptom**: Creating abstractions prematurely
**Mitigation**: Rule of Three enforcement

### Risk: Under-Documentation
**Symptom**: Template becomes stale or incomplete
**Mitigation**: Document-as-you-code + weekly template updates

## Decision Log

### Why Hybrid vs Pure TDD?
**Decision**: Controlled hybrid approach
**Rationale**:
- PT-1 has proven search/query patterns (18 months production)
- Pure TDD would reinvent wheels (20-30h waste)
- Pure migration imports technical debt (12-16h cleanup)
- Hybrid balances quality + velocity

**Trade-off**: Requires discipline to avoid full migration creep

### Why Time-Box Mining at 4 Hours?
**Decision**: Hard limit on PT-1 code exploration
**Rationale**:
- If pattern understanding takes >4h, it's too complex
- Rebuilding from scratch with fresh eyes often faster
- Prevents sunk-cost fallacy ("already invested 6h, must finish")

**Trade-off**: May miss subtle optimizations in PT-1 code

### Why Template Before Slice 2?
**Decision**: Lock pattern now, not after all slices
**Rationale**:
- Slice 1 validates core architecture
- Waiting for all slices delays Visit/RatingSlip start
- Early template enables parallel service development

**Trade-off**: May need template refinements after Slice 2-3

## Outcome

This model delivers:
- ✅ **Clean architecture** - Zero technical debt from day 1
- ✅ **Steep learning curve** - Team internalizes patterns through practice
- ✅ **Accelerated delivery** - 50% faster services after template proven
- ✅ **Living reference** - Template evolves with implementation

**Estimated ROI**:
- Week 1: 18h (foundation + template)
- Week 2-5: 4 services × 12h = 48h (vs 72h pure TDD)
- **Total Savings**: 24 hours over Phase 2

## Related Documents

- [SERVICE_TEMPLATE.md](./SERVICE_TEMPLATE.md) - Canonical implementation pattern
- [CANONICAL_BLUEPRINT_MVP_PRD.md](../system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md) - Architecture requirements
- [SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md](../system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md) - System design
- [player-vertical-slice.md](../phase-2/player-vertical-slice.md) - Implementation plan
