# Verdict: BRIDGE NEVER EXISTED (in production)

## What actually happened

| Date       | Commit      | Event                                                                                                                                                                                                                                 |
| ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-01-19 | `3d9f8262f` | Reverse bridge proposed: `20260119184500_reverse_mtl_to_finance_bridge.sql` creates `fn_derive_finance_from_mtl()` with G0–G5 guards. Comment added to `hooks/mtl/use-mtl-mutations.ts:85-90`.                                        |
| 2026-01-20 | `b6f4c1f3`  | Migration **deleted** ~21 hours later, inside a larger "MTL view modal + financial adjustments" commit. No ADR, no rationale in commit message, no DROP FUNCTION migration (because the CREATE never shipped). Comment left in place. |
| 2026-04-15 | —           | PRD-064 glitch investigation confirms forward PFT→MTL bridge is the only real edge. Reverse bridge not re-implemented.                                                                                                                |
| 2026-04-16 | `3839ba9b`  | PRD-064 shipped; `INV-MTL-BRIDGE-ATOMICITY` codified for the **forward** direction only.                                                                                                                                              |

PRD-065 (`docs/issues/mtl-rating-slip-glitch/PRD-065-DEFERRAL-RATIONALLE.md`) explicitly defers the composite-mutation collapse that would have re-introduced the reverse edge, gated on R1/R2/R3/R5 triggers.

## Current state of the two write paths

**Path A — rating-slip buy-in (the real one):**
`useSaveWithBuyIn` → `createFinancialTransaction` (RPC) → PFT insert → `trg_derive_mtl_from_finance` fires → MTL insert, same txn. Atomic. Invalidation of `mtlKeys.*` in `use-save-with-buyin.ts:253-262` is warranted.

**Path B — direct MTL entry (compliance dashboard):**
`useCreateMtlEntry` → MTL insert only. **No PFT is created.** The `playerFinancialKeys.visitSummary` and `playerFinancialKeys.list.scope` invalidations at `hooks/mtl/use-mtl-mutations.ts:91-101` fire against a non-event.

## Implication for the Freshness Contract

1. **MTL can be named as a canonical event source**, but only in the derived-from-PFT direction. The contract must say: "MTL is populated by the forward bridge; PFT is the authoritative financial record; direct MTL entry is compliance-audit-only and does not create a financial transaction."

2. **Two remediation items drop out of this finding:**
   - **Stale comment** at `hooks/mtl/use-mtl-mutations.ts:85-90` — rewrite to reflect reality, or delete the conditional invalidation block if direct MTL entry truly never affects PFT-derived reads.
   - **Dead invalidation** at `hooks/mtl/use-mtl-mutations.ts:91-101` — if Path B never produces a PFT, invalidating PFT caches is either dead code or silently masking a design ambiguity about what "compliance-only" MTL means. The contract draft should force a decision.

3. **PRD-065 deferral is a contract pre-condition**, not an artifact to ignore. If the reverse bridge is ever re-implemented, the Freshness Contract's direction-of-derivation clause must be amended first.

## Updated map (corrected)

```
PFT  ─── trg_derive_mtl_from_finance ───►  MTL
 ▲                                          │
 │                                          │
 └──── ✗ no reverse bridge ✗ ◄──────────────┘
        (proposed 2026-01-19, deleted 2026-01-20, deferred via PRD-065)
```

Ready to proceed with the ADR draft using this corrected graph, or do you want to resolve the stale-comment / dead-invalidation remediation first so the Contract lands against clean client code?