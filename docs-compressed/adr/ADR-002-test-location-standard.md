ADR Test Location Standardization 2025-10-07 Lead Development Team

Problem Phase 2 service inconsistency test file locations 4 services Visit RatingSlip tests 2 TableContext co-located tests conflicts majority need single standard future development

Decision Drivers Single pattern services Easy tests test exclusion production builds Jest/Next.js conventions Minimal disruption code

Options 1: Root-Level `__tests__/services/ (RECOMMENDED services player-service.test casino-service.test table-context player index.ts crud casino used 67% services Standard Jest convention Clear separation test production code Single directory builds Easier run Matches Next.js App Router conventions Tests separated source Requires mapping longer import paths Low (2 test files move Option 2: Co-Located `services//**tests** services player index.ts crud.ts player-service.test casino index crud casino-service.testTests next code Shorter import paths 33% services use (2/6 Requires ignores Harder Less standard ecosystem High (4 test files import path updates Option 3: Keep Patterns Zero migration effort Confusing Inconsistent codebase Documentation Violates DRY principles enforce standards None confusion

Decision 1 Root-Level/services Rationale 67% services follow pattern Aligns Jest Next.js JavaScript ecosystem distinction production code tests Single directory exclusion exclusions Migration 2 services migration 4 2 Implementation Plan Phase Documentation Document inconsistency TEST_LOCATION_INCONSISTENCY.md Update SERVICE_TEMPLATE_QUICK.md pattern Add warning Casino/TableContext inconsistency SERVICE_TEMPLATE.md_HANDOFF.md Phase Migration Move/casino Update import paths Run test Commit migration message Enforcement 3) Add ESLint rule detect pattern Update pre-commit hook warn co-located tests Add PR review checklist

Consequences Positive services pattern New developers location Easier configure Faster builds test exclusion Negative minutes 2 test files need extra Tests not next source Neutral find tests location No impact test execution

Compliance PRD §3.10 Testing CI Jest/RTL integration tests feature slice supports Standardizing test location Jest practices §4 Anti-Pattern Guardrails decisions deviating PRD documents migration path

References Best Practices/configuration#testmatch-arraystring.js Testing Guide_LOCATION_INCONSISTENCY.md Detailed analysis_TEMPLATE_QUICK.md Updated template

Approval Consensus migration timeline Schedule migration Approval 2025-10-08 Migration Post-MVP 3)
