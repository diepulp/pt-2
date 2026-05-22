/**
 * Predicate: detect a pending, unsaved buy-in in the Rating Slip Modal form.
 *
 * PRD-064 WS2 / P1.4 — Unsaved-Buy-In Interlock
 * @see docs/10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md G4
 *
 * ## Why this predicate exists
 * `handleCloseSession` historically called `closeWithFinancial.mutateAsync` *without*
 * passing `newBuyIn`. If the operator typed a buy-in into the rating-slip form then
 * clicked "Close Session" without saving first, the value was silently dropped —
 * no `player_financial_transaction`, no `mtl_entry`. This is the MTL glitch
 * containment target of PRD-064.
 *
 * ## "Not persisted" heuristic
 * After a successful `saveWithBuyIn`, the parent calls `initializeForm(...)` with
 * `newBuyIn: '0'`, which resets both `formState` and `originalState`. Therefore:
 *
 *   - A non-zero `formState.newBuyIn` can only exist if the buy-in has **not**
 *     been persisted (the save mutation has not succeeded for that value).
 *
 * This is equivalent to "save mutation has not succeeded in the current modal
 * session" and "the form is dirty for `newBuyIn`" — either criterion reduces to
 * the same check because both collapse on a successful save.
 *
 * Keeping the predicate pure (no hooks, no mutation references) makes it unit
 * testable in isolation and keeps the parent handler easy to read.
 */

/**
 * Shape of the fields this predicate cares about. Intentionally narrowed so we
 * can call it from the parent's `handleCloseSession` with only the relevant
 * form values and still unit-test it with plain objects.
 */
export interface PendingBuyInFormState {
  /** Buy-in amount as a string (from Zustand store's `newBuyIn`). */
  newBuyIn?: string;
}

/**
 * Returns true when `formState.newBuyIn` represents a pending, unsaved buy-in.
 *
 * Edge cases:
 * - `undefined` / missing field → `false` (nothing to save)
 * - Empty string → `false`
 * - Non-numeric string → `false` (coerces to NaN; NaN > 0 is false)
 * - Negative values → `false` (spec guards on `> 0`, matching PRD-064 G4)
 * - `'0'`, `'0.00'` → `false`
 * - `'0.01'` and above → `true`
 */
export function hasPendingUnsavedBuyIn(
  formState: PendingBuyInFormState,
): boolean {
  const value = Number(formState.newBuyIn ?? 0);
  return Number.isFinite(value) && value > 0;
}
