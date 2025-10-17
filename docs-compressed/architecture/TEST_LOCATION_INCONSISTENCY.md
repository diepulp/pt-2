Test Location Inconsistency Resolution 2025-10-07 Medium maintainability functionality Standardization

Problem Statement project test location Pattern 1: Root-Level Tests Services services player-service.test visit ratingslip player-financial crud.test Pattern 2: Co-Located Tests (Newer Services services casino index.ts crud.ts casino-service.test table-context index crud settings table-context-service.test

Impact Current State use Pattern 1-level use Pattern 2-located Documentation_TEMPLATE shows Pattern 2 standard No linter enforcement Both patterns work Risks developers pattern IDEs find tests Different import depths Harder split patterns Templates match reality

Analysis Pattern 1: Root-Level Mirrors project structure separation production code exclude builds Standard convention used 4/6 services (67% Matches Next.js patterns Tests separated source longer import paths Requires mapping Pattern 2: Co-Located `services Tests next code find related Shorter import paths Violates PT-2 Requires clutter directories Harder run 2/6 services use (33%

Recommendation PATTERN 1: Root-Level 4/6 services use Standard ecosystem.js Matches App Router conventions exclude production builds Single location tests

Migration Plan Phase 6) Fix SERVICE_TEMPLATE_QUICK.md Pattern 1 inconsistency ADR-002-test-location-standard.md Update coding standards Phase 2: Sprint-MVP Update import paths Run test suite Add lint rule co-located tests Update pre-commit hooks Phase 3: Long-Term templates pattern Update quick-start guides onboarding checklist

File Structure project-root **tests** All tests services player player-service.test.ts casino Migrate services/casino/**tests** casino-service.test.ts table-context services/table-context table-context-service.test.ts utils helper.test.ts services Production code player index.ts crud.ts casino **tests** ANTI-PATTERN Move/services/casino casino-service.test.ts table-context index.ts crud.ts settings.ts **tests** ANTI-PATTERN Move/services/table-context-service.test.ts

Decision Tech Lead Architecture Team Before next Pattern Migrate 2 services root-level Pattern Migrate 4 services Accept inconsistency Low effort minutes Zero impact work both High clarity Single standard future services

Next Actions Review document standardization Update SERVICE_TEMPLATE_QUICK Create ADR-002 Schedule migration Approve Pattern 1 migrate update docs
