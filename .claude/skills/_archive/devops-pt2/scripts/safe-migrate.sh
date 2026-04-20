#!/bin/bash
# PT-2 Safe Migration Script
# Wraps Supabase migrations with safety checks
# Usage: ./safe-migrate.sh <environment>
# Examples:
#   ./safe-migrate.sh local
#   ./safe-migrate.sh staging
#   ./safe-migrate.sh production

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT="${1:-local}"

echo "======================================"
echo "PT-2 Safe Migration"
echo "Environment: $ENVIRONMENT"
echo "======================================"
echo ""

# Safety check for production
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo -e "${RED}⚠️  WARNING: You are about to migrate PRODUCTION${NC}"
    echo ""
    echo "Pre-migration checklist:"
    echo "  [ ] Migrations tested locally (supabase db reset)"
    echo "  [ ] Migrations tested on staging"
    echo "  [ ] Backup verified (check Supabase dashboard)"
    echo "  [ ] Off-peak hours (check active users)"
    echo "  [ ] Team notified"
    echo ""
    read -p "Type 'I UNDERSTAND' to proceed: " confirmation
    if [[ "$confirmation" != "I UNDERSTAND" ]]; then
        echo "Migration cancelled."
        exit 1
    fi
fi

# Check for pending migrations
echo -e "${BLUE}Checking migration status...${NC}"
echo ""

if [[ "$ENVIRONMENT" == "local" ]]; then
    # Local: use supabase db reset
    echo "Local environment detected."
    echo ""
    read -p "This will reset your local database. Continue? (y/N): " confirm
    if [[ "$confirm" == "y" ]] || [[ "$confirm" == "Y" ]]; then
        echo ""
        echo -e "${BLUE}Resetting local database...${NC}"
        supabase db reset
        echo ""
        echo -e "${GREEN}✓ Local database reset complete${NC}"
    else
        echo "Cancelled."
        exit 0
    fi
else
    # Remote: use supabase db push
    echo "Checking remote migration status..."
    supabase migration list

    echo ""
    echo -e "${BLUE}Pending migrations will be applied.${NC}"
    read -p "Continue? (y/N): " confirm

    if [[ "$confirm" == "y" ]] || [[ "$confirm" == "Y" ]]; then
        echo ""
        echo -e "${BLUE}Pushing migrations...${NC}"

        # Dry run first
        echo "Performing dry run..."
        if supabase db push --dry-run 2>&1; then
            echo ""
            echo -e "${GREEN}Dry run successful.${NC}"
            echo ""

            read -p "Apply migrations for real? (y/N): " apply
            if [[ "$apply" == "y" ]] || [[ "$apply" == "Y" ]]; then
                supabase db push
                echo ""
                echo -e "${GREEN}✓ Migrations applied successfully${NC}"
            else
                echo "Cancelled."
                exit 0
            fi
        else
            echo ""
            echo -e "${RED}✗ Dry run failed. Fix issues before proceeding.${NC}"
            exit 1
        fi
    else
        echo "Cancelled."
        exit 0
    fi
fi

# Post-migration: Regenerate types
echo ""
echo -e "${BLUE}Regenerating TypeScript types...${NC}"

if [[ "$ENVIRONMENT" == "local" ]]; then
    npm run db:types-local
else
    npm run db:types
fi

echo ""
echo -e "${GREEN}✓ Types regenerated${NC}"

# Verification
echo ""
echo "======================================"
echo "Post-Migration Verification"
echo "======================================"

echo ""
echo "Recommended next steps:"
echo "  1. Run tests: npm run test"
echo "  2. Check application: npm run dev"
echo "  3. Verify RLS policies work as expected"

if [[ "$ENVIRONMENT" == "staging" ]]; then
    echo "  4. Test in staging environment"
    echo "  5. If OK, deploy to production with: ./safe-migrate.sh production"
fi

if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "  4. Monitor error rates in Sentry"
    echo "  5. Check Supabase dashboard for query performance"
    echo "  6. Notify team that migration is complete"
fi

echo ""
echo -e "${GREEN}Migration workflow complete!${NC}"
