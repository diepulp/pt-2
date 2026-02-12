#!/bin/sh
# ==============================================================================
# ADR-034: RLS Write-Path Lint (Pre-commit)
# ==============================================================================
# Version: 1.0.0
# Date: 2026-02-11
# References:
#   - ADR-034: RLS Write-Path Compatibility & Enforcement
#   - ADR-030: Auth System Hardening (Category A table registry)
#
# Checks staged TypeScript files for direct PostgREST DML against Category A
# tables. Category A tables require SECURITY DEFINER RPCs for all writes.
#
# This is a fast, staged-files-only check. The full scan runs in CI via
# scripts/lint-rls-write-path.sh.
# ==============================================================================

echo "Checking ADR-034 RLS write-path compliance (staged files)..."

# Get staged .ts/.tsx files in production paths (exclude tests, scripts, types)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=d | grep -E '^(app|services|lib)/.*\.(ts|tsx)$' | grep -vE '(__tests__|\.test\.|\.spec\.|\.int\.test\.)' || true)

if [ -z "$STAGED_FILES" ]; then
  echo "  No production TS files staged - skipping"
  exit 0
fi

# Load Category A tables from config
CONFIG_FILE="config/rls-category-a-tables.json"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "  WARNING: $CONFIG_FILE not found. Run: npm run generate:category-a"
  echo "  Skipping write-path lint (config missing)"
  exit 0
fi

# Extract table names using node (available in all dev environments)
TABLES=$(node -e "
  const config = require('./$CONFIG_FILE');
  if (config.categoryA && config.categoryA.length) {
    console.log(config.categoryA.join('|'));
  }
" 2>/dev/null)

if [ -z "$TABLES" ]; then
  echo "  WARNING: No Category A tables in config"
  exit 0
fi

VIOLATIONS=0

for FILE in $STAGED_FILES; do
  # Get staged content (not working tree) for accurate checking
  CONTENT=$(git diff --cached -p "$FILE" | grep '^+' | grep -v '^+++' || true)

  if [ -z "$CONTENT" ]; then
    continue
  fi

  # Check for .from('<category_a_table>').<mutation>( pattern
  # Only flag lines that contain an authenticated client pattern or are
  # preceded by an authenticated-client marker
  MATCHES=$(echo "$CONTENT" | grep -nE "\.from\(['\"]($TABLES)['\"]\)\.(insert|update|upsert|delete)\(" || true)

  if [ -z "$MATCHES" ]; then
    continue
  fi

  # Filter: skip lines using service-role clients
  while IFS= read -r match; do
    if echo "$match" | grep -qE '(serviceSupabase|adminClient|supabaseAdmin|createServiceClient)'; then
      continue
    fi

    # Check for break-glass exemption in the staged diff
    if echo "$CONTENT" | grep -q 'rls-break-glass'; then
      continue
    fi

    VIOLATIONS=$((VIOLATIONS + 1))
    LINE=$(echo "$match" | sed 's/^[0-9]*://' | sed 's/^+//' | xargs)
    echo ""
    echo "  VIOLATION: $FILE"
    echo "    Line: $LINE"
    echo "    Fix:  Use a SECURITY DEFINER RPC instead of PostgREST DML"
  done <<< "$MATCHES"
done

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "=========================================="
  echo "ADR-034: $VIOLATIONS write-path violation(s) found"
  echo "=========================================="
  echo ""
  echo "Category A tables require SECURITY DEFINER RPCs for writes."
  echo "See: docs/80-adrs/ADR-034-RLS-write-path-compatibility-and-enforcement.md"
  echo ""
  exit 1
fi

echo "  ADR-034 write-path lint: PASS"
exit 0
