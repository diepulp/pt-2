# PT‑2 PR Gate — Why PRs Matter and How to Use Them (CI/CD Entry Gate)

## The point
If you keep pushing directly to `main`, CI/CD is basically a decorative sticker.

A **Pull Request (PR)** is your **transaction boundary**:
- **Input:** a proposed set of commits (code + migrations + types + docs).
- **Validation:** CI runs required gates to prove the change is safe.
- **Output:** mergeable (sanitized) or rejected.

In PT‑2 terms: **the PR is your commit sanitizer**.

---

## The new workflow (PT‑2)
### Old (fragile)
1) Commit on `main`  
2) Push to `main`  
3) Hope migrations/types/RLS didn’t break  
4) Manual `supabase db push` sometimes  
5) Drift accumulates

### New (disciplined)
1) Create a branch: `feat/<topic>` or `fix/<topic>`
2) Commit + push to that branch
3) Open a PR into `main`
4) CI runs required gates (below)
5) Only merge when green
6) Merge to `main` triggers staging deploy (when CD is wired)

---

## What to protect on `main` (minimum viable)
Configure branch protection so `main`:
- **rejects direct pushes**
- **requires PRs**
- **requires all CI checks to pass**
- requires **1 approval** (even if it’s you — the goal is forced pause + review)
- blocks merge if the branch is behind `main` (optional but helpful)

---

## CI checks that should be required on every PR
### Always required
- Lint / formatting check
- Typecheck
- Unit tests
- `next build` (build must be a merge gate)

### PT‑2 required (DB + types correctness)
- **Migration apply sanity** (apply all migrations to a clean ephemeral DB)
- **Typegen drift gate** (regenerate `types/database.types.ts`, fail on diff)

### Phase 2 (once you wire it)
- **SRM ↔ schema drift** (matrix-first contract gate)
- **RLS smoke tests** (cross-casino reads blocked on core tables)

---

## PR contract (the rules reviewers enforce)
### If the PR changes schema (migrations)
It must include:
- the migration files
- regenerated `types/database.types.ts` (canonical import surface)
- any required backfills / safe forwards
- (Phase 2) SRM patch if ownership/bounded-context contract changed

### If the PR changes SRM
It must include:
- corresponding schema/migration changes (or explicitly marked doc-only)

### If the PR touches auth/RLS
It must include:
- smoke coverage proving cross-casino access is still blocked
- no dev-auth bypass leaking into non-test builds

---

## Recommended PR checklist (copy/paste into PR description)
- [ ] Code passes lint/typecheck/tests
- [ ] `next build` passes
- [ ] (If DB changed) migrations apply cleanly on a clean DB
- [ ] (If DB changed) `types/database.types.ts` regenerated and committed
- [ ] (If auth/RLS changed) cross-casino read is blocked (smoke)
- [ ] Docs updated if behavior or workflow changed (no doc drift)

---

## Why this matters (in one paragraph)
PT‑2’s failure modes are mostly **schema/RLS/types drift**, not “a button moved.” PRs create a forced checkpoint where the repo proves, automatically, that migrations apply, types match schema, and builds/tests pass. Then `main` stays releasable, and staging deploys become predictable instead of ritual.

---

## Next step (implementation)
1) Add branch protection to `main` (PRs only, required checks).
2) Add a PR template (below).
3) Wire `deploy-staging.yml` so merge → staging is automatic.

---

## Minimal PR template (optional file: `.github/pull_request_template.md`)
```md
## Summary
(What changed and why)

## Risk / Scope
- [ ] Low  - UI-only / refactor
- [ ] Medium - touches services or queries
- [ ] High - touches schema/RLS/auth/migrations

## Database impact
- [ ] No DB changes
- [ ] Migrations included
- [ ] `types/database.types.ts` regenerated

## Checks
- [ ] lint/typecheck/tests pass
- [ ] `next build` passes
- [ ] migrations apply cleanly (if DB changed)
- [ ] RLS smoke passes (if auth/RLS changed)

## Notes
(Anything reviewers should know)
```
