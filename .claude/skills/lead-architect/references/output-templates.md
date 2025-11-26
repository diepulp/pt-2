# PT-2 Architectural Output Templates

## Overview

Standardized templates for all architectural deliverables. Use these to ensure consistency and completeness across all architectural work.

---

## 1. Architecture Brief Template

Use for all architectural proposals (new features, refactors, tech debt).

```markdown
# [Feature/System Name] Architecture

## Context & Scope

### Problem Statement
[1-2 paragraphs describing what problem this architecture solves]

### Affected Domains
- [Domain 1]: [Impact description]
- [Domain 2]: [Impact description]

### In Scope
- [Specific component 1]
- [Specific component 2]
- [Specific flow or feature]

### Out of Scope
- [What we're explicitly not addressing]
- [Future considerations marked as out of scope]

## Constraints & Assumptions

### Technical Constraints
- **Stack:** Next.js 15, React 19, Supabase
- **Database:** PostgreSQL with RLS
- **Deployment:** [Vercel/other]
- **Performance:** [Target latency, throughput requirements]

### Business Constraints
- **Timeline:** [If relevant]
- **Budget:** [If relevant]
- **Compliance:** [GDPR, SOC2, etc. if relevant]

### Assumptions
1. [Assumption about existing system]
2. [Assumption about user behavior]
3. [Assumption about data volume]

## Current State Assessment

### Existing Architecture
[Brief description of relevant current architecture]

### Documentation Gaps Identified
- [Gap 1]: [Location and description]
- [Gap 2]: [Location and description]

### Technical Debt Relevant to This Change
- [Debt item 1]: [Impact on this work]
- [Debt item 2]: [Impact on this work]

## Proposed Architecture

### High-Level Design

[Textual description of the proposed solution]

### Component Diagram

\`\`\`mermaid
graph TD
    A[Client] -->|API Request| B[API Route]
    B -->|Calls| C[Service Layer]
    C -->|Query| D[(Database)]
    D -->|RLS Policy| E[Filtered Results]
    E -->|Returns| C
    C -->|Response| B
    B -->|JSON| A
\`\`\`

### Data Flow

1. **Input:** [What triggers this flow]
2. **Processing:**
   - Step 1: [Service/component responsible]
   - Step 2: [Service/component responsible]
   - Step 3: [Service/component responsible]
3. **Output:** [What is returned/persisted]

### Invariants

Critical properties that must remain true:

1. [Invariant 1 - e.g., "User can only see their own data"]
2. [Invariant 2 - e.g., "Total debits must equal credits"]
3. [Invariant 3 - e.g., "Deleted records are soft-deleted, never hard-deleted"]

## Alternatives Considered

### Option A: [Alternative approach name]
- **Pros:** [Benefits]
- **Cons:** [Drawbacks]
- **Reason not chosen:** [Why we rejected this]

### Option B: [Alternative approach name]
- **Pros:** [Benefits]
- **Cons:** [Drawbacks]
- **Reason not chosen:** [Why we rejected this]

## Risks & Open Questions

### Risks
1. **[Risk category]:** [Description and mitigation]
2. **[Risk category]:** [Description and mitigation]

### Open Questions
1. [Question requiring business input]
2. [Question requiring technical spike]

---

## 2. SRM (Service Responsibility Matrix) Update Template

```markdown
## Service Responsibility Matrix Update

### Service: [service-name]

**Domain:** [Bounded context - e.g., Authentication, Billing, Inventory]

**Responsibility:**
[Single-sentence description of what this service owns]

**Owns:**
- **Data:** [Tables/entities this service is authoritative for]
- **Business Rules:** [Key business logic encapsulated]
- **API Surface:** [Routes/endpoints this service exposes]

**Dependencies:**
- **Calls:** [Other services this service depends on]
- **Called By:** [Services/clients that use this service]
- **External:** [Third-party APIs or services]

**Data Model:**
- Primary tables: `table_name_1`, `table_name_2`
- Foreign keys to: [Other domains/services]
- Owned by: [Team or domain owner]

**Non-Responsibilities:**
[Explicitly what this service does NOT do to prevent scope creep]

**Changes from Previous Version:**
- [What changed in this update]
- [Rationale for change]

**Location in Codebase:**
- Service implementation: `lib/services/[service-name]/`
- API routes: `app/api/v1/[service-name]/`
- Types: `types/[service-name].types.ts`
```

---

## 3. API Surface Specification Template

```markdown
## API Surface: [Endpoint Name]

### Endpoint
`[METHOD] /api/v1/[resource]/[action]`

### Purpose
[One sentence describing what this endpoint does]

### Authentication
- **Required:** Yes/No
- **Roles:** [user, admin, service_account, etc.]
- **RLS:** [How RLS applies]

### Request

**Headers:**
\`\`\`
Authorization: Bearer [token]
Content-Type: application/json
\`\`\`

**Path Parameters:**
- `id` (string, required): [Description]

**Query Parameters:**
- `filter` (string, optional): [Description]
- `page` (number, optional): [Description, default value]

**Body:**
\`\`\`typescript
interface CreateResourceRequest {
  name: string;              // Required, 1-100 chars
  description?: string;      // Optional
  metadata: {
    key: string;
    value: string;
  }[];
  related_id: string;        // UUID, foreign key to other_table
}
\`\`\`

### Response

**Success (200 OK):**
\`\`\`typescript
interface CreateResourceResponse {
  data: {
    id: string;              // UUID
    name: string;
    description: string | null;
    metadata: { key: string; value: string }[];
    related_id: string;
    created_at: string;      // ISO 8601
    updated_at: string;      // ISO 8601
  };
  message: string;
}
\`\`\`

**Error Responses:**

**400 Bad Request:**
\`\`\`json
{
  "error": "Validation failed",
  "details": [
    { "field": "name", "message": "Name is required" }
  ]
}
\`\`\`

**403 Forbidden:**
\`\`\`json
{
  "error": "Insufficient permissions"
}
\`\`\`

**404 Not Found:**
\`\`\`json
{
  "error": "Resource not found"
}
\`\`\`

**500 Internal Server Error:**
\`\`\`json
{
  "error": "Internal server error",
  "request_id": "uuid"
}
\`\`\`

### Validation Rules
1. [Rule 1 - e.g., "Name must be unique per user"]
2. [Rule 2 - e.g., "Related ID must exist in other_table"]
3. [Rule 3 - e.g., "User must own related resource"]

### Side Effects
- [What else happens - e.g., "Sends notification email"]
- [What else happens - e.g., "Updates cache"]
- [What is logged - e.g., "Audit log entry created"]

### Rate Limiting
- [Rate limit - e.g., "100 requests per minute per user"]

### Example Usage

\`\`\`bash
curl -X POST https://api.example.com/api/v1/resources \\
  -H "Authorization: Bearer TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Example Resource",
    "metadata": [{"key": "env", "value": "production"}],
    "related_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
\`\`\`
```

---

## 4. Schema Change Template

```markdown
## Schema Changes: [Feature Name]

### Migration File
**Filename:** `[YYYYMMDDHHMMSS]_[description].sql`
**Location:** `supabase/migrations/`

### Tables Affected

#### New Table: `table_name`

\`\`\`sql
CREATE TABLE public.table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) >= 1 AND length(name) <= 100),
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_table_name_user_id ON public.table_name(user_id);
CREATE INDEX idx_table_name_created_at ON public.table_name(created_at DESC);

-- RLS Policies
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own records"
  ON public.table_name FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own records"
  ON public.table_name FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own records"
  ON public.table_name FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own records"
  ON public.table_name FOR DELETE
  USING (auth.uid() = user_id);

-- Updated at trigger
CREATE TRIGGER set_table_name_updated_at
  BEFORE UPDATE ON public.table_name
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
\`\`\`

#### Modified Table: `existing_table`

**Changes:**
- Added column: `new_column TEXT`
- Added index: `idx_existing_table_new_column`
- Modified constraint: [Description]

\`\`\`sql
ALTER TABLE public.existing_table
  ADD COLUMN new_column TEXT;

CREATE INDEX idx_existing_table_new_column
  ON public.existing_table(new_column);
\`\`\`

### Data Model Changes

**Relationships:**
- `table_name.user_id` → `auth.users.id` (many-to-one)
- `table_name.related_id` → `other_table.id` (many-to-one, optional)

**Invariants:**
1. [Invariant enforced by DB - e.g., "Name length between 1-100 chars"]
2. [Invariant enforced by RLS - e.g., "Users can only see own records"]
3. [Invariant enforced by FK - e.g., "Related ID must exist or be null"]

### Type Updates

**After migration, run:**
\`\`\`bash
npm run db:types
\`\`\`

**New types available:**
\`\`\`typescript
import { Database } from '@/types/database.types';

type TableName = Database['public']['Tables']['table_name']['Row'];
type TableNameInsert = Database['public']['Tables']['table_name']['Insert'];
type TableNameUpdate = Database['public']['Tables']['table_name']['Update'];
\`\`\`

### Data Migration

**Required data migration:** Yes/No

If yes:
\`\`\`sql
-- Example: Backfill new column with default values
UPDATE public.existing_table
SET new_column = 'default_value'
WHERE new_column IS NULL;
\`\`\`

### Rollback Plan

\`\`\`sql
-- To rollback this migration:
DROP TABLE IF EXISTS public.table_name CASCADE;

ALTER TABLE public.existing_table
  DROP COLUMN IF EXISTS new_column;
\`\`\`

### Testing Checklist

- [ ] Migration runs successfully on local db
- [ ] Types regenerated with `npm run db:types`
- [ ] Schema verification test passes
- [ ] RLS policies tested with different user roles
- [ ] Foreign key constraints validated
- [ ] Indexes verified for query performance
```

---

## 5. ADR (Architecture Decision Record) Template

```markdown
# ADR-[XXX]: [Decision Title]

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** YYYY-MM-DD
**Deciders:** [Names or roles of people involved]
**Tags:** [domain, component, pattern]

## Context

[Describe the problem or requirement that necessitates this decision. Include relevant background, constraints, and forces at play.]

### Problem Statement
[Clear articulation of the problem being solved]

### Goals
- [Goal 1]
- [Goal 2]

### Non-Goals
- [What this decision explicitly does not address]

## Decision

[State the decision clearly and concisely. This should be actionable.]

We will [decision statement].

### Rationale

[Explain WHY this decision makes sense given the context and constraints.]

1. [Reason 1]
2. [Reason 2]
3. [Reason 3]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]
- [Benefit 3]

### Negative
- [Tradeoff 1 and how we'll mitigate]
- [Tradeoff 2 and how we'll mitigate]

### Neutral
- [Change that's neither positive nor negative]

## Alternatives Considered

### Alternative 1: [Name]
- **Description:** [How it would work]
- **Pros:** [Benefits]
- **Cons:** [Drawbacks]
- **Reason not chosen:** [Why rejected]

### Alternative 2: [Name]
- **Description:** [How it would work]
- **Pros:** [Benefits]
- **Cons:** [Drawbacks]
- **Reason not chosen:** [Why rejected]

## Implementation Notes

### Affected Components
- [Component 1]: [How it's affected]
- [Component 2]: [How it's affected]

### Migration Path
[If changing existing architecture, describe how to migrate]

### Validation
[How we'll know the decision is working]

## References

- [Link to related ADRs]
- [Link to documentation]
- [Link to external resources]

## Changelog

- YYYY-MM-DD: Initial proposal
- YYYY-MM-DD: Accepted after team review
- YYYY-MM-DD: Superseded by ADR-XXX (if applicable)
```

---

## 6. Implementation Plan Template

```markdown
## Implementation Plan: [Feature/Change Name]

### Overview
[One paragraph describing what will be implemented]

### Workstreams

#### 1. Database Layer

**Owner:** [Team or person]
**Estimated Complexity:** Low | Medium | High

Tasks:
- [ ] Create migration: `[YYYYMMDDHHMMSS]_[description].sql`
- [ ] Define schema for tables: [table names]
- [ ] Add RLS policies for: [table names]
- [ ] Create database functions if needed: [function names]
- [ ] Add indexes for: [columns and rationale]
- [ ] Run `npm run db:types` to update TypeScript types

**Dependencies:** None

**Validation:**
- [ ] Migration runs successfully on local db
- [ ] RLS policies tested with different user roles
- [ ] Schema verification test passes

---

#### 2. Service Layer

**Owner:** [Team or person]
**Estimated Complexity:** Low | Medium | High

Tasks:
- [ ] Create service: `lib/services/[service-name]/index.ts`
- [ ] Define service interface
- [ ] Implement core business logic
- [ ] Add error handling
- [ ] Add logging/observability hooks
- [ ] Write unit tests

**Dependencies:** Database layer complete

**Validation:**
- [ ] Service layer unit tests pass
- [ ] No anti-patterns (classes, ReturnType, globals)
- [ ] Proper TypeScript types from database.types.ts

---

#### 3. API Layer

**Owner:** [Team or person]
**Estimated Complexity:** Low | Medium | High

Tasks:
- [ ] Create API route: `app/api/v1/[endpoint]/route.ts`
- [ ] Implement request validation
- [ ] Wire up service layer
- [ ] Add error handling and status codes
- [ ] Document API surface
- [ ] Write integration tests

**Dependencies:** Service layer complete

**Validation:**
- [ ] API integration tests pass
- [ ] Request/response types match documentation
- [ ] Error responses follow standards

---

#### 4. Frontend

**Owner:** [Team or person]
**Estimated Complexity:** Low | Medium | High

Tasks:
- [ ] Update types from backend: `npm run db:types`
- [ ] Create UI components: [component names]
- [ ] Implement client-side validation
- [ ] Add error handling and loading states
- [ ] Integrate with API layer
- [ ] Add accessibility features
- [ ] Write component tests

**Dependencies:** API layer complete

**Validation:**
- [ ] Component tests pass
- [ ] Accessibility audit passes
- [ ] UI matches design specs

---

#### 5. Documentation

**Owner:** [Team or person]
**Estimated Complexity:** Low

Tasks:
- [ ] Update SRM in `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`
- [ ] Create/update ADR in `docs/adr/ADR-XXX-[title].md`
- [ ] Update API documentation
- [ ] Add inline code documentation where needed
- [ ] Update README if user-facing changes

**Dependencies:** All implementation complete

**Validation:**
- [ ] Documentation validated against checklist
- [ ] No documentation regressions found

---

### Definition of Done

- [ ] All workstream tasks completed
- [ ] All tests passing (unit, integration, component)
- [ ] Schema verification test passes
- [ ] No anti-patterns introduced
- [ ] Documentation updated atomically
- [ ] Code reviewed and approved
- [ ] Deployed to staging and validated
- [ ] Ready for production deployment

### Rollback Plan

[Describe how to rollback if issues arise in production]

1. [Rollback step 1]
2. [Rollback step 2]
3. [Data considerations]

### Deployment Notes

- **Breaking changes:** Yes/No
- **Requires migration:** Yes/No
- **Deployment order:** [If specific order required]
- **Feature flag:** [If using feature flag]
```

---

## Usage Guidelines

1. **Copy the relevant template** for your architectural task
2. **Fill in all sections** - don't skip sections; write "N/A" if truly not applicable
3. **Be specific** - avoid vague language like "improve" or "enhance"
4. **Include examples** - especially for API specs and schema changes
5. **Cross-reference** - link to related docs, ADRs, and code
6. **Use PT-2 conventions** - follow naming, patterns, and standards
7. **Validate completeness** - run through validation checklist before finalizing
