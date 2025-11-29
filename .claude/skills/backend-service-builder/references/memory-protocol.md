# Memory Recording Protocol

**Purpose**: Track execution outcomes to build pattern knowledge and improve future recommendations.

---

## Initialization

```python
from lib.memori import create_memori_client, BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)
```

---

## Recording Skill Execution

After completing service implementation, record the outcome:

```python
context.record_skill_execution(
    skill_name="backend-service-builder",
    task="Create LoyaltyService",
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
    issues_encountered=[
        "Initially violated bounded context (fixed)",
        "README missing SRM reference (added)"
    ],
    duration_seconds=180,
    lessons_learned=[
        "Loyalty domain requires Pattern A due to business logic complexity",
        "SRM reference critical for cross-service coordination"
    ]
)
```

---

## Query Past Patterns Before Starting

Get data-driven recommendations before implementing a service:

```python
recommendation = context.get_adaptive_recommendation(
    task_type="create_service",
    domain="loyalty",
    complexity="high"
)

print(f"Pattern: {recommendation['pattern']}")
print(f"Confidence: {recommendation['confidence']:.0%}")
print(f"Rationale: {recommendation['rationale']}")
```

---

## Validation Script Integration

Validation scripts have full Memori integration:

**`validate_service_structure.py`** records:
- Anti-pattern detections (ReturnType inference, class-based services)
- Validation failures with historical context
- Fix suggestions based on past resolutions

**`check_doc_consistency.py`** records:
- Documentation regressions and drift
- SRM ownership mismatches
- Migration naming violations
- README incompleteness

When running validation, scripts:
1. Query past violations for context
2. Run validation checks
3. Record findings to Memori
4. Suggest fixes based on historical resolutions

---

## When to Record Manually

Record execution outcomes at these moments:

- After service creation (pattern used, files created, validation results)
- After migration execution (tables created, RLS policies applied)
- After validation failures (issues found, how resolved)
- After user corrections (learn from feedback)
- After discovering patterns (bounded context insights, DTO decisions)

---

## Advanced: Async Retrieval with Composite Scoring

For high-performance memory retrieval:

```python
from lib.memori import MemoryRetriever, RetrievalConfig, create_memory_retriever

config = RetrievalConfig(
    relevance_weight=0.4,
    recency_weight=0.3,
    importance_weight=0.3,
    recency_decay_days=30,
)

retriever = await create_memory_retriever(config=config)

memories = await retriever.retrieve(
    namespace="skill_backend_service_builder",
    query="Pattern A service creation loyalty",
    category="skills",
    limit=10,
    track_usage=True
)

for mem in memories:
    print(f"Content: {mem.content}")
    print(f"Score: {mem.final_score:.3f}")
```

---

## Namespace Reference

| Client Key | Database user_id |
|------------|------------------|
| `skill:backend-service-builder` | `skill_backend_service_builder` |
| `skill:frontend-design` | `skill_frontend_design` |
| `skill:lead-architect` | `skill_lead_architect` |
| `architect` | `pt2_architect` |
| `main` | `pt2_agent` |
