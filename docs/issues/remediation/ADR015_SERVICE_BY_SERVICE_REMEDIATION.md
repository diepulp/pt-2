# ADR-015 Service-by-Service Remediation Plan

**Purpose**: Apply ADR-015 hybrid RLS patterns iteratively per service to avoid breaking the service layer. Prioritize PlayerFinancialService, then proceed domain by domain.

**Scope**: Supabase migrations only (no schema changes). Rewrite RLS policies to Pattern C (hybrid `current_setting` + JWT app_metadata fallback) with `auth.uid() IS NOT NULL` guards and existing role/append-only semantics preserved.

---

## Canonical Pattern (ADR-015 Pattern C)

```sql
-- Casino scope
casino_id = COALESCE(
  NULLIF(current_setting('app.casino_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
)

-- Actor identity
id = COALESCE(
  NULLIF(current_setting('app.actor_id', true), '')::uuid,
  (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
)

-- Staff role
COALESCE(
  NULLIF(current_setting('app.staff_role', true), ''),
  (auth.jwt() -> 'app_metadata' ->> 'staff_role')
)
```

**Guards**: All policies must include `auth.uid() IS NOT NULL`. Keep append-only/no-delete rules where they exist today. Do not introduce new write surfaces.

---

## Iteration Plan

1) **PlayerFinancialService (first)**
   - Tables: `player_financial_transaction`
   - Migration: `YYYYMMDDHHMMSS_adr015_finance_rls_hybrid.sql`
   - Actions:
     - Drop/recreate policies with Pattern C for casino_id and actor/role.
     - Preserve append-only (no updates/deletes) and existing role gates (`cashier`, `admin`).
   - Template:
     ```sql
     BEGIN;
     DROP POLICY IF EXISTS player_financial_transaction_select_same_casino ON player_financial_transaction;
     DROP POLICY IF EXISTS player_financial_transaction_insert_cashier ON player_financial_transaction;
     DROP POLICY IF EXISTS player_financial_transaction_update_admin ON player_financial_transaction;
     DROP POLICY IF EXISTS player_financial_transaction_no_deletes ON player_financial_transaction;

     CREATE POLICY player_financial_transaction_select_same_casino
       ON player_financial_transaction
       FOR SELECT USING (
         auth.uid() IS NOT NULL
         AND casino_id = COALESCE(
           NULLIF(current_setting('app.casino_id', true), '')::uuid,
           (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
         )
       );

     CREATE POLICY player_financial_transaction_insert_cashier
       ON player_financial_transaction
       FOR INSERT WITH CHECK (
         auth.uid() IN (
           SELECT user_id FROM staff
           WHERE id = COALESCE(
             NULLIF(current_setting('app.actor_id', true), '')::uuid,
             (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
           )
           AND role IN ('cashier', 'admin')
           AND status = 'active'
           AND casino_id = COALESCE(
             NULLIF(current_setting('app.casino_id', true), '')::uuid,
             (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
           )
         )
         AND casino_id = COALESCE(
           NULLIF(current_setting('app.casino_id', true), '')::uuid,
           (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
         )
       );

     CREATE POLICY player_financial_transaction_no_updates
       ON player_financial_transaction
       FOR UPDATE USING (false);

     CREATE POLICY player_financial_transaction_no_deletes
       ON player_financial_transaction
       FOR DELETE USING (false);
     COMMIT;
     ```

2) **MTL/Compliance**
   - Tables: `mtl_entry`, `mtl_audit_note`
   - Actions: Apply Pattern C for casino_id, actor_id, staff_role; keep append-only and compliance/cashier role gates.

3) **CasinoService (foundational)**
   - Tables: `staff`, `casino_settings`
   - Actions: Upgrade to Pattern C; ensure bootstrap/own-record logic retains `auth.uid()` guard.

4) **Player/Visit/RatingSlip/RatingSlipPause**
   - Tables: `player`, `player_casino`, `visit`, `rating_slip`, `rating_slip_pause`
   - Actions: Apply Pattern C for casino_id and role gates; keep existing role lists; ensure `auth.uid() IS NOT NULL`.

5) **Loyalty**
   - Tables: `player_loyalty`, `loyalty_ledger`
   - Actions: Pattern C for read/append; keep append-only; role gates as-is.

---

## Process Checklist per Migration

- [ ] Drop legacy policies; recreate with Pattern C (casino_id, actor_id, staff_role hybrid).
- [ ] Add `auth.uid() IS NOT NULL` guard to all policies.
- [ ] Preserve append-only/no-delete semantics.
- [ ] Keep role gates identical to current behavior (no new roles).
- [ ] Add migration header with `Reference: ADR-015` and `VERIFIED_SAFE`.
- [ ] Run `scripts/adr015-rls-scanner.sh supabase/migrations docs/issues/adr015-compliance-report.md` after each migration; confirm the target service passes.
- [ ] After applying, run `npm run db:types` if any schema changes (none expected here).

---

## Notes

- Scanner scope: `supabase/migrations` only. Known compliant migrations are already excluded.
- Service-layer compatibility: No schema changes; policy names should match existing references to avoid code changes. Use the same policy names unless a rename is intentional and reflected in service queries/tests.
- Rollout order: Finance → MTL/Compliance → Casino base → Player/Visit/Rating → Loyalty.
