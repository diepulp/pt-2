# Frontend Instructions (PRD + GOV)
applyTo: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "ui/**/*.{ts,tsx}"]
scope: frontend
docs:
  primary: docs/70-governance/FRONT_END_CANONICAL_STANDARD.md
  supporting:
    - docs/10-prd/README.md
    - docs/40-quality/QA-001-service-testing-strategy.md
rules:
  - Follow React 19 patterns: server components by default, client components only when interaction or state is required.
  - Use shadcn UI primitives; avoid inline styling unless dynamic or documented.
  - Ensure accessibility: manage focus order, aria labels, keyboard navigation; meet WCAG AA budgets.
  - Integrate data through typed server actions + React Query hooks; keep cache keys scoped by `casino_id`.
  - Update acceptance criteria traceability—link UI work to PRD stories and QA plans.
validation:
  checklist:
    - accessibility: "Document accessibility validation (keyboard/focus/ARIA) or list work remaining."
    - data_flow: "Confirm server action + query key touched and caching implications."
    - ui_tests: "List unit/E2E tests added/updated per QA-001 targets."
    - prd_trace: "Reference PRD feature ID or acceptance criteria satisfied."
