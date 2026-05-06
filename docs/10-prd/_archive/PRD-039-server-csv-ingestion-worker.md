---
id: PRD-039
title: "Server-Authoritative CSV Ingestion Worker"
owner: Engineering
status: Draft
affects: [ADR-036, ADR-037, SEC-NOTE-SERVER-CSV-INGESTION, RFC-SCI]
created: 2026-02-24
last_review: 2026-02-24
phase: "Phase 3 (Onboarding & Intake)"
pattern: A
http_boundary: true
bounded_contexts:
  - PlayerImportService (existing — schema extension + new worker)
depends_on:
  - ADR-036 (CSV Player Import Strategy — Lane 2 amendment)
  - ADR-037 (Server-Authoritative CSV Ingestion Worker — accepted)
  - PRD-037 (CSV Player Import Lane 1 MVP — shipped)
  - ADR-024 (Authoritative context derivation)
  - ADR-030 (Auth pipeline hardening)
tags: [csv-import, server-ingestion, worker, lane-2]
---

# PRD-039 — Server-Authoritative CSV Ingestion Worker

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** The CSV Player Import pipeline (PRD-037) currently parses files client-side with Papa Parse and uploads normalized rows in chunks. This makes the browser the ingestion authority — subject to memory limits, network flakiness, and client-as-authority trust boundary violations. PRD-039 delivers a standalone Node.js background worker that claims uploaded CSV files from Supabase Storage, streams them through `csv-parse`, normalizes rows to the existing `ImportPlayerV1` contract, and bulk-inserts into `import_row`. The worker replaces client-side parsing as the authoritative ingestion pathway while preserving Papa Parse for advisory preview. This is the Lane 2 evolution documented in ADR-036/ADR-037, and unblocks the Loyalty & Tier Reconciliation pipeline.

---

## 2. Problem & Goals

### 2.1 Problem

The shipped Lane 1 CSV import (PRD-037) parses files in the browser and uploads rows in 500-row chunks. This works for small files on reliable networks but has three structural problems:

1. **Client-as-authority:** The browser is the source of truth for ingestion. Browser crashes, tab closures, or network drops mid-upload silently lose rows with no recovery path.
2. **Loyalty blocker:** The Loyalty & Tier Reconciliation feature (paused) requires server-staged data as its input. Client-side staging cannot provide the durability guarantees needed.
3. **Vercel timeout wall:** Moving parsing to a Vercel API route is not viable — serverless timeouts (10–300s) cannot reliably process 10k-row CSVs.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Server is the authoritative ingestion pathway | Worker produces semantically equivalent `import_row` output as client-side staging for the same CSV + mapping (canonical JSON serialization per Normalization Contract for comparisons) |
| **G2**: Crash recovery is idempotent | Killing the worker mid-parse and restarting produces the same final staged rows (no duplicates, no gaps) |
| **G3**: Casino isolation is enforced without RLS | Worker uses `service_role` but zero cross-casino row writes occur (verified by 2-casino integration test) |
| **G4**: 10k-row CSV ingestion completes reliably | Worker stages a 10,000-row CSV with p95 < 2 minutes on staging environment (60-second target is a non-blocking SLO, not a DoD gate) |
| **G5**: UI shows real-time progress | Client polls batch status and displays row counts, status transitions, and errors during worker processing |

### 2.3 Non-Goals

- Changes to `import_row` schema (zero changes — existing RPCs, RLS, service layer depend on it)
- Changes to `rpc_import_execute` (execute pathway is stable and tested)
- Loyalty field extraction or reconciliation (separate feature, blocked on this shipping)
- Client-side preview changes (Papa Parse stays for preview per ADR-036 Lane 1)
- Non-CSV format support (Excel, JSON, XML)
- Real-time WebSocket progress (poll-based is sufficient for MVP)
- Storage file retention / cleanup automation (deferred — SEC note T7)
- `raw_row` PII redaction implementation (deadline must be set before GA — SEC note)
- Virus/malware scanning of uploaded CSVs (deferred — trusted staff-only upload path, role-gated; scanning required before accepting untrusted sources)

---

## 3. Users & Use Cases

- **Primary users:** Admin, Pit Boss (staff with import authority at a specific casino property)

**Top Jobs:**

- As an **Admin**, I need the import to complete reliably even if my browser tab closes, so that large player imports don't silently lose rows.
- As a **Pit Boss**, I need to see import progress (parsing, row counts, errors) while the worker processes my file, so that I know the system is working.
- As an **Admin**, I need failed imports to be automatically retried, so that transient infrastructure issues don't require manual re-upload.
- As a **Pit Boss**, I need the import wizard to feel the same (upload → preview → map → execute → report), even though parsing now happens server-side.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**File Upload Pipeline:**
- New API endpoint: `POST /api/v1/player-import/batches/:id/upload` (multipart/form-data)
- Upload stores raw CSV in Supabase Storage at `imports/{casino_id}/{batch_id}/{upload_id}.csv`
- `storage_path` (the Storage object key) uses a generated identifier — never raw user-provided file name (path traversal prevention)
- `original_file_name` stored separately on `import_batch` for UI display
- Batch transitions `created → uploaded` on successful upload

**Worker Process:**
- Standalone Node.js worker deployed on dedicated PaaS (Railway preferred; Fly.io acceptable)
- Poll-based claim loop: `SELECT ... FROM import_batch WHERE status = 'uploaded' FOR UPDATE SKIP LOCKED`
- Streams CSV from Supabase Storage via signed URL + Node `fetch()` (no full-file buffering)
- Parses with `csv-parse` in streaming mode
- Applies shared normalization contract (header normalization, field normalization, date/numeric parsing)
- Validates each row against `ImportPlayerV1` schema (reuses existing Zod schema)
- Bulk-inserts into `import_row` in 500-row chunks with `ON CONFLICT DO NOTHING`
- Invalid rows inserted with `status = 'error'` + `reason_code` / `reason_detail`
- Updates batch progress (heartbeat, total_rows, report_summary)
- Terminal transition: `parsing → staging` (success) or `parsing → failed` (unrecoverable error)

**Batch Status Machine Extension:**
- Three new enum values: `created`, `uploaded`, `parsing`
- Full machine: `created → uploaded → parsing → staging → executing → completed` (with `failed` terminal from `parsing` or `executing`)
- `staging` is the canonical "ready-to-execute" state (unchanged meaning)

**Crash Recovery:**
- Reaper detects stale `parsing` batches via heartbeat timeout
- Reaper resets to `uploaded` if `attempt_count < max_attempts` (3); transitions to `failed` if exhausted
- Idempotent row inserts via `UNIQUE(import_batch_id, row_number)` + `ON CONFLICT DO NOTHING`

**Row Cap Enforcement:**
- Worker stops stream at row 10,001; batch transitions to `failed` with `BATCH_ROW_LIMIT`
- Partial `import_row` writes from `failed` batches are inert (execute refuses non-`staging` batches); cleanup deferred to future batch purge RPC (SEC note)

**Security (INV-W1–W7):**
- All DB access through single repository module (`ImportBatchRepo`)
- `casino_id` derived exclusively from claimed batch row, never from CSV or external input
- Worker writes only to `import_batch` + `import_row` (no other tables)
- Worker may only set status to `parsing`, `staging`, or `failed`
- CI denylist grep as defense-in-depth tripwire

**UI Changes:**
- Import wizard updated: "staging-upload" step replaced with "file-upload" step
- Client polls `GET /batches/:id` for progress during worker processing
- Status display shows: `uploading → parsing → staging (ready)` with row counts
- Ingestion report surfaced on `staging` completion for operator review before execute

### 4.2 Out of Scope

- `import_row` schema changes (none)
- `rpc_import_execute` changes (unchanged)
- Loyalty tier/points extraction or reconciliation
- Reusable mapping preset templates (per-batch mapping stored for audit; presets are post-MVP)
- Storage file retention / cleanup (deferred — SEC note T7)
- `raw_row` PII redaction (GA gate: must be addressed before production with real patron PII)
- CSV virus/malware scanning (trusted staff-only upload, role-gated; deferred until accepting untrusted sources)
- Removal of `useStagingUpload` hook (deprecated but kept for rollback)
- Worker audit_log writes (system process, not user action)

---

## 5. Requirements

### 5.1 Functional Requirements

- Staff can upload a raw CSV file via the existing import wizard; file is stored server-side
- Worker claims and processes uploaded batches without manual intervention
- Worker output is semantically equivalent to client-side staging for the same input + mapping
- Batch status machine provides 6 distinct states visible to the UI
- Crash mid-parse recovers automatically (up to 3 attempts) and produces identical results
- 10k-row hard cap enforced during parsing; oversized files transition to `failed`
- Ingestion report (`report_summary`) is populated on `staging` completion
- Existing `rpc_import_execute` must constrain to `WHERE status = 'staging'`; verify this existing behavior rejects `failed` batches. Guard is mandatory for safety — if missing, adding it is in-scope as a one-line safety fix
- Upload endpoint rejects requests unless batch `status = 'created'` (returns 409 Conflict)
- Upload endpoint enforces max file size (configurable; MVP: 10MB as initial dev guardrail — adjust after observing real vendor file sizes)
- Upload endpoint derives `casino_id` from auth context (ADR-024), ignoring any `casino_id` in request body

### 5.2 Non-Functional Requirements

- 10,000-row CSV ingestion (upload → parse → stage) completes with p95 < 2 minutes on staging environment; 60-second target is a non-blocking SLO baseline to be validated after initial deployment
- Worker memory usage is O(chunk_size), not O(file_size) (streaming parse required)
- Worker uses bounded DB connection pool (≤ 5 connections; `statement_timeout` per connection)
- Health endpoint + automatic restart policy (crash → restart within 30s)
- Structured JSON logs with batch_id, status transitions, row counts, errors, duration
- Log sink with ≥ 7 days retention

> Architecture details: See ADR-036 (Lane 2), ADR-037 (decisions D1–D4), RFC-SCI, SEC-NOTE-SERVER-CSV-INGESTION

---

## 6. UX / Flow Overview

**Flow: Server-Authoritative CSV Import (updated wizard)**

1. **File Selection** — Same as Lane 1: drag-and-drop or file picker
2. **Preview + Column Mapping** — Papa Parse reads first 50 rows for preview + header extraction (advisory only); admin maps columns
3. **Batch Creation** — `POST /batches` creates batch with `column_mapping` (the canonical mapping payload; also referenced as `mapping_spec` in earlier docs), `status = 'created'`
4. **File Upload** — `POST /batches/:id/upload` uploads raw CSV to Supabase Storage; batch → `uploaded`
5. **Worker Processing** — Background worker claims batch, parses, normalizes, stages; client polls `GET /batches/:id` every 3–5 seconds while `parsing`, backs off to 10–15 seconds after 60 seconds of polling
6. **Staging Complete** — Batch reaches `staging`; UI shows ingestion report; admin reviews before execute
7. **Execute** — Same as Lane 1: `POST /batches/:id/execute`; confirmation dialog; merge runs
8. **Report** — Same as Lane 1: outcome summary + per-row details + CSV download

**Key UX difference from Lane 1:** Steps 4–6 replace the client-side chunked staging. From the user's perspective, the flow feels identical but with a "processing" spinner between upload and execute instead of a client-side progress bar.

**Report overwrite warning:** Operators must review the ingestion report before triggering execute; the execution report overwrites `report_summary`, and the ingestion report is not retained post-execute (ADR-037 D4 accepted tradeoff).

**Entry point:** Same Import Players page (onboarding wizard + admin navigation)

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **PRD-037 (shipped)** — Existing staging tables, RPCs, service layer, UI wizard
- **ADR-036 + ADR-037** — Frozen architectural decisions for worker runtime, security posture, status machine
- **ADR-024 / ADR-030** — `set_rls_context_from_staff()` and auth pipeline hardening (deployed)
- **Supabase Storage** — `imports` bucket for raw CSV files
- **Railway or Fly.io** — Worker deployment platform (DevOps operational decision)
- **`csv-parse`** — Node.js streaming CSV parser (locked, non-negotiable)

### 7.2 Risks & Open Questions

- **Platform selection:** Railway vs Fly.io is a DevOps operational decision. Architecture requires: TCP outbound to Supabase, stable long-lived process runtime, encrypted env vars. Both candidates qualify.
- **Shared code packaging:** Worker imports validation schemas and normalization logic from the main app. Monorepo workspace (`/workers/csv-ingestion/` importing from `/services/`) is simplest but adds build complexity. Decision: monorepo workspace for MVP; extract npm package if build friction becomes material.
- **Phase A coordination risk:** Batch creation route change (`status='created'` default instead of `staging`) must deploy simultaneously with or after the upload endpoint. Deploying before UI update breaks the existing wizard. Mitigation: coordinate API route + UI changes in Phase B, not Phase A.
- **Orphaned PII in Storage:** CSV files persist indefinitely after processing. Mitigation: deferred to post-MVP retention policy (SEC note T7). GA gate: retention/cleanup must be addressed before production with real patron PII.
- **`service_role` credential exposure:** Worker's service_role key is a high-value target. Mitigation: encrypted env vars only; minimal dependency surface; no client-side framework code in worker.
- **Client flow deprecation timeline:** `useStagingUpload` is deprecated but not immediately removed. Provides rollback path. Removal in Phase C after worker stability is confirmed.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Upload endpoint accepts CSV file, stores in Supabase Storage, transitions batch to `uploaded`
- [ ] Worker claims `uploaded` batches, streams CSV, parses, normalizes, and stages rows
- [ ] Worker output is semantically equivalent to client-side staging for same input (verified by comparison test using canonical JSON serialization per Normalization Contract)
- [ ] Batch status machine transitions correctly: `created → uploaded → parsing → staging`
- [ ] Failed batches (row cap exceeded, parse error, max attempts) reach terminal `failed` status
- [ ] Upload endpoint rejects upload to non-`created` batches with 409 Conflict
- [ ] `rpc_import_execute` confirmed to constrain to `WHERE status = 'staging'` (rejects `failed` batches); if guard was missing, one-line fix applied
- [ ] Import wizard updated: file upload step replaces client-side chunked staging
- [ ] Client polls and displays batch progress (status, row counts, errors) during worker processing

**Data & Integrity**
- [ ] `import_batch` extended with `storage_path`, `original_file_name`, `claimed_by`, `claimed_at`, `heartbeat_at`, `attempt_count`, `last_error_at`, `last_error_code`
- [ ] `UNIQUE(import_batch_id, row_number)` constraint on `import_row` (required for idempotent inserts)
- [ ] `import_batch_status` enum extended with `created`, `uploaded`, `parsing`
- [ ] Crash recovery: killing worker mid-parse and restarting produces identical staged rows (no duplicates)
- [ ] Reaper resets stale `parsing` batches to `uploaded` when `attempt_count < max_attempts`; transitions to `failed` when exhausted

**Security & Access**
- [ ] Upload endpoint derives `casino_id` from auth context (ADR-024); ignores `casino_id` in request body
- [ ] Upload endpoint requires `admin` or `pit_boss` role
- [ ] `storage_path` uses generated `upload_id`, never raw user-provided file name
- [ ] Worker `casino_id` derived exclusively from claimed batch row (INV-W5)
- [ ] All worker DB access through `ImportBatchRepo` — no raw queries outside repo module (INV-W4)
- [ ] Worker writes only to `import_batch` + `import_row` (INV-W4)
- [ ] Worker only sets status to `parsing`, `staging`, or `failed` (INV-W7)
- [ ] 2-casino integration test verifies zero cross-casino row writes

**Testing**
- [ ] Unit tests: header normalization, field normalization, row validation
- [ ] Unit tests: claim CTE logic, reaper logic, heartbeat update
- [ ] Integration test: worker ingests 10k-row CSV and produces correct `import_row` output
- [ ] Integration test: 2-casino cross-contamination test (INV-W3, INV-W5)
- [ ] Integration test: crash recovery — kill mid-parse, restart, verify identical output
- [ ] E2E test: upload → worker processes → staging → execute → report (happy path)
- [ ] Integration test: upload to non-`created` batch returns 409
- [ ] Integration test: two concurrent claim attempts on same batch — only one succeeds (`FOR UPDATE SKIP LOCKED`)
- [ ] Integration test: execute on `failed` batch returns rejection (negative test for status guard)
- [ ] Migration guard: verify `UNIQUE(import_batch_id, row_number)` constraint exists on `import_row` after migration
- [ ] CI denylist grep: worker code references no forbidden tables (`player`, `visit`, `audit_log`, etc.)

**Operational Readiness**
- [ ] Worker deployed on PaaS with health endpoint + automatic restart policy
- [ ] Structured JSON logs with batch_id, status transitions, row counts, duration
- [ ] Dead batch detection: stale `parsing` batches visible in admin dashboard or alerting
- [ ] Rollback path defined: stop worker → batches stay `uploaded` → old client flow available via `useStagingUpload`

**Documentation**
- [ ] Upload endpoint documented (API surface)
- [ ] Worker operational baseline documented (health, pool size, log retention, secrets)
- [ ] Migration phases (A→D) documented with coordination requirements
- [ ] Known limitations documented (no file retention policy, no `raw_row` redaction, no virus scanning)
- [ ] GA gate documented: no production deployment with real patron PII until storage retention and `raw_row` redaction policies are implemented

---

## 9. Related Documents

- **Predecessor PRD:** `docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md` (PRD-037 — Lane 1 MVP, shipped)
- **Feature Boundary:** `docs/20-architecture/specs/server-csv-ingestion/FEATURE_BOUNDARY.md`
- **Feature Scaffold:** `docs/01-scaffolds/SCAFFOLD-SERVER-CSV-INGESTION.md` (v3.1)
- **Design Brief / RFC:** `docs/02-design/RFC-SERVER-CSV-INGESTION.md`
- **Architecture / ADR:** `docs/80-adrs/ADR-037-server-csv-ingestion-worker.md`
- **Architecture / ADR (parent):** `docs/80-adrs/ADR-036-csv-player-import-strategy.md` (Lane 2 amendment)
- **Security / SEC Note:** `docs/30-security/SEC-NOTE-SERVER-CSV-INGESTION.md`
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (PlayerImportService)
- **Schema / Types:** `types/database.types.ts`
- **Prior PRDs (vision-era):** `docs/10-prd/PRD-PLAYER-CSV-IMPORT.md`, `docs/10-prd/PRD-PLAYER-CSV-IMPORT-ADDENDUM.md`

---

## Appendix A: Migration Phases

| Phase | What Ships | Coordination |
|-------|-----------|--------------|
| **A** | Worker process + upload endpoint deployed (worker polls but no batches are `uploaded` yet) | No UI changes; worker is idle |
| **B** | UI wizard updated: file-upload step replaces client-side staging; batch creation uses `status='created'` | API route + UI changes deploy together; **Phase A coordination warning applies** |
| **C** | `useStagingUpload` removed from UI (RPC kept for backwards compat) | Only after worker stability confirmed in production |
| **D** | (Optional) Remove `rpc_import_stage_rows` if no other consumers | Only after full deprecation of client-side staging |

---

## Appendix B: Worker Invariants (Quick Reference)

| ID | Invariant |
|----|-----------|
| INV-W1 | Every `UPDATE import_batch` includes `WHERE id = $batch_id` |
| INV-W2 | Reaper: `AND status = 'parsing' AND heartbeat_at < $threshold AND attempt_count < $max_attempts`; else → `failed` |
| INV-W3 | Every `INSERT INTO import_row` includes `batch_id` and `casino_id` from claimed batch row |
| INV-W4 | Worker never queries tables other than `import_batch` and `import_row` |
| INV-W5 | Worker never accepts `casino_id` from any source other than claimed `import_batch` row |
| INV-W6 | Claim CTE uses `WHERE status = 'uploaded'` only; resume via reaper reset, not direct re-claim |
| INV-W7 | Worker may only set status to `parsing`, `staging`, or `failed` |

---

## Appendix C: Error Codes (extends PRD-037 Appendix C)

| Code | HTTP | Description |
|------|------|-------------|
| `IMPORT_BATCH_NOT_CREATED` | 409 | Upload attempted on batch not in `created` status |
| `IMPORT_BATCH_ROW_LIMIT` | — | Worker-side: CSV exceeds 10,000-row hard cap; batch transitions to `failed`. Surfaced to client via `report_summary.error_code` on batch status poll, not as an HTTP error. |
| `IMPORT_BATCH_PARSE_ERROR` | — | Worker-side: unrecoverable CSV parse error (malformed file, encoding failure). Surfaced via `report_summary.error_code`. |
| `IMPORT_BATCH_MAX_ATTEMPTS` | — | Worker-side: reaper exhausted retry attempts (`attempt_count >= max_attempts`); batch terminal `failed`. Surfaced via `report_summary.error_code`. |

Existing PRD-037 error codes (`IMPORT_BATCH_NOT_FOUND`, `IMPORT_BATCH_NOT_STAGING`, `IMPORT_BATCH_ALREADY_EXECUTING`, `IMPORT_ROW_NO_IDENTIFIER`, `IMPORT_ROW_VALIDATION_FAILED`, `IMPORT_IDEMPOTENCY_CONFLICT`, `IMPORT_SIZE_LIMIT_EXCEEDED`) remain unchanged.

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-02-24 | Lead Architect | Initial draft from feature pipeline (Phase 5) |
| 0.2.0 | 2026-02-24 | Lead Architect | Devil's advocate pass 1: clarify rpc_import_execute non-change, add upload precondition (409), add original_file_name to DoD, define partial-row fate on failed batches, add error codes appendix, add upload rejection + concurrent claim tests |
| 0.3.0 | 2026-02-24 | Lead Architect | Devil's advocate pass 2: G1 "identical" → "semantically equivalent", G4 performance metric p95 < 2min (60s as SLO not gate), report overwrite warning in UX, execute guard mandatory if missing, column_mapping terminology alias, upload size as dev guardrail, "trusted staff-only" replaces "admin-only", failed-batch execution rejection test, unique constraint migration guard test |
| 0.3.1 | 2026-02-24 | Lead Architect | Final nits: standardize storage_path terminology, clarify worker-side error codes (not HTTP), add poll backoff rule |
