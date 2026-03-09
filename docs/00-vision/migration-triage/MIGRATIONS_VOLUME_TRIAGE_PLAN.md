# Migration Volume Triage & Stabilization Plan

Status: **Draft / Ready for implementation**
Owner: **Engineering**
Scope: Supabase/Postgres migrations, schema governance, CI gates

---

## Problem Statement

We are accumulating ~300 Supabase migrations. The count itself is not the hard limit. The real risks are:

- **Reviewability collapse**: state changes are no longer intelligible.
- **Blast radius growth**: fix-forward migrations re-break past assumptions.
- **Local/CI slowdown**: replaying hundreds of migrations + security assertions becomes a bottleneck.
- **Schema archaeology tax**: understanding *why* schema exists becomes mandatory and expensive.

This creates a loop where migrations “rectify migrations” due to ongoing contract shifts (SRM/SEC remediations), producing an append-only history that is operationally fragile.

---

## Goals

1. Preserve production safety (no rewriting applied prod history).
2. Reduce schema churn and “migration-to-fix-migration” patterns.
3. Improve developer velocity (local + CI).
4. Create a durable **baseline** that is easy to reason about.
5. Align schema to canonical contracts (SRM v4.0.0 / SEC specs).

---

## Non-Goals

- Rewriting production-applied migrations (unless production is reset / never shipped).
- Perfect historical cleanliness.
- Eliminating all future migrations (we only control churn and governance).

---

## Key Insight

**Supabase does not reject databases for “too many migrations.”**  
The failure mode is **human + operational + runtime**: cognition, review, drift, CI latency, and unexpected interactions.

---

## Strategy Overview (Ranked)

### 1) Baseline Checkpointing (Make baseline the “starting truth”)

Introduce periodic schema “checkpoint” snapshots:

- Generate a **schema-only dump** from a known-good database state that passes gates.
- Commit it as a baseline artifact (not a migration).
- Treat migrations as “changes since baseline” rather than “the complete history.”

**Outcome:** You stop needing to mentally replay 300 files to understand the schema.

**Suggested artifact:**
- `supabase/schema/baseline_YYYYMMDD.sql`

**Command (example):**
- `supabase db dump --schema-only > supabase/schema/baseline_YYYYMMDD.sql`

> NOTE: exact CLI flags may vary by Supabase CLI version; keep a single script in-repo to avoid mismatch.

---

### 2) Two-mode Governance: Squash in Dev, Fix-forward in Prod

**Dev / Pre-release (squash allowed):**
- If migrations have **not** been applied to production (or prod can be reset), you may squash/rewrite history.

**Production (fix-forward only):**
- If migrations have been applied to production, you **never** rewrite history.
- Instead, you create a baseline checkpoint at current prod schema and proceed with clean, minimal migrations forward.

**Outcome:** rewrite only where it cannot brick reality.

---

### 3) Migration Budgets (Stop infinite corrective churn)

Adopt explicit budgets:

- **Per PR**: limit number of migration files (e.g., 1–3).
- **Per epic**: cap number of schema pivots.
- **Hard rule**: “migration to fix a migration” must include:
  - root-cause note in the migration header comment
  - follow-up issue to prevent recurrence (tooling/spec/contract fix)

**Outcome:** churn becomes expensive, forcing upstream fixes.

---

### 4) Move uncertainty into stable seams (views / wrappers) before destructive DDL

Where churn is safer:
- **Views**
- **RPC wrappers**
- **Computed views**
- **RLS policies** (still serious; safer than table surgery)

Where churn is most costly:
- table renames
- column renames
- enum churn
- multi-tenant scoping changes (`casino_id`, `gaming_day`), ownership reshaping

**Guideline:** If business rules are evolving, **prefer views/RPC wrappers** and delay destructive DDL until stable.

---

### 5) Expand/Contract for breaking refactors

For breaking changes, avoid repeated schema surgery:

1. Expand: add new structures alongside old.
2. Backfill: migrate data.
3. Switch reads/writes: app changes.
4. Contract: drop old structures later.

**Outcome:** controlled transitions without thrashing.

---

## PT-2 Concrete Plan (SRM v4.0.0 + SEC remediations)

### Step 1 — Declare “Epoch 2” (Baseline Cut)

- Declare a governance milestone: **SRM v4.0.0 becomes the baseline-aligned contract**.
- Older migration history is treated as legacy, not as a mental model.

Deliverable:
- `docs/governance/migrations/MIGRATION_EPOCH_2.md` (or similar)

Contents:
- “From this commit onward, schema must mirror SRM v4.0.0”
- rules for fix-forward vs rewrite
- budgets and review checklist

---

### Step 2 — Produce a Verified Baseline Snapshot

- Spin up a clean DB instance (local or staging).
- Apply all existing migrations once.
- Run your SEC assertion gates / acceptance checks.
- Dump schema-only and commit as baseline snapshot:
  - `supabase/schema/baseline_YYYYMMDD.sql`

**Baseline must be “green.”**

---

### Step 3 — Start clean, minimal migrations forward

- New migrations must be:
  - SRM-aligned
  - small and deliberate
  - avoid “re-shaping” unless contract-critical
- Any cleanup work not required for SRM/SEC becomes backlog.

---

### Step 4 — CI Guardrails (Baseline + Drift control)

Add CI checks that ensure:

- migrations apply cleanly **from baseline**
- `database.types.ts` regeneration matches expectations
- SRM ↔ schema conformance gates (matrix-first)
- security assertion gates run after migration application

**Outcome:** schema drift is detected immediately, not three weeks later.

---

## Operational Rules

### Allowed patterns
- “One intent” per migration (small diff)
- Additive changes, with follow-up backfill steps
- RPC/view stabilizers for evolving business rules
- Expand/contract for breaking refactors

### Discouraged patterns
- “Cleanup migration” that touches many unrelated objects
- Repeated renames in successive migrations
- Enum thrash without a stabilization plan
- Overloaded RPC signatures with DEFAULT overlap (PostgREST ambiguity risk)

---

## Definition of Done (Migration Work)

A migration PR is done when:

- Local apply is clean on a fresh DB
- CI gates pass (security assertions included)
- `database.types.ts` is regenerated and committed
- SRM mapping is updated/verified
- Migration header includes intent + risk note + rollback guidance (if applicable)

---

## Notes & Rationale

- Migration count is not the limiter; **churn is**.
- Baseline checkpointing reduces cognitive load and audit time.
- Two-mode governance prevents production bricking.
- Budgets and stable seams prevent “append-only disaster museum.”

---

## Next Actions Checklist

- [ ] Create `supabase/schema/` and commit a verified baseline snapshot
- [ ] Add `docs/governance/migrations/` epoch policy doc
- [ ] Implement migration budgets in PR review checklist
- [ ] Add CI checks for baseline application + types regen + SRM conformance
- [ ] Identify repeat offenders (enums, RPC overloads, RLS context setters) and stabilize with wrappers/views

