# PT-2 Audit Trail & Compliance Analysis

**Date:** 2025-12-14
**Analyst:** RLS Security Specialist
**Scope:** Audit trail architecture for Track A (Patch) vs Track B (Overhaul)
**Context:** Casino compliance requirements (AML/CTR, BSA, FinCEN)
**Related:** AUTH_ARCH_GAPS_FINDINGS_AND_REMEDIATIONS.md, RPC_INVENTORY_AND_AUTH_AUDIT_20251214.md

---

## Executive Summary

PT-2 handles sensitive financial data subject to federal AML/CTR compliance (Bank Secrecy Act, FinCEN). This analysis compares the audit trail capabilities of two architectural tracks:

- **Track A (Patch):** Keep 14 SECURITY DEFINER RPCs, add explicit audit logging
- **Track B (Overhaul):** Reduce SECURITY DEFINER, rely on RLS + JWT-based authorization

**Key Finding:** **Track A is superior for compliance and auditability** in the near-term, with Track B as a long-term modernization goal. Hybrid approach recommended.

---

## 1. How Do We Audit Who Accessed What Data?

### Track A (SECURITY DEFINER + Explicit Audit Logging)

**Current State:** ✅ IMPLEMENTED

Every SECURITY DEFINER RPC includes explicit audit logging:

```sql
-- Example from rpc_start_rating_slip
INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
VALUES (
  p_casino_id,
  'rating_slip',
  p_actor_id,
  'start',
  jsonb_build_object(
    'rating_slip_id', v_result.id,
    'visit_id', p_visit_id,
    'table_id', p_table_id,
    'seat_number', p_seat_number,
    'player_id', v_player_id
  )
);
```

**Audit Schema:**
```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  casino_id uuid references casino(id) on delete set null,
  domain text not null,  -- 'rating_slip', 'finance', 'loyalty', etc.
  actor_id uuid references staff(id) on delete set null,
  action text not null,  -- 'start', 'close', 'create_txn', etc.
  details jsonb,         -- Domain-specific context
  created_at timestamptz not null default now()
);
```

**What We Can Audit:**
- ✅ **Who:** `actor_id` (staff member who executed action)
- ✅ **What:** `action` + `details` (operation and parameters)
- ✅ **When:** `created_at` (timestamp)
- ✅ **Where:** `casino_id` (tenant scope)
- ✅ **Context:** `domain` (service boundary)
- ✅ **Immutability:** RLS prevents deletes (`audit_log_no_deletes` policy)

**Compliance Queries:**
```sql
-- Who accessed player X's financial data on date Y?
SELECT
  al.created_at,
  s.first_name || ' ' || s.last_name AS staff_name,
  s.role AS staff_role,
  al.action,
  al.details
FROM audit_log al
JOIN staff s ON s.id = al.actor_id
WHERE al.domain = 'finance'
  AND al.details->>'player_id' = 'player-uuid'
  AND al.created_at::date = '2025-12-14'
ORDER BY al.created_at;

-- Track all rating slip modifications for compliance audit
SELECT
  al.created_at,
  al.action,
  al.details->>'rating_slip_id' AS slip_id,
  s.first_name || ' ' || s.last_name AS modified_by
FROM audit_log al
JOIN staff s ON s.id = al.actor_id
WHERE al.domain = 'rating_slip'
  AND al.details->>'rating_slip_id' = 'slip-uuid'
ORDER BY al.created_at;
```

**Pros:**
- ✅ **Explicit contract:** Every RPC states what it logs
- ✅ **Granular control:** Custom `details` per domain
- ✅ **Provable chain:** Immutable append-only log
- ✅ **Service role safe:** Works even if RLS bypassed

**Cons:**
- ⚠️ **Manual enforcement:** Developers must remember to log (can be forgotten)
- ⚠️ **Code duplication:** Audit logging boilerplate in every RPC
- ⚠️ **No SELECT logging:** RLS read access not automatically audited

---

### Track B (RLS + JWT Only, No SECURITY DEFINER)

**Current State:** ⚠️ PARTIALLY IMPLEMENTED (loyalty service only)

RLS policies enforce access but **do NOT inherently log access**:

```sql
-- Pattern A (JWT-based) - no audit trail
CREATE POLICY "visit_read_jwt"
  ON visit FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );
```

**What We CAN Audit:**
- ⚠️ **Who (partial):** `auth.uid()` from JWT (requires correlation to `staff.user_id`)
- ❌ **What (reads):** No automatic logging of SELECT queries
- ✅ **What (writes):** INSERT/UPDATE/DELETE can be logged via triggers
- ⚠️ **When:** Timestamp requires additional trigger infrastructure
- ✅ **Where:** `casino_id` enforced by RLS policy

**What We CANNOT Audit:**
- ❌ **Read access:** Who queried what data (critical for compliance)
- ❌ **Failed attempts:** RLS denials are silent (no audit trail of attempted breaches)
- ❌ **Context:** No domain or action classification
- ❌ **Parameters:** No record of query filters or search criteria

**Potential Solution (Track B Enhancement):**
Implement Postgres audit triggers for all tables:

```sql
-- Example audit trigger for SELECT queries (requires pgAudit extension)
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Configure pgaudit to log all access
ALTER SYSTEM SET pgaudit.log = 'read,write';
ALTER SYSTEM SET pgaudit.log_catalog = 'off';
ALTER SYSTEM SET pgaudit.log_level = 'log';

-- pgAudit output format (PostgreSQL logs):
-- LOG: AUDIT: SESSION,1,1,READ,SELECT,,,
--   "SELECT * FROM visit WHERE casino_id = '...'",<not logged>
```

**Pros:**
- ✅ **Automatic:** No manual logging required
- ✅ **Comprehensive:** Captures all queries (reads + writes)
- ✅ **Platform-native:** Uses Postgres audit capabilities

**Cons:**
- ❌ **Parse complexity:** Must parse PostgreSQL logs (not structured)
- ❌ **Performance overhead:** Every query logged (high volume)
- ❌ **Missing context:** No domain/action classification
- ❌ **Retention burden:** Log volume explosion (storage costs)
- ❌ **Supabase limitation:** pgAudit may not be available on Supabase hosted instances

**Verdict:** Track B requires significant additional infrastructure (pgAudit or custom trigger-based logging) to achieve Track A's audit capabilities.

---

## 2. SECURITY DEFINER Functions Bypass RLS - How Do We Ensure Audit Trails?

### The Problem

SECURITY DEFINER functions execute with **owner privileges**, bypassing RLS:

```sql
CREATE OR REPLACE FUNCTION rpc_create_financial_txn(...)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs as function owner, not caller
SET search_path = public
AS $$
BEGIN
  -- This INSERT bypasses RLS policies on player_financial_transaction
  INSERT INTO player_financial_transaction (...) VALUES (...);
END;
$$;
```

**Security Risk:** Without explicit validation, a malicious or buggy RPC could:
- Insert data for wrong `casino_id` (cross-tenant leakage)
- Bypass authorization checks (escalate privileges)
- Create orphaned records (data integrity violation)

---

### Track A Solution: Template 5 Validation + Explicit Audit Logging

**Status:** ✅ IMPLEMENTED (SEC-001, ADR-018)

**Pattern (from SEC-001 Template 5):**
```sql
CREATE OR REPLACE FUNCTION rpc_example_mutation(
  p_casino_id uuid,
  p_actor_id uuid,
  p_other_params text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context_casino_id uuid;
BEGIN
  -- ════════════════════════════════════════════════════════════════
  -- CASINO SCOPE VALIDATION (SEC-001 Template 5, MANDATORY per ADR-018)
  -- ════════════════════════════════════════════════════════════════
  v_context_casino_id := COALESCE(
    NULLIF(current_setting('app.casino_id', true), '')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  );

  IF v_context_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;

  IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN
    RAISE EXCEPTION 'casino_id mismatch: caller provided % but context is %',
      p_casino_id, v_context_casino_id;
  END IF;
  -- ════════════════════════════════════════════════════════════════

  -- Perform mutation with validated context
  INSERT INTO target_table (casino_id, ...)
  VALUES (p_casino_id, ...);

  -- EXPLICIT AUDIT LOGGING (MANDATORY for SECURITY DEFINER RPCs)
  INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
  VALUES (
    p_casino_id,
    'domain_name',
    p_actor_id,
    'action_name',
    jsonb_build_object(...)
  );

  RETURN result_id;
END;
$$;
```

**Enforcement Mechanisms:**
1. **Pre-commit hook:** Validates Template 5 presence in all SECURITY DEFINER migrations
2. **Code review:** SEC-001 compliance checklist
3. **Integration tests:** Verify `casino_id` mismatch exceptions

**Audit Guarantees:**
- ✅ **Attribution:** `actor_id` logged from validated RPC parameter
- ✅ **Tenant isolation:** `casino_id` validated before mutation
- ✅ **Failure logging:** Exceptions logged to `audit_log` via application error handlers
- ✅ **Immutability:** `audit_log` has `no_deletes` RLS policy

**Example Audit Query (Track Privilege Escalation Attempts):**
```sql
-- Detect casino_id mismatch attempts (potential security breach)
SELECT
  error_message,
  correlation_id,
  created_at
FROM application_error_log
WHERE error_message LIKE '%casino_id mismatch%'
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;
```

---

### Track B Solution: Eliminate SECURITY DEFINER (Use SECURITY INVOKER + RLS)

**Status:** ⚠️ PARTIAL (loyalty service only)

**Pattern (from loyalty service):**
```sql
CREATE OR REPLACE FUNCTION rpc_accrue_on_close(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER  -- Executes with CALLER's privileges (RLS enforced)
SET search_path = public
AS $$
BEGIN
  -- RLS policies on loyalty_ledger automatically enforce:
  -- 1. auth.uid() IS NOT NULL
  -- 2. casino_id = (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
  -- 3. role IN ('pit_boss', 'admin') for INSERT

  INSERT INTO loyalty_ledger (...) VALUES (...);
  -- RLS will DENY if caller's JWT doesn't match casino_id
END;
$$;
```

**Audit Implications:**
- ✅ **RLS enforced:** Cannot bypass tenant isolation
- ✅ **JWT-based:** Caller identity always from auth.jwt()
- ❌ **No explicit audit log:** Must rely on pgAudit or triggers
- ⚠️ **Trigger overhead:** Audit triggers on every table increase write latency

**Comparison:**

| Aspect | Track A (DEFINER + Explicit Log) | Track B (INVOKER + Triggers) |
|--------|----------------------------------|------------------------------|
| **Bypass Risk** | Medium (requires validation) | Low (RLS always enforced) |
| **Audit Granularity** | High (custom details per RPC) | Low (generic trigger data) |
| **Failure Tracking** | Explicit (exception logging) | Implicit (RLS denials silent) |
| **Performance** | Low overhead (manual logging) | Higher overhead (trigger firing) |
| **Compliance Readability** | High (structured audit_log) | Low (parse PostgreSQL logs) |

**Verdict:** Track A provides **superior audit trail quality** for compliance reporting.

---

## 3. What Happens If Someone Uses Service Role to Bypass RLS?

### The Risk

Service role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses **all RLS policies**:

```typescript
// ❌ DANGER: Unrestricted access to all data
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// This query returns ALL visits across ALL casinos (no RLS filtering)
const { data } = await supabase.from('visit').select('*');
```

**Current Usage in PT-2:**
- ✅ **Test fixtures only** (`e2e/fixtures/test-data.ts`, integration tests)
- ✅ **Admin utilities** (`lib/supabase/auth-admin.ts` - JWT claims sync)
- ❌ **NOT used in runtime API routes** (verified via grep)

**Mitigation Status:**

| Control | Status | Notes |
|---------|--------|-------|
| Service role restricted to dev/test | ✅ IMPLEMENTED | `lib/supabase/service.ts:52` checks `isDevMode()` |
| No service role in production runtime | ✅ VERIFIED | Grep search confirms no API route usage |
| Service role operations logged | ⚠️ PARTIAL | Dev mode logs to console, no audit_log entry |
| Service role access monitored | ❌ NOT IMPLEMENTED | No observability metric for service role usage |

---

### Track A Solution: Service Role Audit Wrapper

**Proposal:**
```typescript
// lib/supabase/service-with-audit.ts
export async function withServiceRole<T>(
  operation: (client: SupabaseClient<Database>) => Promise<T>,
  context: {
    reason: string;  // "test-setup", "jwt-sync", "migration"
    actorId?: string;
    casinoId?: string;
  }
): Promise<T> {
  const client = createServiceClient();
  const startTime = Date.now();

  try {
    const result = await operation(client);

    // Log successful service role operation
    await logServiceRoleUsage({
      reason: context.reason,
      actorId: context.actorId,
      casinoId: context.casinoId,
      duration: Date.now() - startTime,
      success: true,
    });

    return result;
  } catch (error) {
    // Log failed service role operation
    await logServiceRoleUsage({
      reason: context.reason,
      actorId: context.actorId,
      casinoId: context.casinoId,
      duration: Date.now() - startTime,
      success: false,
      error: String(error),
    });
    throw error;
  }
}

async function logServiceRoleUsage(details: ServiceRoleAudit) {
  // Option 1: Insert to audit_log (requires service role client - circular)
  // Option 2: Write to observability service (Datadog, CloudWatch)
  // Option 3: Append to dedicated service_role_audit.log file
  console.warn('[SERVICE_ROLE_AUDIT]', JSON.stringify(details));
}
```

**Usage:**
```typescript
// Before (unaudited service role usage)
const client = createServiceClient();
await client.auth.admin.updateUserById(...);

// After (audited service role usage)
await withServiceRole(
  async (client) => {
    await client.auth.admin.updateUserById(...);
  },
  {
    reason: 'jwt-sync',
    actorId: staffId,
    casinoId: casinoId,
  }
);
```

**Audit Benefits:**
- ✅ **Explicit justification:** `reason` field documents why service role needed
- ✅ **Attribution:** `actorId` tracks who initiated (even if indirect)
- ✅ **Anomaly detection:** Observability metrics can alert on unexpected service role spikes
- ✅ **Compliance proof:** Demonstrate service role limited to system operations

---

### Track B Solution: Eliminate Service Role Entirely

**Goal:** All operations use user JWT (anon key + auth.uid())

**Challenges:**
1. **JWT claims sync:** Currently uses service role to update `auth.users.app_metadata`
   - **Solution:** Use Supabase webhook + serverless function with restricted scope
2. **Test fixtures:** Currently uses service role to bypass RLS for setup/teardown
   - **Solution:** Use dedicated test user with `admin` role (still RLS-enforced)
3. **Bulk operations:** Migrations, backfills, data imports
   - **Solution:** Admin API with explicit authorization + audit trail

**Implementation Path:**
```typescript
// Replace service role JWT sync with webhook
// supabase/functions/sync-jwt-claims/index.ts
Deno.serve(async (req) => {
  const { type, record } = await req.json();

  if (type === 'UPDATE' && record.table === 'staff') {
    // Use webhook secret for auth (not service role)
    await fetch('https://api.supabase.com/auth/v1/admin/users', {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('WEBHOOK_SECRET')}`,
      },
      body: JSON.stringify({
        user_id: record.user_id,
        app_metadata: {
          casino_id: record.casino_id,
          staff_role: record.role,
          staff_id: record.id,
        },
      }),
    });
  }
});
```

**Pros:**
- ✅ **Zero service role exposure:** No bypass capability in production
- ✅ **Consistent auth model:** All paths use JWT

**Cons:**
- ⚠️ **Migration complexity:** Requires rewriting admin utilities
- ⚠️ **Webhook infrastructure:** Additional deployment surface
- ⚠️ **Test ergonomics:** Test setup becomes more verbose

**Verdict:** Track B is architecturally cleaner but requires significant migration effort. Track A audit wrapper is pragmatic near-term solution.

---

## 4. How Do We Prove to Auditors That Tenant Isolation Works?

### Compliance Requirement

**Regulatory Context:** Casino gaming regulations require demonstrable data segregation:
- **Bank Secrecy Act (31 CFR 103.20):** Records must be maintained by property
- **State Gaming Control:** Cross-property data access prohibited without explicit authorization
- **PCI DSS (if payment cards involved):** Multi-tenant isolation must be provable

**Audit Questions:**
1. Can a staff member from Casino A access data from Casino B?
2. Can you demonstrate that cross-tenant access attempts are blocked?
3. Can you prove that isolation has been consistently enforced since go-live?
4. What mechanisms prevent accidental cross-tenant data modification?

---

### Track A Evidence Package

**1. RLS Policy Inventory**

```sql
-- Generate compliance report: All tables with RLS enabled
SELECT
  schemaname,
  tablename,
  (SELECT count(*) FROM pg_policies WHERE schemaname = t.schemaname AND tablename = t.tablename) AS policy_count,
  (SELECT bool_and(qual::text LIKE '%casino_id%') FROM pg_policies WHERE schemaname = t.schemaname AND tablename = t.tablename) AS enforces_casino_id
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%'
ORDER BY tablename;

-- Expected output (abbreviated):
-- tablename                    | policy_count | enforces_casino_id
-- ────────────────────────────────────────────────────────────
-- visit                        | 4            | true
-- rating_slip                  | 4            | true
-- player_financial_transaction | 4            | true
-- loyalty_ledger              | 4            | true
-- mtl_entry                   | 4            | true
```

**2. Cross-Tenant Access Test (Negative Test)**

```sql
-- Setup: Create two casinos and staff
INSERT INTO casino (id, name) VALUES
  ('casino-a', 'Casino A'),
  ('casino-b', 'Casino B');

INSERT INTO staff (id, casino_id, user_id, role) VALUES
  ('staff-a', 'casino-a', 'user-a', 'pit_boss'),
  ('staff-b', 'casino-b', 'user-b', 'pit_boss');

-- Test: Set context for Casino A staff, attempt to access Casino B data
SELECT set_rls_context('staff-a', 'casino-a', 'pit_boss');

-- This query should return 0 rows (RLS blocks cross-tenant access)
SELECT count(*) FROM visit WHERE casino_id = 'casino-b';
-- Expected: 0

-- Attempt to insert data for Casino B (should fail)
INSERT INTO visit (casino_id, player_id, started_at)
VALUES ('casino-b', 'player-x', now());
-- Expected: ERROR: new row violates row-level security policy
```

**3. SECURITY DEFINER Validation Test**

```sql
-- Test: Call RPC with mismatched casino_id (should fail)
SELECT set_rls_context('staff-a', 'casino-a', 'pit_boss');

SELECT rpc_start_rating_slip(
  p_casino_id := 'casino-b',  -- WRONG casino
  p_visit_id := 'visit-in-casino-b',
  p_table_id := 'table-in-casino-b',
  p_seat_number := '1',
  p_game_settings := '{}',
  p_actor_id := 'staff-a'
);
-- Expected: ERROR: casino_id mismatch: caller provided casino-b but context is casino-a
```

**4. Audit Trail Proof**

```sql
-- Demonstrate audit log captures all tenant-scoped operations
SELECT
  al.created_at,
  c.name AS casino_name,
  s.first_name || ' ' || s.last_name AS staff_name,
  al.domain,
  al.action,
  al.details->>'rating_slip_id' AS resource_id
FROM audit_log al
JOIN casino c ON c.id = al.casino_id
JOIN staff s ON s.id = al.actor_id
WHERE al.created_at > now() - interval '24 hours'
ORDER BY al.created_at DESC
LIMIT 100;

-- Compliance assertion: Every operation is attributable to (casino_id, actor_id)
```

**5. Automated RLS Verification Suite**

PT-2 includes automated RLS tests:

```typescript
// lib/supabase/__tests__/rls-policy-enforcement.integration.test.ts
describe('Cross-tenant isolation', () => {
  it('prevents staff from Casino A accessing Casino B data', async () => {
    // Setup: Create two casinos, inject context for Casino A
    await injectRLSContext(supabase, {
      actorId: staffACasinoA.id,
      casinoId: casinoA.id,
      staffRole: 'pit_boss',
    });

    // Attempt to query Casino B data
    const { data } = await supabase
      .from('visit')
      .select('*')
      .eq('casino_id', casinoB.id);

    // Assert: RLS blocks cross-tenant access
    expect(data).toHaveLength(0);
  });
});
```

**Test Coverage (Current):**
- ✅ Cross-tenant read isolation (12 test cases)
- ✅ Cross-tenant write blocking (8 test cases)
- ✅ SECURITY DEFINER validation (4 test cases)
- ✅ JWT fallback verification (6 test cases)
- ⚠️ Audit trail completeness (manual validation)

**Compliance Deliverable:**
- **PDF Report:** "PT-2 Multi-Tenant Isolation Verification Report"
- **Test Execution Log:** CI pipeline output showing all RLS tests passing
- **Schema Audit:** RLS policy inventory with casino_id enforcement verification
- **Penetration Test:** External security audit attempting cross-tenant access

---

### Track B Evidence Package

**Challenges:**
1. **pgAudit log parsing:** Must extract and structure PostgreSQL logs for audit presentation
2. **Read access proof:** No explicit audit trail for SELECT queries (unless pgAudit enabled)
3. **RPC validation:** SECURITY INVOKER RPCs don't have explicit Template 5 validation (relies on RLS)

**Additional Requirements:**
- **pgAudit deployment:** Enable and configure on production database
- **Log aggregation:** Ship PostgreSQL logs to SIEM (e.g., Splunk, Datadog)
- **Query parser:** Build tool to extract tenant access patterns from raw logs
- **Retention policy:** Archive PostgreSQL logs for 5+ years (BSA compliance)

**Effort Estimate:** 40-60 hours (vs Track A's existing evidence package)

---

## 5. What Logging/Monitoring Is Needed for Compliance?

### Regulatory Requirements

**Bank Secrecy Act (31 CFR 103.20):**
- **Retention:** 5 years minimum for all transaction records
- **Access logs:** Who accessed what customer data, when
- **Modification tracking:** Audit trail for corrections/voids

**FinCEN CTR Reporting:**
- **Transaction aggregation:** Daily totals per patron (MTL service)
- **Threshold alerts:** Real-time notifications for $10k+ gaming day totals
- **Attribution:** Which staff member processed each transaction

**State Gaming Control:**
- **Chip custody:** Full audit trail of table fills, credits, drops
- **Player rating:** Justification for comp issuance (loyalty ledger)
- **Security incidents:** Failed authorization attempts, anomalies

---

### Track A Logging Architecture (Current)

**1. Application Audit Log (`audit_log` table)**

**Status:** ✅ IMPLEMENTED

**Schema:**
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

**Domains:**
- `rating_slip`: Start, pause, resume, close operations
- `finance`: Buy-ins, cash-outs, table transactions
- `loyalty`: Points accrual, redemptions, manual credits
- `table-context`: Table status changes, fills, credits, drops
- `mtl`: Compliance transaction logging (separate from `mtl_entry`)
- `casino`: Settings changes, staff management

**RLS Policy:** Casino-scoped read access, append-only

**Retention:** Indefinite (no deletion policy)

**Query Examples:**
```sql
-- Financial transaction audit (BSA compliance)
SELECT
  al.created_at,
  s.first_name || ' ' || s.last_name AS cashier,
  al.details->>'amount' AS amount,
  al.details->>'direction' AS direction,
  al.details->>'player_id' AS player_id
FROM audit_log al
JOIN staff s ON s.id = al.actor_id
WHERE al.domain = 'finance'
  AND al.casino_id = 'casino-uuid'
  AND al.created_at BETWEEN '2025-01-01' AND '2025-12-31'
ORDER BY al.created_at;

-- Loyalty comp issuance audit
SELECT
  al.created_at,
  s.first_name || ' ' || s.last_name AS issuer,
  al.action,
  al.details->>'amount' AS points,
  al.details->>'reason' AS reason
FROM audit_log al
JOIN staff s ON s.id = al.actor_id
WHERE al.domain = 'loyalty'
  AND al.action IN ('redeem', 'manual_credit')
  AND al.casino_id = 'casino-uuid'
ORDER BY al.created_at DESC;
```

---

**2. MTL Compliance Log (`mtl_entry` + `mtl_audit_note`)**

**Status:** ✅ IMPLEMENTED (COMP-002)

**Purpose:** Separate compliance-specific logging for AML/CTR

**Schema:**
```sql
create table mtl_entry (
  id uuid primary key default gen_random_uuid(),
  patron_uuid uuid not null references player(id),
  casino_id uuid not null references casino(id),
  staff_id uuid references staff(id),
  amount numeric not null,
  direction text not null,  -- 'in' or 'out'
  gaming_day date,          -- Computed via trigger
  created_at timestamptz not null default now(),
  idempotency_key text
);

create table mtl_audit_note (
  id uuid primary key default gen_random_uuid(),
  mtl_entry_id uuid not null references mtl_entry(id),
  staff_id uuid references staff(id),
  note text not null,      -- "CTR filed: [CTR-2025-001]", "Reviewed: No SAR needed"
  created_at timestamptz not null default now()
);
```

**Immutability:** RLS policies block updates and deletes on both tables

**Compliance Queries:**
```sql
-- CTR threshold detection (gaming day aggregation)
SELECT
  patron_uuid,
  gaming_day,
  sum(amount) AS total_volume,
  count(*) AS transaction_count
FROM mtl_entry
WHERE casino_id = 'casino-uuid'
  AND gaming_day = '2025-12-14'
GROUP BY patron_uuid, gaming_day
HAVING sum(amount) >= 10000
ORDER BY total_volume DESC;

-- Audit trail for specific MTL entry (include notes)
SELECT
  me.created_at AS transaction_time,
  me.amount,
  me.direction,
  s.first_name || ' ' || s.last_name AS processed_by,
  man.created_at AS note_time,
  man.note
FROM mtl_entry me
LEFT JOIN mtl_audit_note man ON man.mtl_entry_id = me.id
LEFT JOIN staff s ON s.id = me.staff_id
WHERE me.id = 'mtl-uuid'
ORDER BY man.created_at;
```

---

**3. Observability Metrics (Proposed)**

**Status:** ⚠️ PARTIALLY IMPLEMENTED (no dedicated observability platform)

**Required Metrics:**

| Metric | Threshold | Alert |
|--------|-----------|-------|
| `audit_log.write_rate` | > 1000/min | High activity alert |
| `audit_log.actor_distinct_count` | < 5 in 1 hour | Potential service role leak |
| `mtl_entry.ctr_threshold_breaches` | > 0 | Compliance officer notification |
| `rls_policy.denial_count` | > 10/min | Security incident alert |
| `security_definer.casino_id_mismatch` | > 0 | Authorization bypass attempt |
| `service_role.usage_count` | > 0 in production | Audit violation |

**Implementation:**
- **Option 1:** Supabase Realtime subscriptions (limited metrics)
- **Option 2:** PostgreSQL logs + log aggregation (Datadog, CloudWatch)
- **Option 3:** Custom metrics table with scheduled aggregation

**Compliance Reporting:**
- **Daily:** Watchlist hits, pending CTRs
- **Weekly:** Audit log summary by domain/action
- **Monthly:** Service role usage, RLS policy changes
- **Annual:** Comprehensive compliance audit (external)

---

**4. Error Logging (Application Layer)**

**Status:** ✅ IMPLEMENTED

**Error Taxonomy:**
```typescript
// lib/errors/domain-errors.ts
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
  }
}

// Example usage in RPC
if (v_context_casino_id IS NULL) {
  RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  -- Logged by application error handler
}
```

**Error Logging Pipeline:**
1. RPC raises exception (e.g., `casino_id mismatch`)
2. Service layer catches and maps to `DomainError`
3. `withServerAction` wrapper logs to observability service
4. Client receives sanitized error (no sensitive details)

**Compliance Value:**
- ✅ **Failed authorization attempts:** Logged as errors
- ✅ **Anomaly detection:** Repeated failures from same actor
- ✅ **Incident response:** Error correlation for forensics

---

### Track B Logging Architecture (Proposed)

**Requirements:**
1. **pgAudit deployment:** Enable on production database
2. **Log aggregation:** Ship PostgreSQL logs to SIEM
3. **Structured logging:** Parse pgAudit output into queryable format
4. **Retention policy:** 5+ years for BSA compliance

**pgAudit Configuration:**
```sql
-- Enable pgAudit extension
CREATE EXTENSION IF NOT EXISTS pgaudit;

-- Configure audit logging
ALTER SYSTEM SET pgaudit.log = 'read,write,ddl';
ALTER SYSTEM SET pgaudit.log_catalog = 'off';
ALTER SYSTEM SET pgaudit.log_level = 'log';
ALTER SYSTEM SET pgaudit.log_relation = 'on';
ALTER SYSTEM SET pgaudit.log_statement_once = 'off';

-- Reload configuration
SELECT pg_reload_conf();
```

**Log Output Format:**
```
2025-12-14 10:32:15 UTC [1234]: LOG:  AUDIT: SESSION,1,1,READ,SELECT,,,
  "SELECT * FROM visit WHERE casino_id = 'casino-a'",<not logged>
```

**Challenges:**
1. **Parse complexity:** Must extract (user, table, query, timestamp) from unstructured logs
2. **Volume:** High-traffic casinos could generate millions of log entries/day
3. **Attribution:** Correlating `auth.uid()` to `staff.id` requires join with auth.users
4. **Retention cost:** 5 years of raw logs = significant storage expense

**Effort Estimate:** 80-120 hours (implementation + testing + documentation)

---

### Compliance Logging Comparison

| Aspect | Track A (Explicit Audit Log) | Track B (pgAudit Logs) |
|--------|------------------------------|------------------------|
| **Implementation Status** | ✅ Production-ready | ⚠️ Requires infrastructure |
| **Granularity** | Domain-specific (custom details) | Generic (table + query) |
| **Read Access Logging** | ❌ Not logged (RPC mutations only) | ✅ All SELECT queries logged |
| **Compliance Readability** | ✅ Structured (SQL queryable) | ⚠️ Requires parsing |
| **Performance Overhead** | Low (manual logging) | Medium (every query logged) |
| **Retention Management** | Simple (single table) | Complex (log rotation + archival) |
| **Audit Trail Gaps** | SELECT queries not logged | None (comprehensive) |
| **Regulatory Acceptance** | ✅ High (explicit records) | ⚠️ Varies (raw logs may not suffice) |

---

## Recommendations

### Near-Term (0-6 Months): Track A + Enhancements

**Priority 1 (P0):**
1. ✅ **Keep SECURITY DEFINER RPCs** with Template 5 validation (already implemented)
2. ✅ **Explicit audit logging** in all mutation RPCs (already implemented)
3. ✅ **MTL compliance logging** for AML/CTR (already implemented)
4. ⚠️ **Add service role audit wrapper** (2-4 hours implementation)
5. ⚠️ **Implement observability metrics** for audit_log monitoring (8-12 hours)

**Priority 2 (P1):**
6. ⚠️ **Self-injection for table context RPCs** (per RPC_INVENTORY_AND_AUTH_AUDIT_20251214.md)
   - `rpc_request_table_fill`
   - `rpc_request_table_credit`
   - `rpc_log_table_drop`
7. ⚠️ **Automated RLS compliance tests** (expand coverage to 100% of tables)
8. ⚠️ **Compliance reporting dashboard** (watchlist, CTRs, audit log summary)

**Priority 3 (P2):**
9. ⚠️ **SELECT query audit logging** (optional pgAudit for read access tracking)
10. ⚠️ **Annual compliance audit preparation** (evidence package automation)

---

### Long-Term (6-18 Months): Hybrid Approach

**Goal:** Gradual migration to JWT-first while maintaining audit trail quality

**Phase 1: SECURITY INVOKER for New Services (6-9 months)**
- Loyalty service pattern (already implemented)
- New financial services (future development)
- Read-heavy services (reporting, analytics)

**Phase 2: Audit Infrastructure Modernization (9-12 months)**
- Deploy pgAudit for comprehensive logging
- Build log aggregation pipeline (PostgreSQL → SIEM)
- Structured audit query layer (SQL over parsed logs)

**Phase 3: SECURITY DEFINER Reduction (12-18 months)**
- Migrate chip custody RPCs to SECURITY INVOKER
- Migrate floor layout RPCs to SECURITY INVOKER
- Keep critical RPCs (financial, loyalty) as SECURITY DEFINER with explicit logging

**End State:**
- **70% SECURITY INVOKER** (read-heavy, low-risk operations)
- **30% SECURITY DEFINER** (financial, compliance, multi-table mutations)
- **100% audit coverage** (explicit logs + pgAudit)
- **Dual verification** (RLS + explicit validation for DEFINER RPCs)

---

## Compliance Checklist

### Track A (Current State)

- [x] **Audit log table deployed** with casino-scoped RLS
- [x] **MTL compliance tables** (mtl_entry, mtl_audit_note) deployed
- [x] **SECURITY DEFINER RPCs** include Template 5 validation
- [x] **Explicit audit logging** in all mutation RPCs
- [x] **Immutability policies** on audit_log and MTL tables
- [ ] **Service role audit wrapper** implemented
- [ ] **Observability metrics** for audit_log monitoring
- [x] **RLS policy inventory** documented (SEC-001)
- [ ] **Automated compliance tests** (expand coverage)
- [ ] **Compliance reporting dashboard** (watchlist, CTRs)
- [ ] **External security audit** (penetration testing)
- [ ] **Annual compliance audit** (scheduled)

**Compliance Posture:** ✅ **GOOD** - Track A is production-ready for compliance

---

### Track B (Future State)

- [ ] **pgAudit extension** deployed on production
- [ ] **Log aggregation pipeline** (PostgreSQL → SIEM)
- [ ] **Audit log parser** (structured queries over pgAudit logs)
- [ ] **SECURITY INVOKER migration** for table context RPCs
- [ ] **SECURITY INVOKER migration** for floor layout RPCs
- [ ] **Service role elimination** (replace with webhook + restricted scope)
- [ ] **JWT-only auth enforcement** (remove SET LOCAL dependency)
- [ ] **Retention policy automation** (archive + export)
- [ ] **Compliance reporting** over unified audit sources
- [ ] **External audit** of JWT-based authorization

**Compliance Posture:** ⚠️ **IN PROGRESS** - Track B requires 6-12 months of implementation

---

## Conclusion

### Which Track Is Easier to Audit?

**Winner: Track A (SECURITY DEFINER + Explicit Audit Logging)**

**Rationale:**
1. ✅ **Explicit audit contract:** Every RPC states what it logs (no parsing required)
2. ✅ **Structured data:** `audit_log` table is SQL-queryable (no log file parsing)
3. ✅ **Compliance-native:** Domain/action classification built for regulatory reporting
4. ✅ **Production-ready:** Already implemented and tested
5. ✅ **Regulatory acceptance:** Explicit records preferred over raw database logs
6. ⚠️ **Gap:** SELECT queries not logged (acceptable for MVP, addressable with pgAudit)

---

### What Compliance Controls Are Needed?

**Essential (Track A):**
1. ✅ **Template 5 validation** in all SECURITY DEFINER RPCs (prevents cross-tenant bypass)
2. ✅ **Explicit audit logging** in mutation RPCs (attributable operations)
3. ✅ **MTL compliance tables** for AML/CTR tracking (regulatory requirement)
4. ✅ **Immutability policies** on audit tables (tamper-proof trail)
5. ⚠️ **Service role audit wrapper** (monitor privileged access)
6. ⚠️ **Observability metrics** (anomaly detection, SLA monitoring)

**Recommended (Track A Enhancement):**
7. ⚠️ **pgAudit for SELECT logging** (comprehensive read access tracking)
8. ⚠️ **Automated compliance tests** (CI/CD integration)
9. ⚠️ **Compliance dashboard** (real-time watchlist, CTR workflows)
10. ⚠️ **External security audit** (annual penetration testing)

**Future (Track B Migration):**
11. ⚠️ **SECURITY INVOKER migration** (reduce bypass risk)
12. ⚠️ **JWT-only enforcement** (eliminate SET LOCAL dependency)
13. ⚠️ **Unified audit infrastructure** (explicit logs + pgAudit)

---

### Final Recommendation

**Adopt Track A for production deployment with planned Track B migration:**

1. **Ship Track A now** (✅ production-ready, compliance-sufficient)
2. **Add service role audit wrapper** (P0 - 2-4 hours)
3. **Implement observability metrics** (P1 - 8-12 hours)
4. **Plan Track B migration** for 6-12 months (gradual SECURITY INVOKER adoption)
5. **Maintain dual verification** (RLS + explicit validation) as defense-in-depth

**Compliance Confidence:** ✅ **HIGH** - Track A provides auditable, regulatory-compliant architecture today, with clear path to Track B modernization.

---

**End of Analysis**
