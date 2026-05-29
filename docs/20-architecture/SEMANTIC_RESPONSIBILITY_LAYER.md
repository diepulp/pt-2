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

# Semantic Responsibility Layer

> **Version**: 1.0.0
> **Date**: 2026-05-29
> **Status**: CANONICAL
> **Purpose**: Companion semantic authority registry bound to SRM service/table ownership.

---

## 1. Purpose and Scope

The Semantic Responsibility Layer (SRL) is the companion authority to the Service Responsibility Matrix (SRM). The SRM owns service and table ownership boundaries. The SRL owns meaning.

- SRL is the semantic authority registry for canonical terms, epistemic claims, accepted thesauri, Zachman admission records, and legacy alias disposition ledgers.
- Every SRL entry binds to an SRM-owned service, bounded context, or subdomain. A canonical term without an SRM owner is invalid.
- SRL does not replace the SRM. SRM does not inline SRL records.

The SRL was created by the SRM Semantic Responsibility Extension Directive to close its acceptance criteria loop. The TIA Canon exemplar (FIB-H-TIA-CANON-001) is the first and anchoring SRL entry, governed by ADR-059/060/061.

---

## 2. SRM/SRL Separation Principle

```
SRM owns:                          SRL owns:
  service ownership                  semantic admission rules
  table ownership                    admitted extension registry
  write/read authority               canonical term ownership
  cross-context rules                epistemic claims
  compact SRL references             accepted thesauri
                                     Zachman admission records
                                     legacy alias disposition ledgers

Binding rule:
  every SRL term MUST bind to an SRM owner
  SRM MUST NOT inline full SRL records
  thesaurus authority flows through SRL admission + SRM owner binding
```

**SRM = what does this service own and what may it write.**
**SRL = what does this service mean, and what authority may it claim.**

A term without an SRM owner is not canonical.

---

## 3. Authority Order

```
1. ADR decisions — introduce, amend, reserve, or retire canonical terminology;
   must bind each term to SRM ownership

2. DTO contract — the admitted DTO shape is authoritative at the boundary

3. PRD acceptance tests — enforce semantic contracts in the running system

4. Thesaurus — SRL-admitted, SRM-bound accepted-language index;
   carries canonical force through SRL admission and ADR/DTO/test binding;
   not an independent semantic legislature
```

---

## 4. Semantic Admission Rule

A term is canonical only when its SRL record declares all eight fields:

1. Owning bounded context / service / subdomain
2. Semantic class
3. Epistemic claim (what the system knows)
4. Source-of-knowledge rule (how the system knows it)
5. Authority posture (what the system may claim)
6. Boundary contract (where the term may cross DTO/API/UI/report boundaries)
7. Forbidden re-derivation paths (which consumers may not recompute or relabel it)
8. Enforcement hook (schema invariant, service invariant, DTO test, acceptance test, or suppression gate)

If a term lacks these fields, it is not canonical. It is candidate language only.

---

## 5. Zachman-Informed Admission Lens

Every admitted term must answer all six interrogatives within its semantic responsibility record. Do not create six separate artifacts per term — the record shape in Section 10 maps cleanly to all six.

| Interrogative | Question |
|---|---|
| **What** | What is being named? |
| **How** | How is it produced, derived, authored, or rendered? |
| **Where** | Where does it live, and where may it cross boundaries? |
| **Who** | Who owns it, and who may consume it? |
| **When** | When is it valid, null, partial, stale, suppressed, or out of scope? |
| **Why** | Why does it exist, and which ambiguity does it eliminate? |

Full records live in the SRL extension artifact (e.g., `SRL-TIA-001-table-inventory-accounting.yaml`). The TIA Zachman proof document is at `docs/issues/table-inventory-accounting-canon/thesaurus/TIA-CANON-THESAURUS-ZACHMAN.yaml`.

---

## 6. Semantic Class Registry

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

---

## 7. Enforcement Rules

### Rule 1 — No ownerless canonical terms

A term without an SRM owner is not canonical.

### Rule 2 — No glossary-only authority

Appearing in a UL or thesaurus artifact does not make a term canonical.

### Rule 3 — No boundary crossing without contract

A term may not cross DTO/API/UI/report boundaries unless its boundary contract is defined.

### Rule 4 — No consumer re-derivation

Consumers may render canonical values, but may not recompute their meaning from raw fields unless the SRL record explicitly grants derivation authority.

### Rule 5 — No authority upgrade by surface

A surface may not relabel a value into a stronger authority claim than the owning service emitted.

### Rule 6 — No future term implementation by implication

Reserved future vocabulary is not implementation permission.

### Rule 7 — No negative vocabulary canon

The thesaurus must not invent or preserve rejected terminology as a parallel negative vocabulary. Existing legacy names are tracked only as observed aliases with dispositions.

---

## 8. Admitted Extension Registry

| ID | SRM Owner | Subdomain | Status | Full Record |
|---|---|---|---|---|
| SRL-TIA-001 | TableContextService | TableInventoryAccounting | canonical | `docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml` |

**Ownership gap registered (SRL-TIA-001):** `table_buyin_telemetry` is consumed by `TableInventoryAccounting` as its primary telemetry input table but is not yet listed in the main SRM Service Responsibility Overview `Owns Tables` column.

```yaml
table_buyin_telemetry_gap:
  blocks_srl_admission: false
  blocks_tia_prd_execution: yes_unless_explicitly_resolved
```

Must resolve at TIA PRD preflight or in the PRD itself. Not blocking for SRL admission.

---

## 9. Admission Paths for New Terms

### 9.1 Direct SRM ownership amendment

Use when the term is obviously owned by an existing bounded context and does not change architectural semantics — for example, adding a new DTO echo field whose source table and owner are already clear.

### 9.2 ADR-backed semantic amendment

Use when the term changes authority, formula, source predicate, result state, projection ownership, or operator-visible meaning — for example, introducing `counted_drop_amount_cents` as a future custody-authoritative input.

### 9.3 Candidate term review

Use when a term is being considered but not yet admitted. Candidate terms must declare: candidate owner, reason for consideration, competing alternatives, decision horizon, and current prohibition on implementation. Candidate terms must not appear in DTOs, migrations, API contracts, or UI labels until accepted via path 9.1 or 9.2.

---

## 10. Semantic Responsibility Record Shape

```yaml
term: <field_name>
owning_context: <SRM service>
owning_subdomain: <service subdomain, if applicable>
semantic_class: <see Section 6>
status: canonical | reserved_null_this_slice | candidate
adr_basis: [<ADR-NNN decision refs>]

what_the_system_knows: >
  <epistemic claim — what fact or value PT-2 holds>

how_the_system_knows: >
  <source rule — derivation path, SUM predicate, formula, etc.>

authority_posture: <non_custody_estimate | custody_authoritative | ...>
allowed_surface_label: <human-facing label, or null if suppressed>

source_inputs:
  - <input field or table>

may_be_authored_by:
  - <service or null>

may_be_derived_by:
  - <service.subdomain>

may_be_rendered_by:
  - <consumers>

must_not_be_rederived_by:
  - <consumer types that may not recompute>

boundary_contract:
  dto: <DTO name>
  api: <endpoint or null>
  ui: <rendering constraint>

enforcement:
  - <DTO test | formula test | acceptance test | suppression gate>

zachman:
  what: <entity named>
  how: <derivation method>
  where: <boundary surface>
  who: <owner and consumers>
  when: <validity conditions>
  why: <ambiguity eliminated>
```
