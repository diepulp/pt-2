---
name: rls-expert
description: PT-2 Row-Level Security (RLS) specialist for implementing, validating, and troubleshooting casino-scoped RLS policies. This skill should be used when creating new database tables, writing RLS policies, implementing SECURITY DEFINER RPCs, troubleshooting multi-tenant data access, or auditing existing policies for ADR-015 compliance. Covers hybrid context injection (Pattern C), JWT fallback strategies, connection pooling compatibility, and role-based access control patterns. (project)
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, TodoWrite
---

# RLS Expert

PT-2 Row-Level Security specialist for implementing secure, connection-pooling-compatible multi-tenant data access.

## When to Use This Skill

Invoke this skill when:
- Creating new database tables that need RLS policies
- Implementing or updating RLS policies for existing tables
- Writing SECURITY DEFINER RPCs that validate casino scope
- Troubleshooting RLS policy failures or cross-tenant data leakage
- Auditing policies for ADR-015 connection pooling compliance
- Implementing role-gated write access (cashier, pit_boss, admin)
- Setting up append-only ledger policies (finance, loyalty, MTL)

## Core Principles

1. **Casino scope is non-negotiable** - Every casino-scoped table MUST enforce `casino_id` in RLS policies
2. **Hybrid Pattern C is canonical** - All policies use transaction context with JWT fallback
3. **Connection pooling safe** - Use `set_rls_context()` RPC, never legacy SET LOCAL loops
4. **Dealers are excluded** - Dealers have `user_id = NULL` and ZERO application permissions
5. **No service keys in runtime** - All operations use anon key + user authentication

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
| Policy Templates | `references/policy-templates.md` | Creating new RLS policies |
| RPC Patterns | `references/rpc-patterns.md` | Writing SECURITY DEFINER functions |
| RBAC Matrix | `references/rbac-capabilities.md` | Determining role permissions |
| Verification | `references/verification-checklist.md` | Auditing/testing policies |
| ADR-015 Details | `references/adr015-connection-pooling.md` | Understanding pooling issues |

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

- **SEC-001**: `docs/30-security/SEC-001-rls-policy-matrix.md` - Policy templates
- **SEC-002**: `docs/30-security/SEC-002-casino-scoped-security-model.md` - Security boundaries
- **SEC-003**: `docs/30-security/SEC-003-rbac-matrix.md` - RBAC matrix
- **SEC-005**: `docs/30-security/SEC-005-role-taxonomy.md` - Role definitions
- **ADR-015**: `docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md` - Pooling strategy
- **Implementation**: `lib/supabase/rls-context.ts` - TypeScript context injection

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
