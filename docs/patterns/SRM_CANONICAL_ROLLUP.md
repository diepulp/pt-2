# SRM Canonicalization Rollup

**Date:** 2025-10-21  
**Context:** Tracking execution of the SRM → Canonical next-step playbook.

## Current Status
- SRM v3.0.2 readiness checklist complete; canonical doc aligned with ADR-000.
- Baseline migration drafted (`supabase/migrations/00000000000000_baseline_srm.sql`) reflecting all canonical DDL, invariants, triggers, and the mid-session reward RPC.
- Types regeneration gate script committed (`scripts/gen_types.sh`) with failure-on-stale-types behavior.
- `supabase db reset` smoke test planned (pending execution after migration review).

## Next Steps
1. Author `supabase/seed.sql` with minimal, non-sensitive seed data to support local resets.
2. Execute `supabase db reset` against the baseline migration, capture console output, and note results in this rollup.
3. Socialize the baseline migration and gen-types workflow with service teams (link board items once PRs are ready).

## Signoff
- Architecture QA: _Pending_  
- DB Engineering: _Pending_

_Add signoff initials/date once corresponding approvals are received._
