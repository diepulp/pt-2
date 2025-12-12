#!/usr/bin/env bash
# ADR-015 RLS Compliance Scanner
# Scans migrations for deprecated RLS patterns and generates compliance report
#
# Patterns Checked:
#   - ANTI-PATTERN 1: Bare current_setting without COALESCE/NULLIF wrapper
#   - ANTI-PATTERN 2: current_setting without 'true' second parameter (throws on null)
#   - ANTI-PATTERN 3: Missing auth.uid() IS NOT NULL check in policies
#   - ANTI-PATTERN 4: Deprecated SET LOCAL patterns outside RPCs
#   - ANTI-PATTERN 5: Direct JWT claim usage without session fallback
#
# Reference: docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md

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
COMPLIANT_MIGRATIONS=(
  "20251209183033_adr015_rls_context_rpc.sql"
  "20251209183401_adr015_hybrid_rls_policies.sql"
  "20251210001858_adr015_backfill_jwt_claims.sql"
  "20251211153228_adr015_rls_compliance_patch.sql"
)

# Counters
total_files=0
files_with_issues=0
total_issues=0
declare -A issue_counts

# Initialize issue counters
issue_counts["bare_current_setting"]=0
issue_counts["missing_true_param"]=0
issue_counts["missing_auth_uid"]=0
issue_counts["deprecated_set_local"]=0
issue_counts["direct_jwt_only"]=0
issue_counts["missing_actor_hybrid"]=0
issue_counts["missing_role_hybrid"]=0

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

  # ANTI-PATTERN 1: Bare current_setting for RLS context without COALESCE wrapper
  # Match: current_setting('app.casino_id')::uuid NOT preceded by COALESCE(NULLIF(
  # Regex: current_setting\('app\.(casino_id|actor_id|staff_role)'[^)]*\) not in COALESCE(NULLIF( context
  local bare_settings=$(grep -nE "current_setting\s*\(\s*['\"]app\.(casino_id|actor_id|staff_role)['\"]" "$file" | \
    grep -vE "COALESCE\s*\(\s*NULLIF\s*\(\s*current_setting" || true)

  if [[ -n "$bare_settings" ]]; then
    while IFS= read -r line; do
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [BARE_CURRENT_SETTING]: \`${content:0:80}...\`"
      issue_counts["bare_current_setting"]=$((${issue_counts["bare_current_setting"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$bare_settings"
  fi

  # ANTI-PATTERN 2: current_setting without 'true' second param (missing silent fail)
  # Match: current_setting('app.X') without , true)
  local missing_true=$(grep -nE "current_setting\s*\(\s*['\"]app\.[^'\"]+['\"]s*\)" "$file" | \
    grep -vE "current_setting\s*\(\s*['\"][^'\"]+['\"],\s*(true|'t')" || true)

  if [[ -n "$missing_true" ]]; then
    while IFS= read -r line; do
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      # Skip if this is in a comment
      if [[ "$content" =~ ^[[:space:]]*-- ]]; then
        continue
      fi
      file_findings+="\n  - **Line $linenum** [MISSING_TRUE_PARAM]: \`${content:0:80}...\`"
      issue_counts["missing_true_param"]=$((${issue_counts["missing_true_param"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$missing_true"
  fi

  # ANTI-PATTERN 3: RLS policy without auth.uid() IS NOT NULL
  # Look for CREATE POLICY ... USING/WITH CHECK without auth.uid() IS NOT NULL
  # This requires multi-line scanning - extract policies and check each
  local policies_without_auth=$(awk '
    BEGIN { RS=";" }
    /CREATE POLICY/ && !/auth\.uid\s*\(\s*\)\s+IS\s+NOT\s+NULL/ {
      # Extract policy name
      match($0, /CREATE POLICY\s+"?([a-z_]+)"?/, arr)
      if (arr[1] != "") {
        gsub(/\n/, " ", $0)
        print arr[1] ": " substr($0, 1, 100)
      }
    }
  ' "$file" 2>/dev/null || true)

  if [[ -n "$policies_without_auth" ]]; then
    while IFS= read -r line; do
      if [[ -n "$line" ]]; then
        local policy_name=$(echo "$line" | cut -d: -f1)
        # Skip bootstrap policies that intentionally allow self-lookup
        if [[ "$policy_name" =~ bootstrap|self_lookup ]]; then
          continue
        fi
        file_findings+="\n  - **Policy** [MISSING_AUTH_UID]: \`$policy_name\` lacks \`auth.uid() IS NOT NULL\`"
        issue_counts["missing_auth_uid"]=$((${issue_counts["missing_auth_uid"]} + 1))
        file_issues=$((file_issues + 1))
      fi
    done <<< "$policies_without_auth"
  fi

  # ANTI-PATTERN 4: SET LOCAL outside of function context (vulnerable to pooling)
  local set_local=$(grep -nE "^\s*SET\s+LOCAL\s+app\." "$file" | \
    grep -vE "PERFORM\s+set_config|within.*function|-- (legacy|deprecated)" || true)

  if [[ -n "$set_local" ]]; then
    while IFS= read -r line; do
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [DEPRECATED_SET_LOCAL]: \`${content:0:80}...\`"
      issue_counts["deprecated_set_local"]=$((${issue_counts["deprecated_set_local"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$set_local"
  fi

  # ANTI-PATTERN 5: Direct JWT claim usage without session fallback
  # Detect policies that use auth.jwt() casino_id without current_setting fallback
  local jwt_only=$(grep -nE "auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'casino_id'" "$file" | \
    grep -vE "COALESCE\(" || true)

  if [[ -n "$jwt_only" ]]; then
    while IFS= read -r line; do
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [DIRECT_JWT_ONLY]: \`${content:0:80}...\`"
      issue_counts["direct_jwt_only"]=$((${issue_counts["direct_jwt_only"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$jwt_only"
  fi

  # ANTI-PATTERN 6: actor_id without hybrid fallback (staff_id)
  local actor_without_hybrid=$(grep -nE "current_setting\s*\(\s*['\"]app\.actor_id['\"]" "$file" | \
    grep -vE "COALESCE.*current_setting\\('app\\.actor_id'.*auth\\.jwt\\(\\).*app_metadata.*staff_id" || true)

  if [[ -n "$actor_without_hybrid" ]]; then
    while IFS= read -r line; do
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [MISSING_ACTOR_HYBRID]: \`${content:0:80}...\`"
      issue_counts["missing_actor_hybrid"]=$((${issue_counts["missing_actor_hybrid"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$actor_without_hybrid"
  fi

  # ANTI-PATTERN 7: staff_role without hybrid fallback (staff_role claim)
  local role_without_hybrid=$(grep -nE "current_setting\s*\(\s*['\"]app\.staff_role['\"]" "$file" | \
    grep -vE "COALESCE.*current_setting\\('app\\.staff_role'.*auth\\.jwt\\(\\).*app_metadata.*staff_role" || true)

  if [[ -n "$role_without_hybrid" ]]; then
    while IFS= read -r line; do
      local linenum=$(echo "$line" | cut -d: -f1)
      local content=$(echo "$line" | cut -d: -f2-)
      file_findings+="\n  - **Line $linenum** [MISSING_ROLE_HYBRID]: \`${content:0:80}...\`"
      issue_counts["missing_role_hybrid"]=$((${issue_counts["missing_role_hybrid"]} + 1))
      file_issues=$((file_issues + 1))
    done <<< "$role_without_hybrid"
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
# ADR-015 RLS Compliance Report

**Generated:** $timestamp
**Scanner:** scripts/adr015-rls-scanner.sh
**Reference:** docs/80-adrs/ADR-015-rls-connection-pooling-strategy.md

---

## Summary

| Metric | Value |
|--------|-------|
| Files Scanned | $total_files |
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

---

## Excluded (Known Compliant)

The following migrations implement ADR-015 and are excluded from regression scanning:

$(printf -- '- %s\n' "${COMPLIANT_MIGRATIONS[@]}")

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
