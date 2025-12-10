# Security & Access (SEC/RBAC)

**ID Prefix**: `SEC-###`
**Owner**: Security
**Phase**: Discovery, Design, Build, Test, Release, Operate, Evolve

## Purpose

Enforces least-privilege and compliance through RLS/RBAC matrix, secrets handling, and data classification.

## What Belongs Here

- **RLS Policies**: Row-Level Security rules and patterns
- **RBAC Matrix**: Role-based access control definitions
- **Threat Model**: Security risk analysis
- **Secrets Runbook**: Credential management and rotation
- **Data Classification**: Sensitivity levels and handling requirements
- **Security Standards**: Authentication, authorization patterns
- **Compliance Documentation**: Regulatory requirements (AML/CTR for PT-2)
- **Security Testing Plans**: Penetration testing, vulnerability scans

## Document Format

```yaml
---
id: SEC-010
title: RLS Policy Matrix - Casino Scoped Tables
owner: Security
status: Accepted
affects: [ARCH-012, API-005]
created: 2025-10-25
last_review: 2025-10-25
---
```

## Current Documents

- `SEC-001` — Casino-Scoped RLS Policy Matrix (`SEC-001-rls-policy-matrix.md`) ✅ ADR-015 compliant
- `SEC-002` — Casino-Scoped Security Model (`SEC-002-casino-scoped-security-model.md`) ✅ ADR-015 compliant
- `SEC-003` — Casino-Scoped RBAC Matrix (`SEC-003-rbac-matrix.md`)
- `SEC-005` — Role Taxonomy (`SEC-005-role-taxonomy.md`)
- `SECURITY_TENANCY_UPGRADE.md` — RLS Pattern Canonicalization Guide ✅ ADR-015 compliant

## Key ADRs

- **ADR-015** — RLS Connection Pooling Strategy (`docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md`)
  - Defines Pattern C (Hybrid) for connection pooling-safe RLS
  - Transaction-wrapped `set_rls_context()` RPC
  - JWT claims fallback for direct client queries

## Related Categories

- **ARCH** (20-architecture): Security architecture patterns
- **API/DATA** (25-api-data): Secure data contracts
- **OPS** (50-ops): Security monitoring and incident response
- **GOV** (70-governance): Security coding standards
