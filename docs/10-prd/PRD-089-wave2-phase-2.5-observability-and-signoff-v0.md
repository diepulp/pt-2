---
id: PRD-089
title: Wave 2 Phase 2.5 — Observability + Sign-Off
owner: Lead Architect
status: Draft
affects: [ADR-052, ADR-053, ADR-054, ADR-055, ADR-056, PRD-081, PRD-082, PRD-083, PRD-085, PRD-086, PRD-087, PRD-088]
created: 2026-05-21
last_review: 2026-05-21
phase: Wave 2 Phase 2.5
pattern: B
http_boundary: true
scope_authority: docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md
parent_fib: docs/issues/gaps/financial-data-distribution-standard/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md
---

# PRD-089 — Wave 2 Phase 2.5: Observability + Sign-Off

**Containment boundary (one-line invariant):** *This PRD adds one structured relay-cycle log line containing backlog and lag fields (emitted from the existing relay route) plus one cleanup-cycle log line from a new cleanup route, a cron-driven retention cleanup mechanism for `finance_outbox` rows with `processed_at` older than 7 days, and the Wave 2 sign-off artifact that ratifies PROD-ANCHOR-STD-001 and reconciles the post-Wave-2 backlog against PRD-088 closure state; it does not add producers, consumers, dashboards, replay/repair actions, retention for unprocessed rows, retention for `processed_messages`, multi-consumer fan-out, or any work that resolves PWB-001, PWB-002, or W2-OBS-CASHOUT-PRODUCER-001.*

---

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** Phase 2.5 is the closing slice of Wave 2. It does three things and only these three things: (1) adds one structured relay-cycle log line carrying backlog size split by fact_class and per-cycle processing-lag aggregates (and a parallel cleanup-cycle log line emitted by the new cleanup route) so the propagation substrate is observable in Vercel function logs without an interactive surface, (2) introduces a daily Vercel-cron-driven retention path that deletes `finance_outbox` rows with `processed_at IS NOT NULL AND processed_at < now() - INTERVAL '7 days'` via a SECURITY DEFINER RPC using a CTE pattern (PostgreSQL `DELETE` does not accept top-level `LIMIT`), backed by a supporting partial index, and (3) authors `WAVE-2-SIGN-OFF.md` — the canonical record summarising every phase from 2.0 through 2.4, the I1–I4 proof history, the DEC-1 resolution record, the ratification of PROD-ANCHOR-STD-001 as accepted governance, and the post-Wave-2 backlog reconciled against PRD-088 closure state in three explicitly-labelled categories (unresolved backlog, closed-in-Phase-2.4, deferred infrastructure). The same pass reconciles `WAVE-2-TRACKER.json`, `WAVE-2-PROGRESS-TRACKER.md`, and the parent `ROLLOUT-TRACKER.json` to all agree that Phase 2.4 is complete and Phase 2.5 is the current cursor. There are no new producers, consumers, surfaces, or schema additions other than the retention RPC and its supporting index. Phase 2.5 closes Wave 2 with the precise honesty the sign-off language demands: transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued.

---

## 2. Problem & Goals

### 2.1 Problem

Wave 2 has delivered a transactional outbox with two projection consumers (Class A in Phase 2.3, operational in Phase 2.4) and an interactive admin surface (Phase 2.3a). What is missing for honest sign-off is operationally inexpensive but materially important:

- **No backlog visibility outside the admin surface.** The Phase 2.3a admin page makes `finance_outbox` state inspectable, but it requires a human to open it. There is no signal in Vercel function logs telling on-call whether the relay is keeping up with the backlog. A relay cycle that processes zero rows for ten minutes looks identical to a relay cycle that processes 50 rows per minute, with no log distinction between healthy quiet and unhealthy stall.
- **No retention policy.** `finance_outbox` rows are never deleted. The table accumulates indefinitely. At pilot scale this is not yet a performance problem, but a Wave 2 sign-off that leaves the propagation substrate with unbounded growth would be unsound. The roadmap commits to retention for processed rows older than 7 days.
- **No sign-off artifact.** Wave 1 closed with `WAVE-1-PHASE-1.5-SIGNOFF.md` in the same directory. Wave 2 must produce its equivalent. Without it, the rollout is not traceable, the residual gaps are not formally recorded, and PROD-ANCHOR-STD-001 remains in `accepted_for_wave_2_5_signoff` status indefinitely.
- **Tracker drift.** `WAVE-2-ROLLOUT-MAP.md` is current (cursor at Phase 2.5). `WAVE-2-TRACKER.json` still says Phase 2.4 is `not_started`. `WAVE-2-PROGRESS-TRACKER.md` still says the active phase is 2.3a. The parent `ROLLOUT-TRACKER.json` was last updated before Phase 2.3 closed. These three artifacts must agree before sign-off is meaningful.

### 2.2 Goals

| Goal | Observable Signal |
|------|-------------------|
| **G1** — Relay backlog observable in logs | Every relay cycle emits one structured log line containing `outbox_backlog_size` (count of `finance_outbox` rows with `processed_at IS NULL` at cycle start). Ledger backlog is emitted as a total. Operational backlog is split into `claimable`, `dead_letter`, and `total` so poison rows excluded by `rpc_claim_operational_outbox_batch` cannot masquerade as drainable work. The line is parseable from Vercel function logs without joins to the database. |
| **G2** — Relay processing lag observable in logs | The same per-cycle log line contains `processing_lag_ms` aggregates (min / p50 / p95 / max) across rows whose `processed_at` was stamped during this cycle. Cycles that process zero rows emit the field as `null`, not zero. |
| **G3** — Retention executes daily | A daily Vercel cron triggers `GET /api/internal/outbox-cleanup`. A successful run logs `{ event: 'outbox_cleanup_cycle', timestamp, deleted: N, max_rows: 1000, capped: boolean, error: null }`. The route returns `{ deleted: N }`. No production `POST /api/internal/outbox-cleanup` route is introduced; manual/local bulk drains remain DBA-run SQL operations, not an HTTP surface. |
| **G4** — Retention deletes only safe rows | The cleanup RPC deletes only rows where `processed_at IS NOT NULL AND processed_at < now() - INTERVAL '7 days'`. Rows with `processed_at IS NULL` are never deleted, regardless of `delivery_attempts` value. Dead-letter rows (`delivery_attempts >= 5`) are preserved for operator review. The cleanup route is global service-role infrastructure maintenance across all casinos, not a tenant-scoped operator action. |
| **G5** — Wave 2 sign-off authored | `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md` exists with all eight required sections (phase summary, I1–I4 proof record, DEC-1 resolution, PROD-ANCHOR-STD-001 ratification, **post-Wave-2 backlog reconciled against PRD-088 closure state in three explicitly-labelled categories — unresolved backlog, closed-in-Phase-2.4, deferred infrastructure** — sign-off language, surface inventory delta, hand-off to post-Wave-2 backlog). |
| **G6** — PROD-ANCHOR-STD-001 ratified | The standard's status field updates from `accepted_for_wave_2_5_signoff` to `ratified` with a reference to `WAVE-2-SIGN-OFF.md` and the ratification date. The standard becomes the governing artifact for PWB-001 enforcement. |
| **G7** — Trackers reconciled | `WAVE-2-TRACKER.json`, `WAVE-2-PROGRESS-TRACKER.md`, and `ROLLOUT-TRACKER.json` all agree: Phase 2.4 complete, Phase 2.5 in progress (or complete on sign-off close), no contradictions across the three artifacts. |
| **G8** — Sign-off language is exact | `WAVE-2-SIGN-OFF.md` uses the canonical phrase **"Wave 2 transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued"** — never "Wave 2 complete" without the qualifier. The Principle 9 distinction (RPC-level vs workflow-level certification) is preserved verbatim. |

### 2.3 Non-Goals

The following are **explicitly out of scope** for this PRD. They require a separate PRD or a new FIB amendment.

- **No interactive observability dashboard.** Backlog and lag metrics are emitted to Vercel function logs only; no UI, no Grafana, no metrics export, no Prometheus endpoint. The interactive surface was delivered in Phase 2.3a; this phase adds the log emission only. Any new dashboard requires a separate FIB and PRD (FIB-H §G defers full observability dashboards).
- **No retention for `processed_messages`.** The idempotent-consumer receipt table is left untouched. Its retention policy is a separate concern with different replay implications; in the pilot it remains unbounded.
- **No retention for unprocessed rows.** Rows with `processed_at IS NULL` are never deleted by this cleanup path, regardless of `delivery_attempts`. Dead-letter triage is operator work; automatic deletion would erase evidence.
- **No alerting, paging, or threshold logic.** The log lines are emission only; no synthetic alarms, no on-call hooks. Alerting requires a downstream observability stack that is post-pilot scope.
- **No producer wiring.** `cashout.recorded` remains Layer 1 absent (W2-OBS-CASHOUT-PRODUCER-001). `adjustment.recorded` workflow anchor remains unfixed (W2-OBS-ANCHOR-COVERAGE-001 / PWB-001). Fill and credit operator UIs remain unbuilt (PWB-002). These are explicitly named in the sign-off as residual gaps; resolving them is post-Wave-2.
- **No consumer changes.** Class A and operational consumers, their projection stores, and their idempotency contracts are unchanged.
- **No relay retry-backoff architecture changes.** Retention does not interact with relay scheduling; cycle behaviour is identical to Phase 2.4.
- **No multi-consumer fan-out**, no CDC / WAL relay, no external consumer contract, no event sourcing, no compliance domain scope. All Wave 2 §6 non-goals continue to apply.
- **No new PFT columns**, no new `finance_outbox` columns, no schema-evolution work.

---

## 3. Users & Use Cases

- **Primary user:** On-call engineers and the system itself. The relay worker emits log lines for on-call observability; the cleanup cron executes for the database's own health. No operator-facing surface is introduced.
- **Secondary user:** Lead Architect and Wave 2 reviewers, who consume `WAVE-2-SIGN-OFF.md` as the canonical hand-off artifact and the basis for post-Wave-2 backlog scheduling.

**Top Jobs:**

- As **on-call engineering**, I need to read the latest relay cycle log line and know immediately whether `finance_outbox` is draining, so that I can distinguish healthy quiet from unhealthy stall without opening the admin surface.
- As **on-call engineering**, I need to see per-cycle processing-lag aggregates, so that a gradual lag regression is visible in log history before backlog grows to operator-noticeable size.
- As **the database**, I need processed outbox rows older than 7 days deleted automatically, so that the propagation substrate does not grow unbounded.
- As the **Lead Architect**, I need a sign-off document that records what shipped, what is proven, what is queued, and what language we use to describe each — so that "Wave 2 complete" cannot be overclaimed in any downstream communication.
- As **PWB-001 implementers** (post-Wave-2), I need PROD-ANCHOR-STD-001 ratified before I am asked to enforce it on two surfaces, so that the governing artifact is canonical rather than provisional.

---

## 4. Scope & Feature List

In scope for this PRD:

1. Add `outbox_backlog_size` and `processing_lag_ms` to a structured per-cycle log line emitted from `app/api/internal/outbox-relay/route.ts`.
2. Backlog count is split by `fact_class` and claimability: `{ ledger: { total: N }, operational: { claimable: M, dead_letter: D, total: M + D } }`. A single aggregate is not sufficient — the two consumers have independent claim paths, and the operational claim path excludes `delivery_attempts >= 5`.
3. Processing-lag aggregate is computed across rows whose `processed_at` was newly stamped in the current cycle (Class A + operational combined). Duplicate deliveries and prior receipts do not count as newly processed rows. Cycles with zero processable samples emit `null` for each lag aggregate, not zero.
4. Create migration `YYYYMMDDHHMMSS_create_rpc_cleanup_outbox_processed.sql` introducing `rpc_cleanup_outbox_processed(p_max_rows INTEGER DEFAULT 1000) RETURNS INTEGER` — SECURITY DEFINER, `SET search_path = ''`, EXECUTE revoked from `anon` / `authenticated`, granted only to `service_role`. The RPC rejects `p_max_rows IS NULL`, `p_max_rows < 1`, and `p_max_rows > 1000` with a controlled exception before taking row locks.
5. The RPC implements the cap via a CTE — PostgreSQL `DELETE` does not accept a top-level `LIMIT`:

   ```sql
   DECLARE
     v_deleted INTEGER;
   BEGIN
     IF p_max_rows IS NULL OR p_max_rows < 1 OR p_max_rows > 1000 THEN
       RAISE EXCEPTION 'rpc_cleanup_outbox_processed: p_max_rows must be between 1 and 1000';
     END IF;

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
   END;
   ```

   The RPC returns `count(*)` of deleted rows. `FOR UPDATE SKIP LOCKED` prevents waits on rows currently locked by relay claim paths.
5a. The migration creates a supporting partial index for the cleanup predicate: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_outbox_processed_retention ON public.finance_outbox (processed_at, event_id) WHERE processed_at IS NOT NULL;`. If `CONCURRENTLY` is not permitted by the project's migration tooling, the migration must use a concrete migration-safe fallback: set a bounded `lock_timeout`, document the expected row-count/table-size posture in the migration header, and fail fast rather than waiting on production locks. A plain non-concurrent index is allowed only when the migration header states why the current table size makes the lock acceptable.
6. New route `GET /api/internal/outbox-cleanup` with the same `CRON_SECRET` bearer-auth pattern as `/api/internal/outbox-relay`. No production POST route is introduced. The route calls `rpc_cleanup_outbox_processed` via service-role client and returns `{ deleted: N }` on success.
7. Vercel cron entry in `vercel.json` for the cleanup route, daily schedule (`0 7 * * *` — 07:00 UTC, ~midnight Pacific, off-peak for pilot timezone).
8. Author `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md` (see §6 for required structure).
9. Update `docs/issues/gaps/financial-data-distribution-standard/wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml`: status `accepted_for_wave_2_5_signoff` → `ratified`, add `ratified_by` and `ratified_date` fields.
10. Reconcile `WAVE-2-TRACKER.json`, `WAVE-2-PROGRESS-TRACKER.md`, and `actions/ROLLOUT-TRACKER.json` so all three agree on Phase 2.4 closure and Phase 2.5 status.
11. Unit test for log-line shape (relay route emits an object containing the required keys with correct types, including operational `claimable` / `dead_letter` / `total` semantics).
12. Unit test for cleanup route GET (401 on bad auth; 200 + `{ deleted: N }` on success; 500 plus failure log when the cleanup RPC fails). Unit test verifies POST is not exposed in production.
13. Integration test (`RUN_INTEGRATION_TESTS=true`) verifying the cleanup RPC deletes only rows with `processed_at < now() - INTERVAL '7 days'` and never touches unprocessed or recent rows.

Out of scope (named for clarity):

- No dashboard, no UI changes, no metrics export, no alerting.
- No retention for `processed_messages`, `visit_class_a_projection`, `shift_operational_projection`, or `gaming_day_lifecycle`.
- No new producer, no new consumer, no relay scheduling changes.
- No resolution of any post-Wave-2 backlog item (PWB-001, PWB-002, W2-OBS-CASHOUT-PRODUCER-001).

---

## 5. Requirements

### 5.1 Functional Requirements

**FR-1 — Structured log line per relay cycle (two schema variants).**
The relay route emits exactly one structured log line (JSON-shaped via `console.log(JSON.stringify(...))`) per `POST /api/internal/outbox-relay` invocation. This PRD declares a narrow governance exception to the normal production `console.*` ban: these two internal Vercel cron routes may emit structured JSON operational logs because Vercel function logs are the explicitly chosen sink and no separate logger abstraction is in scope. The line has **two schema variants** — authenticated and unauthenticated — distinguished by an explicit `auth_failed` boolean. The unauthenticated variant is required because backlog cannot be read without a DB query, which must not happen before auth (see NFR-3).

**Authenticated cycle (auth passes, claim runs):**

```ts
{
  event: 'outbox_relay_cycle',
  timestamp: string,         // ISO 8601, cycle completion time
  auth_failed: false,        // optional; absence implies false
  outbox_backlog_size: {
    ledger: {
      total: number          // count of fact_class='ledger' AND processed_at IS NULL at cycle start
    },
    operational: {
      claimable: number,     // fact_class='operational' AND processed_at IS NULL AND delivery_attempts < 5
      dead_letter: number,   // fact_class='operational' AND processed_at IS NULL AND delivery_attempts >= 5
      total: number          // claimable + dead_letter
    }
  },
  processed: {
    class_a: number,         // newly stamped processed_at rows only; duplicate outcomes excluded
    operational: number      // newly stamped processed_at rows only; duplicate outcomes excluded
  },
  processing_lag_ms: {
    min: number | null,      // null if zero rows processed this cycle
    p50: number | null,
    p95: number | null,
    max: number | null
  }
}
```

**Unauthenticated cycle (401 path, no DB access):**

```ts
{
  event: 'outbox_relay_cycle',
  timestamp: string,
  auth_failed: true,
  outbox_backlog_size: null,           // not readable without DB query
  processed: { class_a: 0, operational: 0 },
  processing_lag_ms: { min: null, p50: null, p95: null, max: null }
}
```

**Branch-to-relay lag-sample contract.** Each relay consumer branch (Class A, operational) returns an internal `lagSamplesMs: number[]` field on its result type, containing **only** rows whose `processed_at` was successfully stamped (operational branch) or whose `rpc_acknowledge_outbox_delivery` returned success for the `'processed'` outcome (Class A branch) during this cycle. Duplicate-delivery outcomes, skipped-row outcomes (`'skipped_ledger'`, `'skipped_unknown'`), failed-process outcomes, claim errors, and auth failures **must not** contribute samples. The relay route computes `processing_lag_ms` aggregates by concatenating `classA.lagSamplesMs ++ operational.lagSamplesMs` and computing min/p50/p95/max in TypeScript. `lagSamplesMs` is an internal contract — not part of the HTTP response body — and lives in the branch result types only.

Implementation note: backlog size is read from `finance_outbox` at the start of the authenticated cycle (after auth, before claim). Ledger backlog is a total count for `fact_class='ledger' AND processed_at IS NULL`. Operational backlog is two counts: claimable rows (`fact_class='operational' AND processed_at IS NULL AND delivery_attempts < 5`) and dead-letter rows (`fact_class='operational' AND processed_at IS NULL AND delivery_attempts >= 5`); `total` is their sum. Processing lag for each successfully processed row is `Date.now() - new Date(row.created_at).getTime()` captured at the moment the row's `processed_at` transitions to non-null (Class A: post-`rpc_acknowledge_outbox_delivery` success for the `'processed'` outcome only; operational: when `rpc_process_operational_projection` returns `'processed'`). Aggregates are computed in TypeScript from the combined sample array; no SQL aggregation needed.

**FR-2 — Cycle log emission is unconditional, with schema variant by auth state.**
Every `POST /api/internal/outbox-relay` invocation emits exactly one log line. Auth-failed invocations emit the **unauthenticated** variant (`auth_failed: true`, `outbox_backlog_size: null`, no DB queries made); authenticated invocations emit the **authenticated** variant. Zero-row authenticated cycles still emit `outbox_backlog_size` from the DB query and `processing_lag_ms` aggregates as `null` (no samples). Claim errors **after** successful auth emit the authenticated variant with `outbox_backlog_size` populated, `processed: { class_a: 0, operational: 0 }`, `processing_lag_ms` nulls, and `error` populated with the bounded claim-error message. Operators distinguish healthy-quiet from unhealthy-stall by reading `outbox_backlog_size` on authenticated zero-row cycles; they distinguish auth misconfiguration from genuine traffic by reading `auth_failed`.

**FR-3 — Retention RPC contract.**
`rpc_cleanup_outbox_processed(p_max_rows INTEGER DEFAULT 1000) RETURNS INTEGER`. SECURITY DEFINER, `SET search_path = ''`. EXECUTE revoked from `anon` / `authenticated`; granted to `service_role` only. The RPC rejects `p_max_rows IS NULL`, `p_max_rows < 1`, and `p_max_rows > 1000` before taking row locks. Body uses a CTE pattern (PostgreSQL `DELETE` does not accept a top-level `LIMIT`):

```sql
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_max_rows IS NULL OR p_max_rows < 1 OR p_max_rows > 1000 THEN
    RAISE EXCEPTION 'rpc_cleanup_outbox_processed: p_max_rows must be between 1 and 1000';
  END IF;

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
END;
```

The RPC returns `count(*)` of deleted rows. `FOR UPDATE SKIP LOCKED` in the CTE ensures the cleanup never waits on rows held by the relay's `rpc_claim_class_a_outbox_batch` / `rpc_claim_operational_outbox_batch` paths. Idempotent in the sense that repeated calls converge: once nothing matches the predicate, the RPC returns 0.

**FR-4 — Cleanup route auth and shape.**
`GET /api/internal/outbox-cleanup` for Vercel cron. No production POST route is introduced. Requires `Authorization: Bearer ${CRON_SECRET}`. On bad auth: 401 with no DB access. On success: 200 with body `{ deleted: number }`. On cleanup RPC failure after successful auth: 500 with `{ error: 'cleanup_failed' }`. The route is global service-role infrastructure maintenance across all casinos; it is not tenant-scoped and must not accept casino/user scoping parameters. The route logs one structured line after successful auth for both success and failure: success `{ event: 'outbox_cleanup_cycle', timestamp, deleted: N, max_rows: 1000, capped: boolean, error: null }`; failure `{ event: 'outbox_cleanup_cycle', timestamp, deleted: null, max_rows: 1000, capped: null, error: string }` with the error string bounded to 500 characters. `capped` is `true` when `deleted === max_rows`, signalling that eligible historical rows may remain after the run.

**FR-5 — Vercel cron entry.**
`vercel.json` gains a second cron entry for `GET /api/internal/outbox-cleanup` on `0 7 * * *`. The existing relay cron entry is unchanged. No PRD section may assume Vercel cron invokes POST.

**FR-6 — Sign-off artifact.**
`WAVE-2-SIGN-OFF.md` at `docs/issues/gaps/financial-data-distribution-standard/actions/`. See §6 for required structure.

**FR-7 — PROD-ANCHOR-STD-001 ratification.**
Update `PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml` top-level fields:
- `status: ratified` (was `accepted_for_wave_2_5_signoff`)
- Add `ratified_by: WAVE-2-SIGN-OFF.md`
- Add `ratified_date: 2026-MM-DD` (the actual sign-off date)

**FR-8 — Tracker reconciliation.**
- `WAVE-2-TRACKER.json` `cursor.active_phase` advances from `2.4` to `2.5`; `phases[id="2.4"].status` becomes `complete` with commit hash; `phases[id="2.5"].status` becomes `in_progress` (then `complete` on Phase 2.5 exit).
- `WAVE-2-PROGRESS-TRACKER.md` overall status table updates: Phase 2.3 and Phase 2.4 marked ✅ COMPLETE with PRDs and dates; current position narrative updated.
- `actions/ROLLOUT-TRACKER.json` `cursor.wave_2_progress_tracker_json` reference is current; `cursor.next_action` reflects Phase 2.5.

### 5.2 Non-Functional Requirements

**NFR-1 — Retention transaction bound.**
The cleanup RPC must not hold a transaction open longer than 5 seconds in normal operation. The CTE `LIMIT p_max_rows` (default 1000) plus `FOR UPDATE SKIP LOCKED` are the bounds: the cap limits row count and `SKIP LOCKED` prevents waits on relay-held rows. The supporting partial index `idx_finance_outbox_processed_retention` (FR-3 / §4 item 5a) ensures the doomed-CTE scan is index-bounded rather than seq-scan-bounded. If 1000 rows per day is insufficient at scale, the daily cron can be promoted to hourly without code change — but that decision is post-pilot.

**NFR-2 — Log volume.**
The relay cron runs every minute. Per-cycle log emission adds one line per minute = 1440 lines/day per environment. This is within Vercel function log retention and does not require a separate log sink. Per-row lag logging would be 1–2 orders of magnitude noisier and is explicitly rejected.

**NFR-3 — Security parity with relay route.**
The cleanup route uses the same `CRON_SECRET` validated **before any DB access**, the same service-role client construction pattern, and the same response shape family as the relay route. No second secret, no second auth pattern. The structured `console.log(JSON.stringify(...))` lines in the relay and cleanup routes are an explicit PRD-scoped exception to the general no-`console.*` production-code guardrail; the exception is limited to internal cron operational telemetry and must not be copied to user-facing routes.

**NFR-4 — Audit traceability preserved.**
PFT, `pit_cash_observation`, `table_buyin_telemetry`, `table_fills`, `table_credits`, `visit_class_a_projection`, and `shift_operational_projection` are unchanged by retention. The outbox is a propagation channel, not the system of record — deleting processed outbox rows does not erase any authoring or projection state.

**NFR-5 — Replay window honesty.**
The 7-day retention window defines the **upper bound** on replay-from-outbox capability after Phase 2.5. This PRD intentionally narrows Wave 2's prior replay posture from "replay all rows currently in `finance_outbox` history" to "replay retained `finance_outbox` history, or re-seed from authoring stores after retention." Any I4 replay test or operator-initiated replay must complete within this window or be re-seeded from authoring stores. This must be named in `WAVE-2-SIGN-OFF.md` so post-Wave-2 work does not assume infinite replay history.

**NFR-6 — Backlog count query bound.**
The authenticated relay-cycle backlog counts must be index-supported and cheap at pilot scale. The DoD requires an `EXPLAIN` check for the ledger total, operational claimable, and operational dead-letter count predicates. If any count path seq-scans non-trivial `finance_outbox` cardinality, the implementation must add a supporting partial index or document why an existing index covers the predicate before merge.

### 5.3 Governance Requirements

**GR-1 — Sign-off language is exact.**
The phrase **"Wave 2 transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued"** appears verbatim in `WAVE-2-SIGN-OFF.md`. The phrase **"Wave 2 complete"** does not appear without that qualifier.

**GR-2 — Post-Wave-2 backlog reconciled against PRD-088 closure state.**
The §10 table from `WAVE-2-ROLLOUT-MAP.md` is reproduced in `WAVE-2-SIGN-OFF.md` with three explicitly-labelled categories — never as a single undifferentiated table:

1. **Unresolved post-Wave-2 backlog** — PWB-001 (`adjustment.recorded` anchor wiring, governed by PROD-ANCHOR-STD-001), PWB-002 (fill/credit operator UI), `W2-OBS-CASHOUT-PRODUCER-001` (`cashout.recorded` Layer 1 producer absence). Each requires its own PRD before code.
2. **Closed in Phase 2.4 (PRD-088)** — PWB-003 (`GrindBuyinPanel` mounted in `TablesPanel` via `panel-container.tsx`; `gamingDay` threaded through prop chain). Listed as **evidence of closure with reference to PRD-088 / EXEC-088 / commit**, not as an open gap.
3. **Deferred infrastructure upgrades** — multi-consumer fan-out, CDC / WAL relay, external consumer contract. Each requires its own ADR + FIB amendment before scope reopens.

The categorisation must not let a closed item read as unresolved or vice versa. PWB-003 appearing in §10 of the rollout map is historical context — its sign-off status is CLOSED.

**GR-3 — Principle 9 distinction preserved.**
The sign-off explicitly distinguishes the four certification levels named in `WAVE-2-ROLLOUT-MAP.md` §8: transport complete, RPC producer coverage, workflow-level producer coverage, and known unresolved workflow gaps. Each producer is mapped to its certification level.

**GR-4 — No frozen-doc patching.**
ADR-052 through ADR-056 remain frozen. The sign-off references them; it does not edit them. If any sign-off review surfaces a real conflict with a frozen ADR, the resolution is a superseding ADR — not a silent patch.

**GR-5 — Replay authority update.**
`WAVE-2-SIGN-OFF.md` must explicitly record the Phase 2.5 retention decision as the authority update that bounds post-retention outbox replay to retained history. It must cite the pre-existing FIB-H replay invariant and state that replay beyond retained history requires authoring-store reseed or a future FIB/ADR amendment. The sign-off must not imply unbounded `finance_outbox` replay after retention is active.

---

## 6. UX / Flow Overview

This phase introduces no operator-facing UI. The "flows" are operational and documentary.

### 6.1 Operator-on-call flow (post-Phase-2.5)

1. On-call observes elevated backlog or pages a colleague.
2. Open Vercel function logs, filter to `event:"outbox_relay_cycle"`.
3. Read the latest line. Decide which fact_class is backing up by inspecting `outbox_backlog_size.ledger.total` vs `outbox_backlog_size.operational.total`; distinguish drainable operational work from poison rows via `outbox_backlog_size.operational.claimable` and `outbox_backlog_size.operational.dead_letter`.
4. Read `processing_lag_ms.p95` for trend. Compare against historical baseline (post-Wave-2 work; not in scope here).
5. If deep inspection needed, open `/admin/outbox-observability` (Phase 2.3a surface). The log line tells the on-call *whether to look*; the admin surface tells them *what to see*.

### 6.2 Daily retention flow (system)

1. 07:00 UTC daily — Vercel cron triggers `GET /api/internal/outbox-cleanup`.
2. Route authenticates `CRON_SECRET`, constructs service-role client, calls `rpc_cleanup_outbox_processed(1000)`.
3. RPC deletes up to 1000 outbox rows where `processed_at < now() - INTERVAL '7 days'`. Returns the count.
4. Route logs `{ event: 'outbox_cleanup_cycle', timestamp, deleted: N, max_rows: 1000, capped: boolean, error: null }`.
5. Steady state: `N` settles at the daily addition rate (one day's worth of processed rows). Initial run after deploy may hit the 1000-row CTE cap multiple consecutive days while the backlog of historical processed rows drains; `capped: true` is the operator signal that eligible rows may remain after the run.

### 6.3 Sign-off artifact structure

`WAVE-2-SIGN-OFF.md` must contain these sections in order:

1. **Header.** Frontmatter with `id`, `created`, `signed_by`, `phase: Wave 2 Phase 2.5`. Title and one-sentence summary.
2. **Wave 2 phase summary.** One paragraph per phase (2.0, PRD-082, 2.1, 2.2, 2.3a, 2.3, 2.4, 2.5) — PRD, EXEC, commit (where merged), exit date, scope-of-delivery in one sentence.
3. **I1–I4 proof record.** Per-producer I1 status (5 producers); transport-baseline I2; consumer-layer I3 and I4 for both Class A and operational projections; I5 inheritance from Wave 1.
4. **DEC-1 resolution record.** What DEC-1 was, how Phase 2.3 resolved it, the affected DTOs and routes, the remaining caveat (visit aggregates emit `'partial'` until table-scoped backlog drains and gaming day closes).
5. **PROD-ANCHOR-STD-001 ratification.** Status promoted from `accepted_for_wave_2_5_signoff` to `ratified`. The standard is now the governing artifact for PWB-001 enforcement.
6. **Post-Wave-2 backlog reconciliation (three categorised sub-tables, not one undifferentiated table).** Reproduced from `WAVE-2-ROLLOUT-MAP.md` §10 but split into:
   - **(a) Unresolved backlog:** PWB-001 (`adjustment.recorded` anchor — PROD-ANCHOR-STD-001), PWB-002 (fill/credit operator UI), `W2-OBS-CASHOUT-PRODUCER-001` (`cashout.recorded` no producer).
   - **(b) Closed in Phase 2.4:** PWB-003 (`GrindBuyinPanel` mounted) with reference to PRD-088, EXEC-088, and the closing migration / commit.
   - **(c) Deferred infrastructure upgrades:** multi-consumer fan-out, CDC / WAL relay, external consumer contract.
7. **Sign-off language and certification level mapping.**
    - The canonical phrase **"Wave 2 transport and projection infrastructure complete; workflow-level producer coverage gaps documented and queued"** appears here.
    - Per-producer table: `buyin.recorded` — workflow-certified; `grind.observed` — workflow-certified (Phase 2.4); `adjustment.recorded` — RPC-certified, workflow gap (PWB-001); `cashout.recorded` — RPC absent (W2-OBS-CASHOUT-PRODUCER-001); `fill.recorded`, `credit.recorded` — API-certified, operator UI gap (PWB-002).
8. **Hand-off to post-Wave-2 backlog.** PWB-001, PWB-002, and W2-OBS-CASHOUT-PRODUCER-001 are queued. Each requires its own PRD before code. The 7-day replay window is named as a constraint on post-Wave-2 replay-based remediation work, and the sign-off explicitly records that replay beyond retained outbox history requires authoring-store reseed or future FIB/ADR amendment.

---

## 7. Dependencies & Risks

### 7.1 Prerequisites

- Phase 2.4 exit ✅ MET (PRD-088 / EXEC-088, 2026-05-21). All upstream phases (2.0 → 2.4) complete; transport substrate and both projection consumers live.
- `CRON_SECRET` already configured in Vercel for the relay route — the cleanup route reuses it; no new secret required.
- `vercel.json` cron infrastructure already in use; adding a second entry is a one-line change.
- Service-role client (`createServiceClient`) already in use across `/api/internal/*` routes.

### 7.2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Retention deletes a row another component still needs to replay | Low | Medium | Replay window stated as 7 days in sign-off (NFR-5). Any I4 replay must complete within window or re-seed from authoring stores. Dead-letter rows (`delivery_attempts >= 5`) are preserved indefinitely (predicate excludes `processed_at IS NULL`). |
| Cleanup RPC blocks relay claim path | Low | High | The doomed CTE is capped at 1000 rows and uses `FOR UPDATE SKIP LOCKED`. The relay claim RPC also uses `FOR UPDATE SKIP LOCKED` and will skip any row the cleanup transaction is currently locking. No cross-blocking expected. |
| Log volume exceeds Vercel function log quota | Very low | Low | 1440 cycle lines + 1 cleanup line per day per environment is well within Vercel's log retention. If quotas tighten, the per-cycle log can be downsampled or routed to a separate sink — post-Wave-2 work. |
| Tracker re-sync introduces a contradiction operator notices later | Low | Medium | The reconciliation is a documentation pass with three artifacts; reviewer reads all three before merge. PRD-088 précis is the authoritative baseline for Phase 2.4 state. |
| Sign-off overclaims completeness | Medium | High | GR-1, GR-2, GR-3 are explicit governance requirements. The canonical phrase is mandatory; the residual gap table is verbatim; Principle 9 distinctions are preserved. Devils-advocate review before merge. |
| PROD-ANCHOR-STD-001 ratification is premature if PWB-001 surfaces a flaw | Low | Low | Ratification records the standard as the governing artifact for PWB-001. If PWB-001 implementation reveals a flaw, the standard is amended via a superseding directive — same pattern as ADR amendment. |
| Retention runs before all environments are caught up on processed rows | Low | Low | First-run behaviour: if historical backlog of processed rows exceeds 1000, daily runs drain at 1000/day until caught up. `capped: true` in the cleanup log is the signal that eligible rows may remain. No correctness impact; only initial lag in retention steady state. |

### 7.3 Open Questions

| Q | Question | Recommended Resolution |
|---|----------|----------------------|
| Q1 | Should the cleanup route accept an optional `p_max_rows` query parameter for on-demand bulk drains? | **No** for the pilot. Default-only keeps the route surface minimal. Manual bulk drain is a `psql` operation by a DBA, not a route concern. Revisit if first-run backlog drain proves operationally annoying. |
| Q1a | Should the cleanup route expose POST for manual/local invocation? | **No.** Vercel cron invokes GET, and adding POST creates a second mutation surface. Manual/local cleanup is handled by direct DBA SQL if needed. |
| Q2 | Should the relay route also log a cycle line when auth fails (401)? | **Yes — with the unauthenticated schema variant (FR-1).** Auth-failed cycles emit `auth_failed: true`, `outbox_backlog_size: null` (no DB access permitted before auth per NFR-3), `processed: {class_a: 0, operational: 0}`, and null lag aggregates. A relay endpoint receiving unauthorized requests is itself a signal. |
| Q5 | Does relay `processed` count duplicate deliveries? | **No.** `processed.class_a` and `processed.operational` count only rows whose `processed_at` is newly stamped during this cycle. Duplicate outcomes are successful idempotency outcomes but not new processing samples. |
| Q6 | Is cleanup tenant-scoped? | **No.** Cleanup is global service-role infrastructure maintenance across all casinos. The route must not accept `casino_id`, staff, or user scoping parameters. |
| Q3 | Should `processed_messages` get a retention policy in this phase? | **No** — explicitly out of scope. Its retention has different replay implications and warrants a separate PRD. Named in `WAVE-2-SIGN-OFF.md` as a residual concern. |
| Q4 | Where does the actual sign-off ceremony happen (review, approval, merge)? | `/lead-architect` authors `WAVE-2-SIGN-OFF.md`. `/devils-advocate` runs an adversarial review before merge. The PRD's DoD is approved when both pass. The sign-off is the merge of the document plus the cursor advance in `WAVE-2-TRACKER.json`. |

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Relay route emits exactly one cycle log line per invocation with the schema variant matching auth state (authenticated or unauthenticated per FR-1)
- [ ] `outbox_backlog_size` is split as `ledger.total` and `operational.{claimable, dead_letter, total}` on authenticated cycles; `null` on auth-failed cycles
- [ ] `processing_lag_ms` is emitted as `{ min, p50, p95, max }` with `null` values when zero processable samples (zero-row cycles or auth-failed cycles)
- [ ] Branch lag-sample contract: each consumer branch returns `lagSamplesMs: number[]` containing only successfully processed rows; duplicate, skipped, failed, claim-error, and auth-fail outcomes do not contribute samples
- [ ] `GET /api/internal/outbox-cleanup` route lives at the documented Vercel cron path with `CRON_SECRET` bearer auth; production POST is not exposed
- [ ] `rpc_cleanup_outbox_processed` deletes only rows where `processed_at IS NOT NULL AND processed_at < now() - INTERVAL '7 days'`, capped at `p_max_rows`, using the CTE pattern in FR-3 (PostgreSQL `DELETE` does not accept top-level `LIMIT`)
- [ ] `rpc_cleanup_outbox_processed` rejects null, zero, negative, and greater-than-1000 `p_max_rows` values before row locks
- [ ] Vercel daily cron entry for cleanup route present in `vercel.json` and active

**Data & Integrity**
- [ ] Cleanup RPC never deletes rows with `processed_at IS NULL` (verified by integration test)
- [ ] Cleanup RPC never deletes rows newer than 7 days (verified by integration test)
- [ ] Retention partial index `idx_finance_outbox_processed_retention` present; `EXPLAIN` of the doomed CTE shows index usage on non-trivial row counts
- [ ] Relay backlog count predicates have `EXPLAIN` evidence for index-supported ledger total, operational claimable, and operational dead-letter counts on non-trivial row counts
- [ ] PFT, `pit_cash_observation`, `table_buyin_telemetry`, `table_fills`, `table_credits`, `visit_class_a_projection`, `shift_operational_projection` rows are unchanged by retention runs
- [ ] `processed_messages` rows are left unchanged by retention; retained idempotency receipts whose `message_id` no longer has a matching retained `finance_outbox.event_id` are accepted by design

**Security & Access**
- [ ] Cleanup route returns 401 on missing or invalid `Authorization` header
- [ ] `rpc_cleanup_outbox_processed` is SECURITY DEFINER with `SET search_path = ''`
- [ ] EXECUTE on cleanup RPC is revoked from `anon` and `authenticated`; granted only to `service_role`
- [ ] Route constructs service-role client only after auth passes

**Testing**
- [ ] Unit tests verifying both log line schema variants — authenticated cycle (backlog and lag populated) and unauthenticated cycle (`auth_failed: true`, `outbox_backlog_size: null`, no DB access made)
- [ ] Unit test verifying authenticated relay claim failure still emits exactly one `outbox_relay_cycle` line with backlog populated, processed counts zeroed, lag nulls, and `error` populated
- [ ] Unit test for the lag-sample exclusion rule: a mixed cycle with one successfully processed Class A row, one duplicate operational row, and one failed operational row computes lag aggregates from the single processed row only
- [ ] Unit test for cleanup route GET (401 on bad auth with no DB access and no service-role client construction; 200 + `{ deleted: N }` on success; 500 + `{ error: 'cleanup_failed' }` and failure log on RPC error)
- [ ] Unit test confirming production POST is not exported for `/api/internal/outbox-cleanup`
- [ ] Unit test confirming cleanup success log includes `max_rows: 1000` and `capped: true` when `deleted === 1000`
- [ ] Integration test (`RUN_INTEGRATION_TESTS=true`) inserting rows at three age bands (now, 6 days ago, 8 days ago); verifying the 8-day row is the only deletion target
- [ ] Integration test confirming the cleanup RPC respects `p_max_rows` cap: `p_max_rows = 1` deletes exactly one eligible row; repeated calls converge to 0 once eligible rows are exhausted
- [ ] Integration test confirming first-run cap behaviour: when more than 1000 rows are eligible, one run deletes exactly 1000 and leaves remaining eligible rows intact for later runs
- [ ] Integration test confirming invalid `p_max_rows` values (`NULL`, `0`, negative, `1001`) fail before deleting rows
- [ ] Integration test verifying `EXPLAIN` of the doomed CTE uses `idx_finance_outbox_processed_retention`
- [ ] No regressions in existing relay or observability test suites
- [ ] Merge gate uses `npm run test:verify` (or an explicitly documented equivalent that runs node unit tests plus `RUN_INTEGRATION_TESTS=true` integration tests); `npm run test:ci` alone is insufficient because it excludes `.int.test` and `integration.test` files

**Operational Readiness**
- [ ] Relay cycle log line visible in Vercel function logs after first cron tick post-deploy
- [ ] Cleanup cycle log line visible after first daily run
- [ ] Rollback path documented: disable the cleanup cron entry in `vercel.json` first; if rollback is still required, use a forward migration to drop `rpc_cleanup_outbox_processed` and `idx_finance_outbox_processed_retention`; relay log line is additive and harmless to leave in place

**Documentation**
- [ ] `WAVE-2-SIGN-OFF.md` authored with all eight required sections (§6.3)
- [ ] Canonical sign-off phrase (G8 / GR-1) present verbatim
- [ ] Post-Wave-2 backlog table (GR-2) reconciled against PRD-088 closure state with three explicitly-labelled categories: unresolved backlog (PWB-001, PWB-002, W2-OBS-CASHOUT-PRODUCER-001), closed-in-Phase-2.4 (PWB-003), deferred infrastructure (fan-out, CDC, external contract)
- [ ] Principle 9 four-level certification distinction (GR-3) preserved per producer
- [ ] PROD-ANCHOR-STD-001 status updated to `ratified` with `ratified_by` and `ratified_date`
- [ ] `WAVE-2-TRACKER.json` cursor advanced; Phase 2.4 marked complete; Phase 2.5 status accurate
- [ ] `WAVE-2-PROGRESS-TRACKER.md` updated to reflect actual current state (no Phase 2.3a-era stale data)
- [ ] `actions/ROLLOUT-TRACKER.json` `cursor` reflects Wave 2 closure or next-action pointer
- [ ] 7-day replay window named as a constraint in `WAVE-2-SIGN-OFF.md`
- [ ] `WAVE-2-SIGN-OFF.md` records the replay authority update: post-retention outbox replay is bounded to retained history; replay beyond retained history requires authoring-store reseed or future FIB/ADR amendment

**Surface Governance**
- [ ] Not applicable — this PRD introduces no new UI surface. Confirmed: no `app/(dashboard)/**` or `components/**` additions in this slice.

**Devils-Advocate Review**
- [ ] `/devils-advocate` review of `WAVE-2-SIGN-OFF.md` produces no P0 findings, or all P0 findings are resolved before merge

---

## 9. Related Documents

**Authority documents:**
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-ROLLOUT-MAP.md` — Phase 2.5 scope (§4), exit criteria (§8), residual gap inventory (§10)
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/FIB-H-TRANSACTIONAL-OUTBOX.md` — parent FIB (no amendment)
- `docs/80-adrs/ADR-052` through `ADR-056` — frozen authority (referenced, not edited)

**Upstream phase artifacts:**
- `docs/10-prd/PRD-081-transactional-outbox-gap-f1-closure-v0.md` — Phase 2.0 exemplar
- `docs/10-prd/PRD-082-wave2-integration-proof-v0.md` — runtime gate
- `docs/10-prd/PRD-083-wave2-phase2-1-adjustment-producer-expansion-v0.md` — Phase 2.1
- `docs/10-prd/PRD-085-wave2-phase-2.2-dependency-event-producer-expansion-v0.md` — Phase 2.2
- `docs/10-prd/PRD-086-wave2-phase-2.3a-operational-outbox-observability-v0.md` — Phase 2.3a admin surface
- `docs/10-prd/PRD-087-wave2-phase-2.3-lifecycle-aware-completeness-projection-v0.md` — Phase 2.3 Class A consumer
- `docs/10-prd/PRD-088-wave2-phase-2.4-operational-telemetry-projection-v0.md` — Phase 2.4 operational consumer

**Governance and standards:**
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml` — PROD-ANCHOR-STD-001 (status updated by this PRD)
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-observability/issues/W2-OBS-CASHOUT-PRODUCER-001.yaml` — `cashout.recorded` Layer 1 gap
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-observability/issues/W2-OBS-ANCHOR-COVERAGE-001.yaml` — `adjustment.recorded` anchor gap
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2.3a/CORE-OPERATIONAL-LOOP.md` — per-producer certification posture

**Tracker artifacts (updated by this PRD):**
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json`
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json`

**Sign-off artifact (created by this PRD):**
- `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md` — sister to `WAVE-1-PHASE-1.5-SIGNOFF.md` in style and structure

---

## Appendix A: Implementation Plan (Workstreams)

The EXEC-SPEC (authored by `/lead-architect`) will refine these. Listed here so the PRD reviewer can see scale.

| WS | Title | Skill | Artefacts |
|----|-------|-------|-----------|
| **WS1_LOG** | Relay cycle log line + branch lag-sample contract | backend-service-builder | `app/api/internal/outbox-relay/route.ts` amendment (authenticated + unauthenticated log variants per FR-1); branch result types extended with `lagSamplesMs: number[]` in `outbox-consumer.ts` and `outbox-operational-consumer.ts`; lag-aggregate helper (min/p50/p95/max); unit tests for both log variants and for the lag-sample exclusion rule (duplicates / skipped / failed / claim errors / auth failures do not contribute samples) |
| **WS2_RETENTION** | Retention RPC + supporting index + route + cron | backend-service-builder | Migration `YYYYMMDDHHMMSS_create_rpc_cleanup_outbox_processed.sql` (CTE-based RETURNS INTEGER cleanup RPC per FR-3 + partial index `idx_finance_outbox_processed_retention` per §4 item 5a); `app/api/internal/outbox-cleanup/route.ts` with GET only for Vercel cron; `vercel.json` cron entry; route unit test; integration test (verifies CTE row cap, first-run cap behaviour, invalid cap rejection, age gate, and index usage via `EXPLAIN`) |
| **WS3_SIGNOFF** | Wave 2 sign-off artifact | /lead-architect | `docs/issues/gaps/financial-data-distribution-standard/actions/WAVE-2-SIGN-OFF.md` (eight required sections per §6.3) |
| **WS4_GOVERNANCE** | PROD-ANCHOR-STD-001 ratification + tracker re-sync | /lead-architect | `PRODUCER-ANCHOR-RESOLUTION-STANDARD.yaml` status update; `WAVE-2-TRACKER.json` cursor advance; `WAVE-2-PROGRESS-TRACKER.md` reconciliation; `actions/ROLLOUT-TRACKER.json` cursor update |
| **WS5_REVIEW** | Devils-advocate review of sign-off | /devils-advocate | Adversarial review report; P0 findings resolved before merge |

---

## Appendix B: Decision Defaults Carried From Context

These four decisions were resolved during context-gathering and are committed in this PRD draft. Each may be challenged in `/lead-architect` EXEC-SPEC scaffold or `/devils-advocate` review.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| D1 | Retention mechanism (`pg_cron`, Vercel cron, lazy delete, manual)? | **Vercel cron + service-role HTTP route** | `pg_cron` banned per pilot containment (`feedback_pilot-containment-enforcement` memory); Vercel cron already deployed for relay; no new infra surface |
| D2 | Log target (stdout, metrics table, Prometheus)? | **Structured `console.log` JSON; Vercel function logs as sink** | FIB-H §G defers full observability dashboards; minimum honest signal; no new infra |
| D3 | Lag metric scope (per-row, per-cycle aggregate, both)? | **Per-cycle aggregate: `{ min, p50, p95, max }`** | Per-row would generate ~50–100× the log volume; per-cycle is operationally meaningful and analysis-friendly |
| D4 | Tracker re-sync timing (pre-PRD housekeeping vs WS-GOVERNANCE)? | **WS-GOVERNANCE workstream within this PRD** | Roadmap §3 requires PRD lands before code; tracker edits are documentation, fits WS-GOVERNANCE alongside sign-off authoring |

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-05-21 | prd-writer | Initial draft for /lead-architect review |
| v0.1 | 2026-05-21 | prd-writer | Applied `PRD-089-audit-patch-delta.yaml`: **P0-001** CTE-based retention DELETE (PostgreSQL has no top-level `LIMIT` on DELETE); **P0-002** auth-failure log variant (split FR-1 into authenticated/unauthenticated schemas; auth-failed never queries DB); **P1-001** branch `lagSamplesMs: number[]` contract (only successfully processed rows contribute); **P1-002** `http_boundary: true` (new internal route introduced); **P1-003** sign-off post-Wave-2 backlog reconciled against PRD-088 closure (PWB-003 categorised as CLOSED, not residual); **P2-001** wording: one relay-cycle line + one cleanup-cycle line (not two relay lines); **P2-002** retention partial index `idx_finance_outbox_processed_retention` required |
| v0.2 | 2026-05-21 | codex | Applied `PRD-089-audit-round2-patch-delta.yaml`: **P0-003** cleanup route is GET-compatible for Vercel cron while optional POST is manual/local only if retained; **P1-004** cleanup RPC SQL body explicitly returns an integer via `deleted` CTE count; **P2-003** stale `DELETE ... LIMIT` risk wording replaced with doomed-CTE language; **P2-004** cleanup log field standardized on `deleted` |
| v0.3 | 2026-05-21 | codex | Applied devils-advocate audit delta: removed optional production POST cleanup surface; declared retained `processed_messages` receipts acceptable after outbox retention; added full RPC `DECLARE`/validation skeleton; specified cleanup failure log and 500 response; added invalid-cap, claim-error, POST-absence, and rollback acceptance gates; documented the scoped structured-console logging exception |
| v0.4 | 2026-05-21 | codex | Applied devils-advocate audit delta: bounded post-retention I4 replay authority to retained outbox history or authoring-store reseed; split operational backlog into `claimable` / `dead_letter` / `total`; defined relay `processed` as newly stamped rows only; declared cleanup as global service-role maintenance; added `max_rows` / `capped` cleanup log fields; tightened index fallback rules; added backlog `EXPLAIN`, first-run cap, service-client-after-auth, and `npm run test:verify` merge gates |
