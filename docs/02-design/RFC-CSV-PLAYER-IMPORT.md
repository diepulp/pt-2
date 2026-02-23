---
id: RFC-CSV
title: "Design Brief: CSV Player Import (Lane 1 MVP)"
owner: lead-architect
status: Draft
date: 2026-02-23
affects: [PlayerImportService, PlayerService, CasinoService]
---

# Design Brief / RFC: CSV Player Import (Lane 1 MVP)

> Purpose: propose direction and alternatives with tradeoffs before anyone writes a PRD.

## 1) Context

**Problem:** Casino properties onboarding onto PT-2 need to seed their player pool from vendor-provided CSV exports. Vendor schemas are unknown and variable — headers differ, columns are optional, formatting is messy. We need an import pipeline that accepts these unknown shapes, normalizes them to a canonical contract, and executes an auditable, idempotent, casino-scoped upsert.

**Forces/Constraints:**
- Database is authoritative for correctness: casino-scoped uniqueness, conflict resolution, idempotency, audit
- Parsing/mapping is not a security boundary — it's untrusted pre-processing
- RLS stays enabled; all production writes via SECURITY DEFINER RPCs (ADR-024)
- Must not write a CSV parser from scratch (Papa Parse handles this)
- Loyalty tier/points in CSV are staged metadata only — never written to loyalty ledger

**Prior Art:**
- PT-2 service layer pattern (functional factories, DTOs, Zod schemas)
- Existing SECURITY DEFINER RPCs (ADR-018 governance, ADR-024 context derivation)
- Player enrollment flow: `player` -> `player_casino` (ADR-022)
- Idempotency pattern: `UNIQUE(casino_id, idempotency_key)` (Edge Transport Policy)

## 2) Scope & Goals

- **In scope:**
  - Browser-side CSV parsing with Papa Parse (Web Worker + streaming)
  - Column mapping UI (vendor headers -> `ImportPlayerV1` canonical contract)
  - Auto-detect heuristics for common header patterns
  - Staging tables (`import_batch`, `import_row`) with batch lifecycle
  - Execute RPC: casino-scoped identifier resolution, conflict detection, idempotent merge
  - Per-row outcome report + downloadable results CSV
  - CSV injection protection on exports

- **Out of scope:**
  - Loyalty tier reconciliation (separate PRD)
  - Server-side file parsing / upload pipeline
  - Cross-casino identity linking
  - Mapping preset persistence (post-MVP)
  - External ID matching via `player_identity` table (post-MVP)
  - Fuzzy/phonetic matching

- **Success criteria:**
  - 5,000-row vendor CSV imports end-to-end in < 60 seconds
  - Idempotent re-execution returns identical report
  - Zero cross-tenant data leakage
  - UI remains responsive during parsing (Web Worker)

## 3) Proposed Direction (overview)

Two-step import design: (1) browser parses CSV bytes into canonical `ImportPlayerV1` rows using Papa Parse with Web Worker streaming, (2) server/DB enforces truth via staging tables and a SECURITY DEFINER execute RPC that performs casino-scoped merge with idempotency and row-level outcomes. Column mapping bridges unknown vendor schemas to the stable internal contract.

## 4) Detailed Design

### 4.1 Data Model Changes

**New tables (PlayerImportService bounded context):**

**`import_batch`**
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | uuid | PK | Batch identifier |
| `casino_id` | uuid | NOT NULL, FK casino | Casino scoping |
| `created_by_staff_id` | uuid | NOT NULL, FK staff | Actor attribution |
| `idempotency_key` | text | NOT NULL | Replay protection |
| `status` | enum | NOT NULL, default 'staging' | `staging` -> `executing` -> `completed` / `failed` |
| `file_name` | text | NULLABLE | Original file name (metadata) |
| `vendor_label` | text | NULLABLE | Vendor identifier (metadata) |
| `column_mapping` | jsonb | NULLABLE | Mapping config used for this batch |
| `total_rows` | int | default 0 | Row count |
| `report_summary` | jsonb | NULLABLE | Aggregate outcomes after execute |
| `created_at` | timestamptz | NOT NULL, default now() | |
| `updated_at` | timestamptz | NOT NULL, default now() | |

Constraints: `UNIQUE(casino_id, idempotency_key)`

**`import_row`**
| Column | Type | Constraints | Purpose |
|--------|------|-------------|---------|
| `id` | uuid | PK | Row identifier |
| `batch_id` | uuid | NOT NULL, FK import_batch | Parent batch |
| `row_number` | int | NOT NULL | Original CSV row number |
| `raw_row` | jsonb | NULLABLE | Original CSV data (optional, redactable) |
| `normalized_payload` | jsonb | NOT NULL | `ImportPlayerV1` canonical form |
| `status` | enum | NOT NULL, default 'staged' | `staged` -> `created` / `linked` / `skipped` / `conflict` / `error` |
| `reason_code` | text | NULLABLE | Machine-readable outcome reason |
| `reason_detail` | text | NULLABLE | Human-readable detail |
| `matched_player_id` | uuid | NULLABLE, FK player | Player matched/created |
| `created_at` | timestamptz | NOT NULL, default now() | |

Constraints: `UNIQUE(batch_id, row_number)`

**New enums:**
- `import_batch_status`: `'staging'`, `'executing'`, `'completed'`, `'failed'`
- `import_row_status`: `'staged'`, `'created'`, `'linked'`, `'skipped'`, `'conflict'`, `'error'`

### 4.2 Service Layer

`services/player-import/` following standard PT-2 pattern:

| Module | Purpose |
|--------|---------|
| `dtos.ts` | `ImportPlayerV1`, `ImportBatchDTO`, `ImportRowDTO`, `ImportBatchReportV1`, `ColumnMapping` |
| `schemas.ts` | Zod validation: `importPlayerV1Schema` (at least one identifier required), batch/row route params |
| `keys.ts` | React Query key factory: `playerImportKeys` |
| `mappers.ts` | DB row -> DTO transformations |
| `crud.ts` | Server-side operations: `createBatch`, `stageRows`, `executeBatch`, `getBatch`, `listBatches` |
| `http.ts` | Client-side HTTP fetchers with idempotency headers |
| `index.ts` | Service factory export |

### 4.3 API Surface

| Method | Path | Purpose | Idempotency |
|--------|------|---------|-------------|
| POST | `/api/v1/player-import/batches` | Create batch | Required |
| GET | `/api/v1/player-import/batches` | List batches (cursor, status filter) | No |
| GET | `/api/v1/player-import/batches/:id` | Get batch + report | No |
| POST | `/api/v1/player-import/batches/:id/rows` | Stage rows (max 2000/request) | Required |
| GET | `/api/v1/player-import/batches/:id/rows` | List rows (status filter, cursor) | No |
| POST | `/api/v1/player-import/batches/:id/execute` | Execute merge into production | Required |

All routes use `withServerAction` middleware for auth, RLS context injection, and audit.

### 4.4 UI/UX Flow

Six-step wizard (Dialog-based):

1. **File Selection** — Drag-and-drop with size validation (10MB max)
2. **Column Mapping** — Auto-detect common patterns; user maps remaining columns; at least one identifier required
3. **Preview Summary** — Row counts, validation warnings, sample data table
4. **Staging Upload** — Chunked upload (500 rows/request) with progress bar and retry
5. **Execute** — Confirmation step; calls execute RPC; shows progress
6. **Report** — Outcome summary (created/linked/skipped/conflict/error counts) + downloadable results CSV

### 4.5 Security Considerations

- **RLS:** Both staging tables have RLS enabled with Pattern C hybrid for reads, session-vars-only for writes
- **RBAC:** INSERT/UPDATE restricted to `admin`, `pit_boss` roles
- **SECURITY DEFINER:** Three RPCs — `rpc_import_create_batch`, `rpc_import_stage_rows`, `rpc_import_execute` — all call `set_rls_context_from_staff()` (ADR-024)
- **Actor binding:** `created_by_staff_id` enforced via `app.actor_id` in INSERT policy
- **Append-only:** DELETE policies deny all (`USING (false)`)
- **No direct client writes:** All production writes via RPCs only
- **CSV injection:** Export sanitizes cells starting with `=`, `+`, `-`, `@`

## 5) Cross-Cutting Concerns

- **Performance:** Papa Parse Web Worker prevents UI blocking; 500-row chunking prevents request timeouts; batch processing in execute RPC uses set-based operations
- **Migration:** Single migration file; no data migration needed (new tables)
- **Observability:** Batch status and report_summary provide built-in telemetry; audit_log integration via RPC actor attribution
- **Rollback:** Drop staging tables + RPCs; no production table changes (additive only)

## 6) Alternatives Considered

### Alternative A: Embedded Importer (Flatfile/OneSchema)

- **Description:** Use SaaS importer widget for upload, mapping, validation, and correction UX
- **Tradeoffs:** Best mapping UX but adds vendor cost, lock-in, and integration complexity
- **Why not chosen:** Higher MVP cost; same backend work required regardless; clean exit ramp preserved via `ImportPlayerV1` contract

### Alternative B: Server-side Parsing

- **Description:** Upload CSV to server, parse with streaming Node library, stage and execute
- **Tradeoffs:** Better performance on large files but requires file upload pipeline, storage, virus scanning
- **Why not chosen:** Significantly higher infrastructure cost for MVP; 10,000-row limit makes browser parsing sufficient

## 7) Decisions Required

ADR-worthy decisions for Phase 4:

1. **Decision:** Parsing location (browser vs server vs embedded importer)
   **Options:** Browser Papa Parse | Embedded SaaS | Server-side Node
   **Recommendation:** Browser Papa Parse (lowest MVP cost, clean exit ramp)

2. **Decision:** Identifier resolution strategy (how to match imported rows to existing players)
   **Options:** Exact email/phone match | Fuzzy matching | External ID lookup
   **Recommendation:** Exact email/phone match for MVP; external ID deferred until `player_identity` table is mature

3. **Decision:** Conflict handling policy (what happens when a row matches multiple players)
   **Options:** Reject (no write) | Pick best match | Merge
   **Recommendation:** Reject with conflict status (safest for MVP; no silent data corruption)

4. **Decision:** Staging table ownership (new bounded context vs extend existing)
   **Options:** New PlayerImportService | Extend PlayerService | Extend CasinoService
   **Recommendation:** New PlayerImportService (clean separation of import lifecycle from identity management)

## 8) Open Questions

- ~~Vendor schema variability~~ — solved by mapping UI
- ~~File size limits~~ — 10MB / 10,000 rows
- External ID matching via `player_identity` — deferred post-MVP
- Mapping preset persistence — deferred post-MVP
- Batch expiry / cleanup policy for old staging data — not addressed in MVP

## Links

- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-CSV-PLAYER-IMPORT.md`
- Feature Boundary: `docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md`
- ADR(s): `docs/80-adrs/ADR-036-csv-player-import-strategy.md` (Phase 4)
- PRD: `docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md` (Phase 5)

## References

- Vision docs: `docs/00-vision/csv-import/`
- Papa Parse: browser CSV parser with Web Worker + streaming support
- ADR-024: Authoritative context derivation via `set_rls_context_from_staff()`
- ADR-018: SECURITY DEFINER governance
- ADR-022: Player identity enrollment decisions
- Edge Transport Policy: idempotency header requirements
