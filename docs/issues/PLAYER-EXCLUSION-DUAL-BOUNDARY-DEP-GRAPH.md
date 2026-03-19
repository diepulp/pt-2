I now have a complete picture from the codebase, git state, and Jira backlog. Here's the synthesis.

---

## Investigation Summary

### Current State Map

| Layer | Status | Location |
|-------|--------|----------|
| **Exclusion backend** (ADR-042, EXEC-050) | **DONE on main** — table, RLS, enforcement RPC, service layer, API routes, tests | `services/player/exclusion-*`, commit `836f0ec9` |
| **Exclusion UI** (P2K-26) | **To Do** — 8 gaps, zero frontend | `docs/issues/gaps/GAP-PLAYER-EXCLUSION-UI-SURFACE.md` |
| **Dual-boundary Phase 1** (ADR-043, PRD-050) | **DONE on branch** — not merged to main | `feat/dual-bondary-tenancy`, commit `e86e5eb` |
| **Dual-boundary Phase 2 Slice 1** (PRD-051) | **DONE on branch** — recognition RPCs, company-scoped RLS | Same branch, commit `a58a83b` |
| **Dual-boundary Phase 2 Slice 2** | **BLOCKED** — exclusion safety signal for cross-property recognition | Needs both features merged |

### The Dependency Graph

```
                    ┌─────────────────────────┐
                    │  Dual-Boundary Phase 1  │
                    │  (ADR-043 — company      │
                    │   foundation plumbing)   │
                    │  STATUS: built, unmerged │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼                              ▼
┌─────────────────────┐      ┌──────────────────────────┐
│ Exclusion UI Surface│      │ Dual-Boundary Phase 2    │
│ (P2K-26 — 8 gaps)  │      │ Slice 1 (Recognition)    │
│ STATUS: To Do       │      │ STATUS: built, unmerged  │
│ NO dependency on    │      └────────┬─────────────────┘
│ dual-boundary       │               │
└─────────┬───────────┘               │
          │                           ▼
          │               ┌──────────────────────────┐
          └──────────────►│ Phase 2 Slice 2          │
                          │ (Exclusion Safety Signal) │
                          │ has_sister_exclusions +   │
                          │ max_exclusion_severity    │
                          │ STATUS: BLOCKED           │
                          └───────────────────────────┘
```

**Key insight**: The exclusion UI surface (P2K-26) is **independent** of dual-boundary — it can proceed on main right now. The dependency is the reverse: dual-boundary Phase 2 Slice 2 needs exclusion to exist (it does) AND company-scoped context (unmerged). The blocker is the **unmerged Phase 1 branch**, which has diverged 8 commits from main.

### Kanban Board State (P2K)

| Key | Summary | Status |
|-----|---------|--------|
| **P2K-26** | Player Exclusion UI Surface — 8 gaps | **To Do** |
| P2K-22 | PRD-050: Dual-Boundary Phase 1 (ADR-043) | Done |
| P2K-23 | WS1: DB Migration — Company Foundation | Done |
| P2K-24 | WS2: TypeScript Contract — RLSContext.companyId | Done |
| P2K-25 | WS3: Integration Tests & Fixture Sweep | Done |

The dual-boundary work items are marked **Done** in Jira but the branch hasn't been merged to main — the work is complete but unshipped.

### Branch Divergence

- `feat/dual-bondary-tenancy` has **5 unique commits** (Phase 1 + Phase 2 Slice 1 + 2 hotfixes + merge)
- `main` has **8 commits** not in the feature branch (testing governance, skill audits, test burndown)
- The `RLSContext` interface diverges: main has no `companyId` field
- **278 files differ** between branches

---

## Recommended Next Steps (Ordered)

### Step 1: Merge Dual-Boundary Phase 1 to Main
**Unblocks everything.** This is plumbing only — no RLS policy changes, no UI, no behavioral change. But it's been sitting unmerged and accumulating rebase debt.

- Rebase `feat/dual-bondary-tenancy` onto current `main` (`946ba81`)
- Resolve `RLSContext` type conflicts (~35-40 consumers)
- Regenerate `database.types.ts` from new migration
- Validate test suite (testing governance improvements on main may affect fixtures)
- PR Phase 1 only (cherry-pick `e86e5eb` or split PR)

### Step 2: Build Exclusion UI Surface (P2K-26) — Parallel
**No dependency on dual-boundary.** Can start immediately on main.

Per GAP-PLAYER-EXCLUSION-UI-SURFACE.md, the phased build order is:
1. **Wire** (P0): Status API route (GAP-6) + React Query hooks (GAP-7) + fix NewSlipModal warning drop (GAP-3)
2. **Display** (P0): Header badge (GAP-1) + Compliance tab exclusion section (GAP-2)
3. **CRUD** (P1): Create exclusion dialog (GAP-4) + Lift exclusion dialog (GAP-5)
4. **History** (P2): Exclusion history sheet (GAP-8)

### Step 3: Merge Dual-Boundary Phase 2 Slice 1
After Phase 1 is on main, merge the recognition + loyalty entitlement slice (PRD-051). This adds:
- Company-scoped RLS on `player_casino` + `player_loyalty`
- Recognition RPCs (`rpc_lookup_player_company`, `rpc_activate_player_locally`, `rpc_redeem_loyalty_locally`)
- Frontend recognition components

### Step 4: Build Phase 2 Slice 2 — Exclusion Safety Signal
With both exclusion and company foundation on main, implement:
- `has_sister_exclusions` boolean + `max_exclusion_severity` text in the recognition RPC
- SECURITY DEFINER scalar extraction from `player_exclusion` across company boundary
- UI warning banner when recognizing a player with sister-property exclusions (State B2)
- Activation block/escalation for excluded players

### Step 5: Resolve GAP-PLAYER-EXCLUSION-WATCHLIST Open ADR Decisions
The gap doc (the one you pointed to) identifies 5 ADR decisions that must be made before going beyond property-scoped MVP:
1. Company-scope strategy (property-only MVP vs two-layer model) — **Step 4 resolves this via the scalar extraction pattern from Phase 2**
2. Enforcement layer split (DB vs app) — currently hybrid, needs formal ADR freeze
3. Canonical active predicate — implemented but not formalized as reusable SQL fragment
4. Lift authority variation by exclusion type — MVP is admin-only, evolution path needed
5. Auto-expiry vs manual review policy

---

### Summary: What Unblocks What

| Action | Unblocks |
|--------|----------|
| Merge Phase 1 to main | Phase 2 Slice 1 merge, company-scoped context everywhere |
| Build exclusion UI (P2K-26) | Staff can actually use exclusion system |
| Merge Phase 2 Slice 1 | Cross-property recognition, loyalty entitlement |
| Build Phase 2 Slice 2 | Exclusion safety signal — the tangential dependency resolved |

The critical path is **Step 1 (rebase + merge Phase 1)**. It's been complete since commit `e86e5eb` but has been accumulating 8 commits of rebase debt. Want me to start on the rebase, or tackle the exclusion UI surface first?