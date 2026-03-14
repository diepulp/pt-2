---
id: RFC-001
title: "Design Brief: Dual-Boundary Tenancy Phase 1 — Company Foundation"
owner: lead-architect
status: Draft
date: 2026-03-09
affects: [CasinoService, set_rls_context_from_staff, rpc_bootstrap_casino, RLSContext]
---

# Design Brief / RFC: Dual-Boundary Tenancy Phase 1 — Company Foundation

> Purpose: propose direction and alternatives with tradeoffs before anyone writes a PRD.
> Structure: funnel style (context -> scope -> overview -> details -> cross-cutting -> alternatives).

## 1) Context

**Problem:** The `company` table exists in the baseline schema but has zero rows. Every `casino.company_id` is NULL. The RLS context pipeline (`set_rls_context_from_staff()`) has no awareness of company. This means:

- No company-level grouping of casinos is possible
- The `company` entity is an orphaned schema artifact
- Future cross-property features (Phase 2-4) have no foundation to build on

**Forces/constraints:**

- ADR-024 INV-8: Context must be derived server-side, never from client input
- ADR-030: RLS context return type is the authoritative source (TOCTOU elimination)
- Company RLS is deny-by-default (migration `20260208140546`): authenticated role has zero permissive policies
- Phase 1 must be backward-compatible: zero behavioral change for existing single-casino users
- No RLS policy may be broadened — this is plumbing only

**Prior art:**

- `set_rls_context_from_staff()` already migrated from `RETURNS VOID` to `RETURNS TABLE` (migration `20260129193818`) — precedent for extending the return type
- `rpc_bootstrap_casino` already creates casino + settings + staff atomically — extending it to create company is consistent

## 2) Scope & Goals

- **In scope:**
  - Backfill `company` rows for all existing casinos (1:1 synthetic ownership)
  - Enforce `casino.company_id` NOT NULL
  - Harden FK: change `casino.company_id` from `ON DELETE CASCADE` to `ON DELETE RESTRICT`
  - Amend `rpc_bootstrap_casino` to auto-create company row during casino bootstrap (no user input, no `p_company_name`, no name-matching, no find-or-create)
  - Amend `set_rls_context_from_staff()` to derive `company_id` via `casino → company` JOIN and SET LOCAL `app.company_id`
  - Extend `RLSContext` TypeScript type with `companyId`
  - Update `injectRLSContext()` to extract `company_id` from RPC return
  - Enrich bootstrap audit payload to include created `company_id`

- **Out of scope:**
  - RLS policy changes (no policy consumes `app.company_id`)
  - Multi-casino staff access, tenant picker, `staff_casino_access` junction
  - Cross-property player reads, lookups, or UI
  - Company name-matching or company-selection during bootstrap
  - Bootstrap form UI changes
  - Company admin tooling (list, edit, merge)

- **Success criteria:**
  - 100% of `casino` rows have non-null `company_id`
  - `set_rls_context_from_staff()` returns `company_id` for all active staff
  - All existing RLS integration tests pass without modification
  - Zero behavioral change for single-casino users

## 3) Proposed Direction (overview)

Single atomic migration that backfills company rows, enforces the NOT NULL constraint, and amends both RPCs. Followed by a code change to extend `RLSContext` and update `injectRLSContext()`.

Company creation is 1:1 auto-create only — no name-matching, no user input. Every casino gets its own company row. Meaningful multi-casino grouping is deferred to a dedicated admin workflow.

## 4) Detailed Design

### 4.1 Data model changes

**Migration operations (single file, executed in order):**

```
Step 1: Backfill company rows (deterministic, no name-matching)

  Precondition: company table is empty. This migration creates synthetic 1:1
  company rows from existing casinos. It does NOT use name equality as a
  join key for reassociation.

  DO $$
  DECLARE
    r RECORD;
    v_company_id uuid;
  BEGIN
    FOR r IN SELECT id, name FROM casino WHERE company_id IS NULL
    LOOP
      INSERT INTO company (name) VALUES (r.name)
      RETURNING id INTO v_company_id;

      UPDATE casino SET company_id = v_company_id WHERE id = r.id;
    END LOOP;
  END $$;

  Each casino gets its own INSERT → UPDATE in a single loop iteration.
  No name-based reassociation. No ambiguity.

Step 2: Harden FK — ON DELETE CASCADE → ON DELETE RESTRICT
  ALTER TABLE casino DROP CONSTRAINT casino_company_id_fkey;
  ALTER TABLE casino ADD CONSTRAINT casino_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE RESTRICT;

Step 3: Enforce NOT NULL
  ALTER TABLE casino ALTER COLUMN company_id SET NOT NULL;

Step 4: Amend rpc_bootstrap_casino
  CREATE OR REPLACE FUNCTION rpc_bootstrap_casino(...)
  — Add: INSERT INTO company (name) VALUES (p_casino_name)
         RETURNING id INTO v_company_id
  — Add: use v_company_id when inserting casino row

Step 5: Amend set_rls_context_from_staff
  CREATE OR REPLACE FUNCTION set_rls_context_from_staff(...)
  — Add: JOIN casino → company for company_id derivation
  — Add: SET LOCAL 'app.company_id'
  — Add: company_id to RETURNS TABLE
```

**Backfill precondition:** The `company` table must be empty before this migration runs. The backfill creates synthetic 1:1 company rows — one per casino, linked by direct INSERT/UPDATE pairing within a single loop iteration. No name-based reassociation is used.

**Backfill idempotency:** The `WHERE company_id IS NULL` guard on the loop query ensures re-runs skip already-backfilled casinos. If all casinos already have company rows, the loop body executes zero iterations.

**Schema change summary:**

| Table | Column | Before | After |
|-------|--------|--------|-------|
| `casino` | `company_id` | `uuid NULL, ON DELETE CASCADE` | `uuid NOT NULL, ON DELETE RESTRICT` |

No new tables. No new columns. No index changes (FK index `idx_casino_company_id` already exists).

### 4.2 Service layer

**`lib/supabase/rls-context.ts`** — two changes:

1. Extend `RLSContext` interface:
```typescript
export interface RLSContext {
  actorId: string;
  casinoId: string;
  staffRole: string;
  companyId: string;  // NEW — derived from casino.company_id
}
```

2. Update `injectRLSContext()` to extract `company_id`:
```typescript
const context: RLSContext = {
  actorId: row.actor_id,
  casinoId: row.casino_id,
  staffRole: row.staff_role,
  companyId: row.company_id,  // NEW
};
```

**Callers audit (resolved):** 27+ SQL callers all use `PERFORM` (discard return). The single TypeScript consumer uses named property access. Adding `company_id` is **100% backward compatible** — zero callers break.

**`services/casino/crud.ts`** — minor adjustment:
- `createCasino()` currently accepts `company_id` as optional input. After Phase 1, `company_id` is mandatory at the DB level but auto-created by `rpc_bootstrap_casino`. No CRUD change needed — the RPC handles it.

### 4.3 API surface

**No API changes.** Phase 1 is infrastructure-only. The `company_id` is set in RLS context but no API endpoint exposes or consumes it.

The existing `CASINO_SELECT` constant in route handlers does not include `company_id` — this is correct for Phase 1. If API consumers need it later, it's a Phase 4 addition.

### 4.4 UI/UX flow

**No UI changes.** Bootstrap form remains unchanged. Company is auto-created from casino name — no user input required.

### 4.5 Security considerations

**RLS impact:**
- No RLS policy is added, removed, or modified
- `app.company_id` is SET LOCAL but no policy reads it
- Company table remains deny-by-default for authenticated role
- All existing casino-scoped policies continue to function identically

**RBAC requirements:**
- No role changes
- `set_rls_context_from_staff()` remains restricted to `authenticated` role via REVOKE/GRANT

**Audit trail:**
- `rpc_bootstrap_casino` already writes a structured event to `audit_log`. The bootstrap audit payload must be enriched to include the created `company_id` alongside existing fields (`casino_id`, `staff_id`, `actor`/`auth.uid()`, `timestamp`). This is not optional — company creation during bootstrap is an auditable event and the payload must reflect it explicitly.
- No separate company audit event needed for Phase 1. The bootstrap event is the single structured log entry.

**Referential hardening — ON DELETE RESTRICT:**
- `casino.company_id` currently has `ON DELETE CASCADE` in the baseline schema — deleting a company would silently delete all its casinos.
- Phase 1 changes this to `ON DELETE RESTRICT`. If `company` is a real tenancy parent, the schema must not allow silent cascade deletion of dependent casinos.
- This is referential hardening, not behavior expansion. Cost is trivial (one FK constraint change). Phase 1 is the natural place to fix it — the same slice that makes company real.

## 5) Cross-Cutting Concerns

**Performance implications:**
- `set_rls_context_from_staff()` adds one JOIN: `casino → company`. The FK index `idx_casino_company_id` already exists. Cost: one additional index lookup per RPC call — negligible.
- Backfill operates on trivially small dataset (1-3 casino rows in practice).

**Migration strategy:**
- Single atomic migration (Decision 1 from SCAFFOLD-001)
- Idempotent backfill with NULL guards
- Type regeneration via `npm run db:types-local` after migration

**Observability / monitoring:**
- No new metrics needed for Phase 1
- `app.company_id` will appear in `pg_stat_activity` alongside existing session variables — useful for debugging

**Rollback plan:**
- Single migration to revert: drop the `app.company_id` SET LOCAL, restore original RPC signatures, revert FK to CASCADE, set `casino.company_id` back to nullable
- `app.company_id` being set but unused is harmless — even partial rollback (keeping backfill but reverting RPCs) leaves the system in a valid state

## 6) Alternatives Considered

### Alternative A: Two sequential migrations

- **Description:** Migration 1 backfills + NOT NULL. Migration 2 amends RPCs. As described in SCAFFOLD-001 Option B.
- **Tradeoffs:** Easier to review in smaller chunks. Creates intermediate state where company data exists but context doesn't expose it.
- **Why not chosen:** Decision 1 from SCAFFOLD-001 selected atomic migration. The total migration size (~150-200 lines) is within single-review tolerance. Atomic invariant is preferred.

### Alternative B: Name-matching during bootstrap

- **Description:** Bootstrap RPC takes `p_company_name`, finds or creates company by exact name. As described in SCAFFOLD-001 Option D.
- **Tradeoffs:** Allows grouping at bootstrap time. Introduces name-based identity ambiguity and accidental grouping risk.
- **Why not chosen:** Decision 2 from SCAFFOLD-001 selected auto-create only. Name is not identity. Phase 1 is plumbing, not admin policy. Company grouping deferred to dedicated admin workflow.

### Alternative C: New function instead of amending existing

- **Description:** Create `set_rls_context_from_staff_v2()` with company_id, keep original unchanged.
- **Tradeoffs:** Zero risk to existing callers. Two functions to maintain. Callers must migrate eventually.
- **Why not chosen:** The callers audit proved 100% backward compatibility for the existing function. Adding a column to RETURNS TABLE does not break any SQL (`PERFORM` discards) or TypeScript (named destructuring) caller. A v2 function would add unnecessary maintenance burden.

## 7) Decisions Required

All decisions resolved:

1. ~~Migration strategy~~ → **A (single atomic)** — resolved in SCAFFOLD-001
2. ~~Company creation~~ → **C (auto-create only, 1:1)** — resolved in SCAFFOLD-001
3. ~~Extend in-place vs new function~~ → **Extend in-place** — resolved by callers audit
4. ~~ON DELETE CASCADE → RESTRICT~~ → **Change in Phase 1** — resolved per RFC audit. If Phase 1 makes company real, the schema must stop allowing silent cascade deletion. This is referential hardening, not behavior expansion.

## 8) Open Questions

All previously open questions are resolved:

- ~~How many casinos exist?~~ Trivial (1-3 rows). Backfill is a non-issue.
- ~~Bootstrap form changes?~~ No. Auto-create only (Decision 2).
- ~~Extend in-place or new function?~~ Extend in-place. Callers audit confirmed 100% backward compatibility.
- ~~Destructuring compatibility?~~ Confirmed safe. Named property access throughout.

## Links

- Feature Boundary: `docs/20-architecture/specs/dual-boundary-tenancy-p-1/FEATURE_BOUNDARY.md`
- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-001-dual-boundary-tenancy-p1.md`
- ADR(s): ADR-043 (Phase 4 of pipeline)
- PRD: PRD-050 (Phase 5 of pipeline)
- Exec Spec: EXEC-SPEC-043 (post-pipeline)

## References

- Investigation: `docs/00-vision/DUAL-BOUNDARY-TENANCY/CROSS-PROPERTY-PLAYER-SHARING-INVESTIGATION.md`
- Phase 1 Analysis: `docs/00-vision/DUAL-BOUNDARY-TENANCY/phase-1-foundation.md`
- Operational Addendum: `docs/00-vision/DUAL-BOUNDARY-TENANCY/cross-property-player-sharing-operational-addendum.md`
- Decisions Audit: `dual-boundary-tenancy-p1-decisions-audit.md`
- ADR-024: `docs/80-adrs/ADR-024_DECISIONS.md`
- ADR-030: `docs/80-adrs/ADR-030-auth-system-hardening.md`
- SEC-001: `docs/30-security/SEC-001-rls-policy-matrix.md`
- SEC-002: `docs/30-security/SEC-002-casino-scoped-security-model.md`
