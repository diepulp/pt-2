#!/usr/bin/env bash
# PT-2 Migration Manager: Create timestamped migration file
# Usage: bash scripts/create-migration.sh "description_here"

set -euo pipefail

# Check if description provided
if [ $# -eq 0 ]; then
  echo "Error: Migration description required"
  echo "Usage: bash create-migration.sh \"description_here\""
  echo "Example: bash create-migration.sh \"add_loyalty_mid_session_reward\""
  exit 1
fi

# Generate timestamp using PT-2 required format
TIMESTAMP=$(date +"%Y%m%d%H%M%S")
DESCRIPTION="$1"

# Sanitize description (replace spaces with underscores, remove special chars)
SAFE_DESCRIPTION=$(echo "$DESCRIPTION" | tr ' ' '_' | tr -cd '[:alnum:]_-')

# Create migration filename
MIGRATION_FILE="supabase/migrations/${TIMESTAMP}_${SAFE_DESCRIPTION}.sql"

# Check if supabase/migrations directory exists
if [ ! -d "supabase/migrations" ]; then
  echo "Error: supabase/migrations/ directory not found"
  echo "Are you in the project root?"
  exit 1
fi

# Create migration file with template
cat > "$MIGRATION_FILE" << 'EOF'
-- Migration: [DESCRIPTION]
-- Created: [TIMESTAMP]
-- Author: [AUTHOR]
-- Bounded Context: [SERVICE] (Reference: SRM v3.0.2 §[SECTION])

-- ============================================================================
-- SCHEMA CHANGES
-- ============================================================================

-- Example: Create table
-- CREATE TABLE IF NOT EXISTS public.my_table (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   casino_id uuid NOT NULL REFERENCES public.casino(id),
--   created_at timestamptz DEFAULT now(),
--   updated_at timestamptz DEFAULT now()
-- );

-- ============================================================================
-- ROW-LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
-- ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

-- Casino Isolation Policy
-- CREATE POLICY "casino_isolation_policy" ON public.my_table
--   USING (casino_id::text = current_setting('app.casino_id', true));

-- ============================================================================
-- INDEXES
-- ============================================================================

-- CREATE INDEX idx_my_table_casino_id ON public.my_table(casino_id);
-- CREATE INDEX idx_my_table_created_at ON public.my_table(created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

-- COMMENT ON TABLE public.my_table IS 'Description of table purpose';
-- COMMENT ON COLUMN public.my_table.casino_id IS 'FK to casino (owner/tenant)';

-- ============================================================================
-- POST-MIGRATION CHECKLIST
-- ============================================================================
-- [ ] Run: npx supabase migration up
-- [ ] Run: npm run db:types
-- [ ] Verify: Schema verification test passes
-- [ ] Verify: RLS policies added for casino_id tables
-- [ ] Commit: migration + types/database.types.ts
EOF

# Replace placeholders
sed -i "s/\[DESCRIPTION\]/$SAFE_DESCRIPTION/g" "$MIGRATION_FILE"
sed -i "s/\[TIMESTAMP\]/$TIMESTAMP/g" "$MIGRATION_FILE"
sed -i "s/\[AUTHOR\]/$(git config user.name || echo 'Unknown')/g" "$MIGRATION_FILE"

echo "✅ Created migration file: $MIGRATION_FILE"
echo ""
echo "Next steps:"
echo "  1. Edit $MIGRATION_FILE with your schema changes"
echo "  2. Run: bash skills/pt2-migration-manager/scripts/apply-migration-and-regen-types.sh"
echo "  3. Run: npx tsx skills/pt2-migration-manager/scripts/validate-rls-coverage.ts"
echo "  4. Commit migration + types/database.types.ts"
echo ""
echo "Remember:"
echo "  - Add RLS policies for tables with casino_id"
echo "  - Follow SRM bounded context ownership (§34-48)"
echo "  - Use lower_snake_case for all identifiers"
