---
description: Show BackendServiceContext learning state, pending proposals, and regressions
allowed-tools: Bash, Read
---

# Backend Service Builder Status

Display the current state of the Self-Improving Intelligence system for the backend-service-builder skill.

## Namespace Configuration

| Tier | Namespace | Purpose |
|------|-----------|---------|
| 2 | `arch_decisions` | Permanent architectural decisions, patterns |
| 4 | `session_backend_{YYYY_MM}` | Session checkpoints (7-day TTL) |

## Instructions

Run this Python code to get the full status:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.backend_service_context import BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

# Header
print("=" * 70)
print("BACKEND SERVICE BUILDER - STATUS REPORT")
print("=" * 70)
print()
print(f"Permanent Namespace: arch_decisions (Tier 2)")
session_ns = memori.get_session_namespace()
print(f"Session Namespace:   {session_ns} (Tier 4, 7-day TTL)")
print()

# 1. Pattern Effectiveness
print("## Pattern Effectiveness (Last 90 Days)\n")
stats = context.get_all_pattern_stats()
if stats:
    for pattern, s in stats.items():
        trend_emoji = {"improving": "[UP]", "stable": "[--]", "declining": "[DN]"}.get(s.trend, "[??]")
        print(f"  {pattern}: {s.success_rate:.0%} success ({s.total_executions} executions) {trend_emoji}")
        if s.common_issues:
            print(f"    Common issues: {', '.join(s.common_issues[:3])}")
else:
    print("  No pattern data yet (need 5+ executions per pattern)")

# 2. Regression Alerts
print("\n## Regression Alerts\n")
regressions = context.detect_pattern_regressions()
if regressions:
    for r in regressions:
        print(f"  [WARN] {r.pattern}: {r.baseline_success_rate:.0%} -> {r.current_success_rate:.0%}")
        print(f"         Decline: {r.decline_percentage:.1f}%")
        print(f"         Suspected cause: {r.suspected_cause}")
else:
    print("  [OK] No regressions detected")

# 3. Emerging Anti-Patterns
print("\n## Emerging Anti-Patterns (Last 30 Days)\n")
anti_patterns = context.detect_anti_pattern_emergence(days=30)
if anti_patterns:
    for ap in anti_patterns:
        print(f"  [ALERT] {ap['anti_pattern']}: {ap['occurrence_count']} occurrences")
        print(f"          {ap['recommendation']}")
else:
    print("  [OK] No emerging anti-patterns detected")

# 4. Pending Primitive Proposals
print("\n## Pending Primitive Update Proposals\n")
proposals = context.get_pending_primitive_updates()
if proposals:
    for p in proposals:
        print(f"  [{p.id}] {p.primitive_file}")
        print(f"    Type: {p.update_type}")
        print(f"    Proposal: {p.proposal[:80]}...")
        print(f"    Confidence: {p.confidence:.0%}")
        print(f"    Evidence: {len(p.evidence_ids)} supporting memories")
        print()
else:
    print("  No pending proposals")

# 5. Latest Checkpoint (with TTL awareness)
print("\n## Latest Session Checkpoint\n")
checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(f"  Saved at: {checkpoint.get('saved_at', 'unknown')}")
    print(f"  Namespace: {checkpoint.get('source_namespace', 'unknown')}")
    if checkpoint.get('ttl_days'):
        print(f"  TTL: {checkpoint.get('ttl_days')} days")
    print(f"  Task: {checkpoint.get('current_task', 'unknown')[:60]}...")
    if checkpoint.get('service_name'):
        print(f"  Service: {checkpoint.get('service_name')}")
    if checkpoint.get('pattern_used'):
        print(f"  Pattern: {checkpoint.get('pattern_used')}")
    if checkpoint.get('next_steps'):
        print(f"  Next steps: {len(checkpoint.get('next_steps', []))} items")
else:
    print("  No active checkpoint (may have expired after 7 days)")

# 6. Memory Stats
print("\n## Memory Statistics\n")
try:
    import psycopg2
    db_url = memori.config.database_url.split('?')[0]
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SET search_path TO memori, public")

    # Count by namespace
    cur.execute("""
        SELECT
            user_id,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW()) as active,
            COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired
        FROM memori.memories
        WHERE user_id = 'arch_decisions'
           OR user_id LIKE 'session_backend_%'
        GROUP BY user_id
        ORDER BY user_id;
    """)
    rows = cur.fetchall()
    for row in rows:
        print(f"  {row[0]}: {row[1]} total ({row[2]} active, {row[3]} expired)")

    cur.close()
    conn.close()
except Exception as e:
    print(f"  (Could not fetch memory stats: {e})")

# 7. Quick Actions
print("\n## Quick Actions\n")
print("  /backend-checkpoint save     - Save session before /clear")
print("  /backend-checkpoint restore  - Resume after /clear")
print()
print("  To approve a proposal:")
print("    context.update_proposal_status('prop_xxx', 'approved', 'notes')")
print()
print("  To generate full learning report:")
print("    print(context.format_learning_report())")

print("\n" + "=" * 70)
EOF
```

After running, summarize any items requiring attention:

- Regressions that need investigation
- Pending proposals that need review
- Anti-patterns that should be addressed
- Expired checkpoints that may need cleanup

---

## Quick SQL Queries

### Pattern Execution Summary

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    metadata->>'pattern_used' as pattern,
    metadata->>'outcome' as outcome,
    COUNT(*) as count
FROM memori.memories
WHERE user_id = 'arch_decisions'
  AND metadata->>'type' = 'skill_execution'
  AND metadata->>'skill_name' = 'backend-service-builder'
GROUP BY metadata->>'pattern_used', metadata->>'outcome'
ORDER BY pattern, outcome;
"
```

### Recent Skill Executions

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    LEFT(metadata->>'task', 50) as task,
    metadata->>'pattern_used' as pattern,
    metadata->>'outcome' as outcome,
    metadata->>'duration_seconds' as duration,
    created_at
FROM memori.memories
WHERE user_id = 'arch_decisions'
  AND metadata->>'type' = 'skill_execution'
  AND metadata->>'skill_name' = 'backend-service-builder'
ORDER BY created_at DESC
LIMIT 10;
"
```

### Active vs Expired Session Checkpoints

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    user_id as namespace,
    COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at > NOW()) as active,
    COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= NOW()) as expired
FROM memori.memories
WHERE user_id LIKE 'session_backend_%'
  AND metadata->>'type' = 'session_checkpoint'
GROUP BY user_id
ORDER BY user_id;
"
```

### Pending Primitive Proposals

```bash
docker exec supabase_db_pt-2 psql -U postgres -d postgres -c "
SELECT
    metadata->>'id' as proposal_id,
    metadata->>'primitive_file' as file,
    metadata->>'update_type' as type,
    metadata->>'status' as status,
    metadata->>'confidence' as confidence,
    created_at
FROM memori.memories
WHERE user_id = 'arch_decisions'
  AND metadata->>'type' = 'primitive_proposal'
  AND metadata->>'status' = 'pending'
ORDER BY created_at DESC;
"
```

---

## Namespace Hierarchy Reference

| Tier | Namespace | Purpose | TTL |
|------|-----------|---------|-----|
| 1 | `pt2_project` | Project standards, domain knowledge | Permanent |
| 2 | `arch_decisions` | Architectural decisions, patterns, skill learnings | Permanent |
| 3 | `mvp_progress` | MVP implementation tracking | Operational |
| 4 | `session_backend_{YYYY_MM}` | Backend checkpoints | **7 days** |
