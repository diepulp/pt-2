# FIB-H — Pilot-Bounded Feature Intake Brief
## Feature: Mode C Migration for Remaining Service-Role Integration Tests

### A. Identity
- **Feature name:** Mode C migration for remaining service-role integration tests
- **Project:** Casino Player Tracker (PT-2)
- **Artifact type:** FIB-H (human-readable scope authority)
- **Lifecycle target:** Feed exec-spec generation pipeline
- **Related context:** `context-synthesis.md`
- **Primary intent:** Convert the remaining service-role business-logic integration tests to the canonical Mode C pattern so auth-path, RLS, and grant failures are exercised in the real path rather than silently bypassed.

### B. Operator Problem
The current test estate still contains a residual set of integration surfaces that execute business logic through `service_role`. That posture gives fast green tests while concealing precisely the classes of defects that matter in this system: RLS misconfiguration, missing grants, broken JWT-to-context plumbing, and context-derivation failures. The defect is not theatrical; it is epistemic. These tests can pass while the real authenticated path is broken.

### C. Pilot Fit
This is pilot-manageable **only if** it is bounded to test posture migration and coverage closure, not generalized “testing modernization.”
The slice is justified because:
- Mode C is already canonical and exemplified;
- helper infrastructure already exists;
- the work produces immediate integrity value without product-surface expansion;
- the migration can be executed context-by-context.

This is **not** a rewrite of the entire testing strategy, CI system, or Supabase harness.

### D. Actor / Moment
**Primary actors**
- Engineer executing the migration
- Reviewer validating posture conformance
- CI pipeline enforcing the migrated slice

**Moment of use**
- When an integration test currently exercises business logic through `service_role`
- When an unmigrated test must be brought into the authenticated anon + server-derived context path
- When uncovered RPC auth-path behavior must be validated before relying on the surrounding context

### E. Containment Loop
The containment loop for this pilot slice is:

1. Identify one bounded context or infra surface targeted for migration.
2. Verify Phase A prerequisites are met for that context (directives, gates, scripts). If not, complete Phase A as a separate prerequisite commit — Phase A is mechanical compliance work, not auth-path migration.
3. Rewrite business-logic test execution to Mode C:
   - authenticated anon client carries JWT claim(s),
   - RPC/service derives context server-side via `set_rls_context_from_staff()`,
   - service-role remains fixture-only.
4. Run the migrated tests against a real Supabase instance.
5. Classify failures:
   - auth/RLS/grant failure,
   - fixture/setup defect,
   - unrelated product defect.
6. Preserve strict assertions; never weaken the contract to “make green.”
7. If >20% of a context’s tests are skipped due to non-auth blockers, the context migration is BLOCKED, not complete.
8. Record blockers explicitly and move to the next bounded slice only when the current slice’s acceptance conditions are satisfied or formally blocked.

### F. Required Outcomes
The feature is successful only if all of the following become true for the targeted slice:

1. Business-logic integration tests no longer rely on `service_role`.
2. The canonical authenticated-path helper is used, or a justified local equivalent mirrors the same contract.
3. RLS/grant/auth-path failures become observable in the migrated tests.
4. Any pre-existing fixture-only use of `service_role` remains limited to setup/teardown. **Machine-verifiable rule:** `service_role` client variables must only appear inside `beforeAll`, `afterAll`, or helper functions named `setup*`/`cleanup*`/`create*Fixture`. A grep for `serviceClient.rpc(` or `setupClient.rpc(` outside these scopes in migrated files must return zero results.
5. The two known uncovered RPC seams (`rpc_get_visit_loyalty_summary`, `rpc_get_visit_last_segment`) are exercised **transitively** via Mode C tests of their parent RPCs (`rpc_get_player_recent_sessions`, `rpc_get_player_last_session_context`). These child RPCs have zero TypeScript callers — they are internal SQL composition functions. Direct PostgREST invocation tests are out of scope unless a TypeScript call site is added.
6. Blocked cases are logged with explicit blocker class and owning context.
7. Resulting artifacts are suitable to drive an EXEC spec without reopening scope identity.
8. A canonical file list is produced before EXEC generation, with each file tagged: current auth mode, target auth mode, and estimated complexity. Approximate counts (~11, ~17, ~35) are replaced with exact enumerations. **Satisfied:** see `canonical-file-list.md` — 17 Phase B targets, 19 already Mode C, 25 not real integration tests.

### G. Explicit Exclusions
Out of scope for this FIB:
- Phase A mechanical compliance work (directives, gates, scripts) — treat as prerequisite, not migration scope;
- broad CI redesign;
- parallelized multi-context Supabase execution strategy;
- Jest/Vitest framework replacement;
- production auth architecture changes;
- unrelated product fixes discovered during migration, except for blocker logging;
- assertion weakening, coverage inflation theater, or swapping to service-role “temporarily” inside business logic.

### H. Adjacent Rejected Ideas
Rejected for this slice:
- **“Just leave service-role tests alone if they are green.”** Rejected because it preserves false confidence.
- **Migrate all contexts in one sweep.** Rejected because shared Supabase state and fixture collisions make this operationally brittle.
- **Treat infra surfaces as separate from the migration contract.** Rejected because helper and root test surfaces can upstream-pattern the rest of the rewrite.
- **Count passing tests as success without auth-path realism.** Rejected because green without real auth-path coverage is counterfeit assurance.

### I. Dependencies / Assumptions
Dependencies:
- **Auth ceremony helper** (`lib/testing/create-mode-c-session.ts`) must be created as a Phase B prerequisite. See Section N for the precise spec;
- running **local** Supabase instance is available for Phase B execution (`SUPABASE_URL` must resolve to `127.0.0.1` or `localhost` — test users are created with hardcoded passwords);
- ADR / governance posture remains unchanged regarding Mode C as canonical;
- issue logging path exists for blocker capture.

Assumptions:
- the current context synthesis is materially correct about the migration shape;
- Phase A is prerequisite to Phase B where required;
- Phase B must run sequentially per context against a shared Supabase instance;
- service-role remains acceptable for fixture setup/teardown only.

### J. Likely Next
If this pilot slice succeeds:
- remaining contexts follow the same migration pattern;
- uncovered RPC seams receive direct authenticated-path tests;
- exec spec can sequence contexts by dependency leverage and risk rather than by vague volume counts alone;
- CI can later promote posture enforcement from guidance to gate.

### K. Expansion Trigger Rule
Expand beyond this pilot slice **only if** one of the following becomes true:
- repeated migration friction proves the helper or infra layer itself is the real bottleneck;
- blocker volume reveals a systemic auth/RLS flaw that cannot be handled context-by-context;
- governance decides to convert Mode C conformance from best practice into mandatory gated policy across all integration surfaces.

Absent those triggers, keep this as a bounded migration slice, not a crusade.

### L. Scope Authority Block
**Authority statement**

This feature authorizes only the pilot-bounded migration of remaining service-role business-logic integration tests and directly related uncovered RPC auth-path seams into the canonical Mode C posture.

It does **not** authorize:
- product behavior changes,
- CI/platform redesign,
- broad test-framework churn,
- assertion dilution,
- or opportunistic cleanup outside the targeted slice.

Where ambiguity appears, interpret scope toward **auth-path realism inside a bounded migration**, not toward generalized test-system refactoring.

---

### M. DA Review Provenance (2026-04-09)

**Verdict:** Ship w/ gates

**Patches applied (7):**
1. Required Outcome #5 corrected: two "uncovered" RPCs are internal SQL composition functions with zero TypeScript callers — now targeted via transitive coverage through parent RPCs
2. Helper dependency resolved: auth-only ceremony helper spec added (Section N) — zero domain fixtures, local fixture ownership, explicit invariants
3. Canonical file list added as Required Outcome #8 — approximate counts replaced with exact enumeration requirement
4. Skip-ratio gate added to containment loop — >20% skip = BLOCKED, not complete
5. Phase A stripped from scope — treated as prerequisite, not migration work
6. Remote-target safety check added — SUPABASE_URL must be local
7. Service-role confinement rule made machine-verifiable — grep-based assertion on service_role client scopes

**Ground-truth verifications performed:**
- `getTestAuthenticatedClient()` import graph: 3 files, all in `lib/server-actions/middleware/__tests__/`
- `rpc_get_visit_loyalty_summary` and `rpc_get_visit_last_segment`: zero `.rpc()` calls in *.ts; exist only as PL/pgSQL internal callees
- Parent RPCs (`rpc_get_player_recent_sessions`) tested in `visit-continuation.integration.test.ts` but via service-role — itself a Phase B target
- `set_rls_context_internal` still present in 4 test files (3 `.integration.test.ts`, 1 `.test.ts`)
- 16 `.integration.test.ts` files reference `SERVICE_ROLE_KEY`; 17 `.int.test.ts` files reference it — overlap and fixture-only usage must be triaged for exact Phase B count

### N. Auth Ceremony Helper Spec

**Location:** `lib/testing/create-mode-c-session.ts`

**Purpose:** End-to-end auth ceremony. Creates an authenticated anon client carrying a JWT with stamped `app_metadata`. Does nothing else.

#### What it does (exhaustive list)

1. Create an auth user via `serviceClient.auth.admin.createUser()` with `email_confirm: true`
2. Stamp caller-provided identity claims (`staffId`, `casinoId`, `staffRole`) into `app_metadata` via `serviceClient.auth.admin.updateUserById()`
3. Sign in via a throwaway anon client (`autoRefreshToken: false`, `persistSession: false`) to obtain a JWT
4. Construct an authenticated anon client with the JWT as a static `Authorization: Bearer` header (no token refresh, no session persistence)
5. Return `{ client, userId, email, cleanup }` where `cleanup` deletes the auth user only

#### What it does NOT do (explicit exclusions)

- Does NOT create companies, casinos, casino_settings, staff, tables, players, or any domain entity
- Does NOT delete domain entities — `cleanup()` removes only the auth user it created
- Does NOT call `set_rls_context_from_staff()` or any RPC
- Does NOT accept optional fixture parameters or "convenience" overloads for domain setup
- Does NOT manage `service_role` clients — caller provides one

#### Signature

```typescript
interface ModeCSessionResult {
  client: SupabaseClient<Database>;   // authenticated anon client with Bearer token
  userId: string;                      // auth.users.id (for afterAll cleanup)
  email: string;                       // generated email (for diagnostics)
  cleanup: () => Promise<void>;        // deletes auth user only
}

export async function createModeCSession(
  serviceClient: SupabaseClient<Database>,
  identity: {
    staffId: string;
    casinoId: string;
    staffRole: string;
  },
): Promise<ModeCSessionResult>;
```

#### Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Zero domain fixtures | Function has no `.from()` calls. Grep-verifiable. |
| Caller owns fixture lifecycle | `cleanup()` calls only `auth.admin.deleteUser()`. No `.from().delete()`. |
| Static Bearer token | Client created with `global.headers.Authorization`, not via `signInWithPassword` on the returned client. Immune to token refresh side effects. |
| Independent sessions | Multiple calls produce non-interfering clients. No shared state. |
| Local-only safety | Function asserts `SUPABASE_URL` contains `127.0.0.1` or `localhost` before creating auth users. Throws if remote. |
| Unique emails | Generated as `test-{prefix}-{staffRole}-{Date.now()}@example.com`. No collision risk across concurrent runs. |

#### Caller pattern (canonical)

```typescript
beforeAll(async () => {
  setupClient = createClient<Database>(url, SERVICE_ROLE_KEY);

  // Caller creates ALL domain fixtures
  const company = await setupClient.from('company').insert({...}).select().single();
  const casino  = await setupClient.from('casino').insert({...}).select().single();
  const staff   = await setupClient.from('staff').insert({...}).select().single();
  // ... any context-specific fixtures (tables, players, visits, policies)

  // Auth ceremony — identity claims come from caller's fixtures
  const session = await createModeCSession(setupClient, {
    staffId: staff.data!.id,
    casinoId: casino.data!.id,
    staffRole: 'pit_boss',
  });
  pitBossClient = session.client;
  authCleanup = session.cleanup;
});

afterAll(async () => {
  // Caller cleans domain fixtures in dependency order
  await setupClient.from('staff').delete().eq('id', staffId);
  // ... remaining domain cleanup
  // Auth cleanup last
  await authCleanup();
});
```

#### What this replaces

The existing `getTestAuthenticatedClient()` at `lib/server-actions/middleware/__tests__/helpers/supabase-test-client.ts` bundles auth + domain fixtures. It is **not refactored or deleted** — it continues to serve its 3 existing consumers. New Phase B work uses `createModeCSession` exclusively. The old helper may be migrated to compose over `createModeCSession` later, but that is out of scope.

#### Implementation gate

This helper must be implemented, tested (one unit test confirming the invariants), and merged before any Phase B context work begins.

---
## Notes for EXEC pipeline handoff
- Numerical accounting in downstream exec artifacts should distinguish:
  - pure service-role files,
  - mixed-mode files still requiring cleanup,
  - infra/touch surfaces.
- Estimates should be phrased as rewrite effort **excluding defect-remediation tail**.
- “One context at a time” should be preserved as an operational constraint tied to shared-state collision risk.
