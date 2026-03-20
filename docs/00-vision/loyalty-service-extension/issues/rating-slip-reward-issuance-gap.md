---
title: "Rating Slip Reward Issuance — UX Ergonomics Gap"
severity: P1
status: open
date: 2026-03-19
affects: Pit boss daily workflow — reward issuance only accessible via Player 360, not from primary workspace
references:
  - components/modals/rating-slip/rating-slip-modal.tsx (863 lines)
  - components/player-360/header/issue-reward-button.tsx (reference implementation)
  - components/loyalty/issue-reward-drawer.tsx (3-step state machine)
  - hooks/loyalty/use-issue-reward.ts (mutation hook)
---

# Rating Slip Reward Issuance — UX Ergonomics Gap

## Problem

Reward issuance lives exclusively in the Player 360 dashboard. The pit boss's primary workspace is the **pit panel terminal** where they manage rating slips. Issuing a reward today requires: close the rating slip modal → navigate to Player 360 → find the player → click Issue Reward → complete the flow → navigate back. This is the most frequent daily workflow and the current path has 4+ unnecessary navigation steps.

## Current Rating Slip Modal State

The modal (863 lines, `components/modals/rating-slip/rating-slip-modal.tsx`) already aggregates data from 5 bounded contexts via `useRatingSlipModalData`:

```
RatingSlipModalDTO {
  slip:      { id, visitId, casinoId, status, gamingDay, ... }
  player:    { id, firstName, lastName, cardNumber }         ← AVAILABLE
  loyalty:   { currentBalance, tier, suggestion }             ← AVAILABLE
  financial: { totalCashIn, totalChipsOut, netPosition }
  tables:    [ { id, label, occupiedSeats } ]
}
```

The modal already displays a **loyalty section** (lines 699-763):
- Current points balance with refresh button
- Session reward suggestion (for open/paused slips) with `suggestedPoints`
- Player tier badge
- Paused state indicator ("frozen" label)

**No reward issuance action exists in this surface.**

### Current Action Bar (Bottom Fixed)

| Button | When Shown | Purpose |
|---|---|---|
| Save Changes | Always | Persist form edits |
| Pause | status = 'open' | Stop accrual timer |
| Resume | status = 'paused' | Restart accrual |
| Close Session | Always | End play, trigger accrual |

## Data Context Readiness

Every prop needed by `IssueRewardButton` is already available in `modalData`:

| IssueRewardButton Prop | Source in Rating Slip Modal | Available? |
|---|---|---|
| `playerId` | `modalData.player?.id` | Yes (null for ghost visits) |
| `playerName` | `${player.firstName} ${player.lastName}` | Yes |
| `casinoName` | From `useAuth()` or environment | Yes |
| `currentBalance` | `modalData.loyalty?.currentBalance` | Yes |
| `currentTier` | `modalData.loyalty?.tier` | Yes |
| `staffName` | From `useAuth()` | Yes |
| `visitId` | `modalData.slip.visitId` | Yes (bonus: links issuance to visit) |
| `onFulfillmentReady` | Callback for Vector C print | Wirable |

**Zero new data fetching required.** The modal already has everything.

## Proposed Integration

### Placement: Within Loyalty Display Card

Add `IssueRewardButton` to the loyalty points display section, aligned with the balance and refresh button. This is the natural location — the pit boss sees the player's balance and can immediately act on it.

```
┌─────────────────────────────────────────────────┐
│ Current Points Balance                          │
│                                                 │
│   5,500 pts  [↻]  [🎁 Issue Reward]            │
│                                                 │
│ ─────────────────────────────────────────────── │
│ Session Reward Estimate          +350 pts       │
│ Based on current session activity               │
│                                                 │
│ Tier: SILVER                                    │
└─────────────────────────────────────────────────┘
```

### Conditional Rendering

- **Show**: When `modalData.player?.id` exists AND `modalData.loyalty` exists
- **Hide**: Ghost visits (no player), no loyalty record
- **Enabled**: All slip statuses (open, paused, closed) — a reward can be issued at any point
- **Compact mode**: `compact={true}` for space efficiency

### visitId Threading

The rating slip modal has `modalData.slip.visitId` — this should be passed to `useIssueReward` as `visitId`. This links the issuance to the specific visit, which:
- Enables `per_visit` scope enforcement (when cadence is implemented)
- Provides audit trail: "this comp was issued during visit X"
- The Player 360 path currently does NOT pass `visitId` (it's optional)

### Post-Issuance UX

On successful issuance:
1. `useIssueReward` invalidates loyalty balance query keys
2. `useRatingSlipModalData` refetches (stale time: 10s) → balance updates in modal
3. Drawer closes, modal stays open — pit boss continues rating slip work
4. No navigation required

## Implementation Scope

### Changes Required

**1. `rating-slip-modal.tsx`** — Add IssueRewardButton to loyalty display section:
```tsx
// Inside the loyalty points display card, next to refresh button
{modalData?.player?.id && modalData?.loyalty && (
  <IssueRewardButton
    playerId={modalData.player.id}
    playerName={`${modalData.player.firstName} ${modalData.player.lastName}`}
    currentBalance={modalData.loyalty.currentBalance}
    currentTier={modalData.loyalty.tier ?? undefined}
    compact
  />
)}
```

**2. `use-issue-reward.ts`** — Already accepts optional `visitId` in `IssueRewardInput`. No change needed.

**3. `issue-reward-drawer.tsx`** — May need to accept `visitId` prop and thread it to the mutation. Currently the drawer doesn't pass `visitId` because Player 360 doesn't have it in scope. Rating slip does.

### No Breaking Changes

- Form state (`formState`, dirty tracking) is orthogonal to reward issuance
- Action buttons (Save, Pause, Resume, Close) are unaffected
- Modal lifecycle unchanged
- Loyalty display section stays intact — button is additive
- `IssueRewardDrawer` opens as a Sheet overlay on top of the modal

### Estimated Scope

- ~15 lines added to `rating-slip-modal.tsx` (import + render)
- ~5 lines in `issue-reward-drawer.tsx` (thread `visitId` prop)
- Zero new components, hooks, services, or API routes

## UX Considerations

### Drawer-Over-Modal

The `IssueRewardDrawer` renders as a shadcn Sheet (slide-in panel). When opened from inside a modal:
- Sheet overlays the modal (z-index handles this)
- Modal remains mounted underneath (state preserved)
- On drawer close, modal is exactly where the pit boss left it
- This pattern works because Sheet and Dialog use separate Radix portals

### Session Reward Suggestion Connection

The modal already shows `suggestedPoints` from `evaluate_session_reward_suggestion`. Future enhancement: a "Quick Issue Suggested Reward" button that pre-selects the appropriate comp based on the suggestion amount. This is a natural next step but not required for the initial integration.

### Closed Slip Issuance

Reward issuance from a closed slip is valid — a pit boss may review a completed session and decide to comp the player after the fact. The button should remain enabled for closed slips. The `visitId` from the closed slip still links the issuance for audit purposes.

## Readiness Assessment

| Dimension | Readiness | Notes |
|---|---|---|
| Data context in modal | **100%** | All props available from `modalData` |
| IssueRewardButton component | **100%** | Proven in Player 360 header |
| IssueRewardDrawer | **100%** | 3-step state machine, family-aware |
| useIssueReward hook | **100%** | Accepts optional visitId |
| POST /api/v1/loyalty/issue | **100%** | Unified endpoint, role-gated |
| Drawer-over-modal UX | **95%** | Sheet + Dialog coexist via Radix portals. Verify z-index. |
| visitId threading | **90%** | Hook supports it; drawer needs minor prop addition |
| Query invalidation | **100%** | Balance auto-refreshes post-issuance |
| Implementation effort | **Minimal** | ~20 lines across 2 files |
