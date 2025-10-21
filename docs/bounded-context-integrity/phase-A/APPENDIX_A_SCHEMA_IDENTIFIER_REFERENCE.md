# Appendix A: Schema Identifier Reference

**Generated:** 2025-10-19  
**Source:** `types/database.types.ts`  
**Parser:** `scripts/parse_schema_identifiers.ts`

## Overview

This appendix provides a complete mapping between database schema identifiers and service ownership. It serves as the canonical reference for Phase A: Schema-Service Mapping validation.

## Statistics

- **Total Tables:** 41
- **Total Views:** 6
- **Naming Conventions:**
  - snake_case: 27 (65.9%)
  - CamelCase (Quoted): 14 (34.1%)
- **Column Statistics:**
  - Largest table: `mtl_entry` (23 columns)
  - Average columns per table: 8.3

## Complete Schema Reference

### Tables (41)

| Service | Entity (Matrix) | Table (Schema) | Columns | Notes |
|---------|-----------------|----------------|---------|-------|
| TBD | TBD | `AuditLog` | 7 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `BreakAlert` | 5 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `casino` | 4 | snake_case |
| TBD | TBD | `casino_settings` | 8 | snake_case |
| TBD | TBD | `ChipCountEvent` | 6 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `company` | 2 | snake_case |
| TBD | TBD | `ComplianceAlert` | 6 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `DealerRotation` | 5 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `DropEvent` | 7 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `FillSlip` | 8 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `gamesettings` | 10 | snake_case |
| TBD | TBD | `gamingtable` | 8 | snake_case |
| TBD | TBD | `gamingtablesettings` | 7 | snake_case |
| TBD | TBD | `KeyControlLog` | 6 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `language` | 3 | snake_case |
| TBD | TBD | `loyalty_ledger` | 17 | snake_case |
| TBD | TBD | `loyalty_tier` | 3 | snake_case |
| TBD | TBD | `mtl_audit_note` | 5 | snake_case |
| TBD | TBD | `mtl_entry` | 23 | snake_case, LARGEST TABLE |
| TBD | TBD | `performance_alerts` | 11 | snake_case |
| TBD | TBD | `performance_config` | 7 | snake_case |
| TBD | TBD | `performance_metrics` | 9 | snake_case |
| TBD | TBD | `performance_thresholds` | 8 | snake_case |
| TBD | TBD | `player` | 17 | snake_case |
| TBD | TBD | `player_financial_transaction` | 16 | snake_case |
| TBD | TBD | `player_loyalty` | 8 | snake_case |
| TBD | TBD | `player_notes` | 13 | snake_case |
| TBD | TBD | `player_preferences` | 11 | snake_case |
| TBD | TBD | `player_recommendations` | 8 | snake_case |
| TBD | TBD | `playercasino` | 2 | snake_case |
| TBD | TBD | `playerlanguage` | 2 | snake_case |
| TBD | TBD | `playerReward` | 8 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `ratingslip` | 17 | snake_case |
| TBD | TBD | `Report` | 7 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `reward` | 10 | snake_case |
| TBD | TBD | `RFIDChipMovement` | 7 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `ShiftHandover` | 9 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `Staff` | 7 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `staff_permissions` | 4 | snake_case |
| TBD | TBD | `TableInventorySlip` | 9 | CamelCase, Requires quotes in SQL |
| TBD | TBD | `visit` | 7 | snake_case |

### Views (6)

| Service | Entity (Matrix) | View (Schema) | Purpose | Notes |
|---------|-----------------|---------------|---------|-------|
| TBD | TBD | `mtl_compliance_context` | MTL compliance data aggregation | snake_case |
| TBD | TBD | `mtl_daily_summary` | Daily MTL transaction summaries | snake_case |
| TBD | TBD | `mtl_entry_with_notes` | MTL entries with audit notes | snake_case |
| TBD | TBD | `mtl_patron_aggregates` | Patron transaction aggregations | snake_case |
| TBD | TBD | `mtl_performance_metrics` | MTL performance monitoring | snake_case |
| TBD | TBD | `mtl_threshold_monitor` | CTR/watchlist threshold tracking | snake_case |

## Naming Convention Observations

### Pattern Analysis

1. **CamelCase Tables (14 total)**
   - Legacy naming pattern, requires quoted identifiers in PostgreSQL
   - Examples: `AuditLog`, `BreakAlert`, `ChipCountEvent`
   - Recommendation: Future migrations should use snake_case

2. **snake_case Tables (27 total)**
   - Modern PostgreSQL convention
   - No quoting required in SQL queries
   - Examples: `casino`, `player`, `mtl_entry`
   - Preferred pattern for new tables

3. **View Naming**
   - All views use snake_case consistently
   - MTL-specific views use `mtl_` prefix pattern

### Quoted Identifier Requirements

Tables requiring quoted identifiers in SQL:
```sql
-- CamelCase tables MUST use quotes:
SELECT * FROM "AuditLog";
SELECT * FROM "BreakAlert";
SELECT * FROM "ChipCountEvent";
SELECT * FROM "ComplianceAlert";
SELECT * FROM "DealerRotation";
SELECT * FROM "DropEvent";
SELECT * FROM "FillSlip";
SELECT * FROM "KeyControlLog";
SELECT * FROM "Report";
SELECT * FROM "RFIDChipMovement";
SELECT * FROM "ShiftHandover";
SELECT * FROM "Staff";
SELECT * FROM "TableInventorySlip";
SELECT * FROM "playerReward";

-- snake_case tables do NOT require quotes:
SELECT * FROM casino;
SELECT * FROM player;
SELECT * FROM mtl_entry;
```

## Service Mapping Workflow

### Phase A: Next Steps

1. **Manual Service Assignment**
   - Review each table against Service Responsibility Matrix
   - Assign correct service owner to each entity
   - Document multi-service dependencies

2. **Validation**
   - Run `scripts/validate_matrix_schema.ts` after mapping
   - Verify no orphaned tables
   - Check for ownership conflicts

3. **Documentation Updates**
   - Update Service Responsibility Matrix with schema names
   - Add foreign key relationship mappings
   - Document cross-service data flows

## Validation Commands

```bash
# Re-generate this appendix from schema
npx tsx scripts/parse_schema_identifiers.ts

# Validate schema-matrix alignment
npx tsx scripts/validate_matrix_schema.ts

# Detect ownership conflicts
npx tsx scripts/detect_ownership_conflicts.ts
```

## Related Documentation

- **Service Responsibility Matrix:** `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Validation Tooling Spec:** `docs/patterns/MATRIX_VALIDATION_TOOLING_SPEC.md`
- **Remediation Workflow:** `docs/patterns/RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md`
- **Database Types:** `types/database.types.ts`

---

**Auto-generated by:** `scripts/parse_schema_identifiers.ts`  
**Validation data:** `.validation/schema_identifiers.json`
