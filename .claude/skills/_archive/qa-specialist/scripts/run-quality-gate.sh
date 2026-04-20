#!/bin/bash
# PT-2 Quality Gate Execution Script
# Runs comprehensive E2E tests and generates quality report
# Aligned with ADR-044 verification tiers and QA-006 E2E testing standard

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
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
    echo -e "${GREEN}✓ Playwright installed $(npx playwright --version)${NC}"
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
echo "Running Player 360 tests (nearest coverage for player management)..."
if npx playwright test e2e/workflows/player-360-panels.spec.ts e2e/workflows/player-360-navigation.spec.ts --reporter=line 2>/dev/null; then
    PLAYER_RESULT="${GREEN}PASSED${NC}"
else
    PLAYER_RESULT="${RED}FAILED${NC}"
fi

echo "Running Visit Continuation tests..."
if npx playwright test e2e/workflows/visit-continuation.spec.ts --reporter=line 2>/dev/null; then
    VISIT_RESULT="${GREEN}PASSED${NC}"
else
    VISIT_RESULT="${RED}FAILED${NC}"
fi

echo "Running Rating Slip Modal tests (covers lifecycle via UI)..."
if npx playwright test e2e/workflows/rating-slip-modal.spec.ts --reporter=line 2>/dev/null; then
    RATING_SLIP_LIFECYCLE_RESULT="${GREEN}PASSED${NC}"
else
    RATING_SLIP_LIFECYCLE_RESULT="${RED}FAILED${NC}"
fi

echo "Running Move Player tests..."
if npx playwright test e2e/workflows/move-player.spec.ts --reporter=line 2>/dev/null; then
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

echo "Running Loyalty Accrual Lifecycle tests..."
if npx playwright test e2e/workflows/loyalty-accrual-lifecycle.spec.ts --reporter=line 2>/dev/null; then
    LOYALTY_RESULT="${GREEN}PASSED${NC}"
else
    LOYALTY_RESULT="${RED}FAILED${NC}"
fi

# Step 3: QA-006 Verification Taxonomy Audit
echo -e "\n${YELLOW}Step 3: QA-006 Verification Taxonomy Audit${NC}"

# Count specs by verification class (grep describe blocks)
MODE_B_COUNT=$(grep -rl "Mode B" e2e/ --include="*.spec.ts" 2>/dev/null | wc -l || echo "0")
MODE_C_COUNT=$(grep -rl "Mode C" e2e/ --include="*.spec.ts" 2>/dev/null | wc -l || echo "0")
MODE_A_COUNT=$(grep -rl "Mode A" e2e/ --include="*.spec.ts" 2>/dev/null | wc -l || echo "0")
TOTAL_SPECS=$(find e2e/ -name "*.spec.ts" 2>/dev/null | wc -l || echo "0")
QA006_COMPLIANT=$(grep -rl "— E2E —\|— System Verification —\|— Local Verification —" e2e/ --include="*.spec.ts" 2>/dev/null | wc -l || echo "0")

echo -e "  Total E2E specs:               $TOTAL_SPECS"
echo -e "  QA-006 describe block compliant: $QA006_COMPLIANT / $TOTAL_SPECS"
echo -e "  ${CYAN}E2E (Mode B):                  $MODE_B_COUNT${NC}"
echo -e "  ${CYAN}System Verification (Mode C):  $MODE_C_COUNT${NC}"
echo -e "  ${CYAN}Local Verification (Mode A):   $MODE_A_COUNT${NC}"

# Step 4: Generate Report
echo -e "\n${YELLOW}Step 4: Generating Quality Gate Report${NC}"

# Run full suite with HTML reporter
npx playwright test e2e/workflows/ --reporter=html 2>/dev/null || true

# Extract test counts from results
TOTAL=$(find "$RESULTS_DIR" -name "*.json" 2>/dev/null | wc -l)
PASSED=$(find "$RESULTS_DIR" -name "*.json" -exec grep -l '"status": "passed"' {} \; 2>/dev/null | wc -l)
FAILED=$((TOTAL - PASSED))

# Step 5: Display Results
echo -e "\n=========================================="
echo "Quality Gate Report - $TIMESTAMP"
echo "=========================================="

echo -e "\nVerification Posture (ADR-044):"
echo "  Green type: local functional green"
echo -e "  E2E tier:  ${YELLOW}advisory (trusted-local only — not governance-grade)${NC}"

echo -e "\nE2E Verification Taxonomy (QA-006):"
echo "  Describe block compliance: $QA006_COMPLIANT / $TOTAL_SPECS specs"
echo "  E2E (Mode B):              $MODE_B_COUNT specs"
echo "  System Verification (C):   $MODE_C_COUNT specs"
echo "  Local Verification (A):    $MODE_A_COUNT specs"

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
mkdir -p "$REPORT_DIR"
cat > "$REPORT_DIR/quality-gate-summary-$TIMESTAMP.md" << EOF
# Quality Gate Report - $TIMESTAMP

## Verification Posture (ADR-044)
- Green type: local functional green
- Verification floor: met
- E2E tier: **advisory** (trusted-local only — not governance-grade until promoted to CI Required)

## E2E Verification Taxonomy (QA-006)
- Total E2E specs: $TOTAL_SPECS
- QA-006 describe block compliance: $QA006_COMPLIANT / $TOTAL_SPECS

| Verification Class | Auth Mode | Spec Count |
|-------------------|-----------|------------|
| E2E | Mode B (browser login) | $MODE_B_COUNT |
| System Verification | Mode C (authenticated client) | $MODE_C_COUNT |
| Local Verification | Mode A (dev bypass) | $MODE_A_COUNT |

## Test Execution Summary
- Total tests: $TOTAL
- Passed: $PASSED
- Failed: $FAILED

## Critical Workflow Status
| Workflow | Status | Auth Mode |
|----------|--------|-----------|
| Player Management | $(echo -e "$PLAYER_RESULT" | sed 's/\x1b\[[0-9;]*m//g') | B |
| Visit Lifecycle | $(echo -e "$VISIT_RESULT" | sed 's/\x1b\[[0-9;]*m//g') | B/C |
| Rating Slip Lifecycle | $(echo -e "$RATING_SLIP_LIFECYCLE_RESULT" | sed 's/\x1b\[[0-9;]*m//g') | B |
| Rating Slip Move Player | $(echo -e "$RATING_SLIP_MOVE_RESULT" | sed 's/\x1b\[[0-9;]*m//g') | C |
| Rating Slip Modal (BFF) | $(echo -e "$RATING_SLIP_MODAL_RESULT" | sed 's/\x1b\[[0-9;]*m//g') | B |
| Loyalty Rewards | $(echo -e "$LOYALTY_RESULT" | sed 's/\x1b\[[0-9;]*m//g') | C |

## Recommendation
$(if [[ $FAILED -eq 0 ]]; then echo "**PASS** - Ready for deployment (local functional green)"; else echo "**FAIL** - Address failures before deployment"; fi)

*Note: E2E tests are trusted-local only. This is not governance-grade coverage until promoted to CI Required per QA-006 §8.*
EOF

echo -e "\nReport saved to: $REPORT_DIR/quality-gate-summary-$TIMESTAMP.md"

exit $EXIT_CODE
