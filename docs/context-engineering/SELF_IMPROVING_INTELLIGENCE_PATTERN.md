# Self-Improving Intelligence Pattern

> **Pattern for extending Claude Code skills with adaptive learning mechanisms that update primitives based on execution outcomes.**

## Overview

This document captures the implementation pattern used to augment the `backend-service-builder` skill with self-improving intelligence. Use this as a template when adding learning capabilities to other skills.

## Problem Statement

Skills have **static primitives** (reference docs, patterns, rules) that don't evolve based on real-world usage. This leads to:
- Outdated recommendations that no longer reflect best practices
- Recurring violations that indicate documentation drift
- No feedback loop from execution outcomes to improve future guidance

## Solution: Self-Improving Intelligence

A learning layer that:
1. **Tracks execution outcomes** per pattern/approach
2. **Aggregates success rates** over time
3. **Detects regressions** when patterns start failing
4. **Proposes primitive updates** based on learnings
5. **Integrates user feedback** to improve recommendations

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     SELF-IMPROVING LOOP                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   EXECUTE    │───▶│   RECORD     │───▶│  AGGREGATE   │          │
│  │   SKILL      │    │   OUTCOME    │    │   STATS      │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│         ▲                                        │                  │
│         │                                        ▼                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   UPDATE     │◀───│   REVIEW     │◀───│   DETECT     │          │
│  │  PRIMITIVES  │    │  PROPOSALS   │    │  REGRESSIONS │          │
│  └──────────────┘    └──────────────┘    └──────────────┘          │
│                             │                                       │
│                             ▼                                       │
│                      ┌──────────────┐                               │
│                      │   PROPOSE    │                               │
│                      │   UPDATES    │                               │
│                      └──────────────┘                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose | Data Stored |
|-----------|---------|-------------|
| **Outcome Recorder** | Captures execution results | pattern, outcome, duration, issues, lessons |
| **Stats Aggregator** | Calculates effectiveness | success_rate, trend, common_issues |
| **Regression Detector** | Identifies declining patterns | baseline_rate, current_rate, suspected_cause |
| **Proposal Engine** | Suggests primitive updates | primitive_file, update_type, evidence |
| **Feedback Integrator** | Learns from corrections | original_rec, user_choice, context |

---

## Implementation Guide

### Step 1: Create Context Class

Create a new context class that extends `ValidationContext` or `SkillContext`:

```python
# lib/memori/{skill_name}_context.py

from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
from loguru import logger

from .client import MemoriClient
from .skill_context import ValidationContext


@dataclass
class PatternStats:
    """Statistics for a pattern/approach."""
    pattern: str
    total_executions: int
    successful: int
    failed: int
    success_rate: float
    trend: str  # "improving", "stable", "declining"
    common_issues: List[str]


@dataclass
class PrimitiveProposal:
    """A proposed update to a primitive."""
    id: str
    primitive_file: str
    update_type: str
    proposal: str
    evidence_ids: List[str]
    confidence: float
    status: str  # "pending", "approved", "rejected", "applied"


class YourSkillContext(ValidationContext):
    """
    Self-improving context for {skill-name} skill.
    """

    SKILL_NAMESPACE = "skill:{skill-name}"
    REGRESSION_THRESHOLD = 0.15  # 15% decline triggers alert
    MIN_SAMPLES_FOR_STATS = 5

    def __init__(self, memori_client: MemoriClient):
        super().__init__(memori_client)
        self._effectiveness_cache: Dict[str, PatternStats] = {}
        self._cache_timestamp: Optional[datetime] = None
```

### Step 2: Implement Pattern Effectiveness Tracking

```python
def calculate_pattern_effectiveness(
    self,
    pattern: str,
    days: int = 90
) -> Optional[PatternStats]:
    """
    Calculate success rate and trends for a specific pattern.
    """
    if not self.memori.enabled:
        return None

    try:
        import psycopg2
        import json

        db_url = self.memori.config.database_url.split('?')[0]
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        cur.execute("SET search_path TO memori, public")

        cutoff_date = datetime.now() - timedelta(days=days)

        # Query executions for this pattern
        cur.execute("""
            SELECT
                metadata->>'outcome' as outcome,
                metadata->>'issues_encountered' as issues,
                created_at
            FROM memori.memories
            WHERE user_id = %s
              AND metadata->>'type' = 'skill_execution'
              AND metadata->>'pattern_used' ILIKE %s
              AND created_at >= %s
        """, (self.memori.user_id, f"%{pattern}%", cutoff_date))

        rows = cur.fetchall()
        cur.close()
        conn.close()

        if len(rows) < self.MIN_SAMPLES_FOR_STATS:
            return None

        # Calculate stats
        total = len(rows)
        successful = sum(1 for r in rows if r[0] == 'success')
        failed = sum(1 for r in rows if r[0] == 'failure')

        # Aggregate common issues
        all_issues = []
        for r in rows:
            if r[1]:
                issues = json.loads(r[1]) if isinstance(r[1], str) else r[1]
                all_issues.extend(issues)

        # Count and sort by frequency
        issue_counts = {}
        for issue in all_issues:
            issue_counts[issue] = issue_counts.get(issue, 0) + 1
        common_issues = sorted(issue_counts.keys(),
                               key=lambda x: issue_counts[x],
                               reverse=True)[:5]

        # Calculate trend (compare recent 30 days to overall)
        cutoff_30 = datetime.now() - timedelta(days=30)
        recent_rows = [r for r in rows if r[2] >= cutoff_30]
        if len(recent_rows) >= 3:
            recent_rate = sum(1 for r in recent_rows if r[0] == 'success') / len(recent_rows)
        else:
            recent_rate = successful / total

        overall_rate = successful / total
        if recent_rate > overall_rate + 0.1:
            trend = "improving"
        elif recent_rate < overall_rate - 0.1:
            trend = "declining"
        else:
            trend = "stable"

        return PatternStats(
            pattern=pattern,
            total_executions=total,
            successful=successful,
            failed=failed,
            success_rate=overall_rate,
            trend=trend,
            common_issues=common_issues
        )

    except Exception as e:
        logger.error(f"Failed to calculate pattern effectiveness: {e}")
        return None
```

### Step 3: Implement Adaptive Recommendations

```python
def get_recommended_pattern(
    self,
    context: Dict[str, Any]
) -> Tuple[str, float, str]:
    """
    Get pattern recommendation weighted by historical success.

    Returns:
        Tuple of (pattern, confidence, rationale)
    """
    stats = self.get_all_pattern_stats()

    # Start with rule-based recommendation
    base_pattern = self._rule_based_recommendation(context)
    base_rationale = f"Selected based on {context}"

    # Adjust confidence based on historical data
    if base_pattern in stats:
        pattern_stats = stats[base_pattern]
        confidence = pattern_stats.success_rate

        # Adjust for trends
        if pattern_stats.trend == "declining":
            confidence *= 0.85
            base_rationale += f" (Warning: Recent success declining)"
        elif pattern_stats.trend == "improving":
            confidence = min(1.0, confidence * 1.1)

        base_rationale += f" [Historical: {pattern_stats.success_rate:.0%} success]"
    else:
        confidence = 0.7  # Default without data

    return base_pattern, confidence, base_rationale
```

### Step 4: Implement Primitive Evolution Engine

```python
def propose_primitive_update(
    self,
    primitive_file: str,
    update_type: str,
    proposal: str,
    evidence: List[str],
    impact_assessment: Optional[str] = None
) -> Optional[str]:
    """
    Record a proposal to update a primitive based on learnings.
    """
    if not self.memori.enabled:
        return None

    import uuid
    proposal_id = f"prop_{uuid.uuid4().hex[:8]}"

    # Calculate confidence based on evidence strength
    confidence = min(0.95, 0.5 + (len(evidence) * 0.1))

    metadata = {
        "type": "primitive_proposal",
        "proposal_id": proposal_id,
        "primitive_file": primitive_file,
        "update_type": update_type,
        "proposal": proposal,
        "evidence_ids": evidence,
        "status": "pending",
        "confidence": confidence,
        "impact_assessment": impact_assessment or "Not assessed",
        "timestamp": datetime.now().isoformat(),
    }

    result = self.memori.record_memory(
        content=f"Primitive update proposal: {proposal}",
        category="rules",
        metadata=metadata,
        importance=0.85,
        tags=["primitive-proposal", "pending", update_type]
    )

    return proposal_id if result else None


def get_pending_primitive_updates(self) -> List[PrimitiveProposal]:
    """Get all pending primitive update proposals for review."""
    # Query memori.memories where metadata->>'type' = 'primitive_proposal'
    # and metadata->>'status' = 'pending'
    ...


def update_proposal_status(
    self,
    proposal_id: str,
    status: str,  # "approved", "rejected", "applied"
    reviewer_notes: Optional[str] = None
) -> bool:
    """Update the status of a primitive proposal."""
    # Update metadata in memori.memories
    ...
```

### Step 5: Implement Regression Detection

```python
def detect_pattern_regressions(self) -> List[Dict[str, Any]]:
    """
    Detect patterns performing worse than baseline.
    """
    stats = self.get_all_pattern_stats()
    alerts = []

    for pattern, pattern_stats in stats.items():
        if pattern_stats.total_executions >= self.MIN_SAMPLES_FOR_STATS:
            # Compare recent to baseline
            # (Implementation depends on how you track baseline)
            decline = pattern_stats.success_rate - recent_rate

            if decline > self.REGRESSION_THRESHOLD:
                alerts.append({
                    "pattern": pattern,
                    "baseline": pattern_stats.success_rate,
                    "current": recent_rate,
                    "decline_pct": decline * 100,
                    "suspected_cause": pattern_stats.common_issues[0] if pattern_stats.common_issues else "Unknown"
                })

    return alerts


def detect_anti_pattern_emergence(self, days: int = 30) -> List[Dict[str, Any]]:
    """
    Detect new anti-patterns emerging from validation findings.
    """
    # Query validation findings grouped by pattern_violated
    # Return patterns with 3+ occurrences
    ...
```

### Step 6: Implement User Feedback Integration

```python
def record_user_correction(
    self,
    original_recommendation: str,
    user_choice: str,
    context: Dict[str, Any],
    reason: Optional[str] = None
) -> bool:
    """
    Record when user overrides a recommendation.
    """
    metadata = {
        "type": "user_correction",
        "original_recommendation": original_recommendation,
        "user_choice": user_choice,
        "context": context,
        "reason": reason or "Not provided",
        "timestamp": datetime.now().isoformat(),
    }

    return self.memori.record_memory(
        content=f"User correction: {original_recommendation} -> {user_choice}",
        category="feedback",
        metadata=metadata,
        importance=0.9,  # High importance - direct feedback
        tags=["user-correction", "learning-feedback"]
    ) is not None
```

---

## Integration Points

### In SKILL.md

Add these sections to your skill's SKILL.md:

```markdown
## Self-Improving Intelligence

This skill includes adaptive learning mechanisms...

### Using {YourSkill}Context

```python
from lib.memori import create_memori_client, YourSkillContext

memori = create_memori_client("skill:{skill-name}")
memori.enable()
context = YourSkillContext(memori)
```

### Pattern Effectiveness Tracking
[Document calculate_pattern_effectiveness usage]

### Adaptive Recommendations
[Document get_recommended_pattern usage]

### Primitive Evolution Engine
[Document propose_primitive_update usage]

### Regression Detection
[Document detect_pattern_regressions usage]
```

### In Validation Scripts

Update validation scripts to use the new context:

```python
from memori import create_memori_client, YourSkillContext

# In __init__
self.context = YourSkillContext(memori_client)

# After validation
if self.context:
    regressions = self.context.detect_pattern_regressions()
    if regressions:
        print("Pattern Regressions Detected:")
        for r in regressions:
            print(f"  {r['pattern']}: {r['baseline']:.0%} -> {r['current']:.0%}")
```

### In __init__.py

Export the new classes:

```python
from .your_skill_context import YourSkillContext, PatternStats, PrimitiveProposal

__all__ = [
    # ... existing exports
    "YourSkillContext",
    "PatternStats",
    "PrimitiveProposal",
]
```

---

## Memory Categories

Use these memory categories for learning data:

| Category | Purpose | Example |
|----------|---------|---------|
| `skills` | Execution outcomes | Pattern used, success/failure, duration |
| `validation` | Validation findings | Errors, warnings, pattern violations |
| `rules` | Primitive proposals | Proposed updates to reference docs |
| `feedback` | User corrections | Override of recommendations |

## Tags Convention

Use consistent tags for queryability:

- `skill-execution` - For execution outcomes
- `{pattern-name}` - For pattern-specific data (e.g., `Pattern-A`)
- `primitive-proposal` - For primitive update proposals
- `pending`/`approved`/`rejected` - For proposal status
- `user-correction` - For feedback from user overrides
- `{outcome}` - For execution outcome (success, failure, partial)

---

## Example: Full Implementation

See `lib/memori/backend_service_context.py` for a complete implementation.

Key features:
- `BackendServiceContext` class with all methods
- Pattern effectiveness tracking for Pattern A/B/C
- Adaptive recommendations weighted by success rates
- Auto-proposal of primitive updates
- Regression detection with suspected cause analysis
- User feedback integration
- Learning report generation

---

## Checklist for New Skill Integration

- [ ] Create `{skill}_context.py` extending `ValidationContext`
- [ ] Implement `calculate_pattern_effectiveness()`
- [ ] Implement `get_recommended_pattern()` with adaptive weighting
- [ ] Implement `propose_primitive_update()` and related methods
- [ ] Implement `detect_pattern_regressions()`
- [ ] Implement `record_user_correction()`
- [ ] Add exports to `lib/memori/__init__.py`
- [ ] Update SKILL.md with Self-Improving Intelligence section
- [ ] Update validation scripts to use new context
- [ ] Add Step N: Learning Review to workflow
- [ ] Test with `python3 -m py_compile` for syntax validation

---

## References

- **Implementation**: `lib/memori/backend_service_context.py`
- **Skill Example**: `.claude/skills/backend-service-builder/SKILL.md`
- **Validation Scripts**: `.claude/skills/backend-service-builder/scripts/`
- **Context Management**: `docs/context-engineering/IMPLEMENTATION_COMPLETE.md`
