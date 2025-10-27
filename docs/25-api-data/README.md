# API & Data Contracts (API/DATA)

**ID Prefix**: `API-###`
**Owner**: Backend Lead
**Phase**: Discovery, Design, Build, Test, Release, Operate, Evolve

## Purpose

Stable interfaces for client/server and data lineage through OpenAPI/Swagger, DTOs, DB schema, and event contracts.

## What Belongs Here

- **OpenAPI Specifications**: REST API contracts (`api-surface.openapi.yaml`)
- **API Surface Documentation**: Endpoint catalogue and usage
- **DTO Standards**: Data transfer object patterns
- **Database Schema**: `database.types.ts` generation and migration notes
- **Event Catalog**: Real-time event contracts
- **Schema Diffs**: Migration impact analysis
- **Migration Plans**: Database evolution strategy
- **Type System Documentation**: DTO canonical standards

## Document Format

```yaml
---
id: API-005
title: API Surface MVP Catalogue
owner: Backend
status: Accepted
affects: [ARCH-012, PRD-001, QA-008]
created: 2025-10-25
last_review: 2025-10-25
---
```

## Current Documents

- **api-surface.openapi.yaml** (api-route-catalogue/)
- **API_SURFACE_MVP.md** (api-route-catalogue/)
- **DTO_CANONICAL_STANDARD.md** (patterns/)
- **REAL_TIME_EVENTS_MAP.md** (patterns/)

## Related Categories

- **ARCH** (20-architecture): System design defining APIs
- **SEC** (30-security): RLS and RBAC for data access
- **QA** (40-quality): API contract testing
- **GOV** (70-governance): API design standards
