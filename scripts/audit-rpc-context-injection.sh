#!/usr/bin/env bash
# =============================================================================
# RPC Context Injection Audit (SEC-REMEDIATION-2026-02-19, WS7 / TG-3)
#
# One-time catalog audit of all rpc_* functions in the public schema.
# Queries pg_proc to verify each function's security posture:
#   - Whether function source (prosrc) contains set_rls_context
#   - Whether function is SECURITY DEFINER (prosecdef)
#   - Whether function has explicit search_path setting (proconfig)
#
# This is more reliable than scanning migration files because it validates
# the current function definitions as they exist in the database catalog.
#
# Usage:
#   bash scripts/audit-rpc-context-injection.sh
#   # or from project root:
#   ./scripts/audit-rpc-context-injection.sh
#
# Requires: Local Supabase running (docker exec supabase_db_pt-2)
#
# Exit: Always 0 (audit/reporting tool, not a gate)
#
# Reference: docs/20-architecture/specs/SEC-REMEDIATION-2026-02-19/
# Reference: docs/80-adrs/ADR-024-authoritative-context-derivation.md
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DOCKER_CONTAINER="supabase_db_pt-2"
DB_USER="postgres"
DB_NAME="postgres"

# Colors for terminal output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ---------------------------------------------------------------------------
# Preflight: verify Docker container is running
# ---------------------------------------------------------------------------

if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${DOCKER_CONTAINER}$"; then
  echo -e "${RED}ERROR${NC}: Docker container '${DOCKER_CONTAINER}' is not running."
  echo "Start local Supabase first: npx supabase start"
  exit 0  # Exit 0 — audit tool, not a gate
fi

# ---------------------------------------------------------------------------
# SQL Query: catalog audit of all rpc_* functions
# ---------------------------------------------------------------------------

SQL_QUERY="
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_type,
  CASE WHEN p.prosrc ILIKE '%set_rls_context%' THEN 'YES' ELSE 'NO' END AS has_context_injection,
  CASE WHEN p.proconfig IS NOT NULL AND EXISTS (
    SELECT 1 FROM pg_options_to_table(p.proconfig)
    WHERE option_name = 'search_path'
  ) THEN 'YES' ELSE 'NO' END AS has_search_path
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname LIKE 'rpc_%'
ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);
"

# ---------------------------------------------------------------------------
# Execute query and capture results
# ---------------------------------------------------------------------------

echo ""
echo -e "${BOLD}=============================================${NC}"
echo -e "${BOLD} RPC Context Injection Catalog Audit${NC}"
echo -e "${BOLD}=============================================${NC}"
echo ""
echo -e "Container: ${CYAN}${DOCKER_CONTAINER}${NC}"
echo -e "Schema:    ${CYAN}public${NC}"
echo -e "Filter:    ${CYAN}rpc_*${NC}"
echo ""

RAW_OUTPUT=$(docker exec "$DOCKER_CONTAINER" psql \
  -U "$DB_USER" -d "$DB_NAME" \
  -t -A -F '|' \
  -c "$SQL_QUERY" 2>&1) || {
  echo -e "${RED}ERROR${NC}: Failed to query database."
  echo "$RAW_OUTPUT"
  exit 0
}

# Strip trailing blank lines from psql output
RAW_OUTPUT=$(echo "$RAW_OUTPUT" | sed '/^$/d')

if [[ -z "$RAW_OUTPUT" ]]; then
  echo -e "${YELLOW}WARNING${NC}: No rpc_* functions found in public schema."
  exit 0
fi

# ---------------------------------------------------------------------------
# Parse results and build report
# ---------------------------------------------------------------------------

# Counters
total=0
compliant=0
non_compliant=0
warn_count=0

# Determine column widths dynamically
max_name=13       # minimum: "function_name"
max_args=4        # minimum: "args"
max_security=17   # "SECURITY DEFINER"
max_inject=22     # "has_context_injection"
max_search=15     # "has_search_path"
max_status=6      # "status"

# First pass: compute max column widths for function_name and args
while IFS='|' read -r fname fargs fsec finj fsp; do
  [[ -z "$fname" ]] && continue
  (( ${#fname} > max_name )) && max_name=${#fname}
  # Truncate args display to keep table readable
  display_args="${fargs:0:60}"
  (( ${#display_args} > max_args )) && max_args=${#display_args}
done <<< "$RAW_OUTPUT"

# Cap args width to prevent excessively wide tables
(( max_args > 70 )) && max_args=70

# Print table header
header_fmt="%-${max_name}s  %-${max_security}s  %-${max_inject}s  %-${max_search}s  %-${max_status}s  %s"
divider_name=$(printf '%0.s-' $(seq 1 "$max_name"))
divider_sec=$(printf '%0.s-' $(seq 1 "$max_security"))
divider_inj=$(printf '%0.s-' $(seq 1 "$max_inject"))
divider_sp=$(printf '%0.s-' $(seq 1 "$max_search"))
divider_status=$(printf '%0.s-' $(seq 1 "$max_status"))
divider_args=$(printf '%0.s-' $(seq 1 "$max_args"))

# shellcheck disable=SC2059
printf "${BOLD}${header_fmt}${NC}\n" \
  "function_name" "security_type" "has_context_injection" "has_search_path" "status" "args"
printf "%s  %s  %s  %s  %s  %s\n" \
  "$divider_name" "$divider_sec" "$divider_inj" "$divider_sp" "$divider_status" "$divider_args"

# Second pass: print rows and compute status
while IFS='|' read -r fname fargs fsec finj fsp; do
  [[ -z "$fname" ]] && continue

  total=$((total + 1))

  # Determine compliance status
  status="OK"
  color="$GREEN"

  if [[ "$fsec" == "SECURITY DEFINER" && "$finj" == "NO" ]]; then
    # SECURITY DEFINER without context injection is a warning
    status="WARN"
    color="$YELLOW"
    warn_count=$((warn_count + 1))
    non_compliant=$((non_compliant + 1))
  elif [[ "$fsec" == "SECURITY DEFINER" && "$fsp" == "NO" ]]; then
    # SECURITY DEFINER without search_path is a warning
    status="WARN"
    color="$YELLOW"
    warn_count=$((warn_count + 1))
    non_compliant=$((non_compliant + 1))
  elif [[ "$finj" == "NO" ]]; then
    # SECURITY INVOKER without context injection — may be acceptable
    # (lightweight read RPCs that rely on RLS policies directly)
    # Flag as INFO, not WARN
    status="INFO"
    color="$CYAN"
    non_compliant=$((non_compliant + 1))
  else
    compliant=$((compliant + 1))
  fi

  display_args="${fargs:0:${max_args}}"

  # shellcheck disable=SC2059
  printf "%-${max_name}s  %-${max_security}s  %-${max_inject}s  %-${max_search}s  ${color}%-${max_status}s${NC}  %s\n" \
    "$fname" "$fsec" "$finj" "$fsp" "$status" "$display_args"

done <<< "$RAW_OUTPUT"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo -e "${BOLD}=============================================${NC}"
echo -e "${BOLD} Summary${NC}"
echo -e "${BOLD}=============================================${NC}"
echo ""
echo -e "  Total rpc_* functions:  ${BOLD}${total}${NC}"
echo -e "  Compliant (OK):        ${GREEN}${compliant}${NC}"
echo -e "  Non-compliant:         ${YELLOW}${non_compliant}${NC}"
echo -e "    WARN (DEFINER issue): ${YELLOW}${warn_count}${NC}"
echo -e "    INFO (no injection):  ${CYAN}$((non_compliant - warn_count))${NC}"
echo ""

if [[ $warn_count -gt 0 ]]; then
  echo -e "${YELLOW}WARN${NC}: ${warn_count} SECURITY DEFINER function(s) flagged."
  echo "  SECURITY DEFINER functions should contain set_rls_context for"
  echo "  authoritative context derivation (ADR-024)."
  echo ""
fi

echo -e "${BOLD}Legend:${NC}"
echo -e "  ${GREEN}OK${NC}    SECURITY DEFINER with context injection and search_path, or"
echo "        SECURITY INVOKER with context injection"
echo -e "  ${YELLOW}WARN${NC}  SECURITY DEFINER missing context injection or search_path"
echo -e "  ${CYAN}INFO${NC}  SECURITY INVOKER without context injection (may be intentional)"
echo ""

# Always exit 0 — this is an audit/reporting tool, not a gate
exit 0
