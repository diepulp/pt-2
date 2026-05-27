The investigation is complete. Here is what the codebase reveals.

---

## Gap analysis: `telemetry_derived_drop_estimate_cents`

### The producer already exists — it is `table_buyin_telemetry`

The producer chain is:

```
Rated buy-in (PFT, direction='in', rating_slip_id IS NOT NULL)
  → trg_bridge_finance_to_telemetry (migration 20260116201236)
  → table_buyin_telemetry (telemetry_kind='RATED_BUYIN', source='finance_bridge')

Grind buy-in (direct RPC: rpc_log_table_buyin_telemetry)
  → table_buyin_telemetry (telemetry_kind='GRIND_BUYIN')
```

`table_buyin_telemetry` rows link to `rating_slip_id`, `visit_id`, `table_id`, `gaming_day`, and `amount_cents`. The existing `rpc_shift_table_metrics` already aggregates them into `estimated_drop_buyins_cents` (= `estimated_drop_rated_cents + estimated_drop_grind_cents`) and feeds that into `win_loss_estimated_cents`. The field name changes; the underlying data does not.

`telemetry_derived_drop_estimate_cents` is the canonical rename of `estimated_drop_buyins_cents` with explicit provenance: `source = pt2_operational_telemetry`, `custody_status = non_custody_estimate`.

---

### Why null is the wrong default framing

For any rated session — any session with an active rating slip and at least one PFT buy-in — `telemetry_derived_drop_estimate_cents` is non-null from the moment the first buy-in lands. It updates in real time as each PFT bridges through the trigger. Null is only structurally possible for an unrated session with zero GRIND_BUYIN entries.

The scaffold and FIB treated null as a routine operational state. It is not. For the exemplar surface (Pit Terminal Rundown on rated sessions), the drop estimate is always present. Null is an edge case specific to grind-only or zero-activity unrated sessions.

---

### The actual gap: scope mismatch

`rpc_shift_table_metrics` aggregates `table_buyin_telemetry` over a **gaming-day / time-window scope** (pit-level). The Pit Terminal Rundown is **session-scoped** (a single `table_session`). No session-scoped aggregation of `table_buyin_telemetry` currently exists in the rundown path.

```
rpc_shift_table_metrics         → shift/gaming_day window → estimated_drop_buyins_cents ✅
TableRundownDTO / rundown RPC   → single session          → no buy-in telemetry at all  ❌
```

The `TableInventoryAccounting` service module needs to sum `table_buyin_telemetry.amount_cents` filtered to the table session window (`table_id` + session open/close timestamps) to produce the session-scoped `telemetry_derived_drop_estimate_cents`.

---

### The FIB-H tension this resolves

FIB-H says "buy-in telemetry must not be called drop" and the regression test says "adding buy-in telemetry does not alter `projected_table_win_loss_cents`." These rules target the naive path — routing raw buy-in events directly into the formula without an explicit aggregation and provenance step. They do not prohibit the aggregated session sum from being the `telemetry_derived_drop_estimate_cents` input. The distinction the FIB enforces is:

```
WRONG: observed_buyin_activity_cents → direct formula input (no provenance)
RIGHT: table_buyin_telemetry session sum → telemetry_derived_drop_estimate_cents
         (source=pt2_operational_telemetry, custody_status=non_custody_estimate)
         → formula input
```

---

### What needs to be patched in the governance artifacts

1. **FIB-H §L open question** — name the producer explicitly: `table_buyin_telemetry` session aggregate (RATED_BUYIN + GRIND_BUYIN) is the approved PT-2 operational telemetry source for `telemetry_derived_drop_estimate_cents`.

2. **FIB-H §N vocabulary** — `telemetry_derived_drop_estimate_cents` source should read: derived from `table_buyin_telemetry` session-scoped sum; requires explicit `source_authority.drop = 'telemetry_derived_estimate'`.

3. **FIB-H §P.4 `source_authority`** — already states `drop: 'telemetry_derived_estimate' | null`. The null branch should be narrowed: null only when session has zero `table_buyin_telemetry` records (unrated, no grind logging). For any rated session this is non-null.

4. **Scaffold risk #1** — "telemetry_derived_drop_estimate_cents source not yet canonized" is now resolved. Update to: "source is `table_buyin_telemetry` session aggregate; gap is session-scoped aggregation not yet wired into the rundown path."

Do you want me to apply these patches to the governance artifacts now?