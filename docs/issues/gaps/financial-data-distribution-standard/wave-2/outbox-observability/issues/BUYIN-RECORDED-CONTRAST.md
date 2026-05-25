Now I have the complete contrast. Here's the full picture.

---

## buyin.recorded vs adjustment.recorded — Structural Contrast

### buyin.recorded: what went right (end-to-end)

**UI → hook → HTTP → RPC → outbox:**

```
Rating slip modal "Save Changes"
  ↓
useSaveWithBuyIn.mutationFn (use-save-with-buyin.ts:124)
  ↓
createFinancialTransaction({ rating_slip_id: slipId, ... })   ← slipId is always present
  ↓
POST /api/v1/financial-transactions   (route.ts)
  ↓
service.create() → crud.ts:161
  supabase.rpc('rpc_create_financial_txn', {
    p_rating_slip_id: input.rating_slip_id,  ← always passed
    ...
  })
  ↓
rpc_create_financial_txn (SECURITY DEFINER, search_path='')
  IF p_rating_slip_id IS NULL THEN RETURN v_row; END IF;
  SELECT rs.table_id FROM rating_slip WHERE rs.id = p_rating_slip_id...
  PERFORM fn_finance_outbox_emit('buyin.recorded', ...)  ← fires
  ↓
finance_outbox row written ✓  →  relay picks up  →  processed_at set ✓
```

**Why the link is always present:** `slipId` is the identity of the modal itself — `use-save-with-buyin.ts` receives it as an input and passes it verbatim. No lookup needed. The rating slip *is* the anchor.

**DB gate (M3 version):**
```sql
IF p_rating_slip_id IS NULL THEN
  RETURN v_row;  -- short-circuit, no outbox
END IF;
SELECT rs.table_id INTO v_table_id FROM public.rating_slip rs
 WHERE rs.id = p_rating_slip_id AND rs.casino_id = v_casino_id;
PERFORM public.fn_finance_outbox_emit('buyin.recorded', 'ledger', 'actual', v_table_id, ...);
```

The anchor is the slip's own ID. Always non-null when a buy-in happens from a slip.

---

### adjustment.recorded: where the chain breaks

**UI → hook → RPC — outbox never reached:**

```
AdjustmentModal "Create Adjustment"  
  ↓
handleSubmitAdjustment (rating-slip-modal.tsx:404)
  createAdjustment.mutateAsync({
    player_id: modalData.player.id,
    visit_id:  modalData.slip.visitId,
    delta_amount: ...,
    reason_code: ...,
    note: ...,
    // original_txn_id: ← ABSENT — never passed, never fetched
  })
  ↓
createFinancialAdjustment (http.ts) → supabase.rpc('rpc_create_financial_adjustment', {
    p_original_txn_id: undefined  ← NULL at DB
  })
  ↓
rpc_create_financial_adjustment (SECURITY DEFINER)
  INSERT INTO player_financial_transaction ...  ← adjustment PFT written ✓
  IF p_original_txn_id IS NOT NULL THEN         ← FALSE → entire block skipped
    -- ADR-057 eligibility check
    -- fn_finance_outbox_emit('adjustment.recorded', ...)
  END IF;
  RETURN v_row;   ← success, but silent
  ↓
finance_outbox: NO ROW ✗
```

**Why the link is absent:** `original_txn_id` is a specific PFT row ID from the DB — it's not an attribute of the slip context. `AdjustmentModal`'s `onSubmit` type (`{ deltaAmount, reasonCode, note }`) has no slot for it. `modalData.financial` exposes only `totalCashIn / totalCashOut / netPosition` aggregates — individual PFT IDs are not in the data model the modal loads. Nobody fetches it; nobody carries it.

---

### The structural asymmetry

|                             | buyin.recorded                               | adjustment.recorded                     |
| --------------------------- | -------------------------------------------- | --------------------------------------- |
| **Outbox gate**             | `p_rating_slip_id IS NOT NULL`               | `p_original_txn_id IS NOT NULL`         |
| **Gate key type**           | The slip's own ID (context identity)         | A specific foreign PFT row ID           |
| **Available in UI context** | Always (`slipId` = the modal's own ID)       | Never (not in `modalData`, not fetched) |
| **Passes gate?**            | ✓ Always                                     | ✗ Never                                 |
| **Transport**               | API route (`/api/v1/financial-transactions`) | Direct browser Supabase RPC             |
| **Outbox row emitted**      | ✓                                            | ✗                                       |

The buy-in path goes through the API route → `service.create` → `crud.ts` — a server-side chain where `rating_slip_id` flows naturally as an input. The adjustment path bypasses the API entirely via a direct browser `supabase.rpc()` call in `http.ts:183`, making it the only producer that doesn't go through the server-side service layer.

**What the working buyin.recorded proves:** `fn_finance_outbox_emit` is reachable, the relay is healthy, the observability surface is correct. The adjustment failure is purely a missing argument at the TypeScript callsite — the entire DB machinery is functional and waiting.