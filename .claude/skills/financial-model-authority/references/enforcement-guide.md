# Enforcement Guide — Financial Model Conformance

Use this when reviewing PRDs, EXEC-SPECs, code, or migration files that touch the financial
domain. It provides the complete non-conformant pattern list and a per-domain conformance
checklist.

---

## Non-Conformant Patterns (Exhaustive)

### Data Model Violations

| Pattern | Rule Violated | Correct Direction |
|---|---|---|
| PFT absorbs grind via `is_rated` column | ADR-052 §4 (explicitly rejected) | Maintain two separate authoring stores |
| `player_id` populated on a grind/Class B row | ADR-052 D1 (attribution absent by construction) | Class B must have `player_id = NULL` |
| `table_id` nullable or optional on any financial row | ADR-052 D2 (table-first anchoring) | `table_id NOT NULL` on every row in both classes |
| `fact_class` or `origin_label` absent from a row | ADR-052 D4 (discriminators required) | Both fields required at insert; make them NOT NULL enum columns |
| `fact_class` or `origin_label` changed after insert | ADR-052 D4 invariant (immutable) | Reclassify via new row in target class |
| TBT receiving dual-writes from both grind authoring and PFT derivation in the same column/row | ADR-052 D3 (no dual-write) | Grind and Rated must be distinguishable per row |
| Partial attribution — player partially populated on Class B | ADR-052 R5 (attribution is whole or absent) | Class B has no attribution; Class A has full chain |

### Propagation Violations

| Pattern | Rule Violated | Correct Direction |
|---|---|---|
| Authoring write committed; outbox insert in background job | ADR-054 D2 (same transaction, literal) | Both inserts inside one `BEGIN…COMMIT` |
| Authoring write committed; outbox insert via post-commit trigger | ADR-054 D2 | Trigger fires inside transaction is OK; post-commit is not |
| Two separate RPCs called sequentially and described as "atomic" | ADR-054 D2 | Single RPC or shared helper inside one transaction |
| Outbox event emitted from a projection or read model | ADR-054 C1 (author-exclusive) | Only the authoring write may emit |
| Consumer writing to PFT or grind authoring store | ADR-054 D4 (consumers are projection-only) | Consumers update projections/caches only |
| Consumer changing `origin_label` on events it processes | ADR-054 D5 (immutable in transit) | Pass the label through unchanged |
| Mixing `Actual` + `Estimated` into a single unlabeled number | ADR-054 D5 (degradation required) | Degrade to `Estimated`; render labeled |
| `Compliance` values merged into `Actual`/`Estimated` aggregate | ADR-054 D5 (Compliance is parallel) | Render Compliance in a separate field |
| DB triggers performing cross-domain propagation outside outbox | ADR-054 D6 | Route through outbox; deprecate cross-domain triggers |
| UI recomputing financial state against PFT/grind to patch staleness | ADR-054 D7 | Render completeness label; do not patch |

### Surface Rendering Violations

| Pattern | Rule Violated | Correct Direction |
|---|---|---|
| Financial value rendered without `type` field | SURFACE-CONTRACT L1 | `type: 'actual' \| 'estimated' \| 'observed' \| 'compliance'` on every value |
| Label buried in API metadata / tooltip only | SURFACE-CONTRACT L2 | Labels must be visible at first glance |
| Field named "Total" or "Handle" without authority qualifier | SURFACE-CONTRACT L3 | Use "Rated", "Estimated", "Observed" — not "Total" |
| `completeness.status` omitted (defaulting to assumed "complete") | ADR-054 §4.3 | `status` is mandatory — use `'unknown'` if undeterminable |
| Treating `visit_financial_summary` as authoritative fact | CONTRACT §4.5 (derived only) | Reconstruct from canonical PFT facts for operator-facing truth |
| UNIONing `pit_cash_observation` into canonical financial totals | CONTRACT §4.3 | Operational telemetry and ledger facts must remain separate |
| UI blending unsaved client state into server-derived totals | CONTRACT C3 | Unsaved state displayed separately, never merged |

### Scope Violations

| Pattern | Rule Violated | Correct Direction |
|---|---|---|
| Feature computing "Total Drop" as authoritative output | ADR-053 D2 | Expose partial visibility with completeness labels |
| Variance resolution or "ledger vs reality" comparison in code | ADR-053 D3 | Expose data for external reconciliation; don't perform it |
| Shift-end settlement values declared as final | ADR-053 D2 | No final money positions from this system |
| Reconciliation logic inside any PT-2 service | ADR-053 D3 | System is one input to external reconciliation process |

### Authoring Parity Violations (ADR-055)

| Pattern | Invariant |
|---|---|
| Class B event omits a column Class A populates (even with NULL) | P1 |
| Class B uses `INSERT ... DEFAULT` for `event_id` instead of explicit UUID v7 | P1, P2 |
| Class B outbox insert in a separate transaction from authoring write | P2 |
| Class B validation is trigger-based while Class A is RPC-level | P3 |
| New `event_type` launched for Class A before Class B can support it | P4 |

---

## Conformance Checklist by Domain

A change is conformant when all applicable items pass.

### Service / Migration Author

- [ ] Identified the fact class (Class A, Class B, Compliance, Loyalty, projection)
- [ ] Authoring write uses the declared RPC for that class
- [ ] No direct inserts into `player_financial_transaction` (outside seed/test)
- [ ] `table_id NOT NULL` on all new financial rows
- [ ] `fact_class` and `origin_label` are explicit NOT NULL columns on any new authoring table
- [ ] If Class A: `player_id NOT NULL` enforced
- [ ] If Class B: `player_id` is nullable; no grind row ever populates it
- [ ] Outbox insert is inside the same transaction as the authoring write (or noted as a known gap against GAP-F1)
- [ ] `event_id` generated at authoring boundary with UUID v7
- [ ] No cross-domain trigger writes to another domain's authoritative store

### API / DTO Author

- [ ] Every financial DTO field includes `{ value, type, source, completeness: { status } }`
- [ ] `type` is one of `'actual' | 'estimated' | 'observed' | 'compliance'` — never omitted
- [ ] `completeness.status` is always present — `'unknown'` is a valid value, silence is not
- [ ] Mixed-authority aggregates: authority degraded to lowest present (Actual > Observed > Estimated)
- [ ] `Compliance` values in a separate DTO field, never merged with the authority ladder
- [ ] Bridge DTO fields (PRD-072) do not have `financialValueSchema` applied or cents conversion

### Frontend / UI Author

- [ ] Authority label visible to user — not tooltip-only
- [ ] No field named "Total" or "Handle" without an authority qualifier
- [ ] `visit_financial_summary` used only as a projection, not as authoritative fact
- [ ] Mixed sources shown separately (Split Display Pattern) or as labeled derived total
- [ ] Attribution Ratio (`Rated / (Rated + Estimated)`) is the only place Class A + B volumes are compared
- [ ] Completeness status rendered — `unknown` triggers a visible indicator, not silent assumption of complete
- [ ] UI does not recompute financial state against authoring stores

### PRD / Spec Reviewer

- [ ] No claim of "Total Drop" as authoritative output
- [ ] No reconciliation step inside the system
- [ ] All financial surfaces declare authority in design specs
- [ ] Bridge DTO fields identified and sunset trigger named if used
- [ ] GAP-F1 dependency flagged if spec assumes outbox producers exist
- [ ] If new fact type proposed: write boundary, storage, authority, and labeling all declared
- [ ] If new projection proposed: inputs declared, labeled as derived, completeness semantics defined
