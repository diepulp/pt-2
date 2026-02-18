#!/bin/sh
# ==============================================================================
# Migration Naming Convention Enforcement
# ==============================================================================
# Version: 1.1.0
# Date: 2026-02-17
# References:
#   - docs/60-release/MIGRATION_NAMING_STANDARD.md
#
# Validates STAGED migration files against naming convention:
#   - Format: YYYYMMDDHHMMSS_description.sql
#   - No placeholder timestamps (HHMMSS = 000000)
#   - No round timestamps (MMSS = 0000, e.g. 180000)
#   - Detects fabricated sequential timestamps (1-second increments)
#   - Description must be snake_case
# ==============================================================================

echo "🔍 Checking migration naming convention..."
echo ""

# Get staged SQL migration files (exclude deleted)
STAGED_MIGRATIONS=$(git diff --cached --name-only --diff-filter=d | grep 'supabase/migrations/.*\.sql$' || true)

if [ -z "$STAGED_MIGRATIONS" ]; then
  echo "✅ No migrations staged"
  exit 0
fi

FORMAT_PATTERN='^[0-9]{14}_[a-z0-9_]+\.sql$'
VIOLATIONS=0
WARNINGS=0

# Collect timestamps for sequential analysis
TIMESTAMPS=""

for FILEPATH in $STAGED_MIGRATIONS; do
  FILENAME=$(basename "$FILEPATH")

  # ── Check 1: Format compliance ──────────────────────────────────────────
  if ! echo "$FILENAME" | grep -qE "$FORMAT_PATTERN"; then
    echo "❌ NAMING VIOLATION: $FILENAME"
    echo "   Expected: YYYYMMDDHHMMSS_descriptive_name.sql"
    echo "   Pattern:  ^[0-9]{14}_[a-z0-9_]+\\.sql\$"
    echo ""
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  # Extract timestamp (first 14 chars)
  TS=$(echo "$FILENAME" | cut -c1-14)
  TIMESTAMPS="$TIMESTAMPS $TS"

  # ── Check 2: Valid date components ──────────────────────────────────────
  YEAR=$(echo "$TS" | cut -c1-4)
  MONTH=$(echo "$TS" | cut -c5-6)
  DAY=$(echo "$TS" | cut -c7-8)
  HOUR=$(echo "$TS" | cut -c9-10)
  MIN=$(echo "$TS" | cut -c11-12)
  SEC=$(echo "$TS" | cut -c13-14)

  if [ "$MONTH" -lt 1 ] || [ "$MONTH" -gt 12 ] 2>/dev/null; then
    echo "❌ NAMING VIOLATION: $FILENAME — invalid month ($MONTH)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  if [ "$DAY" -lt 1 ] || [ "$DAY" -gt 31 ] 2>/dev/null; then
    echo "❌ NAMING VIOLATION: $FILENAME — invalid day ($DAY)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  if [ "$HOUR" -gt 23 ] 2>/dev/null; then
    echo "❌ NAMING VIOLATION: $FILENAME — invalid hour ($HOUR)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  if [ "$MIN" -gt 59 ] 2>/dev/null; then
    echo "❌ NAMING VIOLATION: $FILENAME — invalid minute ($MIN)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  if [ "$SEC" -gt 59 ] 2>/dev/null; then
    echo "❌ NAMING VIOLATION: $FILENAME — invalid second ($SEC)"
    VIOLATIONS=$((VIOLATIONS + 1))
    continue
  fi

  # ── Check 3: Fabricated timestamp detection ──────────────────────────────
  # A real `date +"%Y%m%d%H%M%S"` almost never lands on :00:00.
  # Detect two patterns:
  #   3a. Full time placeholder: HHMMSS = 000000 (midnight placeholder)
  #   3b. Round minutes+seconds: MMSS = 0000 (e.g. 180000, 140000)
  #       This is the most common fabrication: pick a round hour, leave MM:SS as 00.
  TIME_PART=$(echo "$TS" | cut -c9-14)
  MMSS=$(echo "$TS" | cut -c11-14)
  if echo "$TIME_PART" | grep -qE '^0{6}$'; then
    echo "❌ NAMING VIOLATION: $FILENAME — midnight placeholder timestamp ($TIME_PART)"
    echo "   Timestamps must be generated with: date +\"%Y%m%d%H%M%S\""
    echo ""
    VIOLATIONS=$((VIOLATIONS + 1))
  elif [ "$MMSS" = "0000" ]; then
    echo "❌ NAMING VIOLATION: $FILENAME — round timestamp (MM:SS = 00:00)"
    echo "   Timestamps must be generated with: date +\"%Y%m%d%H%M%S\""
    echo "   A real timestamp almost never lands on :00:00."
    echo ""
    VIOLATIONS=$((VIOLATIONS + 1))
  fi
done

# ── Check 4: Detect fabricated sequential timestamps ────────────────────
# If 3+ staged migrations have timestamps exactly 1 second apart, flag it.
if [ -n "$TIMESTAMPS" ]; then
  SORTED_TS=$(echo "$TIMESTAMPS" | tr ' ' '\n' | sort | tr '\n' ' ')
  SEQ_COUNT=0
  PREV_TS=""

  for TS in $SORTED_TS; do
    if [ -n "$PREV_TS" ]; then
      # Calculate difference (simple numeric subtraction works for same-minute)
      DIFF=$((TS - PREV_TS))
      if [ "$DIFF" -eq 1 ]; then
        SEQ_COUNT=$((SEQ_COUNT + 1))
      else
        SEQ_COUNT=0
      fi
    fi
    PREV_TS="$TS"
  done

  # 3+ consecutive 1-second increments is suspicious
  if [ "$SEQ_COUNT" -ge 2 ]; then
    echo "⚠️  TEMPORAL INTEGRITY WARNING: ${SEQ_COUNT} consecutive 1-second increments detected"
    echo ""
    echo "   Staged migrations have sequentially fabricated timestamps."
    echo "   This violates the temporal integrity rule (MIGRATION_NAMING_STANDARD.md §Rule 3)."
    echo ""
    echo "   Timestamps should be generated at actual creation time:"
    echo "     TIMESTAMP=\$(date +\"%Y%m%d%H%M%S\")"
    echo "     sleep 1  # between multiple migrations"
    echo ""
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# ── Summary ─────────────────────────────────────────────────────────────
echo ""

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ COMMIT BLOCKED: $VIOLATIONS migration naming violation(s)"
  echo ""
  echo "Fix with:"
  echo "  TIMESTAMP=\$(date +\"%Y%m%d%H%M%S\")"
  echo "  git mv old_name.sql supabase/migrations/\${TIMESTAMP}_description.sql"
  echo ""
  echo "Reference: docs/60-release/MIGRATION_NAMING_STANDARD.md"
  exit 1
fi

if [ "$WARNINGS" -gt 0 ]; then
  echo "⚠️  $WARNINGS migration naming warning(s) — review recommended"
  echo "   Commit will proceed (warnings don't block)."
  echo ""
  # Warnings don't block
  exit 0
fi

STAGED_COUNT=$(echo "$STAGED_MIGRATIONS" | wc -l)
echo "✅ Migration naming checks passed ($STAGED_COUNT file(s))"
exit 0
