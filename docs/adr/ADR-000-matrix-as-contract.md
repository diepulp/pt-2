# ADR-000: Matrix as Schema Contract

**Status:** Accepted  
**Date:** 2025-10-21  
**Owner:** Architecture QA  
**Applies to:** PT-2 (Supabase/Postgres), all bounded contexts  
**Decision type:** Foundational, Contract-First

---

## Context

- PT-2 has a **Service Responsibility Matrix (SRM)**, `docs/bounded-context-integrity/phase-D/srm-patch/SERVICE_RESPONSIBILITY_MATRIX.md` that defines bounded contexts, ownership, and invariants.
- The live DB schema drifted (Prisma-era casing, missing FKs/columns), causing mismatches between docs, code, and data.
- We’ve chosen to rebuild a **boring, repeatable, contract-first** workflow where **the SRM is the single source of truth**.

---

## Decision

**The SRM is the canonical contract. The database schema MUST mirror the SRM.**

Concretely:

1) **Matrix-First Flow:**  
   SRM change → migration SQL → regenerated types → services → tests → release.

2) **Naming:**  
   - All identifiers are **`lower_snake_case`**.  
   - **No quoted CamelCase** anywhere (DDL, queries, examples).

3) **Identifiers & Keys:**  
   - All PKs/FKs are **`uuid default gen_random_uuid()`**.  
   - Text IDs are allowed only as **business keys** with explicit unique constraints.

4) **JSON Usage:**  
   - JSON is for **extensible metadata only**.  
   - Anything referenced by **FKs, RLS, analytics, or constraints** is a **first-class column**.

5) **Ownership & Scope:**  
   - Records that depend on casino policy **MUST** carry `casino_id`.  
   - Financial records compute and store **`gaming_day`** (derived via `casino_settings.gaming_day_start`).

6) **RLS:**  
   - Row-level security policies derive from SRM ownership rules and ship **with** each schema change.  
   - No permissive catch-alls (e.g., `USING (true)`) in production schema.

7) **Loyalty ↔ Rating Slip Stance:**  
   - **Single source of truth (SoT) = Loyalty**.  
   - `rating_slip` does **not** cache points unless explicitly reintroduced by SRM (then triggers + reconciliation must be specified).

8) **Compatibility Views:**  
   - **Not used.** We prefer explicit, contract-aligned renames and breaking changes while pre-prod.

---

## Rationale

- **Predictability:** A single contract reduces ambiguity and rework.  
- **Auditability & Compliance:** Ownership and lineage are encoded via FKs and constraints, not ad-hoc joins.  
- **Tooling Leverage:** Supabase type generation enforces compile-time alignment with the schema.  
- **Cost Control:** Contract-first changes are cheaper than ad-hoc migrations + doc fixes.

---

## Alternatives Considered

- **Schema-First:** Quick for spikes, but caused drift and CamelCase ghosts. Rejected.  
- **Dual Contract (Docs + Schema):** Raises cognitive load; inconsistencies inevitable. Rejected.  
- **Compat Views:** Useful for live systems; we are pre-prod and prefer clean renames. Rejected.

---

## Scope & Impact

- **In scope:** All public schema entities, RLS policies, migrations, generated types, service layer contracts.  
- **Out of scope:** UI naming, internal variable names (though recommended to mirror snake_case for clarity).

---

## Implementation Plan

### A. Baseline (once)
- Apply SRM Patch Pack (snake_case, UUIDs, JSON policy, ownership rules).
- Land a **baseline migration** that mirrors the SRM (v3.0.0).
- Regenerate `types/database.types.ts` from the local DB.

### B. CI Gates (must-pass)
1) **Matrix ↔ Schema Diff**  
   - Extract table/column/FK inventory from SRM.  
   - Compare with `pg_catalog`.  
   - **Fail** if SRM-declared objects are missing or mis-typed.

2) **Types Regeneration Required**  
   - Run `supabase gen types typescript --local > types/database.types.ts`.  
   - **Fail** if file not updated when migrations change.

3) **RLS Lint**  
   - Deny list for `USING (true)` in prod.  
   - Verify policies reference the expected ownership keys (e.g., `casino_id`).

4) **Identifier Lint**  
   - **Fail** on quoted identifiers or CamelCase in SQL blocks.

### C. SDLC Hooks
- **Inception / Design:** SRM PR with changed contexts, invariants, and (if needed) a `RENAMES:` or `DEPRECATIONS:` block.  
- **Build:** Write migration SQL from SRM; include backfills when tightening constraints.  
- **Verify:** Contract tests from SRM examples; RLS tests; property tests for invariants.  
- **Release:** Tag `srm-vX.Y.Z` and migration tag; publish generated Schema Appendix.

---

## Change Policy (How to Change the Contract)

1) **Additive Changes (safe):**  
   - Add to SRM → generate `CREATE/ALTER ADD` SQL → regenerate types → update services → tests.

2) **Renames (safe with map):**  
   - SRM includes a `RENAMES:` table (old → new).  
   - Migration uses `ALTER ... RENAME`.  
   - Services update via regenerated types.

3) **Tightening Constraints (NOT NULL/UNIQUE/FK):**  
   - SRM records invariant.  
   - Migration includes **backfill** then sets constraint.  
   - Tests prove no violations post-backfill.

4) **Removals (breaking):**  
   - SRM marks field/table **DEPRECATED** with an **EOL date**.  
   - One release later, migration drops it.

---

## Deprecation Template (SRM excerpt)

```md
**DEPRECATIONS**
- `rating_slip.points` — deprecated in v3.0.0, EOL v3.2.0. Replace with `player_loyalty.balance`.
```

---

## Exception Policy

- **Prototype branches only** may temporarily diverge from SRM to explore.  
- Before merging to `main`, the SRM must be updated and the schema brought into compliance.

---

## Risks & Mitigations

- **Risk:** Over-strict gates slow iteration.  
  **Mitigation:** Keep SRM slices small; prefer additive changes.

- **Risk:** Backfills introduce data errors.  
  **Mitigation:** Idempotent scripts, row counts in `audit_log`, property tests.

- **Risk:** RLS gaps on new FKs.  
  **Mitigation:** CI RLS lint; mandatory RLS test cases per table.

---

## Consequences

- **Positive:** Fewer regressions, consistent generated types, easier onboarding, clear audit trails.  
- **Negative:** Intentional breakage during rebuild; stricter PR discipline; more up-front design.

---

## RACI

- **Domain Lead / Product:** Owns SRM edits (nouns, ownership, invariants).  
- **Architect / DB Engineer:** Translates SRM → SQL; indices/constraints; RLS design.  
- **Service Devs:** Implement vertical slices against generated types; no shadow DTOs.  
- **QA / Compliance:** Validate invariants, RLS, migrations/backfills; own reports.  
- **DevEx / CI:** Maintain diff linter, types regen, RLS lint.

---

## Acceptance Criteria (Definition of Done)

- SRM is `lower_snake_case`; no quoted identifiers remain.  
- All PK/FK types are `uuid`; business keys documented as such.  
- `casino_id` present where ownership requires; `gaming_day` computed for finance.  
- RLS policies shipped and tested with each schema change.  
- CI: matrix↔schema diff **green**; types regenerated; RLS lint **green**.  
- Release tagged with matching SRM and migration versions.

---

## Glossary

- **SRM:** Service Responsibility Matrix (bounded-context contract).  
- **SoT:** Source of Truth.  
- **RLS:** Row-Level Security.  
- **Compat View:** A view that preserves legacy names—**not used** in this approach.

---

### Appendix A — Example Commands

```bash
# Regenerate types (local)
npm run db:types-local

# Reset local db from migrations only (pre-prod)
supabase db reset 
```

### Appendix B — Gaming Day Trigger (Contract Snippet)

```sql
create or replace function compute_gaming_day(ts timestamptz, gstart interval)
returns date language sql immutable as $$
  select (date_trunc('day', ts - gstart) + gstart)::date
$$;

create or replace function set_fin_txn_gaming_day()
returns trigger language plpgsql as $$
declare gstart interval;
begin
  select gaming_day_start into gstart
  from casino_settings where casino_id = new.casino_id;
  if gstart is null then gstart := interval '06:00:00';
  end if;
  new.gaming_day := compute_gaming_day(new.created_at, gstart);
  return new;
end$$;
```
