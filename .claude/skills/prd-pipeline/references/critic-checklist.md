# EXECUTION-SPEC Critic Checklist

> Quality criteria for EXECUTION-SPEC validation before execution.

## Structural Validation

- [ ] All workstreams have unique IDs (WS1, WS2, ...)
- [ ] Dependencies form a DAG (no circular dependencies)
- [ ] Each workstream has explicit outputs defined
- [ ] Execution phases correctly sequence dependencies
- [ ] YAML frontmatter parses without errors

## Domain Compliance

- [ ] Bounded context ownership matches SRM entries
- [ ] Workstream types match executor capabilities (see executor-registry.md)
- [ ] Gate types align with workstream output types
- [ ] No cross-context violations in workstream scope

## Historical Pattern Checks

- [ ] No anti-patterns from documented failures
- [ ] Executor assignments align with historical success rates
- [ ] Scope complexity aligns with similar successful PRDs
- [ ] Common failure patterns from similar workstreams addressed

## Complexity Guards

- [ ] Max 8 workstreams per PRD
- [ ] Max 4 execution phases
- [ ] Each workstream has testable DoD criteria
- [ ] No workstream depends on more than 3 predecessors

## Critic Scoring

| Category | Weight | Score (0-1) |
|----------|--------|-------------|
| Structural | 30% | |
| Domain Compliance | 30% | |
| Historical Patterns | 20% | |
| Complexity | 20% | |
| **Total** | 100% | |

**Threshold**: Score >= 0.7 to proceed without refinement

---

## Validation Protocol

### Pre-Generation Check

Before generating an EXECUTION-SPEC, verify:

1. **PRD Completeness**
   - PRD has valid YAML frontmatter
   - Definition of Done section exists
   - Bounded context is identified

2. **SRM Alignment**
   - All mentioned services exist in SRM
   - Service ownership is clear
   - No ambiguous cross-context operations

### Post-Generation Validation

After generating an EXECUTION-SPEC, run:

```bash
uv run .claude/skills/prd-pipeline/scripts/validate-execution-spec.py \
    --spec docs/25-api-data/EXEC-SPEC-{NNN}.md
```

### Failure Handling

If validation fails:

1. **Structural failures**: Fix immediately (syntax, missing fields)
2. **Domain failures**: Consult SRM, may need architect review
3. **Historical failures**: Query past executions for similar issues
4. **Complexity failures**: Split into multiple PRDs or phases

---

## Memory Integration

### Query Historical Patterns

Before execution, query past outcomes:

```bash
uv run .claude/skills/prd-pipeline/scripts/query-learnings.py \
    --domain {bounded_context} \
    --limit 5
```

### Record Critic Findings

After validation, record quality metrics:

```python
from lib.memori import create_memori_client
from lib.memori.pipeline_context import PipelineContext

memori = create_memori_client("skill:prd-pipeline")
memori.enable()
context = PipelineContext(memori)

context.record_exec_spec_quality(
    prd_id="PRD-XXX",
    workstream_count=6,
    phase_count=4,
    critic_issues_found=2,
    refinement_iterations=1,
    validation_passed=True,
    issues_by_category={"structural": 0, "domain": 1, "historical": 1, "complexity": 0}
)
```

---

## Common Failure Patterns

### Structural

| Pattern | Description | Fix |
|---------|-------------|-----|
| `circular-dep` | WS depends on itself transitively | Reorder or split workstreams |
| `missing-output` | WS has no defined output artifacts | Add explicit output list |
| `orphan-ws` | WS not connected to any phase | Connect or remove |

### Domain

| Pattern | Description | Fix |
|---------|-------------|-----|
| `srm-mismatch` | Service not in SRM | Add to SRM or use correct service |
| `cross-context` | WS touches multiple contexts | Split into context-specific WS |
| `executor-mismatch` | Wrong executor for workstream type | Update executor assignment |

### Historical

| Pattern | Description | Fix |
|---------|-------------|-----|
| `repeat-failure` | Similar WS failed before | Review past failure, apply fix |
| `low-confidence-executor` | Executor has <70% success rate | Add extra validation or use alternative |

### Complexity

| Pattern | Description | Fix |
|---------|-------------|-----|
| `too-many-ws` | >8 workstreams | Split PRD |
| `deep-deps` | WS has >3 dependencies | Flatten or parallelize |
| `monolithic-phase` | >4 WS in single phase | Add intermediate phases |

---

## References

- **Executor Registry**: `.claude/skills/prd-pipeline/references/executor-registry.md`
- **Gate Protocol**: `.claude/skills/prd-pipeline/references/gate-protocol.md`
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Validation Script**: `.claude/skills/prd-pipeline/scripts/validate-execution-spec.py`
