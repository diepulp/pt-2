---
id: SCAFFOLD-CSV
title: "Feature Scaffold: CSV Player Import"
owner: lead-architect
status: Decided
date: 2026-02-23
---

# Feature Scaffold: CSV Player Import

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** csv-player-import
**Owner / driver:** Lead Architect
**Stakeholders (reviewers):** Pit Boss operators, Security, Backend Engineering
**Status:** Decided
**Last updated:** 2026-02-23

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss or admin, I can upload a vendor-provided CSV of player data and have those players seeded into our casino's player pool, with a clear report of what was created, linked, skipped, or conflicted.
- **Success looks like:** A 5,000-row vendor CSV with unknown headers is imported end-to-end in under 60 seconds with correct casino scoping, idempotent re-execution, and zero cross-tenant data leakage.

## 2) Constraints (hard walls)

- **Security / tenancy:** RLS stays enabled; all production writes via SECURITY DEFINER RPCs with `set_rls_context_from_staff()` (ADR-024). Casino-scoped isolation per ADR-023.
- **Domain:** Casino-scoped uniqueness on identifiers; deterministic conflict resolution (multi-match = conflict, no write); idempotency via `UNIQUE(casino_id, idempotency_key)`.
- **Operational:** UI must remain responsive during parsing (Web Worker); chunked uploads with retry; max 10,000 rows / 10MB per import.
- **Compliance:** Loyalty tier/points fields in CSV treated as staged metadata only — never written to loyalty ledger (separate reconciliation PRD).

## 3) Non-goals (what we refuse to do in this iteration)

- Loyalty tier reconciliation from CSV (separate PRD; import is not the loyalty source of truth)
- Server-side CSV parsing or file upload/storage pipeline
- Cross-casino identity linking (strict tenant isolation)
- Advanced vendor schema inference / auto-map-everything AI
- Merge/conflict resolution tooling (conflicts are reported, not resolved in-app)
- Fuzzy matching or identity dedup beyond exact email/phone match
- Mapping preset persistence (casino/vendor saved presets — post-MVP)

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:** Vendor CSV file (unknown schema), operator column mapping selections
- **Outputs:** Staged rows in `import_batch` + `import_row`; merged players in `player` + `player_casino`; `ImportBatchReportV1` with per-row outcomes; downloadable results CSV
- **Canonical contract(s):** `ImportPlayerV1` (vendor rows normalized to stable internal contract)

## 5) Options (3 evaluated)

### Option A: Browser parsing with Papa Parse + mapping UI (Lane 1 MVP) -- CHOSEN

- **Pros:** Minimal infrastructure (no file upload pipeline); proven library with Web Worker + streaming; keeps truth enforcement in DB/RPC; fast iteration; easy chunking
- **Cons / risks:** Client performance variability on weak machines; mapping UI still requires custom work; chunking/retry semantics needed
- **Cost / complexity:** Low-medium. Papa Parse is a single dependency; mapping UI is ~4 components; staging tables + execute RPC are the main backend work
- **Security posture impact:** Neutral. Parsing is untrusted pre-processing; DB/RPC remains authoritative. RLS provides defense in depth.
- **Exit ramp:** Preserve `ImportPlayerV1` contract and staging/execute RPC; swap parsing/mapping front-end to Option B later without backend changes

### Option B: Embedded importer (Flatfile / OneSchema)

- **Pros:** Best UX for unknown schemas (mapping + correction workflows); reduces custom UI work significantly; vendor handles file parsing edge cases
- **Cons / risks:** Vendor cost and lock-in; integration complexity (embed sessions, webhooks); governance risk if logic drifts into importer hooks
- **Cost / complexity:** Medium. Integration work + vendor management; but less custom UI
- **Security posture impact:** Neutral if truth rules stay in DB/RPC; risk if validation logic migrates to importer
- **Exit ramp:** Same backend contract; can swap importer vendor or revert to Option A

### Option C: Server-side parsing (Node streaming)

- **Pros:** Predictable performance for very large files; consistent behavior independent of client
- **Cons / risks:** File upload infra + storage + timeouts + scanning; risk of bypassing RLS with privileged server credentials; more operational footprint
- **Cost / complexity:** High. Requires file upload pipeline, storage, virus scanning, timeout management
- **Security posture impact:** Higher risk surface (server-side file handling, temp storage)
- **Exit ramp:** Same backend contract; can swap ingestion mechanism

## 6) Decision to make (explicit)

- **Decision:** Option A — Browser parsing with Papa Parse (Lane 1 MVP)
- **Decision drivers:**
  1. Lowest infrastructure cost for MVP
  2. Security posture preserved (parsing is not a security boundary)
  3. Clean exit ramp to Option B if UX demands grow
  4. `ImportPlayerV1` canonical contract isolates parsing from merge logic
- **Decision deadline:** N/A (decided)

## 7) Open questions / unknowns

- ~~Unknown vendor schema?~~ Solved via mapping UI + auto-detect heuristics
- ~~File size limits?~~ 10MB / 10,000 rows for MVP
- External ID matching: `player_identity` table lookup deferred (email/phone match only for MVP)
- Mapping preset persistence: deferred post-MVP (saved per casino/vendor label)
- Partial failure recovery: if staging completes but execute fails, can user retry execute only? (Yes — batch status drives this)

## 8) Definition of Done (thin)

- [ ] Decision recorded in ADR-036
- [ ] Acceptance criteria agreed in PRD
- [ ] Implementation plan delegated to /build pipeline

## Links

- Feature Boundary: `docs/20-architecture/specs/csv-player-import/FEATURE_BOUNDARY.md`
- Vision Docs: `docs/00-vision/csv-import/`
- Design Brief/RFC: `docs/02-design/RFC-CSV-PLAYER-IMPORT.md` (next phase)
- ADR(s): `docs/80-adrs/ADR-036-csv-player-import-strategy.md` (Phase 4)
- PRD: `docs/10-prd/PRD-CSV-PLAYER-IMPORT-MVP.md` (Phase 5)
