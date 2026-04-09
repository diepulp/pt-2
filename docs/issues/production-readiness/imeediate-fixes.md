Here's the split based on complexity, risk, and whether design decisions are needed:

## Immediate Fixes (can execute now, well-understood patterns)

| # | Action | Why Immediate |
|---|--------|---------------|
| **1** | **Grant `authenticated` EXECUTE on 4 RPCs** | Single migration file, 4 GRANT + 4 REVOKE PUBLIC statements. Identical pattern to the hotfix we already shipped. Zero design decisions. |
| **2** | **SEC-010 Grant Audit Gate** | The GAP doc already has the exact SQL query. Create one `.sql` file, add one line to `run_all_gates.sh`. Template exists in SEC-001 through SEC-009. |
| **7** | **Migration lint for REVOKE patterns** | Add a grep pattern to existing `pre-commit-migration-safety.sh`. 5-10 lines of bash. |
| **5** | **`global-error.tsx`** | Standard Next.js pattern. The project already has 2 `error.tsx` files to copy from. |
| **10** | **DB connectivity in `/api/health`** | Add one `supabase.from('casino').select('id').limit(1)` call. Trivial. |
| **12** | **Guard `/review` routes** | Add `/review` to the authenticated paths list in `proxy.ts` or gate behind `NODE_ENV`. One-line change. |
| **14** | **Clean up unguarded `console.*`** | 5 files, mechanical fix: wrap in dev guard or remove. No design choices. |

**Estimated scope**: All 7 can be done in a single session. One migration, one security gate file, a few small edits.

## Needs Closer Planning

| # | Action | What Needs Discussion |
|---|--------|----------------------|
| **3** | **Remove `continue-on-error: true` from CI** | Need to verify tests actually pass reliably first. If there are flaky tests, making them blocking will stall all PRs. Should run the full suite a few times to assess flakiness before flipping the switch. |
| **4** | **Branch protection on `main`** | Which checks to require? Just `checks`? Or also `security-gates` and `migration-lint`? What about the test/e2e jobs — require them only after fixing #3? Need to decide required reviewers count too. |
| **6** | **Integrate error tracking (Sentry)** | SDK selection, DSN provisioning, Vercel integration vs standalone, PII filtering rules (casino data is sensitive), which events to capture vs ignore, source map upload pipeline, alert routing. This is a small project, not a fix. |
| **8** | **Mode C migration for 17 test files** | Each file needs: proper test user creation, fixture setup under authenticated context, understanding of which RPCs it exercises. Some tests may intentionally need `service_role` (fixture setup/teardown). Needs per-file triage. |
| **9** | **Structured logging** | Library choice (pino vs winston vs Vercel-native), log format/schema, integration with Vercel log drain, replacing ~15 `console.*` call sites across infrastructure code (not just the violations — the legitimate ones too). Affects cold-start perf. |
| **11** | **`error.tsx` for 12+ route groups** | Not complex individually, but needs UX decisions: consistent error messaging, retry behavior, navigation options. Should be designed once and applied uniformly, not ad-hoc per route. |
| **13** | **Server-side retry for transient DB failures** | Which operations are idempotent (safe to retry) vs which aren't? Backoff strategy? Max attempts? Does the retry wrapper go in the service layer or the middleware compositor? Needs a brief design pass. |

---