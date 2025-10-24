#!/bin/sh
# API Route Handler Sanity Checks
# Ensures newly added app/api/v1 handlers follow canonical patterns

echo "🔍 Checking API route handler standards..."

ROUTE_FILES=$(git diff --cached --name-only | grep '^app/api/v1/.*route\.ts$' || true)

if [ -z "$ROUTE_FILES" ]; then
  echo "✅ No API route updates staged"
  exit 0
fi

MISSING_RESPONSE_IMPORT=$(echo "$ROUTE_FILES" | xargs grep -L "@/lib/http/service-response" 2>/dev/null || true)

if [ -n "$MISSING_RESPONSE_IMPORT" ]; then
  echo ""
  echo "❌ Missing service-response import in the following route files:"
  echo "$MISSING_RESPONSE_IMPORT" | sed 's/^/  - /'
  echo ""
  echo "All route handlers must use the shared ServiceHttpResult helpers."
  exit 1
fi

NEED_IDEMPOTENCY=""
for file in $ROUTE_FILES; do
  if grep -q "export async function POST" "$file" || grep -q "export async function PATCH" "$file"; then
    if ! grep -q "requireIdempotencyKey" "$file"; then
      NEED_IDEMPOTENCY="$NEED_IDEMPOTENCY\n  - $file"
    fi
  fi
done

if [ -n "$NEED_IDEMPOTENCY" ]; then
  echo ""
  echo "❌ Mutating routes missing Idempotency-Key enforcement:"
  echo "$NEED_IDEMPOTENCY"
  echo ""
  echo "Use requireIdempotencyKey(request) before calling domain services."
  exit 1
fi

echo "✅ API route handler checks passed"
exit 0
