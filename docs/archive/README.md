# Archive - Superseded Documentation

This directory contains historical versions of architectural documentation that have been superseded by newer versions.

## Purpose

- **Preserve historical context**: Understanding architectural evolution
- **Git-like versioning**: Immutable historical decisions
- **Reference for comparisons**: See what changed and why

## Naming Convention

```
{ORIGINAL_NAME}_v{VERSION}_{DESCRIPTION}_{DATE}.md
```

**Example**: `SERVICE_RESPONSIBILITY_MATRIX_v1.0_pre-loyalty_2025-10-06.md`

## Current Archives

### Service Responsibility Matrix

| Version | Date | Status | Canonical Version |
|---------|------|--------|-------------------|
| [v1.0 Pre-Loyalty](./SERVICE_RESPONSIBILITY_MATRIX_v1.0_pre-loyalty_2025-10-06.md) | 2025-10-06 | Archived | [v2.0](../patterns/SERVICE_RESPONSIBILITY_MATRIX.md) (2025-10-12) |

**Key Difference v1.0 → v2.0**:
- v1.0: RatingSlip listed as owning "points" without clarification
- v2.0: Loyalty service added, point calculation ownership clarified (reward policy vs telemetry)

## Usage Guidelines

1. **Always reference current version** in new code/docs
2. **Use archived versions** for:
   - Understanding design evolution
   - Historical context in PRs/issues
   - Comparing architectural decisions
3. **Do NOT update** archived files (they are immutable snapshots)

## Archive Policy

Documents are archived when:
- Major architectural changes render them obsolete
- Bounded context definitions change significantly
- Integration patterns are fundamentally revised

Documents are **NOT** archived for:
- Minor corrections or typos
- Clarifications that don't change meaning
- Formatting improvements

Use Git history for non-major changes.

---

**Last Updated**: 2025-10-12
**Maintained By**: Architecture Team
