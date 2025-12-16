#!/usr/bin/env bash
# ADR-015/ADR-020 RLS Compliance Scanner
# Scans migrations for deprecated RLS patterns and generates compliance report
#
# Updated 2025-12-15: Multi-line pattern detection for ADR-020 Track A compliance
#
# Patterns Checked (statement-level detection):
#   - ANTI-PATTERN 1: Bare current_setting without COALESCE/NULLIF wrapper
#   - ANTI-PATTERN 2: current_setting without 'true' second parameter (throws on null)
#   - ANTI-PATTERN 3: Missing auth.uid() IS NOT NULL check in policies
#   - ANTI-PATTERN 4: Deprecated SET LOCAL patterns outside RPCs
#   - ANTI-PATTERN 5: Direct JWT claim usage without session fallback (not in COALESCE)
#   - ANTI-PATTERN 6: staff_role without hybrid fallback
#   - ANTI-PATTERN 7: actor_id without hybrid fallback
#   - ANTI-PATTERN 8: SECURITY DEFINER without context self-injection (ADR-020 Phase 1)
#   - ANTI-PATTERN 9: SECURITY DEFINER with p_casino_id param but missing IS DISTINCT FROM validation (SEC-006/007)
#
# Reference: docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md
# Reference: docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md
#
# ═══════════════════════════════════════════════════════════════════════════════
# SCANNER LIMITATIONS (documented per RLS Expert validation 2025-12-15)
# ═══════════════════════════════════════════════════════════════════════════════
#
# 1. STATIC ANALYSIS ONLY
#    - Cannot detect runtime context injection issues (e.g., context not set before query)
#    - Requires integration testing to verify actual RLS behavior under pooling
#
# 2. AWK PATTERN MATCHING EDGE CASES
#    - Nested quotes in SQL may confuse the parser (rare in practice)
#    - Complex function bodies with multiple $$ blocks may have false positives
#    - Record separator (;) assumes standard SQL formatting
#
# 3. FALSE NEGATIVE RISKS
#    - Custom casino_id column names (e.g., `tenant_id`) not detected
#    - Policies using subqueries for casino scope may be missed
#    - Non-standard JWT claim paths not covered
#
# 4. SCOPE LIMITATIONS
#    - Only scans .sql files in migrations directory
#    - Does not validate TypeScript RLS context injection code
#    - Does not check runtime Supabase client configuration
#
# 5. WHAT THIS SCANNER CANNOT VERIFY
#    - Actual database state (use pg_policies queries for that)
#    - JWT claims are correctly synced on staff changes
#    - Connection pooling behavior in production (requires load testing)
#
# For comprehensive RLS verification, combine this scanner with:
#   - Integration tests: lib/supabase/__tests__/rls-*.integration.test.ts
#   - Manual SQL verification: See .claude/skills/rls-expert/references/verification-checklist.md
#   - Production monitoring: Supabase logs for RLS policy failures
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

MIGRATIONS_DIR="${1:-supabase/migrations}"
OUTPUT_FILE="${2:-docs/issues/adr015-compliance-report.md}"
VERBOSE="${VERBOSE:-false}"

# Colors for terminal output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# ADR-015 compliant migrations (known good - skip for regression detection)
# Updated 2025-12-12: Added SEC-006/SEC-007 hardening migrations
COMPLIANT_MIGRATIONS=(
  "20251209183033_adr015_rls_context_rpc.sql"
  "20251209183401_adr015_hybrid_rls_policies.sql"
  "20251210001858_adr015_backfill_jwt_claims.sql"
  "20251211153228_adr015_rls_compliance_patch.sql"
  "20251211161847_adr015_add_cashier_role.sql"
  "20251211170030_adr015_finance_rls_hybrid.sql"
  "20251211172516_adr015_financial_rpc_hardening.sql"
  "20251212080915_sec006_rls_hardening.sql"
  "20251212081000_sec007_rating_slip_rpc_hardening.sql"
  "20251214195201_adr015_prd004_loyalty_rls_fix.sql"
)

# Superseded migrations - policies/functions in these files were REPLACED by later migrations
# These are historical records; the database has compliant code from the fix migrations
# Format: "migration_file|fixed_by_migration"
SUPERSEDED_MIGRATIONS=(
  "00000000000000_baseline_srm.sql|20251211172516_adr015_financial_rpc_hardening.sql"
  "20251128221408_rating_slip_pause_tracking.sql|20251209183401_adr015_hybrid_rls_policies.sql"
  "20251129161956_prd000_casino_foundation.sql|20251211153228_adr015_rls_compliance_patch.sql"
  "20251129230733_prd003_player_visit_rls.sql|20251209183401_adr015_hybrid_rls_policies.sql"
  "20251209023430_fix_staff_rls_bootstrap.sql|20251211153228_adr015_rls_compliance_patch.sql"
  "20251207024918_rating_slip_drop_player_id.sql|20251213190000_adr015_fix_rpc_context_injection.sql"
)

# Counters
total_files=0
files_with_issues=0
total_issues=0
superseded_files=0
declare -A issue_counts

# Initialize issue counters
issue_counts["bare_current_setting"]=0
issue_counts["missing_true_param"]=0
issue_counts["missing_auth_uid"]=0
issue_counts["deprecated_set_local"]=0
issue_counts["direct_jwt_only"]=0
issue_counts["missing_actor_hybrid"]=0
issue_counts["missing_role_hybrid"]=0
issue_counts["definer_no_injection"]=0
issue_counts["definer_no_mismatch_check"]=0

# Store findings
declare -a findings=()

is_compliant_migration() {
  local filename="$1"
  for compliant in "${COMPLIANT_MIGRATIONS[@]}"; do
    if [[ "$filename" == *"$compliant" ]]; then
      return 0
    fi
  done
  return 1
}

is_superseded_migration() {
  local filename="$1"
  for entry in "${SUPERSEDED_MIGRATIONS[@]}"; do
    local superseded_file="${entry%%|*}"
    if [[ "$filename" == *"$superseded_file" ]]; then
      return 0
    fi
  done
  return 1
}

get_superseded_by() {
  local filename="$1"
  for entry in "${SUPERSEDED_MIGRATIONS[@]}"; do
    local superseded_file="${entry%%|*}"
    local fixed_by="${entry##*|}"
    if [[ "$filename" == *"$superseded_file" ]]; then
      echo "$fixed_by"
      return 0
    fi
  done
  echo ""
}

scan_file() {
  local file="$1"
  local filename=$(basename "$file")
  local file_issues=0
  local file_findings=""

  # Skip known compliant migrations
  if is_compliant_migration "$filename"; then
    [[ "$VERBOSE" == "true" ]] && echo -e "${GREEN}SKIP${NC} $filename (ADR-015 compliant)"
    return 0
  fi

  # Skip superseded migrations (policies replaced by later fix migrations)
  if is_superseded_migration "$filename"; then
    local fixed_by=$(get_superseded_by "$filename")
    superseded_files=$((superseded_files + 1))
    echo -e "${YELLOW}SUPERSEDED${NC} $filename (fixed by $fixed_by)"
    return 0
  fi

  # ═══════════════════════════════════════════════════════════════════════════
  # MULTI-LINE PATTERN DETECTION (ADR-020 compliant)
  # Uses statement-level parsing (;-delimited) instead of line-by-line grep
  # ═══════════════════════════════════════════════════════════════════════════

  # ANTI-PATTERN 1: Bare current_setting for casino_id without COALESCE wrapper
  # Uses statement-level check to handle multi-line SQL formatting
  # Note: Skips function bodies (between $$) - RPCs use if-then fallback pattern which is valid
  local bare_casino_settings=$(awk '
    BEGIN { RS=";"; linenum=1; in_function=0 }
    {
      # Track line numbers within statement
      stmt_start = linenum
      n = split($0, lines, /\n/)
      linenum += n

      # Track function body boundaries (BEGIN/END or $$ delimiters)
      if (/\$\$/ || /^[[:space:]]*BEGIN[[:space:]]*$/ || /AS[[:space:]]+\$\$/) {
        in_function = !in_function
      }
      if (/^[[:space:]]*END[[:space:]]*;/ || /END[[:space:]]*\$\$/) {
        in_function = 0
      }

      # Skip function bodies - they use if-then fallback pattern
      if (in_function) next

      # Check for current_setting(app.casino_id) without COALESCE wrapper in same statement
      if (/current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.casino_id['"'"'"]/ &&
          !/COALESCE[[:space:]]*\([^;]*current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.casino_id/) {
        # Extract the line with current_setting for reporting
        for (i=1; i<=n; i++) {
          if (lines[i] ~ /current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.casino_id/) {
            gsub(/^[[:space:]]+/, "", lines[i])
            print (stmt_start + i - 1) ": " substr(lines[i], 1, 70)
          }
        }
      }
    }
  ' "$file" 2>/dev/null || true)

  if [[ -n "$bare_casino_settings" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [BARE_CURRENT_SETTING]: \`${content:0:70}...\`"
      issue_counts["bare_current_setting"]=$((${issue_counts["bare_current_setting"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$bare_casino_settings"
  fi

  # ANTI-PATTERN 2: current_setting without 'true' second param (missing silent fail)
  # This can still use line-by-line since it's checking param presence on same line
  local missing_true=$(grep -nE "current_setting\s*\(\s*['\"]app\.[^'\"]+['\"]\s*\)" "$file" | \
    grep -vE "current_setting\s*\(\s*['\"][^'\"]+['\"],\s*(true|'t')" | \
    grep -vE "^\s*--" || true)

  if [[ -n "$missing_true" ]]; then
    while IFS= read -r line; do
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      # Skip if this is in a comment
      if [[ "$content" =~ ^[[:space:]]*-- ]]; then
        continue
      fi
      file_findings+="\n  - **Line $linenum** [MISSING_TRUE_PARAM]: \`${content:0:70}...\`"
      issue_counts["missing_true_param"]=$((${issue_counts["missing_true_param"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$missing_true"
  fi

  # ANTI-PATTERN 3: RLS policy without auth.uid() IS NOT NULL
  # Uses statement-level parsing for multi-line policies
  local policies_without_auth=$(awk '
    BEGIN { RS=";"; IGNORECASE=1 }
    /CREATE[[:space:]]+POLICY/ && !/auth\.uid[[:space:]]*\([[:space:]]*\)[[:space:]]+IS[[:space:]]+NOT[[:space:]]+NULL/ {
      # Extract policy name - handle both quoted and unquoted
      if (match($0, /CREATE[[:space:]]+POLICY[[:space:]]+\"?([a-zA-Z_][a-zA-Z0-9_]*)\"?/, arr)) {
        policy = arr[1]
      } else if (match($0, /CREATE[[:space:]]+POLICY[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)/)) {
        policy = substr($0, RSTART+14, RLENGTH-14)
        gsub(/[[:space:]].*/, "", policy)
        gsub(/"/, "", policy)
      }
      if (policy != "" && policy !~ /bootstrap|self_lookup|deny/) {
        gsub(/\n/, " ", $0)
        print policy
      }
    }
  ' "$file" 2>/dev/null || true)

  if [[ -n "$policies_without_auth" ]]; then
    while IFS= read -r policy_name; do
      [[ -z "$policy_name" ]] && continue
      file_findings+="\n  - **Policy** [MISSING_AUTH_UID]: \`$policy_name\` lacks \`auth.uid() IS NOT NULL\`"
      issue_counts["missing_auth_uid"]=$((${issue_counts["missing_auth_uid"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$policies_without_auth"
  fi

  # ANTI-PATTERN 4: SET LOCAL outside of function context (vulnerable to pooling)
  local set_local=$(grep -nE "^\s*SET\s+LOCAL\s+app\." "$file" | \
    grep -vE "PERFORM\s+set_config|within.*function|-- (legacy|deprecated)" || true)

  if [[ -n "$set_local" ]]; then
    while IFS= read -r line; do
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [DEPRECATED_SET_LOCAL]: \`${content:0:70}...\`"
      issue_counts["deprecated_set_local"]=$((${issue_counts["deprecated_set_local"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$set_local"
  fi

  # ANTI-PATTERN 5: Direct JWT-only casino_id usage (not inside COALESCE as fallback)
  # Statement-level check: JWT usage is valid ONLY as second arg of COALESCE
  # Note: Skips function bodies - RPCs use if-then fallback pattern which is valid
  local jwt_only_issues=$(awk '
    BEGIN { RS=";"; linenum=1; in_function=0 }
    {
      stmt_start = linenum
      n = split($0, lines, /\n/)
      linenum += n

      # Track function body boundaries
      if (/\$\$/ || /^[[:space:]]*BEGIN[[:space:]]*$/ || /AS[[:space:]]+\$\$/) {
        in_function = !in_function
      }
      if (/^[[:space:]]*END[[:space:]]*;/ || /END[[:space:]]*\$\$/) {
        in_function = 0
      }

      # Skip function bodies - they use if-then fallback pattern
      if (in_function) next

      # Look for JWT casino_id usage
      if (/auth\.jwt\(\)[[:space:]]*->[[:space:]]*['"'"'"]app_metadata['"'"'"][[:space:]]*->>[[:space:]]*['"'"'"]casino_id['"'"'"]/) {
        # Valid: inside COALESCE as fallback (current_setting comes first)
        if (/COALESCE[[:space:]]*\([^;]*current_setting[^;]*auth\.jwt/) {
          next  # This is correct Pattern C
        }
        # Invalid: JWT used standalone or as primary source
        for (i=1; i<=n; i++) {
          if (lines[i] ~ /auth\.jwt\(\)[[:space:]]*->.*casino_id/) {
            gsub(/^[[:space:]]+/, "", lines[i])
            print (stmt_start + i - 1) ": " substr(lines[i], 1, 70)
          }
        }
      }
    }
  ' "$file" 2>/dev/null || true)

  if [[ -n "$jwt_only_issues" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [DIRECT_JWT_ONLY]: \`${content:0:70}...\`"
      issue_counts["direct_jwt_only"]=$((${issue_counts["direct_jwt_only"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$jwt_only_issues"
  fi

  # ANTI-PATTERN 6: staff_role current_setting without hybrid fallback
  # Statement-level: staff_role must have COALESCE with JWT fallback
  local role_without_hybrid=$(awk '
    BEGIN { RS=";"; linenum=1 }
    {
      stmt_start = linenum
      n = split($0, lines, /\n/)
      linenum += n

      # Check for current_setting(app.staff_role) without hybrid pattern
      if (/current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.staff_role['"'"'"]/) {
        # Valid: COALESCE with both current_setting and JWT staff_role
        if (/COALESCE[[:space:]]*\([^;]*current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.staff_role['"'"'"][^;]*auth\.jwt[^;]*staff_role/) {
          next  # Correct hybrid pattern
        }
        # Also valid: COALESCE wrapper even without JWT (inside RPC where context is set)
        if (/COALESCE[[:space:]]*\([^;]*NULLIF[[:space:]]*\([[:space:]]*current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.staff_role/) {
          next  # Has COALESCE+NULLIF wrapper
        }
        # Invalid: bare current_setting
        for (i=1; i<=n; i++) {
          if (lines[i] ~ /current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.staff_role/) {
            gsub(/^[[:space:]]+/, "", lines[i])
            print (stmt_start + i - 1) ": " substr(lines[i], 1, 70)
          }
        }
      }
    }
  ' "$file" 2>/dev/null || true)

  if [[ -n "$role_without_hybrid" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [MISSING_ROLE_HYBRID]: \`${content:0:70}...\`"
      issue_counts["missing_role_hybrid"]=$((${issue_counts["missing_role_hybrid"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$role_without_hybrid"
  fi

  # ANTI-PATTERN 7: actor_id without hybrid fallback
  local actor_without_hybrid=$(awk '
    BEGIN { RS=";"; linenum=1 }
    {
      stmt_start = linenum
      n = split($0, lines, /\n/)
      linenum += n

      if (/current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.actor_id['"'"'"]/) {
        # Valid: COALESCE with JWT fallback
        if (/COALESCE[[:space:]]*\([^;]*current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.actor_id['"'"'"][^;]*auth\.jwt[^;]*staff_id/) {
          next
        }
        if (/COALESCE[[:space:]]*\([^;]*NULLIF[[:space:]]*\([[:space:]]*current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.actor_id/) {
          next
        }
        for (i=1; i<=n; i++) {
          if (lines[i] ~ /current_setting[[:space:]]*\([[:space:]]*['"'"'"]app\.actor_id/) {
            gsub(/^[[:space:]]+/, "", lines[i])
            print (stmt_start + i - 1) ": " substr(lines[i], 1, 70)
          }
        }
      }
    }
  ' "$file" 2>/dev/null || true)

  if [[ -n "$actor_without_hybrid" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [MISSING_ACTOR_HYBRID]: \`${content:0:70}...\`"
      issue_counts["missing_actor_hybrid"]=$((${issue_counts["missing_actor_hybrid"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$actor_without_hybrid"
  fi

  # ═══════════════════════════════════════════════════════════════════════════
  # ANTI-PATTERN 8: SECURITY DEFINER without self-injection (ADR-020 Phase 1)
  # SECURITY DEFINER functions that access casino-scoped data must self-inject context
  # Valid injection methods: set_config('app.*') OR set_rls_context()
  # ═══════════════════════════════════════════════════════════════════════════
  local definer_without_injection=$(awk '
    BEGIN { RS="\\$\\$"; IGNORECASE=1; in_function=0; func_name="" }
    /CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION/ && /SECURITY[[:space:]]+DEFINER/ {
      # Extract function name - must be from CREATE FUNCTION line, not EXECUTE FUNCTION
      if (match($0, /CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\(/)) {
        # Extract just the function name from the match
        temp = substr($0, RSTART, RLENGTH)
        gsub(/CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION[[:space:]]+/, "", temp)
        gsub(/[[:space:]]*\(.*/, "", temp)
        func_name = temp
      }
      in_function = 1
      func_body = ""
      next
    }
    in_function == 1 {
      func_body = $0
      in_function = 0

      # Check if function accesses casino-scoped tables (expanded list per RLS Expert validation)
      if (func_body ~ /(loyalty_ledger|player_loyalty|rating_slip|player_visit|gaming_table|staff|player|visit|player_financial_transaction|floor_layout|floor_pit|floor_table_slot|floor_layout_version|floor_layout_activation|mtl_entry|finance_outbox|loyalty_outbox)/) {
        # Valid self-injection: set_config OR set_rls_context call
        has_injection = 0
        if (func_body ~ /set_config[[:space:]]*\([[:space:]]*['"'"'"]app\./) has_injection = 1
        if (func_body ~ /set_rls_context[[:space:]]*\(/) has_injection = 1

        if (has_injection == 0 && func_name != "" && func_name !~ /^(set_rls_context|get_)/) {
          print func_name ": SECURITY DEFINER without context self-injection"
        }
      }
      func_name = ""
    }
  ' "$file" 2>/dev/null || true)

  if [[ -n "$definer_without_injection" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local func_name=$(echo "$line" | cut -d: -f1)
      file_findings+="\n  - **Function** [DEFINER_NO_INJECTION]: \`$func_name\` is SECURITY DEFINER but lacks \`set_config('app.*')\`"
      issue_counts["definer_no_injection"]=$((${issue_counts["definer_no_injection"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$definer_without_injection"
  fi

  # ═══════════════════════════════════════════════════════════════════════════
  # ANTI-PATTERN 9: SECURITY DEFINER with p_casino_id but missing IS DISTINCT FROM validation
  # SEC-006/SEC-007 Template 5 requires mismatch validation:
  #   IF p_casino_id IS DISTINCT FROM v_context_casino_id THEN RAISE EXCEPTION ...
  # ═══════════════════════════════════════════════════════════════════════════
  local definer_missing_mismatch=$(awk '
    BEGIN { RS="\\$\\$"; IGNORECASE=1; in_function=0; func_name="" }
    /CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION/ && /SECURITY[[:space:]]+DEFINER/ && /p_casino_id[[:space:]]+uuid/ {
      # Extract function name
      if (match($0, /CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)[[:space:]]*\(/)) {
        temp = substr($0, RSTART, RLENGTH)
        gsub(/CREATE[[:space:]]+(OR[[:space:]]+REPLACE[[:space:]]+)?FUNCTION[[:space:]]+/, "", temp)
        gsub(/[[:space:]]*\(.*/, "", temp)
        func_name = temp
      }
      in_function = 1
      func_body = ""
      next
    }
    in_function == 1 {
      func_body = $0
      in_function = 0

      # Skip utility functions that do not need mismatch check
      if (func_name ~ /^(set_rls_context|get_|sync_)/) {
        func_name = ""
        next
      }

      # Check if function has IS DISTINCT FROM validation for p_casino_id
      has_mismatch_check = 0
      if (func_body ~ /IS[[:space:]]+DISTINCT[[:space:]]+FROM[[:space:]]+(v_context_casino_id|p_casino_id)/) has_mismatch_check = 1
      if (func_body ~ /p_casino_id[[:space:]]+IS[[:space:]]+DISTINCT[[:space:]]+FROM/) has_mismatch_check = 1
      if (func_body ~ /v_context_casino_id[[:space:]]+IS[[:space:]]+DISTINCT[[:space:]]+FROM/) has_mismatch_check = 1
      # Also accept <> operator as equivalent
      if (func_body ~ /p_casino_id[[:space:]]*<>[[:space:]]*(v_context_casino_id|COALESCE)/) has_mismatch_check = 1
      if (func_body ~ /v_context_casino_id[[:space:]]*<>[[:space:]]*p_casino_id/) has_mismatch_check = 1

      if (has_mismatch_check == 0 && func_name != "") {
        print func_name ": Missing IS DISTINCT FROM casino_id validation (SEC-006/007 Template 5)"
      }
      func_name = ""
    }
  ' "$file" 2>/dev/null || true)

  if [[ -n "$definer_missing_mismatch" ]]; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      local func_name=$(echo "$line" | cut -d: -f1)
      file_findings+="\n  - **Function** [DEFINER_NO_MISMATCH_CHECK]: \`$func_name\` has p_casino_id param but missing \`IS DISTINCT FROM\` validation"
      issue_counts["definer_no_mismatch_check"]=$((${issue_counts["definer_no_mismatch_check"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$definer_missing_mismatch"
  fi

  # Report file results
  if [[ $file_issues -gt 0 ]]; then
    findings+=("### $filename\n$file_findings")
    files_with_issues=$((files_with_issues + 1))
    total_issues=$((total_issues + file_issues))
    echo -e "${RED}FAIL${NC} $filename ($file_issues issues)"
  else
    [[ "$VERBOSE" == "true" ]] && echo -e "${GREEN}PASS${NC} $filename"
  fi

  total_files=$((total_files + 1))
}

generate_report() {
  local timestamp=$(date -Iseconds)

  cat > "$OUTPUT_FILE" << EOF
# ADR-015/ADR-020 RLS Compliance Report

**Generated:** $timestamp
**Scanner:** scripts/adr015-rls-scanner.sh
**Reference:** docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md
**Reference:** docs/80-adrs/ADR-020-rls-track-a-mvp-strategy.md

---

## Summary

| Metric | Value |
|--------|-------|
| Files Scanned | $total_files |
| Files Superseded | $superseded_files |
| Files with Issues | $files_with_issues |
| Total Issues | $total_issues |

### Issue Breakdown

| Anti-Pattern | Count | Description |
|--------------|-------|-------------|
| BARE_CURRENT_SETTING | ${issue_counts["bare_current_setting"]} | Missing COALESCE(NULLIF(...)) wrapper |
| MISSING_TRUE_PARAM | ${issue_counts["missing_true_param"]} | Missing \`true\` param (throws on null) |
| MISSING_AUTH_UID | ${issue_counts["missing_auth_uid"]} | Policy lacks \`auth.uid() IS NOT NULL\` |
| DEPRECATED_SET_LOCAL | ${issue_counts["deprecated_set_local"]} | SET LOCAL outside transaction-wrapped RPC |
| DIRECT_JWT_ONLY | ${issue_counts["direct_jwt_only"]} | JWT claim usage without session fallback |
| MISSING_ACTOR_HYBRID | ${issue_counts["missing_actor_hybrid"]} | app.actor_id missing COALESCE + JWT staff_id fallback |
| MISSING_ROLE_HYBRID | ${issue_counts["missing_role_hybrid"]} | app.staff_role missing COALESCE + JWT staff_role fallback |
| DEFINER_NO_INJECTION | ${issue_counts["definer_no_injection"]} | SECURITY DEFINER lacks set_config self-injection |
| DEFINER_NO_MISMATCH_CHECK | ${issue_counts["definer_no_mismatch_check"]} | SECURITY DEFINER with p_casino_id missing IS DISTINCT FROM validation |

---

## Compliant Pattern (ADR-015 Pattern C)

\`\`\`sql
CREATE POLICY "table_read_hybrid"
  ON {table_name} FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND casino_id = COALESCE(
      NULLIF(current_setting('app.casino_id', true), '')::uuid,
      (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid
    )
  );
\`\`\`

**Requirements:**
1. \`auth.uid() IS NOT NULL\` - Ensures authenticated user
2. \`current_setting('app.X', true)\` - Silent fail if unset
3. \`NULLIF(..., '')\` - Treat empty string as null
4. \`COALESCE(..., auth.jwt() -> 'app_metadata' ->> 'X')\` - JWT fallback
5. For actor/role checks: include JWT staff_id/staff_role fallback in the COALESCE

---

## Anti-Patterns Detected

EOF

  if [[ $total_issues -eq 0 ]]; then
    echo -e "\n**No issues detected.** All scanned migrations are ADR-015 compliant.\n" >> "$OUTPUT_FILE"
  else
    for finding in "${findings[@]}"; do
      echo -e "$finding\n" >> "$OUTPUT_FILE"
    done
  fi

  cat >> "$OUTPUT_FILE" << EOF
---

## Remediation Steps

1. **For BARE_CURRENT_SETTING**: Wrap with \`COALESCE(NULLIF(current_setting('app.X', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'X')::uuid)\`

2. **For MISSING_TRUE_PARAM**: Add \`true\` as second parameter: \`current_setting('app.X', true)\`

3. **For MISSING_AUTH_UID**: Add \`auth.uid() IS NOT NULL AND\` at start of USING/WITH CHECK clause

4. **For DEPRECATED_SET_LOCAL**: Use \`set_rls_context()\` RPC instead (ADR-015 Phase 1)

5. **For DEFINER_NO_INJECTION**: Add context self-injection at start of SECURITY DEFINER function:
   \`\`\`sql
   PERFORM set_config('app.casino_id', p_casino_id::text, true);
   PERFORM set_config('app.actor_id', auth.uid()::text, true);
   \`\`\`

6. **For DEFINER_NO_MISMATCH_CHECK**: Add SEC-006/007 Template 5 validation block:
   \`\`\`sql
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
   \`\`\`

---

## Excluded (Known Compliant)

The following migrations implement ADR-015 and are excluded from regression scanning:

$(printf -- '- %s\n' "${COMPLIANT_MIGRATIONS[@]}")

---

## Superseded (Policies Replaced)

The following legacy migrations contained non-compliant policies that were **replaced** by later Pattern C migrations.
The database has compliant policies; these files are historical records only.

| Legacy Migration | Fixed By |
|------------------|----------|
$(for entry in "${SUPERSEDED_MIGRATIONS[@]}"; do
  file="${entry%%|*}"
  fixed="${entry##*|}"
  echo "| $file | $fixed |"
done)

---

## Next Actions

EOF

  if [[ $total_issues -gt 0 ]]; then
    cat >> "$OUTPUT_FILE" << EOF
- [ ] Create remediation migration with timestamp format: \`YYYYMMDDHHMMSS_adr015_*.sql\`
- [ ] Update non-compliant policies to Pattern C
- [ ] Run \`npx supabase migration up\` to apply
- [ ] Run \`npm run db:types\` to regenerate types
- [ ] Re-run this scanner to verify compliance
EOF
  else
    echo "All migrations compliant. No action required." >> "$OUTPUT_FILE"
  fi
}

main() {
  echo "========================================"
  echo "ADR-015 RLS Compliance Scanner"
  echo "========================================"
  echo ""

  if [[ ! -d "$MIGRATIONS_DIR" ]]; then
    echo -e "${RED}ERROR${NC}: Migrations directory not found: $MIGRATIONS_DIR"
    exit 1
  fi

  echo "Scanning: $MIGRATIONS_DIR"
  echo "Output:   $OUTPUT_FILE"
  echo ""

  # Ensure output directory exists
  mkdir -p "$(dirname "$OUTPUT_FILE")"

  # Scan all migration files
  for file in "$MIGRATIONS_DIR"/*.sql; do
    [[ -f "$file" ]] && scan_file "$file"
  done

  echo ""
  echo "========================================"
  echo "Scan Complete"
  echo "========================================"
  echo ""
  echo "Files scanned:     $total_files"
  echo "Files superseded:  $superseded_files (policies replaced by later migrations)"
  echo "Files with issues: $files_with_issues"
  echo "Total issues:      $total_issues"
  echo ""

  # Generate report
  generate_report
  echo -e "Report generated: ${GREEN}$OUTPUT_FILE${NC}"

  # Exit with error if issues found
  if [[ $total_issues -gt 0 ]]; then
    echo ""
    echo -e "${YELLOW}WARNING${NC}: $total_issues ADR-015 compliance issues detected."
    echo "Review $OUTPUT_FILE for details."
    exit 1
  else
    echo ""
    echo -e "${GREEN}SUCCESS${NC}: All migrations are ADR-015 compliant."
    exit 0
  fi
}

main
