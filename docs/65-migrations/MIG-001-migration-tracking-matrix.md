# MIG-001 Migration Tracking Matrix

**Status**: Active
**Owner**: Platform/Schema
**Purpose**: Track current vs target schema per table, migration history, rollout status, RLS status, and documentation alignment.

**Cross-Reference**:
- [RUN-003 Migration Runbook](../50-ops/runbooks/RUN-003-schema-migration-runbook.md) - Execution procedures
- [MIGRATION_NAMING_STANDARD](../60-release/MIGRATION_NAMING_STANDARD.md) - File naming convention
- [SEC-001 RLS Policy Matrix](../30-security/SEC-001-rls-policy-matrix.md) - RLS policy requirements

---

## Migration History

### All Migrations (Chronological)

| Migration ID | File Name | Applied Date | Description | Tables Affected | Status |
|--------------|-----------|--------------|-------------|-----------------|--------|
| 00000000000000 | baseline_srm.sql | 2025-10-01 | Baseline schema from SRM v3.0.2 | All core tables | ✅ Applied |
| 20251022003807 | fix_gaming_day_time_and_rpc.sql | 2025-10-22 | Gaming day normalization (TIME type) | casino_settings | ✅ Applied |
| 20251104002314 | add_rating_slip_status_enum.sql | 2025-11-04 | Rating slip status lifecycle enum | rating_slip | ✅ Applied |
| 20251108195341 | table_context_chip_custody.sql | 2025-11-08 | TableContext chip custody extensions | gaming_table, table_inventory_snapshot, table_fill_request, table_credit_request, table_drop_box | ✅ Applied |
| 20251108223004 | create_floor_layout_service.sql | 2025-11-08 | FloorLayout service schema | floor_layout, floor_layout_version | ✅ Applied |
| 20251109214028 | finance_loyalty_idempotency_outbox.sql | 2025-11-09 | Finance/Loyalty idempotency + outbox | player_financial_transaction, loyalty_ledger, finance_outbox, loyalty_outbox | ✅ Applied |
| 20251110224223 | staff_authentication_upgrade.sql | 2025-11-10 | Staff RLS authentication foundation | staff, casino_settings | ✅ Applied |
| 20251110231330 | dealer_role_clarification.sql | 2025-11-10 | Dealer role as non-authenticated | staff | ✅ Applied |

**Total Migrations**: 8
**Naming Compliance**: ✅ All migrations follow `YYYYMMDDHHMMSS_description.sql` pattern (except baseline)

---

## Table Migration Matrix

### Foundational Context (CasinoService)

| Table | Current State | Target State | Migration IDs | RLS Status | Notes |
|-------|---------------|--------------|---------------|------------|-------|
| casino | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Casino-level ownership |
| casino_settings | Deployed | Same | 00000000000000_baseline_srm.sql<br/>20251022003807_fix_gaming_day_time_and_rpc.sql<br/>20251110224223_staff_authentication_upgrade.sql | ⚠️ Pending | Temporal authority; gaming_day_start_time=TIME |
| staff | Deployed | Same | 00000000000000_baseline_srm.sql<br/>20251110224223_staff_authentication_upgrade.sql<br/>20251110231330_dealer_role_clarification.sql | ⚠️ Pending | staff.user_id added; dealer role clarified |
| report | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Report template storage |

### Player & Visit (Identity & Session)

| Table | Current State | Target State | Migration IDs | RLS Status | Notes |
|-------|---------------|--------------|---------------|------------|-------|
| player_casino | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Player membership per casino |
| visit | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Session tracking |

### Loyalty (Reward)

| Table | Current State | Target State | Migration IDs | RLS Status | Notes |
|-------|---------------|--------------|---------------|------------|-------|
| player_loyalty | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Loyalty balance per casino |
| loyalty_ledger | Deployed | Same | 00000000000000_baseline_srm.sql<br/>20251109214028_finance_loyalty_idempotency_outbox.sql | ⚠️ Pending | Append-only ledger; idempotency_key added |
| loyalty_outbox | Deployed | Same | 20251109214028_finance_loyalty_idempotency_outbox.sql | ⚠️ Pending | Event outbox for loyalty domain |

### Rating Slip (Telemetry)

| Table | Current State | Target State | Migration IDs | RLS Status | Notes |
|-------|---------------|--------------|---------------|------------|-------|
| rating_slip | Deployed | Same | 00000000000000_baseline_srm.sql<br/>20251104002314_add_rating_slip_status_enum.sql | ⚠️ Pending | Status lifecycle enum (open/paused/closed/archived) |

### Table Context (Operational)

| Table | Current State | Target State | Migration IDs | RLS Status | Notes |
|-------|---------------|--------------|---------------|------------|-------|
| game_settings | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Game-specific configuration |
| gaming_table | Deployed | Same | 00000000000000_baseline_srm.sql<br/>20251108195341_table_context_chip_custody.sql | ⚠️ Pending | Table entity + custody extensions |
| gaming_table_settings | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Table-specific settings |
| dealer_rotation | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Dealer scheduling |
| table_inventory_snapshot | Deployed | Same | 20251108195341_table_context_chip_custody.sql | ⚠️ Pending | Chip inventory snapshots |
| table_fill_request | Deployed | Same | 20251108195341_table_context_chip_custody.sql | ⚠️ Pending | Chip fill tracking |
| table_credit_request | Deployed | Same | 20251108195341_table_context_chip_custody.sql | ⚠️ Pending | Chip credit tracking |
| table_drop_box | Deployed | Same | 20251108195341_table_context_chip_custody.sql | ⚠️ Pending | Drop box custody |

### Finance (Financial)

| Table | Current State | Target State | Migration IDs | RLS Status | Notes |
|-------|---------------|--------------|---------------|------------|-------|
| player_financial_transaction | Deployed | Same | 00000000000000_baseline_srm.sql<br/>20251109214028_finance_loyalty_idempotency_outbox.sql | ⚠️ Pending | Append-only ledger; idempotency_key added |
| finance_outbox | Deployed | Same | 20251109214028_finance_loyalty_idempotency_outbox.sql | ⚠️ Pending | Event outbox for finance domain |

### MTL (Compliance)

| Table | Current State | Target State | Migration IDs | RLS Status | Notes |
|-------|---------------|--------------|---------------|------------|-------|
| mtl_entry | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Append-only cash transaction log |
| mtl_audit_note | Deployed | Same | 00000000000000_baseline_srm.sql | ⚠️ Pending | Append-only audit notes |

### Floor Layout (Spatial)

| Table | Current State | Target State | Migration IDs | RLS Status | Notes |
|-------|---------------|--------------|---------------|------------|-------|
| floor_layout | Deployed | Same | 20251108223004_create_floor_layout_service.sql | ⚠️ Pending | Floor layout designs |
| floor_layout_version | Deployed | Same | 20251108223004_create_floor_layout_service.sql | ⚠️ Pending | Layout version history |

---

## RLS Policy Deployment Status

**Foundation Ready**: ✅ Schema prepared (staff.user_id, exec_sql RPC)

**Policies Deployed**: ⚠️ **PENDING** - No RLS policies applied yet

**Priority Order** (from SEC-001):

### Priority 1: Critical (Deploy First)
- [ ] `player_financial_transaction` - Finance ledger
- [ ] `loyalty_ledger` - Loyalty ledger
- [ ] `mtl_entry` - Compliance log
- [ ] `mtl_audit_note` - Audit notes

### Priority 2: Operational
- [ ] `visit` - Session tracking
- [ ] `rating_slip` - Telemetry
- [ ] `player_loyalty` - Balance

### Priority 3: Administrative
- [ ] `gaming_table` - Table operations
- [ ] `dealer_rotation` - Scheduling
- [ ] `floor_layout*` - Layout management
- [ ] `staff` - Staff registry
- [ ] `casino_settings` - Settings

**Next Action**: Deploy RLS policies per [SEC-001 templates](../30-security/SEC-001-rls-policy-matrix.md)

---

## Deprecations & EOL

| Item | Deprecated In | EOL Target | Migration/Plan | Notes | Status |
|------|---------------|------------|----------------|-------|--------|
| `rating_slip.points` | SRM v3.0.0 | v3.2.0 | Backfill to loyalty_ledger; remove column | Grace window: 2 releases | Planned |
| `dealer_rotation.table_string_id` | SRM v3.0.0 | v3.1.0 | Replace with FK `dealer_rotation.table_id` | Validate no legacy readers | Planned |
| Default `staff.role` value | 20251110231330 | N/A | Removed in migration; require explicit assignment | Prevent accidental dealer creation | ✅ Complete |

**Deprecation Policy**:
- Mark as deprecated with `@deprecated` comment in schema
- Add EOL date (minimum 2 release grace period)
- Create compensating migration for removal
- Update all references in codebase
- Document in SRM and relevant service docs

---

## Schema Verification Checklist

Before deploying to production:

- [ ] All migrations follow naming standard (`YYYYMMDDHHMMSS_description.sql`)
- [ ] Each migration tested with `npx supabase db reset`
- [ ] TypeScript types regenerated (`npm run db:types`)
- [ ] Schema verification test passes (`npm test -- schema.test.ts`)
- [ ] RLS policies defined for all casino-scoped tables
- [ ] Idempotency keys on append-only ledgers
- [ ] Foreign keys defined for cross-table relationships
- [ ] Enums used instead of text fields where applicable
- [ ] Timestamps use `timestamptz` (not `timestamp`)
- [ ] Gaming day calculation uses `time` type (not interval)

---

## Migration Workflow

### Creating New Migration

```bash
# 1. Generate timestamp
TIMESTAMP=$(date +"%Y%m%d%H%M%S")

# 2. Create migration file
touch supabase/migrations/${TIMESTAMP}_your_description.sql

# 3. Write migration (use template from RUN-003)
${EDITOR} supabase/migrations/${TIMESTAMP}_your_description.sql

# 4. Apply migration
npx supabase migration up

# 5. Regenerate types
npm run db:types

# 6. Update this matrix
${EDITOR} docs/65-migrations/MIG-001-migration-tracking-matrix.md
```

### Verifying Migration

```bash
# Test idempotency
npx supabase db reset

# Check schema diff
npx supabase db dump --schema public > /tmp/schema_new.sql
git diff /tmp/schema_backup.sql /tmp/schema_new.sql

# Run verification tests
npm test -- schema.test.ts

# Verify RLS policies
./scripts/verify-rls-policies.sh
```

See [RUN-003 Migration Runbook](../50-ops/runbooks/RUN-003-schema-migration-runbook.md) for detailed procedures.

---

## References

- **Migration Naming**: [MIGRATION_NAMING_STANDARD](../60-release/MIGRATION_NAMING_STANDARD.md)
- **Migration Runbook**: [RUN-003](../50-ops/runbooks/RUN-003-schema-migration-runbook.md)
- **Schema Reload**: [RUN-002](../50-ops/runbooks/RUN-002-schema-reload.md)
- **RLS Policies**: [SEC-001](../30-security/SEC-001-rls-policy-matrix.md)
- **Type Sync**: [RUN-005](../50-ops/runbooks/RUN-005-type-sync.md)
- **SRM**: [SERVICE_RESPONSIBILITY_MATRIX](../20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md)
- **Migration Directory**: `supabase/migrations/`

---

**Document Status**: Active
**Last Updated**: 2025-11-17
**Next Review**: After RLS policy deployment
