# Rating-Slip Integration Test Auth Remediation

**Date:** 2026-03-31
**Status:** Approved
**Governance:** ADR-044 (Testing Governance Posture), Testing Governance Standard v2.0.0
**Implements:** ADR-024 (Authoritative Context Derivation)
**Precedent:** Casino Exemplar (Slice One, commit `065c2c4`)
**Issue:** Surfaced in ROLLOUT-SUMMARY-03-31.md

---

## 1. Problem

The rating-slip integration tests (4 files, ~71 failing tests) were written before ADR-024. They pass a **service-role Supabase client** to `createRatingSlipService()`. Service-role clients carry no JWT, so `auth.uid()` returns NULL and `set_rls_context_from_staff()` raises `UNAUTHORIZED: staff identity not found`.

This is ADR-024 defense-in-depth working as designed — not a bug.

Additionally, 1 route handler test (`modal-data/route.test.ts`) returns 500 from a mock/logic bug unrelated to environment.

### Current Failure Breakdown

| Category | Count | Cause |
|----------|-------|-------|
| UNAUTHORIZED (service-role → no JWT) | ~82 | Core ADR-024 auth mismatch |
| Schema drift (casino, visit inserts) | ~4-6 | Pre-ADR-043 fixtures, evolved required columns |
| Partial auth (`move-pooling`) | ~4 | Incomplete auth setup |
| Route handler mock bug | 1 | Mock/logic defect in `modal-data/route.test.ts` |

### Current State vs. Target

| Layer | Current | Target |
|-------|---------|--------|
| Integration tests (4 files) | **Advisory** — correct runtime (`node`), assertions fail on auth | **Trusted-Local** — correct runtime, truthful command, behaviorally meaningful assertions |
| Route handler (1 file) | **Degraded** — correct runtime, 1 test fails | **Healthy** — all assertions pass |

**Trusted-Local** per Testing Governance Standard §2: runs in correct environment, invoked by truthful command, produces behaviorally meaningful assertions.

---

## 2. Auth Fixture Pattern (Mode C)

Each integration test file gets a **local `beforeAll` setup** following the Mode C pattern proven in e2e fixtures (`exclusion-fixtures.ts`, `rating-slip-fixtures.ts`). No shared helpers — each file is self-contained, matching the casino exemplar's approach.

### Setup Sequence (beforeAll)

1. Create **service-role client** (setup/teardown only)
2. Create **company** (ADR-043: company before casino)
3. Create **casino** with `company_id` FK + `status: 'active'`
4. Create **casino_settings** (gaming_day trigger dependency)
5. Create **auth user** via `admin.createUser()` with `app_metadata: { casino_id, staff_role }`
6. Create **staff record** — `status: 'active'`, `user_id` bound to auth user
7. **Stamp `staff_id`** into `app_metadata` via `admin.updateUserById()` (ADR-024 two-phase requirement)
8. **Sign in** via `signInWithPassword()` → get JWT `access_token`
9. Create **authenticated client** with `Authorization: Bearer <token>` (Mode C)
10. Pass authenticated client to `createRatingSlipService()`

### Teardown Sequence (afterAll)

Cleanup in **reverse FK order**: rating_slips → visits → players → gaming_tables → staff → casino_settings → casino → company → auth user deletion.

### Key Invariants

- **No spoofable parameters** — identity derived from JWT + staff table lookup
- **`staff.status = 'active'`** — required by `set_rls_context_from_staff()`
- **`staff_id` in `app_metadata`** — ADR-024 two-phase stamping
- **UUID-prefixed test data** — collision-safe for parallel runs
- **Service-role restricted to setup/teardown** — all test assertions go through authenticated client

### Before/After

```typescript
// BEFORE (broken): service-role → auth.uid() = NULL → UNAUTHORIZED
const supabase = createClient(url, serviceKey);
service = createRatingSlipService(supabase);

// AFTER (Mode C): real JWT → auth.uid() returns user ID → context derives
const authedClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${jwt}` } },
  auth: { autoRefreshToken: false, persistSession: false },
});
service = createRatingSlipService(authedClient);
```

---

## 3. File Execution Order

Files are fixed sequentially. The largest file goes first as the **validating exemplar** — it proves the auth pattern works against real rating-slip RPCs before mechanical application to the rest.

| Order | File | Tests | Work | Rationale |
|-------|------|-------|------|-----------|
| 1 | `rating-slip.integration.test.ts` | ~35 | Full auth rewrite + schema drift investigation | **Validating exemplar** — largest file, proves pattern |
| 2 | `rating-slip-continuity.integration.test.ts` | ~25 | Mechanical auth rewrite | Identical auth shape to file 1 |
| 3 | `policy-snapshot.integration.test.ts` | ~7 | Mechanical auth rewrite | Smallest integration file |
| 4 | `rating-slip-move-pooling.integration.test.ts` | ~4 | Extend partial auth + schema drift fixes | Has partial auth — needs completion, not full rewrite |
| 5 | `modal-data/route.test.ts` | 1 | Fix mock/logic bug | Route handler, separate concern |

---

## 4. Schema Drift Investigation

Each drift case is **verified individually** against the current schema before deciding whether to fix the test assertion or investigate a real issue.

| File | Line | Drift | Investigation |
|------|------|-------|---------------|
| `rating-slip-move-pooling` | 243 | Casino insert missing `company_id` | ADR-043 made `company_id` required. Verify FK constraint, then add company creation to fixture. |
| `rating-slip-move-pooling` | 315 | Visit insert missing `gaming_day`, `visit_group_id` | Schema evolved. Verify: is `gaming_day` trigger-computed or required at insert? What is the source for `visit_group_id`? |
| `rating-slip.integration` | 787 | Expected 1-2 args, got 3 | RPC signature changed. Check current function signature in migrations before fixing call site. |
| `rating-slip.integration` + `continuity` | 28-29, 21-22 | `@/lib/errors/domain-errors` and `@/types/database.types` module resolution | TS2307 — path alias resolved by Jest `moduleNameMapper`, not IDE. Same as casino exemplar (runtime-correct, not a defect). Verify at runtime. |
| `rating-slip-continuity` | 21 | `DomainError` declared but never read | TS6133 — unused import. Remove if confirmed unused after auth rewrite. |

**Decision rule:** If the current schema is correct and the test predates the change, update the test. If the test assertion reveals a real contract violation, escalate before fixing.

---

## 5. Governance Artifacts & Skill Delegation

### Domain Expert Skills

This remediation delegates to available skills for quality assurance and test authoring:

| Skill | Role in This Work |
|-------|-------------------|
| `/qa-specialist` | Run test suites, produce quality gate reports, validate verification tier transitions (Advisory → Trusted-Local). Invoke after each file is remediated to confirm pass/fail status and governance compliance. |
| `/e2e-testing` | Consult for fixture patterns (Mode C auth scaffolding, cleanup ordering, ADR-024 compliance). The integration test fixtures follow the same auth pattern governed by QA-006 §5. |

**When to invoke:**
- `/qa-specialist` — after each file remediation (files 1-4) and after route handler fix (file 5), to validate the verification tier claim
- `/e2e-testing` — when authoring the Mode C fixture setup, to ensure alignment with QA-006 fixture requirements and existing e2e patterns

### Governance Disclosure

Matching the casino exemplar's governance disclosure pattern:

| Artifact | Purpose |
|----------|---------|
| Updated `ROLLOUT-SUMMARY-03-31.md` | Final posture table with all layers at target state |
| §11-compliant skip registry | Reason + exit criteria for any test that cannot be fixed in this pass |
| §12-compliant change disclosure | Commit message/PR description stating what changed, why, which layers gained/lost status |

### Skip Policy (§11)

If any test cannot be fixed in this pass (e.g., depends on infrastructure not available, or reveals a real bug that needs separate investigation):

- Skip with `describe.skip()` or `it.skip()`
- Document: reason, exit criteria, named owner (solo steward)
- Record in skip registry within the rollout summary

Blanket-skipping entire files is prohibited.

---

## 6. Verification Protocol

### Command

```bash
RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js \
  services/rating-slip/__tests__/*.integration.test.ts
```

Requires local Supabase running (`supabase start`).

### Success Criteria

All 4 integration test files pass. Zero UNAUTHORIZED failures. Schema drift cases resolved or §11-skipped with documented exit criteria.

### Exit State

| Layer | Files | Health State | Verification Tier |
|-------|-------|-------------|-------------------|
| Integration tests | 4 | **Healthy** (or Degraded if §11 skips remain) | **Trusted-Local** |
| Route handler (`modal-data`) | 1 | **Healthy** | **Trusted-Local** |

---

## 7. Out of Scope

- **Hooks/components/store** (4 files) — UI-layer tests that legitimately need jsdom. Separate remediation track.
- **Other bounded contexts** (loyalty, visit, table-context, etc.) — adopt the pattern when they roll.
- **Promotion to Required** (CI + branch protection) — per §7, a separate gate with its own criteria.
- **Shared test helpers** — fixtures stay file-local per casino exemplar precedent.
- **`rating-slip-rpc-contract.int.test.ts`** — already passes (112 tests), not touched.
