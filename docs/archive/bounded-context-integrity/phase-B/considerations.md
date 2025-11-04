Risks / Gaps & How to Fix
1) Supabase / PostgREST gotchas (Views)

Risk: PostgREST treats views differently. Without a stable primary key, it won’t expose PATCH/DELETE (fine), but also some client libs assume a primary key for type inference.
Fix:

Expose a primary key in views where feasible (e.g., forward ratingslip.id AS id).

Ensure security_invoker = on behavior (default in Postgres 15+) doesn’t break RLS expectations—be explicit in grants.

2) RLS & Security Barriers

Risk: Views can inadvertently bypass intended row filters if grants are too broad or if underlying tables have permissive RLS.
Fix:

Keep RLS on base tables (PFT) strict.

Grant SELECT only on the views to non-finance roles.

Consider SECURITY BARRIER on the view to prevent predicate pushdown surprises.

Add a policy test: user with Visit role cannot select raw PFT but can select the view.
3) Aggregation Semantics (multiple PFT rows)

Risk: You assume safe SUM() by visit_id. Edge cases include corrections/reversals, partial cancellations, or mid-session splits.
Fix:

Define event types and sign convention (e.g., reversal rows are negative).

Add a CHECK constraint or enum to guarantee only allowed event types.

Document exact aggregation contract in the interface doc (what’s in/out, time window, gaming day alignment).

4) Gaming Day & Timezone Alignment

Risk: Casinos use gaming day offsets; naive UTC aggregation by visit_id may misalign reports.
Fix:

If CasinoSettings(gamingDayStart, timezone) exist (they do per your schema snapshot), clarify that Visit and PFT share the same gaming-day anchor.

If you’ll ever need gaming-day aggregates, add a separate view visit_financial_summary_gd keyed by (casino_id, gaming_day, visit_id).

5) Performance SLO proof, not hope

Risk: “p95 < 100ms” is named, but no repeatable harness is specified.
Fix:

Pin a small **pgbench/k6workload** (10–20 representative queries) and **store query texts** in repo (e.g.,.validation/queries.sql`).

Capture EXPLAIN (ANALYZE, BUFFERS) for top 3 queries pre/post.

Track pg_stat_statements deltas in the PR.

6) Migration Ordering / Two-phase removal

Risk: Removing columns too early breaks shadow consumers.
Fix: Make it two migrations:

Add views + indexes + grants, migrate readers to the view.

After a release cycle (or checks pass), drop columns from ratingslip.

Add a pre-drop CI check that fails if any code path still selects the legacy columns (simple grep or SQL-linter rule).

7) Idempotency / Uniqueness in PFT

Risk: Double posts create silent inflation of sums.
Fix: Enforce a unique guard such as (visit_id, event_type, idempotency_key) and require idempotency_key for write APIs. Document this in the ADR consequences.

8) Interface Anti-responsibilities need teeth

Risk: “Visit never writes ledger tables” is stated but not enforced.
Fix: No INSERT/UPDATE/DELETE grants for Visit role on PFT. Add a contract test in CI that tries to write and must fail.

9) Consumer Discovery for Deprecation

Risk: You can’t deprecate the compat view if you don’t know who’s reading it.
Fix: If feasible, log view usage (pg_audit or lightweight statement logging filter) for one cycle and attach counts to the Phase B PR. At minimum, run code-search and bundle analyzer to list callers.

10) GraphQL Exposure (if used)

Risk: Supabase GraphQL exposure may not auto-generate types for views as expected.
Fix: Verify GraphQL coverage for the two views. If missing, expose RPCs or stable REST filters as a temporary contract for UI.