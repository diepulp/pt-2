# Governance Context for PRD Pipeline

This context file is loaded by the build-pipeline skill during EXECUTION-SPEC generation.
It contains project standards that MUST be followed.

---

## Test Location Standards

**Canonical Pattern**: `services/{domain}/__tests__/*.test.ts`

### Test File Naming

| Test Type | Pattern | Example |
|-----------|---------|---------|
| Unit tests | `*.test.ts` | `mappers.test.ts` |
| Integration tests | `*.int.test.ts` | `gaming-day-boundary.int.test.ts` |
| Service tests | `*.service.test.ts` | `visit.service.test.ts` |
| HTTP contract tests | `http-contract.test.ts` | `http-contract.test.ts` |
| RPC tests | `rpc.test.ts`, `rpc-contract.test.ts` | `rpc-contract.test.ts` |

### Directory Structure

```
services/
  {domain}/
    __tests__/
      *.test.ts           # Unit tests
      *.int.test.ts       # Integration tests
      *.service.test.ts   # Service-level tests
      http-contract.test.ts
```

**Note**: Tests are co-located with services, NOT in a top-level `__tests__/` directory.

---

## Migration Standards

**Document**: `docs/60-release/MIGRATION_NAMING_STANDARD.md`

### Naming Format

```
YYYYMMDDHHMMSS_descriptive_name.sql
```

**Examples**:
- `20260116180000_adr026_gaming_day_scoped_visits.sql`
- `20260116180100_adr026_rpc_start_or_resume_visit.sql`

### Migration Content Rules

1. **Comments**: Include purpose, ADR reference, and affected tables
2. **Idempotent**: Use `CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP ... IF EXISTS`
3. **Notify PostgREST**: End with `NOTIFY pgrst, 'reload schema';`

### Example Header

```sql
-- ============================================================================
-- Migration: ADR-026 Gaming Day Scoped Visits
-- Created: 2026-01-16
-- ADR Reference: docs/80-adrs/ADR-026-gaming-day-scoped-visits.md
-- Purpose: Add gaming_day column to visit table with constraints
-- ============================================================================
```

---

## SECURITY DEFINER RPC Standards

**Document**: `docs/80-adrs/ADR-018-security-definer-governance.md`

### Template 5: Context Injection Pattern

```sql
CREATE OR REPLACE FUNCTION rpc_example(p_input_param uuid)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_casino_id uuid;
  v_actor_id uuid;
  v_staff_role text;
BEGIN
  -- STEP 1: Context injection (REQUIRED first line)
  PERFORM set_rls_context_from_staff();

  -- STEP 2: Derive context (NOT from parameters)
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_staff_role := NULLIF(current_setting('app.staff_role', true), '');

  -- STEP 3: Validate context
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: casino context not set';
  END IF;

  -- STEP 4: Business logic using derived context
  ...
END;
$$;
```

### Prohibited Patterns

1. **Never accept `p_casino_id` as parameter** (violates ADR-024 INV-8)
2. **Never accept `p_actor_id` as parameter** (violates ADR-024 INV-8)
3. **Never skip `set_rls_context_from_staff()`** in SECURITY DEFINER RPCs
4. **Never use COALESCE JWT fallback on write policies for critical tables** (violates ADR-030 INV-030-5)
5. **Never silently catch claim sync/clear errors** (violates ADR-030 INV-030-2)

### ADR-030 RPC Change

`set_rls_context_from_staff()` now `RETURNS TABLE(actor_id uuid, casino_id uuid, staff_role staff_role)`. Middleware consumes this return value as the single source of truth for `ctx.rlsContext` (ADR-030 INV-030-1).

---

## Over-Engineering Guardrail

**Document**: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`

### Golden Path Checklist

- [ ] Single authoritative mutator (one service writes its state)
- [ ] Database-level idempotency (UNIQUE constraint, not code)
- [ ] Direct call orchestration (no event bus with 1 consumer)
- [ ] Minimal infra (no Redis/Queue without measured need)

### Red Flags (Stop if 2+ apply)

- Adding abstraction with one consumer?
- New infra "for future readiness"?
- Duplicating idempotency in code + DB?
- >150 LOC module with no measured problem?

---

## Surface Classification & Metric Provenance (ADR-041)

**Document**: `docs/70-governance/SURFACE_CLASSIFICATION_STANDARD.md` v1.0.0
**Matrix**: `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` v2.0.0

### EXEC-SPEC Surface Compliance (Hard Rejection Gate)

If an EXEC-SPEC builds a **new UI surface**, it MUST include all 4 mandatory Surface Classification fields (§5):

1. **Rendering Delivery** — RSC Prefetch + Hydration | Client Shell | Hybrid (cite §4 Q1 measurable criteria)
2. **Data Aggregation** — BFF RPC | BFF Summary | Simple Query | Client-side Fetch (cite §4 Q2 measurable criteria)
3. **Rejected Patterns** — at least 1 rejected alternative per axis with clause citation
4. **Metric Provenance** — every truth-bearing metric cited from Metric Provenance Matrix with Truth ID + truth class + freshness

If ANY field is missing, the EXEC-SPEC is non-compliant and must be returned for amendment.

### Metric Provenance Rules

- Existing metrics: MEAS-001 through MEAS-012 (see matrix for truth class, freshness, source tables)
- New metrics: Require governed matrix amendment (new MEAS row per §5.1, next available: MEAS-013)
- All source tables must be SRM-registered
- Components display trust metadata but MUST NOT recompute trust

### Exemplar Declarations

| Surface | Declaration Path |
|---------|-----------------|
| Measurement Reports (Slice 1) | `docs/70-governance/examples/SLICE-1-MEASUREMENT-UI-DECLARATION.md` |
| Shift Dashboard V3 (Slice 2) | `docs/70-governance/examples/SLICE-2-SHIFT-DASHBOARD-DECLARATION.md` |

### Audit Template

For retroactive surface certification (Slice 3+): `docs/70-governance/audits/GOVERNANCE-AUDIT-TEMPLATE.md`

---

## Code Quality Gates

| Gate | Command | Required For |
|------|---------|--------------|
| Type check | `npm run type-check` | All TypeScript changes |
| Lint | `npm run lint` | All code changes |
| Build | `npm run build` | Pre-merge validation |
| Schema | `npm run db:types` | Post-migration |
| Tests | `npm test {path}` | Feature completion |
