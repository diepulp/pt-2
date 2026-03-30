## OPEN Workflow Gap — Context Summary

ADR-047 D3.1 defers the `OPEN` session phase. Here's the full picture of what exists today vs what's needed:

### What Exists (Infrastructure Ready)

| Layer | Status | Detail |
|-------|--------|--------|
| **Enum** | `OPEN` defined in `table_session_status` | `20260115025236_table_session_lifecycle.sql` |
| **DB default** | `status DEFAULT 'OPEN'` on `table_session` | Never hit — RPC overrides to `ACTIVE` |
| **Unique index** | Includes `OPEN` in active-session constraint | `WHERE status IN ('OPEN', 'ACTIVE', 'RUNDOWN')` |
| **Par columns** | `gaming_table.par_total_cents`, `par_updated_at`, `par_updated_by` | Added by ADR-027 schema migration |
| **Snapshot table** | `table_inventory_snapshot` with `snapshot_type IN ('open', 'close', 'rundown')` | Snapshots created independently, linked retrospectively |
| **UI defensive** | `derivePitDisplayBadge()` handles OPEN → blue badge | Non-normative per ADR-047 D3.1 |
| **Hook defensive** | `canStartRundown()` accepts OPEN as valid source | `use-table-session.ts:200` |
| **Policy doc** | Source C bootstrap from par specified | `POLICY-SHIFT-WINLOSS-OPENING-BASELINE.md` |

### What's Missing (The Gap)

| Component | Description |
|-----------|-------------|
| **RPC to write OPEN** | `rpc_open_table_session` currently writes `'ACTIVE'` directly — needs to write `'OPEN'` instead |
| **Custodial chain validation** | No RPC exists to validate: opening snapshot captured + par binding verified |
| **OPEN → ACTIVE transition RPC** | No `rpc_transition_open_to_active()` or equivalent gate |
| **Par binding verification** | Par columns exist but no enforcement logic checks par against snapshot |
| **Opening baseline bootstrap** | Rundown coalesces missing opening to `0` (Source E); no Source C par fallback implemented |

### Current vs Future Lifecycle

```
MVP (today):     open_session() → [ACTIVE] → [RUNDOWN] → [CLOSED]
                                    ↑ no gate, no snapshot required

Future (deferred): open_session() → [OPEN] → validate_chain() → [ACTIVE] → [RUNDOWN] → [CLOSED]
                                      ↑ awaiting snapshot + par binding
```

### Key Insight: Three-Layer Deference

1. **Schema layer** — ready (enum, columns, constraints all exist)
2. **RPC/data layer** — **blocked** (no custodial chain RPC, no OPEN → ACTIVE transition)
3. **UI/display layer** — ready (defensive branches handle OPEN; non-normative)

### Blocking Gate

The precis doc makes clear the system is **permissive by design** — opening snapshots are optional, closing snapshots are interchangeable with drop events, rundown coalesces missing data to 0. Activating the OPEN workflow would be a **significant operational tightening**: making the opening snapshot a hard requirement before play starts.

This requires a dedicated PRD covering:
- Whether OPEN is a hard gate or advisory
- Whether par binding verification is mandatory or recommended
- The UX for the pit boss (two-step open vs current one-click)
- How Source C bootstrap interacts with the OPEN → ACTIVE transition
- Gaming day rollover implications (currently manual, no auto-close/reopen)

What would you like to do with this? Draft a gap doc, a PRD brief, or fold it into the existing issue tracking?