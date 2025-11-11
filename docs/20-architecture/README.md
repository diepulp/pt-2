# Architecture & System Patterns (ARCH)

**ID Prefix**: `ARCH-###`
**Owner**: Architecture
**Phase**: All phases (primary: Design, Build, Operate, Evolve)

## Purpose

Prevents drift and informs RLS, services, and APIs through system diagrams, bounded contexts (SRM), integration contracts, and non-functional requirements.

## What Belongs Here

- **Service Responsibility Matrix (SRM)**: Canonical bounded context contract
- **Edge Transport & Middleware Policy**: Server Action vs Route Handler contract, middleware chain, required headers
- **Service Layer Isolation & CQRS Guidance**: DTO-only cross-context access rules and CQRS-light instructions for telemetry domains
- **Service Layer Diagram**: Visual architecture reference
- **Context Map**: Domain relationships and integration patterns
- **System Architecture Diagrams**: High-level component views
- **Non-Functional Requirements (NFRs)**: Performance, scalability, reliability targets
- **Integration Contracts**: Service-to-service communication patterns
- **Data Flow Diagrams**: Information movement across contexts

## Document Format

```yaml
---
id: ARCH-012
title: Service Layer Architecture Diagram v1.0
owner: Architecture
status: Accepted
affects: [API-003, SEC-004, ADR-029]
created: 2025-10-25
last_review: 2025-10-25
---
```

## Current Documents

- **SERVICE_RESPONSIBILITY_MATRIX.md** (in patterns/, canonical source)
- **EDGE_TRANSPORT_POLICY.md** (this folder, ingress/middleware contract)
- **(this doc)** for Service Layer Isolation & CQRS guidance summary
- **SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md** (in system-prd/)
- **BALANCED_ARCHITECTURE_QUICK.md** (patterns/)
- Context maps and diagrams (to be created)

## Related Categories

- **PRD** (10-prd): Requirements informing architecture
- **API/DATA** (25-api-data): API contracts implementing architecture
- **SEC** (30-security): Security patterns enforcing architecture
- **GOV** (70-governance): Architectural standards and patterns
- **ADR** (80-adrs): Architecture decisions and rationale
