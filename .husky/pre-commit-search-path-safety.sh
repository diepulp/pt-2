#!/bin/sh
# ==============================================================================
# Search Path Safety Check - Function Body Consistency
# ==============================================================================
# Version: 1.0.0
# Date: 2026-04-03
# References:
#   - SEC-S3: Supabase Advisor finding (function search_path mutable)
#   - CWE-426: Search path hijacking
#   - GAMING-DAY-FUNCTION-DRIFT.md: Post-mortem for the regression this prevents
#
# Prevents the regression where ALTER FUNCTION ... SET search_path = '' is
# applied without rewriting the function body to use schema-qualified refs.
#
# CHECK 1: ALTER FUNCTION SET search_path without CREATE OR REPLACE (BLOCKING)
#   If a migration sets search_path on a function via ALTER FUNCTION,
#   the same file must also contain CREATE OR REPLACE for that function
#   (proving the body was rewritten with qualified references).
#
# CHECK 2: CREATE OR REPLACE with search_path = '' + unqualified FROM (WARNING)
#   If a migration creates a function with search_path = '' and the body
#   contains FROM/JOIN without public. prefix, warn about potential breakage.
# ==============================================================================

echo "Checking search_path safety (function body consistency)..."
echo ""

# Get staged SQL migration files
MIGRATION_FILES=$(git diff --cached --name-only --diff-filter=d | grep 'supabase/migrations/.*\.sql$' || true)

if [ -z "$MIGRATION_FILES" ]; then
  echo "No migrations staged"
  exit 0
fi

VIOLATIONS_FOUND=0
WARNINGS_FOUND=0

# ==============================================================================
# Check 1: ALTER FUNCTION SET search_path without body rewrite (BLOCKING)
# ==============================================================================
for FILE in $MIGRATION_FILES; do
  STAGED_CONTENT=$(git diff --cached "$FILE")

  # Find ALTER FUNCTION ... SET search_path lines
  ALTER_FUNCS=$(echo "$STAGED_CONTENT" | grep -oP '^\+\s*ALTER\s+FUNCTION\s+\S+\.(\w+)\s*\([^)]*\)\s*$' || true)

  if [ -z "$ALTER_FUNCS" ]; then
    # Also check for SET search_path on the next line after ALTER FUNCTION
    ALTER_FUNCS=$(echo "$STAGED_CONTENT" | grep -oP '^\+\s*ALTER\s+FUNCTION\s+\S+\.(\w+)\s*\(' || true)
  fi

  # Extract function names from ALTER FUNCTION lines that pair with SET search_path.
  # Use \w+ for schema name (not \S+) to avoid matching into argument types.
  # grep -B1 gets the ALTER FUNCTION line before each SET search_path line.
  FUNC_NAMES=$(echo "$STAGED_CONTENT" | grep -B1 'SET search_path' | grep -oP 'ALTER\s+FUNCTION\s+\w+\.(\K\w+)' || true)

  for FUNC in $FUNC_NAMES; do
    # Check if the same file has CREATE OR REPLACE for this function
    HAS_CREATE=$(echo "$STAGED_CONTENT" | grep -ciP "CREATE\s+OR\s+REPLACE\s+FUNCTION\s+\w+\.${FUNC}\s*\(" || true)

    if [ "$HAS_CREATE" -eq 0 ]; then
      # Check for SEARCH_PATH_SAFE bypass marker near this ALTER FUNCTION
      HAS_SAFE_MARKER=$(echo "$STAGED_CONTENT" | grep -B2 "ALTER FUNCTION.*${FUNC}" | grep -c 'SEARCH_PATH_SAFE' || true)

      if [ "$HAS_SAFE_MARKER" -gt 0 ]; then
        # Marked safe — skip this function
        continue
      fi

      echo "VIOLATION: $FILE"
      echo "  ALTER FUNCTION sets search_path on '$FUNC' without CREATE OR REPLACE body rewrite"
      echo ""
      echo "  WHY THIS IS DANGEROUS:"
      echo "    Setting search_path = '' on a function whose body contains"
      echo "    unqualified table references (e.g., FROM casino_settings instead"
      echo "    of FROM public.casino_settings) will break the function at runtime."
      echo ""
      echo "  REQUIRED FIX:"
      echo "    Use CREATE OR REPLACE FUNCTION with:"
      echo "    1. SET search_path = '' in the function definition"
      echo "    2. All table references prefixed with public."
      echo "    3. All function calls prefixed with public."
      echo ""
      echo "  BYPASS (only if function body has no table/function references):"
      echo "    Add '-- SEARCH_PATH_SAFE: no unqualified references' comment"
      echo "    above the ALTER FUNCTION statement."
      echo ""
      VIOLATIONS_FOUND=$((VIOLATIONS_FOUND + 1))
    fi
  done
done

# ==============================================================================
# Check 2: CREATE OR REPLACE with search_path = '' + unqualified FROM (WARNING)
# ==============================================================================
for FILE in $MIGRATION_FILES; do
  STAGED_CONTENT=$(git diff --cached "$FILE")

  # Check if file creates functions with empty search_path
  HAS_EMPTY_SEARCH_PATH=$(echo "$STAGED_CONTENT" | grep -c "search_path\s*=\s*''" || true)

  if [ "$HAS_EMPTY_SEARCH_PATH" -gt 0 ]; then
    # Check for FROM clauses without public. prefix (rough heuristic)
    # Exclude comments (lines starting with --)
    UNQUALIFIED_FROM=$(echo "$STAGED_CONTENT" | grep '^+' | grep -v '^\+\s*--' | grep -iP '\bFROM\s+(?!public\.)(?!pg_catalog\.)(?!information_schema\.)[a-z_]+\b' || true)

    if [ -n "$UNQUALIFIED_FROM" ]; then
      echo "WARNING: $FILE"
      echo "  Function with search_path = '' may contain unqualified FROM clauses:"
      echo "$UNQUALIFIED_FROM" | head -5 | sed 's/^/    /'
      echo ""
      echo "  Verify all table references use public. prefix."
      echo ""
      WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
    fi
  fi
done

# ==============================================================================
# Summary and Exit
# ==============================================================================
echo ""

if [ "$VIOLATIONS_FOUND" -gt 0 ]; then
  echo "COMMIT BLOCKED: $VIOLATIONS_FOUND search_path safety violation(s)"
  echo ""
  echo "  ALTER FUNCTION ... SET search_path without body rewrite detected."
  echo "  This pattern broke 17 functions in the SEC-S3 remediation (2026-04-03)."
  echo ""
  echo "  See: docs/issues/gaps/supabase-advisors/GAMING-DAY-FUNCTION-DRIFT.md"
  echo ""
  exit 1
fi

if [ "$WARNINGS_FOUND" -gt 0 ]; then
  echo "WARNINGS: $WARNINGS_FOUND potential unqualified reference(s) in functions with empty search_path"
  echo "  Review recommended before merge."
  echo ""
  exit 0
fi

echo "Search path safety checks passed"
exit 0
