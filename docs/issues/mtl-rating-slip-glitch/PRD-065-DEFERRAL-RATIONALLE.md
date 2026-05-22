The react-best-practices suggestion is triggered by file pattern but this is an architectural decision task, not component work — skipping.

I have enough to form the call. Here is the blast-radius read and the recommendation.

## Blast radius of PRD-065

**Shared contracts/invariants it touches:**

1. **SRM v4.11.0 → v4.12.0** — Introduces *command ownership* as a new documented concept distinct from table ownership. First command-level cross-context write in PT-2 (the existing MTL bridge is trigger-level derivation, per ADR-049 §Reasoning, not a precedent). PFT/MTL context owners get a say.
2. **Transactionality** — New SECURITY DEFINER RPC (ADR-018 inventory entry, `search_path=''`, advisor sweep). Wraps or composes `rpc_create_financial_txn` without replacing it.
3. **Tenancy/Identity** — Preserved via `set_rls_context_from_staff()` (ADR-024), Category A JWT (ADR-040), `SET LOCAL` write-path (ADR-030). No new spoofable surface if executed correctly.
4. **Named HTTP contract** — `SaveRatingSlipBuyinResponse` becomes load-bearing for future bridge refactors (async/outbox/fail-open).
5. **Scope leak risk (R-7)** — Retiring PATCH `/average-bet` only from the buy-in path; aggressive refactor could break non-buy-in callers.
6. **Chips-taken remains composite** — ADR-050 territory, explicitly out of scope. So PRD-065 does *not* collapse the save-with-buyin flow end-to-end; it collapses {avgBet + buy-in + MTL} only. Chips-taken stays a separate client call.

## Sibling-flow reality (handleMovePlayer / handleCloseSession)

Grepping the current code: both are composite at the hook layer (move + loyalty accrual; close + financial + chips-taken). **ADR-049 R2 has not fired** — no production split-brain observed on either surface. Shape exists, observed incident does not. PRD-064 just landed today (`3839ba9b`); no "save-with-buy-in churn" signal yet.

## Recommendation — **DEFER (with one Investigate step)**

- **Wedge C is still AMBER 60%** and PRD-055 baseline service is the declared highest-ROI unblocker. CI/CD posture is a parallel P0. Both outrank architectural hardening on a *contained* surface.
- **PRD-064 has held for <24h.** No re-churn, no regression. Without R1/R2/R5 firing, the ADR-049 follow-up is "committed near-term" — not "this week."
- **PRD-065's cost is not small:** Phase 0 packaging gate, SRM amendment with cross-context reviewer friction, new RPC + governance, route handler, hook rewrite, E2E + integration rewrite, rollback plan. Real "architectural-implementation" slice.
- **Investigate step worth taking (~1 hour):** audit `hooks/rating-slip-modal/use-close-with-financial.ts` and `hooks/*/use-move-player.ts` for the same composite shape and add a note to the ADR-049 R2 watch list. If either hook already orchestrates 2+ endpoints under client control, surface it so the *first* R1/R2 incident promotes PRD-065 → "this quarter" with a widened scope that packages all three surfaces under (b) coordinator command rather than per-surface (a) RPCs. That widening is where (b) becomes load-bearing, per ADR-049 R2.

**Trigger to flip to "do now":** any of — a second production glitch on any composite surface (R1), an observed move-player/close-session split-brain (R2), MTL bridge goes async (R3), or the commit-barrier discipline regresses on a refactor (R5). Until one fires, keep PRD-065 draft-frozen and spend the cycles on Wedge C + CI/CD.