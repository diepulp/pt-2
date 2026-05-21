That settles it. Here is the complete picture:

---

## Fill and Credit System Posture

### Producer wiring — fully server-mediated (unlike adjustments)

Both producers follow the correct pattern:

```
POST /api/v1/table-context/fills   (route.ts: "Transport: Route Handler ONLY")
  ↓
requestTableFill() — services/table-context/chip-custody.ts
  ↓
supabase.rpc('rpc_request_table_fill', {...})
  ↓
fn_finance_outbox_emit('fill.recorded', 'operational', 'estimated', ...)  — unconditional
```

Same chain for credits. Emission has **no conditional gate** — unlike `adjustment.recorded` (`IF p_original_txn_id IS NOT NULL`), the fill and credit RPCs emit unconditionally once the row inserts successfully. There is no anchor resolution problem here.

Envelope per ADR-054 D2 / DEC-UL-2:
- `fact_class = 'operational'`, `origin_label = 'estimated'` (provenance label, not accuracy qualifier)
- `player_id = NULL` (table-level events — ADR-052 R5)

### The gap for the certification loop

**There is no UI surface that produces fills or credits.** The route handler comment makes this explicit: *"Transport: Route Handler ONLY (hardware integration, custody chain). Used by hardware integrations (chip scanners) and manual requests."*

The Core Operational Loop (Phase 1, orders 1 and 2) says to "trigger the workflow action in the application." For fills and credits that instruction has no valid UI target — there is no form, no modal, no button in the operator-facing application.

The proof scripts (`scripts/outbox-proof/`) also have **zero coverage** of fill or credit triggering — they were never wired.

### What this means for certification

| Event type            | UI trigger              | Proof script | Certification path available              |
| --------------------- | ----------------------- | ------------ | ----------------------------------------- |
| `fill.recorded`       | None                    | None         | Direct API call only                      |
| `credit.recorded`     | None                    | None         | Direct API call only                      |
| `buyin.recorded`      | Rating slip modal       | Partial      | UI workflow (but see anchor gap)          |
| `cashout.recorded`    | Presumably UI           | Partial      | UI workflow                               |
| `adjustment.recorded` | Rating slip + MTL modal | Partial      | UI workflow (silent failure — anchor gap) |
| `grind.observed`      | Rating slip save        | Partial      | UI workflow                               |

The Core Operational Loop's Phase 1 Step 1 needs a **split triggering protocol**: UI workflow for producers 3–6, direct authenticated API call (`POST /api/v1/table-context/fills` and `/credits` with a valid staff JWT) for producers 1–2. Without this, the fill and credit rows in the certification outcome table will never be populated — the observer would see the page stay empty and incorrectly conclude Layer 1 failure.

The fills and credits are the right shape (server-mediated, no anchor gap, unconditional emission) — they just have no operator-facing trigger yet.