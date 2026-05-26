I have everything needed. Here's the complete diagnosis.

---

## Root Cause: Layer 1 Failure — `adjustment.recorded` Never Written

### What happens

The adjustment RPC (`rpc_create_financial_adjustment`) succeeds — the PFT row is created — but no `adjustment.recorded` row ever lands in `finance_outbox`. Per the Step 2 certification test, clicking Refresh on the observability surface shows nothing for this workflow. This is a **Layer 1 failure**: the producer didn't write.

### The ADR-057 gate

Every version of `rpc_create_financial_adjustment` (WS4 → Phase 2.2 → M3) wraps the entire outbox emission in this guard:

```sql
-- supabase/migrations/20260518134715_wave2_fill_credit_producer_ext.sql:188
IF p_original_txn_id IS NOT NULL THEN
  -- eligibility check: source=pit, direction=in, tender_type IN ('cash','chips'),
  --                    rating_slip_id IS NOT NULL
  -- → fn_finance_outbox_emit('adjustment.recorded', ...)
END IF;
-- ELSE: unlinked → no outbox, no error (by design, ADR-057)
```

An adjustment with `p_original_txn_id IS NULL` is "unlinked" — no outbox row emitted, no error raised. This is intentional per ADR-057, but it requires the caller to pass the link.

### Where the link is dropped

`components/modals/rating-slip/rating-slip-modal.tsx:405-411`:

```tsx
await createAdjustment.mutateAsync({
  player_id: modalData.player.id,
  visit_id: modalData.slip.visitId,
  delta_amount: data.deltaAmount * 100,
  reason_code: data.reasonCode,
  note: data.note,
  // ← original_txn_id is absent — never passed
});
```

`AdjustmentModal`'s `onSubmit` callback type only returns `{ deltaAmount, reasonCode, note }` — the component has no mechanism to capture or convey which original PFT is being corrected. `modalData.financial` contains only aggregate totals (`totalCashIn`, `totalCashOut`, `netPosition`) — no individual PFT IDs.

### Cascade of consequences

1. `p_original_txn_id IS NULL` → ADR-057 gate skips entirely
2. No `fn_finance_outbox_emit` call is made
3. No `finance_outbox` row for `adjustment.recorded`
4. Phase 1 Step 2 of the certification loop fails — "if no row: Layer 1 failure (producer RPC did not write)"
5. The observability surface stays clean (no amber, no pending badge) — **it looks like nothing happened**, which is the worst failure mode for an operator running the certification

### What would be required for outbox emission to fire

The original PFT being adjusted must satisfy all four ADR-057 eligibility criteria:
- `source = 'pit'`
- `direction = 'in'`  
- `tender_type IN ('cash', 'chips')`
- `rating_slip_id IS NOT NULL`

A rating-slip adjustment in the operator workflow satisfies all four by construction — the adjustment is correcting a pit buy-in that was recorded against this slip. The link exists semantically; it's just never passed.

### Anchor resolution posture — visit vs slip

The PFT table schema (`types/database.types.ts:1902`):
- `visit_id: string` — NOT NULL. Every PFT belongs to a visit; this is the primary DB anchor.
- `rating_slip_id: string | null` — nullable. Set only when the transaction was recorded against a rating slip.

The BFF RPC (`supabase/migrations/20251226123939_prd018_modal_bff_rpc.sql:247–258`) financial query:
```sql
WHERE pft.visit_id = v_slip.visit_id   -- visit-scoped aggregate
  AND pft.casino_id = p_casino_id;
```
It aggregates ALL PFTs for the entire visit (`totalCashIn`, `totalChipsOut`, `netPosition`) and returns no individual row IDs. A player who sits at two tables in one visit sees combined totals. The existing financial block is deliberately visit-scoped and cannot be repurposed to resolve an eligible PFT for a specific slip.

### The eligible-PFT resolution query

The original buy-in recorded against this slip is the PFT row where:
```sql
SELECT id FROM player_financial_transaction
WHERE rating_slip_id = :slipId     -- slip-scoped — NOT via visit_id
  AND source = 'pit'
  AND direction = 'in'
  AND txn_kind != 'adjustment'
ORDER BY created_at DESC
LIMIT 1
```

`slipId` is always available in the modal — it is the modal's own identity. The resolution path goes through `rating_slip_id` on the PFT, not through `visit_id`.

### Fix surface

The fix is in the TypeScript layer only (no DB change needed). `modalData` doesn't expose individual PFT IDs, so this requires either:

- **Option A:** Extend the BFF RPC (`rpc_get_rating_slip_modal_data`) with a new sub-query filtered by `rating_slip_id = p_slip_id` (NOT the existing visit-level aggregate) to return `latestEligiblePftId`. This is a new SQL query inside the BFF, not a field addition to the existing aggregate. Result is cached in `modalData.financial` at load time — no extra round-trips at submit.
- **Option B:** Issue a targeted `player_financial_transaction` query in `handleSubmitAdjustment` at submit time using the resolution query above — no BFF change, but adds one network round-trip when the operator clicks "Create Adjustment".

Option A is cleaner (cached, single load). Option B is the smaller surface change.

---

## Second Surface: MTL Compliance Dashboard — same failure, richer anchor picture

### The complete data lineage

The forward bridge (`supabase/migrations/20260116111329_finance_to_mtl_derivation.sql`, widened by `20260217215827_mtl_bridge_adjustment_support.sql`) fires AFTER INSERT on `player_financial_transaction` when `source='pit'` AND (`tender_type IN ('cash','chips')` OR `txn_kind IN ('adjustment','reversal')`). It creates one `mtl_entry` row per eligible PFT, propagating:

```
player_financial_transaction (PFT)
  visit_id        NOT NULL  →  mtl_entry.visit_id        (nullable in mtl schema)
  rating_slip_id  nullable  →  mtl_entry.rating_slip_id  (nullable)
  id              PFT.id    →  mtl_entry.idempotency_key = 'fin:' || PFT.id
```

The relationship is **1:1** — one mtl_entry per PFT, linked by idempotency key. The MTL entry is a projection of the PFT, not a separate entity.

### The anchor gap in MtlEntryDTO

`MtlEntryDTO` (services/mtl/dtos.ts:92) surfaces:
- `id` — the `mtl_entry` row ID (NOT the PFT ID)
- `visit_id: string | null` — propagated from PFT
- `rating_slip_id: string | null` — propagated from PFT

It does NOT surface `idempotency_key`. The DB row holds `idempotency_key = 'fin:' || PFT.id` — a direct, reliable link to the source PFT — but this field is excluded from the DTO query. The source PFT ID is therefore unreachable from the TypeScript side without an additional lookup.

### Visit anchoring in the MTL context

There is an asymmetry between the two tables:

| | `player_financial_transaction` | `mtl_entry` |
|---|---|---|
| `visit_id` | NOT NULL — every PFT belongs to a visit | nullable — propagated from PFT, but no DB NOT NULL constraint |
| `rating_slip_id` | nullable — rated transactions only | nullable — propagated from PFT |

A visit is the container for a gaming session. A player may sit at multiple tables in one visit, producing one `rating_slip` per table and potentially multiple buy-in PFTs per slip. The `visit_id` on an MTL entry is always the same visit as the source PFT's visit — but using `visit_id` alone as an anchor to resolve the eligible PFT is **ambiguous**: a visit-scoped query returns all buy-ins for the entire session, not just the one this MTL entry represents.

### What is in state at submit time (compliance dashboard)

`handleAdjustmentSubmit` (line 208): `adjustmentTarget` is the full `MtlEntryDTO`. The following are available:

| Field | Value | Usable for resolution? |
|---|---|---|
| `adjustmentTarget.visit_id` | Visit of the source PFT | Ambiguous (visit may have many buy-ins) |
| `adjustmentTarget.rating_slip_id` | Slip of the source PFT (nullable) | Yes — slip-scoped, if non-null |
| `adjustmentTarget.id` | mtl_entry row ID | No — not a PFT ID |
| `idempotency_key` (DB only) | `'fin:' || PFT.id` | Not in DTO |

### The sub-case split

1. **Rated buy-in entries** (`rating_slip_id IS NOT NULL`): The source PFT satisfies all ADR-057 eligibility criteria. The slip anchor is available in the DTO and can be used to resolve the eligible PFT. These should emit `adjustment.recorded` but do not because `original_txn_id` is never resolved.

2. **Unrated pit entries** (`rating_slip_id IS NULL`): The source PFT has no slip anchor. ADR-057 eligibility requires `rating_slip_id IS NOT NULL` on the original PFT, so outbox emission would be correctly blocked even if `original_txn_id` were passed. The current behavior is correct for this sub-case, but visit-scoped lookup is still ambiguous for identifying the right PFT.

The outbox gap is exclusively sub-case 1.

### Fix options for MTL

- **Option C (slip-scoped query at submit):** At `handleAdjustmentSubmit`, gate on `adjustmentTarget.rating_slip_id`. If non-null, run the same slip-scoped eligible-PFT resolution query and pass the result as `original_txn_id`. If null, call without anchor — correctly produces no outbox row. No DTO or bridge change required.
- **Option D (expose source_pft_id in DTO):** Add `source_pft_id` to `MtlEntryDTO`, populated from `idempotency_key` (`substring(idempotency_key from 5)`) in the MTL entry query. Zero extra queries — the idempotency key is already on the row. Eliminates the slip-null ambiguity for sub-case 2 as well.

Option D is the correct long-term fix (direct 1:1 link, no ambiguity). Option C is the minimal fix for the outbox gap, covering only rated entries.

### What is confirmed identical across both surfaces

- Transport: direct browser `supabase.rpc()` via `services/player-financial/http.ts:createFinancialAdjustment`
- Mutation hook: `useCreateFinancialAdjustment`
- Missing field: `original_txn_id` (`CreateFinancialAdjustmentInput.original_txn_id?: string`)
- DB gate: `IF p_original_txn_id IS NOT NULL` — same block, same skip
- Failure mode: silent success — PFT row written, no outbox row, no error raised