#!/bin/bash
# =====================================================
# Migration Filename Validator
# =====================================================
# Purpose: Ensure all migration files follow YYYYMMDDHHMMSS_description.sql pattern
# Usage: ./scripts/validate-migration-names.sh
# Exit Codes: 0 = success, 1 = validation failed
# =====================================================

set -e

MIGRATIONS_DIR="supabase/migrations"
PATTERN='^[0-9]{14}_[a-z0-9_]+\.sql$'
ERROR_COUNT=0

echo "🔍 Validating migration filenames in $MIGRATIONS_DIR..."
echo ""

# Check if migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "❌ Migration directory not found: $MIGRATIONS_DIR"
  exit 1
fi

# Validate each migration file
for file in "$MIGRATIONS_DIR"/*.sql; do
  # Skip if no .sql files exist
  if [ ! -f "$file" ]; then
    echo "⚠️  No migration files found"
    exit 0
  fi

  filename=$(basename "$file")

  # Check pattern
  if ! echo "$filename" | grep -qE "$PATTERN"; then
    echo "❌ Invalid: $filename"
    echo "   Expected: YYYYMMDDHHMMSS_description.sql"
    echo "   Example:  20251014134942_add_mtl_columns.sql"
    echo ""
    ((ERROR_COUNT++))
  fi
done

# Report results
if [ $ERROR_COUNT -eq 0 ]; then
  echo "✅ All migration filenames are valid"
  echo ""
  echo "Standard: YYYYMMDDHHMMSS_description.sql"
  echo "Total migrations: $(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)"
  exit 0
else
  echo ""
  echo "❌ Found $ERROR_COUNT invalid migration filename(s)"
  echo ""
  echo "Fix with:"
  echo "  TIMESTAMP=\$(date +\"%Y%m%d%H%M%S\")"
  echo "  mv old_name.sql \${TIMESTAMP}_descriptive_name.sql"
  echo ""
  echo "See: docs/patterns/MIGRATION_NAMING_STANDARD.md"
  exit 1
fi
