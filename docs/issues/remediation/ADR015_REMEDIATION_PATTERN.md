# ADR-015 Remediation Pattern (Scanner → Policies → RPC Hardening)

**Purpose:** Reusable steps to upgrade services to ADR-015 hybrid RLS with connection pooling safety. Derived from PlayerFinancialService remediation.

## Detection
- Run `./scripts/adr015-rls-scanner.sh supabase/migrations docs/issues/adr015-compliance-report.md`.
- Identify anti-patterns: bare `current_setting`, missing `true`, missing `auth.uid()`, JWT-only without fallback, missing actor/role hybrid.
- Scope: migrations touching the target service tables/RPCs.

## Policy Upgrade (Pattern C)
- Ensure RLS enabled on target tables.
- Drop legacy policies; recreate with:
  - `auth.uid() IS NOT NULL`.
  - `casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)`.
  - Actor/role gates use COALESCE hybrid:
    - `actor_id := COALESCE(NULLIF(current_setting('app.actor_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid)`.
    - `staff_role := COALESCE(NULLIF(current_setting('app.staff_role', true), ''), (auth.jwt() -> 'app_metadata' ->> 'staff_role'))`.
  - Preserve role lists and append-only semantics (`FOR UPDATE/DELETE USING (false)`).

## RPC Hardening
- Use `SECURITY INVOKER` to respect RLS.
- Guard: `auth.uid() IS NOT NULL`.
- Validate casino scope matches input via Pattern C COALESCE.
- Validate actor/role against `staff` (active, same casino, allowed roles) using hybrid actor/role.
- Enforce idempotency (ON CONFLICT on `(casino_id, idempotency_key)` where applicable).
- Return full row when the service expects it.
- If enums/columns might be missing, add idempotent DO block to create them and add columns.
- Order parameters: non-defaults first, defaults after (Postgres requirement).

## Apply + Verify
- Apply migrations: `npx supabase migration up` (resolve remote/local drift if needed).
- Re-run scanner to ensure the target service drops from the failure list.
- Optionally smoke service RPCs/queries; keep role gates and append-only semantics intact.

## Example (PlayerFinancialService Artifacts)
- Policies: `supabase/migrations/20251211170030_adr015_finance_rls_hybrid.sql` (select_same_casino, insert_cashier/admin, no_updates, no_deletes).
- RPC: `supabase/migrations/20251211172516_adr015_financial_rpc_hardening.sql` (Pattern C validation, cashier/admin gate, idempotent insert, full-row return, invoker).
- Scanner: finance now clean; remaining flagged files are legacy non-finance migrations.

## Usage for Remaining Services
- Apply this pattern per service: upgrade table policies to Pattern C, harden RPCs with hybrid validation + invoker, preserve existing role/append-only semantics, re-run scanner to confirm clearance.***
