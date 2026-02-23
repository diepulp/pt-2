---
id: PRD-037
title: "CSV Player Import — Lane 1 MVP"
owner: Engineering
status: Draft
affects: [ADR-036, SEC-NOTE-CSV-PLAYER-IMPORT, RFC-CSV, SCAFFOLD-CSV]
created: 2026-02-23
last_review: 2026-02-23
phase: "Phase 3 (Onboarding & Intake)"
pattern: A
http_boundary: true
bounded_contexts:
  - PlayerImportService (new)
  - PlayerService (cross-context write target)
  - CasinoService (cross-context write target)
depends_on:
  - ADR-036 (CSV Player Import Strategy — accepted)
  - ADR-024 (Authoritative context derivation)
  - ADR-030 (Auth pipeline hardening)
  - PRD-035 (Onboarding Bootstrap Auth Fixes)
tags: [csv-import, onboarding, player-seeding, lane-1-mvp]
---

# PRD-037 — CSV Player Import (Lane 1 MVP)

## 1. Overview

- **Owner:** Engineering
- **Status:** Draft
- **Summary:** Casino properties onboarding onto PT-2 need to seed their player pool from vendor-provided CSV exports with unknown schemas. This PRD delivers a browser-side CSV import pipeline (Papa Parse + column mapping UI) that normalizes vendor data to a canonical `ImportPlayerV1` contract, stages rows in dedicated tables, and executes an auditable, idempotent, casino-scoped merge via SECURITY DEFINER RPCs. The primary users are pit bosses and admins performing initial player seeding during or after onboarding. This ships as the first intake feature following the onboarding bootstrap (PRD-035).

---

## 2. Problem & Goals

### 2.1 Problem

Casino properties migrating to PT-2 have existing player pools trapped in legacy systems (spreadsheets, CRM exports, vendor databases). Without an import path, onboarding stalls because staff cannot look up known patrons on day one. Manual re-entry of hundreds or thousands of players is impractical and error-prone.

Vendor CSV exports have unpredictable schemas — headers differ, columns are optional, formatting is inconsistent. A rigid "match our template exactly" approach forces excessive support burden and discourages adoption.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Staff can import a vendor CSV with unknown headers | Upload + map + stage + execute completes without requiring a specific CSV template |
| **G2**: Import is fast and non-blocking | 5,000-row vendor CSV imports end-to-end in < 60 seconds; UI remains responsive during parsing |
| **G3**: Import is idempotent and auditable | Re-executing the same batch returns identical report; every row has a traceable outcome |
| **G4**: Casino-scoped isolation is enforced | Zero cross-tenant data leakage; all production writes go through casino-scoped SECURITY DEFINER RPCs |
| **G5**: Conflicts are reported, not silently resolved | Multi-match rows are marked `conflict` with no production writes; report includes per-row reasons |

### 2.3 Non-Goals

- Loyalty tier reconciliation from CSV (separate PRD; import is not the loyalty source of truth)
- Server-side CSV parsing or file upload/storage pipeline
- Cross-casino identity linking (strict tenant isolation per ADR-023)
- Fuzzy matching or phonetic dedup (exact email/phone match only for MVP)
- Reusable mapping preset templates across batches (saved per casino/vendor — post-MVP); note: MVP stores `column_mapping` per batch on `import_batch.column_mapping` for reproducibility and audit
- External ID matching via `player_identity` table (deferred until ADR-022 matures); note: `external_id` is accepted and stored in staging, but ignored for identifier resolution until ADR-022 matures
- Merge/conflict resolution tooling (conflicts are reported, not resolved in-app)
- Background job orchestration or queue-based processing
- `raw_row` redaction policy implementation (deadline must be set before GA; see SEC Note)

---

## 3. Users & Use Cases

- **Primary users:** Pit Boss, Admin (staff with import authority at a specific casino property)

**Top Jobs:**

- As a **Pit Boss**, I need to upload a vendor CSV of players so that the casino's player pool is populated before the first shift.
- As an **Admin**, I need to map unfamiliar CSV columns to our system's fields so that vendor data is correctly normalized regardless of export format.
- As a **Pit Boss**, I need to review a preview of staged rows before committing so that I can catch mapping errors before they become production data.
- As an **Admin**, I need a per-row outcome report after execution so that I can identify conflicts, skipped rows, and errors for manual follow-up.

---

## 4. Scope & Feature List

### 4.1 In Scope (MVP)

**Parsing & Mapping:**
- Browser-side CSV parsing via Papa Parse (Web Worker + streaming)
- Column mapping UI: auto-detect common header patterns + manual override
- At least one identifier (email or phone) required per row
- Header alias dictionary for common vendor patterns (e.g., `e-mail` -> `email`)

**Staging & Validation:**
- `import_batch` and `import_row` staging tables (new PlayerImportService bounded context)
- Chunked row upload: client sends 500 rows/request by default; server accepts up to 2,000 rows/request
- Per-row validation with machine-readable `reason_code` and human-readable `reason_detail`
- Batch lifecycle: `staging` -> `executing` -> `completed` / `failed`

**Execution & Merge:**
- Casino-scoped identifier resolution (exact email/phone match within enrolled players)
- Deterministic conflict handling: 0 matches = create, 1 match = link, N matches = conflict
- Idempotent execution via `UNIQUE(casino_id, idempotency_key)` on `import_batch`
- All production writes via SECURITY DEFINER RPCs with `set_rls_context_from_staff()`

**Reporting:**
- Batch report summary: created / linked / skipped / conflict / error counts
- Per-row outcome details with row numbers and reason codes
- Downloadable results CSV with CSV injection protection

**Security (single governance rule):**
- All writes (staging + production) occur via SECURITY DEFINER RPCs that call `set_rls_context_from_staff()` and set an explicit `search_path` (empty, with schema-qualified references) to prevent object shadowing; direct DML is denied except controlled reads under RLS
- RLS on staging tables: Pattern C hybrid for reads, session-vars-only for write policies
- RBAC: INSERT/UPDATE restricted to `admin`, `pit_boss` roles
- Append-only staging (DELETE policies deny all)
- Actor attribution via `created_by_staff_id = app.actor_id`

### 4.2 Out of Scope

- Loyalty tier/points writes (staged as metadata only in `raw_row`)
- Server-side file parsing or upload pipeline
- Reusable mapping preset templates across batches (per batch mapping is stored for audit; reusable presets are post-MVP)
- External ID matching via `player_identity` (`external_id` is accepted and staged, but ignored for match resolution until ADR-022 matures)
- Fuzzy matching or name similarity dedup
- Batch expiry / staging data cleanup automation
- `raw_row` PII redaction (deadline required before GA)
- Dry-run mode (preview via staging tables serves this purpose)

---

## 5. Requirements

### 5.1 Functional Requirements

- Staff can upload a CSV file (max 10MB / 10,000 rows) via drag-and-drop or file picker
- System auto-detects common header patterns and presents a mapping UI for remaining columns
- Mapped rows are normalized to the `ImportPlayerV1` canonical contract before reaching the backend
- Rows without at least one identifier (email or phone) are rejected at staging time
- Staged rows can be previewed before execution (count, validation warnings, sample data)
- Execute merges staged rows into production `player` and `player_casino` tables atomically
- Execution is idempotent: re-submitting the same idempotency key returns the existing batch
- Batch status machine prevents double-execution (`staging` -> `executing` -> terminal)
- Report is available immediately after execution and is re-fetchable
- Results CSV export mitigates formula injection per OWASP guidance: prefix cells starting with `=`, `+`, `-`, `@` with a tab character (`0x09`) inside the quoted field (tab-prefix mitigation is more portable across spreadsheet applications than apostrophe-prefix)

### 5.2 Non-Functional Requirements

- 5,000 rows parse + stage + execute in < 60 seconds end-to-end
- UI remains responsive during parsing (Web Worker required); worker parsing queues rows locally; chunked upload runs independently (Papa Parse with `worker: true` does not support pause/resume — only abort — so parsing and uploading are decoupled)
- Client default chunk size: 500 rows/request; server maximum: 2,000 rows/request
- All writes (staging + production) via SECURITY DEFINER RPCs with explicit `search_path`; no direct table DML
- RLS enabled on all new tables per ADR-020 Track A

> Architecture details: See SRM v4.11.0 (PlayerImportService registration pending), ADR-036, SLAD

---

## 6. UX / Flow Overview

**Flow: CSV Player Import (6-step wizard)**

1. **File Selection** — Drag-and-drop or file picker; displays file name, size, row count estimate; validates 10MB / 10,000 row limits
2. **Column Mapping** — Auto-detect runs on headers; user maps remaining columns via dropdowns; at least one identifier column required; unmapped columns noted as "preserved in raw data"
3. **Preview Summary** — Total rows, validation warnings (missing identifiers, format issues), sample data table (first 10 rows)
4. **Staging Upload** — Worker parsing queues rows; chunked upload runs independently (500 rows/request default, server accepts up to 2,000); progress bar; retry on transient failures; abort on persistent errors
5. **Execute** — Confirmation dialog; calls execute RPC; shows progress indicator while merge runs
6. **Report** — Outcome summary (created / linked / skipped / conflict / error counts); expandable per-row detail table; download results CSV button

**Entry point:** Import Players page (accessible from onboarding wizard and admin navigation)

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **ADR-036** — Frozen architectural decisions for parsing, staging, merge strategy
- **ADR-024 / ADR-030** — `set_rls_context_from_staff()` and auth pipeline hardening (deployed)
- **PRD-035** — Onboarding bootstrap auth fixes (must be deployed for import to work in onboarding flow)
- **SRM registration** — `PlayerImportService` must be registered in SRM before schema changes
- **Papa Parse** — Browser CSV parsing library (external dependency, MIT licensed)

### 7.2 Risks & Open Questions

- **Weak-machine performance** — Papa Parse with Web Worker mitigates UI blocking, but very slow devices may struggle with 10,000 rows. Mitigation: recommend modern browser; test on low-end hardware during QA.
- **Batch expiry** — Old staging data accumulates indefinitely in MVP. Mitigation: deferred to post-MVP cleanup job; documented in SEC Note as accepted risk.
- **`raw_row` PII retention** — Vendor CSVs may contain arbitrary PII beyond mapped fields. Mitigation: redaction policy deadline required before GA (SEC Note T5). **GA gate: no general availability until a retention/redaction policy is implemented or `raw_row` storage is disabled.**
- **`player_identity` table readiness** — External ID matching deferred. Mitigation: exact email/phone match is sufficient for initial seeding; `external_id` is accepted and stored in staging but ignored for match resolution; external ID matching added when ADR-022 matures.
- **Enrollment-first scoping and indexing** — "Casino-scoped match" means identifier resolution queries only consider players enrolled at the importing casino (via `player_casino.casino_id`), not global players filtered after the fact. Required indexes: `player_casino(casino_id, player_id)` for joins; `player(email)`, `player(phone)` for identifier lookups. Future extension: `player_identity(player_id, type, value)` post-ADR-022.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Staff can upload a vendor CSV, map columns, stage rows, execute merge, and view report end-to-end
- [ ] Auto-detect correctly maps common header patterns (email, phone, first_name, last_name, dob)
- [ ] Rows without identifiers are rejected at staging with clear reason codes
- [ ] Conflict rows (N matches) produce conflict status with no production writes
- [ ] Idempotent re-execution returns the same completed report

**Data & Integrity**
- [ ] `import_batch` and `import_row` tables created with correct constraints (unique keys, foreign keys, enums)
- [ ] Production writes only via SECURITY DEFINER RPCs — no direct INSERT to `player` or `player_casino` from import flow
- [ ] Batch status machine prevents double-execution

**Security & Access**
- [ ] RLS enabled on `import_batch` and `import_row` with casino-scoped policies
- [ ] INSERT/UPDATE restricted to `admin` and `pit_boss` roles
- [ ] DELETE denied on both staging tables
- [ ] Actor attribution (`created_by_staff_id`) enforced via `app.actor_id`
- [ ] CSV export sanitizes formula-injection characters using OWASP tab-prefix mitigation (`0x09` inside quoted field)
- [ ] All SECURITY DEFINER RPCs set explicit `search_path` (empty, schema-qualified references)

**Testing**
- [ ] Unit tests for `ImportPlayerV1` Zod schema validation (valid/invalid payloads)
- [ ] Unit tests for column mapping auto-detect heuristics
- [ ] Integration test for execute RPC: create, link, skip, conflict outcomes
- [ ] At least one happy-path E2E test: upload -> map -> stage -> execute -> report

**Operational Readiness**
- [ ] Batch `report_summary` provides built-in telemetry (outcome counts per batch)
- [ ] Actor attribution provides audit trail for who performed each import
- [ ] Rollback path defined: drop staging tables + RPCs (additive-only, no production schema changes)

**Documentation**
- [ ] API surface documented (6 endpoints per RFC section 4.3)
- [ ] Known limitations documented (no fuzzy match, no external ID matching, no reusable presets, no raw_row redaction)
- [ ] GA gate documented: no general availability until `raw_row` retention/redaction policy is implemented or `raw_row` storage is disabled

---

## 9. Related Documents

- **Vision / Strategy**: `docs/00-vision/csv-import/PRD-CSV-IMPORT-LANE1-MVP.md`
- **Feature Boundary**: `docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md`
- **Feature Scaffold**: `docs/01-scaffolds/SCAFFOLD-CSV-PLAYER-IMPORT.md`
- **Design Brief / RFC**: `docs/02-design/RFC-CSV-PLAYER-IMPORT.md`
- **Architecture / ADR**: `docs/80-adrs/ADR-036-csv-player-import-strategy.md`
- **Architecture / SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Security / SEC Note**: `docs/30-security/SEC-NOTE-CSV-PLAYER-IMPORT.md`
- **Security / RLS**: `docs/30-security/SEC-001-rls-policy-matrix.md`
- **Schema / Types**: `types/database.types.ts`
- **Prior PRDs (vision-era)**: `docs/10-prd/PRD-PLAYER-CSV-IMPORT.md`, `docs/10-prd/PRD-PLAYER-CSV-IMPORT-ADDENDUM.md`
- **Prerequisite PRD**: `docs/10-prd/PRD-035-onboarding-bootstrap-auth-fixes-v0.md`

---

## Appendix A: Canonical Contract Reference

```typescript
// ImportPlayerV1 — canonical import payload (ADR-036 D2)
interface ImportPlayerV1 {
  contract_version: "v1";
  source: { vendor?: string; file_name?: string };
  row_ref: { row_number: number };
  identifiers: { email?: string; phone?: string; external_id?: string };
  profile: { first_name?: string; last_name?: string; dob?: string | null };
  notes?: string;
}
// Rule: at least one identifier must be present
```

---

## Appendix B: Implementation Plan (Workstreams)

### WS1: Database Schema & RPCs (P0)

- [ ] Register `PlayerImportService` in SRM
- [ ] Create enums: `import_batch_status`, `import_row_status`
- [ ] Create `import_batch` table with constraints
- [ ] Create `import_row` table with constraints
- [ ] Create RLS policies per SEC Note (casino-scoped, role-gated, actor-bound, delete-denied)
- [ ] Implement `rpc_import_create_batch` (SECURITY DEFINER)
- [ ] Implement `rpc_import_stage_rows` (SECURITY DEFINER)
- [ ] Implement `rpc_import_execute` (SECURITY DEFINER) with identifier resolution + conflict detection
- [ ] Regenerate types: `npm run db:types-local`

### WS2: Service Layer (P0)

- [ ] Create `services/player-import/` following standard pattern
- [ ] `dtos.ts`: `ImportPlayerV1`, `ImportBatchDTO`, `ImportRowDTO`, `ImportBatchReportV1`, `ColumnMapping`
- [ ] `schemas.ts`: Zod validation (`importPlayerV1Schema`, batch/row route params)
- [ ] `keys.ts`: React Query key factory (`playerImportKeys`)
- [ ] `mappers.ts`: DB row -> DTO transformations
- [ ] `crud.ts`: server-side operations
- [ ] `http.ts`: client-side HTTP fetchers with idempotency headers
- [ ] `index.ts`: service factory export

### WS3: API Routes (P0)

- [ ] `POST /api/v1/player-import/batches` — create batch
- [ ] `GET /api/v1/player-import/batches` — list batches
- [ ] `GET /api/v1/player-import/batches/:id` — get batch + report
- [ ] `POST /api/v1/player-import/batches/:id/rows` — stage rows
- [ ] `GET /api/v1/player-import/batches/:id/rows` — list rows
- [ ] `POST /api/v1/player-import/batches/:id/execute` — execute merge

### WS4: UI — Import Wizard (P1)

- [ ] File selection component (drag-and-drop, validation)
- [ ] Column mapping component (auto-detect + manual override)
- [ ] Preview summary component (counts, warnings, sample rows)
- [ ] Staging upload with progress bar and chunking
- [ ] Execute confirmation and progress
- [ ] Report display with outcome summary and per-row details
- [ ] Results CSV download with injection sanitization

### WS5: Testing (P1)

- [ ] Unit tests: `ImportPlayerV1` Zod schema, column mapping heuristics, CSV sanitization
- [ ] Integration tests: execute RPC outcomes (create, link, skip, conflict, error)
- [ ] RLS tests: casino isolation, role enforcement, actor binding, delete denial
- [ ] E2E test: happy path upload -> map -> stage -> execute -> report

---

## Appendix C: Error Codes

Per SRM Error Taxonomy:

**PlayerImport Domain**
- `IMPORT_BATCH_NOT_FOUND` (404) — Batch ID does not exist or is not visible to caller
- `IMPORT_BATCH_NOT_STAGING` (409) — Batch is not in `staging` status (cannot stage more rows or has already been executed)
- `IMPORT_BATCH_ALREADY_EXECUTING` (409) — Batch is currently executing
- `IMPORT_ROW_NO_IDENTIFIER` (422) — Row lacks any identifier (email or phone)
- `IMPORT_ROW_VALIDATION_FAILED` (422) — Row fails schema validation
- `IMPORT_IDEMPOTENCY_CONFLICT` (409) — Idempotency key already used for a different batch
- `IMPORT_SIZE_LIMIT_EXCEEDED` (413) — File or row count exceeds limits

---

## Appendix D: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-02-23 | Lead Architect | Initial draft from feature pipeline (Phase 5) |
| 0.2.0 | 2026-02-23 | Lead Architect | Review fixes: chunk size clarity (500 client / 2000 server), mapping persistence disambiguation, single write governance rule, search_path requirement, Papa Parse backpressure note, OWASP tab-prefix CSV injection, raw_row GA gate, enrollment-first indexing note, external_id staging clarification |
