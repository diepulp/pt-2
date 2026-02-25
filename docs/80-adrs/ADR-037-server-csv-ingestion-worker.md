# ADR-037: Server-Authoritative CSV Ingestion Worker

**Status:** Accepted
**Date:** 2026-02-24
**Deciders:** Lead Architect
**Consulted:** Security, Backend Engineering, DevOps
**Informed:** Frontend, Operations
**Supersedes:** Partially supersedes ADR-036 D1 (browser-side parsing is demoted from authoritative to advisory/preview)

## Context

ADR-036 established browser-side Papa Parse as the MVP import parser. This was explicitly a Lane 1 decision with a documented exit ramp to server-side parsing. The exit ramp is now being exercised because:

1. **Client-as-authority trust boundary violation:** Browser parsing makes the client the source of truth for data ingestion. Browser memory limits, flaky networks, and lack of durability make this unacceptable for a staging-first claims pipeline.
2. **Loyalty reconciliation blocker:** The Loyalty & Tier Reconciliation feature (paused) requires server-staged data as its input. Client-side staging cannot provide the durability guarantees needed.
3. **Vercel timeout wall:** Vercel serverless functions (10-300s depending on plan) cannot reliably process 10k-row CSVs in a streaming fashion.

### Decision Drivers (ranked)

1. Correctness: worker output must be semantically equivalent to client-side staging for the same input
2. Durability: crash recovery must produce identical results (idempotent retry)
3. Casino isolation: `service_role` bypass must not cause cross-casino leakage
4. Operational simplicity: minimize new infrastructure and deployment complexity
5. Exit ramp: `ImportPlayerV1` canonical contract (ADR-036 D2) remains the stable interface boundary

### Constraints (non-negotiable)

- `csv-parse` (Node.js, streaming) is the parser — locked
- `import_row` schema: ZERO changes (existing RPCs, RLS, service layer depend on it)
- `rpc_import_execute`: unchanged (execute pathway is stable and tested)

## Decisions

### D1: Standalone Node.js worker on dedicated PaaS

**Options considered:**
- A. Standalone Node.js worker on dedicated PaaS (Railway preferred; Fly.io acceptable; both must support TCP outbound to Supabase and stable process runtime)
- B. Supabase Edge Function (Deno runtime, database webhook trigger)
- C. Vercel Cron / API route with streaming

**Decision:** Option A — Standalone Node.js worker on a dedicated PaaS. Railway is the preferred platform; Fly.io is an acceptable alternative. Final platform confirmation is a DevOps operational decision, not an architectural one — the architecture is "long-lived Node.js process with direct Postgres connection, deployed outside Vercel."

**Rationale:**
- No timeout wall — worker runs as a long-lived process, not a request handler
- Native `csv-parse` compatibility — Node.js runtime, no Deno shim needed
- Poll-based claim loop is operationally simple ("boring infrastructure")
- Both Railway and Fly.io provide encrypted env vars, health checks, and log streaming

**Operational baseline (minimum requirements for any platform):**
- Health endpoint + automatic restart policy (process crash → restart within 30s)
- TCP outbound to Supabase (direct Postgres connection); stable long-lived process runtime (not serverless)
- Max DB connections bounded (pool size ≤ 5); `statement_timeout` set per connection (e.g., 60s)
- Log sink with ≥ 7 days retention
- Secrets via platform encrypted env vars (never in code, logs, or build artifacts)

**Rejected:**
- **B (Edge Function):** Deno runtime is incompatible with the `csv-parse` lock. 60-150s timeout. Webhook reliability concerns.
- **C (Vercel):** 10-300s timeout wall. Memory constraints. Cold starts. Works for small files but not 10k rows reliably.

### D2: Worker security posture — `service_role` bypass with SQL safety invariants

**Options considered:**
- A. `service_role` bypass with explicit SQL safety invariants (INV-W1–W7)
- B. Fake session context injection (set `app.casino_id` before worker queries)
- C. Custom Postgres role with restricted permissions

**Decision:** Option A — `service_role` with invariants enforced at the application layer.

**Rationale:**
- Worker has no JWT and no user session — it is a system process, not a user action
- Context injection (Option B) would require the worker to impersonate a user, which is a governance anti-pattern (ADR-024 explicitly prohibits spoofable context)
- Custom Postgres role (Option C) adds migration complexity and operational burden disproportionate to the risk, since the worker's write surface is exactly 2 tables

**Invariants (enforcement contract):**

| ID | Invariant | Purpose |
|----|-----------|---------|
| INV-W1 | Every `UPDATE import_batch` includes `WHERE id = $batch_id` | Prevents touching other batches |
| INV-W2 | Every reaper `UPDATE` includes `AND status = 'parsing' AND heartbeat_at < $threshold AND attempt_count < $max_attempts`. If `attempt_count >= $max_attempts`, the reaper transitions to `failed` instead of resetting to `uploaded`. | Reaper cannot touch staged/failed/uploaded/completed batches; exhausted retries become terminal |
| INV-W3 | Every `INSERT INTO import_row` includes `batch_id` and `casino_id` from the claimed batch row | casino_id comes from batch row, never from CSV or external input |
| INV-W4 | Worker never issues queries on any table other than `import_batch` and `import_row` | Write guardrail; enforced by repo module + CI denylist grep |
| INV-W5 | Worker never accepts `casino_id` from any source other than the claimed `import_batch` row | Prevents cross-casino contamination |
| INV-W6 | Claim CTE uses `WHERE status = 'uploaded'` only. Resume after crash is implemented by the reaper resetting stale `parsing` batches back to `uploaded`; the worker never claims `parsing` directly. | Prevents re-processing completed work; crash recovery via reaper reset, not direct re-claim |
| INV-W7 | Worker may only set `import_batch.status` to `parsing`, `staging`, or `failed` | Worker must never set `executing`, `completed`, or `created` — those belong to the client or execute RPC |

**Enforcement mechanisms:**
- **Primary:** All DB access goes through a single repository module (`ImportBatchRepo`) that only exposes allowed operations on `import_batch` + `import_row`. No raw query construction outside the repo module. This is the real enforcement — the repo module is the security boundary.
- **Defense-in-depth:** CI denylist grep flags references to forbidden tables in `workers/csv-ingestion/**`. This catches obvious violations but is bypassable (string concatenation, dynamic table names) — it is a tripwire, not a gate.
- **Verification:** Integration test with 2-casino fixture verifies no cross-casino row writes at runtime.

### D3: `import_batch` status machine extension

**Options considered:**
- A. Extend existing `import_batch_status` enum with new values (`created`, `uploaded`, `parsing`)
- B. Reuse existing enum values only (overload `staging`)
- C. Separate `ingestion_status` column alongside existing `status`

**Decision:** Option A — Extend the existing enum with three new values.

**Resulting status machine:**

```
created → uploaded → parsing → staging → executing → completed
                        ↓                     ↓
                      failed                failed
```

| Status | Who sets it | Meaning |
|--------|-------------|---------|
| `created` | Client (batch creation) | Batch metadata exists, no file yet |
| `uploaded` | Client (after file upload) | Raw CSV in storage, ready for worker |
| `parsing` | Worker (claims batch) | Worker is streaming + normalizing |
| `staging` | Worker (all rows inserted) | **Canonical "ready-to-execute" state.** Ingestion complete, all chunk inserts committed, progress counters final. |
| `executing` | Execute RPC | Merge in progress |
| `completed` | Execute RPC | Merge finished |
| `failed` | Worker or Execute RPC | Terminal error (see below) |

**Key rule:** `staging` is the canonical "ready-to-execute" state. Idempotency requires `UNIQUE(import_row.import_batch_id, import_row.row_number)`; stage inserts use `ON CONFLICT DO NOTHING` against that constraint.

**`failed` is terminal.** The reaper recovers batches stuck in `parsing` (via heartbeat timeout + `attempt_count < max_attempts`); it resets them to `uploaded` for re-claim. If `attempt_count >= max_attempts`, the reaper transitions to `failed` instead. Once a batch reaches `failed` (max attempts exceeded, or unrecoverable error like `BATCH_ROW_LIMIT`), it stays `failed` permanently. The reaper does not retry `failed` batches. `failed` indicates ingestion is incomplete or unrecoverable; `rpc_import_execute` must refuse to process batches in `failed` status.

**Enum ordering:** Cosmetic only. Code must not rely on enum order. Values are appended (forward-only) to avoid migration friction across branches.

**Rejected:**
- **B (Reuse):** Overloading `staging` loses the ability to distinguish "file uploaded, waiting for worker" from "worker is actively processing" — critical for UI progress display and dead batch detection.
- **C (Separate column):** Adds schema complexity for no benefit — the status is still a single linear state machine with one failure branch.

### D4: Ingestion report retention — overwrite `report_summary` for MVP

**Options considered:**
- A. Overwrite `report_summary` (ingestion report replaced by execution report)
- B. Add dedicated `ingestion_report_summary` column
- C. External log / audit store

**Decision:** Option A — Overwrite for MVP.

**Rationale:**
- `report_summary` is already a JSONB column on `import_batch`; the worker writes its ingestion summary there
- When `rpc_import_execute` runs, it overwrites with the execution report
- The ingestion report is readable while `status = 'staging'` (between ingestion and execute) — that window is sufficient for MVP debugging

**Explicit tradeoff:** Ingestion lineage post-execute is not retained. If debugging imports after-the-fact requires the ingestion report, add an `ingestion_report_summary` column or snapshot the report elsewhere. This is a known gap accepted for MVP simplicity. UI should surface the ingestion report immediately on `staging` completion so operators can review before triggering execute.

**Rejected:**
- **B (Dedicated column):** Correct long-term, but premature — adds a column we may never need if the staging→execute window is sufficient for operational needs.
- **C (External log):** Over-engineered for MVP. Worker structured logs capture the same data; just not queryable from the database.

## Scope Boundaries

**This ADR covers:**
- Worker runtime selection and deployment model
- Worker security posture and invariant enforcement contract
- Batch status machine for the ingestion lifecycle
- Ingestion report retention strategy

**This ADR does NOT cover:**
- Changes to `import_row` schema (there are none)
- Changes to `rpc_import_execute` (unchanged)
- Loyalty field extraction or reconciliation (separate feature, blocked on this)
- Client-side preview changes (Papa Parse stays for preview per ADR-036)
- Storage bucket configuration, file retention, or virus scanning

## Consequences

### Positive

- Server is the authoritative ingestion pathway — browser is demoted to preview/advisory
- `ImportPlayerV1` contract (ADR-036 D2) remains the stable boundary — no backend changes
- Crash recovery is idempotent via `ON CONFLICT DO NOTHING` on `import_row(import_batch_id, row_number)`. **Required migration:** a `UNIQUE(import_batch_id, row_number)` constraint on `import_row` must exist. If absent in the current schema, it must be added in the same migration that extends `import_batch`. Without it, `ON CONFLICT DO NOTHING` is a no-op and idempotency is not enforced.
- Unblocks Loyalty & Tier Reconciliation pipeline
- Clean status machine gives UI precise progress display (5 ingestion states instead of 1)

### Negative / Tradeoffs

- New infrastructure (Railway worker) — adds deployment surface and monitoring burden
- `service_role` bypass shifts security enforcement from database (RLS) to application code (invariants) — requires discipline and CI enforcement
- Ingestion report lost after execute (accepted for MVP)
- Worker adds ~30s latency vs. client-side direct staging (file upload → poll → worker claim → stream → stage)

### Follow-up Work

- Storage file retention policy (deferred — SEC note T7)
- Admin-only batch purge RPC for PII data minimization (deferred — SEC note)
- `ingestion_report_summary` column if post-execute debugging is needed
- Deprecation of `useStagingUpload` client-side hook (Phase C of migration)
- **Phase A coordination:** The batch creation route change (`status='created'` default instead of `staging`) must be deployed simultaneously with or after the upload endpoint. If deployed before the UI is updated, the old client-side flow will create batches in `created` status that it cannot advance — breaking the existing import wizard. Coordinate API route + UI changes in Phase B, not Phase A.

## Links

- **Partially supersedes:** ADR-036 D1 (browser parsing demoted from authoritative to advisory)
- **Preserves:** ADR-036 D2 (`ImportPlayerV1` canonical contract unchanged)
- **Security:** SEC-NOTE-SERVER-CSV-INGESTION.md (threat model, controls, deferred risks)
- **Design:** RFC-SERVER-CSV-INGESTION.md (full design brief)
- **Scaffold:** SCAFFOLD-SERVER-CSV-INGESTION.md (v3.1, options analysis)
- **Feature Boundary:** `docs/20-architecture/specs/server-csv-ingestion/FEATURE_BOUNDARY.md`
- **Related ADRs:** ADR-015 (RLS pooling), ADR-018 (SECURITY DEFINER governance), ADR-024 (authoritative context), ADR-030 (auth hardening)
