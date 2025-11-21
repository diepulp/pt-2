#!/bin/bash
# Create a new migration with proper YYYYMMDDHHMMSS timestamp naming

set -e

# Check if description provided
if [ -z "$1" ]; then
  echo "Usage: ./create_migration.sh <description>"
  echo "Example: ./create_migration.sh add_player_achievements"
  exit 1
fi

DESCRIPTION=$1

# Generate timestamp in YYYYMMDDHHMMSS format
TIMESTAMP=$(date +"%Y%m%d%H%M%S")

# Create migration file
echo "Creating migration: ${TIMESTAMP}_${DESCRIPTION}.sql"
npx supabase migration new "${TIMESTAMP}_${DESCRIPTION}"

echo ""
echo "✅ Migration created!"
echo ""
echo "Next steps:"
echo "1. Edit the migration file in supabase/migrations/"
echo "2. Add table definitions, RLS policies, and indexes"
echo "3. Apply migration: npx supabase migration up"
echo "4. Regenerate types: npm run db:types"
echo "5. Verify schema: npm test -- schema-verification"
