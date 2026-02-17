#!/usr/bin/env bash
# =============================================================================
# RLS Write-Path Lint (PRD-034 WS3)
#
# Detects PostgREST DML against Category A tables in production code.
# Category A tables require SECURITY DEFINER RPCs for writes (ADR-034).
#
# Detection rule: A violation is a chain <client>.<from>('<TABLE>').<mutation>
# where <client> is ctx.supabase or mwCtx.supabase, <TABLE> is in Category A,
# and <mutation> is .insert( / .update( / .upsert( / .delete(
#
# Usage: bash scripts/lint-rls-write-path.sh
# Exit:  0 = clean, 1 = violations found, 2 = config error
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/config/rls-category-a-tables.json"

# --- Config validation ---
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "ERROR: Category A config not found at $CONFIG_FILE"
  echo "Run: npm run generate:category-a"
  exit 2
fi

# Extract table names from JSON config
TABLES=$(python3 -c "
import json, sys
with open('$CONFIG_FILE') as f:
    config = json.load(f)
tables = config.get('categoryA', [])
if not tables:
    print('ERROR: No Category A tables in config', file=sys.stderr)
    sys.exit(1)
print('|'.join(tables))
" 2>&1) || {
  echo "ERROR: Failed to parse $CONFIG_FILE"
  exit 2
}

if [[ -z "$TABLES" ]]; then
  echo "ERROR: No Category A tables found in config"
  exit 2
fi

# --- Scan directories ---
SCAN_DIRS=("$PROJECT_ROOT/app" "$PROJECT_ROOT/services" "$PROJECT_ROOT/lib")
EXCLUDE_PATTERNS=(
  '__tests__'
  '*.test.ts'
  '*.spec.ts'
  '*.int.test.ts'
  'e2e/'
)

# Build grep exclusion args
EXCLUDE_ARGS=()
for pattern in "${EXCLUDE_PATTERNS[@]}"; do
  EXCLUDE_ARGS+=(--exclude-dir="$pattern" --exclude="$pattern")
done

# --- Detection ---
# Mutations to detect
MUTATIONS="insert\(|update\(|upsert\(|delete\("

# Authenticated client identifiers (exhaustive per EXEC-SPEC)
CLIENTS="ctx\.supabase|mwCtx\.supabase"

# Service clients to skip entirely
SERVICE_CLIENTS="serviceSupabase|adminClient|supabaseAdmin|createServiceClient"

# Break-glass exemption marker
BREAK_GLASS="rls-break-glass"

VIOLATIONS=0
VIOLATION_DETAILS=""

# Convert pipe-delimited tables to array
IFS='|' read -ra TABLE_ARRAY <<< "$TABLES"

for table in "${TABLE_ARRAY[@]}"; do
  # Search for .from('<table>') followed by mutation methods
  # Pattern: <client>.from('<table>').<mutation>(
  for scan_dir in "${SCAN_DIRS[@]}"; do
    [[ -d "$scan_dir" ]] || continue

    # Use grep to find potential violations
    # Match: .from('table_name').insert( or .from('table_name').update( etc.
    while IFS= read -r match; do
      file=$(echo "$match" | cut -d: -f1)
      line_num=$(echo "$match" | cut -d: -f2)
      line_content=$(echo "$match" | cut -d: -f3-)

      # Skip if line contains service client (not authenticated)
      if echo "$line_content" | grep -qE "$SERVICE_CLIENTS"; then
        continue
      fi

      # Check if line uses authenticated client
      if ! echo "$line_content" | grep -qE "$CLIENTS"; then
        # Check for marker comment on preceding line
        if [[ "$line_num" -gt 1 ]]; then
          prev_line=$(sed -n "$((line_num - 1))p" "$file" 2>/dev/null || true)
          if ! echo "$prev_line" | grep -q "rls-lint: authenticated-client"; then
            continue
          fi
        else
          continue
        fi
      fi

      # Check for break-glass exemption
      if grep -q "$BREAK_GLASS" "$file" 2>/dev/null; then
        # Verify the break-glass block has all 5 required fields
        if grep -cE '(table|reason|compensating_controls|expires|ticket)' "$file" 2>/dev/null | grep -q '^[5-9]'; then
          continue
        fi
      fi

      VIOLATIONS=$((VIOLATIONS + 1))
      rel_path="${file#$PROJECT_ROOT/}"
      VIOLATION_DETAILS+="  VIOLATION: $rel_path:$line_num\n"
      VIOLATION_DETAILS+="    Table: $table (Category A)\n"
      VIOLATION_DETAILS+="    Line:  $(echo "$line_content" | xargs)\n"
      VIOLATION_DETAILS+="    Fix:   Use a SECURITY DEFINER RPC (rpc_*) instead of PostgREST DML\n\n"
    done < <(grep -rnE "${EXCLUDE_ARGS[@]+"${EXCLUDE_ARGS[@]}"}" \
      "\.from\(['\"]${table}['\"]\)\.(${MUTATIONS})" \
      "$scan_dir" 2>/dev/null || true)
  done
done

# --- Results ---
if [[ $VIOLATIONS -gt 0 ]]; then
  echo "=========================================="
  echo "RLS Write-Path Lint: $VIOLATIONS violation(s) found"
  echo "=========================================="
  echo ""
  echo -e "$VIOLATION_DETAILS"
  echo "Category A tables require SECURITY DEFINER RPCs for writes (ADR-034)."
  echo "See: docs/80-adrs/ADR-034-RLS-write-path-compatibility-and-enforcement.md"
  exit 1
else
  echo "RLS Write-Path Lint: PASS (0 violations)"
  exit 0
fi
