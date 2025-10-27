# Architecture Decision Records (ADR)

**ID Prefix**: `ADR-###`
**Owner**: Authoring Team
**Phase**: All phases

## Purpose

Traceability and avoiding "why did we do this?" rework through immutable logs of decisions with context and trade-offs.

## What Belongs Here

- **Architecture Decisions**: Technical choices and rationale
- **Trade-off Analysis**: Options considered and reasons for selection
- **Context**: Problem statement and constraints
- **Consequences**: Impacts and follow-up actions
- **Status Tracking**: Proposed → Accepted → Superseded → Deprecated

## Document Format

```markdown
# ADR-### - [Title]

**Status**: Proposed | Accepted | Superseded | Deprecated
**Date**: YYYY-MM-DD
**Supersedes**: ADR-XXX (if applicable)
**Superseded By**: ADR-YYY (if applicable)

## Context

What is the issue we're trying to solve?

## Decision

What did we decide to do?

## Rationale

Why did we choose this approach?

## Consequences

What are the impacts (positive, negative, neutral)?

## Alternatives Considered

What other options did we evaluate and why did we reject them?

## References

- Related ADRs
- External documentation
- Code examples
```

## Current Documents

- **ADR-000-matrix-as-contract.md**
- **ADR-003-state-management-strategy.md**
- **ADR-004-real-time-strategy.md**
- **ADR-007-api-surface-catalogue.md**
- **ADR-008-service-layer-architecture.md**
- **ADR-009-balanced-architecture-intake.md**
- **ADR-010-dto-compliance-gate.md**
- **ADR-011-over-engineering-guardrail.md**

## ADR Status Summary

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| ADR-000 | Matrix as Contract | Accepted | - |
| ADR-003 | State Management Strategy | Accepted | - |
| ADR-004 | Real-time Strategy | Accepted | - |
| ADR-007 | API Surface Catalogue | Accepted | - |
| ADR-008 | Service Layer Architecture | Accepted | - |
| ADR-009 | Balanced Architecture Intake | Accepted | - |
| ADR-010 | DTO Compliance Gate | Accepted | - |
| ADR-011 | Over-Engineering Guardrail | Accepted | - |

## Related Categories

All categories can reference ADRs for decision context. ADRs inform:
- **ARCH** (20-architecture): Architectural choices
- **API/DATA** (25-api-data): API design decisions
- **GOV** (70-governance): Process and standards decisions
- **SEC** (30-security): Security approach decisions
