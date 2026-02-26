---
id: SCAFFOLD-SCI
title: "Feature Scaffold: Server-Authoritative CSV Ingestion"
owner: product / architect
status: "Draft — patched v3.1 (scaffold hardening micro-patch)"
date: 2026-02-24
patched: 2026-02-24
patch_history:
  - v2: 8-point review (guardrails, error model, security posture, heartbeat)
  - v3: 6 mandatory fixes (schema contradiction, SQL pattern, 10k cap, header norms, semantic equiv, SQL safety)
  - v3.1: scaffold hardening (report_summary tradeoff, insert-only invariant, orphan UX, reaper concurrency)
---

# Feature Scaffold: Server-Authoritative CSV Ingestion

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** Server-Authoritative CSV Ingestion
**Owner / driver:** product / architect
**Stakeholders (reviewers):** ops, DevOps, security
**Status:** Draft — patched v3.1
**Last updated:** 2026-02-24

---

## Terminology: Staging Table Clarification

> **`import_row` IS the staging table.** It holds claims, not truth.

The existing `import_row` table (PRD-037) already functions as a staging table:
- Rows are inserted with `status: 'staged'`
- They only become truth after `rpc_import_execute` processes them (→ `created`/`linked`/`conflict`/`error`)
- The proposal doc's `import_player_stage` was aspirational naming for the same concept

**Decision:** We keep the name `import_row` (already in schema, SRM, RLS, RPCs, service layer). The scaffold refers to it explicitly as "the staging table" throughout. No rename. No ambiguity.

---

## Schema Change Policy (v3 — resolves contradiction)

> **`import_row`: ZERO schema changes. `import_batch`: minimal extensions for worker lifecycle.**

### import_row — NO changes

The existing schema has everything the worker needs:

| Column | Existing Type | Worker Usage |
|--------|--------------|-------------|
| `status` | `import_row_status` enum (`staged`, `created`, `linked`, `skipped`, `conflict`, `error`) | Worker inserts valid rows as `staged`, invalid rows as `error` |
| `reason_code` | text, NULLABLE | Primary validation error code (e.g., `MISSING_REQUIRED_FIELD`) |
| `reason_detail` | text, NULLABLE | Human-readable error description (e.g., `first_name is required; email invalid`) |
| `raw_row` | jsonb | Original CSV row as key-value pairs |
| `normalized_payload` | jsonb | `ImportPlayerV1` canonical contract (null for unparseable rows) |
| `row_number` | integer, UNIQUE with batch_id | Sequential, 1-indexed |

**How validation is expressed without new columns:**
- Valid rows: `status = 'staged'`, `reason_code = null`, `reason_detail = null`
- Invalid rows: `status = 'error'`, `reason_code = 'MISSING_REQUIRED_FIELD'`, `reason_detail = 'first_name is required'`
- Rows with multiple validation failures: `reason_code` = primary error, `reason_detail` = semicolon-delimited summary of all errors

**Execute compatibility (no RPC changes):** `rpc_import_execute` processes `WHERE status = 'staged'`. Rows inserted as `error` by the worker are naturally skipped. Zero RPC modification required.

### import_batch — extensions for worker lifecycle

| Column | Type | New? | Purpose |
|--------|------|------|---------|
| `storage_path` | text, NULLABLE | **NEW** | Path to raw CSV in Supabase Storage |
| `claimed_by` | text, NULLABLE | **NEW** | Worker identity (hostname:pid or deployment ID) |
| `claimed_at` | timestamptz, NULLABLE | **NEW** | When worker claimed the batch |
| `heartbeat_at` | timestamptz, NULLABLE | **NEW** | Last worker heartbeat |
| `attempt_count` | integer, NOT NULL, default 0 | **NEW** | Number of processing attempts |
| `last_error_at` | timestamptz, NULLABLE | **NEW** | Timestamp of most recent failure |
| `last_error_code` | text, NULLABLE | **NEW** | Top-level error code from most recent failure |
| `status` | `import_batch_status` enum | **EXTENDED** | Add values: `created`, `uploaded`, `parsing` (existing: `staging`, `executing`, `completed`, `failed`) |
| `report_summary` | jsonb, NULLABLE | existing | Worker populates with ingestion report; execute overwrites with execution report |
| `total_rows` | integer | existing | Worker updates as chunks are inserted |

**Note:** `report_summary` is reused (not a new column). The worker writes its ingestion summary there. When `rpc_import_execute` runs, it overwrites with the execution report.

**Explicit tradeoff:** We knowingly do not retain the ingestion report post-execute. If we later need ingestion lineage for debugging imports after-the-fact, we will add an `ingestion_report_summary` column or snapshot the report elsewhere. For MVP, the ingestion report is readable while `status = 'staged'` (between ingestion and execute) and that window is sufficient.

---

## 1) Intent (what outcome changes?)

- **User story:** As an Admin/Pit Boss, I upload a CSV file and the server handles parsing, normalization, and staging durably — instead of my browser doing the parsing and chunked uploads over a flaky connection.

- **Success looks like:** Admin uploads file, monitors progress via polling, and when batch status hits `staged`, triggers execute. Retry on failure is automatic and idempotent. Client-side Papa Parse remains for preview/mapping only.

## 2) Constraints (hard walls)

- **Vercel hostile to long processes:** Route handlers timeout (10s free / 60s Pro / 300s Enterprise). Full ingestion MUST NOT run inside a Vercel request/response cycle.
- **Parser locked: `csv-parse` (Node.js streaming).** Non-negotiable. Battle-tested, handles real-world CSV quirks (bare quotes, mixed newlines, BOM), streaming-first. Any runtime that cannot run `csv-parse` natively is incompatible.
- **Security / tenancy:** Worker must respect casino-scoped isolation. Batch ownership is determined at creation time via `rpc_import_create_batch` (ADR-024). Worker inherits this context.
- **Existing contract stability:** `ImportPlayerV1` canonical contract unchanged. `import_row` schema unchanged. `rpc_import_execute` unchanged. The worker changes *how* rows get into the staging table, not *what* gets staged.
- **10k row cap:** Server-enforced maximum per batch (existing constraint from PRD-037). See deterministic behavior in §10k Row Cap.

## 3) Non-goals (what we refuse to do in this iteration)

- Generic ETL/data platform (NiFi, Airbyte, Kafka)
- Non-CSV formats (Excel, JSON, XML)
- File virus scanning (Supabase Storage handles basic validation)
- Replacing Papa Parse in the client (it stays for preview + header mapping)
- Modifying the execute flow (`rpc_import_execute` untouched)
- Loyalty field extraction or reconciliation queue generation (separate feature)
- Real-time WebSocket progress (polling is fine for MVP)
- Any schema changes to `import_row` (see Schema Change Policy)

---

## GUARDRAIL: Worker Write Scope (Non-Negotiable)

> **The worker may write ONLY to staging + batch metadata. Nothing else. Ever.**

| Table | Worker Permission | Rationale |
|-------|------------------|-----------|
| `import_batch` | READ + UPDATE (status, totals, report_summary, heartbeat, claimed_by) | Batch lifecycle only |
| `import_row` | INSERT (staging rows) | Staging table — claims, not truth |
| `player` | **FORBIDDEN** | Truth table — execute RPC only |
| `player_casino` | **FORBIDDEN** | Truth table — execute RPC only |
| `player_loyalty` | **FORBIDDEN** | Different bounded context entirely |
| `loyalty_ledger` | **FORBIDDEN** | Different bounded context entirely |
| `audit_log` | **FORBIDDEN** | Written by RPCs with actor context |

**Enforcement:** Worker uses `service_role` (see Security Posture) but every SQL statement is constrained to the two staging tables. Any PR that adds a worker write to a non-staging table fails review.

**Insert-only invariant:** Worker inserts `import_row` records once; it does not later UPDATE or DELETE them. No "cleanup pass," no "re-validation sweep," no post-insert mutations. Execute semantics own the row lifecycle after staging. (If a future repair tool needs row mutation, that's a separate feature with its own invariant review.)

---

## Security Posture Decision

> **Worker uses `service_role` (bypasses RLS) with explicit SQL safety invariants.**

**Why not RLS-context?**
- The worker is a background process with no JWT / user session
- `set_rls_context_from_staff()` requires a JWT `staff_id` claim — the worker has none
- Faking a session context for a background worker is a governance anti-pattern

### SQL Safety Invariants (Non-Negotiable)

Since `service_role` forgives mistakes, every query must be explicitly scoped:

| Rule | Invariant | Rationale |
|------|-----------|-----------|
| **INV-W1** | Every `UPDATE import_batch` includes `WHERE id = $batch_id` | Prevents touching other batches |
| **INV-W2** | Every `UPDATE import_batch` by reaper includes `AND status = 'parsing' AND heartbeat_at < $threshold` | Reaper cannot touch staged/failed/uploaded/completed batches |
| **INV-W3** | Every `INSERT INTO import_row` includes `batch_id = $batch_id AND casino_id = $batch_casino_id` | casino_id comes from batch row, never from CSV or external input |
| **INV-W4** | Worker never issues `SELECT` / `UPDATE` / `INSERT` / `DELETE` on any table other than `import_batch` and `import_row` | Write guardrail, enforced by code review |
| **INV-W5** | Worker never accepts `casino_id` from any source other than the claimed `import_batch` row | Prevents cross-casino contamination |
| **INV-W6** | Claim CTE uses `WHERE status = 'uploaded'` only — never claims `staged`, `failed`, `parsing`, `executing`, `completed` | Prevents re-processing completed work |

**Audit contract:**
- Worker identifies itself via `claimed_by` (hostname:pid or deployment ID)
- All batch status transitions include `claimed_by` + `claimed_at` for traceability
- Failure events include `last_error_at` + `last_error_code`
- Worker does NOT write to `audit_log` (that's for user-initiated actions via RPCs)

---

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:**
  - Raw CSV file (uploaded to Supabase Storage by client)
  - `column_mapping` (jsonb on `import_batch`, set by client after preview)
  - Batch metadata (`casino_id`, `created_by_staff_id`, `file_name`, `vendor_label`)

- **Outputs:**
  - `import_row` records in staging table:
    - Valid rows: `status = 'staged'`, `normalized_payload` populated, `reason_code = null`
    - Invalid rows: `status = 'error'`, `reason_code` + `reason_detail` populated
  - `import_batch` status progression: `created → uploaded → parsing → staged/failed`
  - `import_batch.total_rows` (updated as chunks are inserted)
  - `import_batch.report_summary` (structured jsonb — see Error Model below)

- **Canonical contract(s):** `ImportPlayerV1` (unchanged), `ColumnMapping` (unchanged)

---

## Header Normalization Rules

> **Client preview and worker must produce identical header keys. These rules are canonical.**

| Rule | Behavior | Example |
|------|----------|---------|
| **Trim** | Leading/trailing whitespace stripped | `" First Name "` → `"First Name"` |
| **Preserve case** | Original case preserved in `raw_row` keys | `"First Name"` stays `"First Name"` |
| **Blank headers** | Replaced with `_col_{N}` (1-indexed column position) | Column 3 with no header → `"_col_3"` |
| **Duplicate headers** | Suffixed with `_{N}` (occurrence count, 0-indexed) | `"Name"`, `"Name"` → `"Name"`, `"Name_1"` |
| **BOM** | UTF-8 BOM (`\uFEFF`) stripped from first header | `"\uFEFFid"` → `"id"` |
| **Newlines in headers** | Replaced with single space | `"First\nName"` → `"First Name"` |

**Column mapping** (`column_mapping` jsonb on `import_batch`) maps from normalized header keys to `ImportPlayerV1` field names. Both client preview and worker apply these rules identically before consulting the mapping.

**Shared implementation:** Header normalization logic lives in a shared module importable by both client (for preview) and worker. See Open Questions > Shared code strategy.

---

## Batch Lifecycle + Retry Contract

### Status Machine

```
created → uploaded → parsing → staged
                        ↓
                      failed
                        ↑
              (reaper resets stale → uploaded, up to max_attempts)
```

### Claim Protocol (v3 — corrected SQL)

```sql
-- Worker claims a batch (atomic, known-good Postgres pattern)
WITH claimable AS (
  SELECT id
  FROM import_batch
  WHERE status = 'uploaded'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE import_batch
SET status = 'parsing',
    claimed_by = $worker_id,
    claimed_at = now(),
    heartbeat_at = now(),
    attempt_count = import_batch.attempt_count + 1
FROM claimable
WHERE import_batch.id = claimable.id
RETURNING import_batch.*;
```

**Why CTE, not scalar subquery:** `FOR UPDATE SKIP LOCKED` inside a scalar subquery (`WHERE id = (SELECT ...)`) has unreliable locking semantics in Postgres. The `WITH ... UPDATE ... FROM` pattern is the canonical safe approach — the CTE locks the row, and the UPDATE joins against the locked result.

### Heartbeat Contract

- Worker updates `heartbeat_at` after each chunk insert (~every 500 rows or 30 seconds, whichever comes first)
- Heartbeat is a single UPDATE on the already-claimed batch row — lightweight

### Stuck Batch Reaper

**Authority:** Worker-driven. Each poll cycle starts with a reaper check before attempting a claim. No separate `pg_cron` job needed (simpler ops, fewer moving parts).

**Concurrent reaper safety:** Multiple workers will run the reaper query simultaneously. This is harmless — the UPDATE is idempotent (resetting `uploaded` to `uploaded` is a no-op, and `failed` is a terminal state). No row-level lock needed on reaper queries because the worst case is two workers both reset the same batch to `uploaded`, and the next claim cycle resolves the winner via `FOR UPDATE SKIP LOCKED`.

```sql
-- Reaper: reset stale batches (retryable)
UPDATE import_batch
SET status = 'uploaded',
    claimed_by = NULL,
    claimed_at = NULL,
    heartbeat_at = NULL
WHERE status = 'parsing'                            -- INV-W2: only touch parsing
  AND heartbeat_at < now() - interval '5 minutes'   -- stale heartbeat
  AND attempt_count < 3;                             -- retries remaining

-- Reaper: fail exhausted batches
UPDATE import_batch
SET status = 'failed',
    last_error_at = now(),
    last_error_code = 'MAX_ATTEMPTS_EXHAUSTED',
    report_summary = jsonb_build_object(
      'phase', 'reaper',
      'message', 'Batch failed after 3 processing attempts',
      'last_claimed_by', claimed_by
    )
WHERE status = 'parsing'                            -- INV-W2: only touch parsing
  AND heartbeat_at < now() - interval '5 minutes'
  AND attempt_count >= 3;
```

---

## 10k Row Cap: Deterministic Failure Mode

> **Hard fail. Stage nothing past cap. Batch → `failed`.**

| Behavior | Detail |
|----------|--------|
| Worker counts rows during streaming parse | Counter incremented per parsed record |
| At row 10,001 | Worker **stops reading the stream immediately** |
| Already-inserted rows (1–10,000) | **Kept** in `import_row` (they're idempotent, harmless) |
| Batch status | Set to `failed` |
| `report_summary` | `{ phase: "parsing", error: "BATCH_ROW_LIMIT", total_rows_parsed: 10001, message: "CSV exceeds 10,000 row limit. Staged 10,000 rows before stopping." }` |
| `last_error_code` | `BATCH_ROW_LIMIT` |
| UI display | "Batch failed: CSV exceeds the 10,000 row limit. 10,000 rows were staged but **will not be executed**. Split the file and create separate batches." |
| Admin action | Create new batches with split files. Already-staged rows from this batch are inert (batch is `failed`, execute will never run on a failed batch). |

**Why hard-fail, not partial-stage?** A `staged_with_warnings` state creates ambiguity: did the admin intend to import only 10k? Are the most important rows in the first 10k or the last? Hard fail forces explicit action (split the file) and avoids silent data loss.

---

## Idempotency Invariants

### Staging Row Uniqueness

**Unique key:** `(batch_id, row_number)` — already exists in current schema as a UNIQUE constraint.

- Worker assigns `row_number` sequentially during parse (1-indexed, matches CSV line number minus header)
- `INSERT INTO import_row ... ON CONFLICT (batch_id, row_number) DO NOTHING`
- If worker crashes at row 5,000 and restarts, rows 1–5,000 are skipped (already inserted), rows 5,001+ are inserted fresh
- Result is identical regardless of crash point

### Batch-Level Idempotency

- `(casino_id, idempotency_key)` UNIQUE already exists on `import_batch`
- **Duplicate file detection is intentionally NOT enforced.** Admin may re-upload the same file with a new idempotency key (e.g., after correcting mappings). The idempotency_key prevents accidental double-creation of the same intended batch, not duplicate file content.

### Resume Rules

| Scenario | Behavior |
|----------|----------|
| Worker crashes mid-parse, restarts | Reaper resets batch to `uploaded`. Worker re-claims. `ON CONFLICT DO NOTHING` skips already-inserted rows. |
| Worker completes, batch is `staged` | Re-processing a `staged` batch is a no-op (worker only claims `uploaded` batches — INV-W6). |
| Worker fails, batch is `failed` | Admin reviews report_summary. May create a new batch with corrections. |
| Two workers race for same batch | `FOR UPDATE SKIP LOCKED` in CTE ensures only one claims it. Loser gets next available. |

---

## Canonical Staged Row Shape (using existing import_row columns)

| Column | Valid Row | Invalid Row | Parse-Error Row |
|--------|-----------|-------------|-----------------|
| `status` | `staged` | `error` | `error` |
| `raw_row` | `{"First Name": "John", "Email": "j@x.com"}` | `{"First Name": "", "Email": "not-email"}` | `null` (unparseable) |
| `normalized_payload` | `{"first_name": "John", "email": "j@x.com"}` | `null` (failed validation) | `null` |
| `reason_code` | `null` | `MISSING_REQUIRED_FIELD` (primary error) | `CSV_PARSE_ERROR` |
| `reason_detail` | `null` | `first_name is required; email format invalid` | `Unterminated quote at column 5` |
| `row_number` | sequential | sequential | sequential |
| `matched_player_id` | `null` (until execute) | `null` (never executed) | `null` |

**Multiple validation errors:** `reason_code` holds the primary (first) error code. `reason_detail` holds a semicolon-delimited summary of all errors for that row. This is sufficient for UI display and filtering.

---

## Error Model

### Batch-Level: `report_summary` (jsonb, populated by worker)

```json
{
  "phase": "ingestion",
  "total_rows_parsed": 8500,
  "total_rows_staged": 8200,
  "total_rows_invalid": 280,
  "total_rows_parse_error": 20,
  "counts_by_code": {
    "MISSING_REQUIRED_FIELD": 150,
    "INVALID_EMAIL_FORMAT": 80,
    "INVALID_PHONE_FORMAT": 50,
    "CSV_PARSE_ERROR": 20
  },
  "sample_errors": [
    { "row_number": 42, "code": "MISSING_REQUIRED_FIELD", "detail": "first_name is required" },
    { "row_number": 107, "code": "INVALID_EMAIL_FORMAT", "detail": "email format invalid: 'not-an-email'" },
    { "row_number": 1203, "code": "CSV_PARSE_ERROR", "detail": "Unterminated quote at column 5" }
  ],
  "sample_limit": 25,
  "worker_id": "ingest-worker-01:12345",
  "duration_ms": 8420
}
```

**Lifecycle:** Worker writes this on both `staged` (success summary) and `failed` (error summary). When `rpc_import_execute` runs, it overwrites `report_summary` with the execution report. Ingestion report is only relevant while `status` is between `staged` and `executing`.

### Error Codes (canonical, extensible)

| Code | Phase | Meaning |
|------|-------|---------|
| `CSV_PARSE_ERROR` | parsing | csv-parse could not read the row |
| `MISSING_REQUIRED_FIELD` | validation | Required field (first_name, last_name, or one of email/phone) missing |
| `INVALID_EMAIL_FORMAT` | validation | Email fails format check |
| `INVALID_PHONE_FORMAT` | validation | Phone fails format check |
| `UNMAPPED_COLUMN` | validation | Column in CSV has no mapping entry (warning, not fatal to row) |
| `ROW_TOO_LONG` | validation | Row exceeds max field count or field length |
| `BATCH_ROW_LIMIT` | parsing | CSV exceeds 10k row cap (batch-level, not row-level) |
| `MAX_ATTEMPTS_EXHAUSTED` | reaper | Batch failed after 3 processing attempts |

---

## 5) Runtime Decision: Standalone Node.js Worker

> **Parser lock (`csv-parse`, Node.js streaming) eliminates non-Node runtimes.**

### Option A: Standalone Node.js Worker (poll-based) — ONLY COMPATIBLE OPTION

A minimal Node.js process that runs outside Vercel. Polls `import_batch` for `status = 'uploaded'`, claims with CTE + `FOR UPDATE SKIP LOCKED`, streams CSV from Supabase Storage, parses with `csv-parse`, normalizes, bulk-inserts into `import_row` (staging table), updates batch status.

**Tentative deployment target: Railway** (simple, cheap, supports long-lived Node processes, auto-restart, log streaming, env vars). Fly.io is the alternative. Decision finalized in Phase 2.

```
Poll loop (every 5s):
  1. Reaper check (reset stale 'parsing' batches)
  2. Claim (CTE + FOR UPDATE SKIP LOCKED)
  3. IF claimed:
       stream file from Supabase Storage (batch.storage_path)
       parse with csv-parse (streaming, row by row)
       apply header normalization rules
       apply column_mapping → ImportPlayerV1
       validate each row (Zod schema)
       valid → status='staged', invalid → status='error' + reason_code/detail
       INSERT into import_row in 500-row chunks (ON CONFLICT DO NOTHING)
       heartbeat after each chunk
       check row count → hard-fail at 10,001
       UPDATE import_batch: status='staged', total_rows=N, report_summary={...}
     ON ERROR:
       UPDATE import_batch: status='failed', last_error_at, last_error_code, report_summary
```

- **Pros:**
  - Full Node.js runtime: `csv-parse` native, streaming, no timeout limits
  - Boring and stable: poll loop is the simplest concurrency model
  - CTE claim pattern is known-correct Postgres
  - Crash-safe: heartbeat + worker-driven reaper provides deterministic recovery
  - Shares normalization logic from existing `services/player-import/schemas.ts`
  - Scales by adding workers (each `SKIP LOCKED` claims a different batch)
- **Cons / risks:**
  - Extra deployment target: one more thing to monitor, deploy, keep alive
  - Database connection: needs connection string or `service_role` key
  - Worker needs Supabase Storage access (service_role or signed URLs)
- **Cost / complexity:** Medium — ~300-400 LOC for core loop + error handling. Deployment infra is the real cost.
- **Security posture:** `service_role` bypass with SQL safety invariants INV-W1 through INV-W6.
- **Exit ramp:** Worker is decoupled. Database contract is the interface — worker can be replaced without changing any other component.

### Rejected Alternatives (incompatible with csv-parse lock)

| Option | Why Rejected |
|--------|-------------|
| **Supabase Edge Function** | Deno runtime — `csv-parse` is Node.js only. Porting to Deno/WASM is untested risk. 60-150s timeout wall. Incompatible with parser lock. |
| **Vercel Cron + Serverless** | Timeout wall (10-300s). Unreliable for 10k rows. Cold starts eat budget. Cron granularity (1 min) adds latency. Could use `csv-parse` but timeouts make it fragile. |

These are documented for posterity. They are not candidates.

---

## 6) Decision to make (explicit)

- **Decision:** Where does the standalone Node.js worker run?
- **Tentative recommendation:** Railway (simple, cheap, auto-restart, log streaming)
- **Alternative:** Fly.io (more control, global regions if needed later)
- **Decision drivers:**
  - Must support long-lived Node.js process (not serverless)
  - Must reach Supabase DB + Storage (network access)
  - Must be monitorable (health checks, logs, restart policy)
  - Cost should be proportional (small worker, not a full cluster)
- **Decision deadline:** Before Phase 2 (Design Brief)

## 7) Open questions / unknowns

- **Deployment target confirmation:** Railway vs Fly.io. Needs DevOps input on what's already in the stack.
- **Worker authentication:** `service_role` key via env var for both Storage and DB? Or separate credentials?
- **File size limits:** Supabase Storage default upload limit (50MB on free, configurable on Pro). Sufficient for 10k-row CSVs?
- **Existing client flow migration:** Deprecate `useStagingUpload` immediately, or keep both paths for a transition period?
- **Shared code strategy:** Can the worker import from `services/player-import/schemas.ts` directly (monorepo workspace), or does it need a separate package? Header normalization logic must be shared.
- **Monitoring table stakes:** Worker health endpoint? Dead batch alerts via batch status polling? What's MVP vs. post-MVP observability?

## 8) Acceptance Tests

| Test | Pass Criteria |
|------|--------------|
| **Throughput** | 10k-row CSV reliably stages under typical conditions. Measured in rows/sec across 3 runs; p95 < 2x median. |
| **Semantic equivalence** | Worker output is semantically equivalent to client-side staging output for the same CSV + mapping. Comparison via canonical field ordering (sorted keys, trimmed values) — not byte-identical JSONB. |
| **Crash recovery** | Worker killed mid-parse → reaper resets → re-claim → final staged row count matches clean run. |
| **Idempotent retry** | `attempt_count` incremented, no duplicate rows (`ON CONFLICT DO NOTHING`), batch reaches `staged`. |
| **Max attempts exhausted** | After 3 failures → batch status `failed`, `last_error_code = 'MAX_ATTEMPTS_EXHAUSTED'`, report_summary populated. |
| **Validation surfacing** | Invalid rows inserted with `status = 'error'` + `reason_code` + `reason_detail`. report_summary `counts_by_code` matches row-level counts. |
| **10k cap enforcement** | 10,001-row CSV → batch `failed`, `last_error_code = 'BATCH_ROW_LIMIT'`, first 10k rows staged, stream stopped. |
| **Casino isolation** | Worker processing batch for casino A: every `import_row` insert has `casino_id` matching batch. No reads/writes for casino B. SQL safety invariant INV-W3/W5 verified. |
| **Concurrent workers** | Two workers running simultaneously claim different batches. No deadlocks, no double-processing. CTE + SKIP LOCKED verified. |
| **Header normalization parity** | Client preview headers and worker headers produce identical keys for: blank headers, duplicate headers, BOM, trimming, newlines. |

## 9) Definition of Done (from Feature Boundary)

- [ ] `import_batch` statuses: `created → uploaded → parsing → staged/failed`
- [ ] Batch metadata: `storage_path`, `claimed_by`, `claimed_at`, `heartbeat_at`, `attempt_count`, `last_error_at`, `last_error_code`
- [ ] `import_row` schema: ZERO changes (validation via existing status/reason_code/reason_detail)
- [ ] Worker claims batches (CTE + FOR UPDATE SKIP LOCKED + heartbeat)
- [ ] Worker-driven reaper: stale parsing → reset or fail after max attempts
- [ ] Streams CSV from Supabase Storage
- [ ] Parses with `csv-parse` (streaming, not buffered)
- [ ] Header normalization: trim, blank→_col_N, duplicate→_N suffix, BOM strip
- [ ] Normalizes/validates → `ImportPlayerV1`; valid→staged, invalid→error+reason
- [ ] Inserts into `import_row` (staging table) in chunks, ON CONFLICT DO NOTHING
- [ ] 10k row cap: hard fail at 10,001, keep staged rows, batch→failed
- [ ] Updates `import_batch` progress + structured `report_summary`
- [ ] SQL safety invariants INV-W1 through INV-W6 enforced
- [ ] UI can display: batch status + row totals + sample errors (poll-based)
- [ ] Acceptance tests pass (all 10 listed above)
- [ ] Decision recorded in ADR(s) (Phase 4)
- [ ] Acceptance criteria agreed (Phase 5 PRD)

## Scaffold Invariants (must not drift)

| Invariant | Rationale |
|-----------|-----------|
| Worker inserts `import_row` once; no post-insert mutations | Execute owns row lifecycle after staging |
| Ingestion report not retained post-execute (explicit MVP tradeoff) | `report_summary` overwritten by execute; add `ingestion_report_summary` if lineage needed later |
| Reaper safe under N concurrent workers (idempotent updates) | Multiple workers running reaper simultaneously is harmless |
| `import_row` schema: zero changes | Validation via existing status/reason_code/reason_detail |
| Worker writes only `import_batch` + `import_row` (INV-W4) | Truth tables are execute-RPC-only |
| Casino scoping via batch row, never external input (INV-W5) | service_role bypasses RLS; SQL predicates are the safety net |

---

## Links

- Source proposal: `docs/00-vision/csv-import/CSV-IMPORT-INGESTION.md`
- Feature Boundary: `docs/20-architecture/specs/server-csv-ingestion/FEATURE_BOUNDARY.md`
- Existing PRD-037: `docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md`
- Existing ADR-036: `docs/80-adrs/ADR-036-csv-player-import-strategy.md`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (PlayerImportService)
- Blocked feature: `docs/01-scaffolds/SCAFFOLD-LOYALTY-TIER-RECONCILIATION.md`
- Design Brief/RFC: (Phase 2)
- ADR(s): (Phase 4)
- PRD: (Phase 5)
