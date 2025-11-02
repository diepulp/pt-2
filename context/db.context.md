# Database & Migration Context
docs:
  - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
  - docs/integrity/INTEGRITY_FRAMEWORK.md
  - docs/40-quality/QA-001-service-testing-strategy.md
  - docs/70-governance/SERVICE_TEMPLATE.md
principles:
  - "Schema-first: regenerate types via `npm run db:types` after each migration."
  - "Follow migration naming convention `YYYYMMDDHHMMSS_description.sql`."
  - "Enable RLS by default; write policies per SEC-001."
  - "Schema verification tests must pass; update DTOs and fixtures."
  - "Use Supabase CLI with NOTIFY to refresh PostgREST caches."
checklist:
  - "List tables/enums changed and SRM owners."
  - "State RLS policy adjustments and affected roles."
  - "Confirm migration applied locally + rollback plan documented."
