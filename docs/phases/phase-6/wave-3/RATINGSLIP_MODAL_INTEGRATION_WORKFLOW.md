# RatingSlip Modal Integration Workflow

**Date**: 2025-10-14
**Status**: Ready for Execution
**Addresses**: Wave 3 Task 3.1.1 & 3.1.2 Oversight

---

## Architecture Alignment

**✅ VERIFIED**: This workflow is compliant with established architectural patterns.

### Standards Applied

| Standard | Reference | Status |
|----------|-----------|--------|
| State Management | `docs/adr/ADR-003-state-management-strategy.md` | ✅ COMPLIANT |
| Server Actions | `docs/patterns/SERVER_ACTIONS_ARCHITECTURE.md` | ✅ COMPLIANT |
| Service Layer | `docs/system-prd/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` | ✅ COMPLIANT |

### ADR-003 State Management Principles

1. **React Query for Server State** ✅
   - `useServiceMutation` for `completeRatingSlip()` and `manualReward()`
   - Automatic loading/error state management
   - Built-in retry logic (1 for queries, 0 for mutations)
   - Server actions passed DIRECTLY (not wrapped in closures)

2. **Cache Invalidation Strategy** ✅
   - Domain-level invalidation for operations affecting multiple queries
   - Query keys: `['rating-slip']`, `['loyalty', 'player', playerId]`
   - Follows established pattern from 32 passing integration tests

3. **Local Component State for UI** ✅
   - `useState` for modal visibility (component-local, ephemeral)
   - No Zustand needed (not cross-component state)

4. **Query Key Pattern** ✅
   - Structure: `[domain, operation, ...params]`
   - Examples: `['loyalty', 'player', playerId]`, `['rating-slip', 'detail', slipId]`

### SERVER_ACTIONS_ARCHITECTURE.md Compliance

1. **Server Actions in `app/actions/`** ✅
   - `completeRatingSlip` in `app/actions/ratingslip-actions.ts`
   - `manualReward` in `app/actions/loyalty-actions.ts`
   - Both marked with `"use server"` directive

2. **Client Integration Pattern** ✅
   - Server actions passed directly to `useServiceMutation`
   - NOT wrapped in closures
   - NOT called from other server actions

3. **Type Safety** ✅
   - All actions return `ServiceResult<T>`
   - Full TypeScript support
   - Explicit interfaces for all inputs/outputs

**No architecture reinvention** - all patterns follow validated standards from Phase 3-6.

---

## Problem Statement

Wave 3 implementation completed MTL UI components but **completely omitted** the critical RatingSlip modal updates specified in Tasks 3.1.1 and 3.1.2 of the Phase 6 Developer Checklist.

### Critical Clarification
- **"Remove `points` display logic"** refers to the OLD `ratingslip.points` schema column that was dropped in Wave 0
- **Loyalty points accrual display MUST REMAIN** - this shows points earned from gameplay
- Current implementation shows "Current Points" (line 332-334) which is CORRECT and should be ENHANCED

---

## Current State Analysis

### ✅ What Exists
- **File**: `components/rating-slip/rating-slip-modal.tsx` (402 LOC)
- **Current Points Display** (lines 332-334): Shows accumulated loyalty points
- **Close Session Button** (line 365-371): Triggers `onCloseSession` callback
- **Player Info Display** (lines 158-168): Name, membership ID, tier
- **Form State Management**: Draft state with validation

### ❌ What's Missing
1. **Loyalty Integration**: No connection to `completeRatingSlip()` server action
2. **Loyalty Response Display**: After session closure, should show:
   - Points earned from this session
   - New balance
   - New tier (if upgraded)
   - Tier progress
3. **Manual Reward Button**: No "Issue Bonus Points" capability for staff
4. **Loading States**: No async operation feedback
5. **Error Handling**: No loyalty failure recovery UI
6. **Manual Reward Dialog**: Component doesn't exist

---

## Execution Workflow

### Phase 1: Analysis & Setup (30 min)

**Task 1.1: Understand Dependencies**
- [x] `completeRatingSlip()` server action exists (Wave 2)
- [x] `manualReward()` server action exists (Wave 2)
- [x] `usePlayerLoyalty()` hook exists (Wave 3)
- [x] State management strategy defined in ADR-003

**Task 1.2: Apply ADR-003 State Management Strategy**

Per `docs/adr/ADR-003-state-management-strategy.md`:

**Server State** (React Query mutations):
```typescript
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import { completeRatingSlip } from "@/app/actions/ratingslip-actions";

// In RatingSlipModal component:
const { mutate: closeSlip, isPending: isClosing, data: loyaltyResult, error } =
  useServiceMutation(completeRatingSlip, {
    onSuccess: (data) => {
      // Invalidate affected queries per ADR-003
      queryClient.invalidateQueries({ queryKey: ['rating-slip'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty', 'player', snapshot.player.id] });

      // Show success feedback
      toast.success("Session closed successfully");
      if (data.tierUpgraded) {
        toast.success(`🎉 Tier upgraded to ${data.loyaltyTier}!`);
      }
    }
  });
```

**UI State** (Local component state - ephemeral):
```typescript
// Modal visibility - component-local, no cross-component sharing needed
const [showManualReward, setShowManualReward] = useState(false);
```

**Rationale**:
- `closeSlip` mutation managed by React Query (server state)
- Modal visibility is component-local UI state (useState sufficient)
- No Zustand needed unless modal state requires cross-component sharing
- Follows ADR-003 cache invalidation: domain-level for operations affecting multiple queries

---

### Phase 2: Task 3.1.2 - Manual Reward Dialog (1.5h)

**Create First** (to enable Task 3.1.1 integration)

**File**: `components/loyalty/manual-reward-dialog.tsx`

**Requirements**:
1. **Dialog Component** (shadcn Dialog)
2. **Form Fields**:
   - Player ID (auto-populated, read-only)
   - Points (number input, required, min 1)
   - Reason (textarea, required, min 10 chars)
   - Source (radio: manual/promotion, default: manual)
3. **Validation**:
   - Points must be positive integer
   - Reason must be non-empty and meaningful
4. **Server Action Integration** (ADR-003 Pattern):
   ```typescript
   import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
   import { useQueryClient } from "@tanstack/react-query";
   import { manualReward } from "@/app/actions/loyalty-actions";

   const queryClient = useQueryClient();

   const { mutate: awardPoints, isPending: isSubmitting } = useServiceMutation(
     manualReward,
     {
       onSuccess: (result) => {
         // Cache invalidation per ADR-003 (domain-level)
         queryClient.invalidateQueries({ queryKey: ['loyalty', 'player', playerId] });
         queryClient.invalidateQueries({ queryKey: ['rating-slip', 'detail', sessionId] });

         // Success feedback
         toast.success(`Awarded ${result.pointsAwarded} points`);
         toast.info(`New balance: ${result.newBalance} | Tier: ${result.tier}`);

         onSuccess?.(result);
         onOpenChange(false);
       },
       onError: (error) => {
         // Idempotency handling
         if (error.code === "IDEMPOTENCY_CONFLICT") {
           toast.warning("This reward was already processed");
         } else {
           toast.error(error.message);
         }
       }
     }
   );

   const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
     e.preventDefault();
     const formData = new FormData(e.currentTarget);

     awardPoints({
       playerId,
       sessionId,
       points: Number(formData.get("points")),
       reason: formData.get("reason") as string,
       source: formData.get("source") as "manual" | "promotion",
       staffId: currentStaffId, // From auth context
     });
   };
   ```
5. **Idempotency Handling**:
   - Show friendly message for duplicate rewards
   - Don't treat as hard error
6. **Accessibility**:
   - ARIA labels for all inputs
   - Keyboard navigation (Tab, Enter, Esc)
   - Focus management (trap focus in dialog)

**Component Signature**:
```typescript
interface ManualRewardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  sessionId: string;
  currentBalance: number;
  currentTier: string;
  onSuccess?: (result: ManualRewardResult) => void;
}

export function ManualRewardDialog(props: ManualRewardDialogProps) {
  // Implementation
}
```

**Testing**:
- [ ] Form validation works
- [ ] Server action called with correct params
- [ ] Success shows toast and closes dialog
- [ ] Idempotency shows warning toast
- [ ] Error shows error toast
- [ ] Accessibility: keyboard navigation works

---

### Phase 3: Task 3.1.1 - RatingSlip Modal Updates (2h)

**File**: `components/rating-slip/rating-slip-modal.tsx`

#### Change 3.1: Add Loyalty Integration (ADR-003 Pattern)

**Import React Query Mutation Hook**:
```typescript
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import { useQueryClient } from "@tanstack/react-query";
import { completeRatingSlip } from "@/app/actions/ratingslip-actions";
```

**Add State Management** (per ADR-003 + SERVER_ACTIONS_ARCHITECTURE.md):
```typescript
const queryClient = useQueryClient();
const [showManualReward, setShowManualReward] = useState(false);

// React Query mutation for server state (ADR-003)
// Server action pattern: Pass action directly, NOT wrapped in closure
const {
  mutate: closeSlip,
  isPending: isClosing,
  data: completionResult,
  error: loyaltyError,
} = useServiceMutation(
  completeRatingSlip, // ✅ Pass server action directly (SERVER_ACTIONS_ARCHITECTURE.md)
  {
    onSuccess: (result) => {
      // Call existing callback for local state sync
      onCloseSession?.(draft);

      // Cache invalidation per ADR-003 (domain-level)
      queryClient.invalidateQueries({ queryKey: ['rating-slip'] });
      queryClient.invalidateQueries({
        queryKey: ['loyalty', 'player', snapshot.player.id]
      });

      // Show success feedback
      toast.success("Session closed successfully");
      toast.info(`Earned ${result.loyalty.pointsEarned} loyalty points!`);

      // If tier upgraded, show celebration
      if (result.loyalty.tierUpgraded) {
        toast.success(`🎉 Tier upgraded to ${result.loyalty.tier}!`);
      }

      // Close modal after successful completion
      setTimeout(() => onOpenChange(false), 2000);
    },
    onError: (error) => {
      // Error handling with recovery guidance
      if (error.code === "PARTIAL_COMPLETION") {
        toast.error(
          `Session closed but loyalty processing failed. Contact support with ID: ${error.metadata?.correlationId}`
        );
      } else {
        toast.error(error.message || "Failed to close session");
      }
    }
  }
);
```

**Close Session Handler** (simplified with React Query):
```typescript
const handleCloseSession = () => {
  // Execute server action via mutation
  // Local state callback handled in onSuccess
  closeSlip(snapshot.id);
};
```

**Key Points** (SERVER_ACTIONS_ARCHITECTURE.md compliance):
- ✅ Server action passed directly to `useServiceMutation` (NOT wrapped in closure)
- ✅ `completeRatingSlip` is marked with `"use server"` directive
- ✅ Returns `ServiceResult<RatingSlipCompletionResult>` with proper typing
- ✅ Local state callback (`onCloseSession`) executed in `onSuccess` after server operation

**Rationale**:
- React Query manages loading/error states automatically
- Cache invalidation follows ADR-003 domain-level pattern
- No manual state management for async operations
- Consistent with established patterns across codebase

#### Change 3.2: Add Manual Reward Button

**In the "Current Points" aside section** (around line 327), add:

```typescript
<aside className="space-y-4 rounded-xl border border-border bg-muted/40 p-4 shadow-sm">
  <div className="space-y-1">
    <p className="text-sm font-medium text-muted-foreground">
      Current Points
    </p>
    <p className="text-3xl font-semibold tracking-tight">
      {snapshot.currentPoints?.toLocaleString() ?? "0"}
    </p>
  </div>

  {/* NEW: Manual Reward Button */}
  {snapshot.status === "OPEN" && (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2"
      onClick={() => setShowManualReward(true)}
    >
      <Gift className="size-4" />
      Issue Bonus Points
    </Button>
  )}

  {/* NEW: Loyalty Result Display (from React Query mutation data) */}
  {completionResult && (
    <div className="space-y-2 rounded-lg border border-green-500/20 bg-green-50/50 p-3">
      <p className="text-sm font-semibold text-green-900">
        Session Complete
      </p>
      <div className="space-y-1 text-sm text-green-800">
        <p>Points Earned: <strong>+{completionResult.loyalty.pointsEarned}</strong></p>
        <p>New Balance: <strong>{completionResult.loyalty.newBalance}</strong></p>
        <p>Tier: <strong>{completionResult.loyalty.tier}</strong></p>
        <div className="mt-2">
          <Progress value={completionResult.loyalty.tierProgress} className="h-2" />
          <p className="mt-1 text-xs text-muted-foreground">
            {completionResult.loyalty.tierProgress}% to next tier
          </p>
        </div>
      </div>
    </div>
  )}

  {/* NEW: Error Display (from React Query mutation error) */}
  {loyaltyError && (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Loyalty Error</AlertTitle>
      <AlertDescription>
        {loyaltyError.message}
        {loyaltyError.metadata?.correlationId && (
          <div className="mt-1 text-xs opacity-80">
            Correlation ID: {loyaltyError.metadata.correlationId}
          </div>
        )}
      </AlertDescription>
    </Alert>
  )}

  <div className="space-y-2 text-sm text-muted-foreground">
    <p>Session tracking and loyalty integration active.</p>
  </div>
</aside>
```

#### Change 3.3: Add Manual Reward Dialog Integration

**At the end of component, before closing Dialog**:

```typescript
{/* Manual Reward Dialog */}
<ManualRewardDialog
  open={showManualReward}
  onOpenChange={setShowManualReward}
  playerId={snapshot.player.id}
  playerName={snapshot.player.name}
  sessionId={snapshot.id}
  currentBalance={snapshot.currentPoints ?? 0}
  currentTier={snapshot.player.tier ?? "BRONZE"}
  onSuccess={(result) => {
    // Refresh loyalty display
    setLoyaltyResult({
      pointsEarned: result.pointsAwarded,
      newBalance: result.newBalance,
      tier: result.tier,
      tierProgress: result.tierProgress,
    });
  }}
/>
```

#### Change 3.4: Update Close Session Button

**Modify button to show loading state**:

```typescript
<Button
  type="button"
  variant="destructive"
  onClick={handleCloseSession}
  disabled={isClosing || snapshot.status === "CLOSED"}
>
  {isClosing ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Closing...
    </>
  ) : (
    "Close Session"
  )}
</Button>
```

#### Change 3.5: Add Required Imports (ADR-003 Compliant)

```typescript
import { useState } from "react";
import { Gift, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { ManualRewardDialog } from "@/components/loyalty/manual-reward-dialog";

// ADR-003: React Query for server state management
import { useServiceMutation } from "@/hooks/shared/use-service-mutation";
import { useQueryClient } from "@tanstack/react-query";
import { completeRatingSlip } from "@/app/actions/ratingslip-actions";
```

---

### Phase 4: Testing & Validation (1h)

**Unit Tests**: `__tests__/components/rating-slip-modal.test.tsx`

```typescript
describe("RatingSlipModal Loyalty Integration", () => {
  it("displays loyalty result after successful session closure", async () => {
    // Mock completeRatingSlip to return success
    const mockComplete = jest.fn().mockResolvedValue({
      success: true,
      data: {
        loyaltyPoints: 500,
        loyaltyBalance: 1500,
        loyaltyTier: "SILVER",
        tierProgress: 60,
        tierUpgraded: false,
      },
    });

    render(<RatingSlipModal {...props} />);

    const closeButton = screen.getByRole("button", { name: /close session/i });
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.getByText(/Points Earned: \+500/i)).toBeInTheDocument();
      expect(screen.getByText(/New Balance: 1500/i)).toBeInTheDocument();
      expect(screen.getByText(/Tier: SILVER/i)).toBeInTheDocument();
    });
  });

  it("shows manual reward dialog when bonus button clicked", async () => {
    render(<RatingSlipModal {...props} snapshot={{ ...snapshot, status: "OPEN" }} />);

    const bonusButton = screen.getByRole("button", { name: /issue bonus points/i });
    await userEvent.click(bonusButton);

    expect(screen.getByRole("dialog", { name: /manual reward/i })).toBeInTheDocument();
  });

  it("handles loyalty errors gracefully", async () => {
    const mockComplete = jest.fn().mockResolvedValue({
      success: false,
      error: {
        code: "PARTIAL_COMPLETION",
        message: "Loyalty processing failed",
        metadata: { correlationId: "test-123" },
      },
    });

    render(<RatingSlipModal {...props} />);

    const closeButton = screen.getByRole("button", { name: /close session/i });
    await userEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.getByText(/loyalty processing failed/i)).toBeInTheDocument();
      expect(screen.getByText(/test-123/i)).toBeInTheDocument();
    });
  });
});
```

**Integration Tests**: Add to `__tests__/integration/ratingslip-loyalty.test.ts`

```typescript
it("manual reward during session updates balance in real-time", async () => {
  const { slip, playerId } = await createTestScenario();

  // Issue manual reward while session is open
  const rewardResult = await manualReward({
    playerId,
    sessionId: slip.id,
    points: 500,
    reason: "High roller bonus",
    source: "manual",
    staffId: testStaffId,
  });

  expect(rewardResult.success).toBe(true);
  expect(rewardResult.data.newBalance).toBeGreaterThanOrEqual(500);

  // Close session - should accumulate both manual + gameplay points
  const completeResult = await completeRatingSlip(slip.id);

  expect(completeResult.success).toBe(true);
  expect(completeResult.data.loyaltyBalance).toBeGreaterThan(500); // Manual + gameplay
});
```

**E2E Tests**: `cypress/e2e/rating-slip-loyalty.cy.ts`

```typescript
describe("RatingSlip → Loyalty Integration", () => {
  it("staff can issue bonus points and close session", () => {
    cy.visit("/floor");
    cy.getByTestId("rating-slip-123").click();

    // Issue bonus points
    cy.getByRole("button", { name: /issue bonus points/i }).click();
    cy.getByLabelText(/points/i).type("500");
    cy.getByLabelText(/reason/i).type("High roller welcome bonus");
    cy.getByRole("button", { name: /award points/i }).click();

    cy.contains(/awarded 500 points/i).should("be.visible");

    // Close session
    cy.getByRole("button", { name: /close session/i }).click();

    // Verify loyalty result displayed
    cy.contains(/points earned/i).should("be.visible");
    cy.contains(/new balance/i).should("be.visible");
    cy.contains(/tier:/i).should("be.visible");
  });
});
```

---

## Quality Gates

### Before Merge
- [ ] Manual reward dialog created and functional
- [ ] RatingSlip modal shows loyalty results after closure
- [ ] Loading states work (button disabled, spinner shown)
- [ ] Error handling displays user-friendly messages
- [ ] Manual reward button only shows when session is OPEN
- [ ] Idempotency handled gracefully (no angry error messages)
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] E2E test validates full workflow
- [ ] TypeScript compilation clean (0 errors)
- [ ] ESLint passing (no console.log)
- [ ] Accessibility: keyboard navigation works
- [ ] Accessibility: screen reader labels correct

### After Merge
- [ ] Update Wave 3 completion signoff with these additions
- [ ] Mark Task 3.1.1 and 3.1.2 as complete in checklist
- [ ] Create follow-up task for any deferred enhancements

---

## Server Action Compliance (SERVER_ACTIONS_ARCHITECTURE.md)

### Verified Server Actions

**`completeRatingSlip(slipId: string)`** - `app/actions/ratingslip-actions.ts:112`
- ✅ Marked with `"use server"` directive (line 11)
- ✅ Returns `ServiceResult<RatingSlipCompletionResult>`
- ✅ Includes correlation ID tracking for observability
- ✅ Implements saga recovery pattern (PARTIAL_COMPLETION error)
- ✅ Type-safe: Full TypeScript support with explicit interfaces
- ⚠️ **Note**: Does NOT use `withServerAction` wrapper (orchestration pattern, not simple CRUD)

**`manualReward(input: ManualRewardInput)`** - `app/actions/loyalty-actions.ts:174`
- ✅ Marked with `"use server"` directive
- ✅ Returns `ServiceResult<ManualRewardResult>`
- ✅ Includes permission checks, rate limiting, idempotency
- ✅ Audit logging via `emit-telemetry.ts`

**Client Integration Pattern** (ADR-003 + SERVER_ACTIONS_ARCHITECTURE.md):
```typescript
// ✅ CORRECT: Pass server action directly to useServiceMutation
const { mutate } = useServiceMutation(completeRatingSlip, { ... });

// ❌ WRONG: Don't wrap server action in closure
const { mutate } = useServiceMutation(async (id) => completeRatingSlip(id), { ... });

// ❌ WRONG: Don't call server actions from other server actions
// (call services directly instead)
```

---

## Dependencies & Risks

### Dependencies
✅ `completeRatingSlip()` server action (Wave 2 - exists, verified)
✅ `manualReward()` server action (Wave 2 - exists, verified)
✅ `usePlayerLoyalty()` hook (Wave 3 - exists)
✅ `useServiceMutation` hook (ADR-003 - exists)
✅ Permission service with loyalty:award capability (Wave 3 - exists)
❓ Current staff authentication context (need to verify)
❓ Toast notification system (need to verify shadcn/ui setup)

### Risks
- **Low**: Server actions already tested in Wave 2
- **Low**: UI components follow existing patterns
- **Medium**: Staff auth context integration may need adjustment
- **Medium**: Need to ensure proper session ID correlation

---

## Implementation Order

1. **First**: Create `ManualRewardDialog` component (1.5h)
   - This is standalone and can be tested independently
   - Blocks RatingSlip modal integration

2. **Second**: Update `RatingSlipModal` component (2h)
   - Integrate loyalty completion
   - Add manual reward button
   - Add result displays

3. **Third**: Add tests (1h)
   - Unit tests for both components
   - Integration test for combined workflow
   - E2E test for user journey

**Total Estimated Time**: 4.5 hours

---

## Success Criteria

**Functional**:
- Staff can issue mid-session bonus points from RatingSlip modal
- Session closure triggers loyalty accrual automatically
- Loyalty results (points, tier, progress) displayed in modal
- Errors handled gracefully with recovery guidance
- Idempotency works (duplicate rewards don't double-count)

**Technical**:
- Zero TypeScript errors
- All tests passing (unit + integration + E2E)
- No console warnings or errors
- Accessibility standards met (WCAG 2.1 AA)
- Performance: Modal renders <100ms, actions complete <2s

**User Experience**:
- Clear feedback for all operations (loading, success, error)
- Intuitive button placement and labeling
- Helpful error messages with actionable guidance
- Visual celebration for tier upgrades
- Smooth transitions and animations

---

## Next Steps

1. **Immediate**: Mark Task 3.1.1 and 3.1.2 as in_progress
2. **Execute**: Follow Phase 2 → Phase 3 → Phase 4 workflow
3. **Validate**: Run all quality gates before merge
4. **Document**: Update Wave 3 completion signoff
5. **Deploy**: Include in next Phase 6 deployment

---

**Status**: Ready for execution
**Owner**: To be assigned
**Priority**: HIGH (blocks Wave 3 completion)
**Estimated Completion**: 2025-10-14 (4.5 hours)
