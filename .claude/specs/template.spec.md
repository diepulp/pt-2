---
title: Specification File Template
description: Comprehensive guide for creating implementation-ready specification files
type: meta
version: 1.0.0
created: 2025-10-17
phase: 4
---

# Specification File Template & Creation Guide

> **Purpose**: Create unambiguous, implementation-ready blueprints that any engineer can execute without additional clarification

**Version**: 1.0.0
**Phase**: Agentic Workflow Framework - Phase 4
**Context**: Specifications bridge architecture decisions (Phase 3 workflows) and actual implementation

---

## Table of Contents

1. [What is a Specification File?](#what-is-a-specification-file)
2. [When to Create a Spec](#when-to-create-a-spec)
3. [Spec File Anatomy](#spec-file-anatomy)
4. [Service Specification Template](#service-specification-template)
5. [UI Specification Template](#ui-specification-template)
6. [Feature Specification Template](#feature-specification-template)
7. [Best Practices](#best-practices)
8. [Validation Checklist](#validation-checklist)
9. [Examples](#examples)
10. [Version History](#version-history)

---

## What is a Specification File?

A specification file (`.spec.md`) is an **implementation-ready blueprint** containing:

- **What to build**: Clear requirements and scope
- **How to build it**: Technical approach and patterns
- **What success looks like**: Validation criteria and test requirements
- **Where it fits**: Integration points and dependencies

### Characteristics

**✅ Good Specifications Are**:

- **Unambiguous**: Single interpretation possible
- **Complete**: All required information present
- **Testable**: Clear validation criteria
- **Traceable**: Links to ADRs, patterns, standards
- **Implementable**: Junior engineer can execute independently

**❌ Specifications Are NOT**:

- Implementation code
- Detailed step-by-step tutorials
- Architecture decision documents (that's ADRs)
- Workflow prompts (that's `.prompt.md`)

---

## When to Create a Spec

### Always Create Specs For:

- New services (bounded context definitions)
- New UI features (>2 components)
- Database schema changes (migrations)
- API endpoint additions
- Cross-cutting concerns (auth, logging)

### Skip Specs For:

- Bug fixes (use issue tracker)
- Minor UI tweaks (<2 components)
- Configuration changes
- Documentation updates

### Workflow Integration

```
Architect creates ADR → Architect creates .spec.md → Engineer implements from spec
```

---

## Spec File Anatomy

### YAML Frontmatter (Required)

```yaml
---
# Core Metadata
title: [Feature/Service Name]
description: [One-sentence purpose]
type: service|ui|feature|integration
status: proposed|approved|in_progress|implemented|deprecated
version: 1.0.0
created: YYYY-MM-DD

# Ownership & Context
created_by: architect|service-engineer|ui-engineer
approved_by: [Role who approved]
implements: [Phase or feature area]

# Dependencies (Optional)
depends_on:
  - service: [ServiceName]
  - adr: [ADR-XXX]
  - spec: [other-spec.spec.md]

# Scope (Optional)
estimated_effort: [hours or story points]
priority: critical|high|medium|low
---
```

### Document Sections (Standard)

1. **Overview** - Purpose and context
2. **Requirements** - Functional and non-functional
3. **Technical Approach** - Patterns, architecture
4. **Interface/API Definition** - Contracts
5. **Implementation Details** - File structure, key algorithms
6. **Validation Criteria** - Success checklist
7. **Testing Requirements** - Coverage, test cases
8. **Integration Points** - Dependencies, handoffs
9. **References** - ADRs, patterns, external docs

---

## Service Specification Template

Use this template for service layer implementations.

```markdown
---
title: [ServiceName] Service Specification
description: [One-sentence bounded context]
type: service
status: proposed
version: 1.0.0
created: YYYY-MM-DD
created_by: architect
implements: Service Layer (Phase 2)
---

# [ServiceName] Service Specification

## Bounded Context

**Key Question**: "[What question does this service answer?]"

**Ownership**: [Brief description of data/logic ownership]

## Requirements

### Functional Requirements

- [ ] [Requirement 1]
- [ ] [Requirement 2]
- [ ] [Requirement 3]

### Non-Functional Requirements

- **Performance**: [Target response times]
- **Scalability**: [Expected load]
- **Security**: [Auth, validation, RLS requirements]
- **Reliability**: [Error handling, recovery]

## Data Ownership

### OWNS

- `table_name`: [Description]
- Computed field: `calculated_value` - [Logic]

### REFERENCES

- `other_table` (ServiceName): [Usage]

### DOES NOT OWN

- `table_x` (OtherService): [Why not]

## Interface Definition

\`\`\`typescript
import type { Database } from "@/types/database.types";
import { SupabaseClient } from "@supabase/supabase-js";

// Primary service interface
export interface [ServiceName]Service {
// CRUD operations
create(data: Create[Entity]): Promise<[Entity]>;
getById(id: string): Promise<[Entity] | null>;
update(id: string, updates: Update[Entity]): Promise<[Entity]>;
delete(id: string): Promise<void>;

// Specialized queries
[customQuery](params: [Params]): Promise<[Result]>;
}

// Supporting types
export interface [Entity] {
id: string;
// ... fields
}

export interface Create[Entity] {
// ... creation fields
}

export interface Update[Entity] {
// ... update fields
}
\`\`\`

## Database Schema

### Required Tables

\`\`\`sql
-- Main table
CREATE TABLE [table_name] (
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
-- ... columns
created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx*[table]*[field] ON [table]([field]);

-- RLS Policies
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

CREATE POLICY "[policy_name]"
ON [table]
FOR [SELECT|INSERT|UPDATE|DELETE]
USING ([condition]);
\`\`\`

### Computed Fields (Optional)

\`\`\`sql
ALTER TABLE [existing_table]
ADD COLUMN [computed_field] [TYPE] GENERATED ALWAYS AS ([expression]) STORED;
\`\`\`

## Business Rules

1. **[Rule Category 1]**
   - [Rule 1.1]
   - [Rule 1.2]

2. **[Rule Category 2]**
   - [Rule 2.1]
   - [Rule 2.2]

## Implementation Requirements

### File Organization

\`\`\`
services/[service-name]/
├── index.ts # Public API export
├── crud.ts # Database operations
├── business.ts # Business logic
└── queries.ts # Specialized queries
\`\`\`

### Patterns to Follow

1. **Functional Factory**
   \`\`\`typescript
   export function create[ServiceName]Service(
   supabase: SupabaseClient<Database>
   ): [ServiceName]Service {
   // Implementation
   }
   \`\`\`

2. **Explicit Interfaces** (NO `ReturnType`)
3. **Type Safety** (`SupabaseClient<Database>`, never `any`)
4. **Separation**: CRUD in crud.ts, business logic in business.ts

### Anti-Patterns to Avoid

- ❌ NO class-based services
- ❌ NO `ReturnType` inference
- ❌ NO global singletons
- ❌ NO service-to-service direct calls
- ❌ NO `console.*` in production code

### Performance Targets

- Simple CRUD: <50ms
- Complex queries: <100ms
- Batch operations: <200ms

## Test Requirements

### Unit Tests

\`\`\`
**tests**/services/[service-name]/
├── crud.test.ts # CRUD operations
├── business.test.ts # Business logic
└── queries.test.ts # Specialized queries
\`\`\`

### Test Coverage

**Minimum**: 80% lines, branches, functions
**Ideal**: 90%+

### Test Cases (CRUD)

- [ ] Create: Happy path
- [ ] Create: Validation errors
- [ ] Read: Found
- [ ] Read: Not found
- [ ] Update: Success
- [ ] Update: Not found
- [ ] Delete: Success
- [ ] Delete: Not found

### Test Cases (Business Logic)

- [ ] [Business rule 1]: Success
- [ ] [Business rule 1]: Edge cases
- [ ] [Business rule 2]: Success
- [ ] [Business rule 2]: Failure scenarios

## Integration Points

### With Other Services

\`\`\`typescript
// Example: Client orchestrates service calls
async function [featureName](params) {
const entityA = await serviceA.getById(params.id);
const entityB = await [serviceName].create(entityA.data);
return { entityA, entityB };
}
\`\`\`

### With UI Layer

- **API Routes**: `app/api/[resource]/route.ts`
- **Server Actions**: `app/actions/[resource].ts`
- **React Query Hooks**: `app/hooks/use-[resource].ts`

## Migration Strategy

### Phase 1: Schema (Week X)

\`\`\`bash
supabase migration new [description]

# Apply: npx supabase migration up

# Regenerate types: npm run db:types

\`\`\`

### Phase 2: Service Implementation (Week X)

- Implement following SERVICE_TEMPLATE_QUICK
- Write tests
- Validate with anti-pattern checklist

### Phase 3: Integration (Week X)

- Connect to dependent services
- Integrate with UI
- End-to-end testing

## Validation Criteria

Before marking complete:

- [ ] All interface methods implemented
- [ ] Functional factory pattern used
- [ ] No anti-patterns detected
- [ ] Test coverage ≥80%
- [ ] All business rules validated in tests
- [ ] Performance targets met
- [ ] Integration points working
- [ ] service-catalog.memory.md updated
- [ ] SERVICE_RESPONSIBILITY_MATRIX updated

## References

- **Service Template**: `docs/patterns/SERVICE_TEMPLATE_QUICK.md`
- **Service Matrix**: `docs/patterns/SERVICE_RESPONSIBILITY_MATRIX.md`
- **Architecture**: `docs/system-prd/CANONICAL_BLUEPRINT_MVP_PRD.md` §3.3
- **Related ADRs**: [ADR-XXX]

---

**Status**: [proposed|approved|implemented]
**Created By**: architect.chatmode
**Approved By**: [Pending|Name]
**Implementation Target**: [Phase X / Week Y]
```

---

## UI Specification Template

Use this template for UI component/feature implementations.

```markdown
---
title: [Feature Name] UI Specification
description: [One-sentence feature description]
type: ui
status: proposed
version: 1.0.0
created: YYYY-MM-DD
created_by: architect|ui-engineer
implements: UI Layer (Phase 3)
depends_on:
  - service: [ServiceName]
---

# [Feature Name] UI Specification

## Feature Overview

**Purpose**: [What problem does this UI solve?]

**User Story**: As a [role], I want to [action] so that [benefit].

## Requirements

### Functional Requirements

- [ ] [User can do X]
- [ ] [System displays Y when Z]
- [ ] [Validation rule for input A]

### Non-Functional Requirements

- **Performance**: [Page load <2s, interaction <100ms]
- **Accessibility**: [WCAG 2.1 AA compliance]
- **Responsive**: [Mobile-first, breakpoints]
- **Browser Support**: [Chrome, Firefox, Safari, Edge]

## User Flows

### Primary Flow

1. User [action 1]
2. System [response 1]
3. User [action 2]
4. System [response 2]
5. Outcome: [Success state]

### Alternative Flows

- **Error Case**: [What happens if X fails]
- **Empty State**: [What shows when no data]
- **Loading State**: [What shows during async operations]

## Component Breakdown

### Component Hierarchy

\`\`\`
[FeaturePage]
├── [FeatureHeader]
│ ├── [Title]
│ └── [ActionButton]
├── [FeatureContent]
│ ├── [DataTable]
│ │ ├── [TableRow]
│ │ └── [TablePagination]
│ └── [FilterPanel]
└── [FeatureFooter]
\`\`\`

### Component Specifications

#### Component: [ComponentName]

**Purpose**: [What this component does]

**Props**:
\`\`\`typescript
interface [ComponentName]Props {
[prop1]: [type];
[prop2]?: [type]; // Optional
on[Event]: ([params]) => void;
}
\`\`\`

**State** (if applicable):

- `[stateName]`: [purpose and type]

**Behavior**:

- [Interaction 1] → [Outcome]
- [Validation rule]
- [Error handling]

**Styling**:

- Uses shadcn/ui: [component-name]
- Custom styles: [description]

## API Integration

### Data Fetching

\`\`\`typescript
// React Query hook
function use[Resource]() {
return useQuery({
queryKey: ['[resource]', [params]],
queryFn: () => [serviceName].[method]([params])
});
}
\`\`\`

### Mutations

\`\`\`typescript
function use[Action]() {
return useMutation({
mutationFn: ([params]) => [serviceName].[method]([params]),
onSuccess: () => {
// Invalidate queries
queryClient.invalidateQueries(['[resource]']);
}
});
}
\`\`\`

## Form Validation

### Schema (Zod)

\`\`\`typescript
import { z } from "zod";

const [formName]Schema = z.object({
[field1]: z.string().min(1, "Required"),
[field2]: z.number().positive(),
[field3]: z.enum(["option1", "option2"])
});

type [FormName]Values = z.infer<typeof [formName]Schema>;
\`\`\`

### Validation Rules

- **[Field 1]**: [Validation rule]
- **[Field 2]**: [Validation rule]

### Error Messages

- `[field].required`: "[User-friendly message]"
- `[field].invalid`: "[User-friendly message]"

## UI States

### Loading State

- Show skeleton loaders for [components]
- Disable form inputs during submission
- Display loading spinner for [action]

### Error State

- Toast notification for [error type]
- Inline error for [form validation]
- Error boundary for [component crash]

### Empty State

- Message: "[No data message]"
- CTA: "[Action to take]"
- Illustration: [Optional]

### Success State

- Toast: "[Success message]"
- Redirect to: [page/section]
- Update UI: [optimistic update]

## Accessibility

### Keyboard Navigation

- Tab order: [sequence]
- Shortcuts: [key combinations]
- Focus indicators: [visible outline]

### Screen Readers

- ARIA labels: [specific labels]
- ARIA live regions: [dynamic content]
- Semantic HTML: [heading structure]

### Color & Contrast

- Text contrast ratio: ≥4.5:1
- Interactive elements: ≥3:1
- Focus indicators: ≥3:1

## Responsive Behavior

### Breakpoints

- **Mobile** (<640px): [Layout adjustments]
- **Tablet** (640-1024px): [Layout adjustments]
- **Desktop** (≥1024px): [Layout adjustments]

### Mobile Considerations

- Touch targets: ≥44x44px
- Swipe gestures: [if applicable]
- Viewport meta: `width=device-width`

## Performance Optimization

### Code Splitting

- Lazy load: [heavy components]
- Dynamic imports: [routes]

### Asset Optimization

- Image formats: WebP with fallbacks
- Icon system: shadcn/ui icons
- Font loading: [strategy]

### React Optimization

- Memoization: [expensive computations]
- Virtual scrolling: [long lists]
- Debouncing: [search inputs]

## Implementation Requirements

### File Organization

\`\`\`
app/[feature]/
├── page.tsx # Route page
├── components/
│ ├── [feature]-header.tsx
│ ├── [feature]-content.tsx
│ └── [component].tsx
├── hooks/
│ ├── use-[resource].ts # React Query
│ └── use-[action].ts # Mutations
└── schemas/
└── [form]-schema.ts # Zod validation
\`\`\`

### Dependencies

- shadcn/ui components: [list]
- Icons: lucide-react
- Forms: react-hook-form + zod
- Data fetching: @tanstack/react-query

## Test Requirements

### Unit Tests

\`\`\`
**tests**/app/[feature]/
├── components/
│ └── [component].test.tsx
└── hooks/
└── use-[resource].test.ts
\`\`\`

### Test Cases

- [ ] Component renders correctly
- [ ] Form validation works
- [ ] Submit handler called with correct data
- [ ] Error states display properly
- [ ] Loading states display properly
- [ ] Accessibility: keyboard navigation
- [ ] Accessibility: screen reader labels

### E2E Tests (Cypress/Playwright)

- [ ] User can [complete primary flow]
- [ ] Validation prevents [invalid submission]
- [ ] Error handling for [API failure]

## Validation Criteria

Before marking complete:

- [ ] All components implemented
- [ ] Forms validated with Zod
- [ ] API integration working
- [ ] All UI states handled (loading, error, empty, success)
- [ ] Accessibility requirements met
- [ ] Responsive on mobile/tablet/desktop
- [ ] Test coverage ≥80%
- [ ] Performance targets met

## References

- **UI Patterns**: [shadcn/ui components used]
- **Design System**: [Figma/design reference]
- **API**: [Service spec reference]
- **Related Specs**: [Other UI specs]

---

**Status**: [proposed|approved|implemented]
**Created By**: ui-engineer.chatmode
**Approved By**: [Pending|Name]
**Implementation Target**: [Phase X / Week Y]
```

---

## Feature Specification Template

Use this template for cross-cutting features spanning services + UI.

```markdown
---
title: [Feature Name] Feature Specification
description: [One-sentence feature description]
type: feature
status: proposed
version: 1.0.0
created: YYYY-MM-DD
created_by: architect
implements: [Phase]
depends_on:
  - spec: [service-spec.spec.md]
  - spec: [ui-spec.spec.md]
---

# [Feature Name] Feature Specification

## Feature Overview

**Purpose**: [End-to-end feature description]

**User Value**: [What problem does this solve?]

## Scope

### In Scope

- [Item 1]
- [Item 2]

### Out of Scope

- [Item 1]
- [Item 2]

### Dependencies

- Service: [ServiceName] - [spec reference]
- UI: [Feature Name] - [spec reference]
- External: [API/library]

## Architecture

### Component Interaction

\`\`\`
[UI Component]
↓ (React Query)
[Server Action / API Route]
↓
[Service Layer]
↓
[Database / External API]
\`\`\`

### Data Flow

1. User [action] in UI
2. Client calls [API/action]
3. Server validates with [service]
4. Database updates [table]
5. Response returns to client
6. UI updates via [state management]

## Implementation Phases

### Phase 1: Backend (Week X)

- [ ] Database schema
- [ ] Service implementation
- [ ] API endpoints/actions
- [ ] Tests

### Phase 2: Frontend (Week Y)

- [ ] UI components
- [ ] Forms & validation
- [ ] API integration
- [ ] Tests

### Phase 3: Integration (Week Z)

- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Documentation

## Success Metrics

### Technical Metrics

- API response time: <[X]ms
- Page load time: <[X]s
- Test coverage: ≥80%
- Zero critical bugs

### User Metrics

- Task completion rate: >[X]%
- User satisfaction: >[X]/5
- Adoption rate: >[X]% within [timeframe]

## Validation Criteria

- [ ] All backend specs implemented
- [ ] All frontend specs implemented
- [ ] End-to-end tests passing
- [ ] Performance targets met
- [ ] Accessibility validated
- [ ] Documentation complete

## References

- **Backend Spec**: [service-spec.spec.md]
- **Frontend Spec**: [ui-spec.spec.md]
- **ADR**: [Related ADR]

---

**Status**: [proposed|approved|implemented]
```

---

## Best Practices

### DO ✅

1. **Be Specific**
   - ✅ "API response time <100ms for getById()"
   - ❌ "API should be fast"

2. **Include Examples**
   - Show TypeScript interfaces, not prose descriptions
   - Provide SQL schemas, not "create a table"
   - Include component code snippets

3. **Link to Standards**
   - Reference SERVICE_TEMPLATE_QUICK for service patterns
   - Link to ADRs for architecture decisions
   - Cite PRD sections for requirements

4. **Define Success**
   - Clear validation checklist
   - Measurable criteria (coverage %, response times)
   - Explicit test requirements

5. **Maintain Traceability**
   - Link to ADRs
   - Reference related specs
   - Document dependencies

### DON'T ❌

1. **Be Vague**
   - ❌ "Make it user-friendly"
   - ❌ "Optimize performance"
   - ❌ "Add proper validation"

2. **Over-Specify**
   - ❌ Line-by-line implementation steps
   - ❌ Exact variable names
   - ❌ Implementation details better left to engineer

3. **Forget Non-Functionals**
   - ❌ Missing performance targets
   - ❌ No accessibility requirements
   - ❌ Undefined error handling

4. **Skip Validation**
   - ❌ No test requirements
   - ❌ Unclear success criteria
   - ❌ Missing edge cases

---

## Validation Checklist

Use this before finalizing any spec:

### Completeness

- [ ] All required frontmatter fields present
- [ ] Requirements section complete (functional + non-functional)
- [ ] Technical approach defined
- [ ] Interface/API clearly specified
- [ ] Test requirements documented
- [ ] Validation criteria measurable

### Clarity

- [ ] Can a junior engineer implement without questions?
- [ ] All technical terms defined or referenced
- [ ] No ambiguous language ("should be fast", "user-friendly")
- [ ] Examples provided for complex concepts

### Quality

- [ ] Links to relevant ADRs, patterns, standards
- [ ] Anti-patterns explicitly called out
- [ ] Performance targets specified
- [ ] Accessibility requirements included
- [ ] Security considerations addressed

### Consistency

- [ ] Follows appropriate template (service/UI/feature)
- [ ] Naming conventions match project standards
- [ ] References correct file paths
- [ ] YAML frontmatter valid

---

## Examples

### Example 1: Service Spec Reference

See `.claude/specs/loyalty-service.spec.md` for complete service specification example.

### Example 2: UI Spec Reference

See `.claude/specs/player-loyalty-ui.spec.md` for complete UI specification example.

### Example 3: Feature Spec Reference

See `.claude/specs/visit-tracking-ui.spec.md` for feature specification example.

---

## Version History

| Version | Date       | Changes                   | Author             |
| ------- | ---------- | ------------------------- | ------------------ |
| 1.0.0   | 2025-10-17 | Initial template creation | architect.chatmode |

---

## Usage Instructions

### For Architects

1. Create spec after ADR approval
2. Use appropriate template (service/UI/feature)
3. Fill all sections completely
4. Run validation checklist
5. Submit for approval
6. Mark status as `approved` after sign-off

### For Engineers

1. Read spec thoroughly before starting
2. Ask clarifying questions if anything unclear
3. Implement exactly as specified
4. Use validation criteria as checklist
5. Mark status as `in_progress` → `implemented`

### For Reviewers

1. Verify completeness against checklist
2. Check implementability (junior engineer test)
3. Validate links and references
4. Confirm measurable success criteria
5. Approve or request revisions

---

**Document Status**: Complete
**Last Updated**: 2025-10-17
**Version**: 1.0.0
**Phase**: 4 (Specification Files)

---

**END OF TEMPLATE**
