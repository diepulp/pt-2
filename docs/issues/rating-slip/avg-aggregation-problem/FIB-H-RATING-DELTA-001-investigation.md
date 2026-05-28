Excellent findings. Here's the synthesis against the FIB's required outcomes:

---

## FIB-H-RATING-DELTA-001: Investigation Findings

### Gap Classification (Section F answers)

| Gap Type            | Status                                                                           | Evidence                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Semantic labeling   | **YES** — `current_segment_average_bet` is mislabeled as representative of visit | `VisitLiveViewDTO` (services/visit/dtos.ts:239) exposes only the active slip's bet                                    |
| Derived aggregation | **YES** — weighted avg is computable but unexposed                               | `accumulated_seconds` + `final_duration_seconds` per slip exist; calculation is absent from `rpc_get_visit_live_view` |
| Data model          | **PARTIAL** — slip-level data is sufficient; intra-slip history is not           | No `rating_slip_bet_segment` or timestamp on `average_bet` changes                                                    |
| Operator workflow   | **YES** — no UI signal differentiates segment avg from visit avg                 | 15 surfaces all render `average_bet` without context label                                                            |
| Auditability        | **PARTIAL** — audit log captures values at action time, not bet-change intervals | `updateAverageBet()` does a destructive overwrite with no `updated_at`                                                |

---

### What the current model CAN support (without schema changes)

The building blocks already exist:

- Each closed slip has `final_duration_seconds` (active play, pauses excluded) and `average_bet`  
- The live view RPC already computes `SUM(final_duration_seconds)` across closed slips (migrations/20251222002624_prd016_rpc_get_visit_live_view.sql:115-120)
- A duration-weighted visit average bet formula is straightforwardly:

```
visit_weighted_avg_bet = 
  SUM(slip.average_bet × slip.final_duration_seconds) / 
  SUM(slip.final_duration_seconds)
```

This is **computable today in the RPC** for all closed slips. For the active slip, `rpc_get_rating_slip_duration()` already provides live elapsed seconds — so the formula extends to include the live segment.

### What the current model CANNOT support (requires schema change)

Intra-slip bet volatility is unrecoverable. When an operator updates `average_bet` on an open slip, the old value is overwritten (`services/rating-slip/crud.ts:585`) with no timestamp or history record. If a player raises their bet mid-slip, the system cannot distinguish "played 1 hour at $50 then 1 hour at $200" from "played 2 hours at $200" — both produce the same `average_bet` value on the slip.

---

### Recommended Remediation Path (smallest correct path)

**Phase 1 — Derived aggregation in RPC (no schema change, no migration needed)**

Extend `rpc_get_visit_live_view()` to compute and return `visit_weighted_avg_bet` alongside `current_segment_average_bet`. Add the corresponding field to `VisitLiveViewDTO`. This requires:
- One SQL change to the RPC (add the weighted SUM calculation)
- One DTO field addition
- UI label update to distinguish the two values

**Phase 2 — Semantic labeling across 15 surfaces**

Rename or annotate every surface that today renders `average_bet` without context. The pit-terminal, rating slip modal, and active slips panel all need label copy distinguishing "Segment Avg Bet" from "Visit Weighted Avg Bet."

**Phase 3 — Intra-slip bet-change history (requires schema change, deferred)**

If the product decision is that operators need to see bet-change history within a single slip, a new `rating_slip_bet_segment` append-only table is required. This is out of scope for pilot per the FIB exclusions, but the open question in Section L — "whether average bet updates are timestamped anywhere today" — is now answered: they are not, and adding an `average_bet_updated_at` column to `rating_slip` would be the minimal first step.

---

### Move prefill (UX gap, low effort)

When `move()` creates the new slip, it discards the prior slip's `average_bet` (`crud.ts:662-667`). A low-cost UX improvement would be to prefill the new slip's `average_bet` from the just-closed slip as a convenience default. This is a one-line change in the move payload and does not affect the weighted aggregation math.

---

### Open Questions from FIB Section L — Now Answered

| Open question                                          | Answer                                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Are duration fields reliable for weighted aggregation? | **Yes** — `final_duration_seconds` excludes pauses via `rating_slip_pause` subtraction |
| Are pause intervals excluded from accumulated play?    | **Yes** — explicitly subtracted at close time in the RPC                               |
| Are average bet updates timestamped?                   | **No** — destructive overwrite, no history                                             |
| Do operators expect slip-level or visit-level average? | Undetermined — requires product/operator validation                                    |
| Should table move prefill prior average bet?           | Data supports it; currently does not                                                   |
| Should visit-level avg include active slip?            | Technically possible (live duration available); recommended yes for accuracy           |

The Phase 1 RPC change is the clearest next action — no schema migration, no topology change, and it closes the semantic gap that surfaced during the client walkthrough.