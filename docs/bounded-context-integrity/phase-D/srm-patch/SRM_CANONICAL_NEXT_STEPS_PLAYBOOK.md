# SRM → Canonical: Next-Step Playbook (Refactor Plan)

**Purpose:** Immediately follow the SRM Patch Pack by executing a systematic, contract‑first refactor that makes the **Service Responsibility Matrix (SRM)** the canonical source of truth for PT‑2.

**Audience:** Architecture, DB Engineering, Service Devs, QA/Compliance, DevEx/CI

**Scope Window:** 1–2 sprints (10–20 business days), pre‑prod environment

---

## 0) Outcomes (Definition of Done)

- **Contract-first SDLC active:** SRM change → SQL migration → regenerated types → service compile/tests → release.
- **Schema mirrors SRM v3.0.2** (snake_case, UUIDs, ownership, invariants).
- **CI gates live:** matrix↔schema diff, types regen, RLS lint, identifier lint.
- **Vertical slices compile** against `types/database.types.ts` with zero `any`.
- **RLS verified:** ownership rules enforced per bounded context.
- **Backfills complete and audited:** counts recorded in `audit_log`.
- **Release tags:** `srm-v3.0.0` + corresponding migration tag published.

---

## 1) Project Board Setup (Today)

Create a short-lived **“SRM Canonicalization”** board with the following swimlanes:

1. **Policy & Docs** – ADR-000, [`80-adrs/ADR-000-matrix-as-contract.md`] SRM Patch merge, SRM changelog
2. **Schema Baseline** – baseline migration, seed, types regen
3. **CI & Tooling** – diff linter, types gate, RLS & identifier lint
4. **Backfills** – staff.casino_id, dealer_rotation.table_id, finance.gaming_day
5. **RLS** – per-domain policies + tests
6. **Service Refactor** – per domain vertical slice updates
7. **Verification** – property tests, contract examples, migration logs
8. **Release** – tags & checklists

---

## 2) Deliverable Files/Dirs to Add

```
80-adrs/ADR-000-matrix-as-contract.md                  # already produced
docs/patterns/SRM_CHANGELOG.md                          # from Patch Pack
docs/patterns/SRM_CANONICAL_ROLLUP.md                   # this effort’s progress log

supabase/migrations/00000000000000_baseline_srm.sql     # mirrors SRM DDL
supabase/seed.sql                                       # minimal, non-sensitive seeds

scripts/gen_types.sh                                    # types regen gate
scripts/lint_srm_schema.ts                              # SRM↔schema diff
scripts/lint_rls.sql                                    # RLS anti-patterns
scripts/lint_identifiers.ts                             # quote/CamelCase detector

tests/contract/*.spec.ts                                # SRM example queries
tests/rls/*.spec.ts                                     # policy checks
tests/property/*.spec.ts                                # invariants (unique, ranges)
```

---

## 3) Baseline Migration (Day 1–2)

**Action:** Materialize the SRM DDL (from Patch Pack) as a single baseline migration.

- **Guidelines**
  - All PKs/FKs are `uuid`.
  - Ownership columns (`casino_id`) present where required.
  - Invariants encoded (`unique(casino_id, game_type)`, bet ranges).
  - Finance `gaming_day` trigger included.

- **Smoke Tests**
  - `supabase db reset` succeeds.
  - `./scripts/gen_types.sh` updates `types/database.types.ts`.
  - `pg_dump --schema-only` contains no quoted identifiers.

---

## 4) CI Gates (Day 2–3)

### 4.1 Types Regeneration Gate
- **Rule:** Any migration PR must include changes in `types/database.types.ts`.
- **Implementation:** `./scripts/gen_types.sh` + CI job that fails on stale types.

### 4.2 SRM ↔ Schema Diff
- **Rule:** SRM inventory (tables/columns/FKs) must be present in DB.
- **Implementation Sketch (TypeScript):**
  ```ts
  // scripts/lint_srm_schema.ts
  // 1) Parse SRM markdown code fences with ```sql blocks.
  // 2) Build expected inventory; compare to pg_catalog via a read-only connection.
  // 3) On mismatch (missing table/column/type), exit 1 with a precise diff report.
  ```

### 4.3 RLS Lint
- **Rule:** No `USING (true)` in prod SQL; policies reference ownership keys (e.g., `casino_id`).
- **Implementation:** `scripts/lint_rls.sql` + CI step to grep/flag violations.

### 4.4 Identifier Lint
- **Rule:** No quoted identifiers / CamelCase in SQL blocks.
- **Implementation:** `scripts/lint_identifiers.ts` scanning the migration diffs.

---

## 5) Backfill Plan (Day 3–5)

| Backfill | Source → Target | Strategy | Verification |
|---|---|---|---|
| `staff.casino_id` | Existing assignments/config → `staff` | Scripted lookup + default; flag unknowns | Count rows updated; list unresolved in `audit_log` |
| `dealer_rotation.table_id` | Legacy `tableStringId` → FK | Join against `gaming_table.label` or mapping CSV | Count matched %, reject if < 100% |
| `player_financial_transaction.gaming_day` | Trigger computes | Backfill via trigger on update; or single UPDATE using function | Row count matches total; spot-check 10% |
| Inventory totals from JSON (if migrating) | `denominations` JSON → scalar cols | `jsonb_extract_path_text` during UPDATE | Sum checks before/after |

**All backfills are idempotent** (safe to rerun). Write results to `audit_log` with operation name, counts, and duration.

---

## 6) RLS Rollout (Day 5–7)

- **Policy Template (per casino-scoped table):**
  ```sql
  alter table <table> enable row level security;

  create policy <table>_read on <table>
    for select using (auth.uid() is not null); -- tighten by role as you finalize auth

  create policy <table>_write on <table>
    for insert with check (exists (
      select 1 from staff s where s.id = auth.uid() and s.casino_id = <table>.casino_id and s.role in ('admin','pit_boss')
    ))
    to authenticated;
  ```

- **Tests:** Place in `tests/rls/` per table. Verify that staff from other casinos cannot select/insert.

---

## 7) Service Layer Refactor (Day 6–9)

**Goal:** All domain services compile against the new types with zero `any` and no legacy DTOs.

- **Rules**
  - Import types from `Database['public']['Tables']['<name>']`.
  - No shadow types; no `ReturnType<typeof createXService>` tricks.
  - Queries use snake_case names and explicit columns (no `select('*')` in critical paths).

- **Targets (by priority)**
  1. **Casino / Staff** (ownership first)
  2. **TableContext** (FKs + scalars: `dealer_rotation`, settings)
  3. **Loyalty / Rating Slip seam** (remove cache or wire RPC)
  4. **Finance** (gaming_day consumers)

- **Checklists**
  - [ ] Replace CamelCase identifiers.
  - [ ] Update joins to use FKs (no string glue).
  - [ ] Add indexes matching access paths (where clauses in services).

---

## 8) Verification & Quality Gates (Day 8–10)

- **Contract Tests:** Recreate every example query in SRM as a test case; assert non-null columns and invariants.
- **Property Tests:** Enforce `min_bet <= max_bet`, unique `(casino_id, game_type)`, non-negative balances, etc.
- **Performance Smoke:** `EXPLAIN ANALYZE` for top 3 service queries—ensure index usage.
- **Migration Reports:** Post backfill counts and constraint validations to the team channel.

---

## 9) Release Checklist (End of Sprint)

- [ ] SRM v3.0.0 merged (Patch Pack applied).  
- [ ] `00000000000000_baseline_srm.sql` merged and applied to dev.  
- [ ] `types/database.types.ts` regenerated and committed.  
- [ ] CI gates green: diff, types, RLS, identifiers.  
- [ ] Backfills completed; `audit_log` entries present.  
- [ ] RLS tests pass; property tests pass.  
- [ ] Service slices compile and pass integration tests.  
- [ ] Tags pushed: `srm-v3.0.0` and `schema-v3.0.0`.  
- [ ] SRM_CANONICAL_ROLLUP.md updated with links to PRs and artifacts.

---

## 10) RACI

- **Domain Lead / Product:** Approves SRM changes; curates SRM_CHANGELOG.  
- **Architect / DB Engineer:** Owns baseline migration, backfills, RLS design.  
- **Service Devs:** Refactor slices against generated types; add indices as needed.  
- **QA / Compliance:** Owns tests (contract/rls/property); audits backfill logs.  
- **DevEx / CI:** Implements/maintains CI gates; identifier & RLS linters.

---

## 11) Timeline (Aggressive, 10 days)

| Day | Workstream | Key Outputs |
|---|---|---|
| 1–2 | Baseline Migration | Schema from SRM, db reset OK, types regenerated |
| 2–3 | CI Gates | Diff linter, types gate, RLS & identifier lint |
| 3–5 | Backfills | Idempotent scripts + audit logs |
| 5–7 | RLS | Policies + tests per casino-scoped table |
| 6–9 | Service Refactor | Slices updated; build green |
| 8–10 | Verification | Contract/property tests; perf smoke; release checklist |

---

## 12) Risk Register & Mitigations

- **Ambiguous mapping for `dealer_rotation.table_id`**  
  *Mitigation:* Require a CSV mapping reviewed by ops; block release if match < 100%.
- **RLS over-restriction breaks admin tools**  
  *Mitigation:* Ship explicit admin bypass role and tests.
- **Long-running backfills**  
  *Mitigation:* Chunked updates; transaction batches; track progress in `audit_log`.
- **Index drift after refactor**  
  *Mitigation:* Add “index review” step; store EXPLAIN snapshots in PR notes.

---

## 13) Appendices

### A) Minimal `gen_types.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail
supabase gen types typescript --local > types/database.types.ts
git diff --quiet --exit-code types/database.types.ts && {
  echo "types/database.types.ts unchanged. If migrations changed, this is a failure."
  exit 1
} || exit 0
```

### B) Identifier Lint (sketch)
```ts
// scripts/lint_identifiers.ts
import { readFileSync } from 'node:fs';
const sql = readFileSync(process.argv[2], 'utf8');
const bad = /"[A-Z][A-Za-z0-9_]*"/g; // quoted CamelCase
if (bad.test(sql)) {
  console.error('Quoted CamelCase identifiers detected. Use lower_snake_case.');
  process.exit(1);
}
```

### C) SRM Inventory Hints
- Use fenced ```sql blocks as the authoritative inventory for the diff.
- Prefer explicit `create table` blocks and `enum` definitions per bounded context section.

---

**Execute this plan now.** Once complete, SRM truly becomes the contract—schema, types, and services follow automatically with CI guarantees.
