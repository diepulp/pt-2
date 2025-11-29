# Anti-Patterns Snapshot (PT-2)
last_updated: 2025-11-28
sources:
  - docs/70-governance/ANTI_PATTERN_CATALOG.md (full reference)
  - docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md
summary:
  service_layer:
    - Ban `ReturnType` inference; export explicit interfaces for every service factory.
    - Supabase clients must be typed (`SupabaseClient<Database>`); never `any` or unchecked spreads.
    - No class-based services, singletons, or cached state; factories return plain objects.
  type_safety:
    - CRITICAL: Ban ALL `as` type casting for RPC/query responses (V1 violation class)
    - ❌ `data as RatingSlipDTO` - bypasses runtime validation
    - ❌ `data as { slip: X; duration: number }` - RPC shape not validated
    - ✅ Use mapper functions with generated RPC types from `database.types.ts`
    - ✅ Use type guards for complex response validation
  rpc_responses:
    - MUST use `Database['public']['Functions']['rpc_name']['Returns']` type
    - MUST create mapper: `mapToDTO(data: RpcReturns): DTO`
    - MUST validate shape before mapping for complex responses
  implementation:
    - Gate writes through canonical RPCs; block service-to-service calls.
    - Never bypass RLS or create dual DB clients in runtime.
    - No `console.*` in production; use structured logging wrappers.
  security:
    - NEVER trust client-provided context (headers, body) for casino_id
    - ALWAYS derive casino_id from authenticated user's staff record
    - See: `.claude/skills/backend-service-builder/references/security-patterns.md`
  migration:
    - Use Supabase CLI only; migration names follow `YYYYMMDDHHMMSS_description.sql`.
    - Always trigger `NOTIFY pgrst, 'reload schema'` after migration.
  shared_types:
    - DO NOT redefine infrastructure types (see service-patterns.md §Shared Types)
    - ServiceResult<T> → `lib/http/service-response.ts`
    - DomainError → `lib/errors/domain-errors.ts`
    - Database → `types/database.types.ts`
  checklist:
    - [ ] No `ReturnType` or `any`
    - [ ] No `as Type` casting for RPC/query responses
    - [ ] RLS policies verified per SEC-001
    - [ ] Schema types regenerated
    - [ ] Logging sanitized
    - [ ] Casino context derived from auth, not headers
