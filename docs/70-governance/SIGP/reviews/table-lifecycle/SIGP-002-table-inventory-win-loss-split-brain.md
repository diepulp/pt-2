# SIGP-002 — Table Inventory Accounting: Win/Loss Split-Brain Review

**Review ID:** SIGP-002  
**Date:** 2026-05-27  
**Reviewer:** Vladimir Ivanov  
**Severity:** S4  
**Disposition:** Risk Registered — no immediate rollout block; two blocked expansion paths  
**Companion artifact:** `SIGP-002-zachman.yaml`  
**UL Reference:** `docs/00-vision/table-context-read-model/split-brain/TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md`

---

## 1. Trigger

Investigation of how the shift dashboard renders a live "Win/Loss" number during an active session while the pit terminal rundown panel shows NULL for the same table revealed two structurally independent computation streams sharing the same label. A follow-on drop posture audit found three disconnected concepts all named "drop" with no custody chain and no count-room integration. The UL Baseline confirms that both Drop and Win/Loss are external/custody-authority facts PT-2 does not currently possess.

---

## 2. Scope

| Surface / Store | Bounded Context | Status |
|---|---|---|
| `table_session.drop_total_cents` | TableContext | Fractured |
| `table_rundown_report.table_win_cents` | TableContext / SessionRundown | Fractured |
| `rpc_compute_table_rundown` | TableContext | Fractured |
| `rpc_shift_table_metrics` (win/loss columns) | ShiftMetrics | Fractured |
| `HeroWinLossCompact` (shift dashboard hero) | ShiftDashboard | Fractured |
| `table_drop_event` | DropCustody | Unstable |
| `table_buyin_telemetry` + `estimated_drop_buyins` | ShiftMetrics | Fractured |
| `table_session.need_total_cents` | TableContext | Unstable |

---

## 3. Protocol Trigger Check

Mandatory triggers (SIGP §4.1):

- **#5** — User-visible totals and summaries: "Win/Loss" rendered on dashboard hero and pit terminal.
- **#6** — Multiple surfaces consuming the same source facts: two surfaces show win/loss from independent computation paths.
- **#7** — Domain term affecting authority and accountability: "drop" used for three categorically different facts.
- **#10** — Two existing stores appear to own the same operational fact: SessionRundown and ShiftMetrics both compute win/loss independently.

---

## 4. Diagnostic Summary

| Pass | Result | Primary Finding |
|---|---|---|
| Authority | **Fractured** | drop_total_cents is manual entry, not count-room authenticated. win/loss on both surfaces is a projection, not accounting authority. |
| Aggregate Ownership | **Fractured** | Two independent win/loss computations with no canonical owner, no cross-stream propagation, no reconciliation path. |
| Propagation Integrity | **Fractured** | Drop posting does not propagate to shift metrics. Rundown persistence is not consumed by dashboard. Telemetry bridge is not wired. |
| Surface Truthfulness | **Fractured** | Dashboard hero renders Accounting Aggregate label over inventory projection. NULL on rundown is opaque to operators. |
| Vocabulary | **Fractured** | "drop" = three different things. "win/loss" = three different numbers simultaneously visible in the same UI session. |
| Projection Dependency | **Fractured** | Opening baseline non-deterministic (par bootstrap changes past results). Completeness uncomputable for Stream 1. Stream 2 not session-scoped — cross-session contamination possible. |
| Operational Reality | **Fractured** | Count room works 4-8 hours after physical drop. Stream 1 is NULL for the entire live shift. Operators have no reason to understand why two surfaces disagree. |

---

## 5. The Two Streams

### Stream 1 — Session Rundown (pit terminal)

```
table_win_cents = closer + credits + drop_total_cents - opener - fills
```

- **Gate:** `NULL` unless `drop_posted_at IS NOT NULL AND drop_total_cents IS NOT NULL`
- **Drop source:** Manual entry by accounting staff via `rpc_post_table_drop_total`
- **Timing:** Drop enters hours after physical box removal (count room)
- **Nullability during live shift:** Always NULL

### Stream 2 — Shift Dashboard (hero + metrics table)

```
win_loss_inventory  = (closer - opener) - fills + credits
win_loss_estimated  = win_loss_inventory + estimated_drop_buyins
```

- **Gate:** NULL only if opening baseline unresolvable AND closing snapshot missing
- **Opening baseline:** 4-tier cascade — prior snapshot → par bootstrap → earliest in-window → null
- **estimated_drop_buyins:** Sum of `table_buyin_telemetry` (buy-in telemetry, **not drop**)
- **Telemetry bridge:** Not wired — `estimated` stream equals `inventory` stream in practice
- **Nullability during live shift:** Non-null for any table with a par target configured

---

## 6. Four Registered Fractures

### SRR-002-001 — Win/Loss label collision (S4)

The same label "Win/Loss" appears on:
- The shift dashboard hero (Stream 2, live, no drop required, par bootstrap possible)
- The pit terminal rundown (Stream 1, requires posted drop, NULL during active shift)
- The metrics table (both streams side-by-side without explanation)

Operators cannot determine which number reflects accounting truth, which reflects an operational estimate, or why the two disagree. The ESTIMATE badge on the dashboard signals quality degradation — it does not communicate that the category is "operational projection" rather than "accounting result awaiting finalization."

**Blocked:** Any new surface rendering win/loss without authority/completeness envelope. Any count-room integration that does not resolve stream authority first.

### SRR-002-002 — Drop vocabulary overload (S3)

Three structurally different facts share the "drop" name:

| Name | What it actually is | UL Category |
|---|---|---|
| `table_drop_event.removed_at` | Physical box removed; timestamp only; no dollar | Custody Event (physical only) |
| `table_session.drop_total_cents` | Manual dollar entry by accounting post-count | Manual Proxy for Custody Fact |
| `estimated_drop_buyins_cents` | Sum of buy-in telemetry records | Telemetry Fact (not drop) |

UL Baseline §10.4: "Do not call estimated cash-in 'drop'."

**Blocked:** New features using "drop" terminology without declaring UL category.

### SRR-002-003 — Opening baseline divergence (S3)

Stream 1 uses the explicit `OPENING` snapshot attached to the session (physically counted at session open). Stream 2 uses a 4-tier cascade that can substitute the table par target (`gaming_table.par_total_cents`) for tables with no pre-window snapshot. Par target is a configuration value that can be updated retroactively, making historical window results non-deterministic.

Same table, same period, different opening baseline → permanent win/loss divergence even when all other inputs are identical.

**Blocked:** Features that reconcile Stream 1 and Stream 2 without resolving baseline authority.

### SRR-002-004 — Buy-ins as drop proxy (S4, latent)

The `win_loss_estimated` formula includes `estimated_drop_buyins_cents` (buy-in telemetry) as a drop substitute. This is categorically incorrect: buy-ins are player financial transactions that arrive as chips; drop is the cash counted in the drop box. They are correlated but not equivalent in timing, denomination, or scope.

This fracture is **latent** — the telemetry bridge is not wired, so `estimated_drop_buyins` is zero in practice and `win_loss_estimated = win_loss_inventory`. The damage activates the moment the bridge is wired.

**Blocked:** Any PR wiring `player_financial_transaction` → `table_buyin_telemetry` must be accompanied by a resolved SRR-002-004 or an explicit ADR decision.

---

## 7. Current Drop Posture

The system manages three disconnected drop concepts with no automated bridge between them:

```
table_drop_event     Physical custody event (box removed)
      ↓
      ✗  No automated link
      ↓
count room           Soft count (external; 4-8 hours later)
      ↓
      ✗  No PT-2 integration
      ↓
rpc_post_table_drop_total   Manual accounting entry → drop_total_cents
      ↓
      ✗  No propagation to shift metrics
      ↓
table_win_cents      Gate opens; session rundown computes
```

`drop_custody_present = TRUE` in shift metrics means a drop event exists in the window. It does **not** mean a dollar amount has been counted or entered.

---

## 8. Containment Rules (while fractures are open)

1. `HeroWinLossCompact` may continue rendering `win_loss_estimated_total_cents` under "Win/Loss" with ESTIMATE badge. No removal of badge. No removal of `tablesMissingBaselineCount` indicator. No copies of this pattern without surface contract review.

2. `estimated_drop_buyins_cents` columns and `rpc_shift_table_metrics` source must receive a code-level annotation identifying them as Telemetry Fact, not Custody Fact. A comment block pinning SRR-002-004 must be added before any bridge PR opens.

3. No new schema column may use "drop" prefix without a UL category annotation in the migration comment.

4. No new surface may render any win/loss-like value without declaring: input sources, drop presence/absence, opening baseline source, completeness, and authority class.

---

## 9. Required Actions

### Immediate

- Adopt `TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md` as the naming gate for any future PRD/FIB touching drop, win/loss, need, fill, credit, opener, or closer.
- Add SRR-002-004 containment comment to `estimated_drop_buyins_cents` columns and the `win_loss_estimated` formula in `rpc_shift_table_metrics`. Block telemetry bridge PR until risk resolved.

### Deferred (ordered by dependency)

1. **ADR** — Win/loss stream authority ownership: which stream is canonical, what are the correct names, what is the opening baseline authority rule.
2. **ADR** — Drop taxonomy: three concepts, three names, authority classification for each.
3. **PRD** — Surface relabeling: dashboard hero and metrics table rename to reflect operational estimate category. Completeness envelope requirements.
4. **PRD** — Pit terminal completeness: NULL disambiguation (drop not posted vs missing snapshots vs error), opening source rendering.
5. **UL Baseline Phase C** — Rename `estimated_drop_*` columns (migration; deferred until safe).
6. **Replay test** — Verify opening baseline determinism for Source C (par bootstrap) when `par_total_cents` changes after the window.

---

## 10. Exit Criteria for Resolution

SIGP-002 is considered resolved when:

- A canonical owner is declared for win/loss truth (ADR).
- "Win/Loss" as a label is removed from surfaces that render inventory projections (PRD).
- `estimated_drop_buyins` is renamed and its category is explicitly documented (UL Baseline + migration).
- Opening baseline authority is decided (session-scoped vs window-scoped, ADR).
- Telemetry bridge PR cannot open without SRR-002-004 resolution gate.
- Both surfaces carry completeness envelopes that operators can read without domain knowledge.

---

*SIGP §15 governing maxim: Surface the fracture. Do not worship the fracture.*
