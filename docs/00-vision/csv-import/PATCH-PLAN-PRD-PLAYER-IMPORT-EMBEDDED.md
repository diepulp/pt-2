---
title: Patch Plan — Refactor PRD-PLAYER-CSV-IMPORT for Embedded Importer
source_doc: PRD-PLAYER-CSV-IMPORT.md
target_doc_name: PRD-PLAYER-IMPORT-EMBEDDED.md
version: 1.0.0
date: 2026-02-22
status: patch_plan
---

# Patch Plan — Refactor `PRD-PLAYER-CSV-IMPORT.md` for Embedded Importer

## Purpose

You are adopting a **third-party embedded importer** (e.g., Flatfile / OneSchema) to eliminate custom CSV parsing + mapping UX. This patch plan updates the PRD so it remains the **canonical governance + backend merge rules spec**, while outsourcing:

- CSV parsing
- header detection
- column mapping UI
- row correction UX
- basic validation UX

**Key invariant:** the importer is *data-prep*, not the source of truth. Your DB/RPC remains authoritative for tenant scope, uniqueness, conflicts, idempotency, and audit.

---

# 1) Rename + re-scope

## Replace
- Title: “Player CSV Import”
- Emphasis: “we parse CSV”

## With
- Title: **Player Import (Embedded Importer)**
- Emphasis: “Importer prepares clean rows; PT-2 enforces truth.”

Suggested new filename:
- `PRD-PLAYER-IMPORT-EMBEDDED.md`

---

# 2) Update assumptions (top of doc)

## Delete / de-emphasize
- Any language that implies PT-2 owns “CSV parsing” or “header mapping UI”.
- Any plan requiring server-side parsing by PT-2 as a security boundary.

## Add
- Importer runs inside PT-2 (iframe/embed) and performs upload + mapping + validation UX.
- PT-2 receives **validated, mapped row payloads** from importer integration.
- PT-2 writes to production tables only via constrained RPCs (Category-A posture).

---

# 3) Replace the “Ingestion / Parsing” section

## Replace section heading(s)
- “CSV parsing”
- “Header alias dictionary” (as core)
- “Parser implementation details”
- “File upload endpoints” (if introduced purely for parsing)

## With: “Importer Ingestion Layer”
Include:

### 3.1 Importer configuration
- Canonical sheet/schema definition aligned to `ImportPlayerV1`
- Field-level validation rules (required/optional)
- Allowed transforms (trim, casefold email, date parsing where safe)

### 3.2 Importer output contract (hand-off payload)
- The importer must output a **canonical JSON payload per row**:
  - `ImportPlayerV1` (or `ImportPlayerV1Row`)
- The importer must include:
  - `row_number` (or stable row_ref)
  - `source_file_name` (optional)
  - `mapping_id` (if importer exposes it)

### 3.3 Integration mechanism
Pick one (document the choice):
- **Webhook/callback** “import completed” → PT-2 fetches rows and stages them
- **Direct API pull** from PT-2 backend after completion
- **Client-to-PT push** (only if importer supports signed payloads and you still stage server-side)

---

# 4) Keep and strengthen the “Canonical Contract” section

## Keep (but reframe)
- `ImportPlayerV1` is still the core. It becomes the **interface boundary** between importer and PT-2.

## Add clarifying text
- Vendor CSV shape is unknown → mapping happens in importer UI.
- `ImportPlayerV1` is stable → backend logic does not change when vendor headers change.

---

# 5) Preserve the “Truth rules” sections unchanged (these are the real PRD)

These remain relevant and should be retained with minimal edits:

- Casino-scoped identifier uniqueness
- Conflict resolution policy
- Idempotency semantics
- Row-level outcomes + reason codes
- Reporting (counts, downloadable results)
- Out-of-scope items (loyalty reconciliation, fuzzy matching, etc.)

**Only adjust the wording** from “CSV row” to “imported row payload”.

---

# 6) Replace “UI flow” with “Embedded Import Session flow”

## Replace
- “Upload file in our UI” (custom flow)
- “Map columns” (custom UI)
- “Fix errors” (custom UI)

## With
### Embedded Import Session (happy path)
1. User clicks **Import Players**
2. PT-2 creates/initializes an **embed session** (server)
3. Importer UI opens in an iframe
4. User uploads file, selects header row, maps columns, fixes validation errors
5. User submits import
6. PT-2 receives completion event (webhook/callback/poll)
7. PT-2 stages rows (`import_batch`, `import_row`)
8. User reviews PT-2 summary + clicks **Execute**
9. DB/RPC performs authoritative merge
10. PT-2 shows final report + download

### Embedded Import Session (failure paths)
- Embed session expired → create a new session
- User abandons import → batch remains `draft`
- Importer validation fails → stays inside importer UI until resolved

---

# 7) Update “Security & RLS” section (important clarifications)

## Add explicit statements
- The embedded importer is not trusted to enforce tenancy.
- PT-2 must scope every batch to `casino_id` and the acting staff.
- DB/RPC enforces scoping and rejects cross-casino matches per policy.
- If PT-2 uses service-role to ingest importer output, ingestion must still funnel into constrained RPCs or strict policies to avoid bypassing domain gates.

## Keep the RLS posture section (unchanged intent)
- RLS as defense-in-depth
- Category-A writes via RPC
- Audit logging for import execution

---

# 8) Replace “Parser implementation” with “Integration implementation”

## Delete
- `parseCsv.ts` / “CSV parsing module” tasks
- File-streaming parser notes (unless you explicitly choose server-side ingest)

## Add tasks
### 8.1 Importer embed integration
- Create embed session (server route)
- Launch iframe in UI
- Handle auth/session binding (casino_id + staff context)

### 8.2 Import completion handling
- Receive completion event (webhook) OR poll importer API
- Retrieve validated row payloads
- Stage to `import_row` (batch)

### 8.3 Execution remains identical
- `rpc_import_players_execute(batch_id)` unchanged (authoritative merge)

---

# 9) Introduce/confirm these tables as “import staging” (if not already)

- `import_batch`
  - `id`, `casino_id`, `created_by_staff_id`, `status`, `idempotency_key`, timestamps
  - optional: `importer_provider`, `importer_session_id`, `source_file_name`
- `import_row`
  - `batch_id`, `row_number`, `normalized_payload`, `status`, `reason_code`
  - optional: `raw_row` (if you choose to store it)

Add a short subsection:
- “Payload retention / redaction policy” (optional for MVP)

---

# 10) Minimal acceptance criteria updates

Add/adjust these DoD items:
- Importer can handle unknown vendor headers via mapping UI.
- PT-2 receives validated rows and stages them under the correct casino scope.
- Execution is idempotent: rerun returns same report, no duplicates.
- PT-2 does not require a custom parser module to ship MVP.

---

# Appendix A — Decision log stub (recommended)

Add a short “Decision log” section:
- Decision: “Adopt embedded importer for upload/mapping/validation UX”
- Rationale: reduce custom parsing/mapping complexity; support unknown vendor schemas early
- Non-goals: importer does not own truth rules; PT-2 retains authoritative merge enforcement

---

# Appendix B — External references (non-exhaustive)

- Flatfile “Embedding Overview” (iframe-based embedded import; handles upload/mapping/validation/transform based on config)
- Flatfile “Webhooks” / “Accept data server-side” (notify + fetch validated data)
- OneSchema “Getting Started” + “Initialize importer through API” (upload → header row → mapping → review; optional API initialization)
- Supabase “Row Level Security” guide (RLS as defense-in-depth, even with third-party tooling)

(Keep these as reference links in the final PRD; avoid pasting long vendor docs into your repo.)
Papa Parse Clarification (Lane 1 MVP)

Lane 1 uses browser-side CSV parsing via Papa Parse. Papa Parse is designed for in-browser CSV parsing and emphasizes multi-threading via Web Workers, handling very large files without crashing, and graceful handling of malformed CSV with error reporting.

Role in PT-2 import pipeline

Papa Parse is used only to convert the uploaded CSV file into row objects and provide fast feedback to the user (parse errors, basic required-field checks). It is not an authority layer. PT-2’s database/RPC remains the source of truth for:

casino scoping / tenancy

identifier uniqueness

conflict resolution

idempotency

final writes + audit

Recommended config for onboarding imports

Papa Parse accepts a configuration object that defines parsing settings, behavior, and callbacks.
For onboarding imports, use:

header: true — treat the first row as headers, produce objects keyed by header names.

skipEmptyLines: true — ignore empty lines (note: validate this behavior in your chosen usage pattern; some edge cases exist depending on callbacks).

worker: true — parse off the main thread so the UI stays responsive.

step: (result) => { ... } — stream rows incrementally (avoids loading entire files into memory at once; supports progress UX).

complete: (final) => { ... } / error: (err) => { ... } — finalize and surface parse failures.

Streaming + backpressure note (important)

Papa Parse’s step callback receives a parser object that supports abort() always, and pause/resume only when not using a worker (per Papa Parse FAQ).
MVP guidance:

Prefer worker: true for UI responsiveness.

Use chunked upload to the server/RPC (e.g., 500–2000 rows per request) rather than trying to “pause parsing until the server responds.”

Mapping with unknown vendor headers

Because vendor schemas are unknown, the onboarding UI must include a mapping step:

show detected CSV headers

allow mapping headers → canonical ImportPlayerV1 fields (especially identifiers)

require at least one identifier mapping (email/phone/external_id) to allow deterministic upsert

persist mapping presets per casino/vendor for reuse

Papa Parse supplies the parsed headers/rows; PT-2 owns the mapping that produces ImportPlayerV1 payloads.

Summary

Papa Parse handles parsing (fast, browser-native, worker-capable).

PT-2 handles governance (RLS/RPC, merge logic, reports, idempotency).

This keeps MVP scope sane while staying compatible with a future “embedded importer” lane if vendor chaos demands it later.
