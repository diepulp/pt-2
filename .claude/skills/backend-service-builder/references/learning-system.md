# Self-Improving Intelligence System

**Purpose**: Adaptive learning mechanisms that update primitives based on execution outcomes.

---

## Overview

The learning system continuously improves by:

1. **Tracking pattern effectiveness** - Monitors success rates per pattern over time
2. **Proposing primitive updates** - Suggests changes to reference docs based on learnings
3. **Providing adaptive recommendations** - Weights suggestions by historical success
4. **Detecting regressions** - Alerts when patterns start failing more frequently
5. **Integrating user feedback** - Learns from corrections and overrides

---

## Pattern Effectiveness Tracking

Query how well patterns have performed historically:

```python
from lib.memori import create_memori_client, BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

# Get stats for a specific pattern
stats = context.calculate_pattern_effectiveness("Pattern A", days=90)

if stats:
    print(f"Pattern A Statistics:")
    print(f"  Success Rate: {stats.success_rate:.0%}")
    print(f"  Total Executions: {stats.total_executions}")
    print(f"  Trend: {stats.trend}")  # improving, stable, declining
    print(f"  Common Issues: {stats.common_issues[:3]}")

# Get stats for all patterns
all_stats = context.get_all_pattern_stats()
for pattern, s in all_stats.items():
    print(f"{pattern}: {s.success_rate:.0%} ({s.trend})")
```

---

## Adaptive Recommendations

Get pattern recommendations weighted by historical success:

```python
recommendation = context.get_adaptive_recommendation(
    task_type="create_service",
    domain="loyalty",
    complexity="high"
)

print(f"Recommended: {recommendation['pattern']}")
print(f"Confidence: {recommendation['confidence']:.0%}")
print(f"Rationale: {recommendation['rationale']}")

# Check alternatives
if recommendation['alternative']:
    print(f"Alternative: {recommendation['alternative']} ({recommendation['alt_confidence']:.0%})")
```

---

## Primitive Evolution Engine

Propose updates to reference docs based on learnings:

```python
# When SRM ownership violations keep occurring for a table
context.propose_primitive_update(
    primitive_file="references/bounded-contexts.md",
    update_type="add_table_ownership",
    proposal="Add 'rating_slip_history' to rating-slip service ownership",
    evidence=["mem_abc123", "mem_def456", "mem_ghi789"],
    impact_assessment="Resolves recurring cross-context violations in loyalty service"
)

# Get pending proposals for review
proposals = context.get_pending_primitive_updates()
print(f"{len(proposals)} primitive update proposals pending review:")

for p in proposals:
    print(f"\n[{p.id}] {p.primitive_file}")
    print(f"  Type: {p.update_type}")
    print(f"  Proposal: {p.proposal}")
    print(f"  Confidence: {p.confidence:.0%}")
    print(f"  Evidence: {len(p.evidence_ids)} supporting memories")

# After user review, update status
context.update_proposal_status(
    proposal_id="prop_abc123",
    status="approved",  # or "rejected", "applied"
    reviewer_notes="Applied to bounded-contexts.md in commit abc123"
)
```

---

## Regression Detection

Detect when patterns start performing worse:

```python
# Check for pattern regressions
regressions = context.detect_pattern_regressions()

if regressions:
    print("Pattern Regressions Detected:")
    for r in regressions:
        print(f"  {r.pattern}: {r.baseline_success_rate:.0%} -> {r.current_success_rate:.0%}")
        print(f"    Decline: {r.decline_percentage:.1f}%")
        print(f"    Suspected cause: {r.suspected_cause}")

# Check for emerging anti-patterns
anti_patterns = context.detect_anti_pattern_emergence(days=30)

if anti_patterns:
    print("Emerging Anti-Patterns:")
    for ap in anti_patterns:
        print(f"  {ap['anti_pattern']}: {ap['occurrence_count']} occurrences")
        print(f"    {ap['recommendation']}")
```

---

## User Feedback Integration

Record user corrections to improve future recommendations:

```python
# When user overrides a recommendation
context.record_user_correction(
    original_recommendation="Pattern B",
    user_choice="Pattern A",
    context={"domain": "finance", "complexity": "high"},
    reason="Business rules more complex than initially apparent"
)

# Record feedback on execution outcomes
context.record_execution_outcome_feedback(
    execution_id="exec_abc123",
    user_satisfaction="approved",  # or "needs_revision", "rejected"
    feedback="Service works well, good pattern choice"
)
```

---

## Learning Report

Generate a summary of all learning data:

```python
# Get structured summary
summary = context.get_learning_summary()
print(f"Most Reliable Pattern: {summary['recommendations']['most_reliable_pattern']}")
print(f"Pending Proposals: {summary['pending_proposals']}")
print(f"Regressions: {summary['regressions']}")

# Get formatted markdown report
report = context.format_learning_report()
print(report)
```

**Example Output**:

```
# Backend Service Builder - Learning Report

**Generated:** 2025-11-26 14:30

## Pattern Effectiveness

- **Pattern A**: 87% success (23 executions)
- **Pattern B**: 92% success (45 executions)
- **Pattern C**: 78% success (12 executions)

## Regressions Detected

- Pattern C: declined 15.2%

## Pending Primitive Updates: 2

## Recommendations

- **Most Reliable Pattern:** Pattern B
- **Needs Attention:** Pattern C
```
