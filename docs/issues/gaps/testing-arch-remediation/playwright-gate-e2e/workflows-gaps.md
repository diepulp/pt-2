Report saved. Here's the summary:

## Key Findings

**14 uncovered workflows** identified across 3 tiers:

### Tier 1 — Critical Write Paths (must test real DB)
| GAP | Workflow | Priority | Why |
|-----|----------|----------|-----|
| **001** | **Player Exclusion Lifecycle** | **P0** | Active bug — session-var-only RLS + direct DML = broken |
| 002 | Table Session Lifecycle | P0 | Core ops, triggers rundown reports |
| 003 | Chip Custody (Fill/Credit/Drop) | P0 | Financial audit trail, regulatory |
| 004 | Player Enrollment | P1 | Entry point for all player workflows |
| 005 | Visit Start/End | P1 | Only continuation tested, not start/close |
| 006 | Promo Programs & Coupons | P1 | Financial instrument lifecycle |

### Tier 2 — Read-Heavy UI (validate rendering)
- Compliance dashboard, staff management, pit floor, loyalty redemption, floor layout

### Tier 3 — Edge Cases
- Auth session expiry, shift checkpoints, rundown reports

## Structural Recommendations

1. **Prioritize write-path tests** — any `supabase.from().insert()` through `withServerAction` needs E2E
2. **Critical-path smoke suite** (~5 specs, <3 min) for CI gate: auth, exclusion, rating-slip-close, visit, MTL threshold
3. **Test-per-PRD mandate** — every PRD shipping writes must include an E2E spec in its DoD
4. **CI infrastructure** — wire Supabase-in-CI + Playwright as required check (the unwritten EXEC-053)

Total gap closure effort: ~30-42 hours across all 14 gaps.