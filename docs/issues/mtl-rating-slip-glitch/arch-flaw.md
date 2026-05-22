The audit is right to collapse the list. Aligning + adding the architectural scrutiny requested:

## The architectural flaw, named sharply

DB-level atomicity is already correct: `rpc_create_financial_txn` and `fn_derive_mtl_from_finance` run in one Postgres transaction. G1–G3 guards raise → whole transaction rolls back. **`financial_transaction` row ↔ `mtl_entry` row is atomic on the server.**

The flaw is **operator-side atomicity does not match server-side atomicity**. Five concrete surfaces:

1. **Composite client mutation spans two transactions.** `useSaveWithBuyIn` issues PATCH `average-bet` then POST `financial-transactions` — separate requests, separate DB transactions. If step 1 commits and step 2 aborts, the DB keeps the bet update and loses the buy-in. No server rollback. This is the deeper pattern: the client is orchestrating an action the backend treats as independent steps.
2. **Feedback fires pre-durability.** `notifyThreshold` at mutationFn step 1, before any network call. Success-signal is wired to intent, not to write completion.
3. **Modal is a generic Dialog**, dismissible orthogonally to mutation state. No "commit barrier" concept exists; intent-capture widget and pending mutation are coupled only by a component that can unmount freely.
4. **No HTTP contract for the compliance side-effect.** `POST /api/v1/financial-transactions` returns the txn row; nothing asserts "MTL entry derived OK." Today safe because the trigger raises → POST 500s. But any future drift (async bridge, fail-open, outbox pattern) silently breaks the compliance guarantee and the client has no way to notice.
5. **Semantic fragmentation in the pit-cash model.** Chips-taken now hits `pit_cash_observation`, financial writes hit `player_financial_transaction`, the MTL bridge attaches to one but not the other, and the operator UI renders both in the same form with equal weight. That is domain-contract drift, not a hardening task.

## Aligned posture

**Immediate batch (ship-blocker)**
- **P0.1** — move confirmation after POST 201 (fixes false success-signal)
- **P0.2** — block modal dismissal while save is pending (fixes the abort race; real target is operator-visible atomicity, not just a disabled X)
- **P0.3** — bridge integration test, expanded per audit G: (a) qualifying buy-in → `mtl_entry` exists; (b) sub-threshold buy-in → entry still written (bridge is ungated, threshold is read-time); (c) context-guard violation → whole transaction rolls back, no partial state
- **P1.4** — unsaved-buy-in interlock before close-session (same operator loop, same state-leak family)

**Contract amendment before coding (audit E/F)**
- Codify: *qualifying buy-in succeeds ⇔ `financial_transaction` AND `mtl_entry` both committed.* Server already enforces this in one txn; client contract must assert the same: POST 201 = both landed, any other response = neither landed. Put this in an `INV-MTL-BRIDGE-ATOMICITY` invariant.
- Reframe: `mtlKeys` invalidation, gaming-day default, realtime — all **observability**, not correctness.

**Next hardening pass (observability + hygiene)**
- Silent `modalData` guard removal
- `mtlKeys` invalidation on close-session
- Gaming-day default via `/api/v1/casino/gaming-day`
- Mixed-unit 2026-04-09 fixture scrub
- Test-id restoration on pit-panels surface

**Separate decision artifact (audit H)**
- Chips-taken / pit-cash-observation / MTL semantic bridge — spin out as an ADR amendment or SRM update under `docs/20-architecture/`. Bounded-context contract question, not a hardening bullet.

**Deferred**
- Realtime on `mtl_entry`

## One architectural question the glitch actually raises

**Should `useSaveWithBuyIn` exist as a composite client mutation at all?** If updating `average_bet` and recording a buy-in are one operator action, the composite belongs server-side as one RPC — one transaction, one round-trip, threshold notification in the response payload, no split-brain possible. If they are genuinely independent actions, the UI should separate them so the operator gets a per-field success/failure signal. The current hybrid gives us both costs (client believes it is atomic; backend treats it as split) and neither benefit. Not in scope for the ship-blocker, but worth raising now because the glitch is a direct symptom.

## Next step

Approve the immediate batch (P0.1, P0.2, P0.3, P1.4) + the `INV-MTL-BRIDGE-ATOMICITY` invariant codification? I'll draft the ADR stub for the chips-taken semantic question in parallel so it has a home before it gets buried again.