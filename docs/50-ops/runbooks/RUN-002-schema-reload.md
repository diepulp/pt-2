# RUN-002 Schema Reload Runbook

**Status**: Active
**Owner**: Platform/SRE
**Cross-Reference**: [RUN-003 Migration](RUN-003-schema-migration-runbook.md), [OBSERVABILITY_SPEC](../OBSERVABILITY_SPEC.md)

---

## Overview

PostgREST caches database schema metadata for performance. When schema changes are applied directly via `psql` or outside the Supabase CLI workflow, the cache becomes stale and API requests may fail or return incorrect results. This runbook provides procedures to force PostgREST to reload its schema cache.

**Critical**: Always use Supabase CLI commands (`npx supabase db execute`, `npx supabase migration up`, `npx supabase db reset`) to avoid cache staleness. Use manual reload ONLY when schema was modified outside standard workflow.

---

## When to Reload Schema

### Symptoms of Stale Cache

- ✅ **API returns 404** for newly created tables/views
- ✅ **New columns not visible** in API responses
- ✅ **RLS policies not enforced** despite being created
- ✅ **Foreign key relationships broken** in API responses
- ✅ **Enum values rejected** despite being in schema
- ✅ **RPC functions return "function does not exist"** after creation

### Triggering Events

| Event | Requires Reload? | Reason |
|-------|------------------|--------|
| `npx supabase migration up` | ❌ No | CLI triggers reload automatically |
| `npx supabase db reset` | ❌ No | Full reset includes reload |
| `npx supabase db execute` | ❌ No | CLI triggers reload automatically |
| Direct `psql` execution | ✅ Yes | Bypasses PostgREST notification |
| SQL Editor in Supabase Dashboard | ✅ Yes | May not trigger reload |
| Manual `CREATE TABLE` via client library | ✅ Yes | Bypasses PostgREST |

---

## Reload Procedures

### Method 1: NOTIFY Command (Recommended)

**Use Case**: Schema changed via `psql` or direct SQL execution.

```bash
# Send NOTIFY signal to PostgREST
npx supabase db execute --file - <<'SQL'
NOTIFY pgrst, 'reload schema';
SQL
```

**Expected Output**:
```
NOTIFY
```

**Verification**:
```bash
# Test API endpoint for new table/column
curl -H "Authorization: Bearer ${ANON_KEY}" \
     http://localhost:54321/rest/v1/your_new_table

# Should return 200 OK (or 401 if RLS blocks), not 404
```

### Method 2: PostgREST Restart (Local Development)

**Use Case**: NOTIFY command didn't work or PostgREST is unresponsive.

```bash
# Stop Supabase local stack
npx supabase stop

# Start Supabase local stack
npx supabase start

# Verify PostgREST is running
curl http://localhost:54321/rest/v1/ | jq .
```

**Expected Output**:
```json
{
  "swagger": "2.0",
  "info": {
    "title": "PostgREST API",
    "version": "..."
  }
}
```

### Method 3: Full Database Reset (Nuclear Option)

**Use Case**: Schema severely corrupted or cache issues persist.

**WARNING**: This will DROP all data and re-apply all migrations.

```bash
# Backup current data (optional)
npx supabase db dump --data-only > /tmp/data_backup_$(date +%Y%m%d_%H%M%S).sql

# Reset database (drops all schemas, re-applies migrations)
npx supabase db reset

# Restore data (if backed up)
# npx supabase db execute --file /tmp/data_backup_YYYYMMDD_HHMMSS.sql

# Verify types are current
npm run db:types
```

---

## Verification Steps

### 1. Check Schema Cache Status

```bash
# Query PostgREST schema cache metadata
curl -H "Authorization: Bearer ${ANON_KEY}" \
     http://localhost:54321/rest/v1/?select=* | jq .

# Should show current schema version
```

### 2. Verify Table Visibility

```bash
# List all tables via PostgREST
curl -H "Authorization: Bearer ${ANON_KEY}" \
     http://localhost:54321/rest/v1/

# Check specific table
curl -H "Authorization: Bearer ${ANON_KEY}" \
     http://localhost:54321/rest/v1/your_new_table?select=*
```

**Expected**:
- 200 OK (if accessible)
- 401 Unauthorized (if RLS blocks)
- NOT 404 Not Found (indicates cache stale)

### 3. Verify Column Visibility

```bash
# Query table with new column
curl -H "Authorization: Bearer ${ANON_KEY}" \
     -H "x-casino-id: ${TEST_CASINO_ID}" \
     "http://localhost:54321/rest/v1/your_table?select=new_column&limit=1"

# Should return new_column in response, not error
```

### 4. Verify RLS Policies

```bash
# Test RLS enforcement (should be blocked)
curl -X POST \
     -H "Authorization: Bearer ${ANON_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"data": "test"}' \
     http://localhost:54321/rest/v1/your_table

# Expected: 401 or 403 if policy blocks, NOT 500 or schema error
```

Cross-reference: [RUN-004 RLS Verification](RUN-004-rls-policy-verification.md)

### 5. Verify RPC Functions

```bash
# Call new RPC function
curl -X POST \
     -H "Authorization: Bearer ${ANON_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"param": "value"}' \
     http://localhost:54321/rest/v1/rpc/your_new_function

# Should execute, not return "function does not exist"
```

---

## Troubleshooting

### Problem: NOTIFY Has No Effect

**Symptoms**: API still returns 404 after NOTIFY command.

**Diagnosis**:
```bash
# Check PostgREST logs
npx supabase status | grep postgrest

# Check if PostgREST is listening for notifications
npx supabase db execute --file - <<'SQL'
SELECT * FROM pg_listening_channels();
SQL
```

**Solution**:
```bash
# Restart PostgREST explicitly
npx supabase stop
npx supabase start

# Verify reload
curl http://localhost:54321/rest/v1/your_new_table
```

### Problem: Schema Changes Not Visible After Restart

**Symptoms**: Table exists in database but not in API.

**Diagnosis**:
```bash
# Verify table exists in PostgreSQL
npx supabase db execute --file - <<'SQL'
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'your_new_table';
SQL

# Check PostgREST configuration
cat supabase/config.toml | grep -A 5 postgrest
```

**Solution**:
```bash
# Verify schema is 'public' (PostgREST default)
# Check if table has RLS enabled (required for PostgREST exposure)
npx supabase db execute --file - <<'SQL'
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'your_new_table';
SQL

# If RLS not enabled, enable it:
npx supabase db execute --file - <<'SQL'
ALTER TABLE your_new_table ENABLE ROW LEVEL SECURITY;
NOTIFY pgrst, 'reload schema';
SQL
```

### Problem: Enum Values Not Recognized

**Symptoms**: API rejects valid enum values as invalid.

**Diagnosis**:
```bash
# Check enum definition
npx supabase db execute --file - <<'SQL'
SELECT enumlabel FROM pg_enum WHERE enumtypid = 'your_enum'::regtype ORDER BY enumsortorder;
SQL
```

**Solution**:
```bash
# Force schema reload
npx supabase db execute --file - <<'SQL'
NOTIFY pgrst, 'reload schema';
SQL

# Verify enum values in API
curl -H "Authorization: Bearer ${ANON_KEY}" \
     "http://localhost:54321/rest/v1/your_table?select=enum_column"
```

### Problem: Foreign Key Relationships Not Exposed

**Symptoms**: API doesn't show related rows via embedding.

**Diagnosis**:
```bash
# Check foreign key constraints
npx supabase db execute --file - <<'SQL'
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'your_table';
SQL
```

**Solution**:
```bash
# Reload schema to expose relationships
npx supabase db execute --file - <<'SQL'
NOTIFY pgrst, 'reload schema';
SQL

# Test embedding
curl -H "Authorization: Bearer ${ANON_KEY}" \
     "http://localhost:54321/rest/v1/your_table?select=*,related_table(*)"
```

---

## KPI Thresholds (from OBSERVABILITY_SPEC)

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Schema reload latency | < 2s | > 5s |
| API response after reload | < 100ms | > 500ms |
| NOTIFY command execution | < 50ms | > 200ms |
| PostgREST restart time | < 5s | > 15s |

---

## Automation & Monitoring

### Pre-Commit Hook (Prevent Cache Issues)

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash

# Check for direct psql usage in migration scripts
if git diff --cached --name-only | grep -q 'supabase/migrations/'; then
  echo "Migration detected. Reminder: Use 'npx supabase migration up' not 'psql'"
fi
```

### Health Check Script

Create `scripts/check-schema-sync.sh`:

```bash
#!/bin/bash

# Query database for table count
DB_TABLES=$(npx supabase db execute --file - <<'SQL'
SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';
SQL
)

# Query API for table count (via introspection)
API_TABLES=$(curl -s -H "Authorization: Bearer ${ANON_KEY}" http://localhost:54321/rest/v1/ | jq '. | length')

if [ "$DB_TABLES" -ne "$API_TABLES" ]; then
  echo "ERROR: Schema out of sync. DB: $DB_TABLES tables, API: $API_TABLES tables"
  echo "Run: npx supabase db execute --file - <<'SQL'
NOTIFY pgrst, 'reload schema';
SQL"
  exit 1
fi

echo "Schema in sync. Tables: $DB_TABLES"
```

### CI/CD Integration

```yaml
# .github/workflows/schema-sync.yml
name: Schema Sync Check

on:
  pull_request:
    paths:
      - 'supabase/migrations/**'

jobs:
  schema-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Supabase CLI
        run: npm install -g supabase

      - name: Start Supabase
        run: npx supabase start

      - name: Apply Migrations
        run: npx supabase migration up

      - name: Verify Schema Reload
        run: |
          # Check API health
          curl -f http://localhost:54321/rest/v1/ || exit 1

          # Verify latest table exists
          LATEST_MIGRATION=$(ls -1 supabase/migrations/*.sql | tail -1)
          echo "Latest migration: $LATEST_MIGRATION"

          # Extract table name from migration (heuristic)
          TABLE_NAME=$(grep -oP "CREATE TABLE\s+\K\w+" $LATEST_MIGRATION | head -1)

          if [ -n "$TABLE_NAME" ]; then
            echo "Verifying table: $TABLE_NAME"
            curl -f -H "Authorization: Bearer ${ANON_KEY}" \
              "http://localhost:54321/rest/v1/${TABLE_NAME}" || exit 1
          fi
```

---

## Best Practices

### DO

✅ Use `npx supabase db execute` for all SQL commands
✅ Use `npx supabase migration up` for applying migrations
✅ Use `npx supabase db reset` for testing idempotency
✅ Verify API health after schema changes
✅ Document manual NOTIFY usage in commit messages

### DON'T

❌ Use `psql` directly for schema changes
❌ Assume schema is cached after direct SQL execution
❌ Skip verification steps after reload
❌ Modify schema in production without testing reload procedure
❌ Ignore 404 errors assuming "it will fix itself"

---

## References

- **PostgREST Schema Cache**: https://postgrest.org/en/stable/references/schema_cache.html
- **Supabase CLI**: https://supabase.com/docs/guides/cli
- **Migration Runbook**: [RUN-003](RUN-003-schema-migration-runbook.md)
- **RLS Verification**: [RUN-004](RUN-004-rls-policy-verification.md)
- **Type Sync**: [RUN-005](RUN-005-type-sync.md)
- **Observability**: [OBSERVABILITY_SPEC](../OBSERVABILITY_SPEC.md)
- **CLAUDE.md DB Workflow**: [.claude/CLAUDE.md](../../../.claude/CLAUDE.md)

---

## Emergency Contacts

| Issue | Contact | Escalation |
|-------|---------|------------|
| Schema cache corruption | Platform team | SRE on-call |
| PostgREST unresponsive | SRE | Supabase support |
| API 404s in production | Platform team + Product | Incident commander |

---

**Document Status**: Active
**Last Updated**: 2025-11-17
**Next Review**: After first production deployment
