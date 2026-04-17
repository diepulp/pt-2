Here's my Phase 1 root cause analysis after tracing the entire rating-slip → MTL pipeline end-to-end.

## Investigation Summary

I traced the full data flow: **FormSectionCashIn** (Zustand store) → **RatingSlipModal.handleSave** → **PitPanelsClient.handleSave** → **useSaveWithBuyIn** → **POST /api/v1/financial-transactions** → **rpc_create_financial_txn** → **trg_derive_mtl_from_finance** (DB trigger) → **mtl_entry** insert.

No single commit introduces a clear code-level regression that breaks this chain. However, I identified **three structural issues** in how the new pit panels surface handles the pipeline differently from the old pit dashboard:

### Finding 1: `handleCloseSession` silently drops pending buy-in

Both `PitPanelsClient` and `PitDashboardClient` have this gap — the close-session handler does NOT include `newBuyIn`:

`components/pit-panels/pit-panels-client.tsx:347-355`:
```javascript
await closeWithFinancial.mutateAsync({
  slipId, visitId, playerId, casinoId, tableId, staffId,
  chipsTaken: Number(formState.chipsTaken || 0),
  averageBet: Number(formState.averageBet),
  // ← newBuyIn is NEVER passed — buy-in + MTL entry silently lost
});
```

If a user enters a buy-in and clicks **Close Session** without first clicking **Save**, no financial transaction is created, so the DB trigger `trg_derive_mtl_from_finance` never fires.

### Finding 2: Silent guard in PitPanelsClient save handler

`components/pit-panels/pit-panels-client.tsx:291-294`:
```javascript
const handleSave = async (formState: FormState) => {
  if (!selectedSlipId || !modalData) {
    return;  // ← SILENT return — no toast, no logError
  }
```

The old `PitDashboardClient` logs these failures. If `modalData` is null for any reason (race condition, query disabled), the save is silently dropped with no user feedback.

### Finding 3: New surface doesn't close modal after save

The old `PitDashboardClient` closed the modal after save (forcing the user to re-open for the next action). The new `PitPanelsClient` keeps the modal open:

```javascript
// PitDashboardClient (old): 
toast.success('Rating slip saved');
closeModal();  // ← Modal closes, next action requires re-open

// PitPanelsClient (new):
toast.success('Changes saved');
// ← Modal stays open — user may click Close Session next, losing any NEW buy-in entered after save
```

### Most likely root cause

**Finding 1 is the primary suspect.** The close-session flow has never included the buy-in, but the workflow pattern changed with the new UI surface. If users are now clicking "Close Session" as their primary action (instead of Save → then Close), every buy-in entered in that session is silently lost along with its MTL entry.

### Recommended fix

The `handleCloseSession` handler should save any pending buy-in before closing. Want me to wire `newBuyIn` into the `closeWithFinancial` flow so that a pending buy-in is recorded as a financial transaction (triggering the MTL bridge) before the slip is closed?