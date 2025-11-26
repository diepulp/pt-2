# Example Architectural Work

## Purpose

Concrete examples of completed architectural work following PT-2 standards. Use these as references when producing your own architectural deliverables.

---

## Example 1: New Feature - User Notification System

### Architecture Brief

```markdown
# User Notification System Architecture

## Context & Scope

### Problem Statement
Users need to be notified of important system events (e.g., invoice created, payment received, subscription expiring). Currently, notifications are sent ad-hoc via email without persistence, making it impossible to track delivery, view notification history, or support multiple channels.

### Affected Domains
- **Notifications** (new domain): Owns notification persistence and delivery
- **Billing**: Will trigger notifications for invoice/payment events
- **Authentication**: Provides user contact preferences

### In Scope
- Persistent notification storage
- Email delivery via existing email service
- User notification preferences (enable/disable categories)
- Notification history UI for users

### Out of Scope
- Push notifications (mobile apps don't exist yet)
- SMS notifications (not required for MVP)
- Real-time in-app notifications (future consideration)
- Notification templates (will use simple text for MVP)

## Constraints & Assumptions

### Technical Constraints
- **Stack:** Next.js 15, React 19, Supabase
- **Email:** Existing Resend integration
- **Database:** PostgreSQL with RLS
- **Performance:** Notification delivery within 30 seconds

### Business Constraints
- **Timeline:** MVP in 2 weeks
- **Compliance:** GDPR requires opt-out mechanism

### Assumptions
1. Email is sufficient notification channel for MVP
2. Average user receives <10 notifications per day
3. Users will want granular control over notification types
4. Email service (Resend) has 99.9% uptime

## Current State Assessment

### Existing Architecture
Currently, email is sent directly from billing service using helper function `sendEmail()`. No persistence, no retry logic, no audit trail.

### Documentation Gaps Identified
- Billing service not in SRM (needs to be added)
- No documented email contract
- No ADR for email provider choice

### Technical Debt
- Email sending scattered across multiple files
- No error handling for email failures
- No test coverage for email flows

## Proposed Architecture

### High-Level Design

Introduce new Notification Service as bounded context. This service:
1. Persists all notifications to database
2. Checks user preferences before delivery
3. Delegates to channel-specific adapters (email initially)
4. Tracks delivery status and retries

Other services trigger notifications via service layer call, not direct email.

### Component Diagram

\`\`\`mermaid
graph TD
    A[Billing Service] -->|triggerNotification| B[Notification Service]
    C[Other Services] -->|triggerNotification| B
    B -->|checkPreferences| D[(notifications table)]
    B -->|checkPreferences| E[(user_preferences table)]
    B -->|sendEmail| F[Email Adapter]
    F -->|API call| G[Resend]
    B -->|updateStatus| D
    H[User] -->|viewHistory| I[Notifications API]
    I -->|query with RLS| D
\`\`\`

### Data Flow

1. **Trigger:** Service calls `notificationService.trigger({ userId, type, data })`
2. **Processing:**
   - Step 1: Notification Service persists notification record
   - Step 2: Service checks user preferences for notification type
   - Step 3: If enabled, Email Adapter sends email via Resend
   - Step 4: Service updates notification status (sent/failed)
   - Step 5: If failed, retry with exponential backoff (handled by job queue)
3. **Output:** Notification record in database, email sent to user

### Invariants

1. All notifications must be persisted before delivery attempt
2. Users can only view their own notifications (RLS enforced)
3. Notification preferences default to "all enabled"
4. Failed notifications must be retried up to 3 times

## Alternatives Considered

### Option A: Event-Driven with Message Queue
- **Pros:** Better decoupling, easier to scale, built-in retry
- **Cons:** Adds infrastructure complexity (need message queue), overkill for <100 notifications/day
- **Reason not chosen:** YAGNI - current volume doesn't justify message queue

### Option B: Direct Email (No Persistence)
- **Pros:** Simplest implementation, no new tables
- **Cons:** No audit trail, no retry, no notification history for users
- **Reason not chosen:** Fails compliance and UX requirements

## Risks & Open Questions

### Risks
1. **Email deliverability:** Resend might have deliverability issues
   - **Mitigation:** Monitor bounce rates, implement retry logic
2. **Notification volume spike:** If we add many notification types, volume could overwhelm
   - **Mitigation:** Add rate limiting, consider batch sending

### Open Questions
1. Should admins be able to view all notifications for support purposes?
   - **Needs:** Business input on admin access requirements
2. What's the retention policy for old notifications?
   - **Needs:** Legal/compliance review
```

### SRM Update

```markdown
## Service: Notification Service

**Domain:** Notifications

**Responsibility:**
Persist, deliver, and track all system notifications to users across channels (email initially).

**Owns:**
- **Data:** `notifications`, `user_notification_preferences`
- **Business Rules:**
  - Preference checking before delivery
  - Retry logic for failed deliveries
  - Notification categorization
- **API Surface:**
  - POST `/api/v1/notifications` (internal trigger)
  - GET `/api/v1/notifications` (user history)
  - PATCH `/api/v1/notifications/preferences` (user settings)

**Dependencies:**
- **Calls:** Email Service (Resend via adapter)
- **Called By:** Billing Service, Auth Service, future services
- **External:** Resend API

**Data Model:**
- Primary tables: `notifications`, `user_notification_preferences`
- Foreign keys to: `auth.users`
- Owned by: Platform team

**Non-Responsibilities:**
- Does NOT determine when to send notifications (caller decides)
- Does NOT create email templates (uses simple text for MVP)
- Does NOT handle push/SMS (future scope)

**Changes from Previous Version:**
- New service, no previous version

**Location in Codebase:**
- Service implementation: `lib/services/notification/`
- API routes: `app/api/v1/notifications/`
- Types: Derived from `types/database.types.ts`
```

### Schema Changes

```sql
-- Migration: 20251122143000_add_notifications.sql

-- Notification types enum
CREATE TYPE notification_type AS ENUM (
  'invoice_created',
  'payment_received',
  'subscription_expiring',
  'account_update'
);

-- Notification status enum
CREATE TYPE notification_status AS ENUM (
  'pending',
  'sent',
  'failed'
);

-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  status notification_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_status ON public.notifications(status);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- RLS Policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- User notification preferences
CREATE TABLE public.user_notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_created BOOLEAN NOT NULL DEFAULT true,
  payment_received BOOLEAN NOT NULL DEFAULT true,
  subscription_expiring BOOLEAN NOT NULL DEFAULT true,
  account_update BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
  ON public.user_notification_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.user_notification_preferences FOR UPDATE
  USING (auth.uid() = user_id);
```

### ADR

```markdown
# ADR-015: Notification Persistence and Delivery Architecture

**Status:** Accepted
**Date:** 2025-11-22
**Deciders:** Platform team
**Tags:** notifications, email, architecture

## Context

System currently sends emails directly from various services with no persistence, retry logic, or audit trail. Need to support:
- Notification history for users
- GDPR-compliant opt-out
- Delivery tracking
- Future multi-channel support

### Problem Statement
How should we architect notifications to be persistent, trackable, and extensible?

### Goals
- Persist all notifications
- Support user preferences
- Enable notification history
- Prepare for multi-channel (email, push, SMS)

### Non-Goals
- Implementing push/SMS for MVP
- Complex templating system
- Real-time delivery guarantees

## Decision

We will create a dedicated Notification Service that:
1. Persists all notifications before delivery
2. Checks user preferences
3. Delegates to channel-specific adapters
4. Tracks delivery status

### Rationale

1. **Separation of Concerns:** Triggering services don't need to know about delivery mechanisms
2. **Auditability:** All notifications persisted for compliance
3. **Extensibility:** Adapter pattern makes adding channels straightforward
4. **Reliability:** Persistence enables retry logic

## Consequences

### Positive
- Complete audit trail
- Easy to add channels later
- Retry logic out of the box
- Users can view notification history

### Negative
- Additional database tables/complexity
- Notification delivery not immediate (acceptable for email)
- Need to maintain adapter layer

### Neutral
- Services must call notification service instead of sending email directly

## Alternatives Considered

### Alternative 1: Event-Driven with Message Queue
- **Description:** Publish notification events to queue, workers consume and deliver
- **Pros:** Better scaling, built-in retry, decoupled
- **Cons:** Infrastructure complexity (queue), overkill for current volume
- **Reason not chosen:** YAGNI - don't need queue for <100 notifications/day

### Alternative 2: No Persistence (Status Quo)
- **Description:** Continue sending emails directly
- **Pros:** Simple, no new infrastructure
- **Cons:** No audit trail, no history, no retry, fails GDPR
- **Reason not chosen:** Doesn't meet requirements

## Implementation Notes

### Affected Components
- Billing Service: Must call notification service instead of sending email directly
- Auth Service: Provide user preferences
- New Notification Service: All notification logic

### Migration Path
1. Create notification service and tables
2. Update billing service to trigger notifications
3. Deprecate direct email calls
4. Monitor for 2 weeks before removing old code

### Validation
- All notifications appear in database
- User preferences respected
- Retry logic works for failures

## References
- GDPR Article 21 (right to object)
- Resend API docs
```

---

## Example 2: Refactor - Extract Billing Service from Monolith

### Architecture Brief

```markdown
# Extract Billing Service Refactor

## Context & Scope

### Problem Statement
Billing logic is scattered across multiple files in `lib/utils/billing/`. Functions directly query database without service layer abstraction, making it hard to test, reuse, and maintain.

### Affected Domains
- **Billing** (refactored): Will become proper bounded context
- **UI Components** (updated): Currently import from utils, will import from service

### In Scope
- Extract billing logic into service layer
- Define clear service interface
- Maintain backward compatibility during migration
- Update all call sites

### Out of Scope
- Changing billing business logic
- Adding new features
- Rewriting tests (only update imports)

## Current State Assessment

### Existing Architecture
```
lib/utils/billing/
  ├── invoices.ts        # Direct DB queries
  ├── subscriptions.ts   # Direct DB queries
  └── payments.ts        # Direct DB queries

Multiple components import from these utils.
```

### Documentation Gaps
- No SRM entry for billing
- No defined service boundaries
- Anti-pattern: utils contain business logic

### Technical Debt
- Business logic in utils (should be services)
- Direct database access from utils
- No consistent error handling

## Proposed Architecture

### Before
```
Component → Utils → Database
```

### After
```
Component → API Route → Billing Service → Database
```

For server components:
```
Server Component → Billing Service → Database
```

### Migration Strategy
1. Create billing service with same function signatures
2. Update utils to proxy to service (maintain compatibility)
3. Update call sites incrementally
4. Remove utils after all migrated

## Implementation Plan

### Phase 1: Create Service
- [ ] Create `lib/services/billing/index.ts`
- [ ] Define `BillingService` interface
- [ ] Migrate logic from utils
- [ ] Add unit tests

### Phase 2: Proxy Layer
- [ ] Update utils to call service
- [ ] Verify no regressions
- [ ] Deploy and monitor

### Phase 3: Migrate Call Sites
- [ ] Update API routes to use service directly
- [ ] Update server components
- [ ] Mark utils as deprecated

### Phase 4: Cleanup
- [ ] Remove utils files
- [ ] Remove proxy layer
- [ ] Update documentation
```

---

## Example 3: Tech Debt - RLS Policy Audit

### Assessment Brief

```markdown
# RLS Policy Audit and Remediation

## Context

During security review, found multiple tables missing RLS policies or with overly permissive policies.

## Findings

### Critical Issues
1. **`invoices` table:** No RLS policies at all
   - **Risk:** Users can query all invoices
   - **Priority:** P0 - Fix immediately

2. **`payment_methods` table:** Missing DELETE policy
   - **Risk:** Users can delete via direct DB access
   - **Priority:** P1 - Fix this week

### Medium Issues
3. **`subscriptions` table:** SELECT policy too broad
   - **Current:** `organization_id IN (user's orgs)`
   - **Should be:** Only active org members
   - **Priority:** P2 - Fix next sprint

## Remediation Plan

### Immediate (P0)
```sql
-- 20251122150000_fix_invoices_rls.sql
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own invoices"
  ON public.invoices FOR SELECT
  USING (user_id = auth.uid());
```

### This Week (P1)
```sql
-- 20251122151000_fix_payment_methods_delete.sql
CREATE POLICY "Users can delete their own payment methods"
  ON public.payment_methods FOR DELETE
  USING (user_id = auth.uid());
```

### Next Sprint (P2)
- Review organization membership logic
- Create ADR for org-scoped RLS pattern
- Implement consistent policy
```

---

## Key Takeaways

From these examples, note:

1. **Architecture briefs** include context, constraints, and alternatives
2. **SRM updates** clearly define ownership and boundaries
3. **Schema changes** include complete migration with RLS
4. **ADRs** capture decision rationale, not just the decision
5. **Implementation plans** are concrete with checkboxes
6. **Tech debt assessments** prioritize by risk and impact

Use these patterns when producing your own architectural work for PT-2.
