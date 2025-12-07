- PT-2 is a Next.js 15 App Router project backed by Supabase/Postgres that implements casino/staff/player domain workflows documented under docs/.
- Architecture leans on domain services in `services/` (per SERVICE_TEMPLATE) consumed by Route Handlers and Server Actions plus extensive docs tooling for pattern audits.
- Repo structure highlights: `app/` (UI + API routes), `components/`, `services/` (bounded contexts), `lib/` (client helpers), `docs/` (architecture specs), `supabase/` (database config), `scripts/` (schema + audit tooling), plus Cypress/Jest configurations for testing.

## MVP Progress (2025-12-07)
- **Phase 0 (GATE-0)**: COMPLETE - Horizontal infrastructure (withServerAction, ServiceResult, error taxonomy)
- **Phase 1 (GATE-1)**: COMPLETE - CasinoService, PlayerService, VisitService (all Pattern B)
- **Phase 2 (GATE-2)**: SERVICES COMPLETE, UI PENDING
  - TableContextService (PRD-007, Pattern A) - 2025-12-07: 34 files, 62 tests
  - RatingSlipService (PRD-002, Pattern B) - 2025-12-05: 12 workstreams
  - Pit Dashboard UI (PRD-006) - NOT STARTED (GATE-2 blocker)
- **Phase 3 (GATE-3)**: PARTIAL - Routes exist, service factories incomplete

## Implemented Services
| Service | Pattern | Status | Key Files |
|---------|---------|--------|-----------|
| CasinoService | B | ✅ | services/casino/ |
| PlayerService | B | ✅ | services/player/ |
| VisitService | B | ✅ | services/visit/ |
| TableContextService | A | ✅ | services/table-context/ |
| RatingSlipService | B | ✅ | services/rating-slip/ |

## Next Priority
Execute PRD-006 Pit Dashboard UI to complete GATE-2