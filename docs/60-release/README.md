# Change & Release (REL/CHANGE)

**ID Prefix**: `REL-###`
**Owner**: Release Manager
**Phase**: Design, Build, Test, Release, Operate, Evolve

## Purpose

Safe, reversible delivery through versioning, release notes, rollout/rollback procedures, and feature flags.

## What Belongs Here

- **Release Notes**: User-facing change documentation
- **Rollout Plans**: Phased deployment strategy
- **Backout Plans**: Rollback procedures and criteria
- **Feature Flags**: Toggle configuration and strategy
- **Versioning Strategy**: Semantic versioning and compatibility
- **Migration Guides**: Upgrade paths for breaking changes
- **Deprecation Policy**: EOL timeline and migration support
- **Release Checklists**: Pre-release validation steps

## Document Format

```yaml
---
id: REL-003
title: MVP Release Plan - Phase 1
owner: Release Manager
status: Accepted
affects: [PRD-001, OPS-006, QA-008]
created: 2025-10-25
last_review: 2025-10-25
---
```

## Current Documents

- **Deprecation policies** (embedded in SRM)
- **Migration naming standards** (MIGRATION_NAMING_STANDARD.md)
- **Release phases** (to be documented from SDLC_MVP_ROADMAP.md)

## Related Categories

- **PRD** (10-prd): Features being released
- **OPS** (50-ops): Deployment procedures
- **QA** (40-quality): Release quality gates
- **GOV** (70-governance): Release process standards
