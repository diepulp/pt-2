---
title: MVP Lane 1 — CSV Seeding via Browser Parsing + Canonical Import Contract
project: PT-2 Casino Player Tracker
doc_type: implementation_plan
version: 1.0.0
date: 2026-02-20
status: draft_for_build
owner: onboarding
---

# MVP Lane 1 — CSV Seeding via Browser Parsing + Canonical Import Contract

## Why this plan exists

We need the onboarding flow to **seed/upsert the player pool from vendor CSV**, while avoiding the trap of writing a CSV parser from scratch.

This plan adopts a **two-step import design**:

1) **Client parses CSV bytes into rows** using a proven library (no bespoke parser).  
2) **Server/DB enforces truth**: casino scoping, identifier uniqueness, conflicts, idempotency, and all production writes via constrained RPCs.

CSV parsing location (browser) does **not** replace database enforcement. RLS remains “defense in depth” at the database layer.  
Supabase documents RLS as a Postgres primitive that protects data even when accessed through other tooling. citeturn0search1

---

## Core decision: Browser-side parsing (Lane 1)

### Rationale (PT-2 fit)
- Avoids building a file-upload + storage pipeline in MVP.
- Keeps writes flowing through the user’s authenticated context and the existing RLS + RPC posture.
- Leverages a widely used, browser-optimized CSV parser that supports workers and streaming/step callbacks for large files. 

### Chosen parser
**Papa Parse** (browser): multi-threaded (Web Workers), streaming results via `step`, handles malformed CSV with error reporting.   
Reference implementation/feature set is also summarized in the project’s GitHub repo. 

---

# Architecture overview

## Flow (end-to-end)

1. **Onboarding → Import Players step**
2. User selects CSV file
3. Browser parses CSV → emits row objects
4. Browser runs a **light mapping layer**: vendor columns → canonical import contract (`ImportPlayerV1`)
5. Browser sends mapped rows to backend in **chunks** (e.g., 500–2000 rows)
6. Backend uses **staging tables** (`import_batch`, `import_row`) and stores:
   - raw row (optional, subject to later redaction)
   - normalized payload (canonical contract)
   - per-row validation outcome
7. User reviews summary (counts + top errors)
8. User clicks **Execute**
9. DB RPC performs:
   - identifier resolution (casino-scoped)
   - conflict detection
   - idempotent upsert/link into production tables
10. UI shows final report + downloadable results CSV

---

# Data contracts

## Canonical payload: `ImportPlayerV1`

**Goal:** a stable “internal language” so vendor CSV shapes can vary without rewriting DB logic.

Minimum recommended fields (MVP):
- `contract_version: "v1"`
- `source: { vendor?: string, file_name?: string }`
- `row_ref: { row_number: number }`
- `identifiers: { email?: string, phone?: string, external_id?: string }`
- `profile: { first_name?: string, last_name?: string, dob?: string | null }`
- `notes?: string`

**Key rule:** *Everything can be optional, but at least one identifier should exist for deterministic upsert.* Rows without identifiers can be rejected early (configurable).

## CSV mapping
The mapping layer exists to handle unknown vendor headers:
- Detect/normalize headers (trim/casefold)
- Provide a “map columns” UI (MVP: dropdown per canonical field)
- Persist mapping for the casino/vendor for reuse

> Mapping is the MVP’s “unknown vendor schema” hedge. It prevents hard-coding a single CSV template while still keeping the backend deterministic.

---

# Parsing and validation details (client)

## Papa Parse configuration (recommended defaults)
- `header: true` (use header row)
- `skipEmptyLines: true` citeturn0search3
- `worker: true` (avoid UI lock) citeturn0search3turn0search21
- `step` callback for streaming rows (prevents memory blow-ups on big files) citeturn0search3
- `dynamicTyping: false` (treat everything as string; domain normalization happens explicitly) citeturn0search3

Papa Parse’s parse config is documented as a configuration object controlling settings, behavior, and callbacks. citeturn0search0

## Client-side validation (MVP)
**Client validation is advisory** (fast feedback), not authoritative.

- Ensure file has a header row
- Ensure required mapping is completed (user must map at least one identifier field)
- Normalize strings:
  - trim whitespace
  - email → lowercase
  - phone → strip spaces/punct; optional E.164 normalization later
- Enforce hard caps:
  - max rows per import (config)
  - max file size (config)

---

# Security posture (PT-2 aligned)

## Non-negotiables
- Production writes happen **only through DB RPCs** that enforce casino scope, idempotency, and conflict rules.
- RLS stays enabled and policies remain the enforcement boundary. Supabase emphasizes enabling RLS to prevent unintended access through the API. citeturn0search4turn0search1

## Why browser parsing is safe enough
Parsing is untrusted pre-processing. The DB still validates and enforces:
- tenant scoping
- uniqueness constraints
- conflict rules
- idempotency
- audit logging

---

# Implementation plan (what needs to be built)

## Workstream A — UI: Onboarding import step (MVP)
- [ ] “Upload CSV” component
- [ ] Parse progress + row count
- [ ] Mapping UI:
  - show detected headers
  - dropdown map to canonical fields
  - require at least one identifier mapping
  - save mapping preset (per casino + optional vendor label)
- [ ] Preview summary:
  - total rows
  - rows missing identifiers
  - parse errors

## Workstream B — Client parsing + chunking
- [ ] Integrate Papa Parse and recommended config (worker + step + skipEmptyLines) 
- [ ] Normalize + build `ImportPlayerV1` for each row
- [ ] Chunk rows and POST to staging endpoint (or call staging RPC directly)
- [ ] Retry strategy:
  - retry chunk upload on transient errors
  - abort + report on persistent failures

## Workstream C — Staging API + tables (MVP)
- [ ] `import_batch`:
  - `id`, `casino_id`, `created_by_staff_id`, `idempotency_key`, `status`, `report_summary`, timestamps
  - unique `(casino_id, idempotency_key)`
- [ ] `import_row`:
  - `batch_id`, `row_number`, `raw_row` (optional), `normalized_payload`, `status`, `reason_code`, timestamps
- [ ] Optional payload redaction policy (post-MVP):
  - redact `raw_row` / `normalized_payload` after N days while retaining audit skeleton

## Workstream D — Execute RPC (authoritative merge)
- [ ] `rpc_import_players_execute(batch_id)`:
  - casino-scoped identifier resolution
  - deterministic conflict handling (multi-player match ⇒ conflict, no writes)
  - insert/link into production tables
  - compute `ImportBatchReportV1` from `import_row` outcomes
  - set batch status `completed|failed`
- [ ] Make report re-playable: if `completed`, return cached/stable report.

## Workstream E — Reporting
- [ ] Results summary in UI (counts + top errors)
- [ ] Downloadable “results CSV”:
  - row_number, outcome, reason_code, created_player_id (if any)
- [ ] Spreadsheet safety on export (prefix formula-leading characters) *(recommended)*

---

# Acceptance criteria (Definition of Done)

## Functional
- Upload + parse works for typical vendor CSVs with unknown headers (user can map).
- Import can be run end-to-end in onboarding:
  - stage rows
  - execute merge
  - view report
- Re-running the same import with the same idempotency key returns the same completed report (no duplicates).

## Security
- No direct client writes to production tables; production writes only via RPC.
- RLS remains enabled for relevant tables, consistent with Supabase’s guidance to avoid unintended public access. citeturn0search4turn0search1

## Performance
- UI remains responsive during parsing (worker enabled). citeturn0search21turn0search3
- Chunked upload succeeds reliably for thousands of rows.

---

# Out of scope (explicitly deferred)
- Advanced vendor schema inference (“auto-map everything”)
- Multi-file imports and background processing queues
- Cross-casino identity linking (MVP assumes strict tenant isolation)
- Merge tools for resolving identity conflicts beyond reporting

---

# Notes / references
- Papa Parse configuration and streaming/worker capabilities: 
- Papa Parse project description and features: citeturn0search2
- Supabase RLS guidance and security posture: citeturn0search1turn0search4
