---
title: "PRD-034 Delta Patch: ADR-034 Standard Conformance Audit Fixups"
doc: "PRD-034-rls-write-path-remediation-v0.md"
adr: "ADR-034-RLS-write-path-compatibility-and-enforcement.md"
version: "v0.1-delta"
date: "2026-02-11"
status: "patch-proposal"
---

# Delta Patch — Fold-in of ADR Conformance Audit Findings

This patch folds the audit findings into **PRD-034** as *minimal, scope-contained edits* so the PRD actually enforces the **ADR-034** standard (Category A RPC-only + Category B PostgREST-safe + enforcement gates).

---

## Patch 1 — Canonical Source of Truth for Category A Tables (Kill the “two authorities” problem)

### Problem
ADR-034 states the **Category A table list is owned by ADR-030** (and lint config must track that canonical list). PRD-034 currently embeds its own Category A list (Appendix B) which can drift.

### Change
Replace PRD’s embedded Category A list with a reference to ADR-030 and define the JSON lint config as a *generated/projection* of ADR-030 (or SRM/SEC-001 if that’s your governance spine), never a hand-edited authority.

### PRD edits

**A) In the “Scope / Definitions” section (or wherever Category A/B are defined), add:**
- **ADD**:
  - **Canonical ownership:** *Category A membership is governed by ADR-030 (canonical).*  
  - PRD-034 may cite examples, but must not maintain a competing authoritative list.

**B) Appendix B (Category A tables list):**
- **REPLACE** the full table enumeration with:
  - “See ADR-030: Category A table registry (canonical). This appendix is intentionally non-authoritative.”

**C) CI lint config section:**
- **ADD**:
  - “`categoryA.tables.json` is derived from ADR-030 (or SRM table ownership registry) via a generator step; manual edits are prohibited.”

### Acceptance criteria (add to PRD DoD)
- PRD contains **no authoritative Category A table list**; only references ADR-030.
- CI uses a single source for Category A membership (generator + derived artifact).

---

## Patch 2 — Category B Must Be PostgREST-Safe (COALESCE/JWT fallback becomes enforceable)

### Problem
ADR-034 requires Category B RLS policies to be compatible with PostgREST by using fallback:
`COALESCE(current_setting('app.casino_id'), auth.jwt()... )`
PRD currently *mentions* Category B “is safe” but does not enforce the policy template requirement.

### Change
Add a **Category B policy conformance deliverable** and one enforcement gate (policy-lint or migration checklist gate).

### PRD edits

**A) Workstreams / Deliverables**
- **ADD deliverable**: “Category B RLS Template Conformance”
  - Inventory Category B tables in-scope (or reference SRM/ADR-030)
  - Verify all Category B policies use **COALESCE(session_var, JWT claim)** for tenant scoping.

**B) CI / Enforcement**
Choose one (PRD must explicitly choose; recommended is Option 1):

- **Option 1 (recommended, automated): Policy-lint**
  - Add a CI check scanning RLS policy SQL for Category B tables:
    - **FAIL** if policy references `current_setting('app.casino_id')` (or `app.*`) without a JWT fallback.
    - **PASS** only when the COALESCE fallback pattern is present.

- **Option 2 (lighter weight): Migration gate**
  - Require a checklist item on every migration touching RLS:
    - “Category B policies include COALESCE fallback to JWT claims.”

### Acceptance criteria (add to PRD DoD)
- Any Category B table RLS policy updated/added in this effort is demonstrably PostgREST-safe via COALESCE fallback.
- CI or migration gate prevents regression.

---

## Patch 3 — CI Lint Spec Tightening (define “authenticated client” and exemptions)

### Problem
PRD proposes grep/regex detection of `.from(...).insert/update/delete` on Category A, but “authenticated client” is not well-defined → false positives/negatives and exemption sprawl.

### Change
Define a minimum viable but *explicit* enforcement contract:
- Scope lint to known request-scoped authenticated clients.
- Define structured exemptions with mandatory metadata.

### PRD edits

**A) CI lint rule definition**
- **ADD**:
  - “Authenticated client” for lint purposes is any supabase client instance created from:
    - request context (`ctx.supabase`, `mwCtx.supabase`, etc.), or
    - user session (`createBrowserClient`, `createServerClient`), or
    - any wrapper clearly marked `AUTHENTICATED_SUPABASE_CLIENT`.

- **EXCLUDE**:
  - service-role/admin clients (explicitly identified; e.g., `serviceSupabase`, `adminClient`).

**B) Exemptions**
- **ADD** exemption format (required block):
  - `// rls-break-glass`
  - `// table: <table_name>`
  - `// reason: <why Category A write via PostgREST is unavoidable>`
  - `// compensating_controls: <what prevents tenant bleed / ensures correctness>`
  - `// expires: <date or ticket>`
- **ADD**:
  - Exemptions are reviewed and time-bounded; CI fails if missing fields.

### Acceptance criteria (add to PRD DoD)
- Lint rule has explicit definition of “authenticated client.”
- Exemptions are structured, limited, and expirable.

---

## Patch 4 — Rowcount Invariant: Make It Correct Under Supabase/PostgREST Return Shapes

### Problem
PRD’s `assertRowsAffected(result)` relies on `data.length`, but writes may return `data: null` unless `.select()` (or `returning`) is used. That can misclassify successful writes as failures (or vice versa).

### Change
Mandate one consistent pattern for PostgREST writes where rowcount must be enforced:

- **Pattern A (simple): Always select minimal returning**
  - `.insert(...).select('id')`
  - `.update(...).select('id')`
  - `.delete().select('id')`
  - Then `data.length >= 1` is valid.

OR

- **Pattern B (count-based): Require `count: 'exact'`**
  - Use the count field and assert `count > 0`.

Pick one pattern and make it the standard in PRD.

### PRD edits

**A) Rowcount helper section**
- **REPLACE** ambiguous helper text with a firm rule:
  - “All PostgREST writes in this PRD must use `.select('id')` (or equivalent minimal returning) so rowcount checks are reliable.”

**B) DoD**
- **ADD**:
  - “No write-path uses rowcount assertions unless returning/count is enabled per the chosen pattern.”

### Acceptance criteria
- Rowcount guard never relies on optional/absent response fields.

---

## Patch 5 — System-wide Coverage: Don’t Let Regex “MVP” Pretend It’s Complete

### Problem
PRD DoD claims “No authenticated PostgREST DML against Category A tables,” but enforcement is regex-based and may miss wrapper paths.

### Change
Add a bounded “inventory + confirm” step to DoD without blowing scope:
- one-time scan to enumerate all Category A PostgREST write callsites
- either refactor to RPC or annotate with break-glass (with expiry)

### PRD edits

**A) Deliverables**
- **ADD**:
  - “Category A Write Callsites Inventory (one-time)”
    - list files + functions
    - resolution: refactor to RPC or exemption block

**B) DoD**
- **ADD**:
  - “All discovered Category A PostgREST write callsites are removed or explicitly exempted with expiring break-glass metadata.”

---

## Patch 6 — Numbering / Status Hygiene (ADR-034 vs ADR-0XX)

### Problem
ADR header reads “ADR-0XX” while front-matter/file name says ADR-034; PRD mentions ADR number assignment as open.

### Change
Make ADR numbering consistent and remove “open” language.

### PRD edits
- **REPLACE** “ADR number assignment pending / proposed” language with:
  - “ADR-034 is ratified and canonical for this remediation.”
- Ensure PRD references ADR-034 consistently.

### Acceptance criteria
- No lingering ADR-0XX references in PRD-034.
- PRD treats ADR-034 as ratified (or explicitly states the gating step is “ratify ADR-034 first, then merge PRD work”).

---

# Minimal PRD Insert: “ADR Standard Conformance” Section (drop-in block)

Add this block near the top of PRD-034 (after problem statement):

## ADR Standard Conformance (ADR-034)

- **Write posture taxonomy:** Category A tables are **RPC-only** for authenticated writes. Category B tables must be **PostgREST-compatible**.
- **Category A registry (canonical):** Category A membership is governed by **ADR-030**. Any configuration artifacts are derived from ADR-030 and must not become a competing authority.
- **Category B RLS requirement:** Category B RLS policies must scope tenancy via **COALESCE(session vars, JWT claims)** (PostgREST-safe).
- **Enforcement:** CI must prevent authenticated PostgREST DML to Category A tables, with tightly defined exemptions and a reliable rowcount invariant.

---

# Updated DoD Additions (copy/paste)

Add these DoD bullets:

- Category A membership is referenced from ADR-030 only (no duplicate authoritative lists in PRD).
- CI prevents authenticated PostgREST DML to Category A tables; exemptions are structured and expirable.
- Category B RLS policies touched by this effort conform to COALESCE fallback (PostgREST-safe), enforced by CI policy-lint or a migration gate.
- Rowcount invariant is reliable via mandatory `.select('id')` (or exact count) on PostgREST writes.
- One-time inventory of Category A PostgREST write callsites is completed; all are removed or explicitly exempted.

---
