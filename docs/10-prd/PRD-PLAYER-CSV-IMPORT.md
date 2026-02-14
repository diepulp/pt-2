---
title: "PRD: Player CSV Import for Onboarding Wizard"
doc_type: prd
product: "Casino Player Tracker (PT-2)"
version: "v0.1"
status: draft
owner: product
last_updated: 2026-02-12
---

# Player CSV Import for Onboarding Wizard

## Problem
New customers often have an existing player pool in a legacy system (spreadsheet/CRM/export). Without an import path, onboarding becomes slow, error-prone, and discourages early adoption because staff cannot quickly look up known patrons on day one.

At the same time, requiring CSV columns to perfectly match PT-2 domain models forces extensive service-layer work, schema churn, and brittle assumptions about the quality of upstream data.

## Goal
Add a **casino-scoped CSV upload** to the onboarding wizard that can **bootstrap the player database** safely and predictably—without requiring model expansion for every legacy column.

## Core Principle
**CSV import is assisted intake, not schema-perfect migration.**

We import what we can confidently map into `player` / `player_casino`, and preserve the remainder as **raw metadata** for later review.

---

# Scope

## In Scope (MVP)
1. Upload a CSV during onboarding (or immediately after onboarding in the same wizard flow).
2. Parse rows server-side with strict size/row limits.
3. Normalize/sanitize common fields (email, phone, names, dates, enums).
4. Map a small **Import Contract v1** into:
   - `player` (identity bootstrap)
   - `player_casino` (casino linkage)
5. Store unmapped fields as raw payload (metadata or staging table).
6. Upsert behavior based on strong identifiers (no fuzzy guessing).
7. Produce an **Import Report** (created/updated/skipped/conflicts + reasons).

## Out of Scope (Explicit Non-Goals)
- Full CRM migration fidelity
- Fuzzy matching / name similarity dedupe
- Loyalty points reconciliation and ledger backfills
- Address validation, USPS normalization, geocoding
- Automatic tier/benefits rules integration beyond simple mapping
- Multi-file import sessions, background job orchestration (unless needed for scale)

---

# Users & Use Cases

## Primary User
- Admin / onboarding operator (GM, Ops manager, or implementation lead)

## Key Use Cases
- Import a CSV export from a legacy player system to enable immediate player lookup.
- Prevent duplicates when a legacy system has repeated rows.
- Identify rows that need cleanup (missing identifiers, conflicts).

---

# UX / Flow

## Option B (Recommended): Upload → Preview Mapping → Import
1. **Upload CSV**
   - Drag/drop or file picker
   - Show file name + basic stats (rows detected)
2. **Column Detection & Preview**
   - Display detected headers and a preview of first N rows
3. **Mapping Step (Lightweight)**
   - Auto-map known headers using an alias dictionary
   - Allow user to select which CSV column maps to Import Contract fields
   - Unmapped columns shown as “will be preserved as raw metadata”
4. **Dry Run (Optional toggle; recommended)**
   - Validate + produce a preview report without writing to DB
5. **Import**
   - Perform transactional/batched upsert
6. **Import Report**
   - Summary counts + downloadable report (CSV/JSON)
   - “Conflicts / Needs Review” section with line references

## Option A (Fallback): Upload → Import
- Auto-map only; no UI mapping step.
- Still must produce an Import Report.
- Accepts higher support burden; more likely to fail on messy exports.

---

# Import Contract v1

## Required (At least one strong identifier)
Each row must contain **at least one** of:
- email
- phone
- external_id (legacy player id)
- loyalty_id (card/membership id)

Rows without any strong identifier are **skipped** (or optionally staged as “Needs Review”).

## Supported Fields (Contract)
- `full_name` OR (`first_name`, `last_name`)
- `email`
- `phone`
- `external_id` (legacy id)
- `loyalty_id` (card/membership id)
- `tier` (optional, strict mapping)
- `language` (optional)
- `notes` (optional)
- `dob` (optional, strict parsing; if ambiguous -> reject unless format specified)

## Header Alias Dictionary (Examples)
Auto-map common variants:
- email: `email`, `e-mail`, `email_address`
- phone: `phone`, `mobile`, `cell`, `phone_number`
- external_id: `player_id`, `customer_id`, `id`
- loyalty_id: `card`, `card_number`, `membership_id`, `loyalty_number`
- name: `name`, `full_name`, `first`, `first_name`, `last`, `last_name`
- tier: `tier`, `level`, `rank`
- dob: `dob`, `date_of_birth`, `birthdate`

---

# Sanitization & Validation Rules

## Canonicalization (Deterministic)
- Trim whitespace, collapse repeated spaces
- Emails → lowercase, basic format validation
- Phone:
  - Normalize to E.164 if possible (default country configurable per casino)
  - Otherwise digits-only + length check
- Dates:
  - Parse to ISO `YYYY-MM-DD`
  - Reject ambiguous formats unless user selects CSV date format in mapping step

## Enum Normalization
- Tier/status values mapped via explicit lookup table
- Unknown values:
  - either set to NULL / `unknown`
  - and recorded in Import Report as “unrecognized enum”

## Row-Level Validation Outcomes
- **ACCEPT**: has strong identifier + passes validations
- **SKIP**: missing strong identifier; or invalid critical fields (e.g., malformed email + no other identifier)
- **CONFLICT**: identifier collision with contradictory key data (e.g., email already exists with different external_id)

---

# Identity & Dedup Strategy (No Guessing)

## Strong Identifier Priority (Per Casino)
Upsert keys in priority order:
1. `external_id` (if supported/unique within casino scope)
2. `loyalty_id`
3. `email`
4. `phone`

## Rules
- Same strong identifier appears multiple times in CSV:
  - merge deterministically (last write wins) OR “first write wins” (choose one and document it)
- If identifier matches existing player but conflicts materially:
  - do not auto-merge
  - mark as **CONFLICT** and skip write (or stage)

## Explicit Non-Rule
- Do **not** dedupe by name similarity. No fuzzy matching in MVP.

---

# Data Mapping to PT-2 Models

## Minimal Writes (MVP)
- `player`:
  - normalized name/email/phone
  - optional dob, language
  - optional stable external identifiers (if supported)
- `player_casino`:
  - `casino_id`
  - `player_id`
  - optional tier/status
  - any casino-scoped fields that exist today and are safe to set

## Raw/Unmapped Fields Storage (Pick One)

### Preferred: Metadata JSON on `player` (or `player_casino`)
- Store:
  - original raw row payload (key-value)
  - unmapped columns
  - import provenance (import_id, row_number, timestamp)
- Pros: easy to keep data without schema changes
- Cons: requires a metadata JSONB column (if not already present)

### Alternative: `player_import_staging` table
- Store raw row + mapping outcome + reasons
- Pros: no changes to player model
- Cons: additional table + workflow for later review

**MVP must implement one of the above** to avoid service-layer expansion.

---

# Security, Multi-Tenancy, RLS Posture

## Casino Scope
- Import is always scoped to a single `casino_id`.
- Actor must be authorized (Admin/Setup role).

## RLS / Session Context
- Import must run with correct RLS context:
  - `app.casino_id` set (via existing `set_rls_context` approach)
  - policies ensure writes cannot escape casino scope

## File Handling
- Max file size (example): 10 MB
- Max rows (example): 25,000
- Reject non-CSV, reject formulas/malformed content
- Server-side parsing only (no trusting client parsing)

---

# Import Report (Non-Negotiable Output)

## Summary Metrics
- total_rows
- accepted_rows
- created_players
- updated_players
- created_player_casino_links
- skipped_rows
- conflict_rows

## Row-Level Details
For each skipped/conflict row:
- row_number (line)
- identifier(s) present
- reason code
- human-readable message
- (optional) original value that failed validation

## Delivery
- Display in UI immediately after import
- Provide downloadable report:
  - CSV (ops-friendly) and/or JSON (dev-friendly)

---

# Operational Semantics

## Transaction Strategy
- Use batching:
  - parse → validate → group operations
  - commit in batches (e.g., 500–2000 rows) to avoid timeouts
- Ensure idempotency by using upsert keys
- Track an `import_id` for provenance and troubleshooting

## “Dry Run” Mode (Recommended)
- Validate and generate report without DB writes
- Greatly reduces “why didn’t it work?” support churn

---

# Acceptance Criteria (MVP)

1. User can upload a CSV and see detected headers + sample preview.
2. System auto-maps common headers; user can override mapping for contract fields.
3. Import rejects rows with no strong identifier and reports them clearly.
4. Import upserts players and creates `player_casino` links within the selected casino scope.
5. Import never creates cross-casino writes (RLS enforced).
6. Import preserves unmapped columns as raw payload (metadata or staging).
7. Import report is shown in UI and downloadable.
8. Conflicts do not silently merge; they produce a conflict report entry.

---

# Risks & Mitigations

## Risk: Duplicate creation due to weak identifiers
- Mitigation: require at least one strong identifier; no fuzzy matching.

## Risk: Messy exports cause frequent failures
- Mitigation: mapping step + alias dictionary + dry run mode.

## Risk: Service layer bloat
- Mitigation: isolate logic behind a dedicated `PlayerImportService` with a small DTO (Import Contract v1).
  Do not force changes across core Player/Visit/Loyalty services.

## Risk: Performance/timeouts on large CSVs
- Mitigation: hard limits + batching; consider post-MVP background jobs only if needed.

---

# Implementation Notes (Dev-Facing, Non-Binding)

## Suggested Module Boundary
- `services/player-import/`
  - `parseCsv.ts`
  - `normalize.ts`
  - `validate.ts`
  - `map.ts`
  - `upsert.ts`
  - `report.ts`

## Suggested Public API
- `importCsv(casino_id, file, mapping, options)`
  - options: `{ dry_run?: boolean }`

---

# Future Enhancements (Post-MVP)
- “Needs Review” queue for staged rows
- Fuzzy matching assist UI (suggestions only, never auto-merge)
- Import history screen (import_id audit)
- Multi-format support (XLSX)
- Loyalty/tier reconciliation workflows (separate domain feature)
