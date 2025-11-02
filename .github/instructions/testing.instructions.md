# Testing Instructions (DEL/QA)
applyTo: ["**/*"]
scope: quality
docs:
  primary: docs/40-quality/QA-001-service-testing-strategy.md
  supporting:
    - docs/40-quality/QA-002-quality-gates.md
    - docs/40-quality/QA-003-service-testing-patterns.md
rules:
  - Maintain coverage thresholds: service modules ≥90%, DTO transforms 100%, overall ≥80%.
  - Tag integration suites with `.int.test.ts` and ensure RLS-enabled fixtures for casino-scoped data.
  - Keep test doubles typed; no `any` or `ReturnType` leaks.
  - Document test data management and reset steps inside specs or README updates.
validation:
  checklist:
    - coverage_report: "Attach coverage summary path or state unchanged."
    - integration_plan: "Note integration/E2E suites exercised or rationale if none."
    - fixtures: "List fixtures/seeds touched and cleanup guarantees."
    - gate_status: "Confirm CI quality gates that must pass (lint, typecheck, tests)."
