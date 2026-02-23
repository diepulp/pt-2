---
title: Patch Delta — ADR-036 CSV Player Import Strategy (Audit Fixes)
target_doc: ADR-036-csv-player-import-strategy.md
doc_type: patch_delta
version: 1.0.0
date: 2026-02-23
status: proposed_edits
---

# Patch Delta: ADR-036 CSV Player Import Strategy

This patch delta proposes small, surgical edits to remove ambiguity and prevent implementation dead-ends.

## Sources referenced (for rationale)
- Papa Parse: pause/resume is only available **without** a Web Worker; abort is always available.  
  https://www.papaparse.com/faq
- Supabase: RLS provides “defense in depth” even with third-party tooling.  
  https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Functions: if you use `SECURITY DEFINER`, you **must set `search_path`** (best practice).  
  https://supabase.com/docs/guides/database/functions
- PostgreSQL SECURITY DEFINER risk: set `search_path` to exclude schemas writable by untrusted users to prevent object shadowing.  
  https://www.cybertec-postgresql.com/en/abusing-security-definer-functions/

---

## 1) Add explicit Papa Parse worker limitation (pause/resume)

**Where:** Under the Lane 1 / Papa Parse configuration decision (D1 or equivalent), immediately after `worker: true` + `step` mention.

**Add (paste):**
> **Backpressure note:** With `worker: true`, Papa Parse does **not** support `parser.pause()` / `parser.resume()` (only `abort()` is always available). Chunk uploads must be decoupled from parsing (queue rows locally and upload asynchronously), or run without a worker if pause/resume is required.

---

## 2) Resolve “backend never sees raw CSV” vs `raw_row` contradiction

**Where:** In D2 (“Backend never sees raw CSV”) or wherever `raw_row` is introduced (D7 / staging section).

### 2a) Replace one sentence (recommended)
**Find (approx):**
> “The backend never sees raw CSV.”

**Replace with:**
> “The backend does not ingest raw CSV **bytes**; it receives structured rows (header→value maps) produced by the client parser and mapped into the canonical contract.”

### 2b) Add definition of `raw_row`
**Add (paste) near the `raw_row` field mention:**
> **`raw_row` definition:** `raw_row` refers to the raw *parsed row object* (header→value map) captured for audit/debug, not the original CSV bytes.

---

## 3) Harden SECURITY DEFINER governance statement (remove ambiguity)

**Where:** Under the decisions describing execution via SECURITY DEFINER RPC (D3/D4), near the phrase “SECURITY DEFINER execute RPC” or “runs under RLS.”

**Add (paste):**
> **SECURITY DEFINER guardrails:** SECURITY DEFINER RPCs must (1) enforce actor authorization + tenant scope in the function body, and (2) set an explicit `search_path` (ideally empty, with schema-qualified references) to prevent object shadowing / search_path abuse.

---

## 4) Add SRM “matrix-first” prerequisite (prevents schema drift)

**Where:** In D3 (“Introduce PlayerImportService bounded context”) or the follow-up list.

**Add (paste):**
> **Matrix-first prerequisite:** SRM registration/ownership must land **before** schema changes; all schema additions for import staging/execute must mirror SRM to avoid matrix↔schema drift.

---

## 5) Normalize identifier table naming (player_identity vs player_identifier)

**Where:** In D5 (identity rules) and follow-ups (deferred item referencing `player_identity`).

### 5a) Add clarification sentence
**Add (paste) under the identity decision:**
> **Identifier table naming:** This ADR must name the canonical identifier table explicitly. If `player_identity` supersedes `player_identifier`, state that and align all constraints and code references; otherwise standardize on `player_identifier` in this ADR.

### 5b) Optional quick fix (choose one and apply consistently)
- If the project standard is `player_identifier`: replace occurrences of `player_identity` → `player_identifier` in this ADR, and keep “enrollment” logic in `player_casino`.
- If the project standard is `player_identity`: add a note: “`player_identifier` is legacy; `player_identity` is canonical going forward.”

---

## 6) Clarify what “casino-scoped match” means operationally

**Where:** In D5 (“Exact match within same casino scope”).

**Add (paste):**
> **Scope definition:** “Casino-scoped match” means identifier resolution queries only consider identifier records keyed by `casino_id` (recommended), rather than searching global players and then filtering by enrollment. Constraints and indexes must align with the chosen meaning of scope.

---

## 7) Optional: Add a tiny “Decision Outcomes” footer (scanability)

**Where:** At end of ADR, before “Follow-ups” or “Links.”

**Add (paste):**
### Decision outcomes (quick scan)
- MVP ingestion = Lane 1 (Papa Parse + internal mapping)
- Canonical boundary = `ImportPlayerV1`
- Merge authority = stage → execute RPC with deterministic conflicts + idempotency
- Loyalty/tier fields = staged-only; reconciliation is separate workflow (no entitlement mutation during import)

---

## 8) Summary of net effect
- Prevents an implementation dead-end around pause/resume with workers.
- Removes contradictions about what “raw” data is stored.
- Makes SECURITY DEFINER posture explicit and safe (search_path + actor/tenant checks).
- Protects SRM matrix-first contract from “ADR says X but schema drifted” failures.
- Eliminates naming ambiguity around identifier tables and scope semantics.
