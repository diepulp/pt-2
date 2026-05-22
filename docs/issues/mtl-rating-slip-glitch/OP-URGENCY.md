## Operational urgency: **low-medium, not P0**

BDD7B21D's failure mode is *operator-visible, operator-recoverable, zero data corruption, zero compliance lie*. An operator clicks Save, nothing happens, operator clicks again. Compare to PRD-064's surface (success-like toast for a transaction that never committed → compliance reporting lie): BDD7B21D is one class milder. No regulator would flag it; no audit trail is falsified; no row is silently written with wrong data. Financial integrity is intact.

This is UX polish + regression prevention, not containment. PRD-064 was the urgent slice; EXEC-066 is the follow-on cleanup.

## Pilot-bounded: **partially — slice it**

Reframed through the realtime+polling reconciliation lens you named, the spec splits cleanly:

**Pilot-bound (ship before pilot):**
- **WS1 (foundation)** — `failSilentGuard` utility + lint rule. No behaviour change; establishes the pattern so new code doesn't re-introduce the defect.
- **WS2 P0.1 only** — `handleSave` in `pit-panels-client.tsx` (the actual BDD7B21D site). This is the only handler the pilot operator will demonstrably touch every shift. One commit.

**Post-pilot / amber-wedge cleanup:**
- **WS2 P0.2/P0.3** — `handleCloseSession`, `handleMovePlayer`. Same surface, but close-session has PRD-064's `hasPendingUnsavedBuyIn` prompt as a stronger existing safety net; move-player already `logError`s. Lower operator-visibility risk.
- **WS3** — pause/resume/rundown. Session-state writes; operator retries naturally.
- **WS4** — admin threshold settings. Not a pilot-operator surface.
- **WS5** — Playwright regression gate. Valuable, not urgent.

## The deeper question your reframing surfaces

If cache reconciliation (realtime subscriptions + TanStack Query polling) is correctly wired on the pit-panels surface, `!modalData` becomes so rare the guard is effectively unreachable. **EXEC-066 is then a belt-and-suspenders regression gate, not a live feature.** That argues for the sliced approach: ship the lint rule (cheap insurance) and the one demonstrable site (BDD7B21D itself); defer the sweep until post-pilot observability tells you whether the other 6 sites ever trip in practice.

## Recommendation

Re-scope EXEC-066 into **EXEC-066a (pilot)** + **EXEC-066b (post-pilot)**:
- **066a:** WS1 + WS2 P0.1. One week. Ships with pilot.
- **066b:** WS2 P0.2/P0.3 + WS3 + WS4 + WS5. Three weeks. Post-pilot backlog, reprioritized against Sentry data from the first pilot month.

If Sentry shows zero guard trips at non-pilot sites during the pilot, 066b shrinks further or dies. That's the correct pilot-bounded answer: **ship the foundation and the demonstrated bug; let production telemetry justify the rest.**