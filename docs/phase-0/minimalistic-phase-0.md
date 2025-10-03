## Minimalistic Phase 0 Setup

**Goals**

- Keep infra overhead tiny (1–2 CI files, <100 lines each).
- Enforce only the most critical guardrails: lint, typecheck, tests, build.
- Defer coverage uploads, PR title validation, TODO scanners, branch protection docs until after MVP baseline is proven.
- Ensure fast feedback (<2min) so engineers stay in flow.

## Step 1 — Single CI Workflow

Create just one .github/workflows/ci.yml:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - run: npm ci
      - run: npm run lint
      - run: npm run type-check
      - run: npm test -- --ci --passWithNoTests
      - run: npm run build
```

**That’s it**. No coverage reports, no PR title enforcement, no file-size scan.
Result: 1 file, ~30 lines, 4 quality gates.

## Step 2 — Lightweight Pre-commit Hooks

Add a .husky/pre-commit file:

```sh
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run lint-staged
```

And a lint-staged.config.js:

```js
export default {
  "**/*.{ts,tsx,js,json,md}": ["eslint --fix", "prettier --write"],
};
```

**This enforces code quality before it hits CI**.

## Step 3 — Branch Protection (Optional for Now)

Keep it human-light: just require CI to pass before merge.
You can layer approvals, semantic PR checks, etc. after MVP stabilizes.

## Step 4 — Testing Strategy

For Phase 0: just a smoke test to verify Jest/RTL wiring works (npm test doesn’t crash).

Phase 2+ (core domains): expand into proper unit/integration tests.

✅ Why This Works

Aligns with PRD’s Guardrails Upfront but avoids gold-plating.

Ensures TDD can start in Phase 2 without yak-shaving infra for weeks.

Keeps CI feedback <2min because no extra jobs, artifacts, or coverage upload.

Easy to extend later with coverage, semantic checks, etc.

👉 My advice: start with the bare minimum (Steps 1–2). Once the core vertical slices (Player → Visit → Rating Slip) are stable, revisit CI/CD hardening (coverage, Code Owners, ADR checks, etc.). Otherwise you risk burning weeks in Phase 0 just building CI plumbing instead of delivering features.
