# Plan: SRL Companion Authority Creation + SRM Semantic Reference — TIA Canon Exemplar

**Patch applied:** PLAN-SRL-SRM-DECOUPLING-001 (all 12 patches — P1–P12)

---

## Context

The SRM (`SERVICE_RESPONSIBILITY_MATRIX.md`) currently registers table/service ownership only.
The `SRM-SEMANTIC-RESPONSIBILITY-EXTENSION-DIRECTIVE.md` (status: Proposed) calls for extending
semantic authority into a system-wide governance layer bound to SRM ownership.

The TIA Canon work (FIB-H-TIA-CANON-001, ADR-059/060/061) has produced a fully resolved semantic
domain for `TableContextService.TableInventoryAccounting`. It is the system's first exemplar that
satisfies all six Zachman interrogatives and all eight directive admission fields.

**[P1]** The plan closes the directive's acceptance criteria loop by **creating a companion
Semantic Responsibility Layer (SRL)** bound to SRM ownership, using TIA as the anchoring entry.
SRM remains the service/table ownership root. SRL owns semantic admission, canonical terminology,
epistemic claims, accepted thesauri, Zachman admission records, and legacy alias disposition.

### Architecture of Separation

```
SRM:                           SRL:
  service ownership              semantic admission rules
  table ownership                admitted extension registry
  write/read authority           canonical term ownership
  cross-context rules            epistemic claims
  compact SRL references         accepted thesauri
                                 Zachman records
                                 legacy alias disposition ledgers

Binding rule:
  every SRL term MUST bind to an SRM owner
  SRM MUST NOT inline full SRL records
  thesaurus authority flows through SRL admission + SRM owner binding
```

The Directive's acceptance criteria (Section 13) — interpreted through this decoupling:
1. SRL companion authority is created and SRM gains a compact SRL reference ✓
2. TIA exemplar records canonical terms in SRL-TIA-001 ✓ (6 terms, full records in SRL artifact)
3. Thesaurus identifies itself as SRL-admitted, SRM-bound accepted-language index ✓
4. PRD gates reference semantic owner, DTO boundary, suppression ✓ (SRL enforcement section)
5. Future PRDs cannot introduce canonical terms without SRL admission + SRM owner binding ✓
6. Every admitted term answers all six Zachman interrogatives ✓ (TIA-CANON-THESAURUS-ZACHMAN.yaml)

---

## Files to Create / Modify

**[P2]**

### New Files
- `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` — companion SRL authority document
- `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml` — TIA semantic records (6 terms + alias disposition)
- `docs/20-architecture/SRL-CHANGE-LOG.md` — SRL version history

### Modified Files
- `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — compact SRL reference only (no inline semantic records)
- `docs/20-architecture/SRM-CHANGE-LOG.md` — compact v4.27.0 entry
- `docs/issues/table-inventory-accounting-canon/thesaurus/SRM-SEMANTIC-RESPONSIBILITY-EXTENSION-DIRECTIVE.md` — status: Proposed → Accepted
- `docs/issues/table-inventory-accounting-canon/thesaurus/TIA-CANON-EXEMPLAR-THESAURUS.md` — SRL/SRM-bound authority note

---

## Change 1 — SRM Front Matter + Document Scope (Narrowed)

**[P3]**

**Location:** Lines 1–65 of SERVICE_RESPONSIBILITY_MATRIX.md

**Front matter changes (minimal):**
```yaml
nsversion: 4.27.0
effective: 2026-05-29
# Add only companion SRL reference — NOT ADR-059/060/061 (those are SRL source_of_truth, not SRM)
```

**Document Scope addition** (append after existing "This SRM does NOT contain" block):
```markdown
**Semantic Responsibility Reference:**
Semantic authority is governed by the companion Semantic Responsibility Layer (SRL)
at `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md`. SRL entries must bind to
an SRM-owned service, bounded context, or subdomain. A canonical term without an SRM
owner is invalid. SRM does not inline full semantic responsibility records; it registers
admitted semantic extensions by reference only.
```

---

## Change 2 — TableContextService: Compact Semantic Extension Reference

**[P4]**

**Location:** Within the `## TableContextService` section, after the existing `### Does NOT Own` block.

Replace the previously planned full semantic posture subsection with a compact reference:

```markdown
### Semantic Extension Reference

TableContextService has one admitted semantic extension:

| ID | Bound Subdomain | Role | Full Record |
|---|---|---|---|
| SRL-TIA-001 | TableContextService.TableInventoryAccounting | Read-time derived semantic authority for table-result values | `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml` |

**Basis:** ADR-059 (ownership + formula), ADR-060 (drop taxonomy), ADR-061 (session scope)

⚠ `table_buyin_telemetry` is consumed by TableInventoryAccounting as its primary telemetry
input table but is not yet listed in the main Service Responsibility Overview `Owns Tables`
column. This ownership gap must be resolved at TIA PRD preflight or in the PRD itself. Not
blocking for SRL admission.

SRM owns the service/subdomain boundary. SRL owns the semantic records.
```

---

## Change 3 — New File: `SEMANTIC_RESPONSIBILITY_LAYER.md`

**[P5]**

**Create:** `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md`

This file is the SRL companion authority. It does NOT live inside the SRM.

### Contents outline:

**Front matter:**
```yaml
---
id: ARCH-SRL
title: Semantic Responsibility Layer
srlversion: 1.0.0
status: CANONICAL
effective: 2026-05-29
binding_root: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
changelog: docs/20-architecture/SRL-CHANGE-LOG.md
source_of_truth:
  - docs/issues/table-inventory-accounting-canon/thesaurus/SRM-SEMANTIC-RESPONSIBILITY-EXTENSION-DIRECTIVE.md
  - docs/80-adrs/ADR-059-table-inventory-accounting-canon-ownership-and-formula.md
  - docs/80-adrs/ADR-060-drop-taxonomy-and-naming-standard.md
  - docs/80-adrs/ADR-061-session-scope-aggregation-boundary.md
---
```

**Section 1 — Purpose and Scope**
- SRL is the semantic authority registry companion to the SRM
- SRM owns service/table/write-path boundaries; SRL owns meaning
- Every SRL entry binds to an SRM-owned service, bounded context, or subdomain
- SRL does not replace the SRM; SRM does not inline SRL records

**Section 2 — SRM/SRL Separation Principle**
- SRM = what does this service own and what may it write
- SRL = what does this service mean, and what authority may it claim
- A term without an SRM owner is not canonical

**Section 3 — Authority Order**
```
1. ADR decisions — introduce, amend, reserve, or retire canonical terminology;
   must bind each term to SRM ownership
2. DTO contract — the admitted DTO shape is authoritative at the boundary
3. PRD acceptance tests — enforce semantic contracts in the running system
4. Thesaurus — SRL-admitted, SRM-bound accepted-language index;
   carries canonical force through SRL admission and ADR/DTO/test binding;
   not an independent semantic legislature
```

**Section 4 — Semantic Admission Rule**
A term is canonical only when it declares all eight fields (per directive Section 3):
1. Owning bounded context / service / subdomain
2. Semantic class
3. Epistemic claim
4. Source-of-knowledge rule
5. Authority posture
6. Boundary contract
7. Forbidden re-derivation paths
8. Enforcement hook

**Section 5 — Zachman-Informed Admission Lens**
Every admitted term must answer all six interrogatives (What / How / Where / Who / When / Why).
Answer within the semantic responsibility record shape — not as six separate artifacts.
Full records live in the SRL extension artifact (e.g., `SRL-TIA-001-*.yaml`).

**Section 6 — Semantic Class Registry**

| Class | Meaning |
|---|---|
| `authored_fact` | Domain fact written by its owning service |
| `telemetry_fact` | Non-authoritative operational observation or estimate |
| `dependency_event` | Operational transition required by projections; not a financial authority fact |
| `derived_surface_value` | Computed for display or API consumption from canonical inputs |
| `lifecycle_state` | State describing which phase a workflow path, session, or result is in |
| `authority_label` | Label describing what authority the system may claim |
| `surface_label` | Human-facing label for a canonical value |
| `reserved_future_term` | ADR-authorized vocabulary; not implementable without further ADR/FIB amendment |

New classes require ADR review before admission.

**Section 7 — Enforcement Rules** (seven rules — from directive Section 11, verbatim)

**Section 8 — Admitted Extension Registry**

| ID | SRM Owner | Subdomain | Status | Full Record |
|---|---|---|---|---|
| SRL-TIA-001 | TableContextService | TableInventoryAccounting | canonical | `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml` |

**Section 9 — Admission Paths for New Terms** (three paths from directive Section 9)
- Direct SRM ownership amendment
- ADR-backed semantic amendment
- Candidate term review

**Section 10 — Semantic Responsibility Record Shape** (YAML template from directive Section 5)

---

## Change 4 — New File: `SRL-TIA-001-table-inventory-accounting.yaml`

**[P6 + P7]**

**Create:** `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml`

This file carries the full semantic responsibility records and legacy alias disposition
ledger for the TIA exemplar. Nothing from this file is inlined into the SRM.

### File structure:

```yaml
srl_extension:
  id: SRL-TIA-001
  title: TableInventoryAccounting Semantic Extension
  srlversion: "1.0.0"
  status: canonical
  effective: "2026-05-29"
  admitted_to: docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
  feature: FIB-H-TIA-CANON-001
  srm_owner:
    context: TableContextService
    subdomain: TableInventoryAccounting
  adr_spine: [ADR-059, ADR-060, ADR-061]
  zachman_proof: docs/issues/table-inventory-accounting-canon/thesaurus/TIA-CANON-THESAURUS-ZACHMAN.yaml
  accepted_language_index: docs/issues/table-inventory-accounting-canon/thesaurus/TIA-CANON-EXEMPLAR-THESAURUS.md

semantic_posture:
  role: read-time derived semantic authority for table-result values
  write_authority: none
  semantic_rule: >
    TableInventoryAccounting may derive table-result language from canonical
    TableContext-owned inputs and approved telemetry-derived estimate inputs.
    It may not author financial facts, claim custody authority, or permit
    downstream surfaces to re-derive competing win/loss-like values.

admitted_terms:
  # Six full records using directive Section 5 shape:
  # projected_table_win_loss_cents    — derived_surface_value, canonical, ADR-059 D2 + ADR-061 D2
  # partial_table_result_cents        — derived_surface_value, canonical, ADR-059 D5
  # final_table_win_loss_cents        — reserved_future_term, reserved_null_this_slice, ADR-059 D3
  # drop_estimate_state               — lifecycle_state, canonical, ADR-061 D6
  # calculation_kind                  — lifecycle_state, canonical, ADR-059 D5
  # telemetry_derived_drop_estimate_cents — telemetry_fact, canonical, ADR-060 D1 + ADR-061 D2

legacy_alias_disposition:
  # Eight entries:
  # win_loss_inventory_cents        → suppress_surface  → partial_table_result_cents
  # win_loss_estimated_cents        → suppress_surface  → projected_table_win_loss_cents
  # estimated_drop_buyins_cents     → map_to_canonical  → telemetry_derived_drop_estimate_cents
  # table_win_cents                 → suppress_surface  → null (replace with projection)
  # source_authority.inventory      → delete            → source_authority.snapshots
  # "Estimated Win/Loss" (label)    → suppress_surface  → "Projected Win/Loss"
  # "Win/Loss" (unqualified)        → suppress_surface  → contextual per calculation_kind
  # rpc_shift_table_metrics as drop → outside_exemplar_boundary

key_semantic_law:
  - At most one result field non-null per projection. final_table_win_loss_cents always null.
  - drop_estimate_state = 'present' iff telemetry_derived_drop_estimate_cents is non-null (incl. 0). Null != zero.
  - calculation_kind = 'integrity_failure' implies both result fields null; no surface label rendered.
  - custody_status = 'non_custody_estimate' always. No condition upgrades it in this slice.
  - Consumers may render; they may not recompute.

boundary_contract:
  dto: TableInventoryAccountingProjection
  enforcement:
    - DTO contract test
    - formula test (5-operand)
    - RATED_ADJUSTMENT exclusion test (TIA-CANON-RATED-ADJUSTMENT-EXCLUSION)
    - null-vs-zero test (TIA-CANON-NULL-VS-ZERO)
    - session-scope test (TIA-CANON-SESSION-SCOPE-ONLY)
    - source-authority shape test (TIA-CANON-SOURCE-AUTHORITY-SHAPE)
    - surface-label conformance test (TIA-CANON-SURFACE-LABEL-CONFORMANCE)
    - legacy alias suppression gate
```

Each `admitted_terms` entry is written in full using the directive Section 5 shape with
all fields: term, owning_context, owning_subdomain, semantic_class, status,
what_the_system_knows, how_the_system_knows, authority_posture, allowed_surface_label,
source_inputs, may_be_authored_by, may_be_derived_by, may_be_rendered_by,
must_not_be_rederived_by, boundary_contract, enforcement.

---

## Change 5 — SRM-CHANGE-LOG.md: v4.27.0 Entry (Compact)

**[P8]**

```
v4.27.0 — 2026-05-29 — SRL Companion Reference

- Added Semantic Responsibility Reference to Document Scope.
- Registered SRL as companion semantic authority (SEMANTIC_RESPONSIBILITY_LAYER.md).
- Registered TableContextService.TableInventoryAccounting as having an admitted
  SRL extension: SRL-TIA-001.
- Flagged table_buyin_telemetry ownership gap (must resolve at TIA PRD preflight).
- Did not inline semantic responsibility records into SRM.
```

---

## Change 6 — New File: `SRL-CHANGE-LOG.md`

**[P9]**

**Create:** `docs/20-architecture/SRL-CHANGE-LOG.md`

```
v1.0.0 — 2026-05-29 — SRL Created; TIA Exemplar Admitted

- Created Semantic Responsibility Layer companion authority.
- Accepted SRM/SRL separation principle: SRM owns service/table boundaries; SRL owns meaning.
- Admitted SRL-TIA-001 as first semantic extension (TableContextService.TableInventoryAccounting).
- Registered six semantic responsibility records for TIA canon terms.
- Registered TIA legacy alias disposition ledger (8 entries).
- Registered TIA-CANON-EXEMPLAR-THESAURUS.md as SRL-admitted, SRM-bound accepted-language index.
- Confirmed Zachman interrogative completeness via TIA-CANON-THESAURUS-ZACHMAN.yaml.
```

---

## Change 7 — Directive Status: Proposed → Accepted

**[P10]**

In `SRM-SEMANTIC-RESPONSIBILITY-EXTENSION-DIRECTIVE.md`:
- Front matter: `Status: Proposed` → `Status: Accepted`
- Front matter: add `effective: 2026-05-29`

In Section 13 (Acceptance Criteria), update with SRM/SRL decoupled references:
```
- [x] SRL companion authority created → docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
- [x] SRM references SRL without inlining semantic records → SRM v4.27.0
- [x] TIA exemplar records its canonical terms → SRL-TIA-001-table-inventory-accounting.yaml
- [x] Thesaurus identifies itself as SRL-admitted, SRM-bound accepted-language index → note added
- [x] PRD acceptance gates reference semantic owner, DTO boundary, suppression → SRL enforcement section
- [x] Future PRDs cannot introduce canonical terms without SRL admission + SRM owner binding → SRL admission rule
- [x] Every admitted term's record answers all six Zachman interrogatives → TIA-CANON-THESAURUS-ZACHMAN.yaml
```

---

## Change 8 — Thesaurus Authority Note

**[P11]**

In `TIA-CANON-EXEMPLAR-THESAURUS.md`, add at top under the header:

```markdown
> **Authority:** This artifact is an SRL-admitted, SRM-bound accepted-language index. It is
> not an independent semantic legislature. Canonical terms are governed by SRL admission,
> SRM ownership binding, ADR decisions, DTO contracts, and PRD enforcement tests.
> Authority flows from: ADR-059/060/061 → DTO contract → PRD tests → this index.
```

---

## Reconciliation: TableContextService Current State vs. Semantic Extension

The current bounded-context statement remains correct and unchanged:
> "What is the operational state and chip custody posture of this gaming table?"

The semantic extension adds a second dimension (in SRL, not SRM):
> "What table-result values may be derived, and what authority may be claimed for them?"

- `TableContextService` continues to own all operational authoring tables (no change)
- `TableInventoryAccounting` is a read-only semantic subdomain — SRL-TIA-001 governs it
- SRM carries only a compact `### Semantic Extension Reference` block pointing to SRL-TIA-001
- The `Does NOT Own` section already correctly excludes monetary ledgers, CTR, rewards, floor design

**[Patch C — `table_buyin_telemetry` ownership gap]**
Not blocking SRL admission. Must resolve at TIA PRD preflight or in the PRD itself.
The compact SRM TableContextService reference block carries the `⚠` warning.

```yaml
table_buyin_telemetry:
  posture: consumed_by_TableInventoryAccounting_for_telemetry_derived_drop_estimate
  ownership_gap: formal_owns_table_update_required_in_service_responsibility_overview
  blocker: not_blocking_semantic_extension
  must_resolve_by: TIA_PRD_preflight_or_PRD_itself
```

---

## Verification

**[P12]**

```bash
# SRM: compact references only, no inline semantic records
grep -n "Semantic Responsibility Reference" docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
grep -n "SEMANTIC_RESPONSIBILITY_LAYER" docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
grep -n "SRL-TIA-001" docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md

# SRL companion document exists
grep -n "Semantic Responsibility Layer" docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md
grep -n "srlversion" docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md

# SRL-TIA-001 carries the full records (not SRM)
grep -n "projected_table_win_loss_cents" docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml
grep -n "legacy_alias_disposition" docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml

# Directive accepted
grep -n "Status: Accepted" docs/issues/table-inventory-accounting-canon/thesaurus/SRM-SEMANTIC-RESPONSIBILITY-EXTENSION-DIRECTIVE.md

# SRL change log initialized
grep -n "v1.0.0" docs/20-architecture/SRL-CHANGE-LOG.md

# Thesaurus carries SRL-admitted authority note
grep -n "SRL-admitted" docs/issues/table-inventory-accounting-canon/thesaurus/TIA-CANON-EXEMPLAR-THESAURUS.md

# SRM absence checks — full records must NOT be in SRM body
grep -n "may_be_authored_by" docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md       # expect 0 hits
grep -n "must_not_be_rederived_by" docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md # expect 0 hits
```

---

## What This Plan Does NOT Cover

- Implementation code (service module, DTO TypeScript interface, migrations) — PRD phase
- `table_need_cents` — out of TIA exemplar scope; future candidate term; not admitted here
- Formal `table_buyin_telemetry` row addition to Service Responsibility Overview — flagged, deferred to TIA PRD
- Other services' semantic posture — only TIA exemplar in this slice
- Enforcement of SRL admission gate in CI/CD — separate governance tooling decision
