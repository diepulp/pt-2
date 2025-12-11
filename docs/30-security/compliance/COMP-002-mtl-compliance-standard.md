---
id: COMP-002
title: MTL (Multiple Transaction Log) Compliance Standard
owner: Compliance / MTLService
status: Active
affects: [SEC-001, SEC-005, PlayerFinancialService, MTLService]
created: 2025-11-17
last_review: 2025-11-17
regulatory_context: AML/CTR (Bank Secrecy Act, FinCEN)
---

## Purpose

This document defines the complete compliance standard for the Multiple Transaction Log (MTL) system, which tracks all cash and monetary transactions for Anti-Money Laundering (AML) and Currency Transaction Report (CTR) regulatory compliance. The MTL service provides immutable audit trails, threshold detection, and compliance reporting capabilities required by federal and state gaming regulations.

## Scope

- MTL data model and ownership
- Compliance thresholds and detection rules
- Retention policies and audit requirements
- Operational hooks and monitoring
- Role-based access control for compliance data
- Integration with PlayerFinancialService
- Regulatory reporting and export requirements

## Regulatory Context

### Bank Secrecy Act (BSA) / Anti-Money Laundering (AML)

The Bank Secrecy Act requires casinos to:
1. **Report currency transactions over $10,000** (CTR - Currency Transaction Report)
2. **Monitor and report suspicious activity** (SAR - Suspicious Activity Report)
3. **Maintain transaction records** for minimum retention periods
4. **Implement compliance programs** with designated officers and training

### FinCEN Requirements

Financial Crimes Enforcement Network (FinCEN) regulations specific to casinos:
- **31 CFR 103.22**: Currency transaction reporting (Form 8362)
- **31 CFR 103.21**: Customer identification and verification
- **31 CFR 103.20**: Transaction record retention (5 years minimum)
- **31 USC 5313**: Currency transaction reporting thresholds

### State Gaming Regulations

Additional state-specific requirements may apply:
- Enhanced recordkeeping for table games
- Lower reporting thresholds (e.g., $3,000 watchlist)
- Integration with state gaming control boards
- Audit trail requirements for compliance officers

## MTL Service Overview

### Bounded Context

**Question**: "What cash/monetary transactions occurred for AML/CTR compliance?"

The MTL service owns the compliance view of all monetary movements, tracking cash-in and cash-out events across the casino floor. It is separate from PlayerFinancialService (which owns the financial ledger) but references it for reconciliation and regulatory reporting.

### Data Model

The MTL service owns two core tables:

#### 1. `mtl_entry` (Immutable Transaction Log)

**Purpose**: Source of truth for all cash transactions requiring compliance tracking.

**Schema**:
```sql
create table mtl_entry (
  id uuid primary key default gen_random_uuid(),
  patron_uuid uuid not null references player(id) on delete cascade,
  casino_id uuid not null references casino(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  rating_slip_id uuid references rating_slip(id) on delete set null,
  visit_id uuid references visit(id) on delete set null,
  amount numeric not null,
  direction text not null, -- 'in' or 'out'
  area text, -- cage, pit, slot, etc.
  gaming_day date, -- Computed via trigger
  created_at timestamptz not null default now(),
  idempotency_key text
);

-- Indexes
create unique index if not exists ux_mtl_entry_idem
  on mtl_entry (idempotency_key)
  where idempotency_key is not null;

create index if not exists ix_mtl_casino_time
  on mtl_entry (casino_id, created_at desc);

create index if not exists ix_mtl_casino_gaming_day
  on mtl_entry (casino_id, gaming_day);

create index if not exists ix_mtl_patron_time
  on mtl_entry (patron_uuid, created_at desc);
```

**Field Definitions**:
- `id`: Unique transaction identifier
- `patron_uuid`: Player involved (required for compliance tracking)
- `casino_id`: Casino scope (tenancy enforcement)
- `staff_id`: Staff member who processed transaction (nullable, for audit trail)
- `rating_slip_id`: Optional link to active rating slip (if transaction occurred during play)
- `visit_id`: Optional link to active visit (session context)
- `amount`: Transaction amount in dollars (numeric for precision)
- `direction`: 'in' (cash-in, buy-in) or 'out' (cash-out, redemption)
- `area`: Transaction location (cage, pit, slot floor, etc.)
- `gaming_day`: Computed gaming day (derived from `casino_settings.gaming_day_start_time`)
- `created_at`: Timestamp of transaction (immutable)
- `idempotency_key`: Optional deduplication key (for external integrations)

**Immutability**: Once created, MTL entries CANNOT be updated or deleted. Corrections are handled via offsetting entries with audit notes.

---

#### 2. `mtl_audit_note` (Append-Only Audit Trail)

**Purpose**: Compliance officer annotations, corrections, and audit trail for MTL entries.

**Schema**:
```sql
create table mtl_audit_note (
  id uuid primary key default gen_random_uuid(),
  mtl_entry_id uuid not null references mtl_entry(id) on delete cascade,
  staff_id uuid references staff(id) on delete set null,
  note text not null,
  created_at timestamptz not null default now()
);

-- Index
create index if not exists ix_audit_note_entry
  on mtl_audit_note (mtl_entry_id, created_at desc);
```

**Field Definitions**:
- `id`: Unique note identifier
- `mtl_entry_id`: Reference to MTL entry being annotated
- `staff_id`: Compliance officer who created the note
- `note`: Free-text annotation (corrections, rationale, SAR references, etc.)
- `created_at`: Timestamp of note creation

**Append-Only**: Notes can only be created, never updated or deleted.

---

### Dependencies

**Reads From**:
- `casino_settings`: Gaming day start time, compliance thresholds (READ-ONLY via trigger)
- `player`: Player identity (FK reference)
- `staff`: Staff identity (FK reference)
- `visit`: Session context (optional FK)
- `rating_slip`: Telemetry context (optional FK)

**Writes To**:
- `mtl_entry`: Append-only cash transaction log
- `mtl_audit_note`: Append-only compliance annotations

**Integration**:
- **PlayerFinancialService**: MTL references `player_financial_transaction` for reconciliation but does NOT own it
- **CasinoService**: MTL reads temporal authority (`gaming_day_start_time`) from `casino_settings`

---

## Compliance Thresholds

### Primary Thresholds

Thresholds are configured per-casino in `casino_settings`:

```sql
-- From casino_settings table
watchlist_floor numeric(12,2) not null default 3000,
ctr_threshold numeric(12,2) not null default 10000
```

#### 1. Watchlist Floor ($3,000)

**Purpose**: Internal monitoring threshold for heightened scrutiny.

**Trigger**: Any single cash transaction >= $3,000 (in or out)

**Action**:
- Flag transaction for compliance review
- Add to daily watchlist report
- Consider for SAR (Suspicious Activity Report) if patterns emerge
- Compliance officer receives real-time alert

**Implementation**:
```sql
-- Watchlist detection query
select *
from mtl_entry
where casino_id = $1
  and amount >= (
    select watchlist_floor
    from casino_settings
    where casino_id = $1
  )
  and created_at >= current_date
order by created_at desc;
```

---

#### 2. CTR Threshold ($10,000)

**Purpose**: Federal Currency Transaction Report (CTR) filing requirement.

**Trigger**: Aggregate cash transactions >= $10,000 within a gaming day for a single patron

**Action**:
- **REQUIRED**: File FinCEN Form 8362 (CTR) within 15 days
- Capture patron identification (name, address, SSN/TIN, DOB)
- Include all transactions that triggered threshold
- Compliance officer review and approval
- Export CTR data for regulatory submission

**Implementation**:
```sql
-- CTR threshold detection (gaming day aggregation)
select
  patron_uuid,
  casino_id,
  gaming_day,
  sum(case when direction = 'in' then amount else 0 end) as total_in,
  sum(case when direction = 'out' then amount else 0 end) as total_out,
  sum(amount) as total_volume,
  count(*) as transaction_count
from mtl_entry
where casino_id = $1
  and gaming_day = $2
group by patron_uuid, casino_id, gaming_day
having sum(amount) >= (
  select ctr_threshold
  from casino_settings
  where casino_id = $1
)
order by total_volume desc;
```

**Gaming Day Computation**:
```sql
-- Trigger function to compute gaming_day
create or replace function compute_mtl_gaming_day()
returns trigger as $$
declare
  v_gaming_day_start time;
  v_timezone text;
begin
  -- Read from casino_settings (temporal authority)
  select gaming_day_start_time, timezone
  into v_gaming_day_start, v_timezone
  from casino_settings
  where casino_id = NEW.casino_id;

  -- Compute gaming day based on casino timezone and start time
  NEW.gaming_day := (
    (NEW.created_at at time zone v_timezone)::date
    - case when (NEW.created_at at time zone v_timezone)::time < v_gaming_day_start
      then 1 else 0 end
  );

  return NEW;
end;
$$ language plpgsql;

create trigger trg_mtl_compute_gaming_day
before insert on mtl_entry
for each row execute function compute_mtl_gaming_day();
```

---

### Threshold Alert Hooks

**Real-Time Alerts**:
1. **Watchlist hit** (>= $3k): Send to compliance dashboard channel
2. **CTR threshold** (>= $10k gaming day aggregate): Send to compliance officer + create pending CTR task
3. **Repeat offender**: Player hits watchlist 3+ times in 7 days
4. **Structured transactions**: Multiple transactions just below threshold (potential structuring)

**Alert Payload**:
```typescript
interface MTLAlert {
  alertType: 'WATCHLIST_HIT' | 'CTR_THRESHOLD' | 'REPEAT_OFFENDER' | 'STRUCTURING_SUSPECTED';
  mtlEntryId: string;
  patronUuid: string;
  casinoId: string;
  amount: number;
  gamingDay: string;
  aggregateAmount?: number; // For CTR threshold
  transactionCount?: number;
  createdAt: string;
  staffId: string | null;
  area: string | null;
}
```

**Notification Channels**:
- **Compliance Dashboard**: Real-time Supabase realtime subscription
- **Email**: Compliance officer notification for CTR thresholds
- **Audit Log**: All alerts logged to `audit_log` table

---

## Operational Procedures

### 1. Cash Transaction Recording

**Who**: Cage cashier, floor supervisor (via authorized staff roles)

**When**: Immediately upon cash exchange (real-time)

**How**: Via `withServerAction` wrapper with RLS context

**Example Flow**:
```typescript
// Server Action: Record cash-in transaction
export async function recordCashIn(input: {
  patronId: string;
  amount: number;
  area: string;
  idempotencyKey: string;
}) {
  const supabase = await createClient();

  return withServerAction(
    async () => {
      // RLS context automatically injected (actor_id, casino_id)
      const { data, error } = await supabase
        .from('mtl_entry')
        .insert({
          patron_uuid: input.patronId,
          casino_id: 'auto-injected', // From current_setting('app.casino_id')
          staff_id: 'auto-injected', // From current_setting('app.actor_id')
          amount: input.amount,
          direction: 'in',
          area: input.area,
          idempotency_key: input.idempotencyKey,
        })
        .select()
        .single();

      if (error) throw error;

      // Check for threshold alerts
      await checkMTLThresholds(data.id);

      return data;
    },
    {
      supabase,
      endpoint: 'mtl.record-cash-in',
      action: 'mtl.create',
    }
  );
}
```

**Idempotency**: All MTL entry creations MUST include `idempotency_key` to prevent duplicate logging.

---

### 2. Compliance Review

**Who**: Compliance officer (role: 'compliance')

**When**: Daily for watchlist; within 15 days for CTR threshold

**How**: Compliance dashboard with filtered views

**Daily Watchlist Review**:
```sql
-- Watchlist transactions for review
select
  me.id,
  me.patron_uuid,
  p.first_name || ' ' || p.last_name as patron_name,
  me.amount,
  me.direction,
  me.area,
  me.created_at,
  s.first_name || ' ' || s.last_name as staff_name,
  (select count(*) from mtl_audit_note where mtl_entry_id = me.id) as note_count
from mtl_entry me
join player p on p.id = me.patron_uuid
left join staff s on s.id = me.staff_id
where me.casino_id = $1
  and me.gaming_day = current_date
  and me.amount >= (select watchlist_floor from casino_settings where casino_id = $1)
order by me.created_at desc;
```

**CTR Workflow**:
1. Detect threshold breach (automated)
2. Compliance officer reviews aggregated transactions
3. Verify patron identity (SSN, address, ID verification)
4. Create CTR export with all contributing transactions
5. File CTR with FinCEN within 15 days
6. Append audit note to all MTL entries in the CTR

---

### 3. Audit Note Annotation

**Who**: Compliance officer (role: 'compliance')

**When**: During reviews, corrections, SAR filings, CTR processing

**How**: Append-only note creation

**Example**:
```typescript
// Server Action: Add compliance note
export async function addComplianceNote(input: {
  mtlEntryId: string;
  note: string;
}) {
  const supabase = await createClient();

  return withServerAction(
    async () => {
      const { data, error } = await supabase
        .from('mtl_audit_note')
        .insert({
          mtl_entry_id: input.mtlEntryId,
          staff_id: 'auto-injected', // From current_setting('app.actor_id')
          note: input.note,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    {
      supabase,
      endpoint: 'mtl.add-note',
      action: 'mtl.annotate',
    }
  );
}
```

**Common Note Types**:
- "CTR filed: [CTR-2025-001] - $15,432 aggregate gaming day 2025-11-17"
- "Reviewed: No suspicious activity detected"
- "SAR referral: See case [SAR-2025-042]"
- "Correction: Original transaction voided, see offsetting entry [mtl-id]"

---

### 4. Corrections and Voids

**Problem**: MTL entries are immutable but errors occur.

**Solution**: Offsetting entry + audit note

**Procedure**:
1. Create offsetting MTL entry with opposite direction and same amount
2. Link both entries via audit notes
3. Compliance officer approval required

**Example**:
```typescript
// Original entry (error)
const originalEntry = {
  id: 'mtl-001',
  amount: 5000,
  direction: 'in',
  area: 'cage',
};

// Offsetting entry (correction)
const offsetEntry = {
  amount: -5000, // Negative to reverse
  direction: 'in', // Same direction, negative amount
  area: 'cage',
  idempotency_key: `correction-${originalEntry.id}`,
};

// Audit notes
await addComplianceNote({
  mtlEntryId: 'mtl-001',
  note: `ERROR: Incorrect amount. Voided via offsetting entry [mtl-002]`,
});

await addComplianceNote({
  mtlEntryId: 'mtl-002',
  note: `CORRECTION: Offsetting entry for [mtl-001]. Approved by compliance officer [staff-id].`,
});
```

---

## Retention Policies

### Minimum Retention Periods

Per **31 CFR 103.20** and gaming regulations:

| Record Type | Retention Period | Rationale |
|-------------|------------------|-----------|
| MTL Entries | **5 years minimum** | BSA/AML requirement (31 CFR 103.20) |
| Audit Notes | **5 years minimum** | Tied to MTL entry retention |
| CTR Filings | **5 years minimum** | FinCEN requirement |
| SAR Documentation | **5 years from filing** | FinCEN requirement |
| Patron Identity Records | **5 years after last transaction** | Customer due diligence (CDD) |

### Implementation

**Database-Level Retention**:
```sql
-- MTL entries are NEVER deleted via application logic
-- Deletes are blocked by RLS policy
create policy "mtl_entry_no_deletes"
  on mtl_entry
  for delete using (false);

create policy "mtl_audit_note_no_deletes"
  on mtl_audit_note
  for delete using (false);
```

**Archive Strategy** (for records > 5 years):
1. Move to cold storage (e.g., S3 Glacier)
2. Maintain index for compliance queries
3. Retain export capability for audits
4. Do NOT delete from database (keep indefinitely for regulatory safety)

**Export Formats**:
- **CSV**: For spreadsheet analysis
- **JSON**: For programmatic access
- **PDF**: For human-readable audit reports
- **FinCEN XML**: For CTR/SAR submissions

---

## Role-Based Access Control

### RLS Policies

**Read Access** (Compliance roles only):
```sql
create policy "mtl_entry_read_compliance"
  on mtl_entry
  for select using (
    auth.uid() = (
      select user_id from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role in ('compliance', 'admin')
      and status = 'active'
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**Write Access** (Cashier roles for entry creation):
```sql
create policy "mtl_entry_insert_cashier"
  on mtl_entry
  for insert with check (
    auth.uid() = (
      select user_id from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role in ('cashier', 'admin')
      and status = 'active'
    )
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

create policy "mtl_entry_no_updates"
  on mtl_entry
  for update using (false);

create policy "mtl_entry_no_deletes"
  on mtl_entry
  for delete using (false);
```

**Audit Note Access** (Compliance only):
```sql
create policy "mtl_audit_note_read_compliance"
  on mtl_audit_note
  for select using (
    auth.uid() = (
      select user_id from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role in ('compliance', 'admin')
      and status = 'active'
    )
    AND (
      select casino_id from mtl_entry where id = mtl_entry_id
    ) = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );

create policy "mtl_audit_note_insert_compliance"
  on mtl_audit_note
  for insert with check (
    auth.uid() = (
      select user_id from staff
      where id = COALESCE(
        NULLIF(current_setting('app.actor_id', true), '')::uuid,
        (auth.jwt() -> 'app_metadata' ->> 'staff_id')::uuid
      )
      and role in ('compliance', 'admin')
      and status = 'active'
    )
    AND (
      select casino_id from mtl_entry where id = mtl_entry_id
    ) = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
```

**See Also**: `docs/30-security/SEC-005-role-taxonomy.md` for complete role capabilities.

---

## Monitoring and Observability

### Key Metrics

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Watchlist hits per day | > 50 | High transaction volume alert |
| CTR threshold breaches | > 5 per day | Compliance review surge |
| Unreviewed watchlist entries | > 24 hours old | Compliance SLA breach |
| MTL entry creation failures | > 1% error rate | System health alert |
| Missing gaming_day values | Any | Data integrity alert |

### Performance SLOs

- **MTL entry creation latency**: p95 < 200ms
- **Threshold detection latency**: < 5 seconds (real-time alerts)
- **Daily watchlist report generation**: < 30 seconds
- **CTR export generation**: < 2 minutes

### Audit Trail

All MTL operations are logged to `audit_log`:

```typescript
// Example audit log entry
{
  domain: 'mtl',
  actor_id: 'staff-uuid',
  action: 'mtl.create',
  details: {
    mtl_entry_id: 'mtl-uuid',
    amount: 5000,
    direction: 'in',
    threshold_triggered: ['watchlist'],
  },
  created_at: '2025-11-17T14:32:00Z',
}
```

---

## Error Taxonomy

From SRM error taxonomy (MTL Domain):

| Error Code | Description | Recovery |
|------------|-------------|----------|
| `MTL_ENTRY_NOT_FOUND` | MTL entry does not exist | Verify entry ID |
| `MTL_THRESHOLD_EXCEEDED` | Transaction exceeds configured threshold | Expected; trigger compliance workflow |
| `MTL_WATCHLIST_HIT` | Transaction >= watchlist floor | Expected; flag for review |
| `MTL_CTR_REQUIRED` | Aggregate transactions >= CTR threshold | File CTR within 15 days |
| `MTL_IMMUTABLE_ENTRY` | Attempted update/delete of MTL entry | Use offsetting entry + audit note |
| `MTL_MISSING_COMPLIANCE_DATA` | Required compliance fields missing | Validate patron identity before transaction |

---

## Compliance Checklist

### Pre-Go-Live
- [ ] `mtl_entry` table deployed with immutability policies
- [ ] `mtl_audit_note` table deployed with append-only policies
- [ ] Gaming day trigger installed and tested
- [ ] Thresholds configured in `casino_settings` per jurisdiction
- [ ] RLS policies deployed and verified
- [ ] Compliance officer roles assigned
- [ ] Watchlist and CTR alert channels configured
- [ ] CTR export format validated with FinCEN requirements
- [ ] Retention policy documented and automated
- [ ] Audit trail logging verified

### Operational
- [ ] Daily watchlist review process established
- [ ] CTR filing workflow tested (end-to-end)
- [ ] Compliance officer training completed
- [ ] Backup and disaster recovery tested for MTL data
- [ ] Annual compliance audit scheduled
- [ ] SAR referral process documented
- [ ] Structured transaction detection rules enabled

---

## References

### Internal Documentation
- **SRM**: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (MTL Service section)
- **RLS Policies**: `docs/30-security/SEC-001-rls-policy-matrix.md#mtlservice`
- **Role Taxonomy**: `docs/30-security/SEC-005-role-taxonomy.md` (Compliance role)
- **Temporal Authority**: `docs/40-governance/TEMP-001-gaming-day-authority.md`
- **Observability**: `docs/50-ops/OBSERVABILITY_SPEC.md` (MTL metrics)

### Regulatory References
- **31 CFR 103.22**: Currency transaction reporting by casinos
- **31 CFR 103.21**: Customer identification programs
- **31 CFR 103.20**: Recordkeeping requirements
- **31 USC 5313**: Currency transaction reporting thresholds
- **FinCEN Form 8362**: Currency Transaction Report by Casinos

### External Resources
- [FinCEN Casino Guidance](https://www.fincen.gov/resources/statutes-regulations/guidance/application-currency-transaction-reporting-requirements-casinos)
- [BSA/AML Examination Manual](https://bsaaml.ffiec.gov/manual)

---

**Status**: ✅ Active
**Version**: 1.0.0
**Last Updated**: 2025-11-17
**Next Review**: 2026-11-17 (annual compliance audit)
