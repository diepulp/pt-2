# Feature Boundary Statement: CSV Player Import

> **Ownership Sentence:** This feature belongs to **PlayerImportService** (new bounded context) and may only write to **import_batch**, **import_row** (staging tables); production writes to **player** and **player_casino** are executed atomically via a SECURITY DEFINER RPC (`rpc_import_execute`). Cross-context needs go through **PlayerService DTOs** (identity) and **CasinoService DTOs** (enrollment).

---

## Feature Boundary Statement

- **Owner service(s):**
  - **PlayerImportService** (NEW) — staging lifecycle, column mapping, batch orchestration, execute RPC
  - **PlayerService** (cross-context write target) — `player` row creation during execute
  - **CasinoService** (cross-context write target) — `player_casino` enrollment during execute

- **Writes:**
  - `import_batch` (batch metadata, status, idempotency, report summary)
  - `import_row` (per-row staging: raw, normalized, validation outcome)
  - `player` (production write via RPC only — new player creation)
  - `player_casino` (production write via RPC only — casino enrollment)

- **Reads:**
  - `player` (identifier resolution during execute: email, phone match)
  - `player_casino` (enrollment check during execute)
  - `staff` (via `set_rls_context_from_staff()` for actor/casino derivation)

- **Cross-context contracts:**
  - `ImportPlayerV1` — canonical import payload contract (new, owned by PlayerImportService)
  - `ImportBatchReportV1` — execution result report (new, owned by PlayerImportService)
  - `PlayerService.player` — read for identifier dedup during execute RPC
  - `CasinoService.player_casino` — read/write for enrollment during execute RPC

- **Non-goals (top 5):**
  1. Loyalty tier reconciliation from CSV — deferred to separate PRD (staged metadata only)
  2. Server-side CSV parsing or file upload pipeline — browser-side Papa Parse only for MVP
  3. Cross-casino identity linking — strict tenant isolation per ADR-023
  4. Advanced vendor schema inference (auto-map everything) — manual mapping with presets
  5. Merge/conflict resolution tooling — conflicts are reported, not resolved in-app

- **DoD gates:** Functional / Security / Integrity / Operability (see DOD-CSV-IMPORT)

---

## Goal

Enable pit bosses and admins to seed the player pool from vendor-provided CSV exports with unknown schemas, producing a deterministic report of created, linked, skipped, and conflicting rows.

## Primary Actor

**Pit Boss / Admin** (staff with import authority at a specific casino property)

## Primary Scenario

Staff uploads a vendor CSV, maps columns to the canonical import contract, reviews a preview summary, executes the import, and receives a downloadable report with per-row outcomes.

## Success Metric

End-to-end import of a 5,000-row vendor CSV completes within 60 seconds with correct casino scoping, idempotent re-execution, and zero cross-tenant data leakage.

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **Feature Boundary** | Scope definition (this file) | `docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md` |
| **SCAFFOLD-CSV** | Options analysis | `docs/01-scaffolds/SCAFFOLD-CSV-PLAYER-IMPORT.md` |
| **RFC-CSV** | Design brief | `docs/02-design/RFC-CSV-PLAYER-IMPORT.md` |
| **SEC Note** | Threat model | `docs/30-security/SEC-NOTE-CSV-PLAYER-IMPORT.md` |
| **ADR-036** | Durable architectural decisions (frozen) | `docs/80-adrs/ADR-036-csv-player-import-strategy.md` |
| **PRD-CSV-IMPORT** | Acceptance criteria + workstreams | `docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md` |

---

## SRM Impact

**New bounded context registration required:** `PlayerImportService`

| Field | Value |
|-------|-------|
| Domain | Operational |
| Service | PlayerImportService |
| Owns Tables | `import_batch`, `import_row` |
| Bounded Context | CSV/bulk player seeding and staging lifecycle |
| Cross-Context Writes | `player`, `player_casino` (via SECURITY DEFINER RPC only) |
| Enums (new) | `import_batch_status`, `import_row_status` |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.
