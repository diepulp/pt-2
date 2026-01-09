---
model: claude-sonnet-4-5-20250929
description: Remove a git worktree and optionally delete its branch
argument-hint: <branch-name> [--keep-branch]
allowed-tools: Bash, Read, Glob, Grep
---

# Purpose

Remove an existing git worktree from the `trees/` directory for PT-2 development. This includes stopping any running dev server, cleaning up processes, and removing the worktree directory. Optionally deletes the associated git branch.

## Variables

```
PROJECT_CWD: . (current working directory - the main project root)
BRANCH_NAME: $1 (required)
KEEP_BRANCH: $2 (optional, if "--keep-branch" is passed, branch is preserved)
WORKTREE_DIR: trees/<BRANCH_NAME>
```

## Instructions

- This command safely removes a worktree and associated resources
- Stops any running Next.js dev server for the worktree
- Removes the git worktree using git's built-in removal command
- By default, also deletes the git branch (use --keep-branch to preserve it)
- Validates that the worktree was completely removed
- Provides clear feedback about what was removed
- Handles cases where worktree is already partially removed

## Workflow

### 1. Parse and Validate Arguments

- Read BRANCH_NAME from $1, error if missing
- Check if $2 is "--keep-branch" to determine branch handling
- Construct WORKTREE_DIR path: `PROJECT_CWD/trees/<BRANCH_NAME>`
- Validate branch name format (no spaces, valid git branch name)

### 2. Check Worktree Existence

- List all worktrees: `git worktree list`
- Check if worktree exists at WORKTREE_DIR
- If worktree doesn't exist:
  - Check if directory exists anyway (orphaned directory)
  - If directory exists, note it for manual cleanup
  - If neither exists, error with message that worktree not found

### 3. Identify Running Processes

- Check for any Next.js dev server running from the worktree directory:
  - `ps aux | grep "trees/<BRANCH_NAME>" | grep -v grep`
- Check for processes on common dev ports (3001-3010):
  - `lsof -ti :3001 :3002 :3003 :3004 :3005` (etc.)
- Identify PIDs associated with the worktree

### 4. Stop Running Services

- If processes found in worktree directory:
  - Kill processes: `kill -15 <PIDs>` (graceful)
  - Wait 2 seconds
  - If still running: `kill -9 <PIDs>` (force)
  - Verify processes stopped
- Note: This only kills processes explicitly running from this worktree

### 5. Remove Git Worktree

- Remove worktree using git: `git worktree remove trees/<BRANCH_NAME>`
- If removal fails with error (e.g., worktree has uncommitted changes):
  - Try force removal: `git worktree remove trees/<BRANCH_NAME> --force`
  - Note the force removal in the report
- Verify worktree was removed: `git worktree list | grep trees/<BRANCH_NAME>`
- Should return nothing if successfully removed

### 6. Delete Git Branch (unless --keep-branch)

- Skip if KEEP_BRANCH is set
- After worktree is successfully removed, delete the git branch:
  - First try safe delete: `git branch -d <BRANCH_NAME>`
  - If safe delete fails (unmerged changes), ask user to confirm force delete
  - Use force delete if confirmed: `git branch -D <BRANCH_NAME>`
- Verify branch was deleted: `git branch --list <BRANCH_NAME>`
- Important: Branch deletion is permanent

### 7. Clean Up

- Run `git worktree prune` to clean up any stale worktree metadata
- Check if WORKTREE_DIR still exists after removal
- If directory still exists, provide manual cleanup instructions

### 8. Validation

- Confirm worktree no longer appears in: `git worktree list`
- Confirm directory no longer exists at WORKTREE_DIR
- Confirm branch status (deleted or preserved based on flag)
- If any validation fails, include in warnings section

### 9. Report

Follow the Report section format below.

## Report

After successful worktree removal, provide a detailed report:

```
✅ Git Worktree Removed Successfully!

📁 Worktree Details:
   Location: trees/<BRANCH_NAME>
   Branch: <BRANCH_NAME>
   Status: ❌ REMOVED

🛑 Services Stopped:
   ✓ Next.js dev server terminated (if running)
   ✓ All associated processes cleaned up

🗑️  Cleanup:
   ✓ Git worktree removed
   ✓ Git branch <deleted|preserved> (based on flag)
   ✓ Directory removed from trees/
   ✓ Worktree metadata pruned

📝 Remaining Worktrees:
   <list from git worktree list>

🔍 Verification:
   ✓ Worktree not in git worktree list
   ✓ Directory trees/<BRANCH_NAME> removed
```

If --keep-branch was used:

```
💡 Branch Preserved:
   The branch '<BRANCH_NAME>' still exists and can be used later.
   Create a new worktree with: /create-worktree <BRANCH_NAME>
```

If branch was deleted:

```
💡 Branch Deleted:
   Both worktree AND branch '<BRANCH_NAME>' have been removed.
   This is permanent. To work on this feature again, create a new branch.
```

If any issues occurred:

```
⚠️  Warnings / Issues:
- Used --force flag to remove worktree (had uncommitted changes)
- Used -D flag to force delete branch (had unmerged changes)
- <other issues>
```

If worktree was not found:

```
⚠️  Worktree Not Found:
- Worktree 'trees/<BRANCH_NAME>' was not found in git worktree list
- Run 'git worktree prune' to clean up any stale metadata
```

ARGUMENTS: $ARGUMENTS
