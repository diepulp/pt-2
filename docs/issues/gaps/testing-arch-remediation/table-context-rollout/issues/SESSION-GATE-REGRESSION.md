# SESSION-GATE-REGRESSION: rpc_start_rating_slip lost PRD-059 session gate

**Status:** OPEN
**Severity:** P1 (functional regression)
**Discovered:** 2026-04-01 during Mode C auth rewrite
**Affected test:** `rpc-open-table-session.int.test.ts` AC-3

## Summary

Migration `20260329173121_add_exclusion_enforcement_to_slip_rpcs.sql` re-created
`rpc_start_rating_slip` WITHOUT the PRD-059 session gate (`NO_ACTIVE_SESSION`
check for `status IN ('ACTIVE', 'RUNDOWN')`).

The PRD-059 migration (`20260326020531_prd059_open_custody_rpcs.sql`) correctly
added the session gate, but the later exclusion enforcement migration was based
on an older version of the function and overwrote it.

## Impact

- `rpc_start_rating_slip` no longer rejects when the table session is in OPEN
  status (P0007)
- Players can be seated at tables that haven't completed the custody gate
  (attestation workflow)
- AC-3 test in `rpc-open-table-session.int.test.ts` fails

## Evidence

Current function in DB (from schema dump):
```
COMMENT ON FUNCTION rpc_start_rating_slip(...) IS
  'ADR-024: ... GAP-EXCL-ENFORCE-001: exclusion guard (hard_block rejected). v2: ...'
```

Missing session gate code (should be present from PRD-059):
```sql
IF NOT EXISTS (
  SELECT 1 FROM table_session
  WHERE gaming_table_id = p_table_id
    AND casino_id = v_casino_id
    AND status IN ('ACTIVE', 'RUNDOWN')
) THEN
  RAISE EXCEPTION 'NO_ACTIVE_SESSION'
    USING ERRCODE = 'P0007',
          HINT = 'Table has no active session...';
END IF;
```

## Root Cause

Migration `20260329173121` used `CREATE OR REPLACE FUNCTION` based on the
pre-PRD-059 version of `rpc_start_rating_slip`, losing the session gate.

## Fix Required

Re-apply the session gate check to `rpc_start_rating_slip` via a new migration
that merges both the exclusion enforcement guard AND the PRD-059 session gate.

## Related

- PRD-059: Open Table Custody Gate
- GAP-EXCL-ENFORCE-001: Exclusion Enforcement
- `20260326020531_prd059_open_custody_rpcs.sql` (added session gate)
- `20260329173121_add_exclusion_enforcement_to_slip_rpcs.sql` (lost session gate)
