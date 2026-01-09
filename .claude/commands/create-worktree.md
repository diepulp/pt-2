---
model: claude-sonnet-4-5-20250929
description: Create a git worktree with isolated configuration for parallel PT-2 development
argument-hint: [branch-name] [port-offset]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
---

# Purpose

Create a new git worktree in the `trees/` directory for parallel PT-2 development. This enables running multiple instances of the Next.js application simultaneously on different ports.

## Variables

```
PROJECT_CWD: . (current working directory - the main project root)
BRANCH_NAME: $1 (required)
PORT_OFFSET: $2 (optional, defaults to auto-calculated based on existing worktrees)
WORKTREE_BASE_DIR: trees/
WORKTREE_DIR: trees/<BRANCH_NAME>
BASE_PORT: 3000
DEV_PORT: 3000 + PORT_OFFSET  # First worktree: 3001, Second: 3002, etc.

NOTE: Main repo uses port 3000 (no offset)
      Worktrees start at offset 1 to avoid conflicts
```

## Instructions

- Creates a fully functional, isolated worktree of the PT-2 codebase
- Each worktree can run on a unique port to prevent conflicts
- Environment configuration is copied from main repo
- Dependencies are installed automatically
- If branch is currently checked out in main repo, switch main repo to `main` branch first
- If branch doesn't exist locally, create it from current HEAD
- Provide clear instructions for starting the dev server

## Workflow

### 1. Parse and Validate Arguments

- Read BRANCH_NAME from $1, error if missing
- Read PORT_OFFSET from $2 if provided
- If PORT_OFFSET not provided, calculate next available offset:
  - List existing worktrees in trees/ directory
  - Count existing worktrees and use (count + 1) as offset
  - First worktree gets offset 1 → port 3001
  - Second worktree gets offset 2 → port 3002
- Calculate DEV_PORT = 3000 + PORT_OFFSET
- Validate branch name format (no spaces, valid git branch name)

### 2. Pre-Creation Validation

- Check if PROJECT_CWD/trees/ directory exists, create if not: `mkdir -p trees`
- Check if worktree already exists at WORKTREE_DIR
- Check if branch exists: `git branch --list <BRANCH_NAME>`
- Check if branch is currently checked out in main repo
  - If yes, switch main repo to `main` branch first: `git checkout main`
  - This allows the worktree to use the branch
- Check if calculated port is available: `lsof -i :<DEV_PORT>`

### 3. Create Git Worktree

- From PROJECT_CWD, create worktree: `git worktree add trees/<BRANCH_NAME> <BRANCH_NAME>`
  - If branch doesn't exist, add `-b` flag to create it from HEAD
  - This creates WORKTREE_DIR at PROJECT_CWD/trees/<BRANCH_NAME>
- Verify worktree was created: `git worktree list | grep trees/<BRANCH_NAME>`

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

### 7. Report

Follow the Report section format below.

## Report

After successful worktree creation, provide a detailed report:

```
✅ Git Worktree Created Successfully!

📁 Worktree Details:
   Location: trees/<BRANCH_NAME>
   Branch: <BRANCH_NAME>
   Commit: <commit hash and message>

🔌 Port Configuration:
   Dev Server Port: <DEV_PORT>
   Port Offset: <PORT_OFFSET>

📦 Dependencies:
   ✓ npm dependencies installed (trees/<BRANCH_NAME>/node_modules)

⚙️  Environment:
   ✓ .env copied from main repo (Supabase keys, API keys preserved)

🎯 Current Worktrees:
   <list all worktrees from git worktree list>

📝 Quick Start:

   cd trees/<BRANCH_NAME>
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

   git worktree remove trees/<BRANCH_NAME>

   # Or force remove if needed:
   git worktree remove trees/<BRANCH_NAME> --force

💡 Tips:
   • Each worktree shares the same Supabase database (cloud)
   • Run multiple worktrees on different ports for parallel development
   • Changes in one worktree don't affect others until merged
   • Use 'git worktree list' to see all active worktrees
```

If main repo branch was switched, include:

```
⚠️  Note:
   Main repo was switched from '<BRANCH_NAME>' to 'main' branch
   to allow worktree creation. Your uncommitted changes remain intact.
```

If any validation steps failed, include:

```
⚠️  Warnings / Action Required:
- <List any warnings or actions the user needs to take>
```

ARGUMENTS: $ARGUMENTS
