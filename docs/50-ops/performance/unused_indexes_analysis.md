# Unused Indexes Analysis

**Created**: 2025-12-20
**Purpose**: Analysis of unused indexes identified by Supabase database linter
**File**: `/home/diepulp/projects/pt-2/docs/issues/query--perf-reccomendations.json`

## Summary

The database linter identified **23 unused indexes** that may be candidates for removal. This document provides analysis and recommendations for each index based on the PT-2 system's query patterns and architectural decisions.

## Table of Contents

1. [Overview](#overview)
2. [Unused Indexes by Table](#unused-indexes-by-table)
3. [Analysis by Domain](#analysis-by-domain)
4. [Recommendations](#recommendations)
5. [Dropping Strategy](#dropping-strategy)
6. [Monitoring Plan](#monitoring-plan)

## Overview

Total unused indexes: 23
Most affected tables: `context.sessions`, `context.session_events` (6 indexes each)
Critical domains affected: Player, Visit, MTL, Floor Layout, Loyalty Ledger

## Unused Indexes by Table

### context.sessions (Schema: context)
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `idx_sessions_user` | ❌ DROP | No user_id column in context.sessions table |
| `idx_sessions_chatmode` | ❌ DROP | Appears to be legacy from chat system |
| `idx_sessions_started_at` | ⚠️ INVESTIGATE | May be needed for session analytics |
| `idx_sessions_active` | ⚠️ INVESTIGATE | May be needed for active session queries |

### context.session_events (Schema: context)
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `idx_session_events_session` | ⚠️ INVESTIGATE | May be needed for session event correlation |
| `idx_session_events_type` | ⚠️ INVESTIGATE | May be needed for event type filtering |
| `idx_session_events_created_at` | ✅ KEEP | Likely needed for temporal queries |

### public.player
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_player_name_trgm` | ✅ KEEP | TRGM index for fuzzy name search - critical for pit operations |
| `ix_player_names_lower` | ✅ KEEP | Case-insensitive name search - critical for player identification |

### public.visit
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_visit_by_casino_date` | ✅ KEEP | Essential for casino-specific visit analytics and reporting |
| `ix_visit_by_kind` | ✅ KEEP | Essential for visit categorization (player vs companion) |

### public.rating_slip
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `idx_rating_slip_table_seat_status` | ✅ KEEP | Critical composite index for table/seat/status lookups |

### public.loyalty_ledger
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_loyalty_ledger_player_time` | ✅ KEEP | Time-series index - essential for loyalty trend analysis |
| `ix_loyalty_ledger_rating_slip` | ✅ KEEP | Correlation index for bonus/comp tracking |
| `ix_loyalty_ledger_pagination` | ✅ KEEP | Pagination index for large loyalty ledgers |

### public.player_financial_transaction
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_fin_txn_player_time` | ✅ KEEP | Financial audit trail - regulatory compliance requirement |

### public.mtl_entry
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_mtl_casino_time` | ✅ KEEP | Multi-table MTL queries - needed for pit operations |

### public.floor_layout
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_floor_layout_casino` | ✅ KEEP | Casino-specific layout queries - needed for floor management |

### public.floor_layout_version
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_floor_layout_version_layout` | ✅ KEEP | Version history queries - needed for layout tracking |

### public.floor_pit
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_floor_pit_layout` | ✅ KEEP | Pit-to-layout correlation - needed for floor arrangement |

### public.floor_table_slot
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_floor_table_slot_layout` | ✅ KEEP | Table slot layout queries - needed for table positioning |

### public.floor_layout_activation
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_floor_layout_activation_casino` | ✅ KEEP | Casino-specific activation queries - needed for floor ops |

### public.finance_outbox
| Index Name | Should Keep? | Reasoning |
|------------|--------------|-----------|
| `ix_finance_outbox_unprocessed` | ✅ KEEP | Outbox pattern implementation - needed for event processing |

## Analysis by Domain

### Core Pit Operations (CRITICAL - KEEP ALL)
- **player**: Name search indexes are essential for player identification
- **visit**: Analytics indexes support reporting and player tracking
- **rating_slip**: Table/seat/status index is core to pit operations
- **mtl_entry**: Multi-table lookup index supports MTL workflows

### Floor Management (CRITICAL - KEEP ALL)
- **floor_layout** variants: All indexes support floor arrangement queries
- **floor_pit**: Layout correlation index needed for pit management
- **floor_table_slot**: Table positioning index supports slot assignments

### Financial & Loyalty (CRITICAL - KEEP ALL)
- **loyalty_ledger**: All three indexes support financial auditing
- **player_financial_transaction**: Financial audit trail compliance
- **finance_outbox**: Event processing index for reliable delivery

### Context/Session (INVESTIGATE)
- **context.session** tables: Investigate production query patterns before dropping

## Recommendations

### Immediate Actions (Phase 1)

1. **INVESTIGATE FIRST** (Before migration):
   ```sql
   -- Check recent query patterns on context tables
   SELECT query, calls, total_time, mean_time
   FROM pg_stat_statements
   WHERE query LIKE '%context.sessions%'
      OR query LIKE '%context.session_events%'
   ORDER BY calls DESC;
   ```

2. **Safe to Drop** (After investigation confirms no usage):
   - All `context.sessions` indexes except `idx_sessions_started_at`
   - All `context.session_events` indexes except `idx_session_events_created_at`

### Keep Indexes (DO NOT DROP)

All indexes in `public` schema should be RETAINED because:

1. **Regulatory Compliance**: Financial and audit indexes may be required
2. **Operational Requirements**: Pit operations depend on player/visit indexes
3. **Future-Proofing**: Unused now doesn't mean unused in upcoming features
4. **Low Storage Impact**: Most indexes are small relative to data size

## Dropping Strategy

### Phase 1: Context Schema Only (Low Risk)
```sql
-- Only after confirming no production usage
BEGIN;
DROP INDEX CONCURRENTLY IF EXISTS context.idx_sessions_user;
DROP INDEX CONCURRENTLY IF EXISTS context.idx_sessions_chatmode;
DROP INDEX CONCURRENTLY IF EXISTS context.idx_session_events_session;
DROP INDEX CONCURRENTLY IF EXISTS context.idx_session_events_type;
COMMIT;
```

### Phase 2: Monitor & Review (3 months)
- Monitor query performance on remaining tables
- Review monthly if any "unused" indexes become used
- Document rational for keeping operational indexes

### Maintenance Script
```sql
-- Monthly check for index usage changes
SELECT
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexname LIKE 'ix_%'
   OR indexname LIKE 'idx_%'
ORDER BY schemaname, tablename, indexname;
```

## Monitoring Plan

### Pre-Migration Metrics
- [ ] Capture current index sizes: `pg_size_pretty(pg_indexes_size('table_name'))`
- [ ] Document baseline query performance
- [ ] Identify slow queries that might use these indexes

### Post-Migration Monitoring
- [ ] Weekly index usage statistics
- [ ] Monthly review of dropped index impact
- [ ] Quarterly performance baseline comparison

### Alert Thresholds
- Query execution time increase >15% on affected tables
- Full table scan count increase >20% on indexed columns
- User-reported performance degradation in pit operations

## Conclusion

**Recommendation**: Only drop the 4 identified `context` schema indexes after confirming zero production usage. All `public` schema indexes should be retained as they support critical casino operations, regulatory requirements, and future system capabilities.

**Next Steps**:
1. Investigate context schema usage patterns
2. Create monitoring for index utilization
3. Implement quarterly index review process
4. Document operational requirements for each index category

---

**Document Status**: ANALYSIS COMPLETE
**Review Date**: Quarterly (Next: 2026-03-20)
**Owner**: Database Performance Team