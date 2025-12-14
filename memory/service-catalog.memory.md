# Service Catalog Snapshot (SRM v3.0.2)
last_updated: 2025-12-13
canonical_source: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
detailed_context: context/architecture.context.md
implementation_status: "10/13 services implemented (76.9%)"

## 10 Bounded Contexts (Quick Index)

**Foundational**: CasinoService (casino, casino_settings, staff, report) ✅ Implemented
**Identity**: PlayerService (player profile & documents) ✅ Implemented
**Session**: VisitService (visit lifecycle: check-in/out) ✅ Implemented
**Telemetry**: RatingSlipService (gameplay measurement) ✅ Implemented
**Reward**: LoyaltyService (points engine, ledger) 🔄 Partial (~90%)
**Finance**: PlayerFinancialService (transaction ledger, append-only) ✅ Implemented
**Compliance**: MTLService (immutable cash log, AML/CTR) 🔄 Partial (Read-Only)
**Operational**: TableContextService (tables, dealers, fills/drops, chip custody) ✅ Implemented
**Operational**: FloorLayoutService (design/version/activation of pits & table placements)  


## Key Ownership Patterns

- **Casino OWNS casino_settings** (exclusive write, temporal authority)
- **MTL REFERENCES casino_settings** (read-only via trigger)
- **Financial data** → PlayerFinancialService (NOT rating_slip)
- **Floor design** → FloorLayoutService (TableContext only handles live telemetry & chip custody)
- **Loyalty points** → LoyaltyService (NOT rating_slip)
- **All services** enforce `casino_id` scoping (RLS tenancy)

## When to Reference Full Details

- **Service ownership questions**: Read docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
- **Architecture patterns**: Read context/architecture.context.md
- **Bounded context rules**: Read ADR-000 (matrix-as-contract)
