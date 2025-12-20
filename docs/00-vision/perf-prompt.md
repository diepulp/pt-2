Performance Expert” role definition (tailored to Supabase + API endpoints)

Here’s a clean formulation you can put in a doc / hiring post / internal charter.

Title

Performance Engineer (Supabase/Postgres + API)

Mission

Ensure the system meets latency, throughput, and reliability targets by continuously measuring, profiling, and preventing regressions across:

Supabase queries (Postgres + RLS + RPC)

API route handlers (Next.js / server layer)

end-to-end user flows (key screens)

Core responsibilities

1) Define and enforce SLOs / KPIs

Establish latency budgets per endpoint & user flow (p50/p95/p99)

Error rate targets (HTTP 5xx, PostgREST errors, timeouts)

Throughput targets (RPS) and concurrency expectations

“Perf regression = build fails” thresholds in CI

2) Build a repeatable benchmarking harness

Scripted benchmark suite for:

SQL + RPC (Supabase functions)

PostgREST queries

API endpoints (server routes)

Deterministic datasets + seed sizes (small/medium/large casino)

Report generation: before/after diff, trend lines, annotated root cause

3) DB/query performance engineering

Investigate slow queries with:

EXPLAIN (ANALYZE, BUFFERS)

index strategy

query shape changes

RLS policy cost / predicate pushdown issues

Identify contention (locks), bloat, and hot tables

Validate connection pooling behavior (transaction pooling constraints, per-request session vars, etc.)

4) Observability (minimum viable)

Metrics: request latency, DB latency, RPC latency, error rates

Tracing or structured logs with correlation IDs

Dashboards + alerts for “p95 is drifting” and “DB time dominates”

5) Performance review process

Adds a Perf Checklist to PRs

Runs weekly benchmark baseline on main branch

Maintains a “Top 10 expensive queries/endpoints” list

Deliverables (what you get for paying them)

Perf KPI spec (SLOs, measurement definitions, acceptance thresholds)

Benchmark repo/harness + instructions + CI integration

Baseline report (current p50/p95/p99 + bottlenecks)

Perf regression gate (fail PR if p95 worsens beyond X%)

DB indexing & RLS cost audit with concrete migration recommendations

Ongoing monthly “Perf health” report

KPIs to test (practical, not academic)

API endpoint KPIs

Latency: p50 / p95 / p99

Error rate: % non-2xx, timeouts

Throughput: max sustainable RPS at target p95

DB time ratio: DB time / total time (where the time goes)

Supabase/Postgres KPIs

Query execution time distribution

Rows scanned vs rows returned (bad selectivity = pain)

Cache hit ratio (where relevant)

Lock waits / deadlocks

RLS overhead estimate (same query with/without RLS in controlled env, or policy complexity proxies)

Connection pool saturation symptoms (queued requests, spikes in latency under concurrency)

End-to-end flow KPIs

“Open slip → update → close slip” full path latency

“Search player → open visit → view ledger” etc. 