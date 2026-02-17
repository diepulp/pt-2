# CI/CD Infra Review — Suggestions (PT‑2)

Source: **INV-CICD-ENVIRONMENT-FLOW-FINDINGS.md** (your current infra findings). 

## Executive take
Your findings are basically correct: **CI is “grown-up enough,” CD is missing, and the docs lie**. The biggest risk is the current remote Supabase project acting as **shared remote + quasi-prod** with manual `db push`, which undermines reproducibility and multi-env posture. 

---

## 1) Stop treating the single remote Supabase as “whatever it is”
Right now the remote project (`vaicxfihdldgepzryhpd`) is doing too many jobs (shared remote / staging-ish / “future prod”), and schema updates are being applied manually (`supabase db push`). That’s your biggest operational foot-gun. 

### Recommendation (Phase 1B; non-negotiable)
- Create a hosted Supabase project: **`pt-2-staging`** now.
- Move the “shared remote” workflow to staging so it becomes **pipeline-owned**, not “whoever ran the command last.”
- Freeze the current remote as “legacy/dev” (or lock it down) once staging exists.

---

## 2) Make `ci.yml` complete (3 critical merge gates missing)
You have lint/typecheck/tests + security hooks. Good. But the findings call out missing merge gates that will bite first. 

### Add to `ci.yml` immediately
1) **`npm run build`**
   - Next.js build must be a required check on every PR.

2) **Typegen drift gate**
   - Regenerate **local** types (your `db:types-local`) and fail the build if `git diff` shows changes.
   - Keep “remote typegen” out of PR CI unless you explicitly want CI to depend on cloud availability.

3) **Migration apply sanity (ephemeral)**
   - Spin up Supabase local in CI and apply all migrations from scratch.
   - With ~177 migrations, “lint-only” is not enough for confidence. 

> If you do only one thing this week: **migration apply sanity**. It turns “we hope migrations work” into “we know.”

---

## 3) Don’t hook Vercel until a DB deploy step exists
CD is the gap. If you add Vercel before DB migration automation, you’ll deploy an app that expects schema changes that never got applied.

### Staging deploy order must be
1) Apply migrations to **Supabase staging** (`supabase db push` / `supabase migration up`)
2) Deploy **Vercel staging**
3) Run smoke tests (auth posture + RLS + critical RPC existence)

Your “migration-first deployment” constraint is correct. 

---

## 4) Fix the docs (make them describe reality)
The current deployment guide describes an environment chain that doesn’t exist and omits the remote Supabase lifecycle (link/db push/typegen). That’s how teams rot. 

### Recommendation: split docs into “today vs target”
- `docs/deployments/ENVIRONMENT-FLOW.md` — **what exists today**, strict and short
- `docs/deployments/TARGET-FLOW.md` — your aspirational Local → Preview → Staging → Prod

In the “today” doc, explicitly state:
- how staging gets migrations (**CI only** once established)
- which typegen output is canonical and when it’s generated
- who is allowed to run `db push` (ideally: **only CI**)

---

## 5) Add a deploy-time security invariant check
You already enforce bypass-jailing conceptually, but you should fail any staging deploy if:
- `ENABLE_DEV_AUTH` is set
- any “skipAuth” path leaks into non-test builds

Add a “assert env invariants” step right before deploy.

---

## 6) Type generation: enforce ONE canonical import surface
Your findings mention both:
- `types/remote/database.types.ts` (remote)
- local generation for dev 

This is workable only if you avoid “two truths.”

### Recommendation
- Keep **one canonical path** used by app imports (e.g. `types/database.types.ts`).
- Treat “remote types” as an artifact generation mode, not a separate import tree.
- CI should enforce that the canonical file matches what local migrations produce (typegen drift gate).

---

## 7) Add a tiny smoke-test harness now (so it powers staging verification later)
You already know the smoke assertions you need. Package them as a single script/test runnable:
- in CI (against ephemeral Supabase local)
- post-deploy (against Supabase staging)

Suggested smoke assertions:
- RLS context setter works (`set_rls_context*` / equivalent)
- casino-scoped query succeeds with correct context
- cross-casino query fails (RLS enforced)
- a safe critical RPC exists/executes (e.g., `compute_gaming_day`)

---

## Prioritized “do next” list (tight and practical)
1) Patch `ci.yml`: add **build**, **local typegen drift**, **ephemeral migration apply**.
2) Create Supabase **staging** project and stop using the current remote as “shared prod-ish.”
3) Add `deploy-staging.yml`: **migrations → Vercel deploy → smoke tests**.
4) Rewrite deployment guide into **today vs target** to stop hallucinated environments.
