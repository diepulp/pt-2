## Verified CI/CD Posture — PT-2 (2026-05-05)

_Patched 2026-05-04: proxy.ts convention confirmed, Preview failure mode corrected, auth history added._

### Deployment Reality

```
Push to main ──▶ Vercel native webhook ──▶ Production (~4 min build)  ✅
                                           URL: pt-2-weld.vercel.app

PR opened    ──▶ Vercel native webhook ──▶ Preview deployment (~4 min) ⚠️ BROKEN (see below)

Push to main ──▶ deploy-staging.yml   ──▶ Fails before any job runs   ❌ (broken since Apr 19)
```

**Production URL:** `https://pt-2-weld.vercel.app`  
**Custom domains:** Zero. `pt2.app` and `staging.pt2.app` referenced in workflow files do not exist and have never been configured.  
**Current production commit:** `84fe8123` (April 20, 2026 — 15 days ago)  
**Phase 1.1–1.4 financial work:** On `ref/financial-standard` branch, **not in production**. Merge to main is the deploy.

---

### Vercel Environment Variables — Critical Gap

| Variable                        | Production | Preview    | Development         |
| ------------------------------- | ---------- | ---------- | ------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅ Set     | ❌ Missing | ✅ (via .env.local) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ Set     | ❌ Missing | ✅ (via .env.local) |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅ Set     | ❌ Missing | ✅ (via .env.local) |
| `DATABASE_URL`                  | ✅ Set     | ✅ Set     | ✅ Set              |
| `DIRECT_URL`                    | ✅ Set     | ✅ Set     | ✅ Set              |

**PR Preview deployments are completely inaccessible.** The middleware (`proxy.ts`) runs an explicit env guard on every request. When `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing, it returns HTTP 500 before any page code runs — including the login page. Users see a blank server error on every URL. This is stricter than "Supabase client calls fail"; no page is reachable at all.

---

### Middleware Convention — `proxy.ts` Is Correct (Next.js 16)

Next.js 16 deprecated `middleware.ts` in favour of `proxy.ts` (`PROXY_FILENAME = 'proxy'`). The runtime template resolves `mod.proxy || mod.default` for `proxy.ts` files. The project's root `proxy.ts` exporting `async function proxy(request)` is the correct pattern. If both files coexist Next.js throws a build error and requires `proxy.ts` only. The middleware is active on every deployment.

The env guard inside `updateSession` (`lib/supabase/middleware.ts`) was added in commit `b5ca17ff` (2026-02-18). Before that commit a `hasEnvVars` bypass (checking a wrong var name — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY` — that never existed) made `hasEnvVars` permanently falsy, silently bypassing the entire auth pipeline on every request across all deployments. That bug is fixed; the current code is correct.

---

### Why deploy-staging.yml Has Never Worked

Both `deploy-staging.yml` and `deploy-production.yml` call `ci.yml` as a reusable workflow:

```yaml
ci:
  uses: ./.github/workflows/ci.yml   # requires `on: workflow_call`
  secrets: inherit
```

`ci.yml` has no `on: workflow_call` trigger. GitHub rejects the YAML at parse time — zero jobs in either deploy workflow have ever executed. The Vercel deploy and Supabase migration steps have both never run via Actions.

The four production deployments in the last 15 days were all done by **Vercel's native Git webhook**, which operates independently of GitHub Actions.

---

### Active CI Gates (What Actually Runs)

| Gate                                                | Trigger                | Job          | Blocking                           | Working  |
| --------------------------------------------------- | ---------------------- | ------------ | ---------------------------------- | -------- |
| Lint (`npm run lint` + financial enforcement rules) | PR to main             | `checks`     | Yes                                | ✅       |
| Type-check                                          | PR to main             | `checks`     | Yes                                | ✅       |
| Env drift guard                                     | PR to main             | `checks`     | Yes                                | ✅       |
| Build                                               | PR to main             | `checks`     | Yes                                | ✅       |
| Unit tests (`jest.node.config.js`)                  | PR to main             | `test`       | **No** — `continue-on-error: true` | Advisory |
| E2E (Playwright + local Supabase)                   | PR to main             | `e2e`        | **No** — `continue-on-error: true` | Advisory |
| Migration lint (RPC self-injection)                 | PR touching migrations | separate job | Yes                                | ✅       |
| Security gates (9 SQL assertions)                   | PR touching migrations | separate job | Yes                                | ✅       |
| SRM link check                                      | PR touching docs       | separate job | Yes                                | ✅       |
| Branch protection                                   | —                      | —            | **None configured**                | ❌       |

The financial enforcement ESLint rules (Phase 1.4 deliverable) ARE in the blocking `checks` job via `npm run lint`. That is the strongest enforcement lever currently active.

---

### What Phase 1.5 "Deploy" Actually Is

No staging hop exists. The merge IS the production deploy. The sequence:

1. **Fix Preview env vars first** — add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to the Preview environment in Vercel. This can be done now with three `vercel env add` commands, or via the Vercel dashboard. Required before operator UX walkthrough on a preview URL.

2. **Open PR**: `ref/financial-standard` → `main`
   - CI `checks` job: lint (financial rules enforced) + type-check + build — blocking
   - Vercel creates a Preview deployment automatically — use this for the operator walkthrough once env vars are fixed

3. **Operator UX walkthrough** on the PR preview URL — pit boss confirms FinancialValue, AttributionRatio, CompletenessBadge are interpretable

4. **Merge** — Vercel native webhook fires, production at `pt-2-weld.vercel.app` updated in ~4 minutes

5. **No migration push needed** — Phase 1.5 carries zero schema changes (Wave 1 is surface-only). The last manual `supabase db push` covers everything.

6. **Smoke check** — hit five financial API routes on the production URL, verify envelope shape

---

### Fixes Needed (Smallest to Largest)

**Fix A — Preview env vars (5 minutes, unblocks operator walkthrough):**
```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL preview
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY preview
vercel env add SUPABASE_SERVICE_ROLE_KEY preview
# Values: same as production (single Supabase project — no isolation exists)
```
Auth code itself requires no changes. The middleware is correctly wired, the env guard is fail-loud, and session handling is sound. Fix A is purely an environment configuration gap.

**Fix B — `workflow_call` in ci.yml (1 line, unblocks deploy workflows):**
```yaml
on:
  pull_request:
    branches: [main]
  workflow_dispatch:
  workflow_call:     # add this
```

**Fix C — Retask deploy-staging.yml (removes the broken Vercel deploy job; Vercel native handles it):**
Since Vercel native already deploys on push to main, the deploy job in `deploy-staging.yml` is redundant and references secrets (`SUPABASE_STAGING_PROJECT_REF`) that don't exist. The useful part is a post-merge smoke check. After Fix B lands, retask the workflow to: run CI gates → run smoke check against `pt-2-weld.vercel.app` → done. Remove the `vercel deploy` and `supabase db push` steps entirely until a staging environment exists.

**Fix D — Branch protection (admin action, non-automatable):**
Enable on `main` via GitHub Settings: require `checks` job as a required status check, 1 review, no force-push. Without this, the lint/type-check/build gates are visible but unenforceable.

**Phase 1.5 EXEC-SPEC scope:** Fix A (Preview env vars) is required for Phase 1.5 operator walkthrough. Fix B + C + D are hardening items that can be a dedicated workstream in the EXEC-SPEC or immediately actioned as pre-merge prep — they are small enough to not warrant their own PRD.