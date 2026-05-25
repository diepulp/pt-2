---
prd: PRD-089
prd_title: Wave 2 Phase 2.5 — Observability + Sign-Off
service: PlayerFinancialService
mvp_phase: 2
stage: 1-skeleton

# Intake authority chain
fib_h: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md
fib_s: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/wave-2/FIB-S-TRANSACTIONAL-OUTBOX.json
fib_s_loaded: false
fib_s_loaded_reason: "PRD-089 frontmatter does not declare structured_ref; pipeline runs in PRD-only mode per intake-traceability-protocol.md"

# Pipeline state (set by build-pipeline orchestrator)
gov010_check: waived:wave-2-phase-2.5-signoff-governing-adrs-in-affects-field
complexity_prescreen: full
http_boundary: true

# Audit patch trail (applied 2026-05-21, pre-approval-gate)
audit_patches_applied:
  - id: EXEC-089-P0-PHASE-24-EVIDENCE-GATE
    severity: P0
    targets: [WS3_SIGNOFF, WS4_GOVERNANCE]
    summary: "Hard precondition citing PRD-088/EXEC-088/commit 931f5ed9/checkpoint/residual-gap classification before sign-off and tracker reconciliation may execute."
  - id: EXEC-089-P1-TEST-GATE-ORDERING
    severity: P1
    targets: [execution_phases]
    summary: "Moved test-pass into Phase 1 gates; Phase 2 documentation entry requires WS1+WS2 implementation gates to pass first."
  - id: EXEC-089-P1-LAG-SAMPLE-CLOCK-CONTRACT
    severity: P1
    targets: [WS1_LOG]
    summary: "Lag samples redefined as DB-clock (processed_at - created_at via EXTRACT EPOCH), not app-server Date.now(); one extra read per branch per cycle, indexed by event_id."
  - id: EXEC-089-P1-BACKLOG-CLAIMABILITY-DEFINITION
    severity: P1
    targets: [WS1_LOG]
    summary: "Backlog count predicates explicitly tabulated and cross-checked against rpc_claim_class_a_outbox_batch and rpc_claim_operational_outbox_batch claim predicates."
  - id: EXEC-089-P1-RETENTION-REPLAY-BOUNDARY-GATE
    severity: P1
    targets: [WS3_SIGNOFF, WS2_RETENTION]
    summary: "Triple acceptance assertion on sign-off replay-boundary language (boundary stated / authoring-store reseed escape hatch named / FIB-ADR amendment requirement named); cross-linked with WS2 7-day interval."
  - id: EXEC-089-P2-EXPLAIN-INDEX-BRITTLENESS
    severity: P2
    targets: [WS2_RETENTION]
    summary: "Split EXPLAIN-index test into deterministic index-exists + predicate-alignment assertions (no planner luck), with advisory planner-evidence test behind RUN_PLANNER_EVIDENCE_TESTS env gate."

# Workstream Definitions
workstreams:
  WS1_LOG:
    name: Relay cycle log line + branch lag-sample contract
    description: Emit one structured log line per relay cycle from a cron-compatible relay handler (authenticated and unauthenticated schema variants per FR-1/FR-2); add a GET export for Vercel cron that shares the same auth and processing path as the relay route; extend Class A and operational consumer branch result types with lagSamplesMs; add lag-aggregate helper (min/p50/p95/max); unit tests for both log variants and the lag-sample exclusion rule.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - app/api/internal/outbox-relay/route.ts
      - services/player-financial/outbox-consumer.ts
      - services/player-financial/outbox-operational-consumer.ts
      - services/player-financial/dtos.ts
      - services/player-financial/__tests__/outbox-relay-log-emission.test.ts
      - services/player-financial/__tests__/lag-aggregates.test.ts
    gate: type-check
    estimated_complexity: medium

  WS2_RETENTION:
    name: Retention RPC + supporting index + cleanup route + cron
    description: Create rpc_cleanup_outbox_processed (SECURITY DEFINER, CTE-based, FOR UPDATE SKIP LOCKED, p_max_rows validation) plus partial index idx_finance_outbox_processed_retention; add GET /api/internal/outbox-cleanup with CRON_SECRET auth; add daily Vercel cron entry; unit test for route auth/shape; integration test verifying age gate, cap behaviour, invalid-cap rejection, and index usage.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - supabase/migrations/YYYYMMDDHHMMSS_create_rpc_cleanup_outbox_processed.sql
      - app/api/internal/outbox-cleanup/route.ts
      - vercel.json
      - app/api/internal/outbox-cleanup/__tests__/route.test.ts
      - __tests__/integration/outbox-cleanup.int.test.ts
    gate: schema-validation
    estimated_complexity: high

  WS3_SIGNOFF:
    name: Wave 2 sign-off artifact
    description: Author WAVE-2-SIGN-OFF.md with the eight required sections (PRD §6.3) — phase summary, I1-I4 proof record, DEC-1 resolution, PROD-ANCHOR-STD-001 ratification, three-category post-Wave-2 backlog reconciliation against PRD-088 closure, canonical sign-off language, certification-level mapping, hand-off. Replay-window constraint and seven-question pilot containment honored.
    executor: lead-architect
    executor_type: skill
    depends_on: [WS1_LOG, WS2_RETENTION]
    # P0-PHASE-24-EVIDENCE-GATE (audit patch): WS3 may NOT execute until Phase 2.4
    # closure evidence is on disk. Sign-off cannot be generated from assumed
    # completion.
    preconditions:
      phase_24_closure_evidence:
        - artifact: docs/10-prd/PRD-088-wave2-phase-2.4-operational-telemetry-projection-v0.md
          requirement: PRD file present on disk
        - artifact: docs/21-exec-spec/EXEC-088-wave2-phase-2.4-operational-telemetry-projection.md
          requirement: EXEC-SPEC file present on disk with final verdict
        - artifact: .claude/skills/build-pipeline/checkpoints/PRD-088.json
          requirement: 'status == "complete" with non-empty workstreams + gate_evidence'
        - artifact: git commit 931f5ed9
          requirement: 'git log --oneline | grep "PRD-088 Phase 2.4 — operational telemetry projection complete" must resolve'
        - artifact: residual gap classification
          requirement: PRD-088 closure must explicitly identify PWB-003 as closed and PWB-001/PWB-002/W2-OBS-CASHOUT-PRODUCER-001 as deferred
      gate_evaluation: All five evidence items must resolve before WS3 dispatch. Orchestrator MUST verify with `git log --oneline | grep PRD-088` and `jq '.status == "complete"' < PRD-088.json` before invoking the lead-architect skill for WS3.
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md
    gate: lint
    estimated_complexity: high

  WS4_GOVERNANCE:
    name: PROD-ANCHOR-STD-001 ratification + tracker re-sync
    description: Promote PROD-ANCHOR-STD-001 from accepted_for_wave_2_5_signoff to ratified with ratified_by/ratified_date; advance WAVE-2-TRACKER.json cursor to Phase 2.5 and mark Phase 2.4 complete; reconcile WAVE-2-PROGRESS-TRACKER.md current state; update actions/ROLLOUT-TRACKER.json cursor.
    executor: lead-architect
    executor_type: skill
    depends_on: [WS1_LOG, WS2_RETENTION]
    # P0-PHASE-24-EVIDENCE-GATE (audit patch): WS4 may NOT execute until Phase 2.4
    # closure evidence is on disk. Tracker reconciliation cannot be generated
    # from assumed completion — the commit hash recorded in WAVE-2-TRACKER.json
    # phases[id="2.4"] MUST be the actual merge commit, not a placeholder.
    preconditions:
      phase_24_closure_evidence:
        - artifact: docs/10-prd/PRD-088-wave2-phase-2.4-operational-telemetry-projection-v0.md
          requirement: PRD file present on disk
        - artifact: docs/21-exec-spec/EXEC-088-wave2-phase-2.4-operational-telemetry-projection.md
          requirement: EXEC-SPEC file present on disk with final verdict
        - artifact: .claude/skills/build-pipeline/checkpoints/PRD-088.json
          requirement: 'status == "complete" with non-empty workstreams + gate_evidence'
        - artifact: git commit 931f5ed9
          requirement: 'commit hash MUST be the value written into WAVE-2-TRACKER.json phases[id="2.4"].commit_hash'
        - artifact: residual gap classification
          requirement: WAVE-2-TRACKER.json post-edit MUST reflect PWB-003 as closed and PWB-001/PWB-002/W2-OBS-CASHOUT-PRODUCER-001 as deferred (no contradiction with WS3 sign-off)
      gate_evaluation: All five evidence items must resolve before WS4 dispatch. Orchestrator MUST verify with `git log --oneline | grep PRD-088` and `jq '.status == "complete"' < PRD-088.json` before invoking the lead-architect skill for WS4.
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json
      - docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
    gate: lint
    estimated_complexity: medium

# Execution Phases (topologically sorted, parallel where possible)
# P1-TEST-GATE-ORDERING (audit patch): test-pass MUST succeed for WS1_LOG and
# WS2_RETENTION before any Phase 2 documentation workstream may begin. Relay log
# behaviour and cleanup retention behaviour must be proven before sign-off and
# tracker reconciliation start — otherwise the sign-off describes unproven
# behaviour.
execution_phases:
  - name: Phase 1 - Implementation (parallel)
    parallel: [WS1_LOG, WS2_RETENTION]
    gates: [type-check, schema-validation, lint, test-pass]

  - name: Phase 2 - Documentation (parallel)
    parallel: [WS3_SIGNOFF, WS4_GOVERNANCE]
    gates: [lint]
    enters_after: "All Phase 1 gates (type-check, schema-validation, lint, test-pass) pass for WS1_LOG and WS2_RETENTION"

# Validation Gates
gates:
  schema-validation:
    command: npm run db:types-local
    success_criteria: "Exit code 0; migration applies cleanly; partial index present"

  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0"

  lint:
    command: npm run lint -- --max-warnings=0
    success_criteria: "Exit code 0; zero warnings (max-warnings=0)"

  test-pass:
    command: npm run test:verify
    success_criteria: "All unit + integration tests pass (RUN_INTEGRATION_TESTS=true)"

# External Dependencies
external_dependencies:
  - prd: PRD-088
    service: PlayerFinancialService
    required_for: "operational consumer + relay branch result shape; PRD-089 extends both"
  - prd: PRD-087
    service: PlayerFinancialService
    required_for: "Class A consumer + outbox-consumer branch result shape"
  - prd: PRD-086
    service: PlayerFinancialService
    required_for: "outbox-observability admin surface (referenced in operator flow §6.1)"

# Risks
risks:
  - risk: "Cleanup RPC blocks relay claim path during heavy retention runs"
    mitigation: "CTE LIMIT 1000 + FOR UPDATE SKIP LOCKED; both relay claim and cleanup use SKIP LOCKED so neither blocks the other (PRD §7.2 risk row)"
  - risk: "Retention deletes a row another component still needs to replay"
    mitigation: "7-day replay window declared in WAVE-2-SIGN-OFF.md NFR-5; dead-letter rows preserved by predicate (processed_at IS NULL excluded)"
  - risk: "Sign-off overclaims completeness"
    mitigation: "GR-1 canonical phrase, GR-2 three-category backlog, GR-3 Principle 9 distinction; devils-advocate review pre-merge per DoD"
  - risk: "Validator rejects devils-advocate as executor (skill not in VALID_SKILLS)"
    mitigation: "WS5_REVIEW folded into Phase 4 DoD gate; orchestrator dispatches Skill(skill='devils-advocate') as final pre-completion check, not as a YAML workstream"
  - risk: "Index CONCURRENTLY not permitted by migration tooling"
    mitigation: "PRD §4 item 5a provides fallback: bounded lock_timeout, documented table-size posture in migration header, fail-fast"

---

# EXECUTION-SPEC: EXEC-089 — Wave 2 Phase 2.5 (Observability + Sign-Off)

## Overview

This PRD adds one structured relay-cycle log line containing backlog and lag fields (emitted from the existing relay route) plus one cleanup-cycle log line from a new cleanup route, a cron-driven retention cleanup mechanism for `finance_outbox` rows with `processed_at` older than 7 days, and the Wave 2 sign-off artifact that ratifies PROD-ANCHOR-STD-001 and reconciles the post-Wave-2 backlog against PRD-088 closure state; it does not add producers, consumers, dashboards, replay/repair actions, retention for unprocessed rows, retention for `processed_messages`, multi-consumer fan-out, or any work that resolves PWB-001, PWB-002, or W2-OBS-CASHOUT-PRODUCER-001.

## Scope

**In Scope** (PRD §4):
1. Relay route emits authenticated + unauthenticated cycle log variants with backlog (split by fact_class and claimability) and processing-lag aggregates.
2. Branch lag-sample contract: each consumer branch returns `lagSamplesMs: number[]` containing only successfully processed rows.
3. `rpc_cleanup_outbox_processed(p_max_rows INTEGER DEFAULT 1000) RETURNS INTEGER` — SECURITY DEFINER, CTE-based DELETE, `FOR UPDATE SKIP LOCKED`, p_max_rows validation.
4. Partial index `idx_finance_outbox_processed_retention` for predicate support.
5. `GET /api/internal/outbox-cleanup` with `CRON_SECRET` bearer auth; structured cleanup-cycle log line.
6. Daily Vercel cron entry (`0 7 * * *`) for cleanup route.
7. `WAVE-2-SIGN-OFF.md` authored per §6.3 (eight sections).
8. `PROD-ANCHOR-STD-001` status → `ratified`.
9. Three-tracker reconciliation: `WAVE-2-TRACKER.json`, `WAVE-2-PROGRESS-TRACKER.md`, `actions/ROLLOUT-TRACKER.json`.
10. Unit tests (both log-line variants, lag-sample exclusion, cleanup route GET, POST-absence, success log fields).
11. Integration tests (age-band coverage, p_max_rows cap, invalid-cap rejection, first-run cap, EXPLAIN-index usage).

**Out of Scope** (PRD §2.3, §4):
- No interactive dashboard, no Grafana, no metrics export, no Prometheus endpoint, no alerting.
- No retention for `processed_messages`, projection tables, or unprocessed `finance_outbox` rows.
- No producer wiring (PWB-001, PWB-002, W2-OBS-CASHOUT-PRODUCER-001 remain queued).
- No consumer projection semantics changes, no relay scheduling changes, no schema additions beyond cleanup RPC + index.
- No new UI surface, no `app/(dashboard)/**` or `components/**` additions.

## Architecture Context

**Bounded context ownership** (SRM v4.11.0): `player-financial` owns `finance_outbox` and its derivative state. The relay route, both consumer branches, and the cleanup RPC are owned by player-financial. Documentation workstreams (sign-off, governance YAML, trackers) are governance-tier and do not invoke service ownership rules.

**ADR alignment** (frozen, not edited):
- ADR-052 (financial fact model dual-layer): Class A vs operational separation reflected in backlog split.
- ADR-053 (financial system scope): outbox is propagation infrastructure, not authoritative state.
- ADR-054 (event propagation surface contract): no external consumer; internal-only.
- ADR-055 (cross-class authoring parity): unchanged by this PRD.
- ADR-056 (relay worker execution environment): Vercel cron + service-role HTTP route is the only sanctioned execution path; cleanup follows the same pattern.

**Containment honored** (Seven-Question Filter / pilot containment):
- No `pg_cron` (banned per pilot containment).
- No Slack/external notifications.
- No new operator-facing surface.
- Vercel cron infrastructure already in use; one-line `vercel.json` addition.

## Workstream Details

### WS1_LOG: Relay cycle log line + branch lag-sample contract

**Purpose**: Emit operationally meaningful per-cycle observability into Vercel function logs so on-call can distinguish healthy quiet from unhealthy stall without opening the admin surface.

**Outputs** (high-level):
- `app/api/internal/outbox-relay/route.ts` — emit one structured `outbox_relay_cycle` line per invocation; add a GET export for Vercel cron that shares the same auth and processing path as the relay route; two schema variants (authenticated vs unauthenticated per FR-1).
- `services/player-financial/outbox-consumer.ts` — extend Class A branch result with `lagSamplesMs: number[]`.
- `services/player-financial/outbox-operational-consumer.ts` — extend operational branch result with `lagSamplesMs: number[]`.
- `services/player-financial/dtos.ts` — branch result type updates (internal contract, not HTTP body).
- Lag-aggregate helper (min/p50/p95/max from combined sample array).
- Unit tests: both log variants; lag-sample exclusion rule (duplicates, skipped, failed, claim-error, auth-fail outcomes do not contribute samples).

**Estimated complexity**: Medium. Two files extended, one route amended, one helper introduced, four-to-six unit tests.

**Gate**: `type-check` (paired with lint and unit-test pass during execution).

#### Lag-sample clock contract (P1-LAG-SAMPLE-CLOCK-CONTRACT, audit patch)

The PRD FR-1 implementation note describes lag as `Date.now() - new Date(row.created_at).getTime()` — an **app-server-clock vs DB-row-timestamp** subtraction. The audit patch requires either (a) switching to DB-based lag, or (b) explicit skew justification + test.

**EXEC-089 resolution: switch to DB-based lag.** Lag is defined as `EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000`, computed by the database from `finance_outbox` row values, not the app-server clock. Concretely:

- After each consumer branch completes its cycle, the branch issues one read-only query against `finance_outbox` filtered by the `event_id` set whose `processed_at` was newly stamped this cycle: `SELECT EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000 AS lag_ms FROM public.finance_outbox WHERE event_id = ANY($1::uuid[])`.
- The query returns the lag-sample array. The branch result type carries `lagSamplesMs: number[]` derived from this query, not from `Date.now()`.
- Duplicate/skipped/failed/claim-error/auth-fail outcomes never appear in the `event_id` set passed to this query, so the exclusion rule is enforced by construction.
- The lag-aggregate helper (min/p50/p95/max) operates on the combined `classA.lagSamplesMs ++ operational.lagSamplesMs` array in TypeScript, identical to PRD FR-1 semantics.
- The cycle issues at most **one** extra read query per branch (two extra reads per authenticated cycle) — bounded, indexed via `event_id` primary key — within NFR-2 log-volume posture.

**Why this matters**: `Date.now()` on a Vercel function and `created_at` set by Postgres `now()` are two distinct clocks. NTP discipline keeps them within ~100ms in normal operation, but cold-start clock-skew and Vercel-edge time-source variance can produce outliers that look like real lag regressions when they are actually clock drift. Using a single DB clock eliminates the contention.

**Implementation flag for backend-service-builder**: amend the PRD FR-1 implementation note in the route comment, citing this clock contract. The PRD's literal `Date.now()` wording is intent-only; the EXEC-SPEC supersedes implementation detail per the build pipeline's "PRD specifies *what*, EXEC-SPEC specifies *how*" boundary.

**Acceptance**: Unit test for the lag-aggregate helper fixture uses synthesized lag samples (DB-derived `number[]`); no `Date.now()` call appears in the lag-sample production path. Code review rejects any `Date.now()` introduction adjacent to `lagSamplesMs` assignment.

#### Backlog count predicate contract (P1-BACKLOG-CLAIMABILITY-DEFINITION, audit patch)

The `outbox_backlog_size` log fields MUST use SQL predicates that exactly match the relay branch claim paths. Mismatched predicates produce backlog counts that disagree with what the relay can actually drain, which is precisely the on-call confusion this log line is meant to eliminate.

**Canonical predicates** (must match `rpc_claim_class_a_outbox_batch` and `rpc_claim_operational_outbox_batch` source migrations verbatim):

| Log field | SQL predicate |
|-----------|---------------|
| `outbox_backlog_size.ledger.total` | `fact_class = 'ledger' AND processed_at IS NULL` |
| `outbox_backlog_size.operational.claimable` | `fact_class = 'operational' AND processed_at IS NULL AND delivery_attempts < 5` |
| `outbox_backlog_size.operational.dead_letter` | `fact_class = 'operational' AND processed_at IS NULL AND delivery_attempts >= 5` |
| `outbox_backlog_size.operational.total` | `claimable + dead_letter` (computed in TS, not SQL — invariant equals `fact_class = 'operational' AND processed_at IS NULL`) |

**Cross-RPC parity check** (backend-service-builder must verify during WS1 implementation):
- Inspect `rpc_claim_class_a_outbox_batch` migration; confirm ledger-branch claim predicate matches `ledger.total` predicate above.
- Inspect `rpc_claim_operational_outbox_batch` migration; confirm operational claim excludes `delivery_attempts >= 5` and matches `operational.claimable` predicate above.
- If either RPC's predicate has drifted (e.g., extra column filter, different `delivery_attempts` threshold), update the log-line predicate to match. The RPC claim path is the source of truth — the log line is its observer.

**Rows intentionally excluded from any branch**: none under current Wave 2 producer set. If a future fact_class is added (e.g., a dependency-event branch), the log schema MUST be extended in the same migration that adds the branch, not retrofitted.

**Acceptance**: Unit test fixtures seed `finance_outbox` rows across all four claimability states (ledger pending, operational claimable, operational dead-letter, processed) and assert the log line counts match the seed. Integration test reads the log line emitted during a real relay cycle against a seeded DB and validates field values against direct SQL counts of the same predicates.

**Stage 2: pending expert consultation** — backend-service-builder will refine consumer branch types, the DB lag-query implementation, predicate-parity cross-check against claim RPCs, percentile computation method, and test fixture shape.

---

### WS2_RETENTION: Retention RPC + supporting index + cleanup route + cron

**Purpose**: Bound `finance_outbox` growth via 7-day retention on processed rows, exposed through a cron-only HTTP surface that mirrors the relay route pattern.

**Outputs** (high-level):
- `supabase/migrations/YYYYMMDDHHMMSS_create_rpc_cleanup_outbox_processed.sql`:
  - `rpc_cleanup_outbox_processed(p_max_rows INTEGER DEFAULT 1000) RETURNS INTEGER`
  - SECURITY DEFINER, `SET search_path = ''`, EXECUTE revoked from anon/authenticated, granted only to service_role.
  - CTE-based DELETE (PostgreSQL `DELETE` does not accept top-level `LIMIT`) with `FOR UPDATE SKIP LOCKED` in the doomed CTE.
  - p_max_rows validation: rejects NULL, < 1, > 1000 before row locks.
  - Partial index `idx_finance_outbox_processed_retention ON public.finance_outbox (processed_at, event_id) WHERE processed_at IS NOT NULL`.
- `app/api/internal/outbox-cleanup/route.ts`:
  - `GET` only (no production POST).
  - `CRON_SECRET` bearer auth validated before any DB access (NFR-3).
  - Service-role client constructed only after auth passes.
  - Returns `{ deleted: N }` on success; `{ error: 'cleanup_failed' }` on RPC failure with 500.
  - Structured `outbox_cleanup_cycle` log line with `max_rows`, `capped` fields.
- `vercel.json` — second cron entry `0 7 * * *` for cleanup route.
- Unit tests: 401 on bad auth with no DB access; 200 + `{ deleted: N }` on success; 500 + failure log on RPC error; POST not exported; success log includes `max_rows: 1000` and `capped: true` when `deleted === 1000`.
- Integration test (`RUN_INTEGRATION_TESTS=true`): three age bands (now / 6 days / 8 days) verifying only 8-day row deleted; p_max_rows cap behaviour; invalid-cap rejection; first-run cap.

#### EXPLAIN-index integration test (P2-EXPLAIN-INDEX-BRITTLENESS, audit patch)

Naive `EXPLAIN`-uses-index assertions on small seeded tables are brittle: Postgres's planner may choose a seq scan over an index when the table has few rows because seq scan is genuinely cheaper at small cardinalities. A test that passes when the planner happens to pick the index is testing planner heuristics, not index correctness.

**EXEC-089 resolution: split the EXPLAIN assertion into two deterministic checks.**

1. **Index-exists assertion** (deterministic, no planner involvement):
   ```sql
   SELECT EXISTS (
     SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename = 'finance_outbox'
       AND indexname = 'idx_finance_outbox_processed_retention'
   );
   ```
   Asserts the index was created with the correct name and lives on the correct table.

2. **Predicate-alignment assertion** (deterministic, no planner involvement):
   ```sql
   SELECT indexdef FROM pg_indexes
   WHERE indexname = 'idx_finance_outbox_processed_retention';
   ```
   Asserts the returned `indexdef` string contains both:
   - The column tuple `(processed_at, event_id)` in that order.
   - The partial predicate `WHERE processed_at IS NOT NULL`.

   This proves the index was created with the predicate that matches the cleanup CTE's WHERE clause, without relying on the planner choosing it.

**Optional planner-evidence assertion** (advisory only, behind `RUN_PLANNER_EVIDENCE_TESTS=true` env gate): seed at least 10,000 processed rows older than 7 days plus 1,000 processed rows newer than 7 days, then `EXPLAIN (FORMAT JSON) WITH doomed AS (...) SELECT 1 FROM doomed`. Assert the `Plan` tree contains a node referencing `idx_finance_outbox_processed_retention`. Skip on default test runs to avoid 11k-row seed overhead.

**Rationale**: The two deterministic assertions prove the cleanup migration delivers the *artifact* the PRD requires (a partial index aligned with the cleanup predicate). The advisory planner-evidence assertion is the bulkier check that proves the planner actually uses it at scale; it should run pre-merge but not on every PR. Either approach satisfies PRD §8 DoD "retention partial index `idx_finance_outbox_processed_retention` present; `EXPLAIN` of the doomed CTE shows index usage on non-trivial row counts."

**Acceptance for WS2**: Both deterministic assertions pass; optional planner-evidence test passes under `RUN_PLANNER_EVIDENCE_TESTS=true` in CI nightly or pre-merge runs.

**Estimated complexity**: High. Migration with non-trivial RPC, new route with auth + structured logging, multiple integration tests with `RUN_INTEGRATION_TESTS=true` directive, plus the split EXPLAIN-index test pattern.

**Gate**: `schema-validation` (paired with type-check and test-pass during execution).

**Stage 2: pending expert consultation** — backend-service-builder will refine the migration header (CONCURRENTLY decision and fallback), RPC body skeleton, route auth flow, log-line emission helper reuse from WS1_LOG, and integration test fixtures (including the two-assertion EXPLAIN pattern above); `rls-expert` will review the cleanup RPC grant/search_path posture, and `performance-engineer` will review the deterministic predicate-alignment evidence and the optional planner-evidence seeding strategy.

---

### WS3_SIGNOFF: Wave 2 sign-off artifact

**Purpose**: Author the canonical Wave 2 closing record. Ratifies PROD-ANCHOR-STD-001, reconciles residual gaps against PRD-088 closure, names the 7-day replay window as a constraint, and uses the exact GR-1 canonical sign-off phrase.

**Outputs** (high-level):
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md` with the eight required sections per PRD §6.3:
  1. Header (frontmatter + summary).
  2. Wave 2 phase summary (one paragraph per phase 2.0, PRD-082, 2.1, 2.2, 2.3a, 2.3, 2.4, 2.5).
  3. I1–I4 proof record (per-producer I1, transport-baseline I2, consumer I3/I4 for Class A and operational, I5 inheritance).
  4. DEC-1 resolution record.
  5. PROD-ANCHOR-STD-001 ratification.
  6. Post-Wave-2 backlog reconciliation in three explicitly-labelled categories (unresolved / closed-in-Phase-2.4 / deferred infrastructure).
  7. Sign-off language and per-producer certification-level mapping (Principle 9 four-level distinction).
  8. Hand-off to post-Wave-2 backlog with 7-day replay-window constraint named.

**Governance constraints**:
- GR-1: Canonical phrase **"Wave 2 transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued"** present verbatim; "Wave 2 complete" not used without the qualifier.
- GR-2: Three-category post-Wave-2 backlog table, never one undifferentiated table; PWB-003 categorised as CLOSED.
- GR-3: Principle 9 four-level certification distinction preserved per producer.
- GR-4: ADR-052 through ADR-056 referenced, not edited.
- GR-5: Replay authority update named — post-retention outbox replay bounded to retained history; replay beyond retained history requires authoring-store reseed or future FIB/ADR amendment.

#### Retention replay-boundary acceptance gate (P1-RETENTION-REPLAY-BOUNDARY-GATE, audit patch)

`WAVE-2-SIGN-OFF.md` MUST contain a dedicated subsection (within Section 8 "Hand-off to post-Wave-2 backlog") stating explicitly that post-retention outbox replay is **bounded to the retained 7-day window**. The acceptance gate has three component assertions:

1. **Boundary stated**: The document contains a verbatim sentence (or equivalent that satisfies a string-presence grep) such as `Replay from finance_outbox is bounded to the retained 7-day processed-row window; rows older than this window are unrecoverable from outbox history and require authoring-store reseed.`

2. **Authoring-store reseed escape hatch named**: The document explicitly identifies the authoring stores (`player_financial_transaction`, `pit_cash_observation`, `table_buyin_telemetry`, `table_fills`, `table_credits`) as the systems of record from which longer-history replay must be reconstructed; the outbox is propagation infrastructure, not a replay log.

3. **FIB/ADR amendment requirement named**: The document explicitly states that any post-Wave-2 work requiring unbounded outbox-history replay (e.g., audit-driven replay from arbitrary historical points) requires a new FIB or superseding ADR before scope reopens — it cannot be assumed by Wave 2 sign-off.

The devils-advocate Phase 4 review MUST verify all three assertions. Absence of any one is a P0 finding that blocks merge. Cross-reference with PRD §5.2 NFR-5 ("Replay window honesty") and §5.3 GR-5 ("Replay authority update").

**Why this matters**: Wave 2 prior posture (before Phase 2.5) implied replay from `finance_outbox` history was always possible. The 7-day retention narrows this. A sign-off that does not name the narrowing is dishonest — post-Wave-2 work could be authored assuming arbitrary outbox replay and discover too late that the substrate has retention.

**Cross-link with WS2_RETENTION**: The 7-day window in WS2_RETENTION (`processed_at < now() - INTERVAL '7 days'`) is the operational manifestation of this boundary. The two must agree numerically; if WS2's interval changes (e.g., to 30 days), the sign-off must update in lockstep.

**Estimated complexity**: High. Eight prescribed sections, exact-language requirements (GR-1, GR-5), replay-boundary triple assertion (P1 audit patch), and multi-document cross-reference (rollout map §10, PRD-088 closure state, FIB-H invariants, per-producer certification posture from CORE-OPERATIONAL-LOOP.md).

**Gate**: `lint` (no automated docs check; human read-through against §6.3 structure during approval).

**Stage 2: pending expert consultation** — lead-architect will refine section ordering, per-phase summary content, evidence citations (commits, PRDs, EXECs), and the certification-level mapping table.

---

### WS4_GOVERNANCE: PROD-ANCHOR-STD-001 ratification + tracker re-sync

**Purpose**: Make four documentation artifacts agree about Wave 2 state at close — the standard is ratified, the trackers agree on phase status, the rollout cursor points correctly.

**Outputs** (high-level):
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml`:
  - `status: accepted_for_wave_2_5_signoff` → `status: ratified`
  - Add `ratified_by: WAVE-2-SIGN-OFF.md`
  - Add `ratified_date: <actual sign-off date>`
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json`:
  - `cursor.active_phase: 2.4` → `2.5`
  - `phases[id="2.4"].status: not_started` → `complete` with commit hash
  - `phases[id="2.5"].status` → `in_progress` (then `complete` on Phase 2.5 exit)
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md`:
  - Overall status: Phase 2.3 + 2.4 marked ✅ COMPLETE with PRDs and dates
  - Current position narrative updated from Phase 2.3a posture to Phase 2.5
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`:
  - `cursor.wave_2_progress_tracker_json` reference current
  - `cursor.next_action` reflects Phase 2.5

**Estimated complexity**: Medium. Four files edited; no narrative authoring; consistency checks across artifacts (reviewer reads all three before merge per PRD §7.2 risk row).

**Gate**: `lint` (no automated docs check; manual cross-document reconciliation during approval).

**Stage 2: pending expert consultation** — lead-architect will refine field-level edits, cursor advancement semantics, and the cross-document consistency check.

---

## Devils-Advocate Review (DoD Gate, not a workstream)

Per PRD §8 DoD: `/devils-advocate` reviews `WAVE-2-SIGN-OFF.md` before merge; no P0 findings, or all P0 findings resolved. The build-pipeline orchestrator dispatches `Skill(skill="devils-advocate")` in Phase 4 against `WAVE-2-SIGN-OFF.md` (output of WS3) as the final pre-completion check. P0 findings, if any, are routed back to WS3 for amendment.

**Deviation from PRD Appendix A**: The PRD's Appendix A lists WS5_REVIEW as a workstream. EXEC-089 folds this into the Phase 4 DoD gate sequence instead, because (a) `devils-advocate` is not currently in `validate-execution-spec.py`'s VALID_SKILLS set, (b) the PRD §8 DoD already lists "Devils-Advocate Review" as a checkbox, (c) prior Wave 2 phases (PRD-088) had no review workstream and used adversarial review as a merge gate, and (d) treating it as a gate rather than a workstream removes a YAML-validation friction while preserving the substantive guarantee. The dispatch mechanism is identical — `Skill(skill="devils-advocate", args="…")` — just sequenced at Phase 4 instead of Phase 3.

---

## Open Questions Carried Forward

The PRD §7.3 open questions Q1, Q1a, Q2, Q3, Q4, Q5, Q6 are all resolved with recommended answers in the PRD itself. No open questions carried into EXEC-089. Decision defaults from PRD Appendix B (D1: Vercel cron + service-role HTTP; D2: structured console.log JSON; D3: per-cycle lag aggregate; D4: WS-GOVERNANCE within this PRD) are committed.

---

## E2E Mandate Posture (Surface Governance)

PRD §8 Surface Governance: **Not applicable — this PRD introduces no new UI surface.** Confirmed: no `app/(dashboard)/**` or `components/**` additions.

The write-path classifier will detect `DELETE FROM` (in PRD prose) and `export async function GET` (in new route). Both are infrastructure — cron-triggered, no user journey. The pipeline's E2E mandate is for **operator-visible write paths**, not internal cron infrastructure. The integration test in WS2_RETENTION verifies the substantive behaviour (age gate, cap, index usage). Recommended: **waive E2E mandate** with justification `internal-cron-infrastructure-no-user-journey` at the write-path classification step.

---

## Stage 2 Routing (per workstream)

| WS | Stage 2 Expert | Refines |
|----|----------------|---------|
| WS1_LOG | backend-service-builder | Consumer branch types, lag-sample wiring, percentile helper, test fixtures |
| WS2_RETENTION | backend-service-builder | Migration header (CONCURRENTLY decision), RPC body, route auth flow, integration test fixtures, EXPLAIN evidence |
| WS3_SIGNOFF | lead-architect | Section ordering, per-phase summary, certification-level mapping, evidence citations |
| WS4_GOVERNANCE | lead-architect | Field-level edits, cursor advancement semantics, cross-document consistency check |

No api-builder, frontend-design-pt-2, or e2e-testing consultation needed for this slice. `rls-expert` should review the cleanup RPC grant/search_path posture, and `performance-engineer` should review the `EXPLAIN` evidence for backlog counts and the cleanup predicate.
