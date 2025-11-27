---
description: Show BackendServiceContext learning state, pending proposals, and regressions
allowed-tools: Bash, Read
---

# Backend Service Builder Status

Display the current state of the Self-Improving Intelligence system for the backend-service-builder skill.

## Instructions

Run this Python code to get the full status:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client, BackendServiceContext

memori = create_memori_client("skill:backend-service-builder")
memori.enable()
context = BackendServiceContext(memori)

# Header
print("=" * 70)
print("BACKEND SERVICE BUILDER - STATUS REPORT")
print("=" * 70)

# 1. Pattern Effectiveness
print("\n## Pattern Effectiveness (Last 90 Days)\n")
stats = context.get_all_pattern_stats()
if stats:
    for pattern, s in stats.items():
        trend_emoji = {"improving": "📈", "stable": "➡️", "declining": "📉"}.get(s.trend, "❓")
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
        print(f"  ⚠️  {r.pattern}: {r.baseline_success_rate:.0%} → {r.current_success_rate:.0%}")
        print(f"      Decline: {r.decline_percentage:.1f}%")
        print(f"      Suspected cause: {r.suspected_cause}")
else:
    print("  ✅ No regressions detected")

# 3. Emerging Anti-Patterns
print("\n## Emerging Anti-Patterns (Last 30 Days)\n")
anti_patterns = context.detect_anti_pattern_emergence(days=30)
if anti_patterns:
    for ap in anti_patterns:
        print(f"  🔍 {ap['anti_pattern']}: {ap['occurrence_count']} occurrences")
        print(f"     {ap['recommendation']}")
else:
    print("  ✅ No emerging anti-patterns detected")

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

# 5. Latest Checkpoint
print("\n## Latest Session Checkpoint\n")
checkpoint = context.load_latest_checkpoint()
if checkpoint:
    print(f"  Saved at: {checkpoint.get('saved_at', 'unknown')}")
    print(f"  Task: {checkpoint.get('current_task', 'unknown')[:60]}...")
    if checkpoint.get('service_name'):
        print(f"  Service: {checkpoint.get('service_name')}")
    if checkpoint.get('pattern_used'):
        print(f"  Pattern: {checkpoint.get('pattern_used')}")
    if checkpoint.get('next_steps'):
        print(f"  Next steps: {len(checkpoint.get('next_steps', []))} items")
else:
    print("  No checkpoint saved")

# 6. Quick Actions
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
