---
# EXECUTION-SPEC Frontmatter
# Source: PRD-038A §8 (UI Requirements) + FINDINGS-PRD-038A-UI-WIRING §Workstream A

prd: PRD-038A
prd_title: "Pit Terminal — Table Session Lifecycle Wiring"
service: TableContextService
mvp_phase: 2  # Phase 2 (Table Operations)

workstreams:
  WS1:
    name: Service Layer Completions (Labels, HTTP, Hook)
    description: >
      Add CLOSE_REASON_LABELS to labels.ts (human-readable labels for 8 close_reason_type values).
      Add forceCloseTableSession HTTP fetcher to http.ts (POST to /api/v1/table-sessions/{id}/force-close).
      Add useForceCloseTableSession mutation hook to use-table-session.ts (calls fetcher, invalidates session cache).
      These are prerequisite client-side APIs consumed by WS2 and WS3.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - services/table-context/labels.ts
      - services/table-context/http.ts
      - hooks/table-context/use-table-session.ts
    gate: type-check
    estimated_complexity: low

  WS2:
    name: CloseSessionDialog Enhancement
    description: >
      Enhance close-session-dialog.tsx with PRD-038A close governance UI:
      (1) Replace hardcoded close_reason='end_of_shift' with Select dropdown using CLOSE_REASON_LABELS.
      (2) Add Textarea for close_note, visible+required when close_reason='other'.
      (3) Add Alert when session.has_unresolved_items=true warning close is blocked.
      (4) Disable regular Close button when has_unresolved_items.
      (5) Add Force Close button (variant=destructive) visible to pit_boss/admin roles via useAuth().staffRole.
      (6) Force Close calls useForceCloseTableSession hook.
      (7) Form validation: close_reason required, close_note required when 'other', artifacts still required for normal close.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - components/table/close-session-dialog.tsx
    gate: type-check
    estimated_complexity: medium

  WS3:
    name: Pit Terminal Integration & Session Wiring
    description: >
      Wire orphaned SessionActionButtons and enhanced CloseSessionDialog into the pit terminal:
      (1) pit-panels-client.tsx — call useCurrentTableSession(selectedTableId), pass session to TablesPanel.
      (2) tables-panel.tsx — accept session prop, manage close dialog open state, render SessionActionButtons
          and CloseSessionDialog with session data. Get staffId+casinoId from useAuth().
      (3) table-toolbar.tsx — accept session prop. Remove placeholder toggle-status action.
          Add session status badge (no action buttons — SessionActionButtons is the single owner).
      (4) New reconciliation-badge.tsx — Badge component showing "Reconciliation Required" when
          session.requires_reconciliation=true.
      (5) Render ReconciliationBadge in tables-panel when applicable.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    outputs:
      - components/pit-panels/pit-panels-client.tsx
      - components/pit-panels/tables-panel.tsx
      - components/table/table-toolbar.tsx
      - components/table/reconciliation-badge.tsx
    gate: type-check
    estimated_complexity: high

  WS4:
    name: Unit Tests
    description: >
      (1) CLOSE_REASON_LABELS completeness test — all 8 enum values have labels, no extras.
      (2) forceCloseTableSession HTTP contract test — correct URL, method, body shape.
      (3) CloseSessionDialog behavior tests — close reason select renders, force close visible
          only for privileged roles, validation rejects missing close_reason, 'other' requires note.
      (4) Session state predicate tests — canOpenSession, canStartRundown, canCloseSession
          return correct values for each session status.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS2, WS3]
    outputs:
      - services/table-context/__tests__/close-reason-labels.test.ts
      - hooks/table-context/__tests__/force-close-http.test.ts
      - hooks/table-context/__tests__/close-session-http.test.ts
      - components/table/__tests__/close-session-dialog.test.tsx
    gate: test-pass
    estimated_complexity: medium

execution_phases:
  - name: "Phase 1 — Service Layer + Pit Wiring"
    parallel: [WS1, WS3]
    gates: [type-check]

  - name: "Phase 2 — Dialog Enhancement"
    parallel: [WS2]
    gates: [type-check]

  - name: "Phase 3 — Tests"
    parallel: [WS4]
    gates: [test-pass]

gates:
  type-check:
    command: "npm run type-check"
    success_criteria: "Exit code 0, no type errors"

  lint:
    command: "npm run lint"
    success_criteria: "Exit code 0, no errors"

  test-pass:
    command: "npm test services/table-context/__tests__/close-reason-labels.test.ts hooks/table-context/__tests__/force-close-http.test.ts hooks/table-context/__tests__/close-session-http.test.ts components/table/__tests__/close-session-dialog.test.tsx"
    success_criteria: "All tests pass"

external_dependencies:
  - prd: PRD-038A (EXEC-038A audit patch)
    service: TableContextService
    required_for: >
      close_reason_type enum, close_reason/close_note columns, has_unresolved_items,
      requires_reconciliation, rpc_force_close_table_session, forceCloseTableSessionSchema,
      ForceCloseTableSessionInput DTO, force-close route handler — all already implemented.

risks:
  - risk: "useAuth().staffRole may be null during initial load or when JWT claims are stale"
    mitigation: "Disable force-close button when staffRole is null/loading. Only show when role is definitively pit_boss or admin."
  - risk: "SessionActionButtons + CloseSessionDialog prop threading increases TablesPanel complexity"
    mitigation: "TablesPanel manages close dialog state locally. Session data comes from one hook (useCurrentTableSession). No prop drilling beyond one level."
  - risk: "TableToolbar already has a placeholder toggle-status action — replacing it may break compact toolbar layout"
    mitigation: "Preserve compact variant behavior. Session actions in compact mode use icon-only buttons with tooltips, same pattern as existing actions."

---

# EXECUTION-SPEC: PRD-038A — Pit Terminal Session Lifecycle Wiring

## Overview

The PRD-038A audit patch (EXEC-038A) delivered the **backend** for table session lifecycle governance: close guardrails, close reason capture, force close with audit trail, and attribution columns. However, the **frontend is disconnected** — two key components (`SessionActionButtons` and `CloseSessionDialog`) exist but are imported by nothing, and the close dialog hardcodes `close_reason: 'end_of_shift'`.

This EXEC-SPEC wires the pit terminal to the table session lifecycle so pit bosses can:
- Open sessions, start rundowns, and close sessions from the session controls area (SessionActionButtons), not the TableToolbar
- Select a close reason when closing (8 enum options)
- See a guardrail warning when unresolved liabilities exist
- Force-close with audit trail (privileged roles only)
- See reconciliation badges on force-closed sessions

## Scope

**In Scope:**
- `CLOSE_REASON_LABELS` record in `services/table-context/labels.ts`
- `forceCloseTableSession` HTTP fetcher in `services/table-context/http.ts`
- `useForceCloseTableSession` mutation hook in `hooks/table-context/use-table-session.ts`
- `CloseSessionDialog` enhancement: close reason select, close note, guardrail alert, force close
- `PitPanelsClient` → `TablesPanel` session data flow via `useCurrentTableSession`
- `TableToolbar` session status badge + removal of placeholder action (no lifecycle buttons; SessionActionButtons is the single owner)
- `ReconciliationBadge` component
- Unit tests for labels, HTTP contract, and dialog behavior

**Out of Scope:**
- Shift Dashboard wiring (checkpoint button, delta badge, HeroWinLossCompact) — separate workstream
- Pause/resume/rollover RPCs (not yet implemented, PRD-038A §11 defers these)
- Activate RPC (FR-2) — `activated_by_staff_id` remains null
- Per-table delta column in MetricsTable (deferred vNext)
- Rundown report/finalize UI (separate spec needed)
- Late event badge wiring (shift dashboard concern)

### PRD Alignment & Deferrals

This execution spec intentionally ships **only the session close / force-close governance UI** and the pit terminal session wiring.
PRD-038A also defines additional lifecycle actions (Activate / Pause / Resume / Rollover) that remain **backend-deferred** and are not
implemented here.

| PRD requirement (PRD-038A §8.1) | Status in EXEC-038A | UX behavior in this ship | Follow-on |
|---|---|---|---|
| Close + Force Close with reason + note | **Implemented** | Fully functional | — |
| Reconciliation badge / "requires reconciliation" | **Implemented** | Badge displayed when flagged by session DTO | — |
| Activate | **Deferred** | Not shown (or shown disabled if already present) | EXEC-038B (Lifecycle actions) |
| Pause / Resume | **Deferred** | Not shown (or shown disabled if already present) | EXEC-038B (Lifecycle actions) |
| Rollover | **Deferred** | Not shown (or shown disabled if already present) | EXEC-038B (Lifecycle actions) |

**Note:** If the UI already contains placeholders for deferred actions, they should render as disabled controls with a short tooltip:
"Backend lifecycle RPC not implemented yet".

## Architecture Context

- **Bounded Context**: TableContextService (SRM)
- **Orphaned Components**: `session-action-buttons.tsx` (0 consumers), `close-session-dialog.tsx` (0 consumers)
- **CloseSessionDialog hardcodes**: `close_reason: 'end_of_shift'` at line ~148
- **Auth**: `useAuth()` hook provides `staffRole` from JWT `app_metadata.staff_role` — no prop drilling needed
- **Existing Hooks**: `useCurrentTableSession(tableId)`, `useOpenTableSession`, `useStartTableRundown`, `useCloseTableSession` — all exist
- **Missing Hooks**: `useForceCloseTableSession` — HTTP fetcher + hook needed
- **Missing Labels**: `CLOSE_REASON_LABELS` — human-readable labels for 8 `close_reason_type` values
- **Backend**: Fully implemented (EXEC-038A complete — 2 migrations, RPCs, service layer, API routes, tests all pass)

## Privileged Role Gating (Single Source of Truth)

**Force Close privileged roles** (verified against `supabase/migrations/20260225110743_prd038a_close_guardrails_rpcs.sql`):

```typescript
/** Canonical list — must match rpc_force_close_table_session role gate. */
export const FORCE_CLOSE_PRIVILEGED_ROLES: readonly string[] = ['pit_boss', 'admin'] as const;
```

- Defined once in `services/table-context/labels.ts` and imported wherever needed (dialog, tests).
- Do **not** repeat ad-hoc role examples elsewhere; reference `FORCE_CLOSE_PRIVILEGED_ROLES`.
- If backend role gate changes, update this constant. **Backend is authoritative; UI gating is convenience only.**

## Backend Contract Assertions (UI Depends On These)

Backend is implemented for PRD-038A close governance. The UI wiring in this spec assumes:

- **Standard close** — `PATCH /api/v1/table-sessions/{id}/close`
  - Body: `{ close_reason: close_reason_type, close_note?: string, drop_event_id?: uuid, closing_inventory_snapshot_id?: uuid, notes?: string }`
  - **Field semantics**:
    - `close_note` = governance note tied to the selected close reason (required when `close_reason='other'`)
    - `notes` = existing freeform session notes (unrelated to close reason governance)
  - `close_reason` and `close_note` are accepted and persisted (confirmed in route handler)
  - Requires at least one artifact (drop_event_id or closing_inventory_snapshot_id)
  - Rejects when `has_unresolved_items = true` (409 `UNRESOLVED_LIABILITIES`)
  - Rejects `close_reason = 'other'` without `close_note` (400 `CLOSE_NOTE_REQUIRED`)
  - Requires `Idempotency-Key` header
- **Force close** — `POST /api/v1/table-sessions/{id}/force-close`
  - Body: `{ close_reason: close_reason_type, close_note?: string }`
  - Role-gated server-side (`pit_boss | admin`)
  - **Artifacts are not required**.
    - The UI must not send `drop_event_id` or `closing_inventory_snapshot_id` on force-close.
    - Server behavior if artifacts are sent: **IGNORED** (200) — `forceCloseTableSessionSchema` uses `z.object()` without `.strict()`, so Zod strips unknown keys silently. Do not rely on this; the UI must not send them.
  - Skips `has_unresolved_items` check, sets `requires_reconciliation = true`
  - Requires `Idempotency-Key` header

If the backend contract differs, update this spec first (this is the UI's source-of-truth for assumptions).

## Workstream Details

### WS1: Service Layer Completions (Labels, HTTP, Hook)

**Purpose**: Add the three missing client-side APIs that WS2 and WS3 depend on.

**File Changes:**

| File | Changes |
|------|---------|
| `services/table-context/labels.ts` | Add `CLOSE_REASON_LABELS: Record<CloseReasonType, string>` with human-readable labels for all 8 enum values |
| `services/table-context/http.ts` | Add `forceCloseTableSession(sessionId: string, input: ForceCloseTableSessionRequestBody, idempotencyKey?: string)` → POST to `/api/v1/table-sessions/{id}/force-close` returning `ServiceHttpResult<TableSessionDTO>` |
| `hooks/table-context/use-table-session.ts` | Add `useForceCloseTableSession(sessionId: string, tableId: string)` mutation hook. On success: invalidate the **exact** query key used by `useCurrentTableSession(tableId)` (prefer a shared `tableSessionKeys.current(tableId)` helper) + show success toast. On error: map known server codes → user-friendly messages (at minimum: `UNRESOLVED_LIABILITIES`, `FORBIDDEN`, `ALREADY_CLOSED`/idempotent close, and generic validation errors). |

**CLOSE_REASON_LABELS, CLOSE_REASON_OPTIONS, and FORCE_CLOSE_PRIVILEGED_ROLES:**

```typescript
export const CLOSE_REASON_LABELS: Record<CloseReasonType, string> = {
  end_of_shift: 'End of Shift',
  maintenance: 'Maintenance',
  game_change: 'Game Change',
  dealer_unavailable: 'Dealer Unavailable',
  low_demand: 'Low Demand',
  security_hold: 'Security Hold',
  emergency: 'Emergency',
  other: 'Other',
};

/** UI-facing option list for <Select> rendering and test assertions. */
export const CLOSE_REASON_OPTIONS: ReadonlyArray<{ value: CloseReasonType; label: string }> =
  (Object.entries(CLOSE_REASON_LABELS) as [CloseReasonType, string][]).map(
    ([value, label]) => ({ value, label }),
  );

/** Canonical privileged role list — must match rpc_force_close_table_session role gate. */
export const FORCE_CLOSE_PRIVILEGED_ROLES: readonly string[] = ['pit_boss', 'admin'] as const;
```

**Idempotency:** Both close and force-close routes call `requireIdempotencyKey(request)`. All existing
fetchers in `http.ts` use the `IDEMPOTENCY_HEADER` constant and `generateIdempotencyKey()` helper.
The new fetcher MUST follow the same pattern — idempotency is not speculative, it is enforced.
- **Assertion:** the existing standard close fetcher (`closeTableSession`) already sets `Idempotency-Key`. If not, update it in this scope and add coverage.

**forceCloseTableSession HTTP fetcher pattern** (follow existing `closeTableSession` pattern exactly):

```typescript
export async function forceCloseTableSession(
  sessionId: string,
  input: ForceCloseTableSessionRequestBody,
  idempotencyKey?: string,
): Promise<TableSessionDTO> {
  return fetchJSON<TableSessionDTO>(
    `${BASE_URL}/table-sessions/${sessionId}/force-close`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [IDEMPOTENCY_HEADER]: idempotencyKey ?? generateIdempotencyKey(),
      },
      body: JSON.stringify(input),
    },
  );
}
```

**Acceptance Criteria:**
- [ ] `npm run type-check` passes
- [ ] `CLOSE_REASON_LABELS` has exactly 8 entries matching `close_reason_type` enum
- [ ] `forceCloseTableSession` follows same pattern as `closeTableSession`
- [ ] `useForceCloseTableSession` invalidates session cache on success

---

### WS2: CloseSessionDialog Enhancement

**Purpose**: Replace hardcoded close reason with full governance UI.

**File**: `components/table/close-session-dialog.tsx`

**Changes:**

1. **Remove** hardcoded `close_reason: 'end_of_shift'`

2. **Add form state:**
   ```typescript
   const [closeReason, setCloseReason] = useState<CloseReasonType | null>(null);
   const [closeNote, setCloseNote] = useState('');
   ```

3. **Add close reason `<Select>`:**
   - Label: "Close Reason"
   - Options from `CLOSE_REASON_LABELS` (import from `@/services/table-context/labels`)
   - Required — form cannot submit without selection
   - Place ABOVE the artifact pickers section

4. **Add close note `<Textarea>`:**
   - Label: "Note (required for 'Other')"
   - Visible only when `closeReason === 'other'`
   - Required when visible — validated before submit
   - Max length: 2000 chars

5. **Add unresolved items alert:**
   ```tsx
   {session?.has_unresolved_items && (
     <Alert variant="destructive">
       <AlertTriangle className="h-4 w-4" />
       <AlertTitle>Unresolved Items</AlertTitle>
       <AlertDescription>
         This table has outstanding items that must be reconciled.
         Standard close is blocked. Use Force Close if authorized.
       </AlertDescription>
     </Alert>
   )}
   ```

6. **Disable standard Close button** when `session?.has_unresolved_items === true`

7. **Add Force Close button:**
   - Variant: `destructive`
   - Visible when: `FORCE_CLOSE_PRIVILEGED_ROLES.includes(staffRole)` (import from `@/services/table-context/labels`)
   - Uses `useForceCloseTableSession` (from WS1)
   - Does NOT require artifact pickers (force close bypasses artifact requirements)
   - Requires close reason + optional note (same validation)
   - Staff role obtained via `useAuth()` — no prop needed

**Error Handling Matrix (WS2 must implement):**

| error_code / status | Example cause | UI message | Dialog state | Follow-up |
|---|---|---|---|---|
| `UNRESOLVED_LIABILITIES` / 409 | server detects items despite stale UI | "Unresolved items must be reconciled before standard close." | stay open | refetch session |
| `FORBIDDEN` / 403 | role not privileged | "You don't have permission to force close." | stay open | none |
| `ALREADY_CLOSED` / 409 | race / double click | "Session already closed." | close dialog | refetch session |
| `CLOSE_NOTE_REQUIRED` / 400 | `other` missing note | "Please add a note when selecting 'Other'." | stay open | none |
| `VALIDATION_ERROR` / 400 | malformed body | "Invalid request. Check your inputs." | stay open | none |
| 404 | session not found / RLS masking | "Session not found." | close dialog | refetch table list |
| network error | request failure | "Network error. Please try again." | stay open | none |

Errors must be user-legible and must not leave the dialog in a half-state (e.g., loading spinner stuck).

**Error payload shape (pinned — UI must not guess):**
- All API errors return `ServiceHttpResult` with `{ ok: false, code: string, error?: string, status: number, details?: unknown }`.
- Client-side `fetchJSON` throws `FetchError` with `.code`, `.status`, `.details` properties.
- The UI **MUST** branch on `FetchError.code` (e.g., `UNRESOLVED_LIABILITIES`, `FORBIDDEN`, `CLOSE_NOTE_REQUIRED`).
- Do **not** rely on ad-hoc string matching of `error` messages. Use `.code` for control flow, `.error` for display text only.

8. **Update form validation:**
   - Close button disabled if: `!closeReason || (closeReason === 'other' && !closeNote.trim()) || (!dropEventId && !closingSnapshotId)`
   - Force Close button disabled if: `!closeReason || (closeReason === 'other' && !closeNote.trim())`

9. **Update mutation call:**
   ```typescript
   await closeMutation.mutateAsync({
     drop_event_id: useDropEvent && dropEventId ? dropEventId : undefined,
     closing_inventory_snapshot_id: ...,
     notes: notes.trim() || undefined,
     close_reason: closeReason!,
     close_note: closeNote.trim() || undefined,
   });
   ```

10. **Reset form state** on dialog close: `closeReason → null`, `closeNote → ''`

**Acceptance Criteria:**
- [ ] `npm run type-check` passes
- [ ] Close reason select renders all 8 options
- [ ] Close note textarea appears only for 'other'
- [ ] Alert shown when session.has_unresolved_items
- [ ] Force close button hidden for non-privileged roles
- [ ] Standard close disabled when has_unresolved_items
- [ ] Form resets on dialog close

---

### WS3: Pit Terminal Integration & Session Wiring

**Purpose**: Wire session lifecycle into the pit terminal's component hierarchy.

**File Changes:**

#### 1. `components/pit-panels/pit-panels-client.tsx`

- Import `useCurrentTableSession` from `@/hooks/table-context/use-table-session`
- **Hard requirement:** `useCurrentTableSession` must not be invoked with an empty/invalid table id.
  Use **one** of the following patterns (choose ONE and implement exactly):
  - **Mount-when-selected (preferred):** split into `SelectedTableSessionPanel` that receives a non-null `tableId` prop, and only render it when `selectedTableId` is truthy.
    ```typescript
    if (!selectedTableId) return null;
    const { data: currentSession } = useCurrentTableSession(selectedTableId);
    ```
  - **Enabled flag:** `useCurrentTableSession(selectedTableId!, { enabled: !!selectedTableId })` (only if the hook supports options). The query key helper MUST refuse empty ids.
  - **No network calls when no table is selected.**
  - **No cache keys with empty identifiers.**
- Pass `session={currentSession ?? null}` to `TablesPanel` (via PanelContainer → TablesPanel)

#### 2. `components/pit-panels/tables-panel.tsx`

- **Add props**: `session?: TableSessionDTO | null`
- **Add state**: `closeDialogOpen: boolean` (local useState)
- **Import**: `SessionActionButtons`, `CloseSessionDialog`, `ReconciliationBadge`, `useAuth`
- **Get auth context**: `const { staffId, casinoId: authCasinoId } = useAuth()`
- **Render `<SessionActionButtons>`** between toolbar and table layout:
  ```tsx
  <SessionActionButtons
    tableId={selectedTable.id}
    session={session ?? null}
    onCloseRequest={() => setCloseDialogOpen(true)}
    variant="compact"
  />
  ```
- **Render `<CloseSessionDialog>`**:
  ```tsx
  <CloseSessionDialog
    open={closeDialogOpen}
    onOpenChange={setCloseDialogOpen}
    session={session ?? null}
    tableId={selectedTable?.id ?? ''}
    casinoId={casinoId}
    currentStaffId={staffId ?? ''}
  />
  ```
- **Render `<ReconciliationBadge>`** when applicable:
  ```tsx
  {session?.requires_reconciliation && <ReconciliationBadge />}
  ```

#### 3. `components/table/table-toolbar.tsx`

**Single-source-of-truth rule:** `SessionActionButtons` is the **only** component that renders
lifecycle action controls (Open / Start Rundown / Close) in the pit terminal. `TableToolbar` must
**not** duplicate these actions. Only one Close button may exist on screen at a time; enabled/disabled
logic is defined in exactly one place (`SessionActionButtons` + its state predicates).

`TableToolbar` changes:
- **Add props**: `session?: TableSessionDTO | null`
- **Remove** the placeholder `toggle-status` action from the TABLE group entirely (it currently does nothing)
- **Add session status badge** in the TABLE group: show current session phase (`getSessionStatusLabel(session.status)`)
  using `getSessionStatusColor` for the badge variant. If no session, show "No Session".
- **Do NOT add** Open/Rundown/Close buttons — those live in `SessionActionButtons` only.
- **Same changes in `TableToolbarCompact`** — status badge in compact form

#### 4. New: `components/table/reconciliation-badge.tsx`

```tsx
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';

export function ReconciliationBadge() {
  return (
    <Badge variant="destructive" className="gap-1">
      <AlertTriangle className="h-3 w-3" />
      Reconciliation Required
    </Badge>
  );
}
```

**Data Flow Summary:**

```
PitPanelsClient
  ├─ useCurrentTableSession(selectedTableId!) → session  [enabled: !!selectedTableId]
  └─ <TablesPanel session={session} ...>
       ├─ useAuth() → { staffId, casinoId }
       ├─ <TableToolbar session={session}>
       │    └─ Session status badge only (no action buttons — single-owner rule)
       ├─ <SessionActionButtons tableId session onCloseRequest>  ← SINGLE OWNER of lifecycle actions
       │    └─ Open Session / Start Rundown / Close Session buttons
       ├─ <ReconciliationBadge /> (conditional)
       └─ <CloseSessionDialog session tableId casinoId currentStaffId>
            ├─ Close reason <Select> (CLOSE_REASON_OPTIONS)
            ├─ Close note <Textarea> (when 'other')
            ├─ Unresolved items <Alert>
            ├─ Standard Close <Button>
            └─ Force Close <Button> (FORCE_CLOSE_PRIVILEGED_ROLES via useAuth)
```

**Acceptance Criteria:**
- [ ] `npm run type-check` passes
- [ ] Session action buttons render in pit terminal for selected table
- [ ] Open Session works when no active session exists
- [ ] Start Rundown works when session is OPEN/ACTIVE
- [ ] Close Session opens the enhanced CloseSessionDialog
- [ ] Toolbar placeholder replaced with session status badge (no duplicate action buttons)
- [ ] Only one Close button exists on screen at a time
- [ ] ReconciliationBadge shown when `requires_reconciliation = true`
- [ ] Session refreshes on mutation success (cache invalidation)

---

### WS4: Unit Tests

**Purpose**: Validate service layer additions and dialog behavior.

**Test Files:**

#### `services/table-context/__tests__/close-reason-labels.test.ts`

| # | Test | Assert |
|---|------|--------|
| 1 | All 8 close reason values have labels | `Object.keys(CLOSE_REASON_LABELS).length === 8` and each value is a non-empty string |
| 2 | Label keys match exported CLOSE_REASON_OPTIONS | Keys match `CLOSE_REASON_OPTIONS.map(o => o.value)` exactly (test against UI-facing list, not schema internals) |

#### `hooks/table-context/__tests__/force-close-http.test.ts`

| # | Test | Assert |
|---|------|--------|
| 3 | forceCloseTableSession calls correct URL | `POST /api/v1/table-sessions/{id}/force-close` |
| 4 | Request body matches ForceCloseTableSessionRequestBody | `{ close_reason, close_note }` |
| 5 | Idempotency key header sent when provided | `Idempotency-Key` header present |

#### `hooks/table-context/__tests__/close-session-http.test.ts`

| # | Test | Assert |
|---|------|--------|
| 6 | closeTableSession sends Idempotency-Key | Header present on PATCH `/api/v1/table-sessions/{id}/close` (or equivalent) |

#### `components/table/__tests__/close-session-dialog.test.tsx`

| # | Test | Assert |
|---|------|--------|
| 7 | Close reason select renders exactly CLOSE_REASON_OPTIONS | Dialog renders `CLOSE_REASON_OPTIONS.length` options with matching labels (test against exported list, not schema internals) |
| 8 | Close note textarea hidden by default | Textarea not in DOM when reason ≠ 'other' |
| 9 | Close note textarea shown for 'other' | Textarea appears when 'other' selected |
| 10 | Standard close disabled when has_unresolved_items | Button has `disabled` attribute |
| 11 | Force close button hidden for non-privileged role | Button not in DOM when `staffRole` not in `FORCE_CLOSE_PRIVILEGED_ROLES` |
| 12 | Force close button visible for privileged role | Button in DOM for each role in `FORCE_CLOSE_PRIVILEGED_ROLES` |
| 13 | Force close does not require artifacts | Force close enabled even when drop/closing snapshot are unset |
| 14 | Dialog resets form state on close | closeReason resets to null and closeNote resets to '' after closing and reopening |

**Acceptance Criteria:**
- [ ] All 14 tests pass
- [ ] No regressions in existing test suite

---

## Security Posture

| Concern | Mitigation |
|---------|-----------|
| Force close role gating | Client: `FORCE_CLOSE_PRIVILEGED_ROLES.includes(useAuth().staffRole)` hides button. Server RPC validates `app.staff_role` — UI gating is convenience only, server is authoritative. |
| Staff role from JWT | `useAuth()` reads `app_metadata.staff_role` from JWT. Stale JWT → stale role. Acceptable for UI gating; server RPC is authoritative. |
| Casino isolation | Session queries scoped by `casino_id` via RLS. No change to security model. |
| Audit trail | Force close emits `audit_log` server-side (EXEC-038A). UI just calls the endpoint. |

## Definition of Done

- [ ] All 4 workstreams complete
- [ ] All gates pass (type-check, test-pass)
- [ ] `npm run build` succeeds
- [ ] No regressions in existing tests
- [ ] SessionActionButtons rendered in pit terminal
- [ ] CloseSessionDialog has close reason selection (not hardcoded)
- [ ] Force close available to privileged roles
- [ ] Unresolved items guardrail visible in UI
- [ ] ReconciliationBadge displayed after force close
- [ ] `FORCE_CLOSE_PRIVILEGED_ROLES` defined once, referenced everywhere (no role drift)
- [ ] Idempotency key sent on both close and force-close (asserted in backend contract)
- [ ] Standard close sends `close_reason` + `close_note` (backend accepts them)
- [ ] No hook invoked with empty table id; no requests when no table selected
- [ ] Only one set of session action controls on screen (single-owner rule)
- [ ] Error handling covers all matrix entries (validation, RLS/404, network)
