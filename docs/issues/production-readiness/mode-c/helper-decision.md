# Mode C Helper Decision Record

**Date:** 2026-04-09
**Decision:** Auth-only ceremony helper; zero domain fixtures; local fixture ownership.
**Authoritative spec:** FIB-H Section N

## Decision

Create `lib/testing/create-mode-c-session.ts` — a thin helper that performs **only** the auth ceremony (create user, stamp claims, sign in, return Bearer client). Domain fixture creation and cleanup remain the caller's responsibility.

## Options Evaluated

| Option | Verdict | Reason |
|--------|---------|--------|
| **A. Promote `getTestAuthenticatedClient()` to shared location** | Rejected | Bundles auth + domain fixtures. 30 existing Mode C tests prove fixture shapes diverge per context. Schema changes to shared fixtures break all importers simultaneously. |
| **B. Keep auth setup inline everywhere** | Rejected | The auth ceremony (~20 lines) is the one truly duplicated piece across all tests. Eliminating it reduces mechanical error in Phase B rewrites. |
| **C. Auth-only ceremony helper** | **Accepted** | Shares only what is actually duplicated (auth ceremony). Domain fixtures remain caller-owned. No fixture coupling. Composes cleanly for multi-role and cross-casino tests. |

## Evidence

- 30 files already do Mode C auth setup inline
- Auth boilerplate is ~20 lines per file (identical across all)
- Domain fixture boilerplate is 60-150 lines per file (always different)
- Existing `getTestAuthenticatedClient()` at `lib/server-actions/middleware/__tests__/helpers/supabase-test-client.ts` imported by only 3 files — never adopted cross-context because its fixture shape doesn't fit

## Invariants (from FIB-H Section N)

1. Zero domain fixtures — function has no `.from()` calls
2. Caller owns fixture lifecycle — `cleanup()` calls only `auth.admin.deleteUser()`
3. Static Bearer token — no token refresh side effects
4. Independent sessions — multiple calls produce non-interfering clients
5. Local-only safety — asserts `SUPABASE_URL` is `127.0.0.1` or `localhost`
6. Unique emails — `test-{prefix}-{staffRole}-{Date.now()}@example.com`

## Impact on Existing Code

- `getTestAuthenticatedClient()` is **not refactored or deleted** — it continues to serve its 3 consumers in `lib/server-actions/middleware/__tests__/`
- New Phase B work uses `createModeCSession` exclusively
- Old helper may later be migrated to compose over `createModeCSession`, but that is out of scope
