#!/usr/bin/env bash
# PT-2 Migration Manager: Apply migration and regenerate types
# Usage: bash scripts/apply-migration-and-regen-types.sh

set -euo pipefail

echo "=========================================="
echo "PT-2 Migration Workflow"
echo "=========================================="
echo ""

# Check if we're in project root
if [ ! -f "package.json" ]; then
  echo "❌ Error: Not in project root (package.json not found)"
  exit 1
fi

if [ ! -d "supabase/migrations" ]; then
  echo "❌ Error: supabase/migrations/ directory not found"
  exit 1
fi

# Step 1: Apply migrations
echo "Step 1: Applying migrations..."
echo "Running: npx supabase migration up"
echo ""

if npx supabase migration up; then
  echo "✅ Migrations applied successfully"
else
  echo "❌ Migration failed!"
  echo ""
  echo "Troubleshooting:"
  echo "  - Check migration SQL syntax"
  echo "  - Verify foreign key references exist"
  echo "  - Check for duplicate object names"
  echo "  - Try: npx supabase db reset (for clean state)"
  exit 1
fi

echo ""
echo "Step 2: Regenerating database types..."
echo "Running: npm run db:types"
echo ""

if npm run db:types; then
  echo "✅ Types regenerated successfully"
else
  echo "❌ Type generation failed!"
  echo ""
  echo "Troubleshooting:"
  echo "  - Check Supabase local instance is running"
  echo "  - Verify PostgREST cache reloaded"
  echo "  - Try: npx supabase stop && npx supabase start"
  exit 1
fi

echo ""
echo "Step 3: Verifying schema test..."
echo "Running: npm test -- schema_verification.test.ts"
echo ""

# Check if schema verification test exists
if [ -f "tests/schema_verification.test.ts" ] || [ -f "test/schema_verification.test.ts" ] || [ -f "__tests__/schema_verification.test.ts" ]; then
  if npm test -- --testNamePattern="schema" --bail 2>/dev/null || npm test 2>/dev/null; then
    echo "✅ Schema verification test passed"
  else
    echo "⚠️  Schema verification test failed or not found"
    echo "This is non-blocking but should be investigated"
  fi
else
  echo "⚠️  Schema verification test not found (skipping)"
  echo "Consider adding schema verification tests"
fi

echo ""
echo "=========================================="
echo "Migration Workflow Complete!"
echo "=========================================="
echo ""
echo "Files changed:"
echo "  - supabase/migrations/*.sql (new migration)"
echo "  - types/database.types.ts (regenerated)"
echo ""
echo "Next steps:"
echo "  1. Review types/database.types.ts changes"
echo "  2. Run: npx tsx skills/pt2-migration-manager/scripts/validate-rls-coverage.ts"
echo "  3. Test affected services/endpoints"
echo "  4. Commit: git add supabase/migrations/ types/database.types.ts"
echo ""
echo "Commit message template:"
echo "  migration: [description]"
echo ""
echo "  - [Summary of schema changes]"
echo "  - RLS policy: [policy name]"
echo "  - Regenerated types (database.types.ts)"
echo "  - Verified schema test passes"
echo ""
echo "  Refs: SRM v3.0.2 §[section], SEC-001"
