# MTL Schema Alignment Audit

> **Purpose**: Align MTL_DOMAIN_CLASSIFICATION.md conceptual model with actual PT-2 database schema
> **Date**: 2025-10-14
> **Status**: Pre-Implementation Validation
> **Migration**: 20251014000001_mtl_schema_enhancements.sql

---

## Executive Summary

The **MTL_DOMAIN_CLASSIFICATION.md** document serves as the bounded context reference for the MTL (Multiple Transaction Log) service. However, it contains **naming inconsistencies** with the actual PT-2 schema that must be aligned before implementation to avoid regressions.

This document maps conceptual names (from MTL_DOMAIN_CLASSIFICATION.md) to actual schema names (from PT-2 migrations).

---

## Table Name Alignment

| Conceptual (from doc) | Actual Schema | Status | Notes |
|----------------------|---------------|--------|-------|
| `mtl_entry` | `mtl_entry` | ✅ Match | Core transaction log |
| `casino_settings` | `casino_settings` | ✅ Match | Gaming day configuration |
| `loyalty_ledger` | `loyalty_ledger` | ✅ Match | Loyalty transaction log |
| `player_loyalty` | `player_loyalty` | ✅ Match | Player loyalty state |
| `loyalty_tier` | `loyalty_tier` | ✅ Match | Tier definitions |
| **`rating_slip`** | **`ratingslip`** | ⚠️ **Mismatch** | Doc uses underscore, schema doesn't |
| `player` | `player` | ✅ Match | Player identity |
| `visit` | `visit` | ✅ Match | Visit sessions |
| `Staff` | `"Staff"` | ⚠️ **Case Sensitive** | Quoted identifier in schema |
| `mtl_audit_note` | `mtl_audit_note` | 🆕 New Table | To be created in migration |

---

## Column Name Alignment - mtl_entry

| Conceptual (from doc) | Actual Schema | Status | Notes |
|----------------------|---------------|--------|-------|
| `id` | `id` | ✅ Match | BIGSERIAL PRIMARY KEY |
| `casino_id` | `casino_id` | ✅ Match | TEXT NOT NULL |
| `patron_id` | `patron_id` | ✅ Match | TEXT (optional, when carded) |
| `person_name` | `person_name` | ✅ Match | TEXT (for uncarded) |
| `person_last_name` | `person_last_name` | ✅ Match | TEXT |
| `person_description` | `person_description` | ✅ Match | TEXT |
| `direction` | `direction` | ✅ Match | MtlDirection ENUM |
| `area` | `area` | ✅ Match | MtlArea ENUM |
| `tender_type` | `tender_type` | ✅ Match | TenderType ENUM |
| `amount` | `amount` | ✅ Match | DECIMAL(12,2) |
| `table_number` | `table_number` | ✅ Match | TEXT |
| `location_note` | `location_note` | ✅ Match | TEXT |
| `event_time` | `event_time` | ✅ Match | TIMESTAMPTZ |
| `gaming_day` | `gaming_day` | ✅ Match | DATE (auto-calculated) |
| `recorded_by_employee_id` | `recorded_by_employee_id` | ✅ Match | UUID NOT NULL |
| `recorded_by_signature` | `recorded_by_signature` | ✅ Match | TEXT NOT NULL |
| `notes` | `notes` | ✅ Match | TEXT (legacy field) |
| `created_at` | `created_at` | ✅ Match | TIMESTAMPTZ |
| `updated_at` | `updated_at` | ✅ Match | TIMESTAMPTZ |
| **`rating_slip_id`** | 🆕 `rating_slip_id` | 🆕 New Column | UUID REFERENCES **ratingslip**(id) |
| **`session_id`** | ⚠️ **Use `rating_slip_id`** | ⚠️ Alias | Doc uses both terms interchangeably |
| **`visit_id`** | 🆕 `visit_id` | 🆕 New Column | UUID REFERENCES visit(id) |
| **`correlation_id`** | 🆕 `correlation_id` | 🆕 New Column | TEXT (distributed tracing) |
| **`idempotency_key`** | 🆕 `idempotency_key` | 🆕 New Column | TEXT UNIQUE |

---

## Column Name Alignment - loyalty_ledger (for reference)

Per Wave 2 migration (20251013000001_wave_2_schema_hardening.sql):

| Conceptual (from doc) | Actual Schema | Status | Notes |
|----------------------|---------------|--------|-------|
| `player_id` | `player_id` | ✅ Match | UUID NOT NULL |
| `rating_slip_id` | `rating_slip_id` | ✅ Match | UUID (references ratingslip) |
| `session_id` | ⚠️ **Not in schema** | ⚠️ Alias | Use `rating_slip_id` instead |
| `transaction_type` | `transaction_type` | ✅ Match | TEXT |
| `points_change` | `points_change` | ✅ Match | INTEGER |
| `staff_id` | `staff_id` | ✅ Match | TEXT (Wave 2 added) |
| `correlation_id` | `correlation_id` | ✅ Match | TEXT (Wave 2 added) |
| `balance_before` | `balance_before` | ✅ Match | INTEGER (Wave 2 added) |
| `balance_after` | `balance_after` | ✅ Match | INTEGER (Wave 2 added) |
| `tier_before` | `tier_before` | ✅ Match | TEXT (Wave 2 added) |
| `tier_after` | `tier_after` | ✅ Match | TEXT (Wave 2 added) |

---

## Critical Naming Corrections

### 1. **rating_slip vs ratingslip**

**Issue**: MTL_DOMAIN_CLASSIFICATION.md uses `rating_slip` (with underscore), but actual schema uses `ratingslip` (no underscore).

**Impact**:
- Foreign key references must use `ratingslip` table name
- View joins must use `ratingslip` alias
- Column name `rating_slip_id` is correct (FK naming convention allows underscores)

**Correct Usage**:
```sql
-- ✅ CORRECT
ALTER TABLE mtl_entry ADD COLUMN rating_slip_id UUID REFERENCES ratingslip(id);

-- ❌ WRONG (from doc)
ALTER TABLE mtl_entry ADD COLUMN rating_slip_id UUID REFERENCES rating_slip(id);
```

### 2. **session_id ambiguity**

**Issue**: MTL_DOMAIN_CLASSIFICATION.md uses `session_id` in some places, but schema uses `rating_slip_id`.

**Resolution**:
- `rating_slip_id` is the canonical column name
- `session_id` is a conceptual alias only (not an actual column)
- Both terms refer to the same concept: a gaming session tracked by RatingSlip

**Correct Usage**:
```sql
-- ✅ CORRECT
SELECT * FROM loyalty_ledger WHERE rating_slip_id = $1;

-- ❌ WRONG (column doesn't exist)
SELECT * FROM loyalty_ledger WHERE session_id = $1;
```

### 3. **Staff table case sensitivity**

**Issue**: PostgreSQL schema uses quoted identifier `"Staff"` (capital S).

**Impact**:
- All FK references must use `"Staff"` (quoted)
- Unquoted `staff` will fail

**Correct Usage**:
```sql
-- ✅ CORRECT
REFERENCES "Staff"(id)

-- ❌ WRONG
REFERENCES staff(id)
```

---

## View Name Alignment

| Conceptual (from doc) | Actual Schema | Status | Notes |
|----------------------|---------------|--------|-------|
| `mtl_patron_aggregates` | `mtl_patron_aggregates` | ✅ Match | Daily patron aggregation |
| `mtl_threshold_monitor` | `mtl_threshold_monitor` | ✅ Match | Threshold status detection |
| `mtl_daily_summary` | `mtl_daily_summary` | ✅ Match | Daily compliance summary |
| `mtl_compliance_context` | `mtl_compliance_context` | 🆕 New View | Contextual enrichment (migration) |
| `mtl_entry_with_notes` | `mtl_entry_with_notes` | 🆕 New View | Entries with audit notes (migration) |

---

## Data Type Alignment

| Conceptual (from doc) | Actual Schema | Status | Notes |
|----------------------|---------------|--------|-------|
| `UUID` | `UUID` | ✅ Match | PostgreSQL native type |
| `TEXT` | `TEXT` | ✅ Match | String fields |
| `TIMESTAMPTZ` | `TIMESTAMPTZ(6)` | ⚠️ Precision | Schema uses microsecond precision |
| `DECIMAL` | `DECIMAL(12,2)` | ✅ Match | Monetary amounts |
| `INTEGER` | `INTEGER` | ✅ Match | Point values |
| `DATE` | `DATE` | ✅ Match | Gaming day |
| `BIGSERIAL` | `BIGSERIAL` | ✅ Match | mtl_entry.id |

---

## ENUM Type Alignment

### MtlDirection
- **Doc**: `cash_in`, `cash_out`
- **Schema**: `'cash_in'`, `'cash_out'`
- **Status**: ✅ Match

### MtlArea
- **Doc**: `pit`, `cage`, `slot`, `poker`, `kiosk`, `sportsbook`, `other`
- **Schema**: `'pit'`, `'cage'`, `'slot'`, `'poker'`, `'kiosk'`, `'sportsbook'`, `'other'`
- **Status**: ✅ Match

### TenderType
- **Doc**: `cash` (default)
- **Schema**: `'cash'` (default), plus others like `'chip'`, `'check'`
- **Status**: ✅ Match

---

## Cross-Domain Reference Corrections

### Loyalty Service Integration

**Doc says** (line 57-64):
```
Reads: From loyalty_ledger:
  - player_id
  - rating_slip_id / session_id  ← INCONSISTENCY
  - transaction_type
  ...
```

**Actual Schema**:
- Use `rating_slip_id` column only (no `session_id` column exists)
- Both `loyalty_ledger` and `mtl_entry` use `rating_slip_id` for correlation

**Correct Join**:
```sql
-- ✅ CORRECT
SELECT m.*, l.*
FROM mtl_entry m
LEFT JOIN loyalty_ledger l ON l.rating_slip_id = m.rating_slip_id;

-- ❌ WRONG (column doesn't exist)
LEFT JOIN loyalty_ledger l ON l.session_id = m.session_id;
```

### RatingSlip Domain Integration

**Doc says** (line 52):
```
Reads: rating_slip.id, visit_id, gaming_table_id
```

**Actual Schema**:
- Table name: `ratingslip` (no underscore)
- Column name for FK: `rating_slip_id` (with underscore, by convention)

**Correct Reference**:
```sql
-- ✅ CORRECT
ALTER TABLE mtl_entry
  ADD COLUMN rating_slip_id UUID REFERENCES ratingslip(id);

-- ✅ CORRECT (join)
FROM mtl_entry m
LEFT JOIN ratingslip r ON m.rating_slip_id = r.id;
```

---

## Migration Validation Checklist

Before applying `20251014000001_mtl_schema_enhancements.sql`, verify:

- [ ] FK reference to `ratingslip` (not `rating_slip`)
- [ ] FK reference to `"Staff"` (quoted, capital S)
- [ ] FK reference to `visit` (lowercase, no quotes)
- [ ] Column name `rating_slip_id` (with underscore)
- [ ] No column named `session_id` (use `rating_slip_id`)
- [ ] Join syntax uses `ratingslip` table alias
- [ ] ENUM values match existing types
- [ ] TIMESTAMPTZ precision matches schema (6 digits)

---

## Implementation Guidelines

### ✅ DO

1. Use `ratingslip` as table name in FK references and joins
2. Use `rating_slip_id` as column name (FK naming convention)
3. Use `"Staff"` (quoted) for staff table references
4. Align all data types with existing schema conventions
5. Follow existing index naming patterns (`idx_<table>_<column>`)
6. Use partial indexes with `WHERE` clauses for nullable FKs

### ❌ DON'T

1. Don't use `rating_slip` as table name in SQL
2. Don't create a `session_id` column (use `rating_slip_id`)
3. Don't reference `staff` without quotes (use `"Staff"`)
4. Don't assume doc field names are exact (validate first)
5. Don't create inconsistent naming patterns

---

## Summary of Schema Changes

### Existing Tables (No Changes)
- `mtl_entry` - Add 4 new columns (rating_slip_id, visit_id, correlation_id, idempotency_key)
- `casino_settings` - No changes
- `loyalty_ledger` - No changes (reference only)
- `player_loyalty` - No changes (reference only)

### New Tables
- `mtl_audit_note` - Append-only audit notes

### New Views
- `mtl_compliance_context` - Cross-domain enrichment
- `mtl_entry_with_notes` - Entries with aggregated notes

### New Indexes
- `idx_mtl_entry_rating_slip_id` (partial)
- `idx_mtl_entry_visit_id` (partial)
- `idx_mtl_entry_correlation_id` (partial)
- `idx_mtl_entry_idempotency_unique` (unique, partial)
- `idx_mtl_audit_note_entry_id`
- `idx_mtl_audit_note_staff`

---

## References

- **Conceptual Model**: `docs/patterns/MTL_DOMAIN_CLASSIFICATION.md`
- **Actual Schema**: `supabase/migrations/20250828011313_init_corrected.sql`
- **Wave 2 Enhancements**: `supabase/migrations/20251013233420_wave_2_schema_hardening.sql`
- **MTL Migration**: `supabase/migrations/20251014134942_mtl_schema_enhancements.sql`
- **Service Matrix**: `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md` v2.1.0

---

**Document Status**: Ready for Implementation
**Next Step**: Apply migration and validate schema alignment
**Validation Script**: See "Quality Gates Verification" section in migration file
