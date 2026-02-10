# GAP-SIGN-OUT-IMPLEMENTATION

## Sign-Out and Lock Screen Not Implemented in Dashboard UI

**Status**: Open
**Created**: 2026-02-10
**Category**: Security / Auth / UX
**Severity**: MEDIUM (functional gap + stale JWT claims risk)
**Discovered By**: Lead Architect investigation
**Target**: AUTH-HARDENING v0.2

---

## Terminology

This gap covers **two distinct concepts** that share UI surface and have a directional dependency:

| Term | Behavior | Session State | Re-entry |
|------|----------|---------------|----------|
| **Sign out** | Full auth termination — clear JWT claims, invalidate Supabase session, redirect to `/signin` | **Destroyed** | Email + password |
| **Lock screen** | Security overlay covers dashboard — Supabase session stays alive, JWT refreshes continue | **Preserved** | PIN (4-6 digit) |

A pit boss stepping away from the terminal should **lock** (quick return via PIN). Ending a shift or handing over to another user requires **sign out** (full termination).

---

## Problem Statement

The PT-2 dashboard has neither functional sign-out nor a lock screen. The primary user menu (`NavUser`) renders a "Log out" dropdown item with no click handler and uses hardcoded mock user data. A functional `LogoutButton` component exists but is only used in a legacy layout, and it performs client-only sign-out without clearing JWT claims from `app_metadata`.

ADR-030 D2 mandates claim clearing on staff deactivation but **does not address user-initiated sign-out**, leaving a gap in the auth pipeline hardening model. No lock screen, PIN authentication, idle detection, or quick re-authentication mechanism exists anywhere in the system.

---

## Current State

| Capability | Status | Location |
|------------|--------|----------|
| `LogoutButton` (client-only) | Exists, legacy layout only | `components/logout-button.tsx` |
| `NavUser` dropdown "Log out" | **Non-functional** — no handler, hardcoded mock user | `components/layout/nav-user.tsx:70-72` |
| `useAuth()` hook | Exists, provides user/staffId/casinoId | `hooks/use-auth.ts` |
| `clearUserRLSClaims()` | Exists, **only invoked on staff deactivation** | `lib/supabase/auth-admin.ts` |
| Server-side sign-out action | **Does not exist** | — |
| Sign-out observability events | **Does not exist** | — |
| `staff.pin_hash` column | **Does not exist** | — |
| Lock screen overlay component | **Does not exist** | — |
| Idle detection hook | **Does not exist** | — |
| Zustand lock state | **Does not exist** | — |
| PIN set/verify server actions | **Does not exist** | — |
| MFA / TOTP | Disabled in `supabase/config.toml` | — |
| Session inactivity timeout | Commented out in config | `supabase/config.toml:215-220` |

### Existing LogoutButton Implementation

```typescript
// components/logout-button.tsx (client-only, no claim clearing)
const logout = async () => {
  const supabase = createBrowserComponentClient();
  await supabase.auth.signOut();
  queryClient.clear();
  router.push('/signin');
};
```

### NavUser "Log out" (Non-Functional)

```tsx
// components/layout/nav-user.tsx:70-72
<DropdownMenuItem>
  <LogOut className="mr-2 h-4 w-4" />
  Log out
</DropdownMenuItem>
// No onClick handler, no auth integration
```

---

## Gap Details

### Sign-Out Gaps

#### G1: NavUser Not Wired to Auth Context

`nav-user.tsx` uses hardcoded mock data (`{ name: 'Pit Boss', email: 'pitboss@casino.com' }`) with a TODO comment: "Get user from auth context". The `useAuth()` hook exists and provides all needed data but is not consumed.

#### G2: JWT Claims Not Cleared on Sign-Out

`clearUserRLSClaims()` is only called via `reconcileStaffClaims()` when staff status changes to `inactive`. A user signing out retains stale `app_metadata` claims (`casino_id`, `staff_role`, `staff_id`) in `auth.users`. The next sign-in may operate on stale authorization context until token refresh or re-sync triggers.

#### G3: No Server-Side Sign-Out Workflow

Claims clearing requires the service-role admin client (`lib/supabase/auth-admin.ts`). The existing `LogoutButton` only calls client-side `supabase.auth.signOut()`. There is no server action to perform authoritative cleanup.

#### G4: ADR-030 D2 Omission

ADR-030 INV-030-2 mandates claim clearing on staff deactivation, `user_id` removal, and `casino_id` removal — but **does not list user-initiated sign-out** as a claim-clearing trigger.

#### G5: No Sign-Out Observability

ADR-030 defines structured logging for `claims.sync.success` and `claims.clear.success` but has no `auth.sign_out` event.

### Lock Screen Gaps

#### G6: No PIN Authentication Schema

The `staff` table has no `pin_hash` column. No mechanism exists for setting, storing, or verifying a short PIN for quick re-authentication.

#### G7: No Lock Screen Overlay

No full-viewport overlay component exists to cover the dashboard while preserving the underlying session. Existing overlay primitives (Dialog, Sheet, Drawer) are dismissible and not designed for security gates.

#### G8: No Idle Detection

No `useIdleDetection` hook or activity tracking exists. The system has no awareness of whether a user is actively interacting with the terminal. Supabase session inactivity timeout is commented out in `config.toml`.

#### G9: No Lock State Management

No Zustand store tracks `isLocked` state. No mechanism to trigger lock (manual or idle-based) or unlock (PIN verify).

---

## Security Implications

| Risk | Severity | Detail |
|------|----------|--------|
| Stale JWT claims after sign-out | **Medium** | Claims persist in `app_metadata`; if a user's role/casino changes between sessions, first requests after re-sign-in may use stale claims before `syncUserRLSClaims` runs |
| Unattended terminal exposure | **Medium** | No idle lock means an unattended pit boss terminal exposes casino operations, player PII, and financial data to any passerby |
| No server-side session invalidation | **Low** | Supabase handles token revocation on `signOut()`, but custom cleanup (claims, logging) is skipped |
| RLS context leakage | **None** | `SET LOCAL` variables are connection-scoped and expire with the Postgres transaction |

---

## Dependency Analysis: Concurrent Development

Sign-out and lock screen are **not tangential** — they share a critical UI surface and have a directional dependency.

### Dependency Map

```
                  ┌─────────────────────────┐
                  │  Wire NavUser to useAuth │  ← shared prerequisite
                  │  (real user data + menu) │
                  └──────────┬──────────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
   ┌──────────────────┐         ┌─────────────────────┐
   │    SIGN OUT       │         │    LOCK SCREEN       │
   │                  │         │                     │
   │ • Server action  │         │ • staff.pin_hash    │
   │   (claims clear  │         │   migration         │
   │   + signOut)     │         │ • PIN set/verify    │
   │ • Client cleanup │         │   server actions    │
   │ • ADR-030 update │         │ • LockScreen        │
   │                  │         │   overlay component │
   │ Size: Small      │         │ • useIdleDetection  │
   │                  │         │   hook              │
   └──────────────────┘         │ • Zustand lock      │
                                │   store             │
                                │ • Lock from NavUser │
                                │ • Lock on idle      │
                                │ • Sign-out from     │
                                │   lock screen       │
                                │                     │
                                │ Size: Medium        │
                                │ Depends on: SignOut  │
                                └─────────────────────┘
```

### Why They Must Be Designed Together

1. **Shared prerequisite** — Both require `NavUser` wired to `useAuth()` with real user data. This work is done once.

2. **Shared dropdown** — The NavUser menu needs both items. Designing them together avoids rework:
   ```
   ┌──────────────────────┐
   │  ● Jane Doe          │
   │    Pit Boss           │
   ├──────────────────────┤
   │  🔒  Lock screen     │  ← Lock screen (PIN re-entry)
   │  ⚙️  Account         │
   │  ───────────────     │
   │  ↩  Sign out         │  ← Sign out (full termination)
   └──────────────────────┘
   ```

3. **Lock screen needs sign-out** — The lock screen must offer a "Not you? Sign out" escape hatch. A locked terminal with no sign-out path is a dead end if the pit boss leaves permanently.

4. **Idle timeout bridges both** — Idle detection should trigger *lock* (short idle, e.g. 5 min), but could escalate to *sign-out* (long idle, e.g. 30 min or JWT expiry). This logic needs both primitives.

### Recommended Shipping Strategy

**Develop concurrently, ship sequentially:**

| Phase | Scope | Rationale |
|-------|-------|-----------|
| Phase 1 (ship first) | Sign-out + NavUser wiring | Security fix for broken auth termination; unblocks Phase 2's "sign out from lock screen" |
| Phase 2 (ship second) | Lock screen + PIN + idle detection | Needs new schema, new UX pattern, PIN management — requires own validation |

Phase 1 should design the NavUser menu with both items from the start, stubbing the lock item until Phase 2 ships.

---

## Lock Screen Concept

### Trigger Points

| Trigger | Behavior |
|---------|----------|
| Manual (NavUser "Lock screen") | Immediate lock overlay |
| Idle timeout (configurable, e.g. 5 min) | Auto-lock after inactivity (mousemove/keydown/click tracking) |
| Browser visibility change | Optional — lock when tab hidden or minimized |

### Overlay Specification

- Full viewport: `fixed inset-0 z-[100]` (above sidebar z-50)
- Non-dismissible: no ESC, no click-outside, no close button
- Backdrop: `bg-black/80 backdrop-blur-md` — obscures dashboard content
- Content: user avatar/name, PIN input (4-6 digits), "Not you? Sign out" link
- Session stays alive: Supabase token refresh continues in background

### Schema Requirement

`staff.pin_hash` — bcrypt hash of 4-6 digit PIN, nullable (PIN not yet set triggers setup flow on first lock).

### Unlock Flow

```
PIN input → server action verifyPin → bcrypt compare
  → match: dismiss overlay, resume dashboard
  → mismatch: error message, rate-limit after N attempts
  → rate-limit exceeded: force sign-out
```

---

## Sign-Out Architecture

**Approach: Server Action + Client Integration** (minimal, YAGNI-compliant)

```
User clicks "Sign out" in NavUser (or lock screen escape hatch)
  → Client calls signOut server action
    → Server: clearUserRLSClaims(userId)  [service-role client]
    → Server: supabase.auth.signOut()      [user's session]
    → Server: structured log event
  → Client: queryClient.clear()
  → Client: router.push('/signin')
```

**Why server action, not API route:** Follows existing PT-2 patterns (server actions with `withServerAction` middleware). Claims clearing requires the service-role client which must run server-side.

---

## Definition of Done

### Phase 1: Sign-Out

- [ ] Server action `signOut` clears JWT claims via `clearUserRLSClaims()` before session termination
- [ ] `NavUser` displays real user data from `useAuth()` (name, email, role)
- [ ] `NavUser` menu includes both "Lock screen" (stubbed/disabled) and "Sign out" (functional)
- [ ] `NavUser` "Sign out" triggers full sign-out flow (server action + client cleanup + redirect)
- [ ] `LogoutButton` updated to share same server action flow
- [ ] Structured log event emitted on sign-out
- [ ] ADR-030 D2 updated to include user-initiated sign-out
- [ ] `npm run type-check && npm run lint && npm run test` all pass

### Phase 2: Lock Screen

- [ ] Migration adds `pin_hash` column to `staff` table
- [ ] Server actions for PIN set and verify (bcrypt, rate-limited)
- [ ] Lock screen overlay component (full viewport, non-dismissible, z-[100])
- [ ] `useIdleDetection` hook with configurable timeout
- [ ] Zustand `useLockStore` tracks `isLocked` state
- [ ] NavUser "Lock screen" triggers overlay
- [ ] Idle timeout triggers overlay
- [ ] PIN unlock dismisses overlay and resumes dashboard
- [ ] "Not you? Sign out" on lock screen triggers full sign-out
- [ ] Rate-limit exceeded on PIN attempts forces sign-out
- [ ] `npm run type-check && npm run lint && npm run test` all pass

---

## References

- ADR-030: Auth system hardening (`docs/80-adrs/ADR-030-auth-system-hardening.md`)
- ADR-024: Authoritative context derivation (`docs/80-adrs/ADR-024_DECISIONS.md`)
- ADR-015: Connection pooling strategy (`docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`)
- SEC-002: Casino-scoped security model (`docs/30-security/SEC-002-casino-scoped-security-model.md`)
- Claims reconciliation: `lib/supabase/claims-reconcile.ts`
- Auth admin utils: `lib/supabase/auth-admin.ts`
- Supabase config (JWT expiry, MFA, session timeout): `supabase/config.toml`
