# PT-2 Git Reconstruction Remediation Plan (Feb 2026)

> Goal: **lose nothing**, stop the branch sprawl, and land work into `main` via **small, reviewable PRs** — **no rebases**, no force-pushes, no history rewrites.

---

## Situation Summary

You currently have **10 items not on `main`** spread across **3 branches + uncommitted work + multiple worktrees**:

- **csv-import**: 5 commits not on `main`  
  - `9cb008d` fix(player-import) runtime bugs  
  - `fbd0b0b` docs(player-import) loyalty metadata  
  - `cbb207d` fix(csv-import) bare-quote repair  
  - `fed33d5` feat(csv-import) PRD-039 ingestion worker  
  - `73e8553` fix(ci) lockfile  

- **ui-polish**: 1 commit not on `main`  
  - `8cee443` fix(shift-dashboard) visibility  

- **table-lifecycle**: 2 commits not on `main`  
  - `b95a3ba` PRD-038 rundown/checkpoints  
  - `29b410f` PRD-038A close guardrails  

- **Uncommitted / Untracked**  
  - 4 uncommitted wiring file changes (captured as patch: `/tmp/trees-table-lifecycle-uncommitted.patch`)  
  - 3 untracked docs (copied into the claude worktree) + findings/plan docs

You also have a “lifeboat” branch/worktree:
- `.claude/worktrees/table-lifecycle` contains a merge commit `b4e2a9b` (origin/main + table-lifecycle), ensuring the table-lifecycle artifacts weren’t lost.

---

## Non-Negotiables

- **DO NOT** rebase or rewrite history right now.
- **DO** isolate changes into **3 PRs** so `main` doesn’t get a mega-diff.
- **DO** create safety tags before you start moving things.

---

## Phase 0 — Freeze / Backup (10/10 safety, 0 drama)

Run once from anywhere inside the repo:

```bash
cd /home/diepulp/projects/pt-2
git fetch --all --prune

# Safety tags (cheap insurance)
git tag safety/csv-import-tip 73e8553
git tag safety/ui-polish-tip 8cee443
git tag safety/table-lifecycle-tip 29b410f
git tag safety/merged-lifeboat b4e2a9b

git push origin --tags
```

If you blow up a branch later, these tags let you recover instantly.

---

## Phase 1 — Establish the “Integration Base” (already done, but rename it)

You already have a merged lifeboat worktree/branch (`b4e2a9b`). Keep it, but rename to something human:

```bash
cd /home/diepulp/projects/pt-2/.claude/worktrees/table-lifecycle
git branch -m feature/table-lifecycle
git push -u origin feature/table-lifecycle
```

> This branch is *not* necessarily what you’ll PR. It’s your “everything is here” anchor.

---

## Phase 2 — Land Work via 3 PRs (clean, reviewable)

### PR 1 — UI polish (smallest, independent)

Best practice: cherry-pick the single commit onto a clean branch from `main`:

```bash
cd /home/diepulp/projects/pt-2
git switch main
git pull

git switch -c fix/shift-dashboard-visibility
git cherry-pick 8cee443

git push -u origin fix/shift-dashboard-visibility
```

Open PR:
- `fix/shift-dashboard-visibility → main`

---

### PR 2 — CSV import track (5 commits)

Create a clean branch from `main` and cherry-pick the 5 commits:

```bash
cd /home/diepulp/projects/pt-2
git switch main
git pull

git switch -c feature/csv-import-worker
git cherry-pick 9cb008d fbd0b0b cbb207d fed33d5 73e8553

git push -u origin feature/csv-import-worker
```

Open PR:
- `feature/csv-import-worker → main`

Notes:
- If you hit conflicts: resolve, then:
  - `git add -A`
  - `git cherry-pick --continue`

---

### PR 3 — Table lifecycle track (PRD-038 + PRD-038A + wiring + docs)

**Important:** `table-lifecycle` was branched off `csv-import`, so it “dragged” those orphan commits.
To avoid contaminating PR 3 with CSV changes, build a **clean table-lifecycle branch from `main`** and cherry-pick only the 2 PRD commits.

```bash
cd /home/diepulp/projects/pt-2
git switch main
git pull

git switch -c feature/table-lifecycle-clean
git cherry-pick b95a3ba 29b410f
```

Now apply the wiring patch + add docs, then commit:

```bash
git apply --index /tmp/trees-table-lifecycle-uncommitted.patch

# Add docs + findings + plan docs (wherever they are in this checkout)
git add -A
git commit -m "PRD-038A: dashboard wiring + docs"

git push -u origin feature/table-lifecycle-clean
```

Open PR:
- `feature/table-lifecycle-clean → main`

---

## Phase 3 — Cleanup (only after PRs merge)

### 1) Remove redundant worktrees

```bash
cd /home/diepulp/projects/pt-2
git worktree list

# Remove the now-redundant worktree path
git worktree remove trees/table-lifecycle
```

If it refuses due to dirty state, only then:
```bash
git worktree remove --force trees/table-lifecycle
```

### 2) Delete dead branches (after merge)

```bash
git branch -d csv-import ui-polish table-lifecycle
git push origin --delete csv-import ui-polish table-lifecycle
```

Keep the `safety/*` tags for a few days. Delete later if you want.

---

## Operational Guardrails (so you don’t recreate the mess)

- **Rule:** Always branch from `main` unless you are *explicitly* stacking PRs.
- **Rule:** One feature = one branch = one PR.
- **Rule:** If a PR merges, either delete the branch or immediately rebase/reset it to `main` **locally** (no force pushes to shared branches).
- **Rule:** Use worktrees for parallel work, but **name them intentionally**:
  - `feature/table-lifecycle-clean`
  - `feature/csv-import-worker`
  - `fix/shift-dashboard-visibility`

---

## Quick “I’m not lost” Checklist

Before starting any new work:
```bash
git status
git branch --show-current
git log --oneline --decorate -n 5
```

If those three lines don’t make sense, stop and re-orient before committing.

---

## End State Target

After the 3 PRs merge:
- `main` contains **ui-polish fix**, **csv-import worker + fixes**, **table lifecycle PRDs + wiring**.
- No orphan branches carrying “extra” commits.
- Worktrees reduced to only what you actively use.
- Recovery tags exist if anything goes sideways.

---
