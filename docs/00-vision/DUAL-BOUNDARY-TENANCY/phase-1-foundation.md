I've fully absorbed both artifacts and audited every file Phase 1 touches. Here's the synthesis.

---

## Phase 1 Foundation — Current State & Implementation Plan

### What already works
- **`company` table exists** (baseline migration) — `id`, `name`, `legal_name`, `created_at`
- **`casino.company_id` FK exists** — nullable, references `company(id)`
- **`player` table is already global** — no `casino_id`, correct design
- **`player_casino` junction** supports multi-property enrollment
- **Company RLS is deny-by-default** (migration `20260208140546`) — only `service_role` / SECURITY DEFINER can access

### What's missing (5 deliverables)

| # | Deliverable | Current State | Files to Touch |
|---|-------------|---------------|----------------|
| **D1** | Backfill company rows | `company` table has 0 rows; all `casino.company_id` = NULL | New migration |
| **D2** | Extend `rpc_bootstrap_casino` | 3 params (name, tz, gaming_day_start); no company awareness | New migration amending RPC |
| **D3** | Amend `set_rls_context_from_staff()` to derive `app.company_id` | Returns `(actor_id, casino_id, staff_role)` — no company_id | New migration amending RPC |
| **D4** | Update `lib/supabase/rls-context.ts` | `RLSContext` has `actorId, casinoId, staffRole` — no `companyId` | `lib/supabase/rls-context.ts` |
| **D5** | Bootstrap form + service layer | No company_name field in UI, DTO, schema, or server action | `bootstrap-form.tsx`, `dtos.ts`, `schemas.ts`, `crud.ts`, `_actions.ts` |

### Migration Strategy (single atomic migration)

```
Migration 1: backfill_company_bootstrap_context
├── 1. INSERT company row per existing casino (name = casino.name)
├── 2. UPDATE casino SET company_id = <new company.id>
├── 3. ALTER casino ALTER COLUMN company_id SET NOT NULL (enforce going forward)
├── 4. CREATE OR REPLACE rpc_bootstrap_casino — add p_company_name DEFAULT NULL
│     └── When NULL → auto-create company with casino_name
│     └── When provided → find-or-create company by name
├── 5. CREATE OR REPLACE set_rls_context_from_staff
│     └── JOIN casino → company to derive company_id
│     └── SET LOCAL 'app.company_id'
│     └── RETURNS TABLE adds company_id column
└── 6. Regenerate types (npm run db:types-local)
```

### Key Architectural Constraints
1. **`app.company_id` derived server-side only** — from `casino.company_id` via staff→casino→company JOIN. Never from client input (ADR-024 INV-8).
2. **Backward-compatible** — `p_company_name DEFAULT NULL` means existing callers are unaffected. Auto-company creation ensures no casino is ever orphaned again.
3. **`company_id SET NOT NULL`** after backfill — prevents future orphans.
4. **Company RLS stays deny-by-default** — authenticated users still cannot query `company` directly (Phase 3 concern).
5. **Single-casino users unaffected** — `app.company_id` is set but no policies consume it yet.

### Gate Criteria (from investigation)
- All casinos have non-null `company_id` (query audit)
- `set_rls_context_from_staff()` returns `company_id` for all active staff
- Existing flows (bootstrap, login, RLS context injection) pass unchanged

---

Ready to begin implementation. Want me to start with the migration, or should we produce an ADR-041 / PRD-050 first as the investigation recommends?