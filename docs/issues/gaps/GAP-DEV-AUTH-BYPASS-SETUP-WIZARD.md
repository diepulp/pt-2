# GAP-DEV-AUTH-BYPASS-SETUP-WIZARD

## Dev Auth Bypass Does Not Cover /start Gateway or /setup Wizard

**Status**: Open
**Created**: 2026-02-12
**Category**: Developer Experience / Debugging
**Severity**: LOW (no security or production impact)
**Discovered By**: PRD-030 setup wizard investigation
**Related**: PRD-030, ADR-030 (AUTH-HARDENING v0.1)
**Estimated Effort**: ~2 hours (LOW-MEDIUM complexity)

---

## Problem Statement

The existing dev auth bypass (`ENABLE_DEV_AUTH=true`) only covers dashboard routes (`/pit`, `/compliance`). The `/start` gateway and `/setup` wizard are **not wired into the bypass**, making it impossible to land directly on the wizard for debugging without a full signup/login flow.

This creates friction when iterating on the PRD-030 setup wizard, which requires:
1. A signed-in user with a bound casino
2. A casino with `setup_status != 'ready'`
3. Navigation through `/start` gateway (which checks auth + setup status)

### Current Bypass Coverage

| Route | Bypass Wired? | Notes |
|-------|---------------|-------|
| `/pit` | Yes | `app/(dashboard)/pit/page.tsx` — uses `isDevAuthBypassEnabled()` |
| `/compliance` | Yes | `app/(dashboard)/compliance/page.tsx` — same pattern |
| `/start` | **No** | Gateway requires real auth session |
| `/setup` | **No** | Wizard requires real auth + `setup_status` check |
| `/bootstrap` | **No** | Onboarding requires real auth |

### Secondary Issue: Mock Role Mismatch

The dev bypass mock context uses `pit_boss` role:

```typescript
// lib/supabase/dev-context.ts
DEV_RLS_CONTEXT = {
  staffRole: 'pit_boss',  // PRD-030 wizard requires 'admin'
};
```

PRD-030 server actions enforce `staff_role === 'admin'` in middleware. Even if the bypass were extended to `/setup`, wizard actions would fail with `FORBIDDEN` using the current mock context.

---

## Impact

- **No production impact** — bypass is development-only, gated by `NODE_ENV=development` + `ENABLE_DEV_AUTH=true`
- **Developer friction** — debugging the 5-step wizard requires full auth round-trip every session
- **E2E test fixtures** work around this via `rpc_bootstrap_casino` + real Supabase auth, but manual browser debugging has no shortcut

---

## Proposed Resolution: Standalone Dev Wizard Route

**Recommended approach**: Create an isolated `/dev/setup` route that clones the wizard UI with stubbed server actions — no RLS, no auth, pure config logic.

### Effort Assessment

**Total: ~2 hours | Complexity: LOW-MEDIUM | Blockers: NONE**

### Reusable As-Is (zero changes needed)

| Category | Files | LOC | Notes |
|----------|-------|-----|-------|
| Step components (5) | `step-casino-basics`, `step-game-seed`, `step-create-tables`, `step-par-targets`, `step-review-complete` | ~450 | Pure presentational, zero server deps |
| UI components (4) | `wizard-stepper`, `bank-mode-selector`, `table-row-form`, `par-entry-row` | ~290 | shadcn/ui only, no auth awareness |
| Zod schemas | Import from `services/casino/schemas.ts` + `services/table-context/schemas.ts` | 0 | Already exist, import only |

### New Artifacts to Create

| Artifact | Work | Time |
|----------|------|------|
| `app/dev/setup/page.tsx` — dev page with mock prefetch data | Server component shell | ~20 min |
| `app/dev/setup/layout.tsx` — dev layout | Minimal wrapper | ~5 min |
| `app/dev/setup/_dev-actions.ts` — 5 stubbed server actions | Replace RPC/DB calls with mock returns, keep Zod validation | ~40 min |
| `app/dev/setup/setup-wizard-dev.tsx` — copy of wizard + swap imports | Point at dev actions | ~10 min |
| Mock data factory | UUIDs + timestamps matching `Database` row types | ~10 min |
| Copy UI components + steps into dev namespace | Direct copy, no edits | ~10 min |
| Manual smoke test (all 5 steps) | Verify nav + no errors | ~15 min |

### Stubbed Actions Detail

Each of the 5 server actions needs stubbing:

| Action | Real Behavior | Stub Behavior |
|--------|--------------|---------------|
| `completeSetupAction` | RPC `rpc_complete_casino_setup` | Return mock `{ ok, casino_id, setup_status, setup_completed_at, setup_completed_by }` |
| `updateCasinoSettingsAction` | `.from('casino_settings').update()` | Parse FormData, validate with Zod, return mock `CasinoSettingsRow` |
| `seedGameSettingsAction` | RPC `rpc_seed_game_settings_defaults` + count query | Return mock `{ seeded_count: 6 }` |
| `createGamingTableAction` | `.from('gaming_table').upsert()` | Validate input, return mock `GamingTableRow` with generated UUID |
| `updateTableParAction` | `.from('gaming_table').update()` | Validate input, return mock `{ id, par_total_cents }` |

### Prerequisites

1. **Role fix**: `DEV_RLS_CONTEXT.staffRole` must be `'admin'` (currently `'pit_boss'`) — 1-line change in `lib/supabase/dev-context.ts`, or create separate `DEV_ADMIN_CONTEXT`
2. **Env**: `ENABLE_DEV_AUTH=true` in `.env.local`

### Gotchas Checklist

- [ ] Stubbed return types must exactly match `Database` row shapes (TypeScript enforces)
- [ ] `FormData` parsing in `updateCasinoSettingsAction` must handle undefined values
- [ ] Both RPCs must be stubbed — they fail without real auth context
- [ ] No `console.*` in stubs (project guardrail)
- [ ] UUID generation via `crypto.randomUUID()`
- [ ] Timestamps as ISO 8601 strings (`new Date().toISOString()`)
- [ ] Schemas imported from services (not duplicated)

### Success Criteria

- `/dev/setup` renders Step 1 without auth errors
- Can navigate forward/backward through all 5 steps
- Form inputs update local state (no database calls)
- Mock data flows correctly between steps
- "Complete Setup" returns mock success
- No RLS/auth errors in console
- Existing `/setup` route unaffected

---

## Alternative Approaches (Not Recommended)

### Option B: Wire Bypass Into Existing Routes

Wire `isDevAuthBypassEnabled()` into `/start` and `/setup` directly. Lower effort (~30 min) but mixes dev concerns into production route code and still requires real Supabase calls.

### Option C: Client-Side Stubs Only

Replace all action handlers with local state mutations in the client. Fastest (~60 min) but doesn't test Zod validation or action return type contracts.

### Option D: Leave As-Is

Accept the friction. Use Playwright fixtures or real auth. Zero effort, ongoing friction.

---

## Files Involved

| File | Role |
|------|------|
| `lib/supabase/dev-context.ts` | Bypass gate + mock context (role = `pit_boss` — needs admin override) |
| `lib/server-actions/middleware/auth.ts` | Middleware bypass injection |
| `app/(onboarding)/setup/page.tsx` | Production wizard — reference implementation |
| `app/(onboarding)/setup/setup-wizard.tsx` | Production wizard orchestrator — copy target |
| `app/(onboarding)/setup/steps/*` | 5 step components — copy as-is |
| `app/(onboarding)/setup/components/*` | 4 UI components — copy as-is |
| `app/(onboarding)/setup/_actions.ts` | 5 server actions — stub target |
| `services/casino/schemas.ts` | Zod schemas — import only |
| `services/table-context/schemas.ts` | Zod schemas — import only |
| `app/(dashboard)/pit/page.tsx` | Reference: working bypass pattern |

---

## References

- PRD-030: Setup Wizard (EXECUTION-SPEC-PRD-030.md)
- ADR-030: Auth System Hardening (AUTH-HARDENING v0.1)
- `lib/supabase/__tests__/bypass-lockdown.test.ts` — CI guard preventing prod leakage
