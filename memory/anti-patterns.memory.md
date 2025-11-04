# Anti-Patterns Snapshot (PT-2)
last_updated: 2025-10-17
sources:
  - docs/70-governance/ANTI_PATTERN_CATALOG.md (full reference)
  - docs/patterns/OVER_ENGINEERING_GUARDRAIL.md
summary:
  service_layer:
    - Ban `ReturnType` inference; export explicit interfaces for every service factory.
    - Supabase clients must be typed (`SupabaseClient<Database>`); never `any` or unchecked spreads.
    - No class-based services, singletons, or cached state; factories return plain objects.
  implementation:
    - Gate writes through canonical RPCs; block service-to-service calls.
    - Never bypass RLS or create dual DB clients in runtime.
    - No `console.*` in production; use structured logging wrappers.
  migration:
    - Use Supabase CLI only; migration names follow `YYYYMMDDHHMMSS_description.sql`.
    - Always trigger `NOTIFY pgrst, 'reload schema'` after migration.
  checklist:
    - [ ] No `ReturnType` or `any`
    - [ ] RLS policies verified per SEC-001
    - [ ] Schema types regenerated
    - [ ] Logging sanitized

    
