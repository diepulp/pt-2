---
title: ADR Template — CSV Player Import Strategy
template_for: ADR-XXX
project: PT-2 Casino Player Tracker
version: 1.0.0
date: 2026-02-22
status: template
---

# ADR-XXX: CSV Player Import Strategy (Parsing + Mapping + Staging)

**Status:** Proposed | Accepted | Deprecated | Superseded  
**Date:** YYYY-MM-DD  
**Deciders:**  
**Consulted:**  
**Informed:**  

## Context

We need to ingest **vendor-provided player CSV** during onboarding to seed/upsert the database. Vendor schemas are **unknown/variable** (headers differ, optional columns, inconsistent formats).

PT-2 constraints:
- **RLS stays enabled**; database policies provide “defense in depth” even when accessed through third‑party tooling.  
  (Implication: parsing/mapping is *not* a security boundary; DB/RPC remains authoritative.) citeturn0search2
- Writes to production tables must preserve:
  - casino-scoped identifier uniqueness
  - deterministic conflict handling
  - idempotency (replay-safe)
  - auditability and reportability
- Minimize “reinvent the wheel” work: avoid bespoke CSV parsing logic when mature tooling exists.

### Problem statement (1–2 sentences)
<Write the crisp problem here, e.g.>
We need an import pipeline that accepts unknown vendor CSV shapes, produces a canonical payload for merge, and executes an auditable, idempotent, casino-scoped upsert under RLS.

### Decision drivers (ranked)
1. **Correctness under RLS / multi-tenant boundaries**
2. **Operator UX for unknown vendor schemas (mapping, validation, corrections)**
3. **Engineering complexity / time-to-MVP**
4. Performance for realistic file sizes
5. Operational footprint (file upload infra, storage, scanning, timeouts)
6. Exit ramp: ability to switch approaches without rewriting backend merge rules

## Considered options

> Tip: keep options to 3 max. State what you’d actually ship.

### Option A — Lane 1 MVP: Browser parsing with Papa Parse + internal mapping UI
**Summary:** Parse CSV in the browser using Papa Parse, run a light mapping step (vendor headers → canonical contract), chunk upload canonical rows to PT-2 staging + execute via RPC.

**Why this exists:** Papa Parse provides browser parsing with features like worker-thread parsing and streaming via callbacks, reducing the need for a custom parser. citeturn0search1turn0search5

**Pros**
- Minimal infrastructure (no file-upload/storage pipeline needed for MVP)
- Keeps “truth enforcement” in DB/RPC under RLS
- Fast iteration in onboarding UI
- Easy to chunk uploads (e.g., 500–2000 rows)

**Cons / risks**
- Client performance variability (large files on weak machines)
- Need reliable chunking/retry semantics
- Mapping UI still needed (unknown vendor headers)

**Security posture**
- Parsing is untrusted pre-processing; DB/RPC remains authoritative; RLS provides defense in depth. citeturn0search2

**Exit ramp**
- Preserve canonical contract (`ImportPlayerV1`) and staging/execute RPC; swap parsing/mapping mechanism later (Option B).

### Option B — Embedded importer (Flatfile / OneSchema / etc.)
**Summary:** Use an embedded importer for upload + mapping + validation + correction UX; PT-2 receives validated canonical rows and runs the same staging + execute merge.

**Pros**
- Strongest UX for unknown vendor schemas (mapping + correction workflows)
- Reduces custom UI work significantly
- Vendor tooling often includes webhooks/eventing + review

**Cons / risks**
- Vendor cost and lock-in
- Integration complexity (embed sessions, webhooks, data destinations)
- Governance risk if logic drifts into importer hooks (truth rules must stay in DB/RPC)

**Security posture**
- Importer does not replace RLS; DB remains the enforcement boundary. citeturn0search2

**Exit ramp**
- Keep canonical contract + staging/execute RPC stable; importer can be swapped if contract remains unchanged.

### Option C — Server-side parsing (Node streaming parser) + staging
**Summary:** Upload CSV to server, parse via streaming library, stage rows, execute merge via DB/RPC.

**Pros**
- Predictable performance for very large files (streaming)
- Consistent behavior independent of client machine

**Cons / risks**
- File upload infra + storage + timeouts + scanning considerations
- Risk of bypassing RLS if server uses privileged credentials incorrectly
- More operational footprint (and more ways to shoot yourself)

**Security posture**
- Must ensure parsing server does NOT become a backdoor; all writes still funnel through constrained DB/RPC and respect casino scope. citeturn0search2

**Exit ramp**
- Same: keep contract and execute RPC; swap ingestion later.

## Decision

**We will choose:** Option <A|B|C>  
**Parsing/mapping mechanism:** <describe clearly>  
**Canonical contract:** `ImportPlayerV1` (stable interface boundary)  
**Authoritative merge:** DB/RPC (idempotent, casino-scoped, audited)

### Scope boundaries (explicit)
Included:
- Staging (`import_batch`, `import_row`) + execute RPC merge
- Row-level outcomes + report export
- Deterministic conflict rules + idempotency

Excluded (for this ADR):
- Fuzzy matching / identity merge tools
- Loyalty/tier reconciliation workflows (separate PRD)
- Background job orchestration (unless chosen)

## Consequences

> Per ADR guidance: consequences become future context; list positives AND negatives. citeturn0search0

### Positive
- <e.g., MVP ships faster; avoids custom parser; stable backend contract>

### Negative / tradeoffs
- <e.g., mapping UI work remains; vendor lock-in risk; operational costs>

### Follow-ups / required work
- Define `ImportPlayerV1` schema and versioning rules
- Implement staging tables + `rpc_import_players_execute(batch_id)`
- Define chunking limits and retry semantics
- Define spreadsheet-safe export rules
- Add audit logging hooks for execute + (optional) payload redaction policy

## Links
- Feature Scaffold: `docs/00-scaffolds/FEATURE-###-csv-player-import.md`
- Design Brief/RFC: `docs/01-design/RFC-###-csv-player-import.md`
- PRD: `docs/10-prd/PRD-###-player-import.md`
- Exec Spec: `docs/20-exec-spec/EXEC-###-player-import.md`

---

## Notes (template references)
- ADR format (Context → Decision → Consequences) and why consequences matter: [Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions?utm_source=chatgpt.com)
- ADR templates catalog (MADR/Nygard/etc.) for alternative formats: [ADR Templates](https://adr.github.io/adr-templates/?utm_source=chatgpt.com)
- Supabase RLS “defense in depth” framing: [SUPABASE RLS](https://supabase.com/docs/guides/database/postgres/row-level-security?utm_source=chatgpt.com)
- Papa Parse docs/demo show worker + streaming step patterns used for large inputs: [Papa Parse](https://www.papaparse.com/docs?utm_source=chatgpt.com)
