---
description: Show MVP implementation progress, phase status, and velocity metrics
allowed-tools: Bash, Read
---

# MVP Progress Status

Display the current MVP implementation progress including service status, phase milestones, critical path, and velocity metrics.

## Instructions

Run this Python code to get the full MVP status:

```bash
python3 << 'EOF'
from lib.memori import create_memori_client
from lib.memori.mvp_progress_context import MVPProgressContext

memori = create_memori_client("skill:mvp-progress")
memori.enable()
context = MVPProgressContext(memori)

# Header
print("=" * 70)
print("MVP PROGRESS STATUS REPORT")
print("=" * 70)

# 1. Overall Progress
print("\n## Overall Progress\n")
progress = context.get_overall_progress()
print(f"  Total Services:      {progress['total_services']}")
print(f"  Completed:           {progress['completed']}")
print(f"  In Progress:         {progress['in_progress']}")
print(f"  Not Started:         {progress['not_started']}")
print(f"  Completion:          {progress['completion_percentage']}%")

# Progress bar
pct = int(progress['completion_percentage'] / 5)
bar = "[" + "=" * pct + " " * (20 - pct) + "]"
print(f"\n  {bar} {progress['completion_percentage']}%")

# 2. Phase Status
print("\n## Phase Status\n")
phase_defs = context.PHASE_DEFINITIONS
for phase_num in sorted(phase_defs.keys()):
    phase = context.get_phase_status(phase_num)
    if phase:
        status_emoji = {
            "completed": "DONE",
            "in_progress": "WIP",
            "blocked": "BLOCKED",
            "not_started": "TODO",
        }.get(phase.status, phase.status)

        print(f"  Phase {phase.phase_number}: {phase.phase_name}")
        print(f"    Status: {status_emoji}")
        print(f"    Gate: GATE-{phase.gate_number}")
        if phase.services_completed:
            print(f"    Completed: {', '.join(phase.services_completed)}")
        if phase.services_pending:
            print(f"    Pending: {', '.join(phase.services_pending)}")
        if phase.blockers:
            print(f"    Blockers: {', '.join(phase.blockers)}")
        print()

# 3. Service Status Table
print("\n## Service Implementation Status\n")
print("  | Service                | PRD     | Code | Tests | Status       |")
print("  |------------------------|---------|------|-------|--------------|")

all_statuses = context.get_all_service_statuses()
for service_name in sorted(context.SERVICE_PRD_MAP.keys()):
    prd = context.SERVICE_PRD_MAP[service_name]
    status = all_statuses.get(service_name)

    if status:
        code = "Yes" if status.code_exists else "No"
        tests = "Yes" if status.tests_exist else "No"
        status_text = status.status.replace("_", " ").title()
    else:
        code = "No"
        tests = "No"
        status_text = "Not Started"

    print(f"  | {service_name:<22} | {prd:<7} | {code:<4} | {tests:<5} | {status_text:<12} |")

# 4. Critical Path
print("\n## Critical Path\n")
critical_path = context.get_critical_path()
for item in critical_path:
    status_icon = "DONE" if not item["is_blocking"] else "BLOCKING"
    print(f"  [{status_icon}] {item['service']} ({item['prd']})")
    print(f"         {item['reason']}")
    if item["is_blocking"]:
        print(f"         Blocks: {', '.join(item['blocks'][:3])}")

# 5. Velocity Metrics
print("\n## Velocity Metrics\n")
velocity = context.get_velocity_metrics()
trend_emoji = {
    "accelerating": "(improving)",
    "stable": "(steady)",
    "slowing": "(slowing)",
    "unknown": "",
    "error": "(error)",
}.get(velocity.trend, "")

print(f"  Total Completed:        {velocity.services_completed_total}")
print(f"  Last 7 Days:            {velocity.services_completed_last_7_days}")
print(f"  Last 30 Days:           {velocity.services_completed_last_30_days}")
print(f"  Avg Days per Service:   {velocity.avg_days_per_service}")
if velocity.estimated_days_to_completion > 0:
    print(f"  Est. Days to Complete:  {velocity.estimated_days_to_completion}")
else:
    print(f"  Est. Days to Complete:  N/A (need more data)")
print(f"  Trend:                  {velocity.trend} {trend_emoji}")

# 6. Next Actions
print("\n## Next Actions\n")
for item in critical_path:
    if item["is_blocking"]:
        print(f"  1. HIGH: Implement {item['service']} ({item['prd']})")
        print(f"     - {item['reason']}")
        break

# 7. Memory Learnings (Dynamic Recall)
print("\n## Memory Learnings\n")
try:
    from lib.memori.dynamic_recall import LearningsDiscovery
    discovery = LearningsDiscovery()
    stats = discovery.get_namespace_stats()
    patterns = discovery.get_top_patterns(5)
    discovery.close()

    # Show namespace activity
    print("  Active Namespaces:")
    for ns, data in sorted(stats.items(), key=lambda x: x[1]["memory_count"], reverse=True)[:5]:
        print(f"    - {ns}: {data['memory_count']} memories")

    # Show top patterns
    if patterns:
        print("\n  Top Patterns:")
        for p in patterns[:3]:
            print(f"    - {p.pattern} (freq: {p.frequency})")
except Exception as e:
    print(f"  (Learnings discovery unavailable: {e})")

print("\n## Quick Commands\n")
print("  Record service completion:")
print('    context.record_service_completion("ServiceName", ["file1.ts"], test_coverage=85)')
print()
print("  Record milestone transition:")
print('    context.record_milestone_transition(1, "in_progress", services_completed=["X"])')
print()
print("  View formatted report:")
print("    print(context.format_progress_summary())")
print()
print("  Sync memory files from DB:")
print("    from lib.memori.dynamic_recall import sync_memory_files")
print("    success, msg = sync_memory_files()")

print("\n" + "=" * 70)
EOF
```

After running, summarize:

- Current phase status and any blockers
- Critical path services that need implementation
- Velocity trend and any concerns
- Recommended next action
