# Root `__tests__/` Posture — Tier 3 Phase A

**Date:** 2026-04-01  
**Slice:** Tier 3 Infrastructure Surfaces (Slice 5)  
**Phase:** A — Directives, gates, posture doc

---

## File Inventory

| # | File | Type | Directive | Gate | Phase B |
|---|------|------|-----------|------|---------|
| 1 | `constraints/player-identity.test.ts` | Integration | ✅ (pre-existing) | ✅ (normalized) | Live DB required |
| 2 | `integration/player-identity.test.ts` | Integration | ✅ (pre-existing) | ✅ (normalized) | Live DB required |
| 3 | `rls/player-identity.test.ts` | Integration | ✅ (pre-existing) | ✅ (normalized) | Live DB required |
| 4 | `player-360-navigation.int.test.ts` | Integration | ✅ (added) | ✅ (added) | Navigation logic — no DB |
| 5 | `services/loyalty/promo-instruments.int.test.ts` | Integration | ✅ (added) | ✅ (normalized) | Live DB + RLS context |
| 6 | `services/table-context/finance-telemetry-bridge.int.test.ts` | Integration | ✅ (added) | ✅ (normalized) | Live DB + trigger |
| 7 | `services/table-context/shift-metrics.int.test.ts` | Integration | ✅ (added) | ✅ (normalized) | Live DB + telemetry RPCs |
| 8 | `services/table-context/table-session.int.test.ts` | Integration | ✅ (added) | ✅ (normalized) | Live DB + state machine |
| 9 | `lib/finance.test.ts` | Unit (server) | ✅ (added) | — | Mocked Supabase — CI safe |
| 10 | `slad/player-identity-ownership.test.ts` | Unit (server) | ✅ (added) | — | Module imports — CI safe |
| 11 | `services/loyalty/promo-instruments-mappers.test.ts` | Unit (server) | ✅ (added) | — | Pure mapper logic — CI safe |
| 12 | `services/loyalty/promo-instruments.test.ts` | Unit (server) | ✅ (added) | — | Mocked Supabase — CI safe |
| 13 | `components/mtl/mtl-txn-type-codes.test.ts` | Unit (server) | ✅ (added) | — | Pure logic — CI safe |
| 14 | `hooks/mtl/use-patron-daily-total.test.ts` | Unit (server) | ✅ (added) | — | Pure key factory — CI safe |
| 15 | `hooks/mtl/use-threshold-notifications.test.ts` | Unit (server) | ✅ (added) | — | Pure threshold logic — CI safe |

**Directive coverage:** 15/15 (100%)  
**Gate coverage:** 8/8 integration files (100%)

---

## Layer Health

| Layer | Count | Directive | Gate | CI Status |
|-------|-------|-----------|------|-----------|
| Unit — server-side | 7 | 7/7 ✅ | N/A | Safe |
| Unit — client-side | 0 | N/A | N/A | N/A |
| Integration | 8 | 8/8 ✅ | 8/8 ✅ | Gated (skipped unless `RUN_INTEGRATION_TESTS=true\|1`) |
| **Total** | **15** | **15/15** | — | — |

---

## Classification Notes (Files 13–15)

Files 13–15 were classified during Phase A by reading their imports:

- **`components/mtl/mtl-txn-type-codes.test.ts`** — imports only from `@/components/mtl/mtl-txn-type-codes`. No React, no `renderHook`, no `@testing-library`. Tests pure constant/function logic. → **server-side (node)**
- **`hooks/mtl/use-patron-daily-total.test.ts`** — imports `patronDailyTotalKey` (key factory) and `mtlKeys`. No hook rendering. Tests pure array construction. → **server-side (node)**
- **`hooks/mtl/use-threshold-notifications.test.ts`** — imports `checkThreshold`, `checkCumulativeThreshold` (pure functions). No hook rendering. Tests financial threshold boundary logic. → **server-side (node)**

---

## Subdirectory Organization

```
__tests__/
├── constraints/          # DB constraint tests (integration, ADR-022)
├── integration/          # Full service integration tests (ADR-022)
├── rls/                  # RLS policy tests (ADR-022)
├── services/
│   ├── loyalty/          # Promo instruments (unit + integration)
│   └── table-context/    # Table session, shift metrics, finance bridge (integration)
├── slad/                 # SLAD compliance / bounded context ownership (unit)
├── components/mtl/       # MTL component logic (unit)
├── hooks/mtl/            # MTL hook logic — pure functions (unit)
└── lib/                  # Core library tests (unit)
```

**Naming conventions observed:**
- `*.int.test.ts` — integration tests (gated)
- `*.test.ts` — unit tests or integration without `.int.` suffix (files 1-3 use dir-based naming)

**Gap:** Files 1-3 use directory-based naming (`constraints/`, `integration/`, `rls/`) rather than the `.int.test.ts` suffix convention. This is a cosmetic inconsistency; both conventions are correct.

---

## Phase B Assessment (Integration Files)

| File | Phase B Work | Complexity |
|------|-------------|------------|
| `constraints/player-identity.test.ts` | Supabase local required, no code changes | Low |
| `integration/player-identity.test.ts` | Supabase local required, no code changes | Low |
| `rls/player-identity.test.ts` | Supabase local + service role key, no code changes | Low |
| `player-360-navigation.int.test.ts` | Pure navigation logic — **no DB required**. Gate may be removable; tests pass in CI. | Low — consider promoting to unit |
| `services/loyalty/promo-instruments.int.test.ts` | Supabase local + promo_program/promo_coupon tables + RLS context injection | Medium |
| `services/table-context/finance-telemetry-bridge.int.test.ts` | Requires custom migration triggers; not in standard schema | High |
| `services/table-context/shift-metrics.int.test.ts` | Requires table_buyin_telemetry + metrics RPCs | Medium |
| `services/table-context/table-session.int.test.ts` | Requires table_session + RPC state machine | Medium |

---

## Known Issues

1. **`player-360-navigation.int.test.ts` — mislabeled as integration**: The file is named `.int.test.ts` but contains no database calls. All tests operate on pure URL manipulation logic. Phase B should evaluate removing the integration gate and running these in CI.

2. **Gate form heterogeneity (pre-Phase A)**: Files 1-3 used truthy check (`process.env.RUN_INTEGRATION_TESTS ? describe : describe.skip`) while files 5-8 used strict equality (`=== 'true'`). Both normalized to canonical `=== 'true' || === '1'` form in Phase A.

3. **`components/mtl/` and `hooks/mtl/` in `__tests__/`**: These test pure logic from component/hook files but have no jsdom dependency. They correctly receive the node environment. If they ever add React testing, the directive must be removed.

4. **No client-side test surface in `__tests__/`**: All 15 files are server-side. React component integration tests (if any) live elsewhere (co-located `__tests__` or `*.test.tsx` at component level).
