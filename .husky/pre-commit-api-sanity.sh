#!/bin/sh
# ==============================================================================
# API Route Handler Sanity Checks (PRD-HZ-001 Compliant)
# ==============================================================================
# Version: 2.0.0
# Date: 2025-11-29
# References:
#   - PRD-HZ-001: Gate 0 Horizontal Infrastructure
#   - WORKFLOW-WS5: API Route Handler Migration
#   - VALIDATION-PRD-HZ-001: DoD Checklist
#
# Ensures app/api/v1 handlers follow canonical patterns established by
# horizontal infrastructure (withServerAction middleware, idempotency, etc.)
# ==============================================================================

echo "🔍 Checking API route handler standards (PRD-HZ-001)..."
echo ""

ROUTE_FILES=$(git diff --cached --name-only | grep '^app/api/v1/.*route\.ts$' || true)

if [ -z "$ROUTE_FILES" ]; then
  echo "✅ No API route updates staged"
  exit 0
fi

VIOLATIONS_FOUND=0

# ==============================================================================
# Check 1: service-response import required
# All routes must use ServiceHttpResult helpers for consistent responses
# ==============================================================================
MISSING_RESPONSE_IMPORT=$(echo "$ROUTE_FILES" | xargs grep -L "@/lib/http/service-response" 2>/dev/null || true)

if [ -n "$MISSING_RESPONSE_IMPORT" ]; then
  echo "❌ CHECK 1 FAILED: Missing service-response import"
  echo ""
  echo "Files with violations:"
  echo "$MISSING_RESPONSE_IMPORT" | sed 's/^/  - /'
  echo ""
  echo "Fix: Add import from '@/lib/http/service-response'"
  echo "  import { createRequestContext, successResponse, errorResponse } from '@/lib/http/service-response';"
  echo ""
  VIOLATIONS_FOUND=1
fi

# ==============================================================================
# Check 2: DEPRECATED wrapper usage blocked (PRD-HZ-001 migration)
# Routes must NOT use old with-server-action-wrapper.ts
# ==============================================================================
DEPRECATED_WRAPPER=$(echo "$ROUTE_FILES" | xargs grep -l "with-server-action-wrapper" 2>/dev/null || true)

if [ -n "$DEPRECATED_WRAPPER" ]; then
  echo "❌ CHECK 2 FAILED: Using DEPRECATED server action wrapper"
  echo ""
  echo "Files with violations:"
  echo "$DEPRECATED_WRAPPER" | sed 's/^/  - /'
  echo ""
  echo "The old wrapper (with-server-action-wrapper.ts) is deprecated."
  echo ""
  echo "Fix: Migrate to new middleware compositor:"
  echo "  ❌ import { withServerAction } from '@/lib/server-actions/with-server-action-wrapper';"
  echo "  ✅ import { withServerAction } from '@/lib/server-actions/middleware';"
  echo ""
  echo "Reference: WORKFLOW-WS5 (API Route Handler Migration)"
  echo ""
  VIOLATIONS_FOUND=1
fi

# ==============================================================================
# Check 3: Mutating routes MUST use withServerAction middleware (PRD-HZ-001)
# POST/PATCH/DELETE handlers must wrap service calls with middleware
# ==============================================================================
NEED_MIDDLEWARE=""
for file in $ROUTE_FILES; do
  # Check if file has mutating methods
  if grep -qE "export async function (POST|PATCH|DELETE)" "$file"; then
    # Must import from new middleware location (handle both quote styles)
    if ! grep -qE "from ['\"]@/lib/server-actions/middleware['\"]" "$file"; then
      NEED_MIDDLEWARE="$NEED_MIDDLEWARE
  - $file"
    fi
  fi
done

if [ -n "$NEED_MIDDLEWARE" ]; then
  echo "❌ CHECK 3 FAILED: Mutating routes missing withServerAction middleware"
  echo ""
  echo "Files with violations:$NEED_MIDDLEWARE"
  echo ""
  echo "All POST/PATCH/DELETE routes MUST use the middleware compositor."
  echo ""
  echo "Fix: Import and wrap service calls:"
  echo "  import { withServerAction } from '@/lib/server-actions/middleware';"
  echo ""
  echo "  const result = await withServerAction("
  echo "    supabase,"
  echo "    async (ctx) => service.method(ctx.supabase, ...),"
  echo "    { domain: 'your-domain', action: 'method-name', requireIdempotency: true }"
  echo "  );"
  echo ""
  echo "Reference: PRD-HZ-001 §3.7, WORKFLOW-WS5 Task 4"
  echo ""
  VIOLATIONS_FOUND=1
fi

# ==============================================================================
# Check 4: requireIdempotencyKey function call required for mutations
# Ensures idempotency header is extracted before service calls
# ==============================================================================
NEED_IDEMPOTENCY_FN=""
for file in $ROUTE_FILES; do
  if grep -qE "export async function (POST|PATCH)" "$file"; then
    if ! grep -q "requireIdempotencyKey" "$file"; then
      NEED_IDEMPOTENCY_FN="$NEED_IDEMPOTENCY_FN
  - $file"
    fi
  fi
done

if [ -n "$NEED_IDEMPOTENCY_FN" ]; then
  echo "❌ CHECK 4 FAILED: Mutating routes missing requireIdempotencyKey call"
  echo ""
  echo "Files with violations:$NEED_IDEMPOTENCY_FN"
  echo ""
  echo "Fix: Extract idempotency key before calling services:"
  echo "  const idempotencyKey = requireIdempotencyKey(request);"
  echo ""
  echo "Reference: VALIDATION-PRD-HZ-001 F3"
  echo ""
  VIOLATIONS_FOUND=1
fi

# ==============================================================================
# Check 5: requireIdempotency option MUST be set in middleware (PRD-HZ-001)
# Ensures middleware is configured to enforce idempotency
# ==============================================================================
NEED_IDEMPOTENCY_OPT=""
for file in $ROUTE_FILES; do
  if grep -qE "export async function (POST|PATCH)" "$file"; then
    # If using withServerAction, must have requireIdempotency: true
    if grep -q "withServerAction" "$file"; then
      if ! grep -q "requireIdempotency:[[:space:]]*true" "$file"; then
        NEED_IDEMPOTENCY_OPT="$NEED_IDEMPOTENCY_OPT
  - $file"
      fi
    fi
  fi
done

if [ -n "$NEED_IDEMPOTENCY_OPT" ]; then
  echo "❌ CHECK 5 FAILED: withServerAction missing requireIdempotency: true"
  echo ""
  echo "Files with violations:$NEED_IDEMPOTENCY_OPT"
  echo ""
  echo "Fix: Add requireIdempotency option to middleware call:"
  echo "  await withServerAction(supabase, handler, {"
  echo "    domain: 'your-domain',"
  echo "    action: 'method-name',"
  echo "    requireIdempotency: true,  // ← ADD THIS"
  echo "    idempotencyKey,"
  echo "  });"
  echo ""
  echo "Reference: PRD-HZ-001 §3.4 withIdempotency"
  echo ""
  VIOLATIONS_FOUND=1
fi

# ==============================================================================
# Check 6: domain and action options required in middleware
# Ensures audit logging has proper context
# ==============================================================================
NEED_DOMAIN_ACTION=""
for file in $ROUTE_FILES; do
  if grep -q "withServerAction" "$file"; then
    # Check for domain option (handle both quote styles)
    if ! grep -qE "domain:[[:space:]]*['\"][^'\"]+['\"]" "$file"; then
      NEED_DOMAIN_ACTION="$NEED_DOMAIN_ACTION
  - $file (missing 'domain')"
    # Check for action option (handle both quote styles)
    elif ! grep -qE "action:[[:space:]]*['\"][^'\"]+['\"]" "$file"; then
      NEED_DOMAIN_ACTION="$NEED_DOMAIN_ACTION
  - $file (missing 'action')"
    fi
  fi
done

if [ -n "$NEED_DOMAIN_ACTION" ]; then
  echo "⚠️  CHECK 6 WARNING: withServerAction missing domain/action options"
  echo ""
  echo "Files to verify:$NEED_DOMAIN_ACTION"
  echo ""
  echo "Fix: Include domain and action for audit logging:"
  echo "  await withServerAction(supabase, handler, {"
  echo "    domain: 'rating-slip',  // ← Bounded context name"
  echo "    action: 'start',        // ← Operation name"
  echo "    ..."
  echo "  });"
  echo ""
  echo "Reference: VALIDATION-PRD-HZ-001 D2 (audit log rows)"
  echo ""
  # Warning only, not blocking
fi

# ==============================================================================
# Summary
# ==============================================================================
if [ $VIOLATIONS_FOUND -eq 1 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ PRE-COMMIT FAILED: Fix API route violations above"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "References:"
  echo "  - PRD-HZ-001: docs/10-prd/PRD-HZ-001-gate0-horizontal-infrastructure.md"
  echo "  - WORKFLOW-WS5: docs/20-architecture/specs/PRD-HZ-001/WORKFLOW-WS5-api-routes.md"
  echo "  - Migration Guide: lib/server-actions/README.md"
  echo ""
  exit 1
fi

echo "✅ All API route handler checks passed (PRD-HZ-001 compliant)"
exit 0
