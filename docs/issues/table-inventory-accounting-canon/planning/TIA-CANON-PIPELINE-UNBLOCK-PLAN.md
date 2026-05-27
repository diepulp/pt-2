
---

## TIA Canon — Pipeline Unblock Plan

### Diagnostic: PRD Gate Condition Status

| #   | Condition                                                                                           | Status                                                  |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | Scaffold file created                                                                               | ❌ **FILE DOES NOT EXIST** — primary blocker            |
| 2   | Classification YAML: opener/closer removed from `missing_inputs`                                    | ✅ Already correct                                      |
| 3   | Source binding: `telemetry_derived_drop_estimate_cents` → `table_buyin_telemetry` session aggregate | ❌ Still says "pt2_operational_telemetry" (too generic) |
| 4   | `drop_estimate_state` field defined                                                                 | ❌ Not in any artifact                                  |
| 5   | Legacy semantic producers formally classified                                                       | ❌ Listed but not classified per D2                     |
| 6   | Exemplar deletion/quarantine list defined                                                           | ❌ Not in artifacts                                     |
| 7   | Consumer propagation backlog named                                                                  | ❌ Not in artifacts                                     |
| 8   | Producer hardening backlog named                                                                    | ❌ Not in artifacts                                     |
| 9   | Session-scope aggregation boundaries defined                                                        | ❌ Not in artifacts                                     |
| 10  | Bridge consistency tests specified                                                                  | ❌ Not in artifacts                                     |

**1 of 10 gate conditions met.** The scaffold file is the linchpin — conditions 3–10 all belong in it.

---

### Phase 0 — Create Scaffold + Patch Governance (Pre-PRD, BLOCKING)

Everything gates on this phase. Three files need to be written/patched:

**0.A — Create `SCAFFOLD-TABLE-INVENTORY-CANON.md`** (new file)

This is the main deliverable. It must contain per direction decision §6:

- **§6.1** Semantic authority statement: Pit Terminal Rundown exemplar establishes canonical semantic authority; all other producers are raw-input or legacy-semantic only
- **§6.2** Opener/closer typed as `number` (not `number | null`); null is `integrity_issues`, not `missing_inputs`
- **§6.3** `missing_inputs: Array<'drop_estimate'>` only; `integrity_issues` is separate array
- **§6.4** Source binding: `telemetry_derived_drop_estimate_cents` = session-scoped aggregate of `table_buyin_telemetry` (`RATED_BUYIN` + `GRIND_BUYIN`) within `opened_at ≤ occurred_at < COALESCE(closed_at, NOW())` window
- **§6.5** `drop_estimate_state` enum: `present | none_for_session | bridge_pending | source_unavailable | integrity_issue`
- **§6.6** Producer classification table (D2): raw input authoring vs canonical vs legacy semantic — naming all specific legacy fields
- **§6.7** Consumer propagation policy (D6): consumers must migrate or suppress; no parallel display after exemplar lands

Also must define (gates 6–10):
- **Exemplar deletion list**: `table_win_cents` from `TableRundownDTO`, win formula from `rpc_compute_table_rundown`
- **Consumer propagation backlog**: `HeroWinLossCompact`, `pit-metrics-table.tsx`, `table-metrics-table.tsx`, `analytics-panel.tsx`, `casino-summary-card.tsx`
- **Producer hardening backlog**: first-session NULL opener, close-without-snapshot path, PFT bridge monitoring
- **Session-scope aggregation boundary**: exact timestamp window for `table_buyin_telemetry` query
- **Bridge consistency test requirements** (D4 §10.1)

**0.B — Patch `FIB-H-TIA-CANON-001-classification.yaml`** (targeted edits)

- Replace `source=pt2_operational_telemetry` → `source=table_buyin_telemetry_session_aggregate (RATED_BUYIN + GRIND_BUYIN)`
- Add `drop_estimate_state` enum definition
- Add D2 producer classification section
- Add D6 consumer propagation policy statement
- Patch `estimated_drop_buyins_cents` note: "non-canonical as surface/API name; underlying data valid only when surfaced as `telemetry_derived_drop_estimate_cents` with explicit provenance"

**0.C — Patch `TABLE_INVENTORY_ACCOUNTING_UBIQUITOUS_LANGUAGE_BASELINE.md`** (targeted edits)

- Patch `estimated_drop_buyins_cents` migration warning to match direction decision §7.2
- Add `telemetry_derived_drop_estimate_cents` concrete source: `table_buyin_telemetry` session aggregate

After Phase 0: all 10 PRD gate conditions are satisfied.

---

### Phase 1 — Author Exemplar PRD

Scope: single vertical slice — `TableInventoryAccounting` service/BFF + Pit Terminal Rundown rewiring + legacy path deletion from rundown only.

**Out of scope for this PRD:** dashboard consumer propagation, producer lifecycle hardening, posted-drop authority, `final_table_win_loss_cents`.

Key PRD decisions to lock:
- Session-scope window: `occurred_at >= session.opened_at AND occurred_at < COALESCE(session.closed_at, NOW())`
- `bridge_pending` detection strategy (MVP: detect rated session with zero telemetry rows, flag `bridge_pending`)
- SRM amendment: add `TableInventoryAccounting` subdomain under `TableContext`

---

### Phase 2 — Implement `TableInventoryAccounting` Service

New module at `services/table-context/table-inventory-accounting/`:

```
├── dtos.ts      # TableInventoryAccountingProjectionDTO
├── keys.ts      # TanStack Query key factory
├── service.ts   # pure derivation function (inputs → projection)
├── http.ts      # BFF fetch wrapper
└── index.ts
```

**BFF endpoint:** `GET /api/v1/table-context/table-sessions/[sessionId]/accounting-projection`

The service fetches:
- `table_session` (fills, credits, opened_at, closed_at, opening/closing snapshot IDs)
- `table_inventory_snapshot` (opening/closing `total_cents`)
- `table_buyin_telemetry` session-scoped sum (RATED_BUYIN + GRIND_BUYIN in window)

Derivation is pure (no mutations). `integrity_issues` suppresses all table-result values. Missing telemetry → `partial_table_result_cents`. Present telemetry → `projected_table_win_loss_cents`. `final_table_win_loss_cents` always `null`.

---

### Phase 3 — Wire Pit Terminal Rundown + Delete Legacy Path

Changes to:
- `hooks/table-context/` — add `useTableAccountingProjection(sessionId)`
- `components/table/rundown-summary-panel.tsx` — replace `table_win_cents` with `projected_table_win_loss_cents` / `partial_table_result_cents`; add label discipline ("Projected Win/Loss" vs "Partial Table Result" vs integrity disclosure)
- `services/table-context/dtos.ts` — remove `table_win_cents` from `TableRundownDTO`
- `rpc_compute_table_rundown` — remove or stub out win formula; retain snapshot/drop/need read path

Dashboard streams (`win_loss_inventory_cents`, `win_loss_estimated_cents`) stay in `ShiftTableMetricsDTO` but their UI surfaces must be **suppressed** (not removed yet) — consumer propagation is a follow-up slice.

---

### Phase 4 — Tests

Required per direction decision §P.6 and §10:
- **P.6 deterministic fixture**: opener=20K, fills=5K, credits=2K, closer=18K, telemetry=9K → projected=4K
- Bare "Win/Loss" label never appears
- Telemetry absent → `partial_table_result_cents` only
- Null opener/closer → `integrity_issues` + all table-result values null
- Zero opener/closer → valid, no integrity issue
- Par change does not affect projected win/loss
- Session-scope exclusion: other tables, prior sessions, subsequent sessions excluded from telemetry sum

---

### Immediate Next Step

Phase 0 is the only productive path forward — all three files (scaffold create, classification patch, UL baseline patch) are pure documentation and can be executed now.

**Shall I start Phase 0 immediately and create/patch all three governance files?** Once those land, the PRD gate opens and Phase 1 can begin.