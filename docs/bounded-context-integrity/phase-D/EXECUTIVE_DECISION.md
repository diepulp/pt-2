## Executive Decision
`In a DDD-aligned SDLC, bounded contexts dictate the schema. You capture the domain’s language and ownership in the SRM, freeze that contract, then realize it as SQL. Your CI enforces the direction of truth with a matrix↔schema diff and regenerated types. That’s how you keep PT-2 from drifting back into “Prisma ghosts” and CamelCase entropy while staying nimble in early stages`

Matrix-first contract. Schema conforms to the matrix.
We will intentionally break/rename to land on a single, boring truth: lower_snake_case schema that exactly matches the bounded contexts in the matrix.

One-time alignment plan (no compat views)

Policy ADR (today)

ADR-000 “Matrix as Contract”: matrix → schema (one-way).

Naming: tables/columns/enums = lower_snake_case.

JSON only for extension; anything used in FKs/RLS/analytics = first-class columns.

Batch A — Normalization & renames

Rename any CamelCase tables/columns to snake_case.

Purge lingering Prisma artifacts (types, casing, model names) and update imports.

Batch B — Restore bounded-context columns & FKs

Casino: status, address jsonb, timestamps; casino_settings.casino_id (unique); staff role/status/employee_id, casino_id.

Game settings: add casino_id, game_type; unique (casino_id, game_type).

TableContext: gamingtable.pit/status; gamingtablesettings scalar limits + rotation_interval; dealer_rotation.table_id FK; replace blobbed inventory fields with structured columns (keep JSON as optional “details”).

Finance: player_financial_transaction.casino_id, computed gaming_day.

Loyalty/RatingSlip seam: pick one:

(Recommended) No cache → remove ratingslip.points from docs; Loyalty is SoT; expose a loyalty_balance view/RPC.

(Alt) Keep cache → re-add ratingslip.points + trigger + nightly reconciliation.

Batch C — Tighten constraints & RLS

Promote new columns to NOT NULL after backfill.

Add uniques/checks (e.g., min_bet <= max_bet).

Update RLS to use new FKs; no using (true).

Tooling guardrails (same PR)

CI step: regenerate types/database.types.ts and fail if not updated.

CI step: matrix↔schema diff (table/column inventory) — fail on drift.

Lint: forbid quoted identifiers / CamelCase in SQL.

Docs sync (same day as migrations)

Update matrix snippets to snake_case table names.

Mark any intentionally dropped fields in a “Matrix v3 change log”.

Concrete deliverables you can open now

PR-1: ADR & CI gates

ADR-000 “Matrix as Contract”.

npm run validate:matrix-schema script (diffs matrix inventory ↔ live DB).

Types regen check in CI.

PR-2: Schema realign SQL

All renames + additive columns/FKs across Casino, TableContext, Finance, Loyalty seam.

Backfill scripts (idempotent) for staff.casino_id, dealer_rotation.table_id, inventory totals from JSON.

Optional: rpc_get_player_balance(player_id) if you drop ratingslip.points.

PR-3: Matrix update

Snake_case everywhere; clarify the Loyalty stance (cache vs no-cache).

Append “Schema Identifier Appendix” generated from DB to prevent future drift.

Why this is the right move for you now

You care about bounded contexts first; the matrix encodes that intent.

You’re pre-prod → safe to make breaking, cleansing changes once.

A single source of truth (matrix → schema) + CI gates keeps you from reliving this drift.