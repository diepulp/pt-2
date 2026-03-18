# DoD Gate Checklist Template

> Copy this template to `docs/20-architecture/specs/{FEATURE-ID}/DOD-{ID}.md`

---

## Purpose

Executable gate checklist. **If it can't run in CI, it's not a gate — it's a wish.**

---

## Template

```markdown
# DOD-{ID}: {Feature Name} Definition of Done

> **Purpose:** Executable gate checklist. If it can't run in CI, it's not a gate — it's a wish.

---

## Gate Status

| Gate | Status | Test File | CI Job |
|------|--------|-----------|--------|
| A. Functional | Pending | `__tests__/services/{domain}/*.test.ts` | `npm run test` |
| B. Security | Pending | `__tests__/rls/{domain}.test.ts` | `npm run test:rls` |
| C. Data Integrity | Pending | `__tests__/constraints/{domain}.test.ts` | `npm run test` |
| D. Operability | Pending | `__tests__/services/{domain}/*-errors.test.ts` | `npm run test` |

---

## A. Functional Gates

### A1. Schema Gates

| Gate | Test | Status |
|------|------|--------|
| Table `{table}` exists with required columns | Schema snapshot test | [ ] |
| FK constraint `{fk}` enforced | Insert without parent → error | [ ] |
| UNIQUE constraint `{uq}` enforced | Duplicate insert → error | [ ] |

### A2. Flow Gates

| Gate | Test | Status |
|------|------|--------|
| {Happy path 1} | Integration test | [ ] |
| {Happy path 2} | Integration test | [ ] |
| {Unhappy path 1} | Returns correct error | [ ] |

---

## B. Security Gates

> **CRITICAL:** Tests MUST run under non-owner roles. Table owners and BYPASSRLS bypass RLS.

### B1. Role Matrix Gates

| Gate | Test | Status |
|------|------|--------|
| {allowed_role} can read | `SELECT` → rows returned | [ ] |
| {allowed_role} can write | `INSERT` → success | [ ] |
| {denied_role} CANNOT read | `SELECT` → 0 rows | [ ] |
| {denied_role} CANNOT write | `INSERT` → RLS error | [ ] |

### B2. Actor Binding Gates (INV-9)

| Gate | Test | Status |
|------|------|--------|
| `created_by` bound to current actor | Wrong `created_by` → RLS error | [ ] |
| `updated_by` auto-populated on UPDATE | After UPDATE, matches app.actor_id | [ ] |

### B3. Casino Isolation Gates

| Gate | Test | Status |
|------|------|--------|
| Cannot read other casino's data | SELECT as casino_A, target casino_B → 0 rows | [ ] |
| Cannot write to other casino | INSERT as casino_A, target casino_B → RLS error | [ ] |

### B4. Immutability Gates (if applicable)

| Gate | Test | Status |
|------|------|--------|
| `{field}` immutable after creation | UPDATE → trigger error | [ ] |

### B5. Delete Denial Gates

| Gate | Test | Status |
|------|------|--------|
| Cannot delete `{table}` | DELETE → RLS error (false policy) | [ ] |

---

## C. Data Integrity Gates

### C1. Constraint Gates

| Gate | Test | Status |
|------|------|--------|
| {constraint_1} enforced | Violation → expected error | [ ] |
| {constraint_2} enforced | Violation → expected error | [ ] |

### C2. Trigger Gates

| Gate | Test | Status |
|------|------|--------|
| `updated_at` auto-updates | After UPDATE, timestamp changed | [ ] |
| {trigger_name} fires correctly | Condition → expected behavior | [ ] |

---

## D. Operability Gates

### D1. Error Handling Gates

| Gate | Test | Status |
|------|------|--------|
| {error_1} returns domain error | → `{ERROR_CODE}` | [ ] |
| {error_2} returns domain error | → `{ERROR_CODE}` | [ ] |
| No raw SQL in error messages | Check error output | [ ] |

### D2. Audit Trail Gates

| Gate | Test | Status |
|------|------|--------|
| `created_by` tracked on inserts | All rows have `created_by IS NOT NULL` | [ ] |
| {audit_field} tracked | Expected value present | [ ] |

---

## Test Implementation Template

```typescript
// __tests__/rls/{domain}.test.ts
import { createTestClient } from '@/lib/test-utils';

describe('{domain} RLS', () => {
  const allowedClient = createTestClient({ role: '{allowed_role}', casinoId: CASINO_A });
  const deniedClient = createTestClient({ role: '{denied_role}', casinoId: CASINO_A });
  const otherCasinoClient = createTestClient({ role: '{allowed_role}', casinoId: CASINO_B });

  describe('B1. Role Matrix', () => {
    it('{denied_role} CANNOT read {table}', async () => {
      const { data, error } = await deniedClient
        .from('{table}')
        .select('*');

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('{denied_role} CANNOT write {table}', async () => {
      const { error } = await deniedClient
        .from('{table}')
        .insert({ /* ... */ });

      expect(error?.code).toBe('42501'); // RLS violation
    });
  });

  describe('B2. Actor Binding', () => {
    it('created_by must match current actor', async () => {
      const { error } = await allowedClient
        .from('{table}')
        .insert({
          created_by: OTHER_STAFF_ID, // Spoofed
        });

      expect(error?.code).toBe('42501');
    });
  });

  describe('B3. Casino Isolation', () => {
    it('cannot read other casino data', async () => {
      const { data } = await otherCasinoClient
        .from('{table}')
        .select('*')
        .eq('id', CASINO_A_RECORD);

      expect(data).toHaveLength(0);
    });
  });
});
```

---

## CI Integration

```yaml
# .github/workflows/test.yml
jobs:
  dod-gates:
    name: DoD Gates - {FEATURE-ID}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Start Supabase
        run: npx supabase start
      - name: Run DoD tests
        run: npm test -- --testPathPattern="__tests__/(rls|constraints|services)/{domain}"
        env:
          SUPABASE_TEST_ROLE: authenticated
```

---

## Gate Completion Criteria

| Criteria | Requirement |
|----------|-------------|
| All gates pass | 100% of tests pass |
| No RLS bypass | Tests run under non-owner roles |
| CI automated | Gates run on every PR |
| No manual verification | Every gate has an automated test |

---

**Gate:** If it can't run in CI, it's not a gate — it's a wish.
```

---

## Gate Categories Reference

### A. Functional Gates
Prove the feature works as specified in the PRD.

### B. Security Gates
Prove access control is enforced at the database level.

**Critical requirement:** Tests MUST run under non-owner roles because:
- Table owners bypass RLS
- BYPASSRLS privilege bypasses RLS
- Only `authenticated` role with proper JWT tests real RLS

### C. Data Integrity Gates
Prove constraints, triggers, and invariants are enforced.

### D. Operability Gates
Prove errors are actionable and audit trails are maintained.

---

## Example Gate Mapping

| PRD Acceptance Criterion | DoD Gate |
|-------------------------|----------|
| "Dealer cannot view identity fields" | B1: dealer CANNOT read player_identity |
| "Enrollment requires casino scoping" | C1: FK to player_casino enforced |
| "Duplicate document hash returns error" | A1: UNIQUE constraint enforced |
| "Actor binding prevents spoofing" | B2: created_by bound to app.actor_id |
