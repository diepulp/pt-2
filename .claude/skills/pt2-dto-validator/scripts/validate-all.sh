#!/usr/bin/env bash
# PT-2 DTO Validator: Run All Validation Checks
# Usage: bash scripts/validate-all.sh

set -euo pipefail

echo "=========================================="
echo "PT-2 DTO Validation Suite"
echo "=========================================="
echo ""

FAILED=0

# Check 1: DTO Export Coverage
echo "Check 1: Validating DTO export coverage..."
echo ""

if npx tsx skills/pt2-dto-validator/scripts/check-dto-exports.ts; then
  echo ""
else
  echo "❌ DTO export validation failed"
  FAILED=$((FAILED + 1))
fi

# Check 2: Cross-Context Violations
echo "Check 2: Detecting cross-context violations..."
echo ""

if npx tsx skills/pt2-dto-validator/scripts/detect-cross-context-violations.ts; then
  echo ""
else
  echo "❌ Cross-context violation detection failed"
  FAILED=$((FAILED + 1))
fi

# Summary
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo ""

if [ $FAILED -eq 0 ]; then
  echo "✅ All DTO validations passed!"
  echo ""
  echo "Summary:"
  echo "  - DTO export coverage: PASS"
  echo "  - Cross-context violations: PASS"
  echo ""
  exit 0
else
  echo "❌ $FAILED validation check(s) failed"
  echo ""
  echo "Please fix the issues above and run validation again."
  echo ""
  exit 1
fi
