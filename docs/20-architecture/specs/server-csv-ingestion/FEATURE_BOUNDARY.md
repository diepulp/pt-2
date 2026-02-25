# Feature Boundary Statement: Server-Authoritative CSV Ingestion

> **Ownership Sentence:** This feature belongs to **PlayerImportService** and may only touch **import_batch, import_row** (existing tables, schema extensions); cross-context needs go through **Supabase Storage** for file persistence and **platform/DevOps** for worker deployment infrastructure.

---

## Feature Boundary Statement

- **Owner service(s):**
  - **PlayerImportService** — CSV ingestion pipeline, staging tables, normalization logic

- **Writes:**
  - `import_batch` (extend with `storage_path`, new ingestion status values; see Status Machine below)
  - `import_row` (bulk insert normalized rows — same shape as today, different ingestion pathway)

- **Reads:**
  - `import_batch` (worker claims batches by status)
  - Supabase Storage (stream raw CSV file for parsing)
  - `casino_settings` (via CasinoService DTO — if normalization needs casino-specific config)

- **Cross-context contracts:**
  - **Supabase Storage** — file upload/download (platform service, not a bounded context)
  - **Platform/DevOps** — worker process deployment, monitoring, health checks
  - No cross-context database writes (worker writes only to PlayerImportService's own tables)

- **Non-goals (top 5):**
  1. Replacing the client-side preview/mapping UI (Papa Parse stays for preview)
  2. Building a generic ETL platform (NiFi, Airbyte, Kafka)
  3. Real-time streaming ingestion (batch-oriented, poll-based worker)
  4. File virus scanning (deferred — Supabase Storage handles basic validation)
  5. Ingesting non-CSV formats (Excel, JSON, XML)

- **DoD gates:** Functional / Security / Integrity / Operability (see DOD-SCI)

---

## Goal

Replace client-side CSV parsing as the authoritative ingestion pathway with a server-side streaming worker that parses, normalizes, and stages rows durably — eliminating browser memory limits, flaky network sensitivity, and client-as-authority trust boundary violations.

## Primary Actor

**Admin / Pit Boss** (uploads CSV file and monitors import progress)

## Primary Scenario

Admin selects CSV file, client shows preview + mapping UI (Papa Parse), admin confirms mapping, client uploads raw file to storage and creates batch with `status: uploaded`. Background worker claims batch, streams file from storage, parses with `csv-parse`, normalizes rows to `ImportPlayerV1`, bulk-inserts into `import_row` in chunks, updates batch progress. Client polls batch status until staging is complete, then admin triggers execute.

## Success Metric

A 10,000-row CSV file is ingested end-to-end (upload → parse → stage) within 60 seconds via the worker, with zero data loss, idempotent retry on failure, and identical `import_row` output as the current client-side flow.

---

## Batch Status Machine (Ingestion Lifecycle)

```
created → uploaded → parsing → staged
                         ↓
                       failed
```

| Status | Who sets it | Meaning |
|--------|-------------|---------|
| `created` | Client (batch creation) | Batch metadata exists, no file yet |
| `uploaded` | Client (after file upload to storage) | Raw CSV in storage, ready for worker |
| `parsing` | Worker (claims batch) | Worker is streaming + normalizing |
| `staged` | Worker (all rows inserted) | Staging complete, ready for execute |
| `failed` | Worker (unrecoverable error) | Error summary populated |

**Relationship to existing statuses:** The current `import_batch_status` enum is `staging, executing, completed, failed`. The ingestion lifecycle replaces `staging` with finer-grained states (`created → uploaded → parsing → staged`). The execute lifecycle (`staged → executing → completed/failed`) stays unchanged. `staged` is the handoff point.

---

## Minimal Worker-First Deliverable (Phase 1 DoD)

This is the scope anchor. The worker is done when:

- [ ] `import_batch` exists with statuses: `created → uploaded → parsing → staged/failed`
- [ ] Worker claims batches (row lock + idempotency — no double-processing)
- [ ] Worker streams CSV from Supabase Storage
- [ ] Worker parses with `csv-parse` (streaming, not buffered)
- [ ] Worker normalizes + validates rows (→ `ImportPlayerV1` canonical contract)
- [ ] Worker inserts into `import_row` in chunks (idempotent, ON CONFLICT safe)
- [ ] Worker updates `import_batch` progress + `error_summary` on failure
- [ ] UI can display: batch status + row totals + sample errors (poll-based)

**What is NOT in Phase 1:** Execute flow changes, loyalty field extraction, reconciliation queue generation, tier mapping logic.

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **FEATURE_BOUNDARY** | Scope definition (this file) | `docs/20-architecture/specs/server-csv-ingestion/FEATURE_BOUNDARY.md` |
| **SCAFFOLD** | Options analysis with tradeoffs | `docs/01-scaffolds/SCAFFOLD-SERVER-CSV-INGESTION.md` (Phase 1) |
| **RFC** | Design brief / architectural direction | `docs/02-design/RFC-server-csv-ingestion.md` (Phase 2) |
| **SEC_NOTE** | Security threat model | `docs/20-architecture/specs/server-csv-ingestion/SEC_NOTE.md` (Phase 3) |
| **ADR** | Durable architectural decisions (frozen) | `docs/80-adrs/ADR-XXX-server-csv-ingestion.md` (Phase 4) |
| **PRD** | Testable acceptance criteria | `docs/10-prd/PRD-XXX-server-csv-ingestion.md` (Phase 5) |

---

## Existing Implementation Context

This feature **augments** the existing PRD-037 CSV Player Import (already shipped). Key facts:

- **Tables exist:** `import_batch`, `import_row` with full RLS (ADR-024, ADR-030)
- **RPCs exist:** `rpc_import_create_batch`, `rpc_import_stage_rows`, `rpc_import_execute`
- **Service layer exists:** `services/player-import/` (dtos, schemas, crud, mappers, http, keys)
- **Client flow exists:** Papa Parse → useStagingUpload (500-row chunks) → rpc_import_stage_rows
- **API routes exist:** POST/GET batches, POST rows, POST execute

**What changes:** The *staging pathway* (how rows get into `import_row`) moves from client-parsed chunks to server-streamed parsing. The execute pathway (`rpc_import_execute`) stays unchanged.

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.
