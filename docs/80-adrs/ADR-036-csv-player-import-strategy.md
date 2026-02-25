# ADR-036: CSV Player Import Strategy (Parsing, Mapping, Staging, Merge)

**Status:** Accepted (D1 partially superseded by ADR-037 — browser parsing demoted from authoritative to advisory/preview; D2 preserved)
**Date:** 2026-02-23
**Deciders:** Lead Architect
**Consulted:** Security, Backend Engineering
**Informed:** Frontend, Operations

## Context

Casino properties onboarding onto PT-2 need to seed their player pool from vendor-provided CSV exports. Vendor schemas are unknown and variable (headers differ, columns are optional, formatting is messy). We need an import pipeline that accepts these unknown shapes, normalizes them to a canonical contract, and executes an auditable, idempotent, casino-scoped merge under RLS.

### Problem Statement

We need an import pipeline that accepts unknown vendor CSV shapes, produces a canonical payload for merge, and executes an auditable, idempotent, casino-scoped upsert — without writing a CSV parser from scratch and without weakening the RLS security posture.

### Decision Drivers (ranked)

1. Correctness under RLS / multi-tenant boundaries
2. Operator UX for unknown vendor schemas (mapping, validation, corrections)
3. Engineering complexity / time-to-MVP
4. Performance for realistic file sizes (up to 10,000 rows)
5. Operational footprint (file upload infra, storage, scanning, timeouts)
6. Exit ramp: ability to switch approaches without rewriting backend merge rules

## Decisions

### D1: Parsing strategy (Lane 1 → Lane 2 evolution)

#### Lane 1 (original MVP): Browser-side parsing with Papa Parse

**Options considered:**
- A. Browser parsing with Papa Parse + mapping UI
- B. Embedded SaaS importer (Flatfile / OneSchema)
- C. Server-side parsing with Node streaming library

**Decision:** Option A — Browser-side parsing with Papa Parse.

**Rationale:**
- Lowest infrastructure cost for MVP (no file upload pipeline, no storage, no virus scanning)
- Papa Parse provides Web Worker support and streaming via `step` callback — handles large files without blocking UI
- Parsing is explicitly untrusted pre-processing; the database remains authoritative for all correctness
- Clean exit ramp: `ImportPlayerV1` canonical contract isolates parsing from merge logic; can swap to Option B/C later without backend changes

**Configuration:** `header: true`, `skipEmptyLines: true`, `worker: true`, `step` callback for streaming, `dynamicTyping: false`.

> **Backpressure note:** With `worker: true`, Papa Parse does **not** support `parser.pause()` / `parser.resume()` (only `abort()` is always available). Chunk uploads must be decoupled from parsing (queue rows locally and upload asynchronously), or run without a worker if pause/resume is required.

#### Lane 2 (supersedes Lane 1 for ingestion): Server-side worker with csv-parse

**Decision:** ADR-037 exercises the Lane 1 exit ramp. Browser-side Papa Parse is **demoted from authoritative ingestion to advisory preview only**. A standalone Node.js worker using `csv-parse` (streaming) is now the authoritative ingestion pathway.

**Why the exit ramp was exercised:**
- Client-as-authority trust boundary violation (browser memory, network flakiness, durability)
- Vercel timeout wall (10-300s) prevents reliable server-side fallback
- Loyalty & Tier Reconciliation pipeline (paused) requires server-staged data as its input

**What stays from Lane 1:**
- Papa Parse remains for client-side preview + header extraction (first 50 rows)
- `ImportPlayerV1` canonical contract (D2) is unchanged — the stable interface boundary
- Column mapping UI is unchanged

**What changes:**
- Staging pathway: client uploads raw CSV to Supabase Storage; worker streams, parses, normalizes, and bulk-inserts into `import_row`
- Worker is the source of truth for validation and normalization; preview is advisory
- Batch status machine extended with `created`, `uploaded`, `parsing` states

**Full details:** See ADR-037 (Server-Authoritative CSV Ingestion Worker).

### D2: Canonical import contract (`ImportPlayerV1`) as stable interface boundary

**Decision:** All vendor CSV shapes are normalized to `ImportPlayerV1` before reaching the backend. The backend does not ingest raw CSV **bytes**; it receives structured rows (header->value maps) produced by the client parser and mapped into the canonical contract.

```
ImportPlayerV1 {
  contract_version: "v1"
  source: { vendor?, file_name? }
  row_ref: { row_number }
  identifiers: { email?, phone?, external_id? }
  profile: { first_name?, last_name?, dob? }
  notes?
}
```

**Key rule:** At least one identifier must be present. Rows without identifiers are rejected at staging time.

**Rationale:** Decouples vendor schema variability from merge logic. Backend/DB only handles the canonical contract. Versioning (`contract_version`) enables future schema evolution without breaking existing imports.

### D3: New bounded context — PlayerImportService

**Decision:** Create a new bounded context `PlayerImportService` owning `import_batch` and `import_row` staging tables. Production writes to `player` and `player_casino` happen via a SECURITY DEFINER execute RPC.

**Rationale:**
- Import lifecycle (staging, validation, execution, reporting) is a separate concern from ongoing player identity management (PlayerService) or casino configuration (CasinoService)
- Staging tables are transient operational data, not part of the player identity model
- Cross-context writes to production tables are constrained to a single RPC entry point with full casino scoping

> **SECURITY DEFINER guardrails (ADR-018 + ADR-024 + ADR-030):**
> - SECURITY DEFINER functions must be schema-qualified and set `search_path` explicitly (ideally `pg_catalog` + target schema only) to prevent object shadowing / search_path abuse.
> - `rpc_import_execute` derives casino scope from trusted context (`set_rls_context_from_staff()` return value / DB session vars), **never** from function parameters. The invoking staff's `casino_id` is authoritative.
> - `rpc_import_execute` runs as SECURITY DEFINER (bypasses caller's RLS) but enforces casino scoping explicitly in every query via `WHERE casino_id = $derived_casino_id`. RLS remains enabled on the underlying tables as defense-in-depth for any non-RPC access paths, but the RPC itself does not rely on RLS for correctness — it enforces scoping in the function body.

> **Matrix-first prerequisite:** SRM registration/ownership must land **before** schema changes; all schema additions for import staging/execute must mirror SRM to avoid matrix<->schema drift.

### D4: Staging tables + execute RPC (two-step import)

**Decision:** Import follows a two-step design:
1. **Stage:** Client uploads normalized rows to `import_row` via `rpc_import_stage_rows` in chunks
2. **Execute:** Client triggers `rpc_import_execute` which performs casino-scoped merge atomically

**Rationale:**
- Staging allows preview/validation before production writes
- Execute RPC is the single write path to production tables — enforces all business rules (casino scoping, dedup, conflict detection, idempotency)
- Batch status machine (`staging` -> `executing` -> `completed`/`failed`) prevents double-execution

### D5: Identifier resolution — exact email/phone match (MVP)

**Decision:** During execute, rows are matched to existing players by exact email or phone within the same casino scope. External ID matching via `player_identity` is deferred.

**Match rules:**
- 0 matches: create new `player` + `player_casino` enrollment
- 1 match: link to existing player. **MVP policy:** create missing `player_casino` enrollment if absent; do **not** overwrite existing player profile fields (name, DOB, etc.) unless the existing value is null/empty. This prevents silent data loss from vendor CSV overwrites. Post-MVP may add configurable update strategies (overwrite, merge, skip).
- N matches: mark as conflict — no production writes for this row

**Rationale:** Exact matching is deterministic and verifiable. Fuzzy matching introduces false positives that are harder to undo than to add later. External ID matching requires `player_identity` table maturity (ADR-022).

> **Identifier table naming:** The canonical identifier table is `player_identity` (per ADR-022 v7.1). Any references to `player_identifier` are legacy; `player_identity` is the standard going forward.

> **Scope definition:** "Casino-scoped match" means identifier resolution queries only consider players enrolled at the importing casino (via `player_casino.casino_id`), rather than searching global players and then filtering by enrollment. Constraints and indexes must align with this enrollment-first scoping.

> **Indexing note:** Enrollment-first scoping requires indexed joins on `player_casino(casino_id, player_id)` and identifier lookups on `player(email)`, `player(phone)` (MVP), with future extension to `player_identity(player_id, type, value)` post-ADR-022.

### D6: Conflict handling — reject (no silent writes)

**Decision:** When a single import row resolves to multiple existing players, the row is marked `conflict` with no production writes. Conflicts are reported in the batch report for manual resolution.

**Rationale:** Silent conflict resolution risks data corruption. Reporting conflicts lets operators make informed decisions. A merge/resolution tool can be added post-MVP.

### D7: Loyalty tier/points exclusion by design

**Decision:** The `ImportPlayerV1` contract has NO loyalty fields. Vendor CSV tier/points data may exist in `raw_row` but is never written to `loyalty_ledger` or `player_loyalty`. Loyalty reconciliation is a separate PRD.

> **`raw_row` definition:** `raw_row` refers to the raw *parsed row object* (header->value map) captured for audit/debug, not the original CSV bytes.

> **Privacy footnote:** Because `raw_row` stores whatever vendors include (potentially tier/points, addresses, SSN fragments, notes), payload redaction is not merely "nice to have" — a redaction policy with a defined deadline must be specified before general availability, even if not implemented on day 1.
>
> **Retention posture:** Staged `raw_row` data must be purged on a fixed schedule (e.g., 30/60/90 days post-execute) before GA. MVP may retain indefinitely in dev/staging environments only. Before production rollout with real patron PII, the purge mechanism (admin-initiated or automated) and retention window must be defined. Without a time-bound commitment, "deferred" becomes "never."

**Rationale:** Import must not become the loyalty source of truth. LoyaltyService owns the ledger (SRM). Tier reconciliation requires upgrade-only policy, approval workflows, and ledger audit trail — all out of scope for import.

### D8: Idempotency via batch-level key

**Decision:** `UNIQUE(casino_id, idempotency_key)` on `import_batch`. Re-submitting the same idempotency key returns the existing batch (no duplicate staging or execution).

**Rationale:** Consistent with PT-2 Edge Transport Policy idempotency pattern. Prevents accidental double-imports from retry logic or user confusion.

## Consequences

### Positive
- MVP ships with minimal infrastructure (no file upload pipeline)
- Security posture preserved — RLS remains enabled as defense-in-depth; SECURITY DEFINER RPCs enforce tenant scope explicitly
- Canonical contract enables future parsing mechanism swaps without backend changes
- Deterministic conflict handling prevents silent data corruption
- Loyalty boundary explicitly protected

### Negative / Tradeoffs
- Browser parsing has client performance variability on weak machines (mitigated by Web Worker)
- Column mapping UI requires custom development (not free like an embedded importer)
- External ID matching deferred — imports can't leverage `player_identity.external_id` until that table is mature
- No fuzzy matching — legitimate near-duplicates will be missed

### Decision Outcomes (quick scan)

- ~~MVP ingestion = Lane 1 (Papa Parse + internal mapping)~~ → **Current: Lane 2 (server-side worker with csv-parse; Papa Parse is preview-only)** — see ADR-037
- Canonical boundary = `ImportPlayerV1` (unchanged across lanes)
- Merge authority = stage -> execute RPC with deterministic conflicts + idempotency
- Loyalty/tier fields = staged-only; reconciliation is separate workflow (no entitlement mutation during import)

### Follow-ups
- SRM v4.15.0: Register `PlayerImportService` bounded context
- Implement staging tables + 3 SECURITY DEFINER RPCs
- Implement `ImportPlayerV1` Zod schema and column mapping auto-detect
- Define spreadsheet-safe export rules (CSV injection protection)
- Post-MVP: mapping preset persistence, external ID matching, staging data cleanup

## Scope Boundaries (explicit)

**Included:**
- Staging (`import_batch`, `import_row`) + execute RPC merge
- Row-level outcomes + report export
- Deterministic conflict rules + idempotency
- CSV injection protection on exports

**Excluded (for this ADR):**
- Loyalty tier reconciliation (separate PRD)
- Fuzzy matching / identity merge tools
- ~~Server-side file parsing~~ — Now included via Lane 2 (ADR-037). Server-side worker ingestion with `csv-parse` is the authoritative parsing pathway. Browser-side parsing remains for preview only.

## Links

- Feature Boundary: `docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md`
- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-CSV-PLAYER-IMPORT.md`
- Design Brief: `docs/02-design/RFC-CSV-PLAYER-IMPORT.md`
- SEC Note: `docs/30-security/SEC-NOTE-CSV-PLAYER-IMPORT.md`
- PRD: `docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md`
- ADR-018: SECURITY DEFINER governance
- ADR-022: Player identity enrollment
- ADR-024: Authoritative context derivation
- ADR-030: Auth pipeline hardening (write-path session-var enforcement)
- ADR-037: Server-Authoritative CSV Ingestion Worker (Lane 2 — supersedes D1 for ingestion)
