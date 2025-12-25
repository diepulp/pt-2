---
id: AUDIT-ADR022-v7-SUMMARY
title: ADR-022 v7 Audit Logging Decision Summary
date: 2025-12-23
status: RECOMMENDATION
reviewer: Backend Architect
decision: MODIFY
---

# ADR-022 v7 Audit Logging Decision Summary

## Decision: MODIFY (Add `updated_by` column)

### TL;DR

ADR-022 v7 has **good actor tracking** (created_by, verified_by, enrolled_by) but **missing `updated_by`**. Add the column for production troubleshooting. Defer full audit_log integration to post-MVP.

---

## Current State ✅❌

| Audit Feature | Status | Table | Notes |
|--------------|--------|-------|-------|
| `created_by` | ✅ Present | `player_identity` | Line 160, ADR-022 v7 |
| `verified_by` | ✅ Present | `player_identity` | Line 157, ADR-022 v7 |
| `enrolled_by` | ✅ Present | `player_casino` | Line 208, ADR-022 v7 |
| `updated_by` | ❌ **MISSING** | `player_identity` | **Gap identified** |
| `updated_at` | ✅ Present | `player_identity` | Auto-trigger (Line 181-192) |
| Audit events | ❌ Deferred | `audit_log` | Infrastructure exists, not integrated |

---

## Required Changes

### 1. Add `updated_by` Column (REQUIRED)

**Migration:** `YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql`

```sql
-- In player_identity table definition
updated_by uuid REFERENCES staff(id) ON DELETE SET NULL,

-- Index for actor queries
CREATE INDEX idx_player_identity_updated_by ON player_identity(updated_by);
```

**Service Layer:** `services/player/crud.ts`

```typescript
export async function upsertIdentity(
  supabase: SupabaseClient<Database>,
  data: PlayerIdentityDTO,
  staffId: string
): Promise<ServiceResult<PlayerIdentityDTO>> {
  const payload = {
    ...data,
    updated_by: staffId,  // Set on every update
  };
  // ... rest of implementation
}
```

### 2. Update Acceptance Criteria (REQUIRED)

**Add to ADR-022 v7 Line 786+:**

```markdown
### Audit Trail
- [ ] `player_identity` table has `updated_by uuid FK → staff` column
- [ ] Index exists: `idx_player_identity_updated_by`
- [ ] Service layer sets `updated_by` on all identity updates
- [ ] Troubleshooting runbook exists (PLAYER_IDENTITY_AUDIT_QUERIES.md)
- [ ] `audit_log` integration deferred to post-MVP (documented as tech debt)
```

### 3. Document Troubleshooting (REQUIRED)

**Create:** `docs/50-ops/runbooks/PLAYER_IDENTITY_AUDIT_QUERIES.md`

**Content:** Query patterns for common investigations:
- Who created/updated/verified this identity?
- All operations by actor in timeframe
- Recent identity updates dashboard
- Full enrollment audit trail

**Sample Query:**
```sql
SELECT
  pi.updated_at,
  u.first_name || ' ' || u.last_name as updated_by_name,
  pi.verified_at,
  v.first_name || ' ' || v.last_name as verified_by_name
FROM player_identity pi
LEFT JOIN staff u ON u.id = pi.updated_by
LEFT JOIN staff v ON v.id = pi.verified_by
WHERE pi.casino_id = :casino_id AND pi.player_id = :player_id;
```

---

## Deferred to Post-MVP ⏸️

### Audit Event Logging Integration

**Trigger Points:**
1. Before implementing `player_tax_identity` (ADR-022 v5 compliance scope)
2. Before SSN/TIN reveal RPCs
3. Before first production compliance audit

**Implementation:**
- Add `domain: 'player_identity'` to route handlers
- Middleware automatically logs to `audit_log` table
- Include field-level change tracking in `details` JSONB

**Why Defer:**
- Column-level audit (`updated_by` + timestamps) sufficient for MVP enrollment workflows
- `audit_log` integration adds complexity without proportional MVP value
- Tax identity features require full audit trail (compliance-sensitive)

---

## Troubleshooting Impact

### Before (ADR-022 v7 as written)

**Scenario:** "Player claims DOB was changed on Dec 20th"

**Investigation:**
1. Query `updated_at` → ✅ Timestamp found
2. Query `updated_by` → ❌ **Column doesn't exist**
3. Cross-reference `audit_log` by timeframe → ⚠️ May not have row-level granularity
4. **Result:** **Cannot identify actor** without manual session correlation

### After (with `updated_by`)

**Scenario:** "Player claims DOB was changed on Dec 20th"

**Investigation:**
1. Query `updated_at` → ✅ `2025-12-20 14:32:15`
2. Query `updated_by` → ✅ `staff_id = abc-123`
3. Join `staff` table → ✅ "John Smith, pit_boss, evening shift"
4. **Result:** **Actor identified in < 5 minutes**

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cannot sequence complex update chains | Medium | Defer to post-MVP `audit_log` integration |
| Missing field-level change details | Low | Column audit sufficient for MVP; defer field tracking |
| Actor deletion breaks audit trail | Medium | `ON DELETE SET NULL` preserves orphaned references |

**MVP Acceptable Risk:** Column-level audit (created_by, updated_by, verified_by) + timestamps is **80% solution** for troubleshooting enrollment workflows. Full event log required before tax compliance features.

---

## Comparison with Existing Patterns

### Similar: `player_financial_transaction`

```sql
created_by_staff_id uuid
```

**Pattern:** Actor tracking on immutable ledger (creates only, no updates).

**Difference:** `player_identity` is mutable → needs `updated_by`.

### Similar: `floor_layout`

```sql
created_by uuid not null,
reviewed_by uuid,
approved_by uuid
```

**Pattern:** Workflow-specific actor columns for state transitions.

**Difference:** `player_identity` has verification workflow (`verified_by` ✅) **plus** general updates → needs `updated_by` for non-workflow changes.

### Similar: `rating_slip_pause`

```sql
created_by uuid,
started_at timestamptz,
ended_at timestamptz
```

**Pattern:** Immutable event log (append-only).

**Difference:** `player_identity` is mutable entity, not event log.

---

## Implementation Checklist

- [ ] Add `updated_by uuid REFERENCES staff(id) ON DELETE SET NULL` to `player_identity` schema
- [ ] Add index: `CREATE INDEX idx_player_identity_updated_by ON player_identity(updated_by);`
- [ ] Update `services/player/crud.ts` to set `updated_by` on all identity updates
- [ ] Add acceptance criteria to ADR-022 v7 (Audit Trail section)
- [ ] Create troubleshooting runbook: `docs/50-ops/runbooks/PLAYER_IDENTITY_AUDIT_QUERIES.md`
- [ ] Document `audit_log` integration as post-MVP tech debt (before tax identity)
- [ ] Update migration artifact: `YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql`

---

## References

- **Full Analysis:** `/home/diepulp/projects/pt-2/docs/audits/ADR-022-v7-AUDIT-LOGGING-ASSESSMENT.md`
- **ADR-022 v7:** `/home/diepulp/projects/pt-2/docs/80-adrs/ADR-022_Player_Identity_Enrollment_ARCH_v7.md`
- **Existing Audit Middleware:** `/home/diepulp/projects/pt-2/lib/server-actions/middleware/audit.ts`
- **Audit Schema:** `supabase/migrations/00000000000000_baseline_srm.sql` (Lines 53-61)
