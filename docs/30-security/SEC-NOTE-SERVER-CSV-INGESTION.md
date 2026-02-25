# SEC Note: Server-Authoritative CSV Ingestion Worker

**Feature:** server-csv-ingestion (RFC-SCI)
**Date:** 2026-02-24
**Author:** Lead Architect
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| `import_row.normalized_payload` (player PII: names, DOB, email, phone, ID numbers) | PII | CSV imports contain player identity data; breach exposes patron identity |
| `import_row.raw_row` (original CSV row) | PII | Unprocessed CSV may contain arbitrary PII columns beyond mapped fields |
| `import_batch` (batch metadata, casino_id, storage_path) | Operational | Controls which casino owns the import; corruption = cross-casino data leakage |
| Supabase Storage CSV files (`imports/{casino_id}/{batch_id}/{upload_id}.csv`) | PII | Raw uploaded files contain full player data; files persist beyond processing |
| `service_role` credentials (worker database access) | Infrastructure | Full RLS bypass; compromise = unrestricted read/write across all casinos |
| `import_batch.created_by_staff_id` (audit attribution) | Audit | Non-repudiation for who initiated each import |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino data leakage via worker | High | Medium | P1 |
| T2: Storage path traversal / file injection | High | Low | P1 |
| T3: service_role credential compromise | High | Low | P1 |
| T4: Batch hijacking (claiming another casino's batch) | High | Low | P1 |
| T5: CSV injection / malicious payload in cell values | Medium | Medium | P2 |
| T6: Denial of service via oversized file upload | Medium | Medium | P2 |
| T7: Orphaned PII in Storage (files never cleaned up) | Medium | Low | P3 |
| T8: Audit trail spoofing (forging created_by_staff_id) | Medium | Low | P2 |
| T9: Worker writes to tables outside its boundary | High | Low | P1 |

### Threat Details

**T1: Cross-casino data leakage via worker**
- **Description:** Worker processes batch for casino A but inserts rows with casino B's `casino_id`, or reads data from casino B during processing.
- **Attack vector:** Bug in worker code that derives `casino_id` from CSV content or external input instead of the claimed batch row. Since worker uses `service_role` (full RLS bypass), no policy stops the write.
- **Impact:** Privacy violation, regulatory breach, data corruption across casino boundaries.

**T2: Storage path traversal / file injection**
- **Description:** Attacker crafts a file name that, when used in the storage path, traverses directories or overwrites existing files.
- **Attack vector:** Upload endpoint uses raw user-provided `file_name` in the storage key: `../../../other-casino/batch/file.csv`.
- **Impact:** File overwrite, cross-casino file access, arbitrary file injection into storage.

**T3: service_role credential compromise**
- **Description:** Worker's `service_role` key is leaked (env var exposure, log leak, dependency compromise).
- **Attack vector:** Supply chain attack on worker dependencies, misconfigured logging that includes connection strings, exposed Railway env vars.
- **Impact:** Full database access across all casinos — read, write, delete. Equivalent to database root.

**T4: Batch hijacking**
- **Description:** Attacker creates or modifies a batch to point to a different casino's storage file, causing the worker to ingest data under the wrong casino context.
- **Attack vector:** Spoofed `casino_id` on batch creation (bypassing RLS on client route), or direct database manipulation.
- **Impact:** Player data ingested under wrong casino; cross-casino contamination.

**T5: CSV injection / malicious payload**
- **Description:** CSV cells contain formulas (`=CMD()`), SQL fragments, or oversized strings that exploit downstream systems.
- **Attack vector:** Malicious CSV uploaded by authorized staff (insider threat) or compromised admin account.
- **Impact:** XSS if cell values rendered unsanitized in UI, potential application-level injection.

**T6: Denial of service via oversized file**
- **Description:** Staff uploads a multi-GB file that exhausts worker memory, storage quota, or processing time.
- **Attack vector:** Legitimate endpoint, excessively large file.
- **Impact:** Worker OOM crash, storage quota exhaustion, blocking other batch processing.

**T7: Orphaned PII in Storage**
- **Description:** CSV files persist indefinitely in Supabase Storage after processing, accumulating patron PII with no retention limit.
- **Attack vector:** Not an active attack — passive risk from data accumulation. Storage breach or misconfiguration exposes historical PII.
- **Impact:** PII exposure at scale; data minimization violation; potential regulatory non-compliance (GDPR, state privacy laws).

**T8: Audit trail spoofing**
- **Description:** Attacker forges `created_by_staff_id` on a batch to attribute the import to a different staff member.
- **Attack vector:** Provide a different `staff_id` in the batch creation request body, hoping the API route uses the provided value instead of deriving from auth context.
- **Impact:** Audit trail corruption; non-repudiation failure; inability to trace who initiated a bad import.

**T9: Worker writes outside its boundary**
- **Description:** A code change inadvertently adds queries against `player`, `visit`, `audit_log`, or other truth tables.
- **Attack vector:** Developer error during feature additions to the worker codebase.
- **Impact:** Worker becomes an uncontrolled write surface for tables it has no ownership over (SRM violation).

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | INV-W3 + INV-W5: casino_id from batch row only | Repository module requires `casino_id` from claimed batch; integration test with 2 casinos |
| T1 | INV-W1: scoped batch updates | All `UPDATE import_batch` include `WHERE id = $batch_id` |
| T2 | Storage key hygiene | Upload endpoint generates `{upload_id}.csv` key; never uses raw file name in path |
| T3 | Credential isolation | service_role key in Railway encrypted env vars; not in code, logs, or client bundles |
| T3 | Minimal dependency surface | Worker has minimal npm dependencies; no client-side framework code |
| T4 | RLS on batch creation + input rejection | Batch `casino_id` derived from staff JWT via `set_rls_context_from_staff()` (ADR-024); worker reads it, never sets it. Batch create/update routes **ignore any `casino_id` in the request body**; they derive `casino_id` exclusively from auth context and/or DB session vars. |
| T4 | INV-W6: claim only `uploaded` status | Worker CTE claim restricted to `WHERE status = 'uploaded'` |
| T5 | Zod schema validation | Every row validated against `importPlayerV1Schema`; unexpected fields stripped; values type-coerced or rejected |
| T5 | Output encoding (UI) | UI renders cell values as text, never as HTML/formula; existing sanitization in React components |
| T5 | Export-side escaping | If exporting staged rows or reports to CSV/Excel, cells starting with `=`, `+`, `-`, `@` must be prefixed with `'` (Excel-safe) or otherwise escaped to prevent formula injection |
| T6 | 10k row hard cap | Worker stops stream at row 10,001; batch transitions to `failed` with `BATCH_ROW_LIMIT` |
| T6 | Upload size limit | API route enforces max file size (configurable; MVP: 10MB) before writing to Storage |
| T7 | Storage retention policy | Deferred — see Deferred Risks |
| T8 | Authoritative context (ADR-024) | `created_by_staff_id` set via `set_rls_context_from_staff()` at batch creation; worker never modifies it |
| T9 | INV-W4: table allowlist (repo module + CI denylist) | All DB access goes through a repo module that exposes only allowed operations on `import_batch` + `import_row`. CI includes a denylist grep: queries referencing `from('player')`, `from('visit')`, `UPDATE player`, etc. inside `workers/csv-ingestion/**` fail the build. |

### Control Details

**C1: SQL Safety Invariants INV-W1 through INV-W6**
- **Type:** Preventive
- **Location:** Application (worker repository module)
- **Enforcement:** All DB access channeled through a single repo module (`ImportBatchRepo`) that only exposes operations on `import_batch` + `import_row`. No raw query construction outside the repo module.
- **Tested by:** `ingest.integration.test.ts` (2-casino cross-contamination test); CI denylist grep fails build if `workers/csv-ingestion/**` references forbidden tables (`player`, `visit`, `audit_log`, etc.); "no naked query" lint rule for UPDATE/DELETE without WHERE

**C2: Storage Key Hygiene**
- **Type:** Preventive
- **Location:** API upload endpoint
- **Enforcement:** Application code — `{upload_id}.csv` generated server-side; `original_file_name` stored separately for display
- **Tested by:** Unit test: upload with path-traversal file name produces safe storage key

**C3: RLS on Client-Facing Routes (unchanged)**
- **Type:** Preventive
- **Location:** Database (RLS policies on `import_batch`, `import_row`)
- **Enforcement:** Database — existing policies from PRD-037
- **Tested by:** Existing RLS test suite; no new policies needed

**C4: Batch Creation Context Derivation**
- **Type:** Preventive
- **Location:** API route handler + database RPC
- **Enforcement:** ADR-024 — `casino_id` derived from JWT, not from request body. Batch create/update routes **ignore any `casino_id` provided in the request body**; context comes exclusively from `set_rls_context_from_staff()` return value or DB session vars.
- **Tested by:** Existing ADR-024 compliance tests + unit test: batch creation with spoofed `casino_id` in body uses auth-derived value instead

**C5: Row Cap Enforcement**
- **Type:** Preventive
- **Location:** Worker parsing loop
- **Enforcement:** Application code — hard `BATCH_ROW_LIMIT` check per row
- **Tested by:** `ingest.integration.test.ts` (10,001-row CSV test)

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Storage file retention / cleanup | No business requirement for automatic deletion yet; files are inert after processing | Before production rollout with real patron PII, before any external/untrusted CSV sources, or if storage costs become material |
| CSV virus/malware scanning | Supabase Storage provides basic validation; full scanning requires external service | Before handling CSVs from untrusted external sources (currently admin-only upload) |
| Worker audit_log writes | Worker is a system process, not a user action; audit_log is for user-initiated actions | If compliance requires system-action audit trail |
| Ingestion lineage post-execute | `report_summary` overwritten by execute; ingestion report lost | Before compliance requires post-execute ingestion debugging |
| service_role key rotation | Railway doesn't natively support key rotation; manual process required | Before SOC2 or equivalent compliance engagement |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| `import_row.normalized_payload` (player PII) | Plaintext JSONB | Required for execute processing; RLS-protected per casino; cleared by batch deletion |
| `import_row.raw_row` (original CSV data) | Plaintext JSONB | Required for debugging and re-mapping; same RLS as normalized_payload |
| `import_batch.storage_path` | Plaintext (path reference) | Not PII itself; points to file in Storage which is separately secured |
| `import_batch.created_by_staff_id` | UUID (foreign key) | Audit attribution; not sensitive on its own |
| CSV files in Supabase Storage | Plaintext (raw CSV) | Required for worker streaming. Client has no direct browse/list access; all access is through the API route. Storage object keys are casino-scoped by construction (`imports/{casino_id}/{batch_id}/...`). Worker reads with `service_role`; security relies on app invariants (INV-W5), not Storage RLS. Files persist indefinitely (see Deferred Risks). |
| `import_batch.claimed_by` (worker identity) | Plaintext | Operational metadata (hostname:pid); not sensitive |

---

## RLS Summary

### import_batch (existing + unchanged)

| Operation | Roles | Notes |
|-----------|-------|-------|
| SELECT | admin, pit_boss (same casino) | Pattern C hybrid — `casino_id` scoped |
| INSERT | admin, pit_boss (same casino) | Via API route; `casino_id` from ADR-024 context |
| UPDATE | admin, pit_boss (same casino) | Status transitions via API; **worker bypasses RLS via service_role** |
| DELETE | Denied | No delete policy |

### import_row (existing + unchanged)

| Operation | Roles | Notes |
|-----------|-------|-------|
| SELECT | admin, pit_boss (same casino) | Pattern C hybrid — `casino_id` scoped |
| INSERT | admin, pit_boss (same casino) | Via RPC (client flow); **worker bypasses RLS via service_role** |
| UPDATE | None (via RPC only) | `rpc_import_execute` uses SECURITY DEFINER |
| DELETE | Denied | No delete policy |

**Future control — PII purge:** DELETE is currently denied for both `import_batch` and `import_row`. For data minimization (test uploads, mistakes, GDPR-style deletion), introduce an admin-only purge RPC that deletes a batch + its rows + associated Storage object(s) with strict `casino_id` scoping and audit logging. This is not required for MVP but should be built before handling real patron PII at scale.

### Worker RLS Bypass Justification

The worker operates with `service_role` (full RLS bypass). This is deliberate and documented:
- Worker has no JWT/session — cannot participate in RLS context injection
- Security is enforced by SQL safety invariants INV-W1 through INV-W6 at the application layer
- Worker write surface is limited to `import_batch` + `import_row` (INV-W4)
- `casino_id` is always derived from the claimed batch row, never from external input (INV-W5)
- Integration tests verify cross-casino isolation with 2-casino test fixtures

### Supabase Storage

Client has no direct Storage access. All reads/writes go through the API route or the worker.

| Operation | Access | Notes |
|-----------|--------|-------|
| Upload (write) | API route (server-side only) | Client uploads via API endpoint, not directly to Storage |
| Download (read) | Worker via `service_role` | Worker code is implemented read-only for the `imports` bucket (signed URL stream). `service_role` itself is not read-only — that is an app-level discipline, not a storage policy. |
| Delete | Not implemented (MVP) | Deferred; files persist |
| List/Browse | No client access | Client cannot browse or list Storage objects; no direct client-to-Storage path exists |

**Storage security posture:** Storage object keys are casino-scoped by path construction (`imports/{casino_id}/{batch_id}/...`). Security does not depend on `storage.objects` RLS policies — it depends on the API route enforcing upload authorization (ADR-024) and the worker only reading the path from the claimed batch row (INV-W5). If Supabase Storage bucket policies are configured, they provide defense-in-depth but are not the primary control.

---

## Validation Gate

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] Sensitive fields have storage justification
- [x] RLS covers all CRUD operations (including worker bypass justification)
- [x] No plaintext storage of secrets (service_role in encrypted env vars)
- [x] Worker bypass of RLS has documented invariant enforcement (INV-W1–W6)
- [x] Storage key hygiene prevents path traversal
- [x] Cross-casino isolation testable via integration tests
