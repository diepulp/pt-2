---
id: OPS-002
title: Silo Provisioning Playbook
owner: Platform/SRE
status: Draft
affects: [ADR-023, SEC-002, ADR-015, ADR-018]
created: 2025-12-25
last_review: 2025-12-25
---

# OPS-002: Silo Provisioning Playbook

**Status:** Draft
**Owner:** Platform/SRE
**Related:** ADR-023 (Multi-Tenancy Storage Model), SEC-002 (Casino-Scoped Security Model)

---

## Purpose

This playbook documents the operational procedures for deploying PT-2 in **Silo mode** — one dedicated Supabase project per casino (or regulated customer boundary). Silo deployment is the "escape hatch" defined in ADR-023 for customers requiring:

- Jurisdictional or regulatory isolation
- Dedicated infrastructure for audit comfort
- Hard infrastructure blast-radius boundaries
- Tenant-specific data export without co-tenant exposure

---

## Prerequisites

Before provisioning a silo deployment:

1. **Customer qualification** — Confirm silo is required (regulatory, procurement, or audit-driven)
2. **Contract terms** — Document SLA, backup retention, and data sovereignty requirements
3. **Environment decision** — Determine if dev/staging/prod mirrors are needed
4. **Naming convention** — Agree on project naming: `pt2-{casino-slug}-{env}`

---

## 1. Tenant Provisioning

### 1.1 Supabase Project Setup

**Per-casino project creation checklist:**

```bash
# 1. Create new Supabase project via Dashboard or CLI
# Naming: pt2-{casino-slug}-{env}
# Example: pt2-golden-nugget-prod

# 2. Note project credentials
PROJECT_URL=https://{project-ref}.supabase.co
PROJECT_ANON_KEY={anon-key}
PROJECT_SERVICE_KEY={service-key}
DATABASE_URL=postgresql://postgres:{password}@{host}:5432/postgres

# 3. Configure project settings
# - Region: Match customer's jurisdiction requirement
# - Compute: Size per expected load (default: Small)
# - Connection pooling: Transaction mode (Supavisor)
```

### 1.2 Environment Configuration

Create casino-specific deployment config:

```bash
# File: .env.{casino-slug}.{env}
# Example: .env.golden-nugget.prod

NEXT_PUBLIC_SUPABASE_URL=https://{project-ref}.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY={anon-key}
SUPABASE_SERVICE_ROLE_KEY={service-key}
DATABASE_URL={connection-string}

# Casino-specific (for single-tenant deployment)
CASINO_ID={uuid}
CASINO_SLUG={casino-slug}
DEPLOYMENT_MODE=silo
```

### 1.3 Auth Provider Configuration

```bash
# 1. Configure JWT claims template in Supabase Dashboard
# Auth → Hooks → Customize Access Token (JWT)
# Ensure app_metadata includes:
#   - casino_id: {fixed casino UUID}
#   - staff_role: {from user metadata}

# 2. Set up Auth providers (Google, Email, etc.)
# Match production auth config exactly

# 3. Configure redirect URLs for casino domain
```

### 1.4 RLS Context Verification

After project setup, verify RLS context injection works:

```sql
-- Test set_rls_context RPC exists and functions
SELECT set_rls_context(
  '{casino-uuid}'::uuid,
  '{staff-uuid}'::uuid,
  'pit_boss'
);

-- Verify context is set
SELECT
  current_setting('app.casino_id', true),
  current_setting('app.actor_id', true),
  current_setting('app.staff_role', true);
```

---

## 2. Migration Strategy

### 2.1 Principle: Identical Schema Across All Silos

All silo deployments run the **same migration set** as the pooled environment. This ensures:

- Codebase compatibility (no schema drift)
- Defense in depth (RLS policies apply even in silo)
- Simplified testing (one schema to validate)

### 2.2 Migration Application Process

```bash
# 1. Link to silo project
npx supabase link --project-ref {silo-project-ref}

# 2. Apply all migrations
npx supabase db push

# 3. Regenerate types (for verification)
npm run db:types

# 4. Verify migration state
npx supabase migration list
```

### 2.3 Multi-Silo Migration Orchestration

For N silo deployments, migrations must be applied consistently:

```bash
#!/bin/bash
# scripts/migrate-all-silos.sh

SILOS=("golden-nugget-prod" "bellagio-prod" "venetian-prod")

for SILO in "${SILOS[@]}"; do
  echo "Migrating $SILO..."

  # Link to project
  npx supabase link --project-ref $(get_project_ref $SILO)

  # Apply migrations
  npx supabase db push

  # Verify
  npx supabase migration list

  echo "$SILO migration complete"
done
```

### 2.4 Migration Rollback (Per-Silo)

```bash
# Option 1: Compensating migration (preferred)
# Create: {timestamp}_rollback_{original-migration}.sql
npx supabase migration new rollback_specific_change
npx supabase db push

# Option 2: Point-in-time recovery (PITR)
# Use Supabase Dashboard → Database → Backups → Restore to specific point

# Option 3: Schema restore from backup
psql $DATABASE_URL < /path/to/schema_backup.sql
```

### 2.5 Pre-Migration Checklist (Per-Silo)

```markdown
- [ ] Backup current schema: `npx supabase db dump --schema public > backup_{casino}_{date}.sql`
- [ ] Verify RLS coverage for new tables (SEC-001 compliance)
- [ ] Test migration on staging silo first
- [ ] Confirm rollback procedure documented
- [ ] Notify casino stakeholders of maintenance window
```

---

## 3. Backup Procedures

### 3.1 Backup Isolation Guarantee

Each silo has **isolated backup infrastructure**:

- Automatic daily backups (Supabase managed)
- Point-in-time recovery (PITR) — 7-day window (Pro plan)
- Backup data never co-mingles with other tenants

### 3.2 On-Demand Backup

```bash
# Full database dump
npx supabase db dump > backup_{casino}_{timestamp}.sql

# Schema-only backup
npx supabase db dump --schema public --data-only false > schema_{casino}_{timestamp}.sql

# Data-only backup
npx supabase db dump --data-only > data_{casino}_{timestamp}.sql
```

### 3.3 Backup Storage and Retention

| Backup Type | Retention | Storage Location | Access |
|-------------|-----------|------------------|--------|
| Supabase Auto | 7 days (PITR) | Supabase S3 | Dashboard |
| Manual Schema | 90 days | Secure blob storage | Platform team |
| Manual Data | 30 days | Encrypted vault | Platform + Compliance |
| Compliance Archive | 7 years | Cold storage | Compliance officer |

### 3.4 Backup Verification

Monthly backup verification procedure:

```bash
# 1. Restore backup to temporary database
createdb pt2_backup_verify_$(date +%Y%m%d)
psql pt2_backup_verify_$(date +%Y%m%d) < backup_{casino}_{date}.sql

# 2. Run integrity checks
psql pt2_backup_verify_$(date +%Y%m%d) <<SQL
  -- Verify row counts
  SELECT 'player' as tbl, count(*) FROM player
  UNION ALL SELECT 'visit', count(*) FROM visit
  UNION ALL SELECT 'rating_slip', count(*) FROM rating_slip;

  -- Verify RLS policies exist
  SELECT tablename, COUNT(policyname)
  FROM pg_policies
  GROUP BY tablename;
SQL

# 3. Cleanup
dropdb pt2_backup_verify_$(date +%Y%m%d)
```

---

## 4. Regulator Export Procedure

### 4.1 Export Scope

When a regulator requests casino data, export includes:

| Domain | Tables | Notes |
|--------|--------|-------|
| Player | `player`, `player_casino`, `player_identity` | PII included |
| Visits | `visit`, `table_context` | Session data |
| Ratings | `rating_slip`, `rating_slip_event` | Gaming telemetry |
| Finance | `financial_transaction`, `compliance_log` | AML/CTR relevant |
| Loyalty | `loyalty_ledger`, `reward_policy` | Comps/rewards |
| Staff | `staff`, `staff_role_assignment` | Access control |
| Audit | All `*_audit` tables | Immutable logs |

### 4.2 Export Commands

```bash
# Full casino export (silo = single tenant, all data belongs to them)
npx supabase db dump > export_{casino}_{date}.sql

# Domain-specific export
pg_dump $DATABASE_URL \
  --table=player \
  --table=player_casino \
  --table=visit \
  --table=rating_slip \
  --table=financial_transaction \
  > export_{casino}_gaming_{date}.sql

# JSON export for specific domain
psql $DATABASE_URL <<SQL > export_{casino}_finance.json
  SELECT json_agg(t)
  FROM (
    SELECT * FROM financial_transaction
    WHERE created_at BETWEEN '{start}' AND '{end}'
    ORDER BY created_at
  ) t;
SQL
```

### 4.3 Export Verification

Before delivery:

```bash
# 1. Count verification
psql $DATABASE_URL <<SQL
  SELECT
    (SELECT count(*) FROM player) as players,
    (SELECT count(*) FROM visit) as visits,
    (SELECT count(*) FROM rating_slip) as ratings,
    (SELECT count(*) FROM financial_transaction) as transactions;
SQL

# 2. Verify no cross-tenant data (sanity check, silo should have one casino_id)
psql $DATABASE_URL <<SQL
  SELECT DISTINCT casino_id FROM player_casino;
  -- Expected: exactly 1 row
SQL

# 3. PII handling acknowledgment
# - Document export in compliance log
# - Obtain chain-of-custody signature
# - Encrypt export file with regulator's public key
```

### 4.4 Export Delivery Protocol

1. **Encrypt** — GPG encrypt with regulator's public key
2. **Hash** — Generate SHA-256 checksum
3. **Transfer** — Secure file transfer (SFTP or approved portal)
4. **Document** — Log export in compliance system:
   ```sql
   INSERT INTO compliance_log (casino_id, event_type, details, actor_id)
   VALUES (
     '{casino-uuid}',
     'regulator_export',
     jsonb_build_object(
       'regulator', '{regulator-name}',
       'export_date', now(),
       'tables_included', ARRAY['player', 'visit', 'rating_slip', ...],
       'record_counts', '{...}',
       'checksum', '{sha256}'
     ),
     '{actor-uuid}'
   );
   ```

---

## 5. Incident Response Scope

### 5.1 Blast Radius Boundaries

In silo deployment, incident scope is **hard-bounded to one casino**:

| Incident Type | Scope | Affected Systems |
|---------------|-------|------------------|
| Database corruption | Single Supabase project | One casino only |
| Auth provider failure | Single project auth | One casino only |
| RLS bypass bug | Contained to tenant | No cross-tenant exposure |
| Application error | Deployment instance | One casino only |
| DDoS/Load spike | Single project resources | One casino only |

### 5.2 Incident Classification (Silo-Specific)

| Severity | Definition | Response Time | Escalation |
|----------|------------|---------------|------------|
| **P1 Critical** | Casino offline, data loss risk | 15 min | Immediate page |
| **P2 Major** | Feature degraded, workaround exists | 1 hour | On-call |
| **P3 Minor** | Non-critical bug, low impact | 4 hours | Ticket |
| **P4 Low** | Enhancement request | Next sprint | Backlog |

### 5.3 Incident Response Runbook

```markdown
## Silo Incident Response

### 1. Triage (0-15 min)
- [ ] Identify affected casino (project slug)
- [ ] Confirm scope is isolated (not affecting other silos)
- [ ] Check Supabase status page for platform issues
- [ ] Notify casino stakeholder if P1/P2

### 2. Investigate (15-60 min)
- [ ] Review logs: Supabase Dashboard → Logs → Postgres/API
- [ ] Check recent deployments: Vercel/deployment logs
- [ ] Query for errors:
  ```sql
  SELECT * FROM pg_stat_activity WHERE state = 'active';
  SELECT * FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
  ```
- [ ] Identify root cause

### 3. Remediate
- [ ] Apply fix (migration, config change, rollback)
- [ ] Verify fix in silo environment
- [ ] Confirm with casino stakeholder

### 4. Post-Incident
- [ ] Document in incident log
- [ ] Update runbook if new failure mode
- [ ] Consider if fix applies to pooled environment
```

### 5.4 Cross-Silo Incident Considerations

When a bug affects multiple silos:

1. **Assess commonality** — Same root cause? Same codebase version?
2. **Coordinate rollout** — Fix sequentially or in parallel?
3. **Stagger deployment** — Apply to lowest-risk silo first
4. **Document** — Single incident record, multiple affected-casino sections

### 5.5 Silo vs. Pool Incident Comparison

| Aspect | Pool (Default) | Silo (Escape Hatch) |
|--------|----------------|---------------------|
| Blast radius | All casinos | Single casino |
| Investigation | Shared logs, filter by casino_id | Isolated logs |
| Rollback | Affects all tenants | Affects one tenant |
| Communication | All stakeholders | Single stakeholder |
| Compliance | Shared audit trail | Isolated audit trail |

---

## 6. Operational Checklist

### 6.1 New Silo Provisioning Checklist

```markdown
## Casino: ________________  Date: ________________

### Project Setup
- [ ] Supabase project created: `pt2-{slug}-{env}`
- [ ] Region selected per jurisdiction
- [ ] Connection pooling enabled (transaction mode)

### Configuration
- [ ] Environment variables documented
- [ ] JWT claims template configured
- [ ] Auth providers configured
- [ ] Redirect URLs set

### Schema
- [ ] All migrations applied
- [ ] RLS policies verified
- [ ] set_rls_context() tested
- [ ] Types regenerated

### Security
- [ ] Service key secured
- [ ] Access restricted to platform team
- [ ] Audit logging enabled

### Deployment
- [ ] Application deployed
- [ ] DNS configured (if custom domain)
- [ ] SSL verified

### Validation
- [ ] Smoke tests passed
- [ ] Login flow verified
- [ ] Sample data created
- [ ] Backup verified

### Documentation
- [ ] Runbook updated with silo entry
- [ ] Stakeholder contacts documented
- [ ] Escalation path defined
```

### 6.2 Periodic Maintenance Checklist (Monthly)

```markdown
- [ ] Verify backup integrity (restore test)
- [ ] Review migration parity with pooled environment
- [ ] Check disk/compute utilization
- [ ] Audit access logs for anomalies
- [ ] Verify RLS policy coverage
- [ ] Update dependencies if security patches
```

---

## References

- **ADR-023** — Multi-Tenancy Storage Model Selection
- **SEC-002** — Casino-Scoped Security Model
- **ADR-015** — RLS Connection Pooling Strategy
- **ADR-018** — SECURITY DEFINER Function Governance
- **RUN-003** — Schema Migration Runbook
- **RUN-004** — RLS Policy Verification

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-12-25 | 1.0 | Platform | Initial draft |
