# Service Catalog Snapshot (SRM v3.0.2)
last_updated: 2025-11-03
canonical_source: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
detailed_context: context/architecture.context.md

## 10 Bounded Contexts (Quick Index)

**Foundational**: CasinoService (casino, casino_settings, staff, report)  
**Identity**: PlayerService (player profile & documents)  
**Session**: VisitService (visit lifecycle: check-in/out)  
**Telemetry**: RatingSlipService (gameplay measurement)  
**Reward**: LoyaltyService (points engine, ledger)  
**Finance**: PlayerFinancialService (transaction ledger, append-only)  
**Compliance**: MTLService (immutable cash log, AML/CTR)  
**Operational**: TableContextService (tables, dealers, fills/drops, chip custody; consumes layout activations)  
**Operational**: FloorLayoutService (design/version/activation of pits & table placements; emits layout events)  
**Observability**: PerformanceService (metrics, alerts, read-only)

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
