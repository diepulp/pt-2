---
title: "visitId Not Threaded to Reward Issuance from Player 360"
severity: P2
status: open
date: 2026-03-19
affects: Audit trail completeness — issuances from Player 360 have NULL visit_id in ledger/coupon records
references:
  - components/player-360/header/player-360-header-content.tsx:516-524
  - components/loyalty/issue-reward-drawer.tsx:100-109
  - hooks/loyalty/use-issue-reward.ts:27-36 (IssueRewardInput.visitId optional)
  - hooks/visit/use-active-visit.ts (exists, unused in Player 360)
  - services/player360-dashboard/crud.ts:97-103 (fetches active visit, doesn't expose)
---

# visitId Not Threaded to Reward Issuance from Player 360

## Problem

When a pit boss issues a reward from the Player 360 dashboard, the resulting `loyalty_ledger` or `promo_coupon` row has `visit_id = NULL`. The active visit exists and is queryable, but the data never reaches the issuance mutation. This breaks:

- **Audit trail**: "Which visit was this comp issued during?" — unanswerable
- **`per_visit` cadence enforcement**: When `reward_limits.scope = 'per_visit'` is implemented, the system can't count issuances within a visit if visit_id is NULL
- **Reporting**: "Total comps issued during this session" requires visit_id linkage

## Data Flow Trace

```
Player 360 Header
  └─ player-360-header-content.tsx
       └─ <IssueRewardButton playerId={...} playerName={...} compact />
            ↑ NO visitId prop passed

  IssueRewardButton
    └─ <IssueRewardDrawer playerId={...} ... />
         ↑ NO visitId prop available

  IssueRewardDrawer.handleConfirm()
    └─ issueReward({ playerId, rewardId })
         ↑ visitId NOT included (defaults to undefined)

  POST /api/v1/loyalty/issue
    └─ body: { player_id, reward_id, idempotency_key }
         ↑ visit_id absent

  rpc_redeem / rpc_issue_promo_coupon
    └─ visit_id = NULL in ledger/coupon row
```

## Where visitId IS Available

The data exists — it's just trapped:

| Location | Has visitId? | Exposed? |
|---|---|---|
| `getPlayerSummary()` in `crud.ts:97-103` | Yes — queries `visit` table for active visit | No — used for engagement calc, not returned in DTO |
| `useActiveVisit(playerId)` hook | Yes — returns `{ visit: { id, ... } }` | Exists but never called in Player 360 |
| `IssueRewardInput` interface | Yes — `visitId?: string` (optional) | Accepted but never populated from Player 360 |
| `issueRewardSchema` Zod | Yes — `visit_id: uuidSchemaOptional` | Optional, passed through when present |
| `rpc_redeem` / `rpc_issue_promo_coupon` | Yes — stores `visit_id` in row | Works correctly when provided |
| Rating slip modal (`modalData.slip.visitId`) | Yes — always available | Will be threaded in rating-slip integration |

## Fix: Thread via IssueRewardButton Props

**3 files, ~10 lines total:**

### 1. `player-360-header-content.tsx` — fetch active visit, pass to button

```tsx
import { useActiveVisit } from '@/hooks/visit/use-active-visit';

// Inside component:
const { data: activeVisitData } = useActiveVisit(playerId);

<IssueRewardButton
  playerId={playerId}
  playerName={playerName}
  visitId={activeVisitData?.visit?.id}
  compact
/>
```

### 2. `issue-reward-button.tsx` — accept and forward visitId

```tsx
interface IssueRewardButtonProps {
  // ... existing props
  visitId?: string;  // ← ADD
}

// Pass to drawer:
<IssueRewardDrawer
  {...drawerProps}
  visitId={visitId}
/>
```

### 3. `issue-reward-drawer.tsx` — thread to mutation

```tsx
interface IssueRewardDrawerProps {
  // ... existing props
  visitId?: string;  // ← ADD
}

const handleConfirm = () => {
  issueReward({
    playerId,
    rewardId: selectedReward.id,
    visitId,  // ← ADD
  });
  setStep('result');
};
```

## Why Not Option B (Expose in PlayerSummaryDTO)

Adding `activeVisitId` to `PlayerSummaryDTO` changes the service contract and requires modifying the BFF route, the mapper, and the DTO. Using `useActiveVisit()` — a hook that already exists and is tested — is simpler and reuses existing infrastructure without contract changes.

## Why Not Option C (Fetch Inside Drawer)

The drawer is a pure UI component with no knowledge of the player's visit context. Adding a visit fetch inside the drawer couples it to visit domain logic and creates a redundant subscription. Props-down is the correct React data flow.

## Impact on Rating Slip Integration

The rating slip modal already has `modalData.slip.visitId` — that path threads naturally. This fix ensures parity: both surfaces (Player 360 and rating slip) will pass visitId to issuance, producing complete audit records regardless of entry point.
