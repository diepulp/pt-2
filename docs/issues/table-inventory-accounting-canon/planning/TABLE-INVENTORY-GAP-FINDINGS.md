Now I have all the raw findings. Let me synthesize the full report.

---

## Synthesis: Table Inventory Snapshot Semantic Investigation

### The Core Tension

The scaffold (`SCAFFOLD-TABLE-INVENTORY-CANON.md §1`) introduced a **semantic patch** that corrects FIB-H's original typing. This patch is the critical issue:

| Dimension                      | FIB-H (original)                           | Scaffold patch (governing)                                                                          |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `opening_inventory_cents` type | `number \| null` — nullable input          | `number` — required lifecycle snapshot; zero is valid, unresolvable null is a **lifecycle failure** |
| `closing_inventory_cents` type | `number \| null` — nullable input          | `number` — required lifecycle snapshot; same invariant                                              |
| Opener/closer absent →         | `missing_inputs` (partial result path)     | `integrity_issues` (all table-result values **suppressed**)                                         |
| Drop absent →                  | `missing_inputs` (partial result path)     | `missing_inputs` — **normal** partial result state                                                  |
| `partial_table_result_cents`   | Non-null when opener/closer or drop absent | Non-null only when opener+closer+fills+credits present **and** drop absent                          |

The classification YAML does not yet reflect this patch — it still permits opener/closer in `missing_inputs`. The scaffold freezes this as the canonical authority; the classification YAML needs a conformance amendment before the PRD gate opens.

---

### What the Current System Actually Produces

#### Opening snapshot producer

`rpc_open_table_session()` does **not** capture or require an opening snapshot. Instead, via **PRD-059**, it chains: it inherits the predecessor session's `closing_inventory_snapshot_id` as the new session's `opening_inventory_snapshot_id`. This means:

- **Sessions after the first** have an opener *if* the predecessor closed with a closing inventory snapshot.
- **The very first session on a table** has `opening_inventory_snapshot_id = NULL` — no producer exists for a standalone opener at session open time.
- **If the predecessor was force-closed** without a snapshot (only `drop_event_id` provided), the chain breaks and the new session's opener is NULL.

#### Closing snapshot producer

`rpc_close_table_session()` accepts `p_closing_inventory_snapshot_id` as an optional parameter. The only hard requirement is "at least one closing artifact" — either a snapshot **or** a `drop_event_id`. This means sessions can legitimately close with no closing inventory snapshot if a drop event was provided instead.

#### Fills and credits

Fills and credits are **denormalized totals** on `table_session` (`fills_total_cents`, `credits_total_cents` — both `NOT NULL DEFAULT 0`). These are always resolvable and can never be null. The slice's invariant that zero fills/credits is valid is already satisfied.

#### Current win formula

```sql
-- rpc_compute_table_rundown (20260117153727_adr027_rpc_rundown.sql:168-179)
IF drop_posted_at IS NOT NULL AND drop_total_cents IS NOT NULL THEN
  table_win_cents := closing + credits + drop - opening - fills
ELSE
  table_win_cents := NULL  -- "PATCHED behavior"
END IF
```

The current system **gates win on drop**, not on opener/closer. There is no `partial_table_result_cents` path — if drop is absent, the result is an opaque null. The "PATCHED behavior" comment in `rundown.ts:7` signals this is already known to be provisional.

#### telemetry_derived_drop_estimate_cents

This field **does not exist** as a stored column anywhere. The closest thing is `estimated_drop_buyins_cents` returned by `rpc_shift_table_metrics()` — which sums all `table_buyin_telemetry.amount_cents` (RATED_BUYIN + GRIND_BUYIN). The FIB explicitly prohibits this as a drop input (Non-goal §G.7: "No telemetry bridge from buy-ins into 'drop' or win/loss"). The source for `telemetry_derived_drop_estimate_cents` is declared open in FIB-H §L and must be resolved in the PRD.

---

### Legacy Streams Slated for Deletion

The classification YAML identifies these as owned by dashboard/shift-metrics layer and scheduled for retirement:

| Field                            | Location                                  | Status                             |
| -------------------------------- | ----------------------------------------- | ---------------------------------- |
| `win_loss_inventory_cents`       | `ShiftTableMetricsDTO`, analytics panel   | Retire                             |
| `win_loss_estimated_cents`       | `ShiftTableMetricsDTO`                    | Retire                             |
| `win_loss_estimated_total_cents` | `CasinoShiftMetricsDTO`                   | Retire                             |
| `estimated_drop_buyins_cents`    | `ShiftTableMetricsDTO`                    | Retire                             |
| `table_win_cents`                | `TableRundownDTO`, `table_rundown_report` | Retire (replaced by canonical DTO) |

The `RundownSummaryPanel` currently renders its win/loss from `table_win_cents` via `useTableRundown()`. It will need to be rewired to consume `TableInventoryAccountingProjectionDTO`.

---

### Gap Map: Current State vs. Slice Requirements

| Requirement (from scaffold)                               | Current system                                                                       | Gap                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Opening snapshot always resolvable or `integrity_issues`  | Opening is NULL for first session and after force-close-without-snapshot             | **Gap**: No mandatory opener capture at session open; chain can silently break |
| Closing snapshot always resolvable or `integrity_issues`  | Close can succeed with only a drop event, no snapshot                                | **Gap**: Close path does not require a snapshot                                |
| `partial_table_result_cents` when drop absent             | Returns opaque NULL; no partial result path exists                                   | **Gap**: No partial-result path in any current RPC or DTO                      |
| `projected_table_win_loss_cents` (all 5 inputs present)   | `table_win_cents` (requires drop posted, not drop estimated)                         | **Gap**: Formula gated on posted drop, not telemetry-derived drop estimate     |
| `telemetry_derived_drop_estimate_cents` as named input    | Not a column anywhere; `estimated_drop_buyins_cents` is buy-in telemetry (forbidden) | **Gap**: Input source is undefined; FIB §L open question blocks PRD            |
| `integrity_issues` vs `missing_inputs` distinction        | No such distinction; all absent = opaque null                                        | **Gap**: No semantic distinction between lifecycle failure vs. partial result  |
| Legacy formula deletion concurrent with exemplar delivery | Legacy streams coexist with rundown                                                  | **Gap**: Not yet deleted; split-brain active                                   |

---

### What This Means for the Slice

**The PRD cannot open** until FIB-H §L open question is resolved: what is the approved PT-2 operational source for `telemetry_derived_drop_estimate_cents`? The buy-in telemetry (`estimated_drop_buyins_cents`) is explicitly forbidden. If no approved source exists, the PRD must declare it null for MVP, making the slice always render "Partial Table Result" at launch.

**The snapshot producer gap is structural.** The slice reads from `table_inventory_snapshot.total_cents` via the existing dual-path resolution in `rpc_compute_table_rundown`. But the `opening_inventory_snapshot_id` can be NULL for the first session of a table, and `closing_inventory_snapshot_id` can be NULL if close was done via drop event only. The new service module must implement the scaffold's `integrity_issues` path precisely — null opener or closer must suppress all table-result values and populate `integrity_issues`, not silently degrade to `partial_table_result_cents`.

**The current formula is a stub.** `table_win_cents` in the existing rundown is the "PATCHED" placeholder; it is already expected to be replaced. The new canonical DTO must split this into `projected_table_win_loss_cents` (five-input formula) and `partial_table_result_cents` (four-input, drop absent) with explicit completeness envelope on both.