Here's the full picture. Let me present the findings.

---

## Investigation: Playwright Gate & E2E Testing Posture

### What was proposed

The **Testing Governance Standard** (v2.0.0, proposed 2026-03-13) and **ADR-044** laid out a phased remediation in three EXEC-SPECs:

| Phase | EXEC-SPEC | Deliverable | Status |
|-------|-----------|-------------|--------|
| **1: Foundation** | EXEC-051 | Jest split, branch protection, CI test job (required) | **NOT EXECUTED** |
| **2: Coverage** | EXEC-052 | Hook triage, route-handler exemplar, bounded-context rollout | Blocked by 051 |
| **3: E2E/Playwright** | EXEC-053 | **Wire Playwright to CI**, integration tests in CI, Supabase-in-CI | Blocked by 051 |

EXEC-051 was designed as the **gate** — no EXEC-052 or 053 work begins until 051's exit criteria pass. It was never executed.

### What was actually delivered (PR #24, 2026-03-14)

- Jest runtime split (`jest.node.config.js`, `jest.integration.config.js`)
- Casino exemplar validated (355/355 passing)
- Advisory `test` job added to CI with `continue-on-error: true`
- 102 remaining failures documented (deferred to context rollout)

### What's missing — the gap chain

```
EXEC-051 never executed
    → Branch protection not activated (main unprotected)
    → CI test job stays advisory (continue-on-error: true)
    → EXEC-052 blocked (no route-handler exemplar, no context rollout)
    → EXEC-053 blocked (Playwright not wired to CI)
    → Exclusion feature ships with passing unit tests but broken runtime
```

### Current CI gate reality

| Gate | Runs | Blocks Merge |
|------|------|-------------|
| ESLint | Yes | Yes |
| TypeScript strict | Yes | Yes |
| Next.js build | Yes | Yes |
| Migration security gates | Yes (migration PRs) | Yes |
| **Unit tests (Jest)** | **Yes (advisory)** | **No** (`continue-on-error: true`) |
| **Integration tests** | **No** | **No** |
| **E2E tests (Playwright)** | **No** | **No** |
| **Branch protection** | **No** | **No** (direct push allowed) |

### E2E tests that DO exist (but don't run in CI)

17 Playwright spec files with 6,600+ lines covering real workflows:
- Rating slip modal, visit continuation, loyalty accrual lifecycle
- Player 360 navigation, setup wizard, shift dashboard
- Admin settings/alerts, CSV import, MTL thresholds
- Well-structured fixtures with real Supabase auth, service-role setup, cleanup

**Critically missing:** No exclusion spec. No compliance panel spec. The feature with the most complex RLS posture (session-var-only, critical table) has zero E2E coverage.

### Why the exclusion bug shipped

The exclusion PRD (PRD-052) passed through the build pipeline with:
- Unit tests: schemas, mappers, badges, hooks — all pass (they mock Supabase)
- Integration tests: `exclusion-http-contract.test.ts` — passes (mocks the full HTTP chain)
- Route handler tests: existence assertions only (theatre pattern)
- **No Playwright test** that exercises the real middleware → RLS → DB path

The unit tests verified that each layer works **in isolation**. The bug lives at the **seam** between the middleware chain (`SET LOCAL`) and the CRUD layer (separate REST request). Only an E2E test or a real-database integration test could catch this.

### What should happen next

The governance framework is sound — the problem is execution stall. The three EXEC-SPECs are ready to build. The immediate priority order:

1. **EXEC-051** (Foundation) — ~8-10h
   - Accept ADR-044, activate the Standard
   - Enable branch protection on `main` with required checks
   - Make the CI test job **required** (remove `continue-on-error`)
   - This alone would have made the advisory test job visible and forced investigation

2. **EXEC-053** (E2E in CI) — ~5-8h
   - Wire Playwright to CI with local Supabase (`supabase start` in workflow)
   - Start with critical-path smoke suite: auth → player search → compliance panel → exclusion create/lift
   - The exclusion bug would have been caught here

3. **Exclusion-specific E2E spec** (immediate) — ~3-4h
   - `e2e/workflows/player-exclusion.spec.ts`
   - Scenarios: create exclusion, verify badge, verify tile, lift exclusion, role-gating, visit enforcement
   - This is the test that proves the P0 RLS fix works

The governance docs are thorough and realistic for a solo-repo. The gap isn't in the design — it's that EXEC-051 was written but never `/build`-ed, and everything downstream stalled.