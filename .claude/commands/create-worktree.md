---
model: claude-sonnet-4-5-20250929
description: Create a git worktree with isolated configuration for parallel PT-2 development
argument-hint: <new-branch> [--from <base-branch>] [--port <offset>]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
---

# Purpose

Create a new git worktree in the `trees/` directory for parallel PT-2 development. This creates a NEW branch for isolated work and enables running multiple instances of the Next.js application simultaneously.

## Variables

```
PROJECT_CWD: . (current working directory - the main project root)
NEW_BRANCH: $1 (required) - name for the NEW branch to create
BASE_BRANCH: value after --from flag (optional, defaults to current HEAD)
PORT_OFFSET: value after --port flag (optional, auto-calculated if not provided)
WORKTREE_BASE_DIR: trees/
WORKTREE_DIR: trees/<NEW_BRANCH>
BASE_PORT: 3000
DEV_PORT: 3000 + PORT_OFFSET
```

## Key Behavior

**This command ALWAYS creates a NEW branch.** It does NOT check out existing branches.

- `/create-worktree feat/new-work` → Creates `feat/new-work` from current HEAD
- `/create-worktree feat/new-work --from main` → Creates `feat/new-work` from `main`
- `/create-worktree feat/new-work --from feat/existing` → Creates `feat/new-work` from `feat/existing`

If the branch name already exists, the command will ERROR and ask the user to choose a different name.

## Instructions

- Creates a NEW branch and worktree for isolated PT-2 development
- Each worktree runs on a unique port to prevent conflicts
- Environment configuration is copied from main repo
- Dependencies are installed automatically
- NEVER checks out an existing branch - always creates new
- Provide clear instructions for starting the dev server

## Workflow

### 1. Parse and Validate Arguments

- Read NEW_BRANCH from $1, error if missing
- Parse optional flags:
  - `--from <base>`: Base branch to create from (default: current HEAD)
  - `--port <offset>`: Port offset (default: auto-calculated)
- If PORT_OFFSET not provided, calculate next available:
  - Count existing worktrees in trees/ directory
  - Use (count + 1) as offset (1, 2, 3...)
- Calculate DEV_PORT = 3000 + PORT_OFFSET
- Validate branch name format (no spaces, valid git branch name)

### 2. Pre-Creation Validation

- Check if PROJECT_CWD/trees/ directory exists, create if not: `mkdir -p trees`
- **CRITICAL**: Check if NEW_BRANCH already exists: `git branch --list <NEW_BRANCH>`
  - If branch EXISTS: **ERROR** - "Branch '<NEW_BRANCH>' already exists. Choose a different name or use `git worktree add` directly to check out the existing branch."
  - Do NOT proceed if branch exists
- If BASE_BRANCH specified, verify it exists: `git branch --list <BASE_BRANCH>` or `git rev-parse <BASE_BRANCH>`
  - If BASE_BRANCH doesn't exist: ERROR with helpful message
- Check if worktree directory already exists at WORKTREE_DIR
- Check if calculated port is available: `lsof -i :<DEV_PORT>`

### 3. Create Git Worktree with New Branch

- From PROJECT_CWD, create worktree with NEW branch:
  ```bash
  git worktree add -b <NEW_BRANCH> trees/<NEW_BRANCH> <BASE_BRANCH>
  ```
  - `-b <NEW_BRANCH>`: Creates the new branch
  - `trees/<NEW_BRANCH>`: Worktree location
  - `<BASE_BRANCH>`: Starting point (or HEAD if not specified)
- Verify worktree was created: `git worktree list | grep trees/<NEW_BRANCH>`
- Verify branch was created: `git branch --list <NEW_BRANCH>`

### 4. Setup Environment File

- Check if root .env exists in main project at PROJECT_CWD/.env
- If PROJECT_CWD/.env exists:
  - Copy it to worktree: `cp <PROJECT_CWD>/.env <WORKTREE_DIR>/.env`
  - This preserves Supabase keys, API keys, and other configuration
- If PROJECT_CWD/.env doesn't exist:
  - Copy .env.example if available: `cp <PROJECT_CWD>/.env.example <WORKTREE_DIR>/.env`
  - Add warning that user needs to configure environment variables
- Also copy .env.local if it exists: `cp <PROJECT_CWD>/.env.local <WORKTREE_DIR>/.env.local 2>/dev/null || true`

### 5. Install Dependencies

- Install dependencies in worktree:
  - `cd <WORKTREE_DIR> && npm install`
  - Verify node_modules directory was created
- Return to main project: `cd <PROJECT_CWD>`

### 6. Validation

- Verify directory structure:
  - Confirm WORKTREE_DIR exists
  - Confirm WORKTREE_DIR/.env exists
  - Confirm WORKTREE_DIR/node_modules exists
- List worktrees to confirm: `git worktree list`
- Confirm new branch exists: `git branch --list <NEW_BRANCH>`

### 7. Report

Follow the Report section format below.

## Report

After successful worktree creation, provide a detailed report:

```
✅ Git Worktree Created Successfully!

📁 Worktree Details:
   Location: trees/<NEW_BRANCH>
   Branch: <NEW_BRANCH> (NEW)
   Based on: <BASE_BRANCH or "HEAD">
   Commit: <commit hash and message>

🔌 Port Configuration:
   Dev Server Port: <DEV_PORT>
   Port Offset: <PORT_OFFSET>

📦 Dependencies:
   ✓ npm dependencies installed (trees/<NEW_BRANCH>/node_modules)

⚙️  Environment:
   ✓ .env copied from main repo (Supabase keys, API keys preserved)

🎯 Current Worktrees:
   <list all worktrees from git worktree list>

📝 Quick Start:

   cd trees/<NEW_BRANCH>
   npm run dev -- --port <DEV_PORT>

   # Or with turbopack:
   npm run dev -- --port <DEV_PORT> --turbopack

🌐 Access URL:
   http://localhost:<DEV_PORT>

🔄 Available Commands in Worktree:

   npm run dev              # Start dev server (default port 3000)
   npm run dev -- --port <DEV_PORT>  # Start on isolated port
   npm run build            # Production build
   npm run test             # Run Jest tests
   npm run db:types         # Regenerate Supabase types
   npm run e2e:playwright   # Run Playwright E2E tests

🗑️  To Remove This Worktree:

   git worktree remove trees/<NEW_BRANCH>

   # Or force remove if needed:
   git worktree remove trees/<NEW_BRANCH> --force

💡 Tips:
   • This is a NEW branch - commit and push when ready
   • Each worktree shares the same Supabase database (cloud)
   • Run multiple worktrees on different ports for parallel development
   • Changes in one worktree don't affect others until merged
   • Use 'git worktree list' to see all active worktrees
```

If any validation steps failed, include:

```
⚠️  Warnings / Action Required:
- <List any warnings or actions the user needs to take>
```

## Examples

```bash
# Create new branch from current HEAD
/create-worktree feat/new-feature

# Create new branch based on main
/create-worktree feat/new-feature --from main

# Create new branch based on another feature branch
/create-worktree feat/iteration-2 --from feat/iteration-1

# Create with specific port
/create-worktree feat/new-feature --from main --port 5
```

ARGUMENTS: $ARGUMENTS
