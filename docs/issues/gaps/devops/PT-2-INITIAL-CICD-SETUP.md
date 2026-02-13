# PT-2 Initial CI/CD Setup (Vercel + Supabase) — Recommendations

> Goal: Stand up a **real** CI/CD spine *before prod exists*, aligned with PT-2’s blueprint constraints:
> - **matrix-first** (SRM canonical)
> - **Supabase/Postgres + RLS + RPCs**
> - **generated `types/database.types.ts` is canonical**
> - migrations are first-class
> - keep it boring and reproducible

---

## 1) Environments (minimum viable)

### Local (dev)
- Supabase local stack for fast iteration.
- Developers run migrations + typegen locally.

### Staging (hosted; required for meaningful CD)
- Create a hosted Supabase project: `pt-2-staging`.
- This is *not* production. It’s a shared, persistent environment that behaves like production (real Postgres, real Auth, real RLS).
- Create a Vercel project: `pt-2-staging`, deployed from `main`.

### Production (later)
- Not needed to start CI/CD.
- When you add it, you’ll **promote a known-good SHA** that already passed staging.

---

## 2) Repo + branching posture

- `main` is protected and always releasable.
- Feature branches: `feat/*`, `fix/*`.
- PRs must pass CI gates. No direct pushes to `main`.

Merge strategy:
- Prefer **merge commit** (keeps context) or **squash** (if you want a clean linear log). Either is fine as long as gates are strict.

---

## 3) What CI/CD must enforce for PT-2

### Non-negotiable gates
1) **Build integrity**
   - lint / format
   - typecheck
   - tests
   - Next.js build

2) **Migrations sanity**
   - migrations apply cleanly in an ephemeral CI database (or Supabase local in CI).
   - prevent “works on my machine” migration failures.

3) **Generated types are up-to-date**
   - regenerate `types/database.types.ts` in CI
   - fail if git diff shows changes

4) (Phase 2) **SRM ↔ schema drift gate**
   - SRM is canonical (matrix-first).
   - schema changes require SRM patch in same PR (or explicit doc-only label).
   - fail fast if drift is detected.

5) (Phase 2) **RLS smoke assertions**
   - basic multi-tenant isolation checks:
     - casino A staff cannot read casino B rows on a handful of core tables.

---

## 4) Vercel + Supabase staging wiring

### Vercel staging project: `pt-2-staging`
Set environment variables (staging values):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Any server-only secrets needed for privileged server routes (minimize; avoid service-role in runtime unless absolutely necessary).

### Supabase staging project: `pt-2-staging`
- Treat migrations as the source of truth (no “dashboard-only” schema edits).
- RLS enabled in staging (same posture as eventual prod).
- Optional now, but recommended soon: transaction pooling (Supavisor) posture matches your intended production shape.

---

## 5) Workflow topology (the spine)

You want two workflows initially:

### A) PR Validation (`pr.yml`)
Triggers:
- `pull_request` into `main`

Jobs (in order):
1. Checkout + install + cache
2. Lint/format check
3. Typecheck
4. Tests
5. Next build
6. Migration sanity (ephemeral DB)
7. Typegen drift check (regenerate `database.types.ts` and ensure no diff)

Outputs:
- If any gate fails, PR cannot merge.

### B) Main → Staging Deploy (`deploy-staging.yml`)
Triggers:
- `push` to `main`

Jobs (in order):
1. Apply migrations to **Supabase staging**
   - use Supabase CLI with a service token in CI
   - ensure the same migration set that passed PR checks is applied
2. Deploy to **Vercel staging**
   - deploy the exact commit SHA
3. Smoke tests against staging
   - `set_rls_context` (or your context RPC) works
   - one casino-scoped read succeeds
   - one cross-casino read fails (RLS enforced)
   - one critical RPC exists/executes (safe ones: `compute_gaming_day`, etc.)

Outcome:
- Every merge to `main` becomes a staging release.

---

## 6) Practical “Phase 1” deliverables (start here)

### Phase 1 (CI + staging CD; no prod)
- ✅ PR validation gates (build + migrations + typegen drift)
- ✅ Deploy `main` to Vercel staging
- ✅ Apply migrations to Supabase staging
- ✅ Basic smoke tests

This already gives you CI/CD with real confidence.

---

## 7) Phase 2 upgrades (still before prod)

- SRM ↔ schema drift enforcement (matrix-first contract gate)
- RLS smoke test suite expanded (minimal coverage but meaningful)
- Docs drift guardrail (light): if spec claims a behavior, ensure tests/flags exist
- Optional: PR preview deployments (UI-only or limited DB usage)

---

## 8) Production later (promotion model)

When you’re ready to add prod:
- Create Supabase project: `pt-2-prod`
- Create Vercel project: `pt-2-prod`
- Add a **promotion** workflow:
  - trigger: tag `pt2-vX.Y.Z` or manual approval on a commit SHA already deployed to staging
  - apply migrations to prod
  - deploy same SHA to prod
  - run prod smoke tests
  - rollback app to previous SHA if smoke fails (DB: prefer forward-fix migrations; still keep backups)

---

## 9) Guardrails to avoid self-inflicted wounds

- Do not store Supabase service-role key in frontend env vars (server-only if ever).
- Do not rely on dashboard edits; force migrations through repo.
- Always regenerate `types/database.types.ts` via CI to stop “type drift” from becoming your default state.
- Treat staging as your first “truth environment” — if it isn’t close to prod posture, it’s cosplay.

---

## 10) Minimal checklist (what you do first)

1. Create Supabase project: `pt-2-staging`
2. Create Vercel project: `pt-2-staging` (deploys from `main`)
3. Add Vercel env vars (staging URL/keys)
4. Add CI workflows:
   - `pr.yml` (validation gates)
   - `deploy-staging.yml` (migrate + deploy + smoke)
5. Protect `main` with required checks

---

## Notes on “staging” (clarification)
Staging = a hosted Supabase project used by the deployed Vercel app. It’s the shared proving ground. You don’t need prod to start CI/CD, but you *do* want staging so CD is meaningful and RLS/migrations are exercised in a realistic environment.
