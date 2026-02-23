---
id: EXEC-###
title: "Exec Spec: <Feature Name>"
owner: <engineer>
status: Draft
date: YYYY-MM-DD
prd_ref: docs/10-prd/PRD-###-<slug>.md
adr_refs: []
---

# Exec Spec: <Feature Name>

> This document contains implementation details. It is allowed to churn.
> Changes here should NOT invalidate the PRD.

## 1) Implementation Overview

Brief summary of what gets built, referencing PRD for requirements and ADR(s) for mechanism decisions.

- **PRD:** (link)
- **ADR(s):** (links)

## 2) Database Changes

### 2.1 New tables

### 2.2 Migrations

- Migration file: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`

### 2.3 RLS policies

### 2.4 RPCs (SECURITY DEFINER)

## 3) Service Layer

### 3.1 Bounded context

- Context name:
- SRM registration: (version)

### 3.2 Service files

| File | Purpose |
|------|---------|
| `services/<domain>/dtos.ts` | |
| `services/<domain>/schemas.ts` | |
| `services/<domain>/crud.ts` | |
| `services/<domain>/http.ts` | |
| `services/<domain>/mappers.ts` | |
| `services/<domain>/keys.ts` | |
| `services/<domain>/index.ts` | |

## 4) API Routes

| Method | Path | Auth | Idempotency | Description |
|--------|------|------|-------------|-------------|
| | | | | |

## 5) Frontend Components

| File | Purpose |
|------|---------|
| | |

### 5.1 React hooks

| File | Purpose |
|------|---------|
| | |

## 6) Data Flow

```
(ASCII diagram of end-to-end flow)
```

## 7) Security Posture

| Control | Implementation | Reference |
|---------|---------------|-----------|
| | | |

## 8) Test Plan

### Unit tests (Jest)

- [ ] ...

### Integration tests

- [ ] ...

### E2E tests (Playwright)

- [ ] ...

## 9) Rollout Plan

- [ ] Migration applied
- [ ] Types regenerated (`npm run db:types-local`)
- [ ] SRM updated
- [ ] Feature flag (if applicable)
- [ ] Monitoring/alerts configured

## 10) Known Gaps / Deviations from PRD

| PRD Specification | Implementation | Rationale |
|-------------------|---------------|-----------|
| | | |

## Links

- Feature Scaffold:
- Design Brief/RFC:
- ADR(s):
- PRD:
