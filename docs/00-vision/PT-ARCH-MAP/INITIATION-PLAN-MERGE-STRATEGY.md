# Hardening Slice Initiation — Worktree Merge Strategy

> **Date**: 2026-03-07
> **Type**: Operational protocol for hardening slice execution
> **Parent**: Standards Foundation (STANDARDS-FOUNDATION.md)

---

## Context

Four hardening slices execute through `/feature` → `/build` pipelines on separate worktrees (`trees/hardening/slice-N`). Each slice is independently shippable but sequentially informed — Slice N+1 depends on Slice N's merged artifacts.

Worktrees share the same git repo. All branches are visible from any worktree. Direction docs on `main` are reachable from any worktree, but the **working copy** in each worktree reflects its own branch. If Slice 0 amends a direction doc on its branch, Slice 1's worktree won't see that amendment until Slice 0 merges.

---

## Rules

### Rule 1 — Direction docs on main before any slice starts

All direction and governance docs must be committed to `main` before running `/feature` for Slice 0. These are the stable context that every slice reads:

- `docs/00-vision/PT-ARCH-MAP/` — architecture report, hardening plan, standards foundation, alignment assessment
- `docs/00-vision/strategic-hardening/` — provenance governance plan, ADR-039 precis, metric provenance matrix plan

### Rule 2 — Sequential merge

Each slice merges to `main` before the next slice branches. No overlap in design/build phases.

```
main ── direction docs ── merge Slice 0 ── merge Slice 1 ── merge Slice 2 ── merge Slice 3
                           │                │                │                │
                           └ worktree:      └ worktree:      └ worktree:      └ worktree:
                             slice-0          slice-1          slice-2          slice-3
                             /feature         /feature         /feature         /feature
                             /build           /build           /build           /build
                             merge ─────►     merge ─────►     merge ─────►
```

### Rule 3 — Slice manifest on main

`HARDENING-SLICE-MANIFEST.md` on `main` tracks cross-slice state. Updated after each merge.

### Rule 4 — Upstream amendment protocol

When Slice N discovers that a prior slice's standard needs adjustment:

1. Propose the amendment in Slice N's RFC (Phase 2)
2. Apply the amendment on Slice N's branch
3. Record the amendment in the manifest when Slice N merges

This keeps amendments traceable through the slice that motivated them.

### Rule 5 — Handoff protocol

Each slice's scaffold (Phase 1) must include a **"Prior Slice Context"** section referencing:

- Prior slice's PRD and EXEC-SPEC paths
- Standards or governance artifacts the prior slice produced
- Any amendments the prior slice made to direction docs

---

## Execution Sequence

### Step 1 — Commit direction docs to main

Commit all untracked vision and strategic-hardening docs. Create the slice manifest.

### Step 2 — Create Slice 0 worktree

```
/create-worktree hardening/slice-0 --from main
```

In the worktree:
```
/feature hardening-slice-0-standards-foundation
```

### Step 3 — Slice 0 completion

`/feature` → `/build` → PR → merge to main. Update manifest.

### Step 4 — Create Slice 1 worktree from updated main

```
/create-worktree hardening/slice-1 --from main
```

Slice 1's scaffold references Slice 0's artifacts. Repeat for Slices 2 and 3.

---

## What the Manifest Prevents

| Risk | Mitigation |
|---|---|
| Stale standard on downstream worktree | Sequential merge — each slice branches from updated main |
| No cross-slice visibility | Manifest on main, updated after each merge |
| Silent amendments to direction docs | Amendment protocol — changes proposed in RFC, recorded in manifest |
| Scope creep in Slice 1 | Scaffold explicitly bounds what it consumes from prior slices |
