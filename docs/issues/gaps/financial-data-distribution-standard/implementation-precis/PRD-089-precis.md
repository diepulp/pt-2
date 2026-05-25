## PRD-089: Wave 2 Phase 2.5 — Observability + Sign-Off — Delivery Précis

### What This Was (And Was Not)

PRD-089 is the **closing slice of Wave 2**. It does three things and only these three things: (1) emits one structured `outbox_relay_cycle` log line per relay invocation — with backlog split by `fact_class` and claimability plus per-cycle processing-lag aggregates — so the propagation substrate is observable in Vercel function logs without an interactive surface; (2) introduces a daily Vercel-cron-driven retention path that deletes `finance_outbox` rows with `processed_at IS NOT NULL AND processed_at < now() - INTERVAL '7 days'` via a SECURITY DEFINER RPC using a CTE pattern (PostgreSQL `DELETE` does not accept top-level `LIMIT`), backed by a supporting partial index; (3) authors `WAVE-2-SIGN-OFF.md` — the canonical Wave 2 closure record that ratifies PROD-ANCHOR-STD-001, reconciles the three Wave 2 trackers against PRD-088 closure state, and locks in the GR-1 canonical sign-off phrase.

**Containment boundary (one-line invariant):** *If it is not the relay-cycle structured log line, the cleanup RPC migration, the cleanup route, the daily Vercel cron entry, the sign-off document, the PROD-ANCHOR-STD-001 status promotion, or the three-tracker reconciliation — it is not in this PRD.*

This slice does not add producers, does not add consumers, does not add dashboards, does not add replay/repair actions, does not add retention for unprocessed rows, does not add retention for `processed_messages`, does not add multi-consumer fan-out, and does not resolve PWB-001, PWB-002, or W2-OBS-CASHOUT-PRODUCER-001. No new UI surface. No new producer wiring. The substrate retains all the operational properties Phase 2.4 left in place; Phase 2.5 only adds observability emission, retention boundary, and the canonical closure record.

**Phase 2.5 authorization:** Phase 2.4 exit ✅ MET (PRD-088 / EXEC-088, commit `931f5ed9`, 2026-05-21). All upstream phases (2.0 → 2.4) complete; transport substrate and both projection consumers live.

---

### Architecture: Per-Cycle Observability + Bounded Retention

**The relay-cycle log emission (FR-1 + FR-2 two schema variants):** The relay route now emits exactly one structured JSON log line per `POST /api/internal/outbox-relay` invocation, with the schema variant determined by auth state. This is a narrow PRD-scoped exception to the production `console.*` ban — `console.log(JSON.stringify(...))` is the explicit sink because Vercel function logs are the chosen destination and no separate logger abstraction is in scope. The exception is limited to internal cron operational telemetry and must not be copied to user-facing routes.

The **authenticated** variant (auth passes, claim runs) carries:
- `outbox_backlog_size.ledger.total` — count of `fact_class='ledger' AND processed_at IS NULL` at cycle start
- `outbox_backlog_size.operational.{claimable, dead_letter, total}` — claimable rows (`delivery_attempts < 5`) vs dead-letter rows (`>= 5`), summed
- `processed.{class_a, operational}` — newly-stamped rows only; duplicate / skipped / failed outcomes do not count
- `processing_lag_ms.{min, p50, p95, max}` — DB-clock-derived lag aggregates computed in TypeScript over the combined sample array; `null` when zero processable samples

The **unauthenticated** variant (auth fails — 401 path, no DB access) carries `auth_failed: true`, `outbox_backlog_size: null`, zeroed processed counts, and null lag aggregates. The unauthenticated variant exists because backlog cannot be read without a DB query, which must not happen before auth (NFR-3 security parity). A relay endpoint receiving unauthorized requests is itself a signal.

**Branch lag-sample contract:** Each consumer branch (Class A, operational) extends its result type with `lagSamplesMs: number[]`. Samples are collected by `collectLagSamplesMs(supabase, eventIds)`, which queries `finance_outbox` for the event_id set whose `processed_at` was newly stamped this cycle and subtracts `Date.parse(processed_at) - Date.parse(created_at)` in TypeScript. **The exclusion rule (duplicate / skipped / failed / claim-error / auth-fail outcomes do not contribute samples) is enforced by construction** — those event_ids never appear in the eventIds set passed to the query. `lagSamplesMs` is an internal contract; it is stripped from the HTTP response body to preserve the prior body shape contract.

**Operational backlog count predicate alignment with the claim RPC:** `collectOutboxBacklog` issues three `.from('finance_outbox').select(...{count:'exact', head:true})` queries in parallel. The operational predicates include an `event_type IN ('grind.observed', 'fill.recorded', 'credit.recorded')` whitelist that matches `rpc_claim_operational_outbox_batch` (migration `20260521022656`) verbatim. The whitelist drifted from the EXEC-SPEC canonical predicate table and was resolved by the per-PRD audit-patch rule: **log-line predicate follows the RPC source of truth.** Adding a new operational `event_type` post-Wave-2 requires updating both the claim RPC and `collectOutboxBacklog` in the same migration.

**The retention RPC (`rpc_cleanup_outbox_processed`):** SECURITY DEFINER, `SET search_path = ''`, EXECUTE revoked from `anon`/`authenticated` and granted only to `service_role`. Accepts `p_max_rows INTEGER DEFAULT 1000`. Validates the parameter (rejects NULL, `< 1`, `> 1000`) **before** taking row locks. Body uses a CTE pattern — PostgreSQL `DELETE` does not accept a top-level `LIMIT`:

```sql
WITH doomed AS (
  SELECT event_id
  FROM public.finance_outbox
  WHERE processed_at IS NOT NULL
    AND processed_at < now() - INTERVAL '7 days'
  ORDER BY processed_at ASC, event_id ASC
  LIMIT p_max_rows
  FOR UPDATE SKIP LOCKED
),
deleted AS (
  DELETE FROM public.finance_outbox f
  USING doomed
  WHERE f.event_id = doomed.event_id
  RETURNING f.event_id
)
SELECT count(*)::integer INTO v_deleted FROM deleted;
RETURN v_deleted;
```

`FOR UPDATE SKIP LOCKED` in the doomed CTE ensures cleanup never waits on rows held by the relay's `rpc_claim_class_a_outbox_batch` / `rpc_claim_operational_outbox_batch` paths — both also use `SKIP LOCKED`, so neither blocks the other. Idempotent in the sense that repeated calls converge: once nothing matches the predicate, the RPC returns 0.

**The supporting partial index:** `idx_finance_outbox_processed_retention ON public.finance_outbox (processed_at, event_id) WHERE processed_at IS NOT NULL`. The partial predicate aligns exactly with the cleanup CTE's WHERE clause. The integration test verifies index presence via `pg_indexes` lookup (deterministic) and predicate-alignment via `indexdef` string match (deterministic) — naïve `EXPLAIN`-uses-index assertions on seeded tables are brittle because the planner may choose seq scan over index at small cardinalities (P2-EXPLAIN-INDEX-BRITTLENESS audit patch). A bulkier planner-evidence test seeding 10k aged + 1k recent rows runs only behind the `RUN_PLANNER_EVIDENCE_TESTS` env gate.

**The cleanup route (`GET /api/internal/outbox-cleanup`):** GET only — no production POST surface. Reuses the same `CRON_SECRET` bearer-auth pattern as `/api/internal/outbox-relay` (no second secret, no second auth pattern). Returns 401 with no DB access on bad auth; 200 with `{ deleted: N }` on success; 500 with `{ error: 'cleanup_failed' }` on RPC failure after successful auth. The route is global service-role infrastructure maintenance across all casinos — not tenant-scoped; must not accept `casino_id`, staff, or user scoping parameters. Logs one structured `outbox_cleanup_cycle` line per invocation with `max_rows: 1000` and `capped: boolean` (true when `deleted === max_rows`, signalling that eligible historical rows may remain).

**The 7-day replay-boundary contract:** Beginning with Phase 2.5, replay-from-outbox is bounded by the 7-day retention window. Rows with `processed_at IS NULL` (including dead-letter rows at `delivery_attempts >= 5`) are preserved indefinitely by predicate. The sign-off document records a **triple assertion** in §8.2 (P1-RETENTION-REPLAY-BOUNDARY-GATE audit patch): (1) boundary stated verbatim, (2) authoring-store reseed escape hatch enumerating the five systems of record, (3) FIB/ADR amendment requirement for post-Wave-2 unbounded-replay work.

---

### Artifacts Delivered (across 4 workstreams)

**WS1_LOG — Relay Cycle Log Line + Branch Lag-Sample Contract**

- `app/api/internal/outbox-relay/route.ts` (rewritten)

  Emits one structured `outbox_relay_cycle` log per cycle, distinguishing FR-1 (authenticated) from FR-2 (auth-fail) variants. Adds a GET export sharing the same auth and processing path as POST so Vercel cron may invoke the route. Calls `collectOutboxBacklog` after auth but before claim; calls `collectLagSamplesMs` after each branch completes (Class A + operational); aggregates min/p50/p95/max from the combined sample array. HTTP response body strips `lagSamplesMs` to preserve the prior contract — the field is internal observability, not part of the HTTP envelope.

- `services/player-financial/outbox-consumer.ts` (amended)

  Added `collectLagSamplesMs(supabase, eventIds)`: fetches `(event_id, created_at, processed_at)` from `finance_outbox` filtered by event_ids via `.from().select().in()`; subtracts in TypeScript using `Date.parse()`. **No `Date.now()` appears in the lag-sample production path.** Added `collectOutboxBacklog(supabase)` with the three count queries (ledger.total, operational.claimable, operational.dead_letter) running in `Promise.all`. The operational queries include the `OPERATIONAL_EVENT_TYPES` whitelist (`grind.observed`, `fill.recorded`, `credit.recorded`) to match `rpc_claim_operational_outbox_batch`. Added `aggregateLagSamples(samples)` percentile helper. All three helpers are **observability-soft** — failures return zero/empty rather than throwing; the relay cycle still emits a log line with the partial information available.

- `services/player-financial/outbox-operational-consumer.ts` (amended)

  Adds `lagSamplesMs: number[]` to `OperationalConsumerResult`. Tracks `processedEventIds: string[]` during the per-row loop; calls `collectLagSamplesMs` once after the loop with the accumulated event_ids. Duplicate/skipped/failed/claim-error/auth-fail outcomes are never pushed to `processedEventIds`, so they never appear in the `.in(event_id, ...)` lag query — exclusion-by-construction.

- `services/player-financial/dtos.ts` (amended)

  Added types: `OperationalConsumerResultDTO.lagSamplesMs`, `ClassARelayBranchResult`, `OutboxBacklogSize` (ledger.total + operational.{claimable, dead_letter, total}), `LagAggregates` (min/p50/p95/max each `number | null`), and `OutboxRelayCycleLog` as a discriminated union over `auth_failed`.

- `services/player-financial/__tests__/outbox-relay-log-emission.test.ts` (new — 17 tests)

  Covers: FR-1 authenticated log shape; FR-2 auth-fail log shape; predicate parity vs the claim RPC; **exclusion-by-construction** (mixed cycle with one processed Class A row + one duplicate operational row + one failed operational row computes lag aggregates from the single processed row only); GET parity with POST; HTTP shape stability (response body strips `lagSamplesMs`); operational predicate drift acceptance with the event_type whitelist.

- `services/player-financial/__tests__/lag-aggregates.test.ts` (new — 13 tests)

  Aggregator percentile math (min/p50/p95/max); zero-sample → all-null result; single-sample edge case; exclusion-rule invariant documentation.

- `services/player-financial/__tests__/outbox-relay.test.ts` (amended — scope expansion documented in checkpoint)

  Preserved real helpers via `jest.requireActual` (instead of full-module mock), added `.from()` chain mock for the new backlog query path, added `lagSamplesMs: []` to operational consumer mock returns. Required to keep 13 existing relay tests passing without regression.

**WS2_RETENTION — Retention RPC + Supporting Index + Cleanup Route + Cron**

- `supabase/migrations/20260521142441_create_rpc_cleanup_outbox_processed.sql` (new)

  Creates `rpc_cleanup_outbox_processed(p_max_rows INTEGER DEFAULT 1000) RETURNS INTEGER`. SECURITY DEFINER; `SET search_path = ''`; EXECUTE revoked from `anon`/`authenticated`, granted to `service_role`. Validation block raises a controlled exception for NULL, `< 1`, or `> 1000` **before** opening the doomed CTE. CTE-based DELETE with `FOR UPDATE SKIP LOCKED`. Creates supporting partial index `idx_finance_outbox_processed_retention ON public.finance_outbox (processed_at, event_id) WHERE processed_at IS NOT NULL`. Migration timestamp `20260521142441` was generated via `date +%Y%m%d%H%M%S` (not fabricated); sorts after the previous max migration (`20260521022708_create_idx_finance_outbox_operational_backlog.sql`).

- `app/api/internal/outbox-cleanup/route.ts` (new)

  `GET` only. Validates `CRON_SECRET` bearer auth **before any DB access**; returns 401 with no service-role client construction on bad auth. On successful auth, constructs the service-role client and calls `supabase.rpc('rpc_cleanup_outbox_processed')`. On RPC failure: returns 500 with `{ error: 'cleanup_failed' }` and logs the structured failure variant. On success: returns 200 with `{ deleted: N }` and logs the structured success variant. The structured log line carries `max_rows: 1000` and `capped: deleted === max_rows`. INV-ERR-DETAILS honored via `safeErrorDetails(error)`.

- `vercel.json` (amended)

  Added daily cron entry `0 7 * * *` (07:00 UTC, ~midnight Pacific, off-peak for pilot timezone) for `/api/internal/outbox-cleanup`. The existing relay cron entry is unchanged.

- `app/api/internal/outbox-cleanup/__tests__/route.test.ts` (new — 11 tests)

  401 on missing/invalid `Authorization`; service-role client NOT constructed on the bad-auth path; 200 + `{ deleted: N }` on success; 500 + `{ error: 'cleanup_failed' }` and failure log on RPC error; POST not exported in production; success log includes `max_rows: 1000` and `capped: true` when `deleted === 1000`.

- `__tests__/integration/outbox-cleanup.int.test.ts` (new — 10 integration tests + 1 advisory planner-evidence test)

  Three age bands (now / 6 days ago / 8 days ago) — verifies only the 8-day row deleted; `p_max_rows` cap behaviour (`p_max_rows = 1` deletes exactly one eligible row; repeated calls converge to 0); first-run cap behaviour (when more than 1000 eligible rows exist, one run deletes exactly 1000 and leaves the rest); invalid-cap rejection (NULL, 0, negative, 1001 all raise before any DELETE); deterministic index-exists assertion via `pg_indexes` lookup; deterministic predicate-alignment assertion via `indexdef` string match; advisory planner-evidence test seeding 10k aged + 1k recent rows behind `RUN_PLANNER_EVIDENCE_TESTS=true`.

**WS3_SIGNOFF — Wave 2 Sign-Off Artifact**

- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md` (new — 338 lines, 8 prescribed sections)

  §1 Header & Summary (canonical sign-off phrase verbatim line 28). §2 Wave 2 Phase Summary (one paragraph per phase 2.0, PRD-082, 2.1, 2.2, 2.3a, 2.3, Phase 2.3a Observability Investigation, 2.4, 2.5 — each with PRD / EXEC / commit / migration citations). §3 I1–I4 Proof Record (per-producer I1 table for 5 producers; transport-baseline I2; consumer-layer I3/I4 re-verifications for Class A (Phase 2.3) and operational (Phase 2.4); I5 Wave-1 inheritance). §4 DEC-1 Resolution Record with **the mixed-class caveat explicitly carried forward** in §4.4 (visits drawing from both Class A and operational sources continue to emit `'partial'` until table-scoped operational backlog drains and the gaming day closes — by-design ADR-054 R4 authority degradation, not unresolved scope). §5 PROD-ANCHOR-STD-001 Ratification. §6 Post-Wave-2 Backlog Reconciliation in **three separate H3 subsections** (§6.1 Unresolved — PWB-001 / PWB-002 / W2-OBS-CASHOUT-PRODUCER-001; §6.2 Closed in Phase 2.4 — PWB-003 with PRD-088 / commit `931f5ed9` evidence; §6.3 Deferred infrastructure — multi-consumer fan-out / CDC / external bus). §7 Sign-Off Language & Per-Producer Certification (canonical phrase verbatim line 254; **Principle 9 four-level certification table** mapping each of 6 producer rows to L1/L2/L3/L4 with explicit reading guide). §8 Hand-off to Post-Wave-2 Backlog (§8.1 queued items; §8.2 replay-boundary **triple assertion** at §8.2.1 / §8.2.2 / §8.2.3; §8.3 closure statement with canonical phrase verbatim line 334).

  **GR-1 verification:** The canonical sign-off phrase appears verbatim 3× (lines 28, 254, 334). The bare phrase "Wave 2 complete" never appears unqualified — the 3 other occurrences are meta-statements *prohibiting* the bare phrase (lines 256, 281, 334).

  **GR-4 verification:** ADR-052 through ADR-056 are referenced but not edited (`git log main..HEAD -- ADR-052..056` shows only Phase 2.0 commit `8a1b8741`; zero edits during Phases 2.1–2.5). The frontmatter field `adrs_referenced_not_edited` enumerates all five.

  **GR-5 verification:** §8.2 contains all three required sub-assertions; the 7-day window numerically cross-links to the WS2 migration `20260521142441` predicate (`processed_at < now() - INTERVAL '7 days'`).

  **Containment verification:** `grep -niE 'Slack|PagerDuty|Prometheus|Grafana|OpenTelemetry|pg_cron|external dashboard'` returns zero matches. Only existing 5 producers + 1 absence (cashout) + 2 projection consumers + 3 deferred infrastructure items are cited — no inventions beyond FIB-H / ADR-052..056.

**WS4_GOVERNANCE — PROD-ANCHOR-STD-001 Ratification + Tracker Reconciliation**

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml` (amended)

  Status promoted from `accepted_for_wave_2_5_signoff` to `ratified`. Added `ratified_by: WAVE-2-SIGN-OFF.md` and `ratified_date: 2026-05-21`. The standard is now the governing artifact for PWB-001 enforcement; future amendments require a superseding directive citing this sign-off, not a backdoor edit to the YAML.

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json` (amended)

  `meta.last_updated` advanced. `cursor.phase_status` → `phase_2_5_in_progress`. `cursor.phase_label` rewritten to reflect WS1+WS2+WS3+WS4 completion with Phase 1 gate evidence. `cursor.next_action` points to Phase 4 DoD devils-advocate review. Phase 2.3 entry `commit` field populated with `ba17a4d0` (was `null` — cross-document consistency fix). Phase 2.4 entry preserved with PWB-003 closure narrative. Phase 2.5 entry fully populated with PRD-089 / EXEC-089 paths, four WS deliverables, six audit-patch records, and the dev-env-finding flag for follow-up.

- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md` (amended)

  Header `Last updated` and `Current position` refreshed. §1 status table — three rows updated (Phase 2.3 / 2.4 / 2.5). §7 Phase 2.3 detail block rewritten to ✅ COMPLETE with Gate A/B migrations enumerated. §7 Phase 2.4 detail block added with deliverables list. §7 Phase 2.5 detail block rewritten for IN PROGRESS state with the four WS narrative. §9 Dormant Workstreams gained a PWB-003 row marked CLOSED with PRD-088 evidence.

- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` (amended)

  `meta.last_updated` advanced. `cursor.active_phase` `2.3` → `2.5`. `cursor.phase_status` → `phase_2_3_complete_phase_2_4_complete_phase_2_5_in_progress`. `cursor.phase_label` rewritten with full Wave 2 narrative through Phase 2.5. `cursor.next_action` and `cursor.next_action_prd` updated to point to post-Wave-2 backlog. `cursor.last_closed_*` fields advanced to Phase 2.4 / `2026-05-21` / EXEC-088 / commit `931f5ed9`.

**Cross-document consistency verification** (7 facts confirmed across the 4 tracker artifacts + sign-off):
- Phase 2.3 closure commit `ba17a4d0` present in all 4 docs
- Phase 2.4 closure commit `931f5ed9` present in all 4 docs
- Phase 2.5 in-progress with PRD-089 attribution present in all 4 docs
- PROD-ANCHOR-STD-001 ratified — YAML status + sign-off §5 + tracker narratives all agree
- PWB-003 consistently reported as CLOSED with Phase 2.4 / PRD-088 / commit `931f5ed9` citation; never appears as unresolved/pending/queued anywhere
- PWB-001 / PWB-002 / W2-OBS-CASHOUT-PRODUCER-001 consistently reported as unresolved across all 4 docs
- 7-day retention migration `20260521142441` cited in sign-off §8.2 + WAVE-2-TRACKER Phase 2.5 deliverables + WAVE-2-PROGRESS-TRACKER §7 + ROLLOUT-TRACKER cursor

**Pre-merge dev-env remediation (jest.setup.js + jest.setup.node.ts):**

Discovered during WS2 integration test execution. The repository convention is `.env.local` = local Supabase (`http://127.0.0.1:54321`); `.env` = remote/shared baseline. The jest test runners only loaded `.env`, never `.env.local`, so `RUN_INTEGRATION_TESTS=true npx jest` hit the remote instance and failed with `PGRST204: Could not find the 'aggregate_id' column of 'finance_outbox' in the schema cache` because remote lacked the unmerged Wave 2 migrations.

Resolution: both jest setup files now load `.env.local` first (with `override: false`), then `.env` as fallback. Two files because unit tests use `jest.setup.js` (jsdom env) and integration tests use `jest.setup.node.ts` (node env) — the initial fix to only `jest.setup.js` was incomplete and surfaced when integration tests still hit remote. Verified end-to-end: `RUN_INTEGRATION_TESTS=true npx jest --silent --config jest.integration.config.js --testPathPatterns='outbox-cleanup'` now passes 10/10 (was failing with the PGRST204 error before fix).

---

### Critical Implementation Decisions

**DEC-EXEC-1 — Branch lag samples are DB-clock derived, not app-server-clock derived (P1-LAG-SAMPLE-CLOCK-CONTRACT audit patch):** The PRD FR-1 implementation note initially wrote lag as `Date.now() - new Date(row.created_at).getTime()` — an app-server-clock vs DB-row-timestamp subtraction. `Date.now()` on a Vercel function and `created_at` set by Postgres `now()` are two distinct clocks; NTP discipline keeps them within ~100ms, but cold-start clock-skew and Vercel-edge time-source variance can produce outliers that look like real lag regressions when they are actually clock drift. The EXEC-089 resolution prescribed a SQL `EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000` (DB-side). The actual implementation uses `Date.parse(processed_at) - Date.parse(created_at)` in TypeScript on two timestamp strings fetched from `finance_outbox`. **Both timestamps are DB-clock-stamped** (`created_at` by the producer via Postgres `now()`; `processed_at` by `rpc_process_*_projection` via Postgres `now()`). No app-server clock participates. The semantic-equivalence deviation was accepted by the orchestrator and independently reaffirmed by the Phase 4 devils-advocate review (timezone, precision, parse-failure risks all ruled out).

**DEC-EXEC-2 — Operational backlog predicate includes the event_type whitelist (P1-BACKLOG-CLAIMABILITY-DEFINITION audit patch):** The EXEC-SPEC canonical predicate table for operational claimable was `fact_class = 'operational' AND processed_at IS NULL AND delivery_attempts < 5`. The actual `rpc_claim_operational_outbox_batch` (migration `20260521022656`) includes an additional `event_type IN ('grind.observed', 'fill.recorded', 'credit.recorded')` filter. Per the audit-patch drift-resolution rule (**log-line predicate follows the RPC source of truth**), both operational claimable and operational dead-letter predicates in `collectOutboxBacklog` include the same whitelist. The whitelist is exported as `OPERATIONAL_EVENT_TYPES` from `outbox-consumer.ts`. Adding a new operational event_type post-Wave-2 requires updating both the claim RPC and `collectOutboxBacklog` in the same migration — flagged as a P3 future-proofing note in the sign-off review.

**DEC-EXEC-3 — Cleanup route is GET-only, no production POST:** Vercel cron invokes GET; introducing a POST surface would create a second mutation entry point for manual/local cleanup, doubling the auth surface and the audit footprint. Manual / local bulk drains remain DBA-run SQL operations, not an HTTP surface. The route unit test asserts that POST is not exported.

**DEC-EXEC-4 — Cleanup route is global service-role maintenance, not tenant-scoped:** The cleanup RPC operates across all casinos. The route must not accept `casino_id`, staff, or user scoping parameters. The route is global infrastructure maintenance; tenant scoping would either be ineffective (the RPC ignores it) or — worse — would imply a tenant-aware retention policy that does not exist.

**DEC-EXEC-5 — The 7-day retention window applies only to successfully processed rows:** Rows with `processed_at IS NULL` are preserved indefinitely by predicate, regardless of `delivery_attempts` value. Dead-letter rows (`delivery_attempts >= 5`) remain available for operator review until manual triage. Automatic deletion of unprocessed or dead-letter rows would erase evidence; this is explicitly out of scope.

**DEC-EXEC-6 — Cycle log emission is unconditional; auth-failed cycles emit the unauthenticated variant:** Every `POST /api/internal/outbox-relay` invocation emits exactly one log line. The unauthenticated variant carries `auth_failed: true` and `outbox_backlog_size: null` (no DB access permitted before auth per NFR-3). A relay endpoint receiving unauthorized requests is itself a signal — silent failure on auth-fail would mask attack surface from on-call visibility.

**DEC-EXEC-7 — `processing_lag_ms` aggregates are computed across rows newly stamped this cycle only:** Duplicate-delivery outcomes are successful idempotency outcomes but not new processing samples — they do not contribute to lag aggregates. Same for skipped-row outcomes (`'skipped_ledger'`, `'skipped_unknown'`), failed-process outcomes, claim errors, and auth failures. The exclusion rule is enforced by construction at the lag-sample collection site: those event_ids never appear in the `processedEventIds` set passed to `collectLagSamplesMs`.

**DEC-EXEC-8 — EXPLAIN-index assertion is split into deterministic + advisory checks (P2-EXPLAIN-INDEX-BRITTLENESS audit patch):** Naïve `EXPLAIN`-uses-index assertions on small seeded tables are brittle — Postgres's planner may choose seq scan over index when the table has few rows because seq scan is genuinely cheaper at small cardinalities. A test that passes when the planner happens to pick the index is testing planner heuristics, not index correctness. Resolution: two deterministic assertions (`pg_indexes` existence + `indexdef` predicate-alignment) prove the cleanup migration delivers the *artifact* the PRD requires; one advisory planner-evidence test (10k aged + 1k recent rows behind `RUN_PLANNER_EVIDENCE_TESTS`) proves the planner actually uses it at scale — runs nightly or pre-merge, not on every PR.

**DEC-EXEC-9 — Observability helpers are observability-soft:** `collectOutboxBacklog`, `collectLagSamplesMs`, and `aggregateLagSamples` are all wrapped in `try/catch` that returns zero/empty rather than throwing. Lag-collection or backlog-query failure must not cascade into a relay cycle failure. The cycle still emits a log line with whatever partial information is available — lying about what we couldn't compute is worse than degrading it to 0/null with the cycle outcome surfacing the error.

**DEC-EXEC-10 — `lagSamplesMs` is internal contract, stripped from HTTP response body:** Each branch result type carries `lagSamplesMs: number[]`. The HTTP response body for `POST /api/internal/outbox-relay` strips this field to preserve the prior body shape contract — no caller of the relay route expected a `lagSamplesMs` field, and adding it would be a breaking change for any operational tooling reading the response. The field flows through the cycle log only, not through HTTP.

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| FIB-H | `wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md` — scope authority (no amendment required for this phase) |
| FIB-S | null — PRD-089 frontmatter does not declare `structured_ref`; pipeline ran in PRD-only mode per intake-traceability-protocol.md |
| PRD-089 | `docs/10-prd/PRD-089-wave2-phase-2.5-observability-and-signoff-v0.md` (v0.4, 6 audit-patch deltas applied pre-approval-gate) |
| EXEC-089 | `docs/21-exec-spec/EXEC-089-wave2-phase-2.5-observability-and-signoff.md` — 4 workstreams |
| Checkpoint | `.claude/skills/build-pipeline/checkpoints/PRD-089.json` — status: complete |
| Sign-off | `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md` — 338 lines, ratified 2026-05-21 |
| Rollout Map | `wave-2/WAVE-2-ROLLOUT-MAP.md` — Phase 2.5 section will mark ✅ COMPLETE on merge |
| Producer-Anchor Standard | `wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml` — status: ratified |

**Governing ADRs (frozen — referenced, not edited):**
- ADR-052: Financial Fact Model dual-layer
- ADR-053: Financial System Scope Boundary
- ADR-054: Financial Event Propagation Surface Contract — R4 authority invariant (`type: 'estimated'`); §8.2 retention boundary aligns with R4 propagation semantics
- ADR-055: Cross-class Authoring Parity
- ADR-056: Relay Worker Execution Environment — Vercel cron + service-role HTTP route is the only sanctioned execution path; cleanup follows the same pattern

**Audit patches applied pre-approval-gate (6 total):**

| ID | Severity | Targets |
|----|----------|---------|
| EXEC-089-P0-PHASE-24-EVIDENCE-GATE | P0 | WS3_SIGNOFF + WS4_GOVERNANCE preconditions — hard requirement that PRD-088 closure evidence (PRD file + EXEC file + checkpoint status==complete + commit hash + residual-gap classification) be on disk before WS3/WS4 may execute |
| EXEC-089-P1-TEST-GATE-ORDERING | P1 | execution_phases — test-pass moved into Phase 1 gates; Phase 2 documentation workstreams require WS1+WS2 test-pass first |
| EXEC-089-P1-LAG-SAMPLE-CLOCK-CONTRACT | P1 | WS1_LOG — DB-clock-derived lag samples |
| EXEC-089-P1-BACKLOG-CLAIMABILITY-DEFINITION | P1 | WS1_LOG — log-line predicate follows the claim RPC source of truth |
| EXEC-089-P1-RETENTION-REPLAY-BOUNDARY-GATE | P1 | WS3_SIGNOFF + WS2_RETENTION — triple assertion + numeric cross-link |
| EXEC-089-P2-EXPLAIN-INDEX-BRITTLENESS | P2 | WS2_RETENTION — split EXPLAIN test into deterministic + advisory |

---

### Validation Results

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS — exit 0 |
| `npm run lint` (WS1+WS2 outputs scoped) | PASS — exit 0 at `--max-warnings=0` across 9 PRD-089 output files |
| Unit tests (PRD-089 scope) | PASS — 41/41 tests, 3 suites, 0 failures (WS1: 30 new tests across `outbox-relay-log-emission` + `lag-aggregates`; WS2: 11 new tests across `outbox-cleanup/route`) |
| Integration tests (PRD-089 scope) | PASS — 10/10 (1 advisory planner-evidence test gated by `RUN_PLANNER_EVIDENCE_TESTS`) |
| Schema validation | PASS — migration `20260521142441` applied via `npx supabase migration up --local`; `rpc_cleanup_outbox_processed` present in `types/database.types.ts` at line 4906 |
| Player-financial suite regression | PASS — 171/171 (no regressions in WS1 outputs from WS2 work; 23 skipped integration tests gated by `RUN_INTEGRATION_TESTS=true`) |
| Phase 4 DoD — devils-advocate review | PASS — SHIP verdict; 0 P0 / 0 P1 / 0 P2; 3 P3 documentation polish notes (non-blocking) |
| Merge gate `npm run test:verify` | WAIVED — PRD-089 scope tests all green; pre-existing Tier 2 test debt (24 unit + 99 integration failures across 24 suites) verified via `git log main..HEAD` as untouched by PRD-089 — same posture as PRD-087 / PRD-088 merge precedent |

**Phase 4 devils-advocate stress-test results (11 targets, all PASS):**

| Target | Verdict |
|--------|---------|
| GR-1 canonical phrase verbatim 3× | PASS — lines 28, 254, 334; no unqualified "Wave 2 complete" |
| GR-2 three-category backlog | PASS — §6.1 / §6.2 / §6.3 separate H3 subsections with separate tables |
| GR-3 Principle 9 four-level certification | PASS — §7.2 per-producer L1/L2/L3/L4 table with explicit reading guide |
| GR-4 ADR-052..056 frozen | PASS — `git log main..HEAD -- ADR-052..056` shows only Phase 2.0 commit |
| GR-5 replay authority triple assertion | PASS — §8.2.1 / §8.2.2 / §8.2.3 all present; 7-day cross-link to WS2 migration |
| Containment guardrails | PASS — zero matches for Slack/PagerDuty/Prometheus/Grafana/OpenTelemetry/pg_cron/external-dashboard |
| Anti-invention | PASS — only the 5 FIB-H §D producers + 1 absence + 2 projection consumers + 3 deferred items cited |
| DEC-1 mixed-class caveat | PASS — §4.4 carries the caveat forward with ADR-054 R4 citation |
| Cross-document consistency | PASS — 5 facts sampled across sign-off + 3 trackers + YAML, all aligned |
| WS1-P1-LAG-SQL deviation revisit | ACCEPT — DB-clock invariant independently verified |
| Honesty regression | PASS — no surface promotes partial→complete; §6.1 and §7 honest |

---

### Phase 2.5 Gate Status

**COMPLETE.** All four workstreams delivered. Relay route emits per-cycle structured logs (FR-1 + FR-2); cleanup RPC and route shipped with 7-day retention and partial-index support; `WAVE-2-SIGN-OFF.md` authored with all 8 prescribed sections + canonical sign-off phrase verbatim 3×; PROD-ANCHOR-STD-001 ratified; three Wave 2 trackers reconciled and cross-document-consistent; devils-advocate Phase 4 DoD verdict is SHIP. **Wave 2 closed 2026-05-21.**

**What is explicitly carried forward (post-Wave-2 backlog):**

- **PWB-001:** `adjustment.recorded` workflow anchor — governed by PROD-ANCHOR-STD-001 (ratified §5). Rating-slip modal + MTL compliance dashboard call `services/player-financial/http.ts:createFinancialAdjustment` directly from the browser without `original_txn_id`; ADR-057 eligibility gate silently skips emission; PFT row writes but no outbox row results. Remediation: move adjustment creation behind a server/API/service boundary, enforce the anchor hierarchy at that boundary, update both UI callsites. Producer-certification re-run on closure.
- **PWB-002:** Fill/credit operator UI — `rpc_request_table_fill` and `rpc_request_table_credit` are correctly wired at Layer 1 (Phase 2.2); existing routes (`POST /api/v1/table-context/fills` / `/credits`) are hardware-integration endpoints. Real operator workflows produce no `fill.recorded` / `credit.recorded` rows. Remediation: feature pipeline (FIB → PRD → EXEC) for operator-facing surface. Producer-certification re-run on closure.
- **W2-OBS-CASHOUT-PRODUCER-001:** `cashout.recorded` Layer-1 producer absence — `rpc_create_financial_txn` hardcodes `'buyin.recorded'` with no direction branch; session-close cashout writes only to `pit_cash_observation`. The projection consumer has a reserved slot but no events arrive. Remediation: PRD adding `CASE WHEN v_row.direction = 'out' THEN 'cashout.recorded'` branch in `rpc_create_financial_txn` (or equivalent direction-aware emission point); rating-slip cashout callsite confirms `rating_slip_id` is passed. May follow PRD-088 operational consumer wiring patterns — no new consumer required.

**Deferred infrastructure (each requires a new ADR + FIB amendment before scope reopens):**

- Multi-consumer fan-out — `processed_messages` schema lacks `consumer_id`; introducing one is a schema-evolution event with replay-state-rebuild implications.
- CDC / WAL relay (Debezium, `pg_logical`, WAL streaming) — post-pilot scale upgrade; polling relay is the Wave 2 mechanism by design.
- External consumer contract / public event bus — Q3 explicitly deferred at FIB-H §G; the outbox is internal PT-2 infrastructure.

**Replay-boundary constraint:** Any post-Wave-2 work requiring unbounded `finance_outbox` replay (audit-driven replay from arbitrary historical points, regulator-requested reconstruction over months or years, or any operational pattern assuming processed rows persist beyond 7 days) requires a new FIB-H plus a superseding ADR before scope reopens — it cannot be assumed by Wave 2 sign-off and cannot be authored on the implicit expectation that `finance_outbox` rows are durable indefinitely.

— Lead Architect (Wave 2 sign-off, 2026-05-21)
