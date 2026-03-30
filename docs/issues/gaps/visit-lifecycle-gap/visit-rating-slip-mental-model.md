Here's the mental model drawn from the gap doc:

## Visit & Rating Slip Lifecycle — Current State

### Two distinct lifecycle objects

```
VISIT (patron session)                   RATING SLIP (table segment)
═══════════════════════                  ═══════════════════════════
1 visit = 1 patron's                    1 slip = 1 stretch at
  entire floor presence                   a specific table + seat
  for a gaming day
                                         A visit contains 1..N slips
                                         (player moves table → new slip)
```

### Visit lifecycle — what exists vs what works

```
                    ┌─────────────────────────────────────┐
                    │         VISIT OPEN PATHS             │
                    ├─────────────────────────────────────┤
   rpc_start_or_   │  ✅ Primary entry. Resumes if same  │
   resume_visit    │     gaming day, else auto-closes     │
                    │     stale visit & opens new one.    │
                    ├─────────────────────────────────────┤
   startFromPrev   │  ✅ Backend works. Direct INSERT     │
   (service layer) │     bypasses the RPC entirely.       │
                    │  ⚠️  No exclusion check.             │
                    │  ⚠️  UI not wired (review page only) │
                    └─────────────────────────────────────┘

                    ┌─────────────────────────────────────┐
                    │         VISIT CLOSE PATHS            │
                    ├─────────────────────────────────────┤
   Gaming day      │  ✅ Automatic — inside               │
   rollover        │     rpc_start_or_resume_visit        │
                    ├─────────────────────────────────────┤
   useCloseVisit() │  ✅ Hook exists, API works           │
   (operator)      │  ❌ NO UI button wired anywhere      │
                    ├─────────────────────────────────────┤
   Exclusion       │  ✅ Auto-close on hard_block         │
   auto-close      │     (GAP-EXCL-ENFORCE-001 Layer 2)  │
                    └─────────────────────────────────────┘
```

**Key takeaway:** Visits open reliably but operators have **no way to manually close** one. Visits just persist until the gaming day rolls over or exclusion kills them.

### Rating slip lifecycle — fully functional

```
   OPEN ──→ CLOSED (terminal)
     │
     └──→ CLOSED (move intermediate) ──→ new OPEN slip at new table
```

- Slips have a complete operator workflow: open, rate, close, move
- The "Closed Sessions" panel (`closed-sessions-panel.tsx`) shows **closed slips**, not closed visits — naming says "sessions" but data says "slips"

### The wiring gap in "Start From Previous"

```
WHAT'S BUILT (all green):
  StartFromPreviousModal ─→ POST /api/v1/visits/start-from-previous ─→ new visit + slip

WHAT'S ACTUALLY WIRED IN PRODUCTION:
  ClosedSessionsPanel.onStartFromPrevious(slipId)
    → PanelContainer maps it to onSlipClick          ← WRONG
      → opens read-only slip modal                    ← DEAD END
```

The continuation flow components exist but the dashboard sends the callback to the wrong handler.

### The semantic confusion

```
Operator sees:                     System reality:
─────────────────                  ────────────────
"3 Closed Sessions"        →       3 closed slips, 1 ACTIVE visit
                                   (player moved tables twice)

"Session disappeared"      →       Exclusion auto-closed the visit
  (no context why)                 (no session-level visibility)
```

### Summary of lifecycle posture

| Capability | Backend | UI | Status |
|---|---|---|---|
| Open visit | Done | Done (via seat assignment) | **Working** |
| Close visit (operator) | Done (hook + API) | No button anywhere | **Gap 1** |
| Close visit (auto) | Done (day rollover + exclusion) | No visibility | **Gap 1/2** |
| View closed visits | Missing — panel shows slips | Mislabeled | **Gap 2** |
| Continue from previous | Done (service + API) | Built but miswired | **Gap 3** |
| Exclusion gate on continuation | Missing at service layer | N/A | **Gap 4** |

The backend plumbing is largely complete. The gaps are all in the operator-facing wiring: no close button, wrong data in the closed panel, and the continuation modal connected to a dead-end handler.