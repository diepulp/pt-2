---
id: LOCK-SCREEN-OPERATIONAL-PRIVACY-CONTRACT
title: Lock Screen Contract — Operational Privacy (Not a Security Boundary)
status: draft
owner: PT-2 / UI Shell
last_updated: 2026-02-18
scope: "Lock overlay semantics, persistence, and UX guarantees"
---

# Purpose

Define the **explicit contract** for the lock screen / overlay when its intent is **operational privacy** (not security). This prevents accidental scope creep where a UX feature is mistaken for an auth boundary.

---

# Non-Goals

The lock screen is **not** intended to:

- Protect against a determined actor with browser access (refresh/devtools/etc.).
- Replace Supabase auth, middleware session refresh, or RLS.
- Serve as a compliance/security control.

If you need a real security boundary, implement server-authoritative gating (separate feature).

---

# Contract: Operational Privacy Lock

## Core semantics

1. **Privacy-first UX**
   - The lock hides sensitive operational screens (e.g., pit dashboards) from casual shoulder-surfing.

2. **Not a security boundary**
   - It does not claim to prevent access if someone has full browser control.

3. **Local-only state**
   - Lock state is client-managed (no server round-trips required).

---

## Persistence requirements

### Must
- **Survive hard refresh** within the same tab session (F5 / Ctrl+R / Cmd+R).
- **Avoid “flash of unlocked content”** on load/rehydration.

### Should
- Be resilient across internal client navigation.
- Be fast: lock/unlock transitions should be instant.

### Should not
- Persist across tab/browser close by default (privacy posture, not security).

**Recommended storage:** `sessionStorage`

---

## Rendering guarantees (no flash)

To prevent a brief frame where the app renders unlocked content before the persisted lock state rehydrates:

- The lock store must expose a `hasHydrated` (or equivalent) flag.
- `LockScreenProvider` must gate rendering:
  - If `hasHydrated === false`: render nothing (or a neutral loading screen).
  - If `hasHydrated === true` and `isLocked === true`: render lock UI.
  - Else: render app content.

This ensures **no sensitive UI is visible** before the lock decision is known.

---

## Data handling rules

- **Never store the PIN** (or any secret) in persisted storage.
- Persist only minimal state such as:
  - `isLocked: boolean`
  - optional timestamps (`lockedAt`, `lastUnlockedAt`)
- Treat the PIN as a UX interaction token only, not an auth credential.

---

## Default behaviors

### Default persistence
- Use Zustand `persist` with `sessionStorage` under a stable key (e.g., `pt2_lock_v1`).

### Default lifecycle
- New tab session starts **unlocked** (unless product explicitly chooses “always start locked”).
- Refresh retains lock state for the tab session.

---

# Acceptance Tests

1. **Lock persists on refresh**
   - Lock → hard refresh → still locked.

2. **Unlock persists on refresh**
   - Unlock → hard refresh → remains unlocked.

3. **No content flash**
   - With lock enabled: refresh does not show dashboard content even for a single frame.

4. **Tab-close reset (sessionStorage posture)**
   - Lock → close tab → reopen app → unlocked.

---

# Follow-up Options (Optional Enhancements)

- **Auto-lock after inactivity** (configurable, e.g., 5–15 minutes).
- **Lock on focus loss** (switching tabs/windows) if desired.
- **Lock on sign-out / user switch**.
- **Visual indicator** showing lock status in the header.

---

# Owner Notes

This contract is intentionally narrow: it delivers operational privacy without claiming security properties. Any requirement that “refresh must never bypass lock” implies a security boundary and requires server-side enforcement (separate ADR/feature).
