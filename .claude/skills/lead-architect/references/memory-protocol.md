# Memory Recording Protocol

This skill can track execution outcomes to build institutional architectural knowledge and help avoid repeated mistakes.

## Memory Activation

Memory is activated when this skill is invoked via the `Skill` tool.

**How activation works:**
1. `PreToolUse` hook detects `Skill` tool invocation
2. `skill-init-memori.sh` extracts skill name and initializes namespace
3. Memori client is enabled for `skill_lead_architect` namespace
4. Subsequent memory operations use the skill namespace

**Activation points:**
- Skill invocation via `Skill` tool - auto-enabled via hook
- Session start/end - captured by session hooks
- File modifications (ADRs, SRM updates, API specs) - captured by tool hooks

## Recording Points

Use the Memori engine to record semantic architectural knowledge at these points:

### After Architectural Decisions

Record major architectural choices with rationale:

```python
from lib.memori import create_memori_client, ArchitectContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
context = ArchitectContext(memori)

context.record_architectural_decision(
    decision="Use Pattern A (Contract-First) for LoyaltyService",
    rationale="Business logic complexity requires explicit DTOs",
    alternatives_considered=[
        "Pattern B (Canonical): Rejected - too tightly coupled to schema",
        "Pattern C (Hybrid): Rejected - unnecessary complexity for this domain"
    ],
    affected_services=["LoyaltyService"],
    affected_docs=[
        "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md",
        "docs/80-adrs/ADR-047-loyalty-service-pattern.md"
    ],
    pattern_used="Pattern A (Contract-First)",
    domain="Loyalty",
    complexity_level="medium"
)
```

### After Documentation Validation

Record inconsistencies found and how they were resolved:

```python
context.record_documentation_regression(
    regression_type="schema_drift",
    affected_docs=[
        "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md",
        "types/database.types.ts"
    ],
    description="SRM listed loyalty_transactions table, but schema had loyalty_ledger",
    resolution="Updated SRM to use loyalty_ledger (matches deployed schema)",
    rectification_approach="aligned_with_implementation",
    lessons_learned=[
        "Verify SRM against types/database.types.ts",
        "Loyalty domain uses ledger pattern, not transactions"
    ]
)
```

### After Pattern Selection

Record which patterns were chosen for which scenarios:

```python
context.record_pattern_selection(
    feature="Player tier calculation",
    pattern_chosen="RLS with SET LOCAL user metadata",
    rationale="Multi-tenant with row-level isolation required",
    domain="Loyalty",
    alternatives_considered=[
        "Service-level filtering: Rejected - RLS more secure",
        "Separate schemas: Rejected - operational complexity"
    ],
    success_outcome="approved"  # or "needs_revision", "rejected"
)
```

### After Tech Debt Evaluation

Record technical debt assessments:

```python
context.record_tech_debt_assessment(
    area="MTL Services",
    debt_category="bounded_context_violations",
    severity="high",
    impact="Services calling across bounded contexts without DTOs",
    remediation_strategy="Introduce API contracts between MTL and Player contexts",
    estimated_effort="2 weeks",
    priority="P1"
)
```

### After Compliance/Security Design

Record security and compliance architectural decisions:

```python
context.record_compliance_design(
    feature="Player data access audit log",
    compliance_requirements=["GDPR Article 15", "SOC2 CC6.1"],
    rls_policies=["Players can view own data only"],
    rbac_roles=["player", "admin", "auditor"],
    audit_log_location="audit.player_data_access",
    retention_period="7 years",
    encryption_required=True
)
```

## Query Past Architectural Work

Before starting architectural work, query Memori for relevant past decisions:

```python
# Check if similar architecture was designed before
past_decisions = context.query_past_decisions(
    query="loyalty service architecture",
    domain="Loyalty",
    pattern="Pattern A",
    limit=5
)

if past_decisions:
    print("\n Past architectural decisions:\n")
    for decision in past_decisions:
        metadata = decision.get('metadata', {})
        print(f"  - Decision: {metadata.get('decision', 'N/A')}")
        print(f"    Pattern: {metadata.get('pattern_used', 'N/A')}")
        print(f"    Outcome: {metadata.get('success_outcome', 'N/A')}")
        print(f"    Rationale: {metadata.get('rationale', 'N/A')}")
        print()

# Check for recurring documentation regressions
past_regressions = context.query_past_regressions(
    regression_type="schema_drift",
    limit=10
)

if past_regressions:
    print("\n Historical Documentation Issues:\n")
    for regression in past_regressions:
        metadata = regression.get('metadata', {})
        print(f"  - {metadata.get('description', 'N/A')}")
        print(f"    Resolution: {metadata.get('resolution', 'N/A')}")
```

## When to Record

Consider recording when:
- Making architectural decisions (pattern selection, service boundaries)
- Detecting documentation inconsistencies (SRM vs schema, ADR conflicts)
- Evaluating technical debt
- Designing compliance/security architectures
- User provides feedback on architectural proposals
- Learning new patterns or anti-patterns

## Skill Execution Tracking

Record complete execution outcomes using `SkillContext`:

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:lead-architect")
memori.enable()
skill_context = SkillContext(memori)

# After completing architectural work, record the outcome
skill_context.record_skill_execution(
    skill_name="lead-architect",
    task="Design LoyaltyService architecture",
    outcome="success",  # or "failure", "partial"
    pattern_used="Pattern A (Contract-First)",
    files_created=[
        "docs/80-adrs/ADR-047-loyalty-pattern.md",
        "docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md"
    ],
    issues_encountered=[
        "SRM had stale loyalty_transactions reference (updated)"
    ],
    lessons_learned=[
        "Verify SRM against types/database.types.ts",
        "Loyalty domain uses ledger pattern, not transactions"
    ],
    user_satisfaction="approved"  # or "needs_revision", "rejected"
)
```

## Analytics: Learn from Architectural History

Query architectural patterns and their success rates:

```python
# Which pattern has highest success rate for complex domains?
pattern_a_outcomes = context.query_past_decisions(
    query="Pattern A architectural decisions",
    pattern="Pattern A",
    limit=50
)

if pattern_a_outcomes:
    success_count = sum(
        1 for o in pattern_a_outcomes
        if o.get('metadata', {}).get('success_outcome') == 'approved'
    )
    success_rate = (success_count / len(pattern_a_outcomes)) * 100
    print(f"Pattern A success rate: {success_rate:.1f}%")

# What are the most common documentation regressions?
regressions = context.query_past_regressions(limit=100)

if regressions:
    from collections import Counter
    regression_types = Counter(
        r.get('metadata', {}).get('regression_type', 'unknown')
        for r in regressions
    )
    print(f"Top regressions: {regression_types.most_common(3)}")
```

## Fallback Mode

If Memori is unavailable (hooks failed), the skill continues normally:

```python
from lib.memori import create_memori_client, ArchitectContext

try:
    memori = create_memori_client("skill:lead-architect")
    memori.enable()
    context = ArchitectContext(memori)
    if not memori.enabled:
        raise Exception("Memori unavailable")
except Exception as e:
    print(f"Memori unavailable ({e}), continuing without memory recording")
    context = None  # Continue normally - SDLC taxonomy and reference docs still available
```

## Namespace Reference

The skill uses the namespace `skill_lead_architect` in the database. This maps from:
- Client initialization: `create_memori_client("skill:lead-architect")`
- Database user_id: `skill_lead_architect`

| Context Class | Purpose |
|---------------|---------|
| `ArchitectContext` | Architectural decisions, regressions, patterns, tech debt, compliance |
| `SkillContext` | Skill execution tracking (outcomes, files created, lessons) |
