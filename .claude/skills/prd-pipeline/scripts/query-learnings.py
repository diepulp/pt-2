#!/usr/bin/env python3
"""
Query pipeline learnings from Memori for context injection.

Usage:
    uv run .claude/skills/prd-pipeline/scripts/query-learnings.py \
        --prd PRD-XXX \
        --domain "rating-slip" \
        --format markdown

    uv run .claude/skills/prd-pipeline/scripts/query-learnings.py \
        --executor backend-service-builder

    uv run .claude/skills/prd-pipeline/scripts/query-learnings.py \
        --gate type-check
"""

import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser(description="Query pipeline learnings from Memori")
    parser.add_argument("--prd", help="PRD identifier for context")
    parser.add_argument("--domain", help="Domain to search for similar PRDs")
    parser.add_argument("--executor", help="Query specific executor stats")
    parser.add_argument("--gate", help="Query specific gate stats")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown",
                        help="Output format (default: markdown)")
    parser.add_argument("--limit", type=int, default=5, help="Maximum results")
    parser.add_argument("--all-stats", action="store_true", help="Show all executor and gate stats")
    args = parser.parse_args()

    print("=" * 60)
    print("PIPELINE LEARNINGS QUERY")
    print("=" * 60)

    # Try to initialize Memori
    try:
        from lib.memori.dynamic_recall import DynamicRecall
        from lib.memori import create_memori_client
        from lib.memori.pipeline_context import PipelineContext
        memori_available = True
    except ImportError as e:
        print(f"WARNING: Memori not available: {e}")
        memori_available = False

    # Query past decisions via DynamicRecall
    if memori_available and (args.prd or args.domain):
        recall = DynamicRecall()

        query_parts = ["pipeline execution"]
        if args.prd:
            query_parts.append(args.prd)
        if args.domain:
            query_parts.append(args.domain)

        query = " ".join(query_parts)
        print(f"\nQuery: {query}")

        # Get similar PRD executions
        memories = recall.query_past_decisions(
            topic=query,
            namespace="arch_decisions",
            limit=args.limit,
            include_cross_namespace=True
        )

        if memories:
            print(f"\n## Similar PRD Executions ({len(memories)} found)\n")
            for i, mem in enumerate(memories, 1):
                content = mem.content if hasattr(mem, 'content') else str(mem)
                print(f"**[{i}]** {content[:100]}...")

                metadata = mem.metadata if hasattr(mem, 'metadata') else {}
                if isinstance(metadata, dict):
                    if metadata.get("outcome"):
                        print(f"   Outcome: {metadata['outcome']}")
                    if metadata.get("lessons_learned"):
                        lessons = metadata['lessons_learned']
                        if isinstance(lessons, list):
                            print(f"   Lessons: {', '.join(lessons[:2])}")
                print()
        else:
            print("\nNo similar PRD executions found.")

        recall.close()

    # Get executor stats
    if memori_available and (args.executor or args.all_stats):
        try:
            memori = create_memori_client("skill:prd-pipeline")
            memori.enable()
            context = PipelineContext(memori)

            executors_to_query = [args.executor] if args.executor else [
                "backend-service-builder",
                "api-builder",
                "rls-expert",
                "frontend-design:frontend-design-pt-2",
                "e2e-testing"
            ]

            print("\n## Executor Statistics\n")

            for executor in executors_to_query:
                stats = context.calculate_executor_effectiveness(executor)
                if stats:
                    if args.format == "json":
                        print(json.dumps({
                            "executor": executor,
                            "success_rate": stats.success_rate,
                            "total_executions": stats.total_executions,
                            "trend": stats.trend,
                            "common_issues": stats.common_issues[:3]
                        }, indent=2))
                    else:
                        trend_icon = {"improving": "[UP]", "stable": "[--]", "declining": "[DN]"}.get(stats.trend, "[??]")
                        print(f"### {executor} {trend_icon}")
                        print(f"- Success Rate: {stats.success_rate:.0%}")
                        print(f"- Total Executions: {stats.total_executions}")
                        print(f"- Trend: {stats.trend}")
                        if stats.common_issues:
                            print(f"- Common Issues: {', '.join(stats.common_issues[:3])}")
                        print()
                else:
                    print(f"### {executor}")
                    print(f"- No data available (need {context.MIN_SAMPLES_FOR_STATS}+ executions)\n")

        except Exception as e:
            print(f"Warning: Could not get executor stats: {e}")

    # Get gate stats
    if memori_available and (args.gate or args.all_stats):
        try:
            memori = create_memori_client("skill:prd-pipeline")
            memori.enable()
            context = PipelineContext(memori)

            gates_to_query = [args.gate] if args.gate else [
                "schema-validation",
                "type-check",
                "lint",
                "test-pass",
                "build"
            ]

            print("\n## Gate Statistics\n")

            for gate in gates_to_query:
                stats = context.calculate_gate_pass_rate(gate)
                if stats:
                    if args.format == "json":
                        print(json.dumps({
                            "gate": gate,
                            "pass_rate": stats.pass_rate,
                            "total_checks": stats.total_checks,
                            "auto_fix_rate": stats.auto_fix_rate,
                            "common_failures": stats.common_failure_patterns[:3]
                        }, indent=2))
                    else:
                        print(f"### {gate}")
                        print(f"- Pass Rate: {stats.pass_rate:.0%}")
                        print(f"- Total Checks: {stats.total_checks}")
                        print(f"- Auto-Fix Rate: {stats.auto_fix_rate:.0%}")
                        if stats.common_failure_patterns:
                            print(f"- Common Failures: {', '.join(stats.common_failure_patterns[:3])}")
                        print()
                else:
                    print(f"### {gate}")
                    print(f"- No data available (need {context.MIN_SAMPLES_FOR_STATS}+ checks)\n")

        except Exception as e:
            print(f"Warning: Could not get gate stats: {e}")

    # Show full learning report if --all-stats
    if memori_available and args.all_stats:
        try:
            memori = create_memori_client("skill:prd-pipeline")
            memori.enable()
            context = PipelineContext(memori)

            print("\n" + "=" * 60)
            print(context.format_learning_report())
        except Exception as e:
            print(f"Warning: Could not generate learning report: {e}")

    # Show related documents
    print("\n" + "-" * 60)
    print("RELATED REFERENCES:")
    print("-" * 60)
    print("  - .claude/skills/prd-pipeline/references/executor-registry.md")
    print("  - .claude/skills/prd-pipeline/references/gate-protocol.md")
    print("  - .claude/skills/prd-pipeline/references/critic-checklist.md")
    print("  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md")


if __name__ == "__main__":
    main()
