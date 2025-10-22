# SRM Canonicalization Rollup

**Date:** 2025-10-21  
**Context:** Tracking execution of the SRM → Canonical next-step playbook.

## Current Status
- SRM v3.0.2 readiness checklist complete; canonical doc aligned with ADR-000.
- Baseline migration drafted (`supabase/migrations/00000000000000_baseline_srm.sql`) reflecting all canonical DDL, invariants, triggers, and the mid-session reward RPC.
- Foundational tables (`audit_log`, `report`) reintroduced in both SRM and baseline migration per contract scope.
- Types regeneration gate script committed (`scripts/gen_types.sh`) with failure-on-stale-types behavior.
- Minimal seed data added (`supabase/seed.sql`) for local resets, including rating slip, finance transaction, and MTL compliance artifacts.
- Finance write path documented and implemented via `rpc_create_financial_txn`; gaming day boundary stored as `time` for consistent types.
- `supabase db reset` executed successfully against baseline migration (see log below).

### supabase db reset log
```
Resetting local database...
Recreating database...
Initialising schema...
v2.56.0: Pulling from supabase/realtime
5c32499ab806: Already exists 
9409797f19ec: Pull complete 
1c35ebcb84f3: Pull complete 
04b22d10758f: Pull complete 
598c350b29b9: Pull complete 
5092dc76fa9c: Pull complete 
5e97b7bcb54f: Pull complete 
4f4fb700ef54: Pull complete 
Digest: sha256:f2dd4e0fb525edf9c5b00af85f1a7a7b7c22674b83783714ee25136577bde76f
Status: Downloaded newer image for public.ecr.aws/supabase/realtime:v2.56.0
Seeding globals from roles.sql...
Skipping migration MIGRATION_FIXES.md... (file name must match pattern "<timestamp>_name.sql")
Skipping migration README.md... (file name must match pattern "<timestamp>_name.sql")
Applying migration 00000000000000_baseline_srm.sql...
NOTICE (42710): extension "pgcrypto" already exists, skipping
WARN: no files matched pattern: supabase/seed.sql
Restarting containers...
Finished supabase db reset on branch ref/srm-patch.
```

## Next Steps
1. Re-run `supabase db reset` to confirm updated seed file is applied (now that `supabase/seed.sql` includes rating slip, finance, MTL entry, and audit note artifacts).
2. Regenerate types after docker access (audit_log/report + finance/MTL updates).
3. Socialize the baseline migration and gen-types workflow with service teams (link board items once PRs are ready).
4. Gather Architecture QA and DB Engineering signoffs once teams review the baseline.

## Signoff
- Architecture QA: _Pending_  
- DB Engineering: _Pending_

_Add signoff initials/date once corresponding approvals are received._
