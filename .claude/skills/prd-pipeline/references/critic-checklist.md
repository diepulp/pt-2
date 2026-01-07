# EXECUTION-SPEC Critic Checklist

> Quality criteria for EXECUTION-SPEC validation before execution.
> Validation is performed by `scripts/validate-execution-spec.py` which checks both structural and governance rules.

## Structural Validation

Automated checks in `validate-execution-spec.py`:

- [ ] YAML frontmatter parses without errors
- [ ] All workstreams have unique IDs (WS1, WS2, ...)
- [ ] Dependencies form a DAG (no circular dependencies)
- [ ] Each workstream has required fields (name, executor, executor_type, depends_on, outputs, gate)
- [ ] Execution phases correctly sequence dependencies
- [ ] All workstreams referenced in execution_phases
- [ ] Executor names are valid skills (task agents deprecated)
- [ ] Gate types are valid (schema-validation, type-check, lint, test-pass, build)

## Governance Validation

Automated checks against `context/*.context.md` files:

### SRM Ownership (architecture.context.md)

- [ ] No modifications to tables owned by other services
- [ ] casino_settings only modified by CasinoService
- [ ] Cross-context data access via published DTOs/views only

### Test Standards (governance.context.md, quality.context.md)

- [ ] Test files in `__tests__/services/{domain}/` (NOT `services/{domain}/__tests__/`)
- [ ] Integration tests use `*.int.test.ts` naming (NOT `*.integration.test.ts`)
- [ ] Coverage target ≥90% for service modules
- [ ] Lint gate uses `max-warnings=0`

### Migration Standards (governance.context.md)

- [ ] RLS policies in same migration as schema changes (not separate)
- [ ] Schema verification gate present for schema changes

### Consistency Checks

- [ ] No DELETE + "soft delete via status" contradiction
- [ ] Enum types consistent (not mixed with text)

## Complexity Guards

Manual review (not automated):

- [ ] Max 8 workstreams per PRD
- [ ] Max 4 execution phases
- [ ] Each workstream has testable DoD criteria
- [ ] No workstream depends on more than 3 predecessors

## Validation Protocol

### Pre-Generation

Before generating an EXECUTION-SPEC:

1. Load context files:
   - `context/architecture.context.md`
   - `context/governance.context.md`
   - `context/quality.context.md`

2. Verify PRD alignment:
   - PRD has valid YAML frontmatter
   - Definition of Done section exists
   - Bounded context identified

3. Check SRM ownership:
   - Identify tables mentioned in PRD
   - Verify owning service alignment

### Post-Generation

After generating an EXECUTION-SPEC:

```bash
python .claude/skills/prd-pipeline/scripts/validate-execution-spec.py \
    docs/20-architecture/specs/{PRD-ID}/EXECUTION-SPEC-{PRD-ID}.md
```

The script returns:
- **STRUCTURAL ERRORS**: YAML syntax, invalid executors, circular deps
- **GOVERNANCE ERRORS**: SRM violations, test location violations, gate issues
- **WARNINGS**: Separate RLS migration, coverage targets, DELETE policy

### Failure Handling

| Error Type | Resolution |
|------------|------------|
| Structural | Fix immediately (syntax, missing fields) |
| SRM Violation | Coordinate with owning service or reassign ownership |
| Test Location | Move test files to `__tests__/services/{domain}/` |
| Migration Split | Bundle RLS policies with schema migration |
| Gate Issues | Update gate commands to meet standards |

## Common Failure Patterns

### Structural

| Pattern | Description | Fix |
|---------|-------------|-----|
| `circular-dep` | WS depends on itself transitively | Reorder or split workstreams |
| `missing-output` | WS has no defined output artifacts | Add explicit output list |
| `orphan-ws` | WS not connected to any phase | Connect or remove |
| `invalid-executor` | Executor not in valid skills list | Use registered skill name |

### Governance

| Pattern | Description | Fix |
|---------|-------------|-----|
| `srm-violation` | Modifying table owned by another service | Coordinate or reassign |
| `test-location-wrong` | Tests in service folder | Move to `__tests__/services/` |
| `test-naming-wrong` | Uses `.integration.test.ts` | Rename to `.int.test.ts` |
| `coverage-low` | Target below 90% | Update to ≥90% |
| `lint-warnings-ok` | Gate allows warnings | Set `max-warnings=0` |
| `separate-rls` | RLS in separate migration | Bundle with schema |
| `delete-contradiction` | DELETE + soft delete | Clarify policy |

## References

- **Validation Script**: `.claude/skills/prd-pipeline/scripts/validate-execution-spec.py`
- **SRM Ownership**: `context/architecture.context.md`
- **Test Standards**: `context/governance.context.md`, `context/quality.context.md`
- **Full SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
