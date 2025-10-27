# Operations & Reliability (OPS/SRE)

**ID Prefix**: `OPS-###`
**Owner**: SRE/Platform
**Phase**: Design, Build, Test, Release, Operate, Evolve

## Purpose

Keep production healthy and diagnosable through observability specs, runbooks, SLIs/SLOs, and incident processes.

## What Belongs Here

- **Observability Specification**: Logging, metrics, tracing standards
- **Runbooks**: Operational procedures and troubleshooting guides
- **SLIs/SLOs**: Service level indicators and objectives
- **Dashboards**: Monitoring and alerting configurations
- **Incident Process**: On-call playbooks and escalation
- **Incident Templates**: Postmortem structure
- **Deployment Procedures**: Production rollout steps
- **Disaster Recovery**: Backup and restore procedures

## Document Format

```yaml
---
id: OPS-006
title: Service Layer Observability Specification
owner: SRE
status: Accepted
affects: [ARCH-012, API-005]
created: 2025-10-25
last_review: 2025-10-25
---
```

## Current Documents

- **Audit logging patterns** (embedded in SERVER_ACTIONS_ARCHITECTURE.md)
- **Error mapping** (to be documented)
- **Telemetry patterns** (to be documented)

## Related Categories

- **ARCH** (20-architecture): System design for observability
- **SEC** (30-security): Security monitoring
- **QA** (40-quality): Production testing
- **REL** (60-release): Deployment and rollback procedures
