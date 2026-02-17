# PT-2 Agent Memory

## JSONB Boundary Standard (2026-02-04)
- `lib/json/narrows.ts` is the canonical module for `Json ↔ typed` boundary crossing
- Three helpers: `isJsonObject`, `narrowJsonRecord`, `narrowRpcJson<T>`
- Crud.ts files MUST NOT contain `as [A-Z]` — enforced by `.husky/pre-commit-service-check.sh` Check 11
- ESLint `no-dto-type-assertions` custom rule also bans `as SomeResponse` in `services/**/*.ts`
- The correct pattern: crud.ts calls mapper, mapper uses `narrowRpcJson<T>()` from `lib/json/narrows`
- `player-timeline/mappers.ts` re-exports from `lib/json/narrows` (aliased as `toMetadataRecord`)

## Supabase Type System
- Supabase optional RPC params: use `?? undefined` (not `?? null`) — generated types use `param?: type`
- `Json` type exported from `@/types/database.types` (re-export of remote types)
- Direct table inserts require all NOT NULL columns — no DB triggers auto-fill `casino_id`
- `promo_program.casino_id` must come from authoritative RLS context (`mwCtx.rlsContext!.casinoId`)

## Pre-commit Hook Chain
1. `.husky/pre-commit-migration-safety.sh` — RLS regression check
2. `.husky/pre-commit-rpc-lint.sh` — RPC pattern compliance
3. `.husky/pre-commit-api-sanity.sh` — API route checks
4. `.husky/pre-commit-service-check.sh` — 16 service anti-pattern checks
5. `.husky/pre-commit-zustand-check.sh` — Zustand patterns
6. `npm run lint-staged` — ESLint + Prettier

Check 10 (console.*) now excludes `__tests__/` and `.test.ts` files.

## Pre-existing Test Failures
- `rls.test.ts`: 4 tests failing (pre-existing, not caused by type audit)