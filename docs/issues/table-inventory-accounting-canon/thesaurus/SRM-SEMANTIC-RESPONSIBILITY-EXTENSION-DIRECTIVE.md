# SRM Semantic Responsibility Extension Directive

**Document type:** proposed principle directive  
**Status:** Accepted  
**Effective:** 2026-05-29  
**Scope:** PT-2 system-wide semantic governance; Service Responsibility Matrix extension  
**Applies to:** SRM, ADRs, FIBs, PRDs, EXEC specs, UL/thesaurus artifacts, DTO/API contracts, service-layer boundaries  
**Purpose:** Bind canonical terminology to bounded-context ownership so the system has one law of meaning rather than a growing pile of competing glossaries.

---

## 1. Problem Statement

PT-2 is no longer dealing only with implementation drift or surface split-brain. It is dealing with semantic authority fragmentation.

The failure pattern is:

```text
same word → different meaning
same value → different authority
same surface → different epistemic claim
same domain → multiple local dialects
```

This is more dangerous than ordinary implementation defects. A broken implementation usually fails locally. A broken semantic layer allows the system to keep running while making contradictory claims through different services, DTOs, projections, and UI surfaces.

The prior Table Inventory Accounting canonization work surfaced this clearly. Terms such as `drop`, `win/loss`, `need`, `projected`, `estimated`, `partial`, and `final` are not merely labels. They encode what the system knows, how it knows it, who owns the claim, and what authority the system is allowed to assert.

If those meanings are maintained only in standalone UL or thesaurus artifacts, PT-2 will recreate semantic split-brain in planning mode. The thesaurus becomes another competing authority rather than a stabilizing index.

---

## 2. Core Principle

Canonical terminology must be owned by the same bounded context, service, or subdomain that owns the fact, derivation, projection, or surface contract represented by the term.

```text
UL without SRM binding = vocabulary drift
UL with SRM binding = domain model
```

The Service Responsibility Matrix is therefore extended from a table/service ownership contract into a semantic responsibility contract.

The SRM remains the system's bounded-context authority. The semantic extension makes explicit that bounded contexts do not only own tables and write paths. They also own the canonical meanings of the values they author, derive, expose, or render.

---

## 3. Directive

The PT-2 semantic layer must be SRM-bound.

A term may become system-wide canonical only when it declares:

1. **Owning bounded context / service / subdomain**
2. **Semantic class**
3. **Epistemic claim** — what the system knows
4. **Source-of-knowledge rule** — how the system knows it
5. **Authority posture** — what the system may claim from it
6. **Boundary contract** — where the term may cross DTO/API/UI/report boundaries
7. **Forbidden re-derivation paths** — which consumers may not recompute or relabel it
8. **Enforcement hook** — schema invariant, service invariant, DTO test, acceptance test, or suppression gate

If a term lacks these fields, it is not canonical. It is candidate language only.

---

## 4. Authority Model

### 4.1 SRM owns semantic placement

The SRM determines which service or subdomain owns a canonical term.

A glossary, thesaurus, FIB, PRD, or EXEC spec may not independently canonize terminology outside the SRM ownership model.

### 4.2 ADRs change semantic authority

An ADR may introduce, amend, reserve, or retire canonical terminology, but it must bind each term to SRM ownership.

An ADR that defines terminology without an owning bounded context is incomplete.

### 4.3 UL / thesaurus indexes accepted language

The UL or thesaurus artifact is an index of accepted terminology. It is not an independent source of semantic authority.

It may contain:

- accepted canonical terms;
- ADR-authorized reserved future terms;
- candidate terms explicitly marked as under consideration.

It must not become a blacklist, rejected-word museum, or parallel decision record.

### 4.4 PRDs implement semantic contracts

A PRD may implement only the semantic contract already bound by SRM and ADR.

A PRD may not introduce a new canonical term, result state, authority claim, or surface label unless an SRM/ADR amendment has admitted it first.

### 4.5 Tests enforce semantic boundaries

Every canonical term that crosses a system boundary must have at least one enforcement mechanism.

Examples:

- DTO contract test proves the field shape and label.
- Service test proves the source predicate.
- UI test proves no competing surface label renders.
- Suppression inventory proves legacy local formulas are removed or blocked.
- Schema constraint prevents invalid authority classification.

---

## 5. Required Semantic Responsibility Record

Every new canonical term must be represented in an SRM semantic responsibility record.

Recommended shape:

```yaml
term: projected_table_win_loss_cents
owning_context: TableContextService
owning_subdomain: TableInventoryAccounting
semantic_class: derived_surface_value
status: canonical

what_the_system_knows: >
  PT-2 has computed a table-result value from the canonical table inventory
  formula using a telemetry-derived drop estimate and inventory-side inputs.

how_the_system_knows: >
  Read-time derivation from session-scoped telemetry and TableContext-owned
  inventory inputs through the TableInventoryAccounting service boundary.

authority_posture: non_custody_estimate
allowed_surface_label: Projected Win/Loss

source_inputs:
  - telemetry_derived_drop_estimate_cents
  - opening_inventory_cents
  - closing_inventory_cents
  - fills_cents
  - credits_cents

may_be_authored_by:
  - none # derived value; no authoring store

may_be_derived_by:
  - TableContextService.TableInventoryAccounting

may_be_rendered_by:
  - consumers of TableInventoryAccountingProjection only

must_not_be_rederived_by:
  - dashboard components
  - route-local formula paths
  - shift metric RPCs
  - UI components reading raw inventory fields

boundary_contract:
  dto: TableInventoryAccountingProjection
  api: table inventory accounting projection endpoint
  ui: only through projection-consuming surfaces

enforcement:
  - DTO contract test
  - formula test
  - forbidden local formula search
  - active-surface suppression gate
```

---

## 6. Semantic Classes

The SRM extension should use a small, stable set of semantic classes. New classes require ADR review.

```yaml
semantic_classes:
  authored_fact:
    meaning: A domain fact written by its owning service.
    examples:
      - player_financial_transaction
      - table_fill
      - table_credit

  telemetry_fact:
    meaning: A non-authoritative operational observation or estimate.
    examples:
      - grind observation
      - table buy-in telemetry

  dependency_event:
    meaning: An operational transition required by projections but not itself a financial authority fact.
    examples:
      - fill recorded as projection input
      - credit recorded as projection input

  derived_surface_value:
    meaning: A value computed for display or API consumption from canonical inputs.
    examples:
      - projected_table_win_loss_cents
      - partial_table_result_cents

  lifecycle_state:
    meaning: A state describing whether a workflow or session is open, closed, complete, partial, or failed.
    examples:
      - drop_estimate_state
      - calculation_kind

  authority_label:
    meaning: A label describing what authority the system may claim.
    examples:
      - actual
      - estimated
      - non_custody_estimate

  surface_label:
    meaning: Human-facing label for a canonical value.
    examples:
      - Projected Win/Loss
      - Partial Table Result

  reserved_future_term:
    meaning: ADR-authorized vocabulary that is intentionally not implemented in the current slice.
    examples:
      - final_table_win_loss_cents
      - counted_drop_amount_cents
```

---

## 7. Thesaurus Role After This Directive

The thesaurus becomes a semantic index, not a semantic legislature.

It may answer:

- What is the accepted term?
- Which bounded context owns it?
- Which ADR admitted it?
- Which DTO/API boundary exposes it?
- Which aliases are observed in legacy code and how are they disposed?

It may not answer independently:

- What should this concept mean?
- Which service owns this value?
- Whether a surface may render this label?
- Whether a future term may be implemented now?

Those answers belong to SRM ownership plus ADR decision records.

---

## 8. Legacy Alias Handling

Noncanonical language already present in code or documents must not be promoted into the thesaurus as accepted terminology.

It belongs in a legacy alias disposition ledger.

Recommended shape:

```yaml
observed_alias: win_loss_estimated_cents
observed_location:
  - components/pit/hero-win-loss-compact.tsx
  - services/table-context/rundown.ts
canonical_target: projected_table_win_loss_cents
disposition: suppress_or_map_before_boundary
may_cross_canonical_boundary: false
owner: TableContextService.TableInventoryAccounting
required_action: >
  Delete, suppress, or map before TableInventoryAccountingProjection reaches
  an operator-visible surface.
```

This keeps legacy terms actionable without granting them canonical status.

---

## 9. Admission Rule for New Terms

A new term may be admitted only through one of three paths.

### 9.1 Direct SRM ownership amendment

Use when the term is obviously owned by an existing bounded context and does not change architectural semantics.

Example:

```text
Add a new DTO echo field whose source table and owner are already clear.
```

### 9.2 ADR-backed semantic amendment

Use when the term changes authority, formula, source predicate, result state, projection ownership, or operator-visible meaning.

Example:

```text
Introduce counted_drop_amount_cents as a future custody-authoritative input.
```

### 9.3 Candidate term review

Use when a term is being considered but not yet admitted.

Candidate terms must declare:

- candidate owner;
- reason for consideration;
- competing alternatives;
- decision horizon;
- current prohibition on implementation.

Candidate terms must not appear in DTOs, migrations, API contracts, or UI labels until accepted.

---

## 10. Zachman-Informed Semantic Admission Lens

The SRM semantic extension uses the Zachman interrogatives as a completeness
lens for admitting canonical terminology.

This does not adopt Zachman as a process framework. It uses the interrogatives
only to ensure that admitted terms are not vague labels detached from ownership,
source, timing, authority, or purpose.

Every admitted canonical term MUST answer:

| Interrogative | Question |
|---|---|
| **What** | What is being named? |
| **How** | How is it produced, derived, authored, or rendered? |
| **Where** | Where does it live, and where may it cross boundaries? |
| **Who** | Who owns it, and who may consume it? |
| **When** | When is it valid, null, partial, stale, suppressed, or out of scope? |
| **Why** | Why does it exist, and which ambiguity does it eliminate? |

A term that cannot answer all six is not admitted as canonical system language.
It remains candidate language until the missing dimensions are resolved.

### 10.1 Gate, not deliverable factory

Zachman interrogatives are a gate, not a deliverable factory.

Answer the six questions compactly within the semantic responsibility record.
Do not create six new artifacts per term. The record shape in Section 5 maps
cleanly to all six interrogatives — that is the intended delivery surface.

### 10.2 Framework alignment

Three layers of doctrine govern semantic admission:

- **DDD** supplies the doctrine: ubiquitous language must be shared within a bounded context.
- **SRM** supplies the ownership: this bounded context owns this meaning.
- **Zachman** supplies the completeness check: what / how / where / who / when / why are all answered.

A term is canonical when all three layers are satisfied.

---

## 11. Enforcement Rules

### Rule 1 — No ownerless canonical terms

A term without an SRM owner is not canonical.

### Rule 2 — No glossary-only authority

Appearing in a UL or thesaurus artifact does not make a term canonical.

### Rule 3 — No boundary crossing without contract

A term may not cross DTO/API/UI/report boundaries unless its boundary contract is defined.

### Rule 4 — No consumer re-derivation

Consumers may render canonical values, but may not recompute their meaning from raw fields unless the SRM record explicitly grants derivation authority.

### Rule 5 — No authority upgrade by surface

A surface may not relabel a value into a stronger authority claim than the owning service emitted.

### Rule 6 — No future term implementation by implication

Reserved future vocabulary is not implementation permission.

### Rule 7 — No blacklist canon

The thesaurus must not invent or preserve rejected terminology as a parallel negative vocabulary. Existing legacy names are tracked only as observed aliases with dispositions.

---

## 12. Application to Table Inventory Accounting

For the TIA exemplar, the semantic responsibility extension implies:

```yaml
owning_context: TableContextService
owning_subdomain: TableInventoryAccounting
role: read-time derived semantic authority for table-result values

owns_terms:
  - projected_table_win_loss_cents
  - partial_table_result_cents
  - final_table_win_loss_cents # reserved/null in this slice
  - drop_estimate_state
  - calculation_kind
  - table_need_cents

consumes_terms:
  - telemetry_derived_drop_estimate_cents
  - opening_inventory_cents
  - closing_inventory_cents
  - fills_cents
  - credits_cents

does_not_own:
  - player financial transactions
  - custody drop
  - count-room totals
  - posted accounting results
  - reconciliation
  - compliance facts

semantic_rule: >
  TableInventoryAccounting may derive table-result language from canonical
  TableContext-owned inputs and approved telemetry-derived estimate inputs.
  It may not author financial facts, claim custody authority, or permit
  downstream surfaces to rederive competing win/loss-like values.
```

---

## 13. Acceptance Criteria for This Directive

- [x] SRL companion authority created → `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md`
- [x] SRM references SRL without inlining semantic records → SRM v4.27.0
- [x] TIA exemplar records its canonical terms → `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml`
- [x] Thesaurus identifies itself as SRL-admitted, SRM-bound accepted-language index → authority note added to TIA-CANON-EXEMPLAR-THESAURUS.md
- [x] PRD acceptance gates reference semantic owner, DTO boundary, suppression → SRL enforcement section (SEMANTIC_RESPONSIBILITY_LAYER.md §7) + SRL-TIA-001 boundary_contract
- [x] Future PRDs cannot introduce canonical terms without SRL admission + SRM owner binding → SRL admission rule (SEMANTIC_RESPONSIBILITY_LAYER.md §4)
- [x] Every admitted term's record answers all six Zachman interrogatives → `docs/issues/table-inventory-accounting-canon/thesaurus/TIA-CANON-THESAURUS-ZACHMAN.yaml`

---

## 14. Final Principle

PT-2 does not need more words. It needs a law of meaning.

The SRM is that law.

The semantic layer must therefore be governed by the same bounded-context discipline that already stabilizes the service layer:

```text
service owns fact
service owns derivation
service owns term
service owns boundary
consumer renders, but does not reinterpret
```

That is the system-wide semantic responsibility principle.
