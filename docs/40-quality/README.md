# Delivery & Quality (DEL/QA)

**ID Prefix**: `QA-###`
**Owner**: QA Lead
**Phase**: Discovery, Design, Build, Test, Release, Operate, Evolve

## Purpose

Ensures done-ness and prevents regressions through test strategy, test plans, coverage goals, and CI gates.

## What Belongs Here

- **Test Strategy**: Overall testing approach and philosophy
- **Test Plans**: Feature-specific test scenarios
- **Quality Gates**: CI/CD enforcement criteria
- **Coverage Goals**: Target metrics for code coverage
- **Performance Budget**: Load time and resource limits
- **Accessibility Checks**: WCAG compliance requirements
- **Testing Standards**: Unit, integration, E2E patterns
- **Test Data Management**: Seed data and fixtures

## Document Format

```yaml
---
id: QA-008
title: Service Layer Testing Strategy
owner: QA
status: Accepted
affects: [ARCH-012, API-005, GOV-001]
created: 2025-10-25
last_review: 2025-10-25
---
```

## Current Documents

- **Testing patterns** (embedded in SERVICE_TEMPLATE.md, to be extracted)
- **Service testing examples** (to be documented)

## Related Categories

- **PRD** (10-prd): Acceptance criteria defining tests
- **API/DATA** (25-api-data): Contract testing
- **OPS** (50-ops): Production testing and synthetic monitoring
- **GOV** (70-governance): Testing standards
