# RUN-004 RLS Policy Verification (Lean)

Status: Draft — quick verification checklist. Goal: no cross-casino access; role-gated writes/joins.

Scope: casino-scoped tables (finance/loyalty/MTL/visit/rating_slip/table_context/staff/casino_settings).
Roles: admin, pit_boss, cage, compliance, dealer (zero), automation.

Prereqs:
- RLS enabled on all tables: `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;` (expect none)
- Policies exist: `SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';`
- Session context set by WRAPPER: `app.casino_id`, `app.actor_id`, `app.staff_role`.

Test matrix (per role):
- Same-casino read/write: ALLOW per role.
- Cross-casino read/write: DENY.
- Realtime join mismatch (role/casino): DENY.
- Dealer: DENY reads/writes.

Example (same-casino read allow):
```sql
BEGIN;
SET LOCAL app.casino_id = '1111...1111';
SET LOCAL app.staff_role = 'pit_boss';
SELECT COUNT(*) FROM visit WHERE casino_id = '1111...1111';
ROLLBACK;
```
Expect count >= 1 (allowed).

Example (cross-casino read deny):
```sql
BEGIN;
SET LOCAL app.casino_id = '1111...1111';
SET LOCAL app.staff_role = 'pit_boss';
SELECT COUNT(*) FROM visit WHERE casino_id = '2222...2222';
ROLLBACK;
```
Expect count = 0 (denied).

Realtime join check (pseudocode):
- Attempt channel join with mismatched casino_id or role → expect rejection.

Escalation:
- Any leakage: disable offending routes/policies, page on-call, hotfix policies, rerun tests.
