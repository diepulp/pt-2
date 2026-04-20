#!/usr/bin/env python3
"""
PT-2 Query Analyzer

Analyzes PostgreSQL queries using EXPLAIN ANALYZE and provides optimization recommendations.

Usage:
    python query_analyzer.py --sql "SELECT * FROM visits WHERE player_id = $1" --conn $DATABASE_URL
    python query_analyzer.py --file query.sql --params '["uuid"]' --conn $DATABASE_URL
"""

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Optional


@dataclass
class QueryPlan:
    """Parsed query plan with analysis."""
    raw_plan: str
    planning_time_ms: float
    execution_time_ms: float
    total_time_ms: float
    has_seq_scan: bool
    has_index_scan: bool
    estimated_rows: int
    actual_rows: int
    row_estimate_ratio: float
    shared_hit_blocks: int
    shared_read_blocks: int
    cache_hit_ratio: float
    warnings: list[str]
    recommendations: list[str]


def parse_explain_output(explain_text: str) -> QueryPlan:
    """Parse EXPLAIN ANALYZE output and extract metrics."""
    lines = explain_text.strip().split("\n")

    # Extract timing
    planning_time = 0.0
    execution_time = 0.0
    for line in lines:
        if "Planning Time:" in line:
            match = re.search(r"Planning Time: ([\d.]+) ms", line)
            if match:
                planning_time = float(match.group(1))
        if "Execution Time:" in line:
            match = re.search(r"Execution Time: ([\d.]+) ms", line)
            if match:
                execution_time = float(match.group(1))

    # Detect scan types
    has_seq_scan = "Seq Scan" in explain_text
    has_index_scan = "Index Scan" in explain_text or "Index Only Scan" in explain_text

    # Extract row estimates
    estimated_rows = 0
    actual_rows = 0
    rows_match = re.search(r"rows=(\d+).*?actual.*?rows=(\d+)", explain_text)
    if rows_match:
        estimated_rows = int(rows_match.group(1))
        actual_rows = int(rows_match.group(2))

    row_ratio = estimated_rows / actual_rows if actual_rows > 0 else 0

    # Extract buffer stats
    shared_hit = 0
    shared_read = 0
    buffers_match = re.search(r"Buffers: shared hit=(\d+)(?: read=(\d+))?", explain_text)
    if buffers_match:
        shared_hit = int(buffers_match.group(1))
        shared_read = int(buffers_match.group(2) or 0)

    total_buffers = shared_hit + shared_read
    cache_hit_ratio = shared_hit / total_buffers if total_buffers > 0 else 1.0

    # Generate warnings
    warnings = []
    if has_seq_scan and not has_index_scan:
        warnings.append("Sequential scan detected - consider adding an index")
    if row_ratio > 10 or row_ratio < 0.1:
        warnings.append(f"Row estimate off by {row_ratio:.1f}x - statistics may be stale")
    if cache_hit_ratio < 0.9:
        warnings.append(f"Cache hit ratio is {cache_hit_ratio:.1%} - consider memory tuning")
    if execution_time > 100:
        warnings.append(f"Execution time {execution_time:.1f}ms exceeds 100ms threshold")

    # Generate recommendations
    recommendations = []
    if has_seq_scan:
        recommendations.append("Add index on filtered columns")
        recommendations.append("Check if table statistics are up to date: ANALYZE table_name")
    if "Nested Loop" in explain_text and execution_time > 50:
        recommendations.append("Consider rewriting with JOIN instead of correlated subquery")
    if "Sort" in explain_text and "external" in explain_text.lower():
        recommendations.append("Query using disk sort - increase work_mem or add index for ORDER BY")
    if row_ratio > 10:
        recommendations.append("Run ANALYZE to update table statistics")
    if execution_time > 100:
        recommendations.append("Consider query caching or materialized view")

    return QueryPlan(
        raw_plan=explain_text,
        planning_time_ms=planning_time,
        execution_time_ms=execution_time,
        total_time_ms=planning_time + execution_time,
        has_seq_scan=has_seq_scan,
        has_index_scan=has_index_scan,
        estimated_rows=estimated_rows,
        actual_rows=actual_rows,
        row_estimate_ratio=row_ratio,
        shared_hit_blocks=shared_hit,
        shared_read_blocks=shared_read,
        cache_hit_ratio=cache_hit_ratio,
        warnings=warnings,
        recommendations=recommendations
    )


def format_report(plan: QueryPlan, sql: str) -> str:
    """Format analysis report."""
    lines = [
        "# Query Analysis Report",
        "",
        "## Query",
        "```sql",
        sql,
        "```",
        "",
        "## Timing",
        f"- **Planning Time**: {plan.planning_time_ms:.2f} ms",
        f"- **Execution Time**: {plan.execution_time_ms:.2f} ms",
        f"- **Total Time**: {plan.total_time_ms:.2f} ms",
        "",
        "## Scan Analysis",
        f"- **Sequential Scan**: {'Yes' if plan.has_seq_scan else 'No'}",
        f"- **Index Scan**: {'Yes' if plan.has_index_scan else 'No'}",
        "",
        "## Row Estimates",
        f"- **Estimated Rows**: {plan.estimated_rows:,}",
        f"- **Actual Rows**: {plan.actual_rows:,}",
        f"- **Estimate Ratio**: {plan.row_estimate_ratio:.2f}x",
        "",
        "## Buffer Cache",
        f"- **Shared Hit Blocks**: {plan.shared_hit_blocks:,}",
        f"- **Shared Read Blocks**: {plan.shared_read_blocks:,}",
        f"- **Cache Hit Ratio**: {plan.cache_hit_ratio:.1%}",
    ]

    if plan.warnings:
        lines.extend([
            "",
            "## Warnings",
        ])
        for w in plan.warnings:
            lines.append(f"- {w}")

    if plan.recommendations:
        lines.extend([
            "",
            "## Recommendations",
        ])
        for r in plan.recommendations:
            lines.append(f"- {r}")

    lines.extend([
        "",
        "## Raw Plan",
        "```",
        plan.raw_plan,
        "```"
    ])

    return "\n".join(lines)


def run_explain(sql: str, params: list, conn_string: str) -> str:
    """Run EXPLAIN ANALYZE on the query."""
    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2 not installed. Install with: pip install psycopg2-binary")
        sys.exit(1)

    explain_sql = f"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) {sql}"

    conn = psycopg2.connect(conn_string)
    try:
        with conn.cursor() as cur:
            cur.execute(explain_sql, params)
            rows = cur.fetchall()
            return "\n".join(row[0] for row in rows)
    finally:
        conn.close()


def simulate_explain() -> str:
    """Return simulated EXPLAIN output for demo mode."""
    return """Seq Scan on visits  (cost=0.00..1234.56 rows=100 width=200) (actual time=0.050..45.123 rows=150 loops=1)
  Filter: (player_id = $1)
  Rows Removed by Filter: 9850
  Buffers: shared hit=50 read=25
Planning Time: 0.150 ms
Execution Time: 45.500 ms"""


def main():
    parser = argparse.ArgumentParser(description="PT-2 Query Analyzer")
    parser.add_argument("--sql", type=str, help="SQL query to analyze")
    parser.add_argument("--file", type=str, help="File containing SQL query")
    parser.add_argument("--params", type=str, default="[]",
                        help="JSON array of query parameters")
    parser.add_argument("--conn", type=str, help="Database connection string")
    parser.add_argument("--output", type=str, help="Output file for report")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--demo", action="store_true", help="Run with simulated data")

    args = parser.parse_args()

    # Get SQL query
    sql = args.sql
    if args.file:
        with open(args.file) as f:
            sql = f.read()

    if not sql:
        parser.error("Either --sql or --file is required")

    # Parse parameters
    params = json.loads(args.params)

    # Get explain output
    if args.demo:
        explain_output = simulate_explain()
    elif args.conn:
        explain_output = run_explain(sql, params, args.conn)
    else:
        parser.error("Either --conn or --demo is required")

    # Parse and analyze
    plan = parse_explain_output(explain_output)

    # Output
    if args.json:
        output = json.dumps({
            "sql": sql,
            "planning_time_ms": plan.planning_time_ms,
            "execution_time_ms": plan.execution_time_ms,
            "has_seq_scan": plan.has_seq_scan,
            "has_index_scan": plan.has_index_scan,
            "cache_hit_ratio": plan.cache_hit_ratio,
            "warnings": plan.warnings,
            "recommendations": plan.recommendations
        }, indent=2)
    else:
        output = format_report(plan, sql)

    if args.output:
        with open(args.output, "w") as f:
            f.write(output)
        print(f"Report saved to: {args.output}")
    else:
        print(output)

    # Exit with error if critical warnings
    if plan.has_seq_scan and plan.execution_time_ms > 100:
        sys.exit(1)


if __name__ == "__main__":
    main()
