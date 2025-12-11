#!/bin/bash
# PT-2 Deployment Verification Script
# Usage: ./verify-deploy.sh <environment> [url]
# Examples:
#   ./verify-deploy.sh staging
#   ./verify-deploy.sh production https://pt2.app

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default URLs
STAGING_URL="https://staging.pt2.app"
PRODUCTION_URL="https://pt2.app"

# Parse arguments
ENVIRONMENT="${1:-staging}"
if [[ "$ENVIRONMENT" == "staging" ]]; then
    BASE_URL="${2:-$STAGING_URL}"
elif [[ "$ENVIRONMENT" == "production" ]]; then
    BASE_URL="${2:-$PRODUCTION_URL}"
else
    BASE_URL="$2"
fi

echo "======================================"
echo "PT-2 Deployment Verification"
echo "Environment: $ENVIRONMENT"
echo "URL: $BASE_URL"
echo "======================================"
echo ""

# Track failures
FAILURES=0

# Helper function for checks
check() {
    local name="$1"
    local result="$2"
    local expected="$3"

    if [[ "$result" == *"$expected"* ]]; then
        echo -e "${GREEN}✓${NC} $name"
        return 0
    else
        echo -e "${RED}✗${NC} $name"
        echo "  Expected: $expected"
        echo "  Got: $result"
        ((FAILURES++)) || true
        return 1
    fi
}

# 1. Health Check
echo "1. Health Check"
echo "---------------"
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/health" 2>/dev/null || echo "error")
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

check "Health endpoint responds" "$HEALTH_STATUS" "200"

if [[ "$HEALTH_BODY" != "error" ]]; then
    HEALTH_STATUS_VALUE=$(echo "$HEALTH_BODY" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    check "Health status is healthy" "$HEALTH_STATUS_VALUE" "healthy"
fi
echo ""

# 2. Page Load Tests
echo "2. Page Load Tests"
echo "------------------"

# Homepage
HOME_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL" 2>/dev/null || echo "error")
check "Homepage loads" "$HOME_STATUS" "200"

# Login page
LOGIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/auth/login" 2>/dev/null || echo "error")
check "Login page loads" "$LOGIN_STATUS" "200"

echo ""

# 3. API Endpoint Tests
echo "3. API Endpoint Tests"
echo "---------------------"

# Check if API returns proper error for unauthenticated requests
API_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/v1/casino" 2>/dev/null || echo "error")
# 401 or 403 is expected for unauthenticated
if [[ "$API_RESPONSE" == "401" ]] || [[ "$API_RESPONSE" == "403" ]]; then
    echo -e "${GREEN}✓${NC} API properly rejects unauthenticated requests ($API_RESPONSE)"
else
    echo -e "${YELLOW}?${NC} API response: $API_RESPONSE (expected 401 or 403)"
fi

echo ""

# 4. Response Time Check
echo "4. Response Time Check"
echo "----------------------"
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL" 2>/dev/null || echo "error")

if [[ "$RESPONSE_TIME" != "error" ]]; then
    # Convert to milliseconds
    RESPONSE_MS=$(echo "$RESPONSE_TIME * 1000" | bc 2>/dev/null || echo "0")
    if (( $(echo "$RESPONSE_TIME < 3" | bc -l 2>/dev/null || echo 0) )); then
        echo -e "${GREEN}✓${NC} Homepage response time: ${RESPONSE_TIME}s"
    else
        echo -e "${YELLOW}!${NC} Homepage response time: ${RESPONSE_TIME}s (slow)"
    fi
else
    echo -e "${RED}✗${NC} Could not measure response time"
    ((FAILURES++)) || true
fi

echo ""

# 5. Security Headers Check
echo "5. Security Headers Check"
echo "-------------------------"
HEADERS=$(curl -s -I "$BASE_URL" 2>/dev/null || echo "error")

if [[ "$HEADERS" != "error" ]]; then
    # Check for important security headers
    if echo "$HEADERS" | grep -qi "strict-transport-security"; then
        echo -e "${GREEN}✓${NC} HSTS header present"
    else
        echo -e "${YELLOW}?${NC} HSTS header missing (may be OK in dev)"
    fi

    if echo "$HEADERS" | grep -qi "x-content-type-options"; then
        echo -e "${GREEN}✓${NC} X-Content-Type-Options header present"
    else
        echo -e "${YELLOW}?${NC} X-Content-Type-Options header missing"
    fi

    if echo "$HEADERS" | grep -qi "x-frame-options"; then
        echo -e "${GREEN}✓${NC} X-Frame-Options header present"
    else
        echo -e "${YELLOW}?${NC} X-Frame-Options header missing"
    fi
else
    echo -e "${RED}✗${NC} Could not check headers"
    ((FAILURES++)) || true
fi

echo ""

# 6. SSL Certificate Check (production only)
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "6. SSL Certificate Check"
    echo "------------------------"
    DOMAIN=$(echo "$BASE_URL" | sed 's|https://||' | sed 's|/.*||')
    SSL_EXPIRY=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep notAfter || echo "error")

    if [[ "$SSL_EXPIRY" != "error" ]]; then
        EXPIRY_DATE=$(echo "$SSL_EXPIRY" | cut -d= -f2)
        echo -e "${GREEN}✓${NC} SSL certificate valid until: $EXPIRY_DATE"
    else
        echo -e "${YELLOW}?${NC} Could not check SSL certificate"
    fi
    echo ""
fi

# Summary
echo "======================================"
echo "Verification Summary"
echo "======================================"

if [[ $FAILURES -eq 0 ]]; then
    echo -e "${GREEN}All critical checks passed!${NC}"
    exit 0
else
    echo -e "${RED}$FAILURES critical check(s) failed${NC}"
    exit 1
fi
