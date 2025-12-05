#!/bin/bash
# Migration script for ADR-002: Move test files to __tests__/ subdirectories
# Usage: bash scripts/migrate-tests-to-subdirs.sh

set -e

echo "=========================================="
echo "ADR-002 Test Migration: Co-located → __tests__/"
echo "=========================================="
echo ""

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track statistics
TOTAL_MOVED=0
TOTAL_DIRS=0

# Function to migrate tests in a directory
migrate_tests() {
    local dir=$1

    # Skip if no test files found
    if ! ls "$dir"/*.test.ts 2>/dev/null | grep -v __tests__ >/dev/null 2>&1; then
        return 0
    fi

    echo -e "${YELLOW}Processing:${NC} $dir"

    # Create __tests__ subdirectory if it doesn't exist
    mkdir -p "$dir/__tests__"
    TOTAL_DIRS=$((TOTAL_DIRS + 1))

    # Move test files
    local moved_count=0
    for test_file in "$dir"/*.test.ts; do
        # Skip if already in __tests__
        if [[ "$test_file" == *"__tests__"* ]]; then
            continue
        fi

        # Check if file exists (glob might not match)
        if [[ ! -f "$test_file" ]]; then
            continue
        fi

        local filename=$(basename "$test_file")
        local target="$dir/__tests__/$filename"

        echo "  Moving: $filename → __tests__/$filename"
        git mv "$test_file" "$target" 2>/dev/null || mv "$test_file" "$target"

        moved_count=$((moved_count + 1))
        TOTAL_MOVED=$((TOTAL_MOVED + 1))
    done

    if [[ $moved_count -gt 0 ]]; then
        echo -e "${GREEN}✓${NC} Moved $moved_count test file(s) in $dir"
    fi

    echo ""
}

# Migrate services
echo "=== Migrating services/ ==="
echo ""

for service_dir in services/*/; do
    if [[ -d "$service_dir" ]]; then
        migrate_tests "$service_dir"
    fi
done

# Summary
echo "=========================================="
echo "Migration Summary"
echo "=========================================="
echo -e "${GREEN}Directories processed:${NC} $TOTAL_DIRS"
echo -e "${GREEN}Test files moved:${NC} $TOTAL_MOVED"
echo ""

if [[ $TOTAL_MOVED -gt 0 ]]; then
    echo "Next steps:"
    echo "1. Run tests to verify nothing broke:"
    echo "   npm run test"
    echo ""
    echo "2. Fix import paths in test files (if needed):"
    echo "   - Change: import { x } from './index'"
    echo "   - To:     import { x } from '../index'"
    echo ""
    echo "3. Commit the migration:"
    echo "   git add ."
    echo "   git commit -m \"refactor: migrate tests to __tests__/ subdirectories per ADR-002\""
    echo ""
else
    echo -e "${YELLOW}No test files found to migrate.${NC}"
fi

echo "=========================================="
