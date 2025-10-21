# Service Matrix vs Schema Drift Audit

**Date**: 2025-10-20  
**Prepared By**: Architecture QA (Codex CLI)

**Source Inputs**:
- Canonical bounded context spec `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md` (v2.5.0)  
- Generated Supabase types `types/database.types.ts` (2025-10-20 build)

## Executive Summary
- The canonical bounded context matrix and the live database schema have materially diverged.  
- Critical ownership assumptions (casino configuration, table lifecycle, reward telemetry split) can no longer be enforced using the current tables.  
- Several integration examples in the matrix (e.g., `supabase.from('CasinoSettings')`) fail outright against the published schema.  
- Risk: medium-high. Teams following the matrix will design features that cannot be implemented without further migrations or doc revisions.

## Findings by Domain

### Casino Service (Root Authority)
- **Casino registry fields removed**: Matrix keeps TEXT `id`, `status`, and full address (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:202`–`209`), but schema exposes only `id`, `name`, and `location` (`types/database.types.ts:115`–`126`). Impact: policy/state fields and status workflows described in docs cannot persist data.
- **Case mismatch for casino settings**: Docs use `"CasinoSettings"` table name and expect Supabase to manage timestamps (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:223`–`234`, `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:320`), while schema ships lowercase `casino_settings` with caller-supplied primary keys (`types/database.types.ts:143`–`173`). Impact: example code fails; temporal authority automation (RLS, triggers) can’t be assumed.
- **Game template ownership eroded**: Docs declare `casino_id` + `game_type` (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:237`–`248`); schema omits both columns (`types/database.types.ts:399`–`422`). Impact: TableContext cannot inherit casino policy from templates as documented.
- **Staff management fields missing**: Docs require `casino_id`, `status`, `role`, `employee_id` enforcement (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:252`–`261`); schema only retains `firstName`/`lastName`/`email` (`types/database.types.ts:1761`–`1787`). Impact: no casino-scoped access control, contradicting matrix responsibilities.
- **Audit/report tables detached from casino**: Matrix lists `casino_id`, `performed_by`, `changes` for `AuditLog` and `Report` (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:275`–`295`); schema drops `casino_id` entirely and renames columns (`types/database.types.ts:37`–`73`, `types/database.types.ts:1546`–`1581`). Impact: centralized audit story no longer valid.
- **Corporate hierarchy trimmed**: Docs expect `legal_name` + `created_at` on `company` (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:214`–`219`); schema reduced to `id`/`name` (`types/database.types.ts:218`–`230`). Impact: compliance reporting fields missing.
- **Player enrollment metadata lost**: Matrix defines `playercasino` with surrogate id, status, enrollment date (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:265`–`272`); schema is bare junction (`types/database.types.ts:1350`–`1377`). Impact: loyalty eligibility tracking impossible as documented.

### TableContext Service (Operational)
- **Table registry lacks status metadata**: Docs require `pit`, `status`, `created_at` default (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:811`–`818`); schema keeps `description`/`type` only and drops `pit`/`status` (`types/database.types.ts:438`–`466`). Impact: lifecycle & pit assignments cannot be recorded.
- **Configuration table renamed and repurposed**: Docs for `gamingtablesettings` store `game_type`, betting limits, `rotation_interval` (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:821`–`828`); schema swaps in activation windows and removes betting columns (`types/database.types.ts:479`–`522`). Impact: downstream consumers lose configuration data promised in matrix.
- **Dealer rotations no longer reference tables**: Docs rely on `table_id` FK (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:832`–`838`); schema keeps an unconstrained `tableStringId` (`types/database.types.ts:260`–`289`). Impact: referential integrity broken; event sourcing claims invalid.
- **Structured inventory events replaced with JSON**: Docs enumerate scalar columns for `ChipCountEvent`, `FillSlip`, `DropEvent`, `KeyControlLog` (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:842`–`885`); schema stores `denominations` JSON, omits table/staff links, or collapses counts into blobs (`types/database.types.ts:176`–`214`, `types/database.types.ts:338`–`368`, `types/database.types.ts:292`–`335`, `types/database.types.ts:524`–`564`). Impact: compliance lineage claimed in docs not achievable.

### Loyalty & RatingSlip Boundary
- **RatingSlip `points` cache removed**: Matrix table and workflows cache loyalty points (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:132`, `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:913`–`959`); schema has no `points` column (`types/database.types.ts:1466`–`1513`). Impact: orchestration steps 3–4 fail; telemetry vs reward split breaks.
- **Loyalty ledger columns renamed**: Docs specify `points_earned`, telemetry snapshot fields (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:390`–`405`); schema uses `points_change`, balance deltas, and omits telemetry (`types/database.types.ts:600`–`671`). Impact: audit trail described in doc unavailable.
- **Player loyalty state model drift**: Docs key table on `player_id` with `preferences` JSON (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:409`–`420`); schema adds surrogate `id`, removes `preferences`, makes balances nullable (`types/database.types.ts:1148`–`1187`). Impact: preference/eligibility logic can’t be implemented per spec.
- **Tier definition missing benefits**: Docs store `benefits` JSON (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:424`–`429`); schema omits it (`types/database.types.ts:674`–`688`). Impact: reward catalog features blocked.

### Finance & Compliance Interfaces
- **Financial ledger lacks casino linkage**: Matrix states PlayerFinancial references Casino for gaming-day authority (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:134`); schema’s `player_financial_transaction` has no `casino_id` (`types/database.types.ts:1056`–`1115`). Impact: temporal authority chain broken.
- **MTL integrations partially updated**: Matrix joins `mtl_entry` to loyalty via `patron_id` text cache (`docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md:485`–`520`); schema now enforces `patron_uuid` + generated `patron_id` and adds idempotency keys (`types/database.types.ts:730`–`839`). Impact: doc consistent with latest migrations, but views like `mtl_compliance_context` referenced in SQL (`supabase/migrations/20251014134942_mtl_schema_enhancements.sql:91`–`213`) do not exist in generated types (missing View definitions). Recommend regenerating `types/database.types.ts` post-migration.

## Recommended Next Actions
1. **Decide source of truth**: either align schema to the matrix (preferred for preserving bounded contexts) or revise `SERVICE_RESPONSIBILITY_MATRIX.md` to match current schema.
2. **Regenerate Supabase types after migrations**: ensure new views (`mtl_compliance_context`, `mtl_entry_with_notes`, etc.) appear so downstream services can type-check integrations.
3. **Patch broken examples**: update matrix code samples (e.g., `supabase.from('CasinoSettings')`) to reflect actual casing or adjust schema to meet documented expectations.
4. **Schedule remediation**: create Phase D (Documentation & Schema Reconciliation) targeting high-impact drifts (Casino ownership, TableContext telemetry, Loyalty cache) before new feature work.

## Remediation Plan & Feasibility Answer

**Is this fixable without restarting the schema?** Yes. Every divergence surfaced above can be resolved with targeted migrations plus doc corrections; no domain demands a wholesale re-architecture. However, the fixes touch multiple services, so we need a structured remediation wave to avoid regressions.

### 1. Immediate Blockers (Priority: Critical, Target: 3-5 days)
- Restore the canonical columns on `casino`, `casino_settings`, `gamesettings`, and `Staff` to re-establish global policy ownership. These are additive migrations (re‑introduce columns, defaults, constraints) and can be done without data loss because current tables are underspecified.
- Recreate the `ratingslip.points` cache (or adjust matrix + orchestration to the new reality). Decision point: either re-add the column with a denormalized sync trigger or revise the matrix to stop promising it. Recommendation: re-add column with trigger that hydrates from Loyalty so clients keep fast queries while source of truth stays in Loyalty.
- Regenerate Supabase types immediately after the above migrations so generated code matches reality (fixes missing views, casing, and field names).

### 2. Schema Alignment Wave (Priority: High, Target: 1-2 sprints)
- TableContext tables: add missing FK columns, convert JSON blobs back into structured numeric columns, and enforce the referential integrity described in the matrix. These are mostly additive migrations (add new structured columns, backfill from JSON where possible, deprecate blobs).
- Loyalty tables: rename `points_change` → `points_earned`, add telemetry snapshot columns, and drop surrogate `id` on `player_loyalty` in favor of `player_id` PK. Requires backfill scripts but no paradigm shift.
- PlayerFinancial: add `casino_id` with backfill from Visit or default property; wire triggers to maintain gaming-day authority chain.
- Update all doc examples once SQL is merged to keep matrix + schema synchronized.

### 3. Governance & Guardrails (Priority: Medium, Target: alongside Wave)
- Wire automated drift detection: diff `types/database.types.ts` and a generated schema appendix during CI to catch future mismatches.
- Formalize Phase D in `RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md` with owners, timeline, and acceptance criteria (schema migrated, docs updated, Supabase types regenerated).

### 4. When to Re-evaluate Entire Schema
Re-evaluation becomes necessary only if:
- Product chooses to keep the leaner schema (e.g., no `casino_id` on tables, telemetry stored as JSON) because it prefers simplified data structures; or
- Teams cannot commit engineering time for the migrations above inside the Phase D window.

If either condition holds, we must update the bounded context definitions instead of the schema, effectively redefining ownership. That would require a rewrite of `SERVICE_RESPONSIBILITY_MATRIX.md`, removal of conflicting patterns, and new service contracts. Until such a decision is made, the recommended path is to **treat the schema as fixable** and proceed with the targeted remediation waves outlined here.

---

*This report should sit alongside Phase C validation artifacts. Please link it in `RESPONSIBILITY_MATRIX_REMEDIATION_WORKFLOW.md` once remediation scope is agreed.*
