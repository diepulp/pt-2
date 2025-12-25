# ADR-022 v7 Security Audit Summary

**Date:** 2025-12-23
**Auditors:** 7-Agent Security Audit Panel (RLS specialists, backend architects)
**Target:** ADR-022_Player_Identity_Enrollment_ARCH_v7.md
**Result:** All suggestions investigated; 7/7 accepted with modifications

---

## Executive Summary

A comprehensive security audit was conducted on ADR-022 v7 using 7 specialized agents running in parallel. All raised concerns were validated and appropriate fixes have been applied to create ADR-022 v7.1.

---

## Audit Findings

### HIGH Priority Issues

| # | Issue | Agent Decision | Implementation |
|---|-------|----------------|----------------|
| **1** | Actor binding vulnerability | **ACCEPT** | Added WITH CHECK constraints binding `created_by`/`enrolled_by`/`verified_by` to `app.actor_id` (INV-9) |
| **2** | Document number plaintext storage | **MODIFY** | Replaced `document_number` with `document_number_hash` + `document_number_last4` |
| **3** | Key field immutability on UPDATE | **ACCEPT** | Added BEFORE UPDATE trigger enforcing immutability of `casino_id`/`player_id`/`created_by` (INV-10) |

### MEDIUM Priority Issues

| # | Issue | Agent Decision | Implementation |
|---|-------|----------------|----------------|
| **4** | Matching/dedupe weakness | **MODIFY** | Added `document_number_hash` for deduplication; `document_number_last4` as secondary match key |
| **5** | Index mismatch with query | **ACCEPT** | Replaced `ix_player_last_first` with `ix_player_enrollment_match(lower(first_name), lower(last_name), birth_date)` |
| **6** | Audit logging gaps | **ACCEPT** | Added `updated_by` column; trigger auto-populates from `app.actor_id` |

### LOW Priority Issues

| # | Issue | Agent Decision | Implementation |
|---|-------|----------------|----------------|
| **7** | Enrollment status underspecified | **ACCEPT** | Documented current behavior: inactive enrollments visible for audit trail; added re-activation workflow |

---

## Changes Applied to ADR-022 v7.1

### New Security Invariants

- **INV-9: Actor Binding** - RLS policies bind audit columns to `app.actor_id`
- **INV-10: Key Immutability** - Trigger prevents mutation of `casino_id`/`player_id`/`created_by`

### Schema Changes

```diff
- document_number text NULL
+ document_number_last4 text NULL  -- Display/verification
+ document_number_hash text NULL   -- SHA-256 for deduplication

+ updated_by uuid NULL FK → staff  -- Who last modified
```

### New Constraints

- `UNIQUE (casino_id, document_number_hash) WHERE document_number_hash IS NOT NULL`

### New Indexes

- `ix_player_enrollment_match(lower(first_name), lower(last_name), birth_date)`
- `ux_player_identity_doc_hash(casino_id, document_number_hash)`

### New Triggers

- `trg_player_identity_immutability` - Prevents key field mutation
- Updated `trg_player_identity_updated_at` - Now sets `updated_by` from context

### RLS Policy Updates

All INSERT/UPDATE policies now include actor binding:

```sql
-- INV-9: Bind created_by to current actor
AND created_by = COALESCE(
  NULLIF((select current_setting('app.actor_id', true)), '')::uuid,
  ((select auth.jwt()) -> 'app_metadata' ->> 'staff_id')::uuid
)
```

---

## Technical Debt Tracked

| Item | Priority | Trigger |
|------|----------|---------|
| Document number full encryption | High | Before first CTR |
| Player matching merge workflow | Medium | First duplicate complaint |

---

## Migration Sequence

1. `adr022_player_contact_columns.sql`
2. `adr022_player_enrollment_index.sql`
3. `adr022_player_casino_enrolled_by.sql`
4. `adr022_player_identity_mvp.sql` (includes hash storage, INV-9 policies)
5. `adr022_identity_immutability_trigger.sql` (INV-10)

---

## Acceptance Criteria Added

- [ ] `created_by`/`enrolled_by`/`verified_by` bound to `app.actor_id` (INV-9)
- [ ] Key field immutability trigger prevents mutation (INV-10)
- [ ] `document_number` stored as hash + last4 only
- [ ] Deduplication via `document_number_hash` matching

---

## Compliance Status

- **ADR-015 Pattern C:** COMPLIANT
- **SEC-001 Template 1:** COMPLIANT
- **SLAD Bounded Context:** COMPLIANT (with documented fix for enrollPlayer migration)

---

## Files Modified

- `/docs/80-adrs/ADR-022_Player_Identity_Enrollment_ARCH_v7.md` - Updated to v7.1

## Related Documents

- `/docs/audits/ADR-022-v7-AUDIT-DECISION-SUMMARY.md`
- `/docs/audits/ADR-022-v7-AUDIT-LOGGING-ASSESSMENT.md`
