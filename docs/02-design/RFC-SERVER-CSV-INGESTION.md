---
id: RFC-SCI
title: "Design Brief: Server-Authoritative CSV Ingestion Worker"
owner: architect
status: Draft
date: 2026-02-24
affects:
  - PlayerImportService
  - import_batch (schema extension)
  - Supabase Storage (new dependency)
  - Railway / Fly.io (new deployment target)
---

# Design Brief / RFC: Server-Authoritative CSV Ingestion Worker

> Purpose: propose direction and details for moving CSV parsing from client-side (Papa Parse) to a server-side streaming worker (csv-parse). The scaffold (v3.1) locked the runtime decision; this RFC details the design.

## 1) Context

- **Problem:** The current CSV player import (PRD-037) parses files client-side with Papa Parse and uploads normalized rows in 500-row chunks via `rpc_import_stage_rows`. This makes the browser the ingestion authority — meaning browser memory limits, flaky networks, and lack of durability/auditability are all production risks. Client-side parsing cannot be the source of truth for a staging-first claims pipeline.

- **Forces / constraints:**
  - Vercel is hostile to long-running processes (10-300s timeout depending on plan)
  - `csv-parse` (Node.js, streaming) is locked as the parser — non-negotiable
  - `import_row` schema must not change (existing RPCs, RLS, service layer depend on it)
  - `rpc_import_execute` must not change (execute pathway is stable and tested)
  - This feature unblocks the Loyalty & Tier Reconciliation pipeline (paused, waiting on server-staged data)

- **Prior art:**
  - PRD-037 / ADR-036: CSV Player Import MVP (client-side flow, shipped)
  - `services/player-import/`: Full service layer with schemas, mappers, DTOs
  - `rpc_import_stage_rows`: Existing staging RPC (500-row max per call, 10k batch cap)
  - `csv-structural-repair.ts`: Client-side bare-quote repair for Papa Parse

## 2) Scope & Goals

- **In scope:**
  - Background Node.js worker that claims batches, streams CSV from storage, parses, normalizes, stages
  - `import_batch` schema extensions for worker lifecycle (storage_path, heartbeat, claim, attempts)
  - `import_batch_status` enum extension (created, uploaded, parsing)
  - File upload flow (client → Supabase Storage → worker pulls)
  - Batch status polling endpoint for UI progress display
  - Header normalization rules (shared between client preview and worker)
  - Structured error reporting (batch-level report_summary, row-level reason_code/reason_detail)

- **Out of scope:**
  - Changes to `import_row` schema
  - Changes to `rpc_import_execute`
  - Loyalty field extraction or reconciliation
  - Non-CSV formats
  - Real-time WebSocket progress

- **Success criteria:**
  - 10k-row CSV reliably stages via worker (throughput acceptance test)
  - Worker output semantically equivalent to client-side staging for same input
  - Crash recovery produces identical results (idempotent retry)
  - Casino isolation enforced via SQL safety invariants

## 3) Proposed Direction (overview)

Deploy a standalone Node.js worker (Railway, tentatively) that polls `import_batch` for batches with `status = 'uploaded'`. The worker claims a batch via CTE + `FOR UPDATE SKIP LOCKED`, streams the raw CSV from Supabase Storage, parses with `csv-parse` in streaming mode, applies header normalization and column mapping, validates each row against the `ImportPlayerV1` schema, and bulk-inserts into `import_row` in 500-row chunks with `ON CONFLICT DO NOTHING`. Invalid rows are inserted with `status = 'error'` + `reason_code`/`reason_detail`. The worker updates batch progress (heartbeat, total_rows) and sets terminal status (`staging` or `failed`). The client workflow changes from "parse + chunk-upload" to "upload file to storage + poll batch status."

## 4) Detailed Design

### 4.1 Data model changes

#### import_batch_status enum extension

```sql
-- Add new values to existing enum (forward-only, no BEFORE)
ALTER TYPE import_batch_status ADD VALUE IF NOT EXISTS 'created';
ALTER TYPE import_batch_status ADD VALUE IF NOT EXISTS 'uploaded';
ALTER TYPE import_batch_status ADD VALUE IF NOT EXISTS 'parsing';
```

**Enum ordering note:** Enum ordering is cosmetic. Code must not rely on enum order. Values are appended (forward-only) to avoid migration friction across branches. The logical status machine is defined by application code, not by enum position.

**Note:** `staging` is the **canonical "ready-to-execute" state** for a batch. It indicates that all `import_row` staging writes are complete and the batch can be safely consumed by `rpc_import_execute`, regardless of whether staging was performed by client or worker. `staging` (terminal for ingestion) means: the worker has finished parsing, all chunk inserts are committed, and progress counters are final.

The status machine is:

```
created → uploaded → parsing → staging (= "staged, ready for execute")
                                  ↓
                                failed
```

#### import_batch column extensions

```sql
ALTER TABLE import_batch
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS claimed_by text,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text;
```

**No import_row changes.** Validation expressed through existing `status`, `reason_code`, `reason_detail`.

### 4.2 Service layer

#### Worker process structure (`workers/csv-ingestion/`)

```
workers/csv-ingestion/
├── index.ts            # Entry point: poll loop + graceful shutdown
├── claim.ts            # CTE claim query + reaper
├── ingest.ts           # Stream → parse → normalize → insert pipeline
├── normalize.ts        # Header normalization + column mapping
├── validate.ts         # ImportPlayerV1 validation (reuses schemas.ts)
├── storage.ts          # Supabase Storage stream client
├── db.ts               # Postgres client (service_role, pooled)
├── config.ts           # Env vars, poll interval, chunk size, thresholds
└── __tests__/
    ├── normalize.test.ts
    ├── validate.test.ts
    ├── claim.test.ts
    └── ingest.integration.test.ts
```

**Shared code strategy:** The worker imports validation schemas and normalization logic from the main app:
- `services/player-import/schemas.ts` → `importPlayerV1Schema` (Zod)
- `lib/csv/header-normalization.ts` → new shared module (extracted from both client and worker)

**Monorepo approach:** Worker lives in `/workers/csv-ingestion/` at the repo root. Uses TypeScript path aliases or npm workspace to import shared code. Deployed separately from the Vercel app.

#### 4.2.1 Storage streaming method (Node runtime)

The worker **must** stream the CSV from storage without buffering the full file in memory.

**Implementation contract (choose one and codify it):**
- **Preferred:** Generate a **signed URL** for the object, then stream via Node `fetch()`:
  - `const { data } = await supabase.storage.from('imports').createSignedUrl(path, expiresIn)`
  - `const res = await fetch(data.signedUrl)`
  - Use `res.body` as a readable stream into `csv-parse`
- **Alternative:** Use an object-store SDK that returns a Readable stream (S3/R2 compatible).

**Explicit non-goal (MVP):**
- Do not rely on `storage.download()` if it returns a buffered Blob/ArrayBuffer in your runtime.

> Note: If you decide to use `download()` anyway, document whether it buffers and cap file sizes accordingly.

#### Existing service layer changes

Minimal:
- `services/player-import/crud.ts`: Add `uploadFile()` method (uploads to Supabase Storage, updates batch with `storage_path` and `status = 'uploaded'`)
- `services/player-import/http.ts`: Add `uploadFile()` HTTP fetcher
- `lib/csv/header-normalization.ts`: Extract header normalization from both `use-papa-parse.ts` and worker's `normalize.ts` into shared module

### 4.3 API surface

#### New: File upload endpoint

A new upload endpoint is required:

```
POST /api/v1/player-import/batches/[id]/upload
Content-Type: multipart/form-data
Body: file (CSV)
```

- Validates `casino_id` and batch exists with `status = 'created'`
- Uploads file to Supabase Storage at `imports/{casino_id}/{batch_id}/{upload_id}.csv` (or `{checksum_prefix}.csv`)
- Stores `original_file_name` on `import_batch` for UI display
- Records `storage_path`, checksum, size on `import_batch`
- Transitions batch `created → uploaded`
- Returns updated batch

**Storage key hygiene:** The storage key uses a generated identifier (`upload_id` or checksum prefix), never the raw user-provided file name. This prevents collisions and path-traversal via weird characters. The original file name is stored separately for display only, sanitized and normalized — never trusted as a key.

#### Modified: Batch creation

`POST /api/v1/player-import/batches` now creates batch with `status = 'created'` (instead of `staging`). Column mapping can be set at creation or updated before upload.

#### Unchanged (no new polling endpoints)

No new **polling** endpoints are required: existing batch detail endpoints remain the source for progress/status.

- `GET /api/v1/player-import/batches` — list batches (already returns status, total_rows)
- `GET /api/v1/player-import/batches/[id]` — batch detail (already returns report_summary)
- `GET /api/v1/player-import/batches/[id]/rows` — list rows (already returns reason_code, reason_detail)
- `POST /api/v1/player-import/batches/[id]/execute` — execute (unchanged)

Client polls `GET /api/v1/player-import/batches/[id]` and checks `status` + `total_rows`. The existing endpoint returns everything the UI needs.

### 4.4 UI/UX flow

#### New flow (server-authoritative)

```
1. Admin selects CSV file
2. Client: Papa Parse reads sample (first 50 rows) for preview + header extraction
3. Admin maps columns (column_mapping)
4. Client: POST /batches (creates batch with column_mapping, status='created')
5. Client: POST /batches/[id]/upload (uploads raw file to Supabase Storage)
   → batch status becomes 'uploaded'
6. Worker (background): claims batch, streams, parses, normalizes, validates, inserts
   → batch status: 'uploaded' → 'parsing' → 'staging'
7. Client: polls GET /batches/[id] every 3-5 seconds
   → displays: status, total_rows, sample_errors from report_summary
8. When status = 'staging': admin clicks "Execute"
   → POST /batches/[id]/execute (unchanged flow)
9. Admin reviews execution report (created/linked/conflict/error counts)
```

#### Migration from old flow

- `useStagingUpload` hook (client-side chunked staging) is deprecated but not immediately removed
- `useImportWizard` step machine updated: `staging-upload` step replaced with `file-upload` step
- Preview step unchanged (Papa Parse stays for client-side preview)

### 4.5 Security considerations

#### RLS impact

- **Worker bypasses RLS** (uses `service_role`). This is deliberate — the worker has no JWT/session.
- **SQL safety invariants INV-W1 through INV-W6** are the enforcement mechanism (see scaffold v3.1).
- **No new RLS policies needed** — `import_batch` and `import_row` already have full RLS for client-facing routes.

#### RBAC requirements

- File upload endpoint (`POST /batches/[id]/upload`) requires `admin` or `pit_boss` role (same as batch creation).
- Worker itself has no role — it operates as a system process with `service_role`.

#### Audit trail

- `import_batch.created_by_staff_id` — who initiated the import (set at creation via ADR-024)
- `import_batch.claimed_by` — which worker processed it
- `import_batch.claimed_at`, `heartbeat_at` — processing timeline
- `import_batch.last_error_at`, `last_error_code` — failure history
- Per-row provenance: `import_row.reason_code`, `import_row.reason_detail` — validation audit
- **Worker does NOT write to `audit_log`** (user-initiated actions only)

#### Invariant enforcement (how we prevent drift)

To ensure the worker's service-role access does not cause cross-casino leakage:

- All worker writes go through a single repository module (e.g., `ImportBatchRepo`) whose methods require:
  - `batch_id` **and** `casino_id` (derived from the claimed batch row)
- Repository methods must include:
  - `WHERE id = $batch_id` on batch updates
  - Inserts to `import_row` always include `import_batch_id` and `casino_id` from the batch row
- Tests:
  - Integration test creates two casinos + two batches; asserts worker never writes rows under the wrong `casino_id`
  - "No naked update" test: grep/lint rule forbids `UPDATE import_batch` without `WHERE id =` (or equivalent structured query helper)

#### Supabase Storage security

- File upload goes through the API route (server-side), not directly from client to Storage
- Storage path is deterministic: `imports/{casino_id}/{batch_id}/{upload_id}.csv`
- Storage object keys are casino-scoped by path construction (`imports/{casino_id}/{batch_id}/...`); security relies on app invariants (INV-W5), not Storage RLS policies
- Worker code uses `service_role` but is implemented read-only for the `imports` bucket (`service_role` itself is not read-only — that is an app-level discipline)

### 4.6 Normalization contract (preview vs worker)

Client preview and worker ingestion must be semantically equivalent under this contract:
- **Header normalization:** trim, strip BOM, collapse whitespace; blank headers become `col_{n}`; duplicate headers suffixed `_2`, `_3`, ...
- **Field normalization:** trim surrounding whitespace; treat empty string as null for optional fields
- **Numeric parsing:** allow commas and currency symbols only if explicitly enabled in `column_mapping`; otherwise error
- **Dates:** parse as ISO-8601 if possible; reject ambiguous locale formats unless `column_mapping` declares format

> **Terminology:** `column_mapping` is the canonical name for the mapping payload stored on `import_batch`. Where earlier drafts or delta patches referenced `mapping_spec`, read it as `column_mapping`.
- **Output comparison:** uses canonical JSON serialization (stable key ordering) to avoid "byte-identical" brittleness

### 4.7 Client role: preview is advisory

Preview is advisory only. The worker is the **source of truth** for validation, normalization, and staging outcomes. The UI must display worker-derived errors/counters as authoritative.

## 5) Cross-Cutting Concerns

### 5.1 Row cap enforcement

Row cap enforcement occurs in the **worker** during parsing:
- On encountering row `BATCH_ROW_LIMIT + 1`, the worker stops consuming the stream and transitions the batch to `failed` with reason `BATCH_ROW_LIMIT`.
- Rows already staged remain in `import_row` but are inert because the batch is terminal `failed` and UI must disable execute.

### Performance implications

- **Streaming parse:** `csv-parse` processes rows one-at-a-time — memory usage is O(chunk_size), not O(file_size)
- **Chunk insert:** 500 rows per INSERT (existing chunk size from PRD-037). Tunable via config.
- **Connection pooling:** Worker uses a single Postgres connection (or small pool of 2-3). Not going through Supabase client pooler (direct connection string for `service_role`).
- **Storage streaming:** See §4.2.1 Storage streaming method below.
- **10k row cap:** Hard limit prevents runaway processing. See §5.1 Row cap enforcement below.

### Concurrency (multiple worker replicas)

The system is safe under **N worker replicas**:
- Batch claim uses `FOR UPDATE SKIP LOCKED`
- Stage inserts are idempotent via `ON CONFLICT DO NOTHING` on a unique constraint on `import_row(import_batch_id, row_number)`. If this constraint does not exist in the current schema, it must be added in the same migration that extends `import_batch`. Without it, `ON CONFLICT DO NOTHING` is a no-op and idempotency is not enforced.
- Reaper transitions are idempotent and constrained to retryable states

### Migration strategy

1. **Phase A: Deploy worker + upload endpoint** (worker polls but no batches are `uploaded` yet)
2. **Phase B: Update UI wizard** to use file upload instead of client-side staging
3. **Phase C: Deprecate `useStagingUpload`** (remove from UI, keep RPC for backwards compat)
4. **Phase D: (Optional) Remove `rpc_import_stage_rows`** if no other consumers

### Observability / monitoring

**MVP (table stakes):**
- Worker logs: structured JSON (batch_id, status transitions, row counts, errors, duration)
- Railway/Fly.io health check: HTTP endpoint or process liveness
- Dead batch detection: poll `import_batch WHERE status = 'parsing' AND heartbeat_at < now() - '10 min'` (admin dashboard or alert)

**Post-MVP:**
- Worker metrics: rows/sec, batches/hour, error rate
- Alerting: batch stuck in `parsing` > 10 min, worker process restart, Storage access failures

### Rollback plan

- **Worker rollback:** Stop the worker process. Batches stay in `uploaded` state. Admin can use the old client-side flow (if `useStagingUpload` is still available) or wait for worker redeployment.
- **Schema rollback:** New `import_batch` columns are nullable — old code ignores them. Enum values are additive (can't remove from Postgres enums, but unused values are harmless).
- **Storage rollback:** Files in Storage are inert. If worker is rolled back, files remain but are never processed. No cleanup needed (Storage has lifecycle policies if desired).

## 6) Alternatives Considered

### Alternative A: Client-side staging (status quo)

- **Description:** Keep Papa Parse as the authoritative parser. Client parses and uploads chunks via `rpc_import_stage_rows`.
- **Tradeoffs:** No new infrastructure. But browser memory limits, network flakiness, and client-as-authority trust boundary persist. Blocks loyalty reconciliation.
- **Why not chosen:** The whole reason for this feature. Client-side parsing is a preview tool, not ingestion.

### Alternative B: Vercel API route with streaming

- **Description:** Parse the CSV inside a Vercel API route handler, streaming directly from the request body.
- **Tradeoffs:** No extra deployment. But Vercel serverless timeouts (10-300s) make large files unreliable. Memory constraints. Cold starts.
- **Why not chosen:** Timeout wall is a hard constraint. Works for small files but not for 10k rows reliably.

### Alternative C: Supabase Edge Function

- **Description:** Trigger Edge Function via database webhook on `status = 'uploaded'`.
- **Tradeoffs:** Zero external infrastructure. But Deno runtime (can't run `csv-parse` natively), 60-150s timeout, webhook reliability.
- **Why not chosen:** Incompatible with `csv-parse` lock. Runtime mismatch is unnecessary risk.

## 7) Decisions Required

### ADR-worthy decisions:

1. **Decision:** Worker runtime and deployment model
   **Options:** Standalone Node.js (Railway) | Supabase Edge Function | Vercel Cron
   **Recommendation:** Standalone Node.js on Railway — no timeout, native csv-parse, boring and stable
   **Status:** Locked in scaffold v3.1

2. **Decision:** Worker security posture (RLS bypass vs. context injection)
   **Options:** service_role bypass with SQL safety invariants | Fake session context | Custom Postgres role
   **Recommendation:** service_role with INV-W1–W6 — worker has no JWT, context injection would be governance anti-pattern
   **Status:** Locked in scaffold v3.1

3. **Decision:** import_batch status machine extension
   **Options:** New enum values (created/uploaded/parsing) | Reuse existing enum | Separate status column
   **Recommendation:** Extend existing enum with new values. Worker terminal ingestion state is the existing `staging` value.
   **Status:** Design proposed in this RFC

4. **Decision:** Ingestion report retention post-execute
   **Options:** Overwrite report_summary | Add ingestion_report_summary column | External log
   **Recommendation:** Overwrite for MVP (explicit tradeoff documented in scaffold). Ingestion lineage post-execute is not retained. Add a dedicated column later if lineage is needed.
   **Status:** Locked in scaffold v3.1

## 8) Open Questions

- **Railway vs Fly.io:** Tentative recommendation is Railway. Needs DevOps confirmation based on existing stack preferences and network topology to Supabase.
- **Shared code packaging:** Monorepo workspace (`/workers/csv-ingestion/` importing from `/services/`) vs. separate npm package for shared schemas/normalizers. Monorepo is simpler but adds build complexity.
- **Client flow deprecation timeline:** Immediate UI switch to file upload, or feature flag for gradual rollout?
- **Supabase Storage bucket configuration:** Dedicated `imports` bucket? File retention policy? Max upload size?

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-SERVER-CSV-INGESTION.md` (v3.1)
- Feature Boundary: `docs/20-architecture/specs/server-csv-ingestion/FEATURE_BOUNDARY.md`
- Source Proposal: `docs/00-vision/csv-import/CSV-IMPORT-INGESTION.md`
- Existing PRD-037: `docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md`
- Existing ADR-036: `docs/80-adrs/ADR-036-csv-player-import-strategy.md`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (PlayerImportService)
- ADR: `docs/80-adrs/ADR-037-server-csv-ingestion-worker.md`
- PRD: (Phase 5)

## References

- [csv-parse documentation](https://csv.js.org/parse/) — Node.js streaming CSV parser
- [Railway deployment](https://docs.railway.app/) — tentative worker host
- [Supabase Storage](https://supabase.com/docs/guides/storage) — file upload/download
- ADR-024: Authoritative context derivation
- ADR-030: Auth pipeline hardening
- ADR-036: CSV Player Import Strategy
