# Skill Memori Integration Strategy

**Status**: Design Phase
**Created**: 2025-11-22
**Purpose**: Tailored approach to make PT-2 skills Memori-aware beyond chatmode functionality

---

## Executive Summary

Skills have unique characteristics that require a different Memori integration approach than chatmodes:

| Feature | Chatmodes | Skills | Integration Opportunity |
|---------|-----------|--------|------------------------|
| **Execution Model** | Continuous conversation | Single-task workflows | Record workflow outcomes |
| **Validation** | Manual review | Automated scripts | Enhance scripts with Memori |
| **Resources** | Instructions only | Scripts + references + assets | Script-level recording |
| **Memory Scope** | Role-based decisions | Task execution outcomes | Build success pattern database |

---

## Three-Layer Integration Architecture

### Layer 1: Skill Execution Memory 🎯

**Purpose**: Record complete skill execution outcomes for pattern learning

**Namespace**: `skill:{skill-name}`
**Examples**:
- `skill:backend-service-builder` - Service creation patterns
- `skill:frontend-design` - UI/UX aesthetic choices
- `skill:skill-creator` - Effective skill designs

**What to Record**:
```python
# Skill execution outcome
context.record_skill_execution(
    skill_name="backend-service-builder",
    task="Create LoyaltyService with Pattern A",
    outcome="success",  # or "failure", "partial"
    pattern_used="Pattern A (Contract-First)",
    validation_results={
        "structure_valid": True,
        "doc_consistency": True,
        "cross_context_violations": 0,
        "anti_patterns_detected": 0
    },
    files_created=[
        "services/loyalty/keys.ts",
        "services/loyalty/loyalty.ts",
        "services/loyalty/loyalty.test.ts",
        "services/loyalty/README.md"
    ],
    issues_encountered=[],
    duration_seconds=180,
    user_satisfaction="approved"  # or "needs_revision", "rejected"
)
```

**Benefits**:
- ✅ Track skill success rates over time
- ✅ Identify failure patterns ("Pattern B fails for complex domains")
- ✅ Build best practices database ("Services with >5 operations use Pattern A")
- ✅ Estimate task duration based on historical data

---

### Layer 2: Validation Script Enhancement 🔍

**Purpose**: Make validation scripts Memori-aware for historical violation tracking

**Current State**:
```python
# validate_service_structure.py (current)
class ServiceValidator:
    def validate(self):
        self.check_no_class_services()        # Detects violations
        self.check_no_returntype_inference()  # Detects anti-patterns
        self.check_supabase_typing()          # Detects type errors
        self.print_results()                   # Prints to console
        # ❌ No historical tracking
        # ❌ No pattern detection
        # ❌ No recurring issue identification
```

**Enhanced State**:
```python
# validate_service_structure.py (Memori-aware)
from lib.memori import create_memori_client, ValidationContext

class ServiceValidator:
    def __init__(self, service_path: str):
        self.service_path = Path(service_path)
        self.memori = create_memori_client("skill:backend-service-builder")
        self.context = ValidationContext(self.memori)

    def validate(self):
        # 1. Query past violations BEFORE validating
        past_violations = self.check_past_violations()

        # 2. Run validation checks
        self.check_no_class_services()
        self.check_no_returntype_inference()
        self.check_supabase_typing()

        # 3. Record findings to Memori
        self.record_validation_results()

        # 4. Suggest fixes based on historical resolutions
        self.suggest_fixes_from_history()

        self.print_results()

    def check_past_violations(self):
        """Query Memori for recurring issues in this service."""
        past_issues = self.memori.search_learnings(
            query=f"validation failures for {self.service_name}",
            namespace="skill:backend-service-builder",
            tags=["validation", self.service_name],
            limit=10
        )

        if past_issues:
            print(f"\n⚠️  Historical Context: {len(past_issues)} past validation issues found\n")
            for issue in past_issues:
                print(f"  - {issue['content']} (resolved: {issue['resolution']})")

        return past_issues

    def record_validation_results(self):
        """Record all findings to Memori for future reference."""
        for error in self.errors:
            self.context.record_validation_finding(
                service_name=self.service_name,
                finding_type="error",
                pattern_violated=self.extract_pattern(error),
                description=error,
                file_location=self.extract_file_location(error),
                severity="high"
            )

        for warning in self.warnings:
            self.context.record_validation_finding(
                service_name=self.service_name,
                finding_type="warning",
                pattern_violated=self.extract_pattern(warning),
                description=warning,
                file_location=self.extract_file_location(warning),
                severity="medium"
            )

    def suggest_fixes_from_history(self):
        """Query Memori for how similar violations were fixed."""
        if self.errors:
            for error in self.errors:
                pattern = self.extract_pattern(error)

                # Find past resolutions for this anti-pattern
                past_fixes = self.memori.search_learnings(
                    query=f"{pattern} resolution",
                    namespace="skill:backend-service-builder",
                    tags=["anti-pattern", "resolution"],
                    limit=3
                )

                if past_fixes:
                    print(f"\n💡 Suggested fix for '{pattern}':")
                    print(f"   Based on {len(past_fixes)} past resolutions:")
                    for fix in past_fixes:
                        print(f"   - {fix['resolution']}")
```

**Benefits**:
- ✅ Build violation history database ("ReturnType inference detected 12 times in 8 services")
- ✅ Auto-suggest fixes based on past resolutions
- ✅ Detect recurring patterns across services
- ✅ Identify high-risk areas ("MTL services violate bounded context 40% of time")

---

### Layer 3: Progressive Learning Protocol 📚

**Purpose**: Skills query past executions before starting, learn from outcomes

**Implementation**:

#### Before Skill Execution
```python
# In SKILL.md: Pre-execution context loading

## Before Starting

Before executing this skill, query Memori for relevant past executions:

```python
from lib.memori import create_memori_client

memori = create_memori_client("skill:backend-service-builder")

# Query past executions for similar tasks
past_executions = memori.search_learnings(
    query="create service for player-related domain",
    namespace="skill:backend-service-builder",
    tags=["service-creation", "player"],
    limit=5
)

if past_executions:
    print("\n📚 Learning from past executions:\n")
    for execution in past_executions:
        print(f"  - Task: {execution['task']}")
        print(f"    Pattern Used: {execution['pattern_used']}")
        print(f"    Outcome: {execution['outcome']}")
        print(f"    Issues: {execution['issues_encountered']}")
        print()

    # Adapt approach based on learnings
    recommended_pattern = determine_best_pattern(past_executions)
    print(f"💡 Recommendation: Use {recommended_pattern} based on past success rate\n")
```
```

#### After Skill Execution
```python
# Record complete execution outcome

context.record_skill_execution(
    skill_name="backend-service-builder",
    task="Create LoyaltyService",
    outcome="success",
    pattern_used="Pattern A",
    validation_results={...},
    files_created=[...],
    issues_encountered=[
        "Initially violated bounded context (fixed)",
        "README missing SRM reference (added)"
    ],
    duration_seconds=180,
    lessons_learned=[
        "Loyalty domain requires Pattern A (business logic complexity)",
        "SRM reference critical for cross-service coordination"
    ]
)
```

**Benefits**:
- ✅ "Last time we built a loyalty service, we violated bounded context - checking first..."
- ✅ "Frontend design pattern X failed 3 times, suggesting pattern Y instead..."
- ✅ Build institutional knowledge within skills
- ✅ Reduce repeated mistakes

---

## Implementation Phases

### Phase 1: Add Skill Memory Recording Protocol to SKILL.md Files

**Effort**: 2-3 hours
**Impact**: Medium (manual recording only, no automation)

Add "Memory Recording Protocol" section to each SKILL.md:

#### backend-service-builder/SKILL.md
```markdown
## Memory Recording Protocol 🧠

This skill automatically tracks execution outcomes to build pattern knowledge.

### After Service Creation

Record execution outcome:

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:backend-service-builder")
context = SkillContext(memori)

context.record_skill_execution(
    skill_name="backend-service-builder",
    task="Create {ServiceName}",
    outcome="success",  # or "failure", "partial"
    pattern_used="Pattern A/B/C",
    validation_results={
        "structure_valid": True,
        "doc_consistency": True,
        "cross_context_violations": 0
    },
    files_created=[...],
    issues_encountered=[],
    lessons_learned=[]
)
```

### Query Past Patterns

Before starting, check what worked before:

```python
past = memori.search_learnings(
    query="create service for loyalty domain",
    namespace="skill:backend-service-builder",
    tags=["service-creation"],
    limit=5
)
```
```

**Files to Update**:
- `.claude/skills/backend-service-builder/SKILL.md`
- `.claude/skills/frontend-design/SKILL.md`
- `.claude/skills/skill-creator/SKILL.md`

---

### Phase 2: Enhance Validation Scripts with Memori Integration

**Effort**: 4-6 hours
**Impact**: High (automated violation tracking, historical suggestions)

Enhance validation scripts to be Memori-aware:

#### Files to Enhance:

1. **validate_service_structure.py**
   - Add Memori client initialization
   - Record validation findings
   - Query past violations before validating
   - Suggest fixes based on historical resolutions

2. **check_doc_consistency.py**
   - Record documentation inconsistencies
   - Track recurring drift patterns
   - Build documentation quality metrics

**Template Enhancement**:
```python
# Add to each validation script

from lib.memori import create_memori_client, ValidationContext

class Validator:
    def __init__(self, target_path: str):
        self.target_path = target_path
        self.memori = create_memori_client("skill:{skill-name}")
        self.context = ValidationContext(self.memori)

    def validate(self):
        # 1. Check past violations
        past_issues = self.query_past_violations()

        # 2. Run validation
        findings = self.run_checks()

        # 3. Record findings to Memori
        self.record_findings(findings)

        # 4. Suggest fixes from history
        self.suggest_historical_fixes(findings)

        # 5. Print results
        self.print_results(findings)
```

---

### Phase 3: Create Skill Execution Wrapper Utilities

**Effort**: 3-4 hours
**Impact**: High (automates recording, provides analytics)

Create utilities in `lib/memori/skill_utils.py`:

```python
# lib/memori/skill_utils.py

from lib.memori import create_memori_client
from typing import Dict, List, Any, Optional
import time

class SkillExecutionTracker:
    """Wrapper for skill executions with automatic Memori recording."""

    def __init__(self, skill_name: str, task_description: str):
        self.skill_name = skill_name
        self.task_description = task_description
        self.memori = create_memori_client(f"skill:{skill_name}")
        self.start_time = time.time()
        self.files_created = []
        self.issues_encountered = []

    def __enter__(self):
        """Pre-execution: Query past similar tasks."""
        print(f"\n📚 Checking past executions for: {self.task_description}\n")

        past = self.memori.search_learnings(
            query=self.task_description,
            namespace=f"skill:{self.skill_name}",
            limit=5
        )

        if past:
            print(f"Found {len(past)} similar past executions:")
            for execution in past:
                print(f"  - {execution['task']}")
                print(f"    Outcome: {execution['outcome']}")
                print(f"    Pattern: {execution.get('pattern_used', 'N/A')}")
            print()

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Post-execution: Record outcome."""
        duration = int(time.time() - self.start_time)
        outcome = "failure" if exc_type else "success"

        from lib.memori import SkillContext
        context = SkillContext(self.memori)

        context.record_skill_execution(
            skill_name=self.skill_name,
            task=self.task_description,
            outcome=outcome,
            files_created=self.files_created,
            issues_encountered=self.issues_encountered,
            duration_seconds=duration,
            error=str(exc_val) if exc_val else None
        )

        print(f"\n✅ Skill execution recorded to Memori (duration: {duration}s, outcome: {outcome})\n")

    def log_file_created(self, file_path: str):
        """Track file creation during skill execution."""
        self.files_created.append(file_path)

    def log_issue(self, issue_description: str):
        """Track issues encountered during execution."""
        self.issues_encountered.append(issue_description)


# Usage in skills:
# with SkillExecutionTracker("backend-service-builder", "Create LoyaltyService") as tracker:
#     # ... perform skill tasks ...
#     tracker.log_file_created("services/loyalty/keys.ts")
#     tracker.log_issue("Initial bounded context violation (fixed)")
```

---

## Skill-Specific Enhancements

### backend-service-builder

**Memory Namespace**: `skill:backend-service-builder`

**What to Record**:
- Service creation outcomes (success/failure)
- Pattern selection (A/B/C) and appropriateness
- Validation findings (anti-patterns, violations)
- Migration execution outcomes
- Documentation consistency issues

**Unique Features**:
- Build service pattern success rate database
- Track validation violation trends
- Suggest pattern based on domain complexity
- Auto-detect recurring bounded context violations

**Example Query**:
```python
# Before creating a service
past_loyalty_services = memori.search_learnings(
    query="create service for loyalty rewards domain",
    namespace="skill:backend-service-builder",
    tags=["service-creation", "loyalty"],
    limit=5
)

# Analysis: "4 out of 5 past loyalty services used Pattern A successfully"
# Recommendation: "Use Pattern A for LoyaltyService"
```

---

### frontend-design

**Memory Namespace**: `skill:frontend-design`

**What to Record**:
- Aesthetic direction choices (minimal, maximalist, etc.)
- Component patterns used (virtualization, skeleton loaders, etc.)
- State management implementations (React Query + Zustand)
- Performance outcomes (load times, bundle sizes)
- User feedback on design quality

**Unique Features**:
- Track aesthetic direction success rates
- Build component pattern library from past successes
- Identify recurring UX anti-patterns
- Suggest state management strategies based on data type

**Example Query**:
```python
# Before designing a player lookup interface
past_table_designs = memori.search_learnings(
    query="table designs for large datasets (500+ rows)",
    namespace="skill:frontend-design",
    tags=["table", "virtualization", "performance"],
    limit=5
)

# Analysis: "All 5 past large table designs used virtualization successfully"
# Recommendation: "Use @tanstack/react-virtual for PlayerLookupTable"
```

---

### skill-creator

**Memory Namespace**: `skill:skill-creator`

**What to Record**:
- Skill creation outcomes (success/failure)
- Effective skill structures (with scripts, references, assets)
- Progressive disclosure usage patterns
- Skill metadata quality (description clarity, trigger accuracy)

**Unique Features**:
- Track skill creation best practices
- Build effective skill pattern library
- Identify common skill creation mistakes
- Suggest bundled resource organization

**Example Query**:
```python
# Before creating a new skill
past_skills_with_validation = memori.search_learnings(
    query="skills with validation scripts",
    namespace="skill:skill-creator",
    tags=["validation", "scripts"],
    limit=5
)

# Analysis: "Skills with validation scripts had 80% higher success rates"
# Recommendation: "Include validation scripts for new skill"
```

---

## Analytics and Insights

With Memori integration, skills can provide analytics:

### Skill Success Metrics
```python
# Query skill execution success rates
executions = memori.search_learnings(
    namespace="skill:backend-service-builder",
    tags=["skill-execution"],
    limit=100
)

total = len(executions)
success = sum(1 for e in executions if e['outcome'] == 'success')
success_rate = (success / total) * 100

print(f"backend-service-builder success rate: {success_rate}%")
print(f"Total executions: {total}")
print(f"Average duration: {avg_duration}s")
```

### Pattern Effectiveness Analysis
```python
# Which service pattern has highest success rate?
pattern_a = memori.search_learnings(
    query="Pattern A service creation",
    namespace="skill:backend-service-builder",
    tags=["Pattern-A"],
    limit=50
)

pattern_a_success = sum(1 for e in pattern_a if e['outcome'] == 'success')
pattern_a_rate = (pattern_a_success / len(pattern_a)) * 100

# Compare with Pattern B, Pattern C
# Recommendation: Use Pattern A for complex domains (95% success rate)
```

### Validation Violation Trends
```python
# What are the most common violations?
violations = memori.search_learnings(
    namespace="skill:backend-service-builder",
    tags=["validation", "error"],
    limit=200
)

violation_counts = {}
for v in violations:
    pattern = v['pattern_violated']
    violation_counts[pattern] = violation_counts.get(pattern, 0) + 1

# Top violations:
# 1. ReturnType inference: 45 occurrences
# 2. Class-based services: 23 occurrences
# 3. Supabase typing (any): 18 occurrences
```

---

## Implementation Roadmap

### Week 1: Phase 1 (Manual Recording)
**Tasks**:
- Add Memory Recording Protocol to backend-service-builder/SKILL.md
- Add Memory Recording Protocol to frontend-design/SKILL.md
- Add Memory Recording Protocol to skill-creator/SKILL.md
- Test manual recording with sample skill execution

**Deliverable**: Skills can manually record execution outcomes

---

### Week 2: Phase 2 (Validation Script Enhancement)
**Tasks**:
- Enhance validate_service_structure.py with Memori integration
- Enhance check_doc_consistency.py with Memori integration
- Test validation scripts record findings correctly
- Verify historical violation queries work

**Deliverable**: Validation scripts automatically record findings and suggest fixes

---

### Week 3: Phase 3 (Execution Wrapper)
**Tasks**:
- Create lib/memori/skill_utils.py with SkillExecutionTracker
- Create SkillContext class for skill-specific recording methods
- Add analytics utilities for skill metrics
- Update skills to use execution wrapper

**Deliverable**: Skills automatically track executions with analytics

---

## Success Criteria

Phase 1 Complete When:
- ✅ All 3 skills have Memory Recording Protocol section
- ✅ Skills can manually record execution outcomes
- ✅ Queries return past skill executions

Phase 2 Complete When:
- ✅ Validation scripts record findings to Memori
- ✅ Scripts query past violations before running
- ✅ Historical fix suggestions appear in output
- ✅ Violation trend analytics available

Phase 3 Complete When:
- ✅ Skill execution wrapper automates recording
- ✅ Pre-execution queries show past similar tasks
- ✅ Post-execution recording automatic
- ✅ Analytics dashboard shows skill metrics

---

## Next Steps

**Recommended**: Start with Phase 1 (lowest effort, immediate value)

**Decision Point**: After Phase 1, evaluate if Phase 2 (validation enhancement) is worth the investment based on:
- How often skills are executed
- How valuable historical violation data would be
- Whether auto-suggestions would improve developer experience

**Alternative**: Skip to Phase 3 if automation is priority over validation enhancement
