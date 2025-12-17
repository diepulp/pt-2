#!/bin/bash
# PT-2 Quality Gate Execution Script
# Runs comprehensive E2E tests and generates quality report

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REPORT_DIR="playwright-report"
RESULTS_DIR="test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=========================================="
echo "PT-2 Quality Gate Execution"
echo "Timestamp: $TIMESTAMP"
echo "=========================================="

# Step 1: Environment Verification
echo -e "\n${YELLOW}Step 1: Verifying Environment${NC}"

# Check if dev server is running
if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Dev server is running${NC}"
else
    echo -e "${RED}✗ Dev server not detected at localhost:3000${NC}"
    echo "Starting dev server..."
    npm run dev &
    sleep 10
fi

# Check Playwright installation
if npx playwright --version > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Playwright installed$(npx playwright --version)${NC}"
else
    echo -e "${RED}✗ Playwright not installed${NC}"
    echo "Installing Playwright..."
    npm install @playwright/test
    npx playwright install
fi

# Step 2: Run Critical Workflow Tests
echo -e "\n${YELLOW}Step 2: Running Critical Workflow Tests${NC}"

# Initialize results
PLAYER_RESULT="pending"
VISIT_RESULT="pending"
RATING_SLIP_LIFECYCLE_RESULT="pending"
RATING_SLIP_MOVE_RESULT="pending"
RATING_SLIP_MODAL_RESULT="pending"
LOYALTY_RESULT="pending"

# Run tests with detailed output
echo "Running Player Management tests..."
if npx playwright test e2e/workflows/player-management.spec.ts --reporter=line 2>/dev/null; then
    PLAYER_RESULT="${GREEN}PASSED${NC}"
else
    PLAYER_RESULT="${RED}FAILED${NC}"
fi

echo "Running Visit Lifecycle tests..."
if npx playwright test e2e/workflows/visit-lifecycle.spec.ts --reporter=line 2>/dev/null; then
    VISIT_RESULT="${GREEN}PASSED${NC}"
else
    VISIT_RESULT="${RED}FAILED${NC}"
fi

echo "Running Rating Slip Lifecycle tests..."
if npx playwright test e2e/workflows/rating-slip-lifecycle.spec.ts --reporter=line 2>/dev/null; then
    RATING_SLIP_LIFECYCLE_RESULT="${GREEN}PASSED${NC}"
else
    RATING_SLIP_LIFECYCLE_RESULT="${RED}FAILED${NC}"
fi

echo "Running Rating Slip Move Player tests..."
if npx playwright test e2e/workflows/rating-slip-move.spec.ts --reporter=line 2>/dev/null; then
    RATING_SLIP_MOVE_RESULT="${GREEN}PASSED${NC}"
else
    RATING_SLIP_MOVE_RESULT="${RED}FAILED${NC}"
fi

echo "Running Rating Slip Modal (BFF) tests..."
if npx playwright test e2e/workflows/rating-slip-modal.spec.ts --reporter=line 2>/dev/null; then
    RATING_SLIP_MODAL_RESULT="${GREEN}PASSED${NC}"
else
    RATING_SLIP_MODAL_RESULT="${RED}FAILED${NC}"
fi

echo "Running Loyalty Rewards tests..."
if npx playwright test e2e/workflows/loyalty-rewards.spec.ts --reporter=line 2>/dev/null; then
    LOYALTY_RESULT="${GREEN}PASSED${NC}"
else
    LOYALTY_RESULT="${RED}FAILED${NC}"
fi

# Step 3: Generate Report
echo -e "\n${YELLOW}Step 3: Generating Quality Gate Report${NC}"

# Run full suite with HTML reporter
npx playwright test e2e/workflows/ --reporter=html 2>/dev/null || true

# Extract test counts from results
TOTAL=$(find "$RESULTS_DIR" -name "*.json" 2>/dev/null | wc -l)
PASSED=$(find "$RESULTS_DIR" -name "*.json" -exec grep -l '"status": "passed"' {} \; 2>/dev/null | wc -l)
FAILED=$((TOTAL - PASSED))

# Step 4: Display Results
echo -e "\n=========================================="
echo "Quality Gate Report - $TIMESTAMP"
echo "=========================================="

echo -e "\nTest Execution Summary:"
echo "  Total tests: $TOTAL"
echo "  Passed: $PASSED"
echo "  Failed: $FAILED"

echo -e "\nCritical Workflow Status:"
echo -e "  Player Management:       $PLAYER_RESULT"
echo -e "  Visit Lifecycle:         $VISIT_RESULT"
echo -e "  Rating Slip Lifecycle:   $RATING_SLIP_LIFECYCLE_RESULT"
echo -e "  Rating Slip Move Player: $RATING_SLIP_MOVE_RESULT"
echo -e "  Rating Slip Modal (BFF): $RATING_SLIP_MODAL_RESULT"
echo -e "  Loyalty Rewards:         $LOYALTY_RESULT"

# Determine overall status
if [[ $FAILED -eq 0 ]]; then
    echo -e "\n${GREEN}=========================================="
    echo "QUALITY GATE: PASSED"
    echo "==========================================${NC}"
    EXIT_CODE=0
else
    echo -e "\n${RED}=========================================="
    echo "QUALITY GATE: FAILED"
    echo "==========================================${NC}"
    echo -e "\nView detailed report: npx playwright show-report"
    EXIT_CODE=1
fi

# Save report summary
cat > "$REPORT_DIR/quality-gate-summary-$TIMESTAMP.md" << EOF
# Quality Gate Report - $TIMESTAMP

## Test Execution Summary
- Total tests: $TOTAL
- Passed: $PASSED
- Failed: $FAILED

## Critical Workflow Status
| Workflow | Status |
|----------|--------|
| Player Management | $(echo -e "$PLAYER_RESULT" | sed 's/\x1b\[[0-9;]*m//g') |
| Visit Lifecycle | $(echo -e "$VISIT_RESULT" | sed 's/\x1b\[[0-9;]*m//g') |
| Rating Slip Lifecycle | $(echo -e "$RATING_SLIP_LIFECYCLE_RESULT" | sed 's/\x1b\[[0-9;]*m//g') |
| Rating Slip Move Player | $(echo -e "$RATING_SLIP_MOVE_RESULT" | sed 's/\x1b\[[0-9;]*m//g') |
| Rating Slip Modal (BFF) | $(echo -e "$RATING_SLIP_MODAL_RESULT" | sed 's/\x1b\[[0-9;]*m//g') |
| Loyalty Rewards | $(echo -e "$LOYALTY_RESULT" | sed 's/\x1b\[[0-9;]*m//g') |

## Recommendation
$(if [[ $FAILED -eq 0 ]]; then echo "**PASS** - Ready for deployment"; else echo "**FAIL** - Address failures before deployment"; fi)
EOF

echo -e "\nReport saved to: $REPORT_DIR/quality-gate-summary-$TIMESTAMP.md"

exit $EXIT_CODE
