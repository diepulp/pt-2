# Git Mixed Commit Recovery Guide

How to fix a commit that accidentally bundled unrelated changes from uncommitted work.

## The Problem

You had uncommitted changes in your working directory, created a feature branch, then committed everything together - mixing unrelated changes with your feature work.

```
What happened:
─────────────────────────────────────────────────────────
1. Working on main with uncommitted cleanup work (120 files)
2. Created feature branch: git checkout -b feature/table-layout
3. Did feature work (7 files)
4. Committed everything: git commit -a -m "table layout"
   → Commit now contains 127 files (120 cleanup + 7 feature)

Result:
main:           A
                 \
feature:          A --- B (mixed: cleanup + feature)
```

## Why Git Didn't Warn You

Git only warns when switching to an **existing** branch where changes would conflict. When creating a new branch, uncommitted changes silently follow:

```bash
# No warning here - changes come along
git checkout -b new-branch

# Warning only here - switching to existing branch with conflicts
git checkout existing-branch
# error: Your local changes would be overwritten by checkout
```

**Key insight**: Uncommitted changes live in the working directory, not on any branch. They only become part of a branch when committed.

## Recovery: Split the Mixed Commit

### Step 1: Identify the Files

```bash
# See what's in the mixed commit
git show --stat <mixed-commit>

# Identify which files belong to the feature vs cleanup
# Feature files: app/prototype/*, components/table/*
# Cleanup files: services/*, docs/*, hooks/*
```

### Step 2: Apply Cleanup Changes to Main

```bash
# Switch to main
git checkout main

# Cherry-pick the mixed commit without committing
git cherry-pick --no-commit <mixed-commit>

# Unstage the feature-specific files
git reset HEAD -- app/prototype/ components/table/ components/ui/animated*

# Remove the feature files from working directory
rm -rf app/prototype/table-layout* components/table/*

# Commit only the cleanup changes
git commit -m "refactor: cleanup work"
```

### Step 3: Recreate Feature Branch with Only Feature Changes

```bash
# Extract feature files from original commit
git show <mixed-commit>:path/to/file > /tmp/file

# Delete old branch and create new one from updated main
git branch -D feature/table-layout
git checkout -b feature/table-layout

# Copy feature files back and commit
mkdir -p app/prototype/table-layout
cp /tmp/saved-files/* appropriate/paths/
git add <feature-files>
git commit -m "feat: table layout implementation"
```

### Final Result

```
main:           A --- C (cleanup only)
                       \
feature:                C --- D (feature only)
```

## Prevention Strategies

### 1. Always Check Status Before Branching

```bash
git status
# If you see uncommitted changes, decide what to do with them first
```

### 2. Commit or Stash Before Creating Branches

```bash
# Option A: Commit the work
git add .
git commit -m "WIP: cleanup work"
git checkout -b feature/new-thing

# Option B: Stash the work
git stash push -m "cleanup work in progress"
git checkout -b feature/new-thing
# Later: git stash pop
```

### 3. Use Git Worktrees for Parallel Work

Worktrees provide completely isolated working directories:

```bash
# Create a worktree for the feature
git worktree add ../pt-2-feature feature/table-layout

# Now you have:
# pt-2/           → main branch (with your uncommitted cleanup)
# pt-2-feature/   → feature branch (clean slate)
```

Each worktree has its own working directory - changes cannot bleed between them.

### 4. Review Before Committing

```bash
# See exactly what you're about to commit
git diff --cached --stat

# If the file count seems wrong, investigate
git diff --cached --name-only | wc -l
```

## Quick Reference

| Situation | Command |
|-----------|---------|
| Check uncommitted changes | `git status` |
| Stash changes temporarily | `git stash push -m "description"` |
| Apply stashed changes | `git stash pop` |
| Cherry-pick without commit | `git cherry-pick --no-commit <sha>` |
| Unstage specific files | `git reset HEAD -- path/to/files` |
| Extract file from commit | `git show <sha>:path/file > output` |
| Create isolated worktree | `git worktree add <path> <branch>` |

## Mental Model

```
┌─────────────────────────────────────────────────────────┐
│                    WORKING DIRECTORY                    │
│                                                         │
│  Uncommitted changes live HERE, not on any branch.      │
│  They follow you when switching/creating branches.      │
│  They only become part of a branch when committed.      │
└─────────────────────────────────────────────────────────┘
                           │
                     git commit
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    GIT HISTORY                          │
│                                                         │
│  Branches are pointers to commits.                      │
│  Commits are permanent snapshots.                       │
│  The branch you're on when you commit gets the change.  │
└─────────────────────────────────────────────────────────┘
```
