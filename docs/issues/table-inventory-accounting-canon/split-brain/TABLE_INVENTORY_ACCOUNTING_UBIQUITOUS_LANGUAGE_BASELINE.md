## Classification Binding

This language baseline is bound to FIB-H-TIA-CANON-001.

The Table Inventory Accounting canonization slice is a CLS-002 read-composition feature
with the `canonical_derived_model` qualifier and a CLS-006 surface-value consequence.

It is not:
- an authoring feature;
- a projection-input feature;
- an outbox producer or consumer feature;
- a transactional-outbox replay slice;
- a UI-side formula patch.

The canonical table-result value is produced by the TableInventoryAccounting service/BFF
boundary from existing inventory authoring stores and the approved telemetry-derived
drop-estimate input. The Pit Terminal Rundown renders the shaped DTO. It must not
recompute formula path, completeness, custody status, or missing inputs from raw fields.

---

## Drop Semantics

**Drop** means the amount established from the table drop-box custody/count process.

In PT-2, drop must not be inferred from live table activity, player buy-ins, grind observations, PFT totals, or table-buy-in telemetry.

During active play, PT-2 may know that cash-in activity occurred. It may display that as:

- observed buy-in activity
- cash-in activity observed
- drop activity present
- uncounted drop pending
- count pending

But those are activity/posture labels. They are not drop amounts.

PT-2 may receive or compute a **telemetry-derived drop estimate** (`telemetry_derived_drop_estimate_cents`) from approved PT-2 operational telemetry sources. **Concrete approved source (resolved 2026-05-27):** a session-scoped aggregate of `table_buyin_telemetry` (RATED_BUYIN + GRIND_BUYIN rows), filtered to the session window (`occurred_at >= session.opened_at AND occurred_at < COALESCE(session.closed_at, NOW())`). `source_authority.drop` must be set to `'telemetry_derived_estimate'` on every use. It must not be inferred from `observed_buyin_activity_cents`, PFT totals, drop activity indicators, drop-box movement events, or the same inventory formula inputs in a way that makes the projected win/loss formula circular. This is not drop. It is a non-custody, non-final estimate used as an input to `projected_table_win_loss_cents`. It carries `custody_status = non_custody_estimate` on every use.

### Canonical rule

No posted, counted, or externally verified drop amount → no `final_table_win_loss_cents` and no custody-authoritative Win/Loss.

A telemetry-derived drop estimate → `projected_table_win_loss_cents` (labeled "Projected Win/Loss", non-custody).

No drop input of any kind → `partial_table_result_cents` only (labeled "Partial Table Result — drop missing").

---

### Canonical drop taxonomy

| Canonical term | Meaning | Amount known? | Authority posture | Current PT-2 scope |
|---|---|---|---|---|
| `drop_activity_indicator` | Non-monetary signal that table activity may later produce drop | No | Operational / inferred | Allowed |
| `observed_buyin_activity_cents` | Cash-in / buy-in activity observed by PT-2. This is **not** drop. | Yes — but amount is buy-in activity, not drop | Telemetry | Allowed |
| `drop_box_removed_event` | Custody event showing box movement/removal. No amount implied. | No | Custody event, no amount | Terminology allowed only as a no-amount custody/posture event. Not an input to `projected_table_win_loss_cents`, not authored by this slice, and not evidence of custody-authoritative drop amount. |
| `telemetry_derived_drop_estimate_cents` | Non-custody, non-final drop-like estimate derived from PT-2 operational telemetry. Input to `projected_table_win_loss_cents` only. Must carry `custody_status = non_custody_estimate`. **Concrete source:** session-scoped aggregate of `table_buyin_telemetry` (RATED_BUYIN + GRIND_BUYIN), filtered to session window. `source_authority.drop = 'telemetry_derived_estimate'`. | Yes — estimated, not counted | Telemetry / operational estimate (`source=table_buyin_telemetry_session_aggregate`) | **Preferred** (this slice) |
| `RATED_ADJUSTMENT` | Legacy/current adjustment kind in `table_buyin_telemetry`. Non-canonical for `telemetry_derived_drop_estimate_cents`. | N/A | Excluded by semantic decision; may exist in legacy paths | **Excluded** — must not contribute to canonical session-scoped SUM (ADR-060 D2). Exclusion is semantic, not structural. Do not add without ADR/FIB amendment. |
| `posted_drop_amount_cents` | Manually posted drop amount entered after count/accounting activity | Yes | Manual posted count proxy | **Dangerous** — implies a finalized, posted accounting result. Unless sourced from an external count-room or custody authority, this term creates false-authority semantics and is non-compliant with ADR-053. Avoid for PT-2-internal use. |
| `counted_drop_amount_cents` | Count-room verified drop amount | Yes | Count-room verified custody fact | Future |
| `final_reconciled_drop_amount_cents` | Final accounting/reconciled drop. Out of PT-2 pilot authority. | Yes | External accounting finality | Out of scope |

No other concept may use the `drop_*_cents` or `*_drop_amount_cents` naming pattern.

---

### Forbidden collapse

```text
buy-in activity = drop
PFT total in = drop
grind = drop
drop box removed = drop amount
posted drop = final/reconciled drop
telemetry_derived_drop_estimate = custody-authoritative drop
input_completeness = complete → custody_status upgrades to external_custody_authoritative  (NEVER)
```

---

### Naming rules

Only amount values backed by a posted, counted, or reconciled drop source may use `drop_*_cents` or `*_drop_amount_cents`.

`telemetry_derived_drop_estimate_cents` is the sole exception: it names an estimated, non-custody value and is the preferred drop-like input for `projected_table_win_loss_cents` in this slice.

**Forbidden:**

```text
estimated_drop_buyins_cents        ← non-canonical; see migration warning below
running_drop_cents
drop_activity_cents
projected_drop_from_buyins_cents
recorded_operational_drop_cents    ← deprecated; reads too close to "posted drop"; use telemetry_derived_drop_estimate_cents
```

**Use instead:**

```text
telemetry_derived_drop_estimate_cents  ← preferred for PT-2 operational drop estimate (non-custody)
observed_buyin_activity_cents          ← buy-in telemetry, not drop
cash_in_activity_observed_cents
drop_activity_indicator                ← posture only, no amount
uncounted_drop_pending
```

Physical custody fields must use custody/event language:

```text
drop_box_removed_event
drop_box_removed_at
drop_custody_event
```

The words `final`, `reconciled`, and `settled` must not appear in any PT-2 drop or win/loss surface unless backed by external accounting authority.

**Migration warning:** `estimated_drop_buyins_cents` is a non-canonical surface/API name. The underlying data (`table_buyin_telemetry` session aggregate) is valid — it is the approved source for `telemetry_derived_drop_estimate_cents`. The name itself is non-canonical because it implies a drop amount rather than an estimated operational value. It must not be surfaced directly as a win/loss input or API field. Re-surface it as `telemetry_derived_drop_estimate_cents` with explicit provenance (`source_authority.drop = 'telemetry_derived_estimate'`, `custody_status = non_custody_estimate`). Until migrated, its display on dashboard/metrics surfaces must be suppressed when the exemplar lands — competing visible semantics are a split-brain violation (P0 gate condition).

---

### Surface rendering rules

**Live / running state** — may render:

```text
Drop activity present
Count pending
Observed buy-in activity
Uncounted drop pending
```

Must not render a dollar amount labeled as drop unless sourced from a posted, counted, or verified drop amount:

```text
Running Drop: $X    ← forbidden
Estimated Drop: $X  ← forbidden
Drop Total: $X      ← forbidden
```

**Projected win/loss state** — after `telemetry_derived_drop_estimate_cents` is present, may render:

```text
Projected Win/Loss: $X    ← required label when all PT-2 operational inputs are present
```

`Estimated Win/Loss` is forbidden — ADR-060 D4 removed it from the allowed list as ambiguous. Use `Projected Win/Loss` only.

Must carry the completeness envelope (see below). Must not use "Win/Loss", "Final Win/Loss", "Total Drop", "Posted Drop", "Settled Result", or "Reconciled Result".

**Partial result state** — when no drop-like input is present:

```text
Partial Table Result: $X    ← required label; must disclose missing inputs
```

Must not use "Win/Loss" or any variant.

**Reserved future posted-drop state — forbidden in this slice**

A future slice may introduce a posted or counted drop amount only after external
count-room, soft-count, or custody authority is integrated and an ADR/FIB amendment
authorizes the new custody input.

Until then, no PT-2 surface in this slice may render:

```text
Posted Drop
Posted Drop Amount
Total Drop
Final Drop
Final Win/Loss
Win/Loss
```

The only in-scope labels are "Projected Win/Loss" and "Partial Table Result".

---

### Completeness envelope (required on every table-result surface value)

Every table-result value rendered at a surface boundary must carry:

| Field | Meaning |
|---|---|
| `completeness.status` | Whether all PT-2 expected operational inputs are present (`complete` / `partial` / `integrity_failure`). `integrity_failure` is active only when `integrity_issues` is non-empty; suppresses both result fields; mutually exclusive with `completeness.status=partial`. Only `complete` and `partial` apply when opener and closer are resolvable. |
| `custody_status` | Whether the value is custody-authoritative (`non_custody_estimate` / `external_custody_authoritative`) |
| `missing_inputs` | Explicit list of absent inputs when `completeness.status = partial`. Valid entries: `['drop_estimate']` only. Opener and closer are never valid entries here — their absence is a lifecycle failure, not a completeness gap. |
| `integrity_issues` | Populated when `opening_inventory_cents` or `closing_inventory_cents` is unresolvable from source data (no snapshot linked after all resolution paths exhausted). Valid entries: `'missing_opening_inventory_snapshot'`, `'missing_closing_inventory_snapshot'`. Non-empty suppresses all table-result values. Mutually exclusive with `completeness.status=partial`. Zero opener or closer is a valid explicit count and does NOT populate `integrity_issues`. |
| `calculation_kind` | Which formula path produced the value |
| `source_authority` | Origin of each significant input |

**Two-axis invariant:** `completeness.status = complete` never changes `custody_status`. A projected table result may be complete relative to PT-2 operational inputs while remaining `non_custody_estimate` and non-final. These two axes are orthogonal and must never be collapsed.

**Lifecycle invariant:** `opening_inventory_cents` and `closing_inventory_cents` are required lifecycle snapshots, not optional completeness inputs. Their absence is not a partial-result state — it is a lifecycle/data-integrity failure that populates `integrity_issues` and suppresses all table-result values. Only `telemetry_derived_drop_estimate_cents` absence is a normal partial-result state.

Bare financial numbers without the completeness envelope are forbidden at all surface boundaries.

---

### Table-result semantics: projected, final, and partial values

Win/Loss has two distinct meanings and must not be collapsed.

#### `projected_table_win_loss_cents`

- **In scope** for this slice.
- PT-2 operational estimate produced from inventory inputs and a telemetry-derived drop estimate.
- `custody_status = non_custody_estimate` always.
- `input_completeness = complete` when all PT-2 operational inputs are present; does not imply custody-final authority.
- **Surface label:** "Projected Win/Loss" only.
- Must never use "Win/Loss" (unqualified), "Final Win/Loss", "Total Drop", "Posted Drop", "Settled Result", or "Reconciled Result".

#### `final_table_win_loss_cents`

- **Out of scope** for this slice.
- Requires external count-room / soft-count / custody authority.
- Requires ADR/FIB amendment before it may be introduced.
- `custody_status = external_custody_authoritative`.
- Reserved surface label: "Win/Loss" (unqualified) or "Final Win/Loss".

#### `partial_table_result_cents`

- **In scope** for this slice when no drop-like input is present.
- Inventory-side inputs only (opener, closer, fills, credits); drop input always missing.
- `custody_status = non_custody_estimate`, `input_completeness = partial`.
- **Surface label:** "Partial Table Result" only. Must disclose missing inputs.

---

### Canonical projected win/loss formula

```text
projected_table_win_loss_cents =
  telemetry_derived_drop_estimate_cents
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

This formula uses `telemetry_derived_drop_estimate_cents` as the drop-like input.

It must **not** use:

- `observed_buyin_activity_cents`
- `drop_activity_indicator`
- `drop_box_removed_event`

If the drop-like input is missing, the surface must show a partial operational result under the label:

```text
Partial Table Result — drop missing
```

It must not render the label "Win/Loss" (unqualified) or "Projected Win/Loss" when the drop-like input is absent.

---

### `final_table_win_loss_cents` formula (out of scope)

The posted-drop / custody-authoritative formula is reserved for a future slice with external custody integration:

```text
final_table_win_loss_cents =
  posted_or_counted_drop_amount_cents    ← requires external custody authority
  + closing_inventory_cents
  + credits_cents
  - opening_inventory_cents
  - fills_cents
```

This formula may only be used when `posted_or_counted_drop_amount_cents` is sourced from an external count-room, soft-count, or custody authority. It requires ADR/FIB amendment. It must not be approximated by `telemetry_derived_drop_estimate_cents`.

---

### Partial values vs. false finality

Partial values are allowed. False finality is forbidden.

```text
No counted/final custody authority → no final_table_win_loss_cents.
No drop input of any kind → no projected_table_win_loss_cents; only partial_table_result_cents.
Telemetry-derived drop estimate → projected_table_win_loss_cents (labeled, non-custody).
input_completeness = complete + non_custody_estimate → projected Win/Loss, never final Win/Loss.
```

---

### Maxim

```text
Activity is not drop.
Removal is not amount.
Estimated is not final.
Posted is not final.
Final is not PT-2 pilot authority.
Complete inputs do not upgrade custody status.
```
