

Here's the full picture. I now have enough data to give you a definitive answer.

---

## Rating Slip Test Posture — Current State (2026-03-31)

### Summary

The rollout **fixed the service-layer unit tests** but left significant gaps. The jsdom problem is **not fully remediated** across the rating-slip surface.

### What the rollout fixed (7 files, all PASS)

| File | Directive | Status |
|---|---|---|
| `services/rating-slip/__tests__/mappers.test.ts` | `@jest-environment node` | PASS |
| `services/rating-slip/__tests__/queries.test.ts` | `@jest-environment node` | PASS |
| `services/rating-slip/__tests__/rating-slip.service.test.ts` | `@jest-environment node` | PASS |
| `services/rating-slip/__tests__/rating-slip-continuity.test.ts` | `@jest-environment node` | PASS |
| `services/rating-slip/__tests__/http-contract.test.ts` | `@jest-environment node` | PASS |
| `services/rating-slip/__tests__/rating-slip-route-boundary.test.ts` | `@jest-environment node` | PASS |
| `services/rating-slip/__tests__/rating-slip-rpc-contract.int.test.ts` | `@jest-environment node` | PASS |

### Route handlers — also fixed (10 files, all have directive)

All `app/api/v1/rating-slips/**` route tests have `@jest-environment node`. **9 PASS, 1 FAIL** (`modal-data/route.test.ts` — returns 500, likely a mock/logic bug, not an env issue).

### Still broken — NO `@jest-environment node` directive

| Layer | Files | Directive | Result |
|---|---|---|---|
| **Integration tests** (`*.integration.test.ts`) | 4 files | **MISSING** | **108 FAIL** — `fetch is not defined` (jsdom) |
| **rating-slip-modal service** | 5 files | **MISSING** | 248 PASS (happen to work under jsdom because they mock everything — but running under wrong env) |
| **Hooks** (`hooks/rating-slip-modal/`, `hooks/ui/`) | 3 files | **MISSING** | Mixed — main tree passes, worktree fails (React hook mismatch) |
| **Components** (`components/modals/rating-slip/`) | 1 file | **MISSING** | Main PASS, worktree FAIL |
| **Store** (`store/__tests__/rating-slip-modal-store`) | 1 file | **MISSING** | Main PASS, worktree FAIL |

### Root causes

1. **Integration tests (108 failures):** `fetch is not defined` — the exact jsdom problem the rollout was meant to fix. These 4 `.integration.test.ts` files were **never given the directive**. They also need a running Supabase instance, but the immediate blocker is the missing environment.

2. **rating-slip-modal service (5 files):** Runs under legacy jsdom with the `[ADVISORY]` warning on every suite. Tests pass by accident because they fully mock Supabase — but they're running in the wrong environment and will break if any test starts using `fetch`, `Request`, `Response`, or other Node APIs.

3. **modal-data route test (1 failure):** Has the directive but returns 500 — this is a functional bug in the test mock, not an env issue.

### Verdict (updated 2026-03-31)

**Environment remediation is now complete for the service layer.** The directive rollout was extended in commit `e8f562a`:

- **4 integration test files** — `@jest-environment node` added. `fetch is not defined` eliminated. Remaining 102 failures are **ADR-024 auth context mismatches** (tests predate `set_rls_context_from_staff()`), not env issues.
- **5 rating-slip-modal service tests** — `@jest-environment node` added. **124 tests PASS** under correct environment. No more `[ADVISORY]` warnings.
- **Hooks, components, store** (4 files) — still missing directive. These are UI-layer tests that legitimately need jsdom, not node. Not in scope for this rollout.

**Remaining work:** Integration tests need auth context rewrite (service-role → Mode C authenticated client). See `SESSION-HANDOFF-INTEGRATION-TESTS.md` for the fix pattern and execution plan.

| Layer | Files | Directive | Status |
|-------|-------|-----------|--------|
| Service unit tests | 7 | `@jest-environment node` | **PASS** |
| Route handlers | 10 | `@jest-environment node` | **9 PASS, 1 FAIL** (mock bug) |
| Modal service tests | 5 | `@jest-environment node` (**added**) | **124 PASS** |
| Integration tests | 4 | `@jest-environment node` (**added**) | **102 FAIL** (ADR-024 auth, not env) |
| RPC contract | 1 | `@jest-environment node` | **112 PASS** |
| Hooks/components/store | 4 | jsdom (correct for UI) | Mixed — separate remediation track |