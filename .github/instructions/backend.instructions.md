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
rules:
  - Follow SRM ownership: map each change to the service/domain table in the SRM and keep RLS expectations intact.
  - Use functional factories with explicit interfaces; never rely on `ReturnType` inference.
  - Type Supabase clients as `SupabaseClient<Database>`; regenerate types after schema changes (`npm run db:types`).
  - Route writes through service RPCs or domain factories; block direct table writes unless SRM lists them.
  - Emit telemetry/events per docs/50-ops guidance when new mutations are introduced.
validation:
  checklist:
    - srm_alignment: "Identify the SRM row(s) touched and confirm responsibilities remain accurate."
    - dto_sync: "State whether DTOs required updates; if so, cite file and tests covering them."
    - migration_steps: "If schema changed, list migration file + confirm types regenerated & schema test updated."
    - observability: "Note emitted metrics/logs or confirm none required."
