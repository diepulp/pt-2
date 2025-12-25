---
name: rls-expert
description: PT-2 Row-Level Security (RLS) specialist for implementing, validating, and troubleshooting casino-scoped RLS policies. This skill should be used when creating new database tables, writing RLS policies, implementing SECURITY DEFINER RPCs, troubleshooting multi-tenant data access, or auditing existing policies for ADR-015/ADR-020 compliance. Covers hybrid context injection (Pattern C), JWT fallback strategies, connection pooling compatibility, and role-based access control patterns. (project)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite
---

# RLS Expert

PT-2 Row-Level Security specialist for implementing secure, connection-pooling-compatible multi-tenant data access.

## Multi-Tenancy Model (ADR-023)

**Official Stance: Pool Primary; Silo Escape Hatch**

| Model | Status | RLS Implication |
|-------|--------|-----------------|
| **Pool** | Primary/Default | RLS is the PRIMARY isolation mechanism. All policies must enforce `casino_id` scope |
| **Silo** | Optional | Same RLS policies apply (defense in depth). Single-tenant project = additional isolation layer |

**Non-Negotiable Guardrails:**

1. **Casino-scoped ownership** — Every tenant-owned row carries `casino_id`; cross-casino joins forbidden
2. **Hybrid RLS mandatory** — Pattern C with session context + JWT fallback
3. **SECURITY DEFINER governance** — RPCs must validate `p_casino_id` against context (ADR-018)
4. **Append-only ledgers** — Finance/loyalty/compliance: denial policies for updates/deletes

**Reference:** `docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md`

## Current Strategy (ADR-020)

**Track A (Hybrid) is the MVP architecture.** Track B (JWT-only) is the correct end-state, gated on prerequisites.

| What | Decision |
|------|----------|
| MVP Pattern | Pattern C (Hybrid): `COALESCE(current_setting, jwt)` |
| Context Injection | `set_rls_context()` RPC per request |
| Auth Guard | `auth.uid() IS NOT NULL` on all policies |
| Track B Migration | Not scheduled - requires real users, stable RLS, automation |

**When ambiguity arises:** Consult `docs/20-architecture/AUTH_RLS_EXTERNAL_REFERENCE_OVERVIEW.md` for external validation from AWS, Supabase, Crunchy Data.

## When to Use This Skill

Invoke this skill when:
- Creating new database tables that need RLS policies
- Implementing or updating RLS policies for existing tables
- Writing SECURITY DEFINER RPCs that validate casino scope
- Troubleshooting RLS policy failures or cross-tenant data leakage
- Auditing policies for ADR-015/ADR-020 compliance
- Implementing role-gated write access (cashier, pit_boss, admin)
- Setting up append-only ledger policies (finance, loyalty, MTL)

## Core Principles

1. **Casino scope is non-negotiable** - Every casino-scoped table MUST enforce `casino_id` in RLS policies
2. **Pattern C (Hybrid) is canonical for MVP** - Transaction context with JWT fallback (ADR-020)
3. **Connection pooling safe** - Use `set_rls_context()` RPC, never legacy SET LOCAL loops
4. **Dealers are excluded** - Dealers have `user_id = NULL` and ZERO application permissions
5. **No service keys in runtime** - All operations use anon key + user authentication
6. **Don't rewrite RLS again** - Fix issues incrementally, don't wholesale replace 116 policies

## Decision Tree: Which Pattern to Use

```
New RLS policy needed?
│
├─► Is it a NEW table?
│   └─► Use Pattern C (Hybrid) - see references/policy-templates.md
│
├─► Is it an EXISTING table?
│   ├─► Does current policy use SET LOCAL only?
│   │   └─► MIGRATE to Pattern C (add JWT fallback)
│   └─► Does it already have JWT fallback?
│       └─► Verify COALESCE/NULLIF pattern is correct
│
├─► Is it a SECURITY DEFINER RPC?
│   └─► Add casino scope validation - see references/rpc-patterns.md
│
└─► Is it an append-only ledger (finance/loyalty/MTL)?
    └─► Use Template 3 with no_updates + no_deletes policies
```

## Quick Reference: Pattern C (Hybrid)

The canonical RLS pattern for PT-2 (ADR-015 compliant):

```sql
-- casino_id resolution (use in all policies)
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)

-- actor_id resolution (for actor identity checks)
COALESCE(
  NULLIF(current_setting('app.actor_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
)

-- staff_role resolution (for role-gated access)
COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (auth.jwt() -> 'app_metadata' ->> 'staff_role')
)
```

**Why NULLIF?** Empty strings from unset `current_setting()` must become NULL for COALESCE to work correctly.

## Staff Roles Quick Reference

| Role | Authentication | Capabilities |
|------|---------------|--------------|
| `admin` | REQUIRED | Full read/write on all casino-scoped data |
| `pit_boss` | REQUIRED | Operations: tables, visits, rating slips, limited finance (buy-ins only) |
| `cashier` | REQUIRED | Finance: full transaction access via RPC |
| `dealer` | PROHIBITED | ZERO permissions (scheduling metadata only) |

**Pit Boss Finance Constraints:**
- `direction = 'in'` only (buy-ins, not cash-outs)
- `tender_type IN ('cash', 'chips')` (no markers)
- `visit_id` required (linked to active session)

## Anti-Patterns to Avoid

### DON'T: Legacy SET LOCAL Loop

```sql
-- WRONG: Fails with connection pooling
FOR stmt IN array_of_statements LOOP
  EXECUTE 'SET LOCAL ' || stmt;
END LOOP;
```

### DON'T: JWT-Only Without Fallback

```sql
-- WRONG: Stale data, no transaction context
CREATE POLICY "bad" ON table FOR SELECT USING (
  casino_id::text = auth.jwt() ->> 'casino_id'
);
```

### DON'T: Complex OR Trees

```sql
-- WRONG: Hard to audit, prone to logic errors
CREATE POLICY "bad" ON table FOR SELECT USING (
  casino_id = ... OR role = 'admin' OR permissions @> '["global"]'
);
```

### DON'T: Trust Caller-Provided casino_id in RPCs

```sql
-- WRONG: Missing context validation
CREATE FUNCTION rpc_mutation(p_casino_id uuid) RETURNS void AS $$
BEGIN
  INSERT INTO table (casino_id) VALUES (p_casino_id); -- DANGEROUS!
END;
$$;
```

## Context Injection (TypeScript)

```typescript
// Server Action pattern
export async function myAction(input: Input) {
  const supabase = await createClient();

  return withServerAction(
    async () => {
      // RLS context automatically injected via set_rls_context() RPC
      const { data, error } = await supabase
        .from('table')
        .select('*');
      // ...
    },
    { supabase, endpoint: 'service.action', action: 'table.read' }
  );
}
```

## Detailed References

For comprehensive documentation, load the appropriate reference file:

| Topic | Reference File | When to Load |
|-------|---------------|--------------|
| **Strategy Decision** | `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md` | Understanding Track A vs Track B decision |
| **External Validation** | `docs/20-architecture/AUTH_RLS_EXTERNAL_REFERENCE_OVERVIEW.md` | When ambiguity arises about patterns |
| Policy Templates | `references/policy-templates.md` | Creating new RLS policies |
| RPC Patterns | `references/rpc-patterns.md` | Writing SECURITY DEFINER functions |
| RBAC Matrix | `references/rbac-capabilities.md` | Determining role permissions |
| Verification | `references/verification-checklist.md` | Auditing/testing policies |
| ADR-015 Details | `references/adr015-connection-pooling.md` | Understanding pooling technical details |

**Search patterns for detailed docs:**
```bash
# Policy templates and examples
grep -r "CREATE POLICY" docs/30-security/

# ADR-015 patterns
grep -r "set_rls_context\|Pattern C" docs/80-adrs/

# Role capabilities
grep -r "staff_role" docs/30-security/SEC-005*
```

## Verification Workflow

After implementing RLS policies:

1. **Schema check**: Verify `casino_id uuid NOT NULL` column exists
2. **RLS enabled**: `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY`
3. **Policy patterns**: Confirm hybrid COALESCE pattern with JWT fallback
4. **Role exclusions**: Dealers automatically excluded via `auth.uid()` check
5. **Manual test**: Use `set_rls_context()` RPC in SQL console
6. **Cross-tenant test**: Verify cannot access other casino's data

```sql
-- Quick verification test
SELECT set_rls_context(
  p_actor_id := 'staff-uuid',
  p_casino_id := 'casino-uuid',
  p_staff_role := 'pit_boss'
);

-- Should return only casino-scoped data
SELECT count(*) FROM your_table;

-- Should FAIL (cross-casino access)
INSERT INTO your_table (casino_id, ...) VALUES ('other-casino-uuid', ...);
```

## Canonical Documentation References

- **ADR-023**: `docs/80-adrs/ADR-023-multi-tenancy-storage-model-selection.md` - **Pool primary, Silo escape hatch** multi-tenancy model
- **External Validation**: `docs/20-architecture/AUTH_RLS_EXTERNAL_REFERENCE_OVERVIEW.md` - **START HERE when ambiguity arises**. Battle-tested patterns from AWS, Supabase, Crunchy Data validating PT-2's approach is not homebrew.
- **ADR-020**: `docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md` - Track A (hybrid) for MVP, Track B (JWT-only) gated on prerequisites
- **ADR-015**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Pooling strategy technical details
- **SEC-001**: `docs/30-security/SEC-001-rls-policy-matrix.md` - Policy templates
- **SEC-002**: `docs/30-security/SEC-002-casino-scoped-security-model.md` - Security boundaries (updated with ADR-023)
- **SEC-003**: `docs/30-security/SEC-003-rbac-matrix.md` - RBAC matrix
- **SEC-005**: `docs/30-security/SEC-005-role-taxonomy.md` - Role definitions
- **ADR-018**: `docs/80-adrs/ADR-018-sec006-security-hardening.md` - SEC-006 formalization
- **OPS-002**: `docs/50-ops/OPS-002-silo-provisioning-playbook.md` - Silo deployment operations
- **Implementation**: `lib/supabase/rls-context.ts` - TypeScript context injection

## Security Patches Reference

### SEC-006: RLS Hardening (2025-12-12)

**Migration**: `supabase/migrations/20251212080915_sec006_rls_hardening.sql`

Remediated P0/P1 gaps from RLS strategy audit:

| Section | What Was Fixed |
|---------|----------------|
| **FloorLayoutService RLS** | Enabled RLS + Pattern C policies for 5 tables (`floor_layout`, `floor_layout_version`, `floor_pit`, `floor_table_slot`, `floor_layout_activation`) |
| **RPC Context Validation** | Added Template 5 validation to 7 SECURITY DEFINER functions |
| **Append-Only Ledgers** | Added `no_updates`/`no_deletes` denial policies to 4 ledger tables |

**Hardened RPCs (SEC-006)**:
- `rpc_create_floor_layout`
- `rpc_activate_floor_layout`
- `rpc_log_table_inventory_snapshot`
- `rpc_request_table_fill`
- `rpc_request_table_credit`
- `rpc_log_table_drop`
- `rpc_issue_mid_session_reward`

**Ledgers with denial policies**:
- `loyalty_ledger`
- `mtl_entry`
- `finance_outbox`
- `loyalty_outbox`

### SEC-007: Rating Slip RPC Hardening (2025-12-12)

**Migration**: `supabase/migrations/20251212081000_sec007_rating_slip_rpc_hardening.sql`

Post-SEC-006 audit discovered additional SECURITY DEFINER RPCs without context validation:

**Hardened RPCs (SEC-007)**:
- `rpc_update_table_status` - Table status transitions
- `rpc_start_rating_slip` - Create new rating slip (also dropped legacy 7-param version)
- `rpc_pause_rating_slip` - Pause rating slip
- `rpc_resume_rating_slip` - Resume paused rating slip
- `rpc_close_rating_slip` - Close rating slip with duration

**Status after SEC-006 + SEC-007**: 14/14 SECURITY DEFINER RPCs have Template 5 context validation.

### Template 5 Context Validation Pattern

All hardened RPCs now include this validation block:

```sql
-- ═══════════════════════════════════════════════════════════════════════
-- CASINO SCOPE VALIDATION (SEC-001 Template 5, SEC-00X)
-- ═══════════════════════════════════════════════════════════════════════
v_context_casino_id := COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
);

IF v_context_casino_id IS NULL THEN
  RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
END IF;

IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
  RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
    p_casino_id, v_context_casino_id;
END IF;
-- ═══════════════════════════════════════════════════════════════════════
```

### Key Learnings from SEC-006/SEC-007

1. **COMMENT ON FUNCTION** requires full signature when multiple overloads exist
2. **Derived casino scope** (e.g., `floor_pit` → `floor_layout_version` → `floor_layout`) uses EXISTS subqueries
3. **Denial policies** use pattern `auth.uid() IS NOT NULL AND false` for consistent behavior
4. **Legacy function cleanup**: DROP old signatures before CREATE OR REPLACE when param count changes

## Memory Recording Protocol

This skill tracks execution outcomes to build RLS pattern knowledge.

### Record After Policy Implementation

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:rls-expert")
memori.enable()
context = SkillContext(memori)

context.record_skill_execution(
    skill_name="rls-expert",
    task="Implemented RLS policies for new_table",
    outcome="success",
    pattern_used="Pattern C (Hybrid) with JWT fallback",
    validation_results={
        "rls_enabled": True,
        "hybrid_pattern_correct": True,
        "casino_scope_enforced": True,
        "cross_tenant_test_passed": True
    },
    files_created=["supabase/migrations/xxx_new_table_rls.sql"],
    issues_encountered=[],
    lessons_learned=["Include NULLIF for empty string handling"]
)
```

### Query Past Patterns

```python
past_patterns = memori.search_learnings(
    query="RLS policy implementation",
    tags=["rls", "security", "pattern-c"],
    category="skills",
    limit=5
)
```

### Namespace Reference

- Client: `create_memori_client("skill:rls-expert")`
- Database user_id: `skill_rls_expert`
