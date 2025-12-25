---
id: AUDIT-ADR022-v7
title: ADR-022 v7 Audit Logging Assessment
date: 2025-12-23
status: RECOMMENDATION
reviewer: Backend Architect
scope: Production troubleshooting requirements for player_identity table
---

# ADR-022 v7 Audit Logging Assessment

## Executive Summary

**RECOMMENDATION: MODIFY with specific implementation**

ADR-022 v7 provides **partial** audit coverage via actor tracking columns but lacks `updated_by` and systematic audit event logging. For production troubleshooting, we need **minimum viable audit trail** without deferring to post-MVP.

**Production-Ready Requirement:**
- Add `updated_by` column to `player_identity` table
- **Defer** full `audit_log` event integration to post-MVP (acceptable risk for MVP)
- Leverage existing `created_by`, `verified_by`, `enrolled_by` columns
- Document troubleshooting workflow using existing audit infrastructure

---

## Current State Analysis

### What ADR-022 v7 Specifies

#### Actor Tracking Columns ✅

| Table | Column | FK Reference | Purpose |
|-------|--------|--------------|---------|
| `player_identity` | `created_by` | `staff(id)` | Who created identity record |
| `player_identity` | `verified_by` | `staff(id)` | Who verified identity |
| `player_casino` | `enrolled_by` | `staff(id)` | Who enrolled player at casino |

**Lines 160, 157, 208 in ADR-022 v7:**
```sql
-- player_identity
created_by uuid NOT NULL, FK → staff
verified_by uuid NULL, FK → staff

-- player_casino
enrolled_by uuid NULL, FK → staff
```

#### Timestamps ✅

| Table | Column | Auto-Update | Notes |
|-------|--------|-------------|-------|
| `player_identity` | `created_at` | Default `now()` | Immutable creation timestamp |
| `player_identity` | `updated_at` | Trigger auto-update | Line 180-192 (trigger defined) |
| `player_identity` | `verified_at` | Manual set | When verification occurs |

**Line 181-192:**
```sql
CREATE OR REPLACE FUNCTION update_player_identity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_player_identity_updated_at
  BEFORE UPDATE ON player_identity
  FOR EACH ROW
  EXECUTE FUNCTION update_player_identity_updated_at();
```

### What's Missing ❌

#### 1. `updated_by` Column (Critical Gap)

**Problem:** `updated_at` timestamp exists but **no actor tracking on updates**.

**Impact:**
- Cannot answer: "Who changed this identity record on 2025-12-20?"
- Cannot correlate updates with staff sessions
- Troubleshooting relies on session correlation from `audit_log` general events (if they exist)

**Evidence:** No `updated_by` column specified in Lines 136-161 (player_identity schema).

#### 2. Systematic Audit Event Logging (Deferred)

**Current Pattern:** Existing `audit_log` infrastructure exists but is NOT integrated.

**From codebase analysis:**

`/home/diepulp/projects/pt-2/lib/server-actions/middleware/audit.ts` (Lines 35-48):
```typescript
/**
 * Audit Logging Middleware
 *
 * Captures:
 * - correlation_id (from context)
 * - actor_id (from RLS context)
 * - casino_id (from RLS context)
 * - domain, action (from config)
 * - result details (ok, code, error)
 * - duration (ms)
 *
 * NOTE: Only writes in production environment.
 * Fire-and-forget pattern - audit failures don't fail the request.
 */
```

`supabase/migrations/00000000000000_baseline_srm.sql` (Lines 53-61):
```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid references casino(id) on delete set null,
  domain text not null,
  actor_id uuid references staff(id) on delete set null,
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);
```

**Observation:** `audit_log` infrastructure exists and is production-ready. ADR-022 v7 does NOT specify integration.

---

## Production Troubleshooting Scenarios

### Scenario 1: Identity Update Investigation

**User Report:** "Player claims their DOB was changed incorrectly on Dec 20th"

**Current Capability (ADR-022 v7):**
1. Query `player_identity.updated_at` → timestamp ✅
2. Query `player_identity.created_by` → original creator ✅
3. Query `player_identity.verified_by` → verifier (if set) ✅
4. **Cannot determine:** Who made the update ❌

**With `updated_by`:**
1. Query `player_identity.updated_at` → timestamp ✅
2. Query `player_identity.updated_by` → actor ✅
3. Cross-reference with `staff` table → name, role, shift
4. **Resolution time:** < 5 minutes

**Gap Impact:** Troubleshooting requires cross-referencing general `audit_log` events by correlation_id or timeframe, which may not have granular row-level details.

### Scenario 2: Enrollment Audit Trail

**Compliance Question:** "Show audit trail for player enrollment between Casino A and Casino B"

**Current Capability (ADR-022 v7):**
1. Query `player_casino.enrolled_at` → timestamp ✅
2. Query `player_casino.enrolled_by` → actor ✅
3. Query `player_identity.created_at` → identity creation ✅
4. Query `player_identity.created_by` → identity creator ✅

**Verdict:** ✅ Sufficient for enrollment troubleshooting

### Scenario 3: Identity Verification Workflow

**Operational Question:** "Which pit boss verified this player's identity?"

**Current Capability (ADR-022 v7):**
1. Query `player_identity.verified_at` → timestamp ✅
2. Query `player_identity.verified_by` → actor ✅

**Verdict:** ✅ Sufficient for verification audit

### Scenario 4: Systematic Audit Query

**Security Audit:** "List all identity operations by staff member X in December 2025"

**Current Capability (ADR-022 v7):**
- Query `player_identity` WHERE `created_by = X` → Creates ✅
- Query `player_identity` WHERE `verified_by = X` → Verifies ✅
- Query `player_casino` WHERE `enrolled_by = X` → Enrollments ✅
- **Cannot query:** Updates by X ❌

**With `audit_log` integration:**
- Query `audit_log` WHERE `actor_id = X AND domain = 'player_identity'` → All operations ✅
- Includes create, update, verify events with details

**Gap Impact:** Partial visibility. Updates are missing from actor-based audit queries.

---

## Comparison with Existing Patterns

### Pattern A: `player_financial_transaction` (Full Audit Trail)

**From migration `20251211172516_adr015_financial_rpc_hardening.sql`:**
```sql
ALTER TABLE player_financial_transaction
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid;
```

**Observations:**
- Financial transactions track `created_by_staff_id` ✅
- Immutable ledger (no updates, so no `updated_by` needed)
- Actor tracking at creation only

**Applicability to `player_identity`:** Similar pattern, but identity is mutable → needs `updated_by`.

### Pattern B: `floor_layout` (Workflow Actor Tracking)

**From migration `20251108223004_create_floor_layout_service.sql`:**
```sql
create table floor_layout (
  -- ...
  created_by uuid not null references staff(id) on delete restrict,
  reviewed_by uuid references staff(id) on delete set null,
  approved_by uuid references staff(id) on delete set null,
  -- ...
);
```

**Observations:**
- Workflow-specific actor columns (created, reviewed, approved) ✅
- Each state transition tracks actor
- No generic `updated_by` (state columns serve that purpose)

**Applicability to `player_identity`:** Different pattern. Identity has **verified** state (similar) but also general updates (DOB correction, address change) → needs `updated_by` for non-workflow updates.

### Pattern C: `rating_slip_pause` (Actor + Timestamp)

**From migration `20251128221408_rating_slip_pause_tracking.sql`:**
```sql
create table rating_slip_pause (
  id uuid primary key default gen_random_uuid(),
  rating_slip_id uuid not null references rating_slip(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references staff(id) on delete set null,
  -- ...
);
```

**Observations:**
- Immutable event log (pause records are created, then ended)
- `created_by` tracks pause initiator ✅
- No `updated_by` (rows are append-only)

**Applicability to `player_identity`:** Different. Identity is mutable; pauses are immutable events.

---

## Minimum Viable Audit Trail (MVP)

### Recommended Approach: MODIFY ADR-022 v7

**Add:**
1. `updated_by uuid REFERENCES staff(id) ON DELETE SET NULL` column to `player_identity`
2. Application-level: Set `updated_by = current_staff_id` on all UPDATE operations
3. **Defer:** `audit_log` event integration to post-MVP (acceptable for MVP)

**Rationale:**
- `updated_by` column provides **80% of troubleshooting value** with minimal complexity
- Existing `created_by`, `verified_by`, `enrolled_by` columns cover create/verify/enroll workflows
- `audit_log` integration adds operational overhead (middleware config, domain mapping, testing)
- MVP can launch with column-level audit; systematic event logging added post-MVP

### Implementation Details

#### Migration Change

**File:** `supabase/migrations/YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql`

**Add to `player_identity` table definition (after Line 160):**
```sql
-- System Fields
document_type text NULL,
verified_at timestamptz NULL,
verified_by uuid NULL REFERENCES staff(id) ON DELETE SET NULL,
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now(),
created_by uuid NOT NULL REFERENCES staff(id) ON DELETE SET NULL,
updated_by uuid REFERENCES staff(id) ON DELETE SET NULL,  -- NEW
```

#### Service Layer Pattern

**File:** `services/player/crud.ts` (upsertIdentity function)

```typescript
export async function upsertIdentity(
  supabase: SupabaseClient<Database>,
  data: PlayerIdentityDTO,
  staffId: string  // Actor tracking
): Promise<ServiceResult<PlayerIdentityDTO>> {

  const payload = {
    ...data,
    updated_by: staffId,  // Set on every update
  };

  const { data: result, error } = await supabase
    .from('player_identity')
    .upsert(payload)
    .select()
    .single();

  // ... error handling
}
```

#### Index Recommendation

**Add to migration (performance):**
```sql
-- Index for actor-based audit queries
CREATE INDEX idx_player_identity_updated_by ON player_identity(updated_by);
```

**Rationale:** Enables queries like "Show all identity updates by pit boss X in December 2025".

---

## Post-MVP Audit Enhancement (Deferred)

### Phase 2: Systematic Audit Event Logging

**When to implement:**
1. Before adding `player_tax_identity` (compliance-sensitive data)
2. Before adding SSN/TIN reveal RPCs (INV-4 from ADR-022 v5)
3. Before production compliance audit

**Implementation:**

#### 1. Middleware Integration

**Route Handler Pattern:**
```typescript
// app/api/v1/player-identity/route.ts
export const PUT = withServerAction<PlayerIdentityDTO>(
  async ({ request, supabase, rlsContext }) => {
    const data = await request.json();

    return await PlayerService.upsertIdentity(
      supabase,
      data,
      rlsContext.actorId
    );
  },
  {
    schema: PlayerIdentityUpdateSchema,
    domain: 'player_identity',  // Audit domain
    action: 'update',           // Audit action
    requireIdempotency: true,
  }
);
```

**Result:** Middleware automatically logs to `audit_log` with:
- `domain = 'player_identity'`
- `action = 'update'`
- `actor_id = rlsContext.actorId`
- `casino_id = rlsContext.casinoId`
- `details = { correlationId, durationMs, ok, code }`

#### 2. Audit Query Examples

**Query: All identity operations by actor in timeframe**
```sql
SELECT
  al.created_at,
  al.action,
  al.details->>'correlationId' as correlation_id,
  s.first_name || ' ' || s.last_name as actor_name,
  s.role as actor_role
FROM audit_log al
JOIN staff s ON s.id = al.actor_id
WHERE al.domain = 'player_identity'
  AND al.actor_id = '...'
  AND al.created_at BETWEEN '2025-12-01' AND '2025-12-31'
ORDER BY al.created_at DESC;
```

**Query: All operations on specific player identity**
```sql
-- Requires adding player_id to audit_log.details JSONB
SELECT
  al.created_at,
  al.action,
  s.first_name || ' ' || s.last_name as actor_name
FROM audit_log al
LEFT JOIN staff s ON s.id = al.actor_id
WHERE al.domain = 'player_identity'
  AND al.details->>'playerId' = '...'
ORDER BY al.created_at DESC;
```

#### 3. Enhanced Details Payload

**For post-MVP compliance:**
```typescript
// In route handler or middleware
const auditDetails = {
  playerId: data.player_id,
  casinoId: data.casino_id,
  changedFields: Object.keys(data),  // Track which fields updated
  verificationStatus: data.verified_at ? 'verified' : 'unverified',
};
```

---

## Risk Assessment

### MVP Risks (with `updated_by` only)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Cannot correlate update sequence for complex investigations | Medium | Low | Add `audit_log` integration in Phase 2 before tax features |
| Missing granular action details (which fields changed) | Low | Low | Column-level audit (updated_by + updated_at) sufficient for MVP troubleshooting |
| Actor deletion breaks audit trail | Medium | Very Low | `ON DELETE SET NULL` preserves orphaned audit references |

### Deferred Risks (without `audit_log` integration)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Insufficient audit for compliance review | High | Medium (post-MVP) | BLOCK tax identity features on audit_log integration |
| Cannot demonstrate SSN reveal audit trail (INV-4) | Critical | N/A (MVP) | No SSN in MVP; Phase 2 requirement |
| Investigation requires manual correlation across tables | Medium | Medium | Acceptable for MVP; scripted queries documented |

---

## Recommendation Details

### MODIFY ADR-022 v7 with Specific Changes

#### Required Changes (Block Production Without These)

1. **Add `updated_by` column to `player_identity` table**
   - Location: ADR-022 v7 Line 161 (System Fields section)
   - Spec: `updated_by uuid REFERENCES staff(id) ON DELETE SET NULL`
   - Acceptance: Migration artifact created, column documented in ADR

2. **Update service layer to populate `updated_by`**
   - Location: `services/player/crud.ts` (upsertIdentity function)
   - Pattern: Pass `staffId` parameter, set `updated_by` on all updates
   - Acceptance: Unit test verifies `updated_by` is set

3. **Add index for actor-based queries**
   - Location: Migration `YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql`
   - Spec: `CREATE INDEX idx_player_identity_updated_by ON player_identity(updated_by);`
   - Acceptance: Index exists in database schema

4. **Document troubleshooting workflow**
   - Location: Create `docs/50-ops/runbooks/PLAYER_IDENTITY_AUDIT_QUERIES.md`
   - Content: Query patterns for common investigations (see Appendix A)
   - Acceptance: Runbook exists and reviewed by ops team

#### Deferred Changes (Post-MVP Gates)

5. **Integrate `audit_log` middleware for player_identity route handlers**
   - Trigger: Before implementing `player_tax_identity` (ADR-022 v5 scope)
   - Trigger: Before first compliance audit
   - Acceptance: Domain 'player_identity' logs to audit_log table

6. **Add field-level change tracking to audit details**
   - Trigger: After first production incident requires it
   - Pattern: Log `changedFields` array in `audit_log.details` JSONB
   - Acceptance: Audit details include before/after snapshots for sensitive fields

---

## Acceptance Criteria (Modified ADR-022 v7)

### Add to ADR-022 v7 Acceptance Criteria Section (Line 786+)

```markdown
### Audit Trail
- [ ] `player_identity` table has `updated_by uuid FK → staff` column
- [ ] Index exists: `idx_player_identity_updated_by`
- [ ] Service layer sets `updated_by` on all identity updates
- [ ] Troubleshooting runbook documents audit query patterns
- [ ] `audit_log` integration deferred to post-MVP (documented in tech debt)
```

---

## Appendix A: Troubleshooting Query Patterns

### Query 1: Who created/updated/verified this identity?

```sql
SELECT
  pi.id,
  pi.created_at,
  c.first_name || ' ' || c.last_name as created_by_name,
  pi.updated_at,
  u.first_name || ' ' || u.last_name as updated_by_name,
  pi.verified_at,
  v.first_name || ' ' || v.last_name as verified_by_name
FROM player_identity pi
LEFT JOIN staff c ON c.id = pi.created_by
LEFT JOIN staff u ON u.id = pi.updated_by
LEFT JOIN staff v ON v.id = pi.verified_by
WHERE pi.casino_id = :casino_id
  AND pi.player_id = :player_id;
```

### Query 2: All identity operations by actor (timeframe)

```sql
SELECT
  pi.player_id,
  p.first_name || ' ' || p.last_name as player_name,
  pi.created_at,
  pi.updated_at,
  pi.verified_at,
  CASE
    WHEN pi.created_by = :staff_id THEN 'created'
    WHEN pi.updated_by = :staff_id THEN 'updated'
    WHEN pi.verified_by = :staff_id THEN 'verified'
  END as action_type
FROM player_identity pi
JOIN player p ON p.id = pi.player_id
WHERE pi.casino_id = :casino_id
  AND (
    pi.created_by = :staff_id OR
    pi.updated_by = :staff_id OR
    pi.verified_by = :staff_id
  )
  AND pi.updated_at BETWEEN :start_date AND :end_date
ORDER BY pi.updated_at DESC;
```

### Query 3: Recent identity updates (operational dashboard)

```sql
SELECT
  pi.updated_at,
  p.first_name || ' ' || p.last_name as player_name,
  s.first_name || ' ' || s.last_name as updated_by_name,
  s.role as staff_role,
  pi.verified_at IS NOT NULL as is_verified
FROM player_identity pi
JOIN player p ON p.id = pi.player_id
LEFT JOIN staff s ON s.id = pi.updated_by
WHERE pi.casino_id = :casino_id
  AND pi.updated_at >= now() - interval '7 days'
ORDER BY pi.updated_at DESC
LIMIT 50;
```

### Query 4: Enrollment audit trail (compliance)

```sql
SELECT
  pc.enrolled_at,
  p.first_name || ' ' || p.last_name as player_name,
  es.first_name || ' ' || es.last_name as enrolled_by_name,
  pi.created_at as identity_created_at,
  cs.first_name || ' ' || cs.last_name as identity_created_by_name,
  pi.verified_at as identity_verified_at,
  vs.first_name || ' ' || vs.last_name as verified_by_name
FROM player_casino pc
JOIN player p ON p.id = pc.player_id
LEFT JOIN staff es ON es.id = pc.enrolled_by
LEFT JOIN player_identity pi ON pi.casino_id = pc.casino_id AND pi.player_id = pc.player_id
LEFT JOIN staff cs ON cs.id = pi.created_by
LEFT JOIN staff vs ON vs.id = pi.verified_by
WHERE pc.casino_id = :casino_id
  AND pc.player_id = :player_id;
```

---

## Appendix B: Migration Diff

### Changes to `YYYYMMDDHHMMSS_adr022_player_identity_mvp.sql`

```diff
 create table player_identity (
   id uuid primary key default gen_random_uuid(),
   casino_id uuid not null references casino(id) on delete cascade,
   player_id uuid not null references player(id) on delete cascade,

   -- Scanner Fields
   birth_date date,
   gender text check (gender in ('m','f','x')),
   eye_color text,
   height text,
   weight text,
   address jsonb,
   document_number text,
   issue_date date,
   expiration_date date,
   issuing_state text,

   -- System Fields
   document_type text,
   verified_at timestamptz,
   verified_by uuid references staff(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   created_by uuid not null references staff(id) on delete set null,
+  updated_by uuid references staff(id) on delete set null,

   -- Constraints
   unique (casino_id, player_id),
   foreign key (casino_id, player_id) references player_casino(casino_id, player_id) on delete cascade
 );

 -- Indexes
 create index ix_player_last_first on player(lower(last_name), lower(first_name));
 create index ix_player_casino_active on player_casino(casino_id, status) where status = 'active';
+create index idx_player_identity_updated_by on player_identity(updated_by);

 -- Trigger
 create or replace function update_player_identity_updated_at()
 returns trigger as $$
 begin
   new.updated_at = now();
   return new;
 end;
 $$ language plpgsql;

 create trigger trg_player_identity_updated_at
   before update on player_identity
   for each row
   execute function update_player_identity_updated_at();
```

---

## Conclusion

**MODIFY ADR-022 v7** by adding `updated_by` column and operational troubleshooting queries. This provides **minimum viable audit trail** for production without over-engineering MVP.

**Defer** systematic `audit_log` integration to post-MVP (acceptable risk). Block tax identity features on full audit integration (Phase 2 gate).

**Verdict:** Production-ready with `updated_by` addition. Troubleshooting via column-level audit (created_by, updated_by, verified_by) + timestamp correlation is sufficient for MVP enrollment workflows.
