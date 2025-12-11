# Rating Slip Modal Component

Clean, PT-2 compliant rating slip modal component extracted from PT-1 reference implementation.

## File Structure

```
components/modals/rating-slip/
├── rating-slip-modal.tsx          # Main modal component
├── form-section-average-bet.tsx   # Average bet input with increment buttons
├── form-section-cash-in.tsx       # Cash in input with increment buttons
├── form-section-chips-taken.tsx   # Chips taken input with increment buttons
├── form-section-start-time.tsx    # Start time input with +/- 15min buttons
├── form-section-move-player.tsx   # Table/seat selection for moving players
├── increment-button-group.tsx     # Reusable increment button row (+5, +25, etc.)
├── index.tsx                      # Re-exports
└── README.md                      # This file
```

## UI Structure Preserved

### Dialog Layout
- **Dialog**: shadcn/ui Dialog component
- **DialogContent**: Modal content container
- **DialogHeader**: Title section with player name
- **DialogTitle**: "Rating Slip - {playerName}"

### Form Sections (in order)
1. **Average Bet**
   - Label + Reset button
   - Decrement (-) | Number input | Increment (+)
   - Increment buttons: +5, +25, +100, +500, +1000
   - Total change indicator

2. **Cash In**
   - Label + Reset button
   - Decrement (-) | Number input | Increment (+)
   - Increment buttons: +5, +25, +100, +500, +1000
   - Total change indicator

3. **Start Time**
   - Label + Reset button
   - -15m button | datetime-local input | +15m button
   - Total change indicator (in minutes)

4. **Move Player**
   - Label + "Currently at: {tableName}" indicator
   - Table select dropdown | Seat number input
   - "Move Player" button (full width)
   - Seat validation error display

5. **Chips Taken**
   - Label only (no reset)
   - Decrement (-) | Number input | Increment (+)
   - Increment buttons: +5, +25, +100, +500, +1000

### Action Buttons
- **Save Changes** (left, full width)
- **Close Session** (right, full width, destructive variant)

### Current Points Display
- Card-style box at bottom
- "Current Points" label
- Large, bold number (localeString formatted)

### Loading State
- Loading skeleton with 5 sections
- "Loading Rating Slip..." title

### Error Display
- Red-tinted background alert box
- Appears at top of form sections

## What Was Discarded

The following complexity was **removed** to create a clean presentational component:

### Removed Hooks & State Management
- `useRatingSlipController` - full controller logic
- `useTransition` - React 19 transition hook
- `useCallback` / `useMemo` - most optimizations removed
- `useToast` - toast notifications
- `useEffect` - success state handlers
- Complex validation logic (`getSaveValidation`, `getMoveValidation`)

### Removed Server Integration
- Server action calls (`handleMovePlayer`, `handleSave`, `handleClose`)
- Optimistic state updates
- DTO adapters (`adaptResponseDTOToLegacy`)
- Legacy format conversions

### Removed Features
- `ContextualHelpSystem` component
- All `console.log` / `console.error` statements
- Toast notifications
- Complex version tracking
- Ref-based state tracking for modal resets

## Component Props Interface

### RatingSlipModal
```typescript
interface RatingSlipModalProps {
  // Data
  ratingSlip: RatingSlipDto;
  tables: RatingSlipTableDto[];

  // Modal state
  isOpen: boolean;
  onClose: () => void;

  // Actions (callbacks that receive form state)
  onSave: (formState: FormState) => void;
  onCloseSession: (formState: FormState) => void;
  onMovePlayer: (formState: FormState) => void;

  // Loading states
  isLoading?: boolean;
  isSaving?: boolean;
  isClosing?: boolean;
  isMoving?: boolean;

  // Error state
  error?: string | null;
}
```

### FormState
```typescript
interface FormState {
  averageBet: string;
  startTime: string;
  cashIn: string;
  newTableId: string;
  newSeatNumber: string;
  chipsTaken: string;
}
```

## Usage Example

```tsx
import { RatingSlipModal } from '@/components/modals/rating-slip';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = (formState: FormState) => {
    // Call server action or mutation
    console.log('Saving:', formState);
  };

  const handleClose = (formState: FormState) => {
    // Call server action to close session
    console.log('Closing session:', formState);
  };

  const handleMove = (formState: FormState) => {
    // Call server action to move player
    console.log('Moving player:', formState);
  };

  return (
    <RatingSlipModal
      ratingSlip={myRatingSlip}
      tables={availableTables}
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onSave={handleSave}
      onCloseSession={handleClose}
      onMovePlayer={handleMove}
      isLoading={false}
      isSaving={false}
      isClosing={false}
      isMoving={false}
      error={null}
    />
  );
}
```

## Next Steps: Integration

To integrate this modal into PT-2, you'll need to:

1. **Replace placeholder types** with actual service DTOs:
   - Import from `@/services/rating-slip/types`
   - Import from `@/services/casino/types` (for tables)

2. **Connect to TanStack Query**:
   - Wrap in a container component
   - Use `useQuery` for fetching rating slip data
   - Use `useMutation` for save/close/move actions

3. **Add validation logic**:
   - Form validation before save/close/move
   - Seat number range validation
   - Required field validation

4. **Connect Server Actions**:
   - Create actions in `app/actions/rating-slip/`
   - Wire up `onSave`, `onCloseSession`, `onMovePlayer`

5. **Add optimistic updates**:
   - Use TanStack Query's optimistic update patterns
   - Update cache on successful mutations

## Styling

All styling uses:
- **Tailwind CSS v4** utilities
- **shadcn/ui** component base styles
- **Responsive** grid layouts
- **Accessible** form labels and ARIA attributes

No custom CSS required.

## Dependencies

- `@/components/ui/button` - shadcn/ui Button
- `@/components/ui/dialog` - shadcn/ui Dialog
- `@/components/ui/input` - shadcn/ui Input
- `@/components/ui/select` - shadcn/ui Select
- `@/components/ui/skeleton` - shadcn/ui Skeleton
- `lucide-react` - Icons (Plus, Minus, X, AlertCircle)
- `react` - React 19

## Testing

To test this component:

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Run component tests (when added)
npm test -- --grep "RatingSlipModal"
```

## Maintenance Notes

- **Keep it simple**: This is a presentational component. Business logic belongs in hooks/services.
- **Props over state**: Accept callbacks, don't trigger side effects directly.
- **No console logs**: All debug logging removed for production.
- **Accessibility**: Maintain proper labels, ARIA attributes, and keyboard navigation.
