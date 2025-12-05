#!/bin/bash
# Fix import paths in test files after moving to __tests__/ subdirectories
# Usage: bash scripts/fix-test-imports.sh

set -e

echo "=========================================="
echo "Fixing import paths in __tests__/ files"
echo "=========================================="
echo ""

# Color output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

TOTAL_FIXED=0

# Function to fix imports in a test file
fix_imports() {
    local test_file=$1

    # Check if file contains relative imports that need fixing
    if grep -q "from ['\"]\./" "$test_file" 2>/dev/null; then
        echo -e "${YELLOW}Fixing:${NC} $test_file"

        # macOS vs Linux sed compatibility
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            sed -i '' -E "s/from ['\"]\\.\\/([^'\"]+)['\"]/from '..\/\1'/g" "$test_file"
        else
            # Linux
            sed -i -E "s/from ['\"]\\.\\/([^'\"]+)['\"]/from '..\/\1'/g" "$test_file"
        fi

        TOTAL_FIXED=$((TOTAL_FIXED + 1))
    fi
}

# Process all test files in __tests__/ directories
echo "Processing test files..."
echo ""

for test_file in services/**/__tests__/*.test.ts; do
    if [[ -f "$test_file" ]]; then
        fix_imports "$test_file"
    fi
done

echo ""
echo "=========================================="
echo -e "${GREEN}Fixed import paths in $TOTAL_FIXED file(s)${NC}"
echo "=========================================="
echo ""

if [[ $TOTAL_FIXED -gt 0 ]]; then
    echo "Verify changes:"
    echo "  git diff services/"
    echo ""
    echo "Run tests:"
    echo "  npm run test"
    echo ""
fi
