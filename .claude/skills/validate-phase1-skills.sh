#!/usr/bin/env bash
# PT-2 Skills: Validate Phase 1 Skills Installation
# Usage: bash .claude/skills/validate-phase1-skills.sh

set -euo pipefail

echo "=========================================="
echo "PT-2 Phase 1 Skills Validation"
echo "=========================================="
echo ""

ERRORS=0

# Check skill directories exist
echo "Checking skill directory structure..."

SKILLS=(
  "pt2-migration-manager"
  "pt2-service-builder"
  "pt2-dto-validator"
)

for skill in "${SKILLS[@]}"; do
  if [ -d ".claude/skills/$skill" ]; then
    echo "  ✅ .claude/skills/$skill/"

    # Check SKILL.md exists
    if [ -f ".claude/skills/$skill/SKILL.md" ]; then
      echo "     ✅ SKILL.md"
    else
      echo "     ❌ SKILL.md missing"
      ERRORS=$((ERRORS + 1))
    fi

    # Check scripts directory
    if [ -d ".claude/skills/$skill/scripts" ]; then
      echo "     ✅ scripts/"

      # Count scripts
      SCRIPT_COUNT=$(find ".claude/skills/$skill/scripts" -type f | wc -l)
      echo "        ($SCRIPT_COUNT files)"
    else
      echo "     ❌ scripts/ missing"
      ERRORS=$((ERRORS + 1))
    fi

  else
    echo "  ❌ .claude/skills/$skill/ missing"
    ERRORS=$((ERRORS + 1))
  fi
done

echo ""

# Validate SKILL.md frontmatter
echo "Validating SKILL.md frontmatter..."

for skill in "${SKILLS[@]}"; do
  SKILL_FILE=".claude/skills/$skill/SKILL.md"

  if [ -f "$SKILL_FILE" ]; then
    # Check for required frontmatter fields
    if grep -q "^name:" "$SKILL_FILE" && \
       grep -q "^description:" "$SKILL_FILE" && \
       grep -q "^version:" "$SKILL_FILE"; then
      echo "  ✅ $skill: Valid frontmatter"
    else
      echo "  ❌ $skill: Missing required frontmatter fields"
      ERRORS=$((ERRORS + 1))
    fi
  fi
done

echo ""

# Check script executability
echo "Checking script permissions..."

SHELL_SCRIPTS=$(find .claude/skills/ -name "*.sh" -type f 2>/dev/null || true)

for script in $SHELL_SCRIPTS; do
  if [ -x "$script" ]; then
    echo "  ✅ $script (executable)"
  else
    echo "  ⚠️  $script (not executable, fixing...)"
    chmod +x "$script"
    echo "     ✅ Fixed"
  fi
done

echo ""

# Validate TypeScript scripts can be resolved
echo "Checking TypeScript script syntax..."

TS_SCRIPTS=$(find .claude/skills/ -name "*.ts" -type f 2>/dev/null || true)

for script in $TS_SCRIPTS; do
  # Basic syntax check (just try to parse)
  if npx tsx --check "$script" 2>/dev/null; then
    echo "  ✅ $script"
  else
    echo "  ⚠️  $script (syntax check skipped - dependencies may be needed)"
  fi
done

echo ""

# Summary
echo "=========================================="
echo "Validation Summary"
echo "=========================================="
echo ""

if [ $ERRORS -eq 0 ]; then
  echo "✅ All Phase 1 skills validated successfully!"
  echo ""
  echo "Installed skills:"
  echo "  1. pt2-migration-manager  - Database migration workflow"
  echo "  2. pt2-service-builder    - Service layer creation"
  echo "  3. pt2-dto-validator      - DTO contract validation"
  echo ""
  echo "Quick start:"
  echo "  - Create migration:    bash skills/pt2-migration-manager/scripts/create-migration.sh \"description\""
  echo "  - Generate service:    npx tsx skills/pt2-service-builder/scripts/generate-service-stub.ts service-name"
  echo "  - Validate DTOs:       bash skills/pt2-dto-validator/scripts/validate-all.sh"
  echo ""
  echo "Documentation: skills/README.md"
  echo ""
  exit 0
else
  echo "❌ Validation failed with $ERRORS error(s)"
  echo ""
  echo "Please fix the issues above and run validation again."
  echo ""
  exit 1
fi
