# Project Memory (PT-2)
decisions:
  - "2025-10-20: Adopt SRM v3.0.2 with casino-scoped RLS patterns."
  - "2025-11-02: Security docs extracted into SEC-001..003; RBAC matrix formalized."
  - "2025-11-03: Added agents compiler + codex hooks baseline to enforce scaffold drift detection."
patterns:
  worked:
    - "Vertical slice delivery: service factory + typed server actions + React Query."
    - "Schema verification test preventing DTO drift."
  pitfalls:
    - "Past use of `ReturnType` inference in services."
    - "Unscoped RLS checks causing cross-casino leakage."
nextSteps:
  - "Backfill threat model and secrets runbook (SEC docs)."
  - "Author performance budget + accessibility plan (QA docs)."
  - "Wire CI automation for `npm run agents:check` + archive approval/tool logs."
