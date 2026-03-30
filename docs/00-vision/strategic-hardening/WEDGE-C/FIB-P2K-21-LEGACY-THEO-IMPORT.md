# Feature Impact Brief — P2K-21: Legacy Theo Intake Adapter

**Date:** 2026-03-27 | **Jira:** P2K-21 (High) | **Wedge:** A — Theo Integrity
**Verdict:** Ship Now — build the intake substrate, stop at the adapter boundary
**Prerequisite reading:** `P2K-21-LEGACY-THEO-IMPORT-CONTEXT.md` (scoping report)

---

## Framing Evolution

This FIB went through three framings before arriving at the right one:

| Framing | Problem | Why It Failed |
|---------|---------|---------------|
| **"Legacy theo import pipeline"** | Implies flexible automation, self-service, vendor-neutral | Overpromises. A generic column-mapping UI is a narrow importer with a nice shirt on. No vendor adapter, no semantic validation, no export drift detection. |
| **"Defer until trust prerequisites resolved"** | Correct diagnosis (trust > transport) but wrong conclusion | Defers the substrate along with the trust problem. The staging infrastructure is durable and buildable now. The trust problem is external and may never fully resolve — waiting for it is waiting forever. |
| **"Legacy theo intake adapter with supervised sanitization"** | Accepts dirty CSV. Quarantines it. Surfaces what needs human judgment. Only touches `rating_slip` after admin approval of uniquely validated rows. | This is the honest feature. |

The conceptual shift: **stage is quarantine, not progress.** The adapter accepts unknown-ish CSVs without trusting them. It normalizes what is safely mechanical. It surfaces what needs human judgment. It preserves audit provenance through sanitization. It stops at the adapter boundary.

---

## What the Adapter Does

### 1. Accept unknown-ish CSVs without trusting them

CSV upload with admin-mapped columns. The file enters staging as quarantined evidence. No row touches `rating_slip` until it passes through classification, review, and admin approval.

The staging phase is not a waypoint toward execution. It is the primary product surface. Rows live in staging until an admin explicitly promotes them.

### 2. Normalize only what is safely mechanical

Deterministic preprocessing that requires no human judgment:

| Operation | Example |
|-----------|---------|
| Whitespace/case normalization | `" Table 12 "` → `table 12` |
| Date parsing | `3/15/2026`, `2026-03-15`, `15-Mar-26` → `2026-03-15` |
| Numeric sanitization | `$1,234.56` → `123456` (cents) |
| Currency conversion | `dollars` → multiply by 100 → `cents` |
| Header alias resolution | `theo_win`, `theoretical`, `theo_value` → `legacy_theo` |
| CSV structural repair | Bare-quote neutralization, formula injection prevention |

These belong in preprocessing. They are the same utilities Lane 1 already uses (`lib/csv/`).

### 3. Surface what needs human judgment — the row classifier

This is the core of the adapter. Every staged row is classified into exactly one bucket:

| Row State | Meaning | Executable? |
|-----------|---------|-------------|
| `unique_match` | Exactly one `rating_slip` matched by `gaming_day` + `table_id` + `player_id` | **Yes** — ready for admin approval |
| `ambiguous_match` | Multiple slips match (same day/table/player, different sessions) | **No** — admin must disambiguate or provide `session_start` |
| `unresolved_player` | `player_identifier` cannot be resolved to a `player.id` | **No** — admin must correct identifier or skip |
| `unresolved_table` | `table_identifier` cannot be resolved to a `casino_table.id` | **No** — admin must correct identifier or skip |
| `invalid_theo` | Theo value is null, negative, non-numeric, or exceeds sanity threshold | **No** — admin must correct or skip |
| `invalid_unit` | Currency unit unrecognized or inconsistent with batch declaration | **No** — admin must confirm unit convention |
| `already_populated` | Matched slip already has `legacy_theo_cents` set | **No** — admin must explicitly request overwrite |
| `ready` | Passed all validation, admin has reviewed and approved | **Yes** — executable |

**Only `ready` rows are executable.** The preview is not a nicety — it is the gate. The admin's review of the classifier output is the trust assertion that the system cannot make on its own.

### 4. Preserve audit provenance through sanitization

Every human decision in the sanitization process is recorded:

| Auditable Event | What Is Recorded |
|----------------|-----------------|
| Batch creation | Who uploaded, file name, file hash, vendor label, timestamp |
| Column mapping | Which CSV headers mapped to which contract fields, who confirmed |
| Unit declaration | Who declared dollars/cents, what conversion factor applied |
| Row classification | Classifier output per row (state + reason) |
| Admin review | Who reviewed the preview, when, which rows approved/skipped/corrected |
| Overrides | Who overrode an `already_populated` row, prior value preserved |
| Execute | Who triggered execution, which rows were written, final batch report |

The staging batch record and per-row audit trail make the sanitization process inspectable after the fact. If the discrepancy widget later shows a 12% deviation, the audit trail answers: who uploaded this data, what system it came from, who reviewed the match quality, and who approved execution.

---

## What the Adapter Does NOT Do

| Excluded | Why |
|----------|-----|
| Vendor-specific adapters | Each legacy system is different. The adapter accepts whatever CSV arrives and makes the admin responsible for semantic interpretation. |
| Fuzzy reconciliation engine | Row matching is deterministic natural-key resolution. Ambiguous matches surface for human judgment, not algorithmic guessing. |
| Self-service import | No "upload and run" workflow. Every batch requires admin review of the classifier output before execution. |
| Row-by-row clerical editing | The adapter classifies and surfaces. It does not provide per-field inline editing for every cell. Corrections happen outside PT-2 (fix the CSV, re-upload). |
| Export drift detection | The adapter does not promise that a second export from the same system will have the same format. Each batch is treated independently. |
| Validation of legacy theo methodology | PT-2 does not know how the legacy system computed its theo. The discrepancy is "legacy reported X, PT-2 computed Y." Whether the difference is a legacy error or a methodology difference is the admin's judgment call. |

---

## Scope Boundaries

| Constraint | Boundary |
|-----------|----------|
| Operation | UPDATE existing `rating_slip` rows only — no INSERT |
| Column written | `legacy_theo_cents` — write-once, immutable after import |
| Executable rows | Only rows classified as `ready` after admin review |
| Trust assertion | Admin responsibility, not system responsibility |
| Provenance | Batch-level (file, vendor, actor) + row-level (classification, outcome) |

---

## What Exists (Read Path — Complete)

| Component | Status |
|-----------|--------|
| `rating_slip.legacy_theo_cents` column | DEPLOYED — migration `20260307114435` |
| `rating_slip.computed_theo_cents` column | DEPLOYED — materialized at every slip close |
| `idx_rating_slip_theo_discrepancy` | DEPLOYED — partial index, both columns non-null |
| Discrepancy widget | DEPLOYED — `components/measurement/theo-discrepancy-widget.tsx` |
| Discrepancy query + mappers | DEPLOYED — `services/measurement/queries.ts`, `mappers.ts` |

## What to Build (Intake Adapter — P2K-21 Deliverables)

### Input Contract

CSV with admin-mapped columns. Minimum required fields:

| Column | Type | Required | Purpose |
|--------|------|----------|---------|
| `gaming_day` | DATE | Yes | Match key |
| `table_identifier` | TEXT | Yes | Match key — resolved to `casino_table.id` |
| `player_identifier` | TEXT | Yes | Match key — resolved to `player.id` via external_id, email, or phone |
| `session_start` | TIMESTAMP | No | Disambiguation for multi-session days |
| `legacy_theo` | NUMERIC | Yes | Legacy-reported theo value |
| `currency_unit` | TEXT | No | `dollars` (default) or `cents` — declared per batch, not per row |

### Adapter Flow

```
CSV Upload
  → Admin maps columns to contract fields (mapping recorded in audit)
    → Admin declares currency unit for batch (recorded in audit)
      → Deterministic preprocessing (normalize, sanitize, convert units)
        → Stage rows in quarantine (staging table, not rating_slip)
          → Row classifier runs (8 states — see table above)
            → Admin reviews classifier output (preview surface)
              → Admin approves ready rows / skips unresolved rows
                → Execute: batch UPDATE rating_slip SET legacy_theo_cents
                  → Batch report: success/skip/fail per row, full audit trail
```

### Required Artifacts

| Artifact | Type | Notes |
|----------|------|-------|
| `legacy_theo_intake_batch` | Migration — staging table | Batch-level: file hash, vendor label, unit declaration, mapping profile, actor, timestamps |
| `legacy_theo_intake_row` | Migration — per-row staging | Row-level: raw CSV data, normalized values, classifier state, match result, admin disposition |
| `legacy_theo_row_state` | Migration — enum | `unique_match`, `ambiguous_match`, `unresolved_player`, `unresolved_table`, `invalid_theo`, `invalid_unit`, `already_populated`, `ready` |
| RLS policies | Migration — Pattern C + DELETE denial | ADR-015/020, admin-only role gate |
| `rpc_legacy_theo_intake_create` | RPC (DEFINER) | Create batch with provenance metadata |
| `rpc_legacy_theo_intake_stage` | RPC (DEFINER) | Stage rows, run classifier, assign row states |
| `rpc_legacy_theo_intake_execute` | RPC (DEFINER) | Write `ready` rows to `rating_slip.legacy_theo_cents`, record outcomes |
| `services/measurement/legacy-intake/` | Service module | Factory pattern (dtos, schemas, crud, keys, http, index) |
| `/api/v1/measurement/legacy-theo-intake/` | Route handlers | Create batch, stage rows, get classifier results, execute |
| Admin UI — intake adapter | Component | Upload → mapping → unit declaration → classifier preview → approval → execute → report |

### Security Requirements

- All RPCs: SECURITY DEFINER with `set_rls_context_from_staff()` (ADR-024)
- Casino-scoped: UPDATE only within actor's casino
- Role gate: `admin` only — pit_boss cannot run evidence ingestion
- Write-once: `legacy_theo_cents` rejects overwrite unless admin explicitly confirms per row
- DELETE denial: `USING (false)` on staging tables
- Audit: batch-level provenance + row-level classification + row-level outcome + actor attribution at every gate

---

## Reuse from Player Import (Lane 1)

| Pattern | Reusable | Notes |
|---------|----------|-------|
| 3-phase batch lifecycle (create → stage → execute) | Yes | Same pattern, different execute semantics |
| Papa Parse CSV parsing | Yes | Same client-side parser |
| CSV utilities (sanitize, normalize headers, alias detection) | Yes | Same `lib/csv/` functions |
| Column mapping UI | Yes | Different canonical fields, same UX |
| Chunked staging (500 rows/request) | Yes | Same chunking strategy |
| Staging table + RPC architecture | Yes | Same architecture |
| RLS/DEFINER security model | Yes | Same ADR-024 compliance |
| Execute RPC | **No** | Lane 1 creates players. This adapter classifies and updates. Entirely different domain logic. |
| Admin wizard UI | Partially | Adapter needs stronger preview — classifier output is the primary surface, not a confirmation step |

---

## Relationship to Deferred Loyalty Tier Reconciliation

The Loyalty Tier Reconciliation PRD (`PRD-LOYALTY-TIER-RECONCILIATION-v0.1`) describes the same trust boundary problem: CSV-sourced legacy data that must be staged, classified, reviewed, and conditionally applied under explicit policy controls.

Both features share:
- Quarantine-first staging (imported data is not canonical until admin promotes it)
- Row-level classification (match/conflict/unresolved states)
- Policy-controlled application (upgrade-only tier; write-once theo)
- Audit trail through the full sanitization lifecycle

The intake adapter pattern established by P2K-21 becomes the proven substrate for Loyalty Reconciliation when that feature activates. Same architecture, different match targets and apply policies.

---

## Implementation Plan

**Effort:** 2-3 days | **Branch:** `wedge-c`

| Day | Workstream | Deliverables |
|-----|-----------|-------------|
| 1 | **Schema + RPCs** | Migrations: staging tables, row state enum, RLS. 3 RPCs (create, stage+classify, execute). Row classifier logic. |
| 2 | **Service + API** | Service module (`services/measurement/legacy-intake/`). Route handlers. Integration tests. |
| 3 | **UI + Verification** | Admin intake adapter UI (upload → map → declare units → classifier preview → approve → execute → report). SRM update. |

### Definition of Done

- [ ] Admin can upload CSV, map columns, declare unit convention
- [ ] Rows are staged in quarantine with classifier state assigned
- [ ] Classifier surfaces 8 distinct row states; only `ready` rows are executable
- [ ] Admin reviews classifier output and approves/skips rows before execution
- [ ] Executed rows write `legacy_theo_cents` on matched slips; outcomes recorded per row
- [ ] Write-once enforced; overwrite requires explicit admin confirmation per row
- [ ] Full audit trail: batch provenance, mapping profile, unit declaration, classifier output, admin approvals, execution outcomes
- [ ] Discrepancy widget activates when data arrives
- [ ] All RPCs: SECURITY DEFINER, ADR-024 compliant, casino-scoped, admin-only
- [ ] CI passes: tsc, lint, test, RPC compliance, SEC-007

### Acceptance Criteria

After a supervised intake session, the system can produce:

> "Admin [name] uploaded [file] from [vendor] on [date]. [N] rows staged. Classifier: [X] unique matches, [Y] ambiguous, [Z] unresolved. Admin approved [M] rows for execution. [M] slips updated with legacy theo evidence. Discrepancy report: legacy over/under-reported theoretical win by [P]% across [M] slips."

Every number in that statement is traceable to an auditable decision.

---

## What This Is Not

This is not the discrepancy import feature. It is the **discrepancy intake substrate**.

It does not overpromise flexibility. It creates the ground for supervised sanitization. It reuses the Lane 1 batch pattern. It avoids pretending arbitrary vendor CSVs are product-ready. It stops at the adapter boundary.

If a second vendor CSV arrives with different column names, different theo semantics, or different session identifiers, the adapter handles it the same way: quarantine, classify, surface, let the admin decide. The adapter does not need to understand the vendor. The admin does.

---

## Marketing Narrative Alignment

The marketing narrative now reads:

> *"Compute and trace theoretical win with full formula provenance"*

The intake adapter does not change this claim. It strengthens the substrate behind it: when legacy evidence eventually flows through the adapter, the discrepancy widget will surface results labeled as "comparison against admin-validated legacy evidence" — not "measured discrepancy." The trust assertion belongs to the admin who reviewed the classifier output, not to the system that ingested the CSV.

---

*FIB generated 2026-03-27. Three framings evaluated: (1) "import pipeline" — rejected, overpromises automation; (2) "defer until trust resolved" — rejected, defers buildable substrate alongside unbuildable trust; (3) "intake adapter with supervised sanitization" — accepted, honest about what the system does and does not promise. Ready for PRD authoring or direct `/build` execution.*
