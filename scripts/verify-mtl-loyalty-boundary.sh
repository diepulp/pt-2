#!/bin/bash

# MTL → Loyalty Read-Only Boundary Verification Script
# Phase 6 Wave 3 Track 2
#
# Verifies that MTL components do NOT write to loyalty tables
# and only use read-only query hooks

set -e

echo "================================================"
echo "MTL → Loyalty Boundary Verification"
echo "================================================"
echo ""

PROJECT_ROOT="/home/diepulp/projects/pt-2"
MTL_DIR="$PROJECT_ROOT/app/mtl"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

# Test 1: Check for loyalty mutation imports
echo "Test 1: Verify no loyalty mutation hooks imported"
if grep -r "useMutation.*loyalty\|useCreate.*Loyalty\|useUpdate.*Loyalty\|useDelete.*Loyalty" "$MTL_DIR" > /dev/null 2>&1; then
    echo -e "${RED}✗ FAIL${NC} - Found loyalty mutation imports in MTL components"
    grep -r "useMutation.*loyalty\|useCreate.*Loyalty\|useUpdate.*Loyalty\|useDelete.*Loyalty" "$MTL_DIR"
    FAIL_COUNT=$((FAIL_COUNT + 1))
else
    echo -e "${GREEN}✓ PASS${NC} - No loyalty mutation hooks found"
    PASS_COUNT=$((PASS_COUNT + 1))
fi
echo ""

# Test 2: Check for direct loyalty actions
echo "Test 2: Verify no loyalty mutation actions imported"
if grep -r "import.*manualReward\|import.*incrementPlayerLoyalty" "$MTL_DIR" > /dev/null 2>&1; then
    echo -e "${RED}✗ FAIL${NC} - Found loyalty mutation actions in MTL components"
    grep -r "import.*manualReward\|import.*incrementPlayerLoyalty" "$MTL_DIR"
    FAIL_COUNT=$((FAIL_COUNT + 1))
else
    echo -e "${GREEN}✓ PASS${NC} - No loyalty mutation actions found"
    PASS_COUNT=$((PASS_COUNT + 1))
fi
echo ""

# Test 3: Verify only read-only loyalty imports
echo "Test 3: Verify only read-only loyalty hooks imported"
LOYALTY_IMPORTS=$(grep -r "import.*loyalty" "$MTL_DIR" || true)
if [ -n "$LOYALTY_IMPORTS" ]; then
    echo "Found loyalty imports:"
    echo "$LOYALTY_IMPORTS"

    if echo "$LOYALTY_IMPORTS" | grep -v "usePlayerLoyalty" > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠ WARN${NC} - Found unexpected loyalty imports"
        WARN_COUNT=$((WARN_COUNT + 1))
    else
        echo -e "${GREEN}✓ PASS${NC} - Only read-only usePlayerLoyalty hook imported"
        PASS_COUNT=$((PASS_COUNT + 1))
    fi
else
    echo -e "${YELLOW}⚠ WARN${NC} - No loyalty imports found (expected usePlayerLoyalty in player-loyalty-widget.tsx)"
    WARN_COUNT=$((WARN_COUNT + 1))
fi
echo ""

# Test 4: Check loyalty hook implementation
echo "Test 4: Verify loyalty hook is query-only"
LOYALTY_HOOK="$PROJECT_ROOT/hooks/loyalty/use-player-loyalty.ts"
if [ -f "$LOYALTY_HOOK" ]; then
    if grep "useServiceQuery" "$LOYALTY_HOOK" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC} - Loyalty hook uses useServiceQuery (read-only)"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${RED}✗ FAIL${NC} - Loyalty hook does not use useServiceQuery"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi

    if grep "useMutation\|useServiceMutation" "$LOYALTY_HOOK" > /dev/null 2>&1; then
        echo -e "${RED}✗ FAIL${NC} - Loyalty hook contains mutation code"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    else
        echo -e "${GREEN}✓ PASS${NC} - Loyalty hook contains no mutations"
        PASS_COUNT=$((PASS_COUNT + 1))
    fi
else
    echo -e "${RED}✗ FAIL${NC} - Loyalty hook not found at $LOYALTY_HOOK"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Test 5: Verify server action is read-only
echo "Test 5: Verify getPlayerLoyalty is read-only"
LOYALTY_ACTIONS="$PROJECT_ROOT/app/actions/loyalty-actions.ts"
if [ -f "$LOYALTY_ACTIONS" ]; then
    if grep -A 30 "export async function getPlayerLoyalty" "$LOYALTY_ACTIONS" | grep "\.from.*player_loyalty.*\.select" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ PASS${NC} - getPlayerLoyalty uses SELECT query"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo -e "${YELLOW}⚠ WARN${NC} - Could not verify getPlayerLoyalty uses SELECT"
        WARN_COUNT=$((WARN_COUNT + 1))
    fi

    if grep -A 30 "export async function getPlayerLoyalty" "$LOYALTY_ACTIONS" | grep "\.insert\|\.update\|\.delete\|\.upsert" > /dev/null 2>&1; then
        echo -e "${RED}✗ FAIL${NC} - getPlayerLoyalty contains mutation operations"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    else
        echo -e "${GREEN}✓ PASS${NC} - getPlayerLoyalty contains no mutations"
        PASS_COUNT=$((PASS_COUNT + 1))
    fi
else
    echo -e "${RED}✗ FAIL${NC} - Loyalty actions file not found at $LOYALTY_ACTIONS"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Test 6: Verify TypeScript compilation
echo "Test 6: Verify TypeScript compilation"
if npx tsc --noEmit > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PASS${NC} - TypeScript compilation successful"
    PASS_COUNT=$((PASS_COUNT + 1))
else
    echo -e "${RED}✗ FAIL${NC} - TypeScript compilation failed"
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi
echo ""

# Summary
echo "================================================"
echo "Verification Summary"
echo "================================================"
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"
echo -e "Warnings: ${YELLOW}$WARN_COUNT${NC}"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}✓ BOUNDARY VERIFICATION PASSED${NC}"
    echo "MTL components correctly enforce read-only loyalty boundary"
    exit 0
else
    echo -e "${RED}✗ BOUNDARY VERIFICATION FAILED${NC}"
    echo "MTL components violate read-only loyalty boundary"
    exit 1
fi
