# Backend Instructions (ARCH + API/DATA)
applyTo: ["services/**/*.{ts,tsx}", "app/api/**/*.{ts,tsx}", "db/**/*"]
scope: backend
docs:
  primary: docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
  supporting:
    - docs/25-api-data/README.md
    - docs/70-governance/SERVICE_TEMPLATE.md
    - docs/70-governance/ANTI_PATTERN_CATALOG.md
    - docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md
    - docs/70-governance/ERROR_TAXONOMY_AND_RESILIENCE.md
    - docs/30-security/SECURITY_TENANCY_UPGRADE.md
rules:
  - Follow SRM ownership: map each change to the service/domain table in the SRM and keep RLS expectations intact.
  - Use functional factories with explicit interfaces; never rely on `ReturnType` inference.
  - Type Supabase clients as `SupabaseClient<Database>`; regenerate types after schema changes (`npm run db:types`).
  - Route writes through service RPCs or domain factories; block direct table writes unless SRM lists them.
  - Emit telemetry/events per docs/50-ops guidance when new mutations are introduced.

error_handling:
  - Throw DomainError with service-specific error codes (never expose Postgres codes).
  - Map all database errors to domain errors via `mapDatabaseError()`.
  - Financial/loyalty operations MUST use idempotent retry with `withIdempotentRetry()`.
  - Non-idempotent operations set `retry: 0` (no automatic retries).
  - Rate limiting at edge via `withServerAction()` with `endpoint`, `actorId`, `casinoId`.

security_tenancy:
  - NO service keys in runtime (use anon key + user context only).
  - ALL operations inject RLS context via `getAuthContext()` + `injectRLSContext()`.
  - RLS policies MUST use canonical pattern: `auth.uid()` + `current_setting('app.casino_id')`.
  - NO complex OR trees in RLS (single deterministic path only).
  - Append-only ledgers (finance, loyalty) enforce idempotency + block updates/deletes.

validation:
  checklist:
    - srm_alignment: "Identify the SRM row(s) touched and confirm responsibilities remain accurate."
    - dto_sync: "State whether DTOs required updates; if so, cite file and tests covering them."
    - migration_steps: "If schema changed, list migration file + confirm types regenerated & schema test updated."
    - observability: "Note emitted metrics/logs or confirm none required."
    - error_taxonomy: "Confirm domain error codes used (not Postgres codes) per ERROR_TAXONOMY_AND_RESILIENCE.md."
    - security_context: "Verify RLS context injection via withServerAction (no service keys in runtime)."
    - idempotency: "For mutations, confirm idempotency key enforcement or document retry=0."
