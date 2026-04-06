

## Merge Conflict Resolution Workflow

### The situation

PR #41 (branch `claude/build-registration-bootstrap-docs-8XBsO`) was behind `main`. Main had new fixture fixes that touched the same integration test files the PR also modified. GitHub showed merge conflicts.

### Step by step

**1. Get on the PR branch and merge main into it**

```bash
git checkout claude/build-registration-bootstrap-docs-8XBsO
git fetch origin main
git merge origin/main
```

Git attempts auto-merge. Files it can resolve automatically, it does. Files with overlapping changes get conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`).

**2. Identify what's conflicted**

```bash
git diff --name-only --diff-filter=U
```

This lists only files with unresolved conflicts. We had 4:
- 3 integration test files (main had fixture fixes, PR had Mode C rewrites)
- 1 checkpoint JSON (main had initialized state, PR had completed state)

**3. Decide resolution strategy per file**

This is the judgment call. For each conflicted file, you pick one of:

| Strategy | Command | When to use |
|----------|---------|-------------|
| **Take theirs (main)** | `git checkout --theirs <file>` | Main's version is strictly newer/better |
| **Take ours (PR branch)** | `git checkout --ours <file>` | PR's version is the one you want to keep |
| **Manual merge** | Edit the file, remove markers | Both sides have changes you need |

In our case:
- **Integration tests → `--theirs`** (main had the fixture remediation we just landed — strictly newer)
- **Checkpoint JSON → `--ours`** (PR had the completed build state — main only had the initialized skeleton)

```bash
# Take main's version for test files
git checkout --theirs \
  __tests__/services/table-context/shift-metrics.int.test.ts \
  lib/supabase/__tests__/rls-mtl.integration.test.ts \
  lib/supabase/__tests__/rls-pooling-safety.integration.test.ts

# Keep PR's version for checkpoint
git checkout --ours \
  .claude/skills/build-pipeline/checkpoints/PRD-060.json
```

**4. Verify no conflict markers remain**

```bash
grep -rn '<<<<<<<\|>>>>>>>' <resolved-files>
```

If this outputs nothing, you're clean. If it finds markers, you missed a conflict.

**5. Stage resolved files and commit**

```bash
git add <resolved-files>
git commit -m "merge: resolve conflicts with main — <explain strategy>"
```

Git knows this is a merge commit because the merge is in progress. The commit completes the merge.

**6. Push**

```bash
git push origin <branch>
```

### The mental model

```
main:     A --- B --- C (fixture fixes)
               \
PR branch:      D --- E --- F (feature work)
```

After `git merge origin/main`:

```
main:     A --- B --- C
               \       \
PR branch:      D - E - F - M (merge commit)
```

The merge commit `M` has two parents: `F` (PR tip) and `C` (main tip). Conflicts arise where `C` and `F` both changed the same lines relative to `B` (their common ancestor).

### Key rules

- **`--theirs` = the branch you're merging IN** (main, in this case)
- **`--ours` = the branch you're ON** (the PR branch)
- This naming is counterintuitive during `git rebase` (it flips). During `git merge`, it's straightforward.
- When in doubt, `grep` for conflict markers before committing. A committed conflict marker will break everything.
- If the merge gets hopelessly tangled: `git merge --abort` resets to pre-merge state. No harm done.