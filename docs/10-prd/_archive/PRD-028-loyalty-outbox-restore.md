---
id: PRD-028
title: Restore loyalty_outbox Table (P0 Bug Fix)
owner: Engineering
status: Proposed
affects: [ADR-033, PRD-004, SEC-001]
created: 2026-02-06
last_review: 2026-02-06
phase: Phase 3 (Rewards)
pattern: A
http_boundary: false
---

# PRD-028 — Restore loyalty_outbox Table

## 1. Overview

- **Owner:** Engineering
- **Status:** Proposed
- **Summary:** `loyalty_outbox` was dropped in migration `20251213003000` (loyalty greenfield reset) and never recreated. Three promo RPCs (`rpc_issue_promo_coupon`, `rpc_void_promo_coupon`, `rpc_replace_promo_coupon`) INSERT into this table inside their transaction. Every promo coupon operation fails at runtime with `relation "loyalty_outbox" does not exist`. This PRD restores the table so existing RPCs stop breaking.

## 2. Problem & Goals

### Problem

Migration `20251213003000` dropped `loyalty_outbox` as part of a greenfield reset of the loyalty schema. The promo instrument migration `20260106235611` — authored later — added three SECURITY DEFINER RPCs that INSERT into `loyalty_outbox`. Because the table no longer exists, all three RPCs fail:

- `rpc_issue_promo_coupon` — cannot issue coupons
- `rpc_void_promo_coupon` — cannot void coupons
- `rpc_replace_promo_coupon` — cannot replace coupons

ADR-033 identifies this as a **hard dependency** for the reward domain model's entitlement issuance flow (Flow B).

### Goals

1. Restore `loyalty_outbox` so all three promo RPCs execute without error
2. Recreate the full 8-column outbox schema; the RPCs write a 4-column subset (`casino_id`, `event_type`, `payload`, `created_at`) and the remaining columns (`id`, `ledger_id`, `processed_at`, `attempt_count`) have safe defaults or are nullable
3. Apply casino-scoped RLS for direct-read isolation and defense-in-depth (see §5 NFR-1 for SECURITY DEFINER bypass clarification)
4. Correct the SRM: mark `loyalty_outbox` as `deployed`, owned by `LoyaltyService`, subdomain `infra (event outbox)`, consumer `none`

### Non-Goals

- Outbox consumer/processor/dispatcher — no reader of these rows exists today; none is introduced
- Event-driven architecture, message queues, or Kafka integration
- New RPCs or service layer methods for outbox management
- Outbox pruning, TTL, or retention policy
- Changes to the three promo RPCs themselves — they stay as-is

## 3. Users & Use Cases

| User | Job |
|------|-----|
| Pit Boss / Floor Supervisor | Issues, voids, or replaces match play coupons via existing promo workflows |
| System (RPCs) | Appends outbox rows transactionally as side-effect audit trail |

This PRD has no direct UI surface. The fix is invisible to operators — their existing promo workflows simply stop failing.

## 4. Scope & Feature List

- Recreate `loyalty_outbox` with schema matching the promo RPC INSERT contract
- `ledger_id` column becomes **nullable** (promo events have no ledger entry; points events do)
- Enable RLS with casino-scoped Pattern C hybrid policies
- Add append-only denial policies (no UPDATE, no DELETE)
- Create partial index on `(casino_id, created_at DESC) WHERE processed_at IS NULL` — `processed_at` is the sole marker of processing state; no separate status column exists
- Update SRM to reflect actual deployment state
- Regenerate TypeScript types (`npm run db:types`)

## 5. Requirements

### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | `loyalty_outbox` table exists with 8 columns: `id` (PK, auto-generated), `casino_id` (NOT NULL), `ledger_id` (nullable — promo events omit it), `event_type` (NOT NULL), `payload` (NOT NULL), `created_at` (NOT NULL, default `now()`), `processed_at` (nullable, default NULL), `attempt_count` (NOT NULL, default 0). The three promo RPCs write a 4-column subset (`casino_id`, `event_type`, `payload`, `created_at`); the remaining columns resolve via PK default, NULL default, or integer default. |
| FR-2 | `rpc_issue_promo_coupon` executes without error and inserts an outbox row with `event_type = 'promo_coupon_issued'` |
| FR-3 | `rpc_void_promo_coupon` executes without error and inserts an outbox row with `event_type = 'promo_coupon_voided'` |
| FR-4 | `rpc_replace_promo_coupon` executes without error and inserts an outbox row with `event_type = 'promo_coupon_replaced'` |
| FR-5 | Existing loyalty RPCs that may write to outbox in the future (e.g., `rpc_accrue_on_close`) are not broken by schema changes |

### Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | RLS enabled with casino-scoped SELECT and INSERT policies (Pattern C hybrid). **SECURITY DEFINER bypass:** The three promo RPCs run as the function owner (`postgres`), which bypasses RLS for their INSERT statements. The INSERT policy exists for defense-in-depth and any future SECURITY INVOKER write paths. The SELECT policy gates direct reads from the service layer (INVOKER context). |
| NFR-2 | Append-only enforcement at two layers: (1) SQL privilege revocation — `REVOKE UPDATE, DELETE ON loyalty_outbox FROM authenticated, anon` in the migration, which is not bypassable by RLS context; (2) RLS denial policies as defense-in-depth for any role that retains privileges. The table owner (`postgres`) can still UPDATE/DELETE — this is by-convention for admin operations, not a gap. |
| NFR-3 | Migration is additive (CREATE TABLE IF NOT EXISTS) — safe to run against any state |

## 6. UX / Flow Overview

No UI changes. The fix is entirely database-level:

1. Migration runs, table is created
2. Promo RPCs that previously failed now succeed
3. Outbox rows accumulate as an audit trail
4. No consumer reads them (future scope)

## 7. Dependencies & Risks

### Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| `casino` table (FK) | Deployed | `casino_id` references `casino(id)` |
| `loyalty_ledger` table (FK) | Deployed | `ledger_id` references `loyalty_ledger(id)`, nullable for promo events |
| Promo RPCs (migration `20260106235611`) | Deployed | These are the consumers; they are not modified |

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Outbox rows accumulate indefinitely with no consumer | Low | Table is append-only audit trail. Pruning is future scope. Rows are small (JSONB payload ~200 bytes). |
| `ledger_id` nullability changes original contract | Low | Original callers (loyalty point RPCs) can still supply `ledger_id`. Only promo RPCs omit it. |

## 8. Definition of Done (DoD)

**Functionality**
- [ ] `loyalty_outbox` table exists in production schema
- [ ] `rpc_issue_promo_coupon` succeeds end-to-end (coupon created + outbox row inserted)
- [ ] `rpc_void_promo_coupon` succeeds end-to-end
- [ ] `rpc_replace_promo_coupon` succeeds end-to-end

**Data & Integrity**
- [ ] Outbox rows contain correct `casino_id`, `event_type`, and `payload` per RPC
- [ ] `ledger_id` is nullable and defaults to NULL

**Security & Access**
- [ ] RLS enabled with casino-scoped SELECT and INSERT policies
- [ ] UPDATE and DELETE denied via denial policies
- [ ] No public access without `auth.uid() IS NOT NULL`

**Testing**
- [ ] Migration applies cleanly on fresh database
- [ ] CI regression test: apply all migrations from scratch, then call each of the three promo RPCs — this is the exact failure class being fixed
- [ ] At least one integration test confirms promo RPC writes outbox row with correct `event_type` and non-empty `payload`
- [ ] Verified: each RPC's INSERT column list (`casino_id`, `event_type`, `payload`, `created_at`) matches schema — omitted columns (`id`, `ledger_id`, `processed_at`, `attempt_count`) resolve to their defaults without error

**Operational Readiness**
- [ ] TypeScript types regenerated (`npm run db:types`)
- [ ] SRM updated: `loyalty_outbox` row — status: `deployed`, owner: `LoyaltyService`, subdomain: `infra (event outbox)`, consumer: `none (audit trail only, no processor)`

**Documentation**
- [ ] ADR-033 dependency section updated to reflect resolution

## 9. Related Documents

| Document | Relationship |
|----------|-------------|
| `docs/issues/loyalty-ledger/LOYALTY-REWARDS-SYSTEM-COMPREHENSIVE-OVERVIEW.md` | Investigation report identifying the P0 bug |
| `docs/issues/loyalty-ledger/ADR-033-LOYALTY-REWARD-DOMAIN-MODEL-SCAFFOLDING-MVP.md` | Lists this as hard dependency for Flow B |
| `docs/10-prd/PRD-004-loyalty-service.md` | Parent loyalty service PRD |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | SRM lists table as deployed (stale) |
| `supabase/migrations/20251109214028_finance_loyalty_idempotency_outbox.sql` | Original CREATE TABLE |
| `supabase/migrations/20251213003000_prd004_loyalty_service_schema.sql` | DROP TABLE (the break) |
| `supabase/migrations/20260106235611_loyalty_promo_instruments.sql` | RPCs that INSERT into the missing table |

---

## Appendix A: Schema Reference

Adapted from original migration `20251109214028`. Key change: `ledger_id` is now **nullable** because promo coupon events are not tied to any `loyalty_ledger` entry.

```sql
CREATE TABLE IF NOT EXISTS public.loyalty_outbox (
  id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  casino_id     uuid           NOT NULL REFERENCES public.casino(id) ON DELETE CASCADE,
  ledger_id     uuid           REFERENCES public.loyalty_ledger(id) ON DELETE CASCADE,  -- nullable for promo events
  event_type    text           NOT NULL,
  payload       jsonb          NOT NULL,
  created_at    timestamptz    NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  attempt_count int            NOT NULL DEFAULT 0
);

-- Partial index: unprocessed rows for future consumer
CREATE INDEX IF NOT EXISTS ix_loyalty_outbox_unprocessed
  ON public.loyalty_outbox (casino_id, created_at DESC)
  WHERE processed_at IS NULL;
```

### RLS Policies

**SECURITY DEFINER bypass note:** The three promo RPCs are SECURITY DEFINER and run as the
function owner (`postgres`), which bypasses RLS. The INSERT policy below is defense-in-depth
for any future SECURITY INVOKER write path. The SELECT policy gates direct table reads from
the service layer (INVOKER context). Denial policies apply universally.

```sql
ALTER TABLE public.loyalty_outbox ENABLE ROW LEVEL SECURITY;

-- Casino-scoped SELECT (Pattern C hybrid) — gates INVOKER reads
CREATE POLICY loyalty_outbox_select ON public.loyalty_outbox
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Casino-scoped INSERT — defense-in-depth (bypassed by DEFINER RPCs)
CREATE POLICY loyalty_outbox_insert ON public.loyalty_outbox
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

-- Append-only: SQL privilege revocation (not bypassable by RLS context)
REVOKE UPDATE, DELETE ON public.loyalty_outbox FROM authenticated, anon;

-- Append-only: RLS denial policies (defense-in-depth)
CREATE POLICY loyalty_outbox_no_updates ON public.loyalty_outbox
  FOR UPDATE USING (false);

CREATE POLICY loyalty_outbox_no_deletes ON public.loyalty_outbox
  FOR DELETE USING (false);
```

> **Append-only honesty:** `postgres` (table owner) retains UPDATE/DELETE capability.
> This is by-convention for emergency admin operations. The REVOKE + denial policies
> protect all application-level roles (`authenticated`, `anon`). If stronger guarantees
> are needed in the future, a trigger-based denial can be added.

## Appendix B: RPC Insert Contract (Verbatim — No Changes)

The three promo RPCs are unchanged by this PRD. Below is the exact INSERT from `rpc_issue_promo_coupon`
(source: `20260106235611_loyalty_promo_instruments.sql`, lines 392-411). The other two RPCs follow
the identical 4-column pattern with different `event_type` and `payload` values.

```sql
-- From rpc_issue_promo_coupon (SECURITY DEFINER, runs as postgres)
INSERT INTO loyalty_outbox (
  casino_id,
  event_type,
  payload,
  created_at
) VALUES (
  v_casino_id,
  'promo_coupon_issued',
  jsonb_build_object(
    'coupon_id', v_coupon.id,
    'promo_program_id', v_coupon.promo_program_id,
    'validation_number', v_coupon.validation_number,
    'face_value_amount', v_coupon.face_value_amount,
    'player_id', v_coupon.player_id,
    'visit_id', v_coupon.visit_id,
    'issued_by', v_actor_id,
    'correlation_id', p_correlation_id
  ),
  now()
);
```

**Column-to-schema verification:**

| RPC supplies | Schema column | Constraint | Resolves? |
|--------------|---------------|------------|-----------|
| `v_casino_id` | `casino_id uuid NOT NULL` | FK to `casino(id)` | Yes — value provided |
| `'promo_coupon_issued'` | `event_type text NOT NULL` | — | Yes — value provided |
| `jsonb_build_object(...)` | `payload jsonb NOT NULL` | — | Yes — value provided |
| `now()` | `created_at timestamptz NOT NULL DEFAULT now()` | — | Yes — value provided |
| *(not in column list)* | `id uuid PK DEFAULT gen_random_uuid()` | auto-generated | Yes — PK default |
| *(not in column list)* | `ledger_id uuid REFERENCES loyalty_ledger(id)` | nullable | Yes — defaults NULL |
| *(not in column list)* | `processed_at timestamptz` | nullable | Yes — defaults NULL |
| *(not in column list)* | `attempt_count int NOT NULL DEFAULT 0` | — | Yes — defaults 0 |
