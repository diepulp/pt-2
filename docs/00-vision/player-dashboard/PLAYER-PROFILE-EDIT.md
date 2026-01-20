# Player Profile Edit Feature

## Overview

Extend the player dashboard with editable player profile information. Allows pit staff to update player address, contact info, and personal details directly from the dashboard.

## Current State

### Player Schema

**Core Player Table** (`player`):
| Column | Type | Editable | Notes |
|--------|------|----------|-------|
| `first_name` | string | Yes | Currently in update DTO |
| `last_name` | string | Yes | Currently in update DTO |
| `middle_name` | string | Yes | In schema, not exposed |
| `birth_date` | date | Yes | Currently in update DTO |
| `email` | string | Yes | In schema, not exposed |
| `phone_number` | string | Yes | In schema, not exposed |

**Player Identity Table** (`player_identity`) - KYC/Address:
| Column | Type | Editable | Notes |
|--------|------|----------|-------|
| `address` | JSONB | Yes | `{street, city, state, postalCode}` |
| `gender` | enum | Yes | `m`, `f`, `x` |
| `eye_color` | string | Yes | |
| `height` | string | Yes | Format: `6-01` |
| `weight` | string | Yes | |
| `document_number_hash` | text | No | Auto-computed, never displayed |
| `document_number_last4` | text | Read-only | PII-masked display |
| `issue_date` | date | Yes | ID document |
| `expiration_date` | date | Yes | ID document |
| `issuing_state` | string | Yes | |
| `document_type` | enum | Yes | `drivers_license`, `passport`, `state_id` |

### Existing Infrastructure

| Layer | Status |
|-------|--------|
| `PATCH /api/v1/players/[playerId]` | Exists (limited fields) |
| `POST /api/v1/players/[playerId]/identity` | Exists for address/KYC |
| `useUpdatePlayer()` hook | Exists |
| Player edit UI | Missing |

---

## Implementation Plan

### Phase 1: Extend Update DTOs

**Files**: `services/player/dtos.ts`, `services/player/schemas.ts`, `services/player/crud.ts`

1. Add `middle_name`, `email`, `phone_number` to `UpdatePlayerDTO`:
   ```typescript
   export type UpdatePlayerDTO = Partial<
     Pick<PlayerInsert, 'first_name' | 'last_name' | 'birth_date' | 'middle_name' | 'email' | 'phone_number'>
   >;
   ```

2. Extend `updatePlayerSchema` Zod validation:
   ```typescript
   export const updatePlayerSchema = z.object({
     first_name: z.string().min(1).max(100).optional(),
     last_name: z.string().min(1).max(100).optional(),
     birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
     middle_name: z.string().max(100).optional().nullable(),
     email: z.string().email().optional().nullable(),
     phone_number: z.string().max(20).optional().nullable(),
   }).partial();
   ```

3. Update `crud.ts` to pass new fields through to Supabase update.

### Phase 2: Create Edit Player Form Component

**New file**: `components/player-dashboard/player-edit-form.tsx`

Form sections:
- **Personal Info**: first_name, last_name, middle_name, birth_date
- **Contact Info**: email, phone_number
- **Address** (from identity): street, city, state, postalCode

Technical approach:
- Use `react-hook-form` with Zod resolver
- Partial updates - only submit changed fields
- Idempotency key on mutations
- Two API calls: player update + identity upsert

### Phase 3: Add Edit Modal to PlayerProfilePanel

**Files**:
- `components/player-dashboard/player-edit-modal.tsx` (new)
- `components/player-dashboard/player-profile-panel.tsx` (modify)

- Add "Edit" button to profile panel header
- Open modal dialog on click
- Use shadcn/ui `Dialog` component (already in codebase)

### Phase 4: Extend Mutation Hooks

**File**: `hooks/player/index.ts`

- `useUpdatePlayer()` - extend for new fields (already exists)
- `useUpdatePlayerIdentity()` - add for address updates
- Combined invalidation on success

### Phase 5: Integration

- Wire form submission to hooks
- Handle both player + identity updates
- Toast notifications for success/error
- Invalidate `playerKeys.detail(playerId)` cache

---

## Files to Create/Modify

```
services/player/
├── dtos.ts          # Extend UpdatePlayerDTO
├── schemas.ts       # Extend updatePlayerSchema
└── crud.ts          # Handle new fields

components/player-dashboard/
├── player-edit-form.tsx       # NEW: Edit form component
├── player-edit-modal.tsx      # NEW: Modal wrapper
└── player-profile-panel.tsx   # Add edit button trigger

hooks/player/
└── index.ts         # Extend hooks
```

---

## Architectural Considerations

| Concern | Approach |
|---------|----------|
| **Two tables** | Player core + identity require two API calls |
| **RLS compliance** | Existing endpoints handle via `set_rls_context_from_staff()` |
| **Idempotency** | Use `IDEMPOTENCY_HEADER` on mutations (ADR-021) |
| **Validation** | Zod at API boundary, react-hook-form at UI |
| **Optimistic updates** | Optional - TanStack Query invalidation is sufficient |

---

## Deferred Items

### SSN Field - DEFERRED

SSN (Social Security Number) implementation is deferred to a future phase due to:

1. **Compliance requirements** - PCI-DSS / PII handling needs formal review
2. **Encryption strategy** - Requires field-level encryption design (ADR)
3. **Access controls** - Need role-based visibility (some staff shouldn't see SSN)
4. **Audit requirements** - SSN access must be logged per gaming regulations

When implemented, SSN should follow the same pattern as `document_number`:
- Store only SHA-256 hash for deduplication
- Store last 4 digits for masked display
- Never store or transmit full SSN
- Require elevated permissions to view last 4

---

## Definition of Done

- [ ] Update DTOs include all personal info fields
- [ ] Zod schemas validate new fields
- [ ] Edit form component renders all editable fields
- [ ] Modal opens from PlayerProfilePanel edit button
- [ ] Player update mutation works with new fields
- [ ] Identity upsert handles address changes
- [ ] Cache invalidation updates UI after save
- [ ] Error states display validation messages
- [ ] Success toast confirms save
