#!/bin/sh
# Service Layer Anti-Pattern Detection
# PRD §3.3: Detect ReturnType<typeof createXService> violations

# Check for ReturnType inference in service files
VIOLATIONS=$(git diff --cached --name-only | grep "^services/" | xargs grep -l "ReturnType<typeof.*Service" 2>/dev/null || true)

if [ -n "$VIOLATIONS" ]; then
  echo "❌ ANTI-PATTERN DETECTED: ReturnType inference in service files"
  echo ""
  echo "Files with violations:"
  echo "$VIOLATIONS" | while read -r file; do
    echo "  - $file"
    grep -n "ReturnType<typeof" "$file" | head -3
  done
  echo ""
  echo "PRD §3.3 Violation: ReturnType<typeof createXService> is banned."
  echo "Fix: Define explicit interface instead:"
  echo ""
  echo "  export interface YourService {"
  echo "    methodName(args): Promise<Result>;"
  echo "  }"
  echo ""
  exit 1
fi

exit 0
