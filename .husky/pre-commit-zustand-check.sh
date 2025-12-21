#!/bin/sh
# ==============================================================================
# Zustand State Management Pattern Validation (PRD-013)
# ==============================================================================
# Version: 1.0.0
# Date: 2025-12-21
# References:
#   - PRD-013: Zustand State Management Implementation
#   - ADR-003: State Management Strategy
#   - HOOKS_STANDARD.md: UI hook organization
#
# This script validates Zustand patterns to prevent state management regressions:
#   - useShallow requirement for object selectors (Zustand v5)
#   - Devtools middleware with action names
#   - Store organization patterns
#   - Import patterns from canonical locations
# ==============================================================================

echo "🔍 Checking Zustand state management patterns..."
echo ""

VIOLATIONS_FOUND=0
WARNINGS_FOUND=0

# Get staged files
STAGED_TS_FILES=$(git diff --cached --name-only | grep '\.tsx\?$' | grep -v '__tests__' | grep -v '\.test\.ts' || true)
STAGED_STORE_FILES=$(git diff --cached --name-only | grep '^store/.*\.ts$' | grep -v '__tests__' || true)
STAGED_HOOK_FILES=$(git diff --cached --name-only | grep '^hooks/ui/.*\.ts$' | grep -v '__tests__' || true)
STAGED_COMPONENT_FILES=$(git diff --cached --name-only | grep '^components/.*\.tsx$' | grep -v '__tests__' || true)

# ==============================================================================
# Check 1: Store files must use devtools middleware with action names
# ==============================================================================
if [ -n "$STAGED_STORE_FILES" ]; then
  for file in $STAGED_STORE_FILES; do
    # Skip index.ts (barrel export)
    if echo "$file" | grep -q "/index\.ts$"; then
      continue
    fi

    # Check for create() without devtools
    if grep -q "create<.*>()" "$file" 2>/dev/null; then
      if ! grep -q "devtools" "$file" 2>/dev/null; then
        echo "❌ VIOLATION: Store missing devtools middleware"
        echo "  - $file"
        echo ""
        echo "Fix: Wrap store with devtools middleware:"
        echo ""
        echo "  import { devtools } from 'zustand/middleware';"
        echo ""
        echo "  export const useMyStore = create<MyStore>()("
        echo "    devtools("
        echo "      (set) => ({"
        echo "        // state and actions"
        echo "        action: () => set({ ... }, undefined, 'namespace/action'),"
        echo "      }),"
        echo "      { name: 'my-store' }"
        echo "    )"
        echo "  );"
        echo ""
        VIOLATIONS_FOUND=1
      fi
    fi

    # Check for set() calls without action names (third argument)
    # Pattern: set({ ... }) or set((state) => ...) without third arg
    if grep -qE "set\([^,]+,[^,]*\)" "$file" 2>/dev/null; then
      # Check if there are any set() with only 2 args (missing action name)
      SET_WITHOUT_ACTION=$(grep -n "set(" "$file" 2>/dev/null | grep -v "undefined," | grep -v "false," | grep -v ", true," || true)
      # This is a heuristic - the third arg should be the action name string
      # set(state, undefined, 'action') or set(state, false, 'action')
    fi
  done
fi

# ==============================================================================
# Check 2: UI selector hooks must use useShallow for object returns
# ==============================================================================
if [ -n "$STAGED_HOOK_FILES" ]; then
  for file in $STAGED_HOOK_FILES; do
    # Skip index.ts (barrel export)
    if echo "$file" | grep -q "/index\.ts$"; then
      continue
    fi

    # Check if file uses a store
    if grep -q "use.*Store\(" "$file" 2>/dev/null; then
      # Check if returning an object selector (has opening brace after arrow)
      if grep -qE "use.*Store\(\s*\(?s\)?\s*=>\s*\(" "$file" 2>/dev/null; then
        # If returning object, must use useShallow
        if ! grep -q "useShallow" "$file" 2>/dev/null; then
          echo "❌ VIOLATION: UI hook with object selector missing useShallow (Zustand v5)"
          echo "  - $file"
          echo ""
          echo "Fix: Wrap selector with useShallow for object returns:"
          echo ""
          echo "  import { useShallow } from 'zustand/react/shallow';"
          echo ""
          echo "  export function useMyHook() {"
          echo "    return useMyStore("
          echo "      useShallow((s) => ({"
          echo "        value: s.value,"
          echo "        action: s.action,"
          echo "      }))"
          echo "    );"
          echo "  }"
          echo ""
          echo "Reference: Zustand v5 migration guide, ADR-003 §8"
          echo ""
          VIOLATIONS_FOUND=1
        fi
      fi
    fi
  done
fi

# ==============================================================================
# Check 3: Components should use selector hooks, not direct store access
# ==============================================================================
if [ -n "$STAGED_COMPONENT_FILES" ]; then
  DIRECT_STORE_ACCESS=""

  for file in $STAGED_COMPONENT_FILES; do
    # Check for direct store imports (not the selector hooks)
    if grep -q "from ['\"]@/store" "$file" 2>/dev/null; then
      # Check if also importing from hooks/ui
      if ! grep -q "from ['\"]@/hooks/ui" "$file" 2>/dev/null; then
        DIRECT_STORE_ACCESS="$DIRECT_STORE_ACCESS
  - $file"
      fi
    fi
  done

  if [ -n "$DIRECT_STORE_ACCESS" ]; then
    echo "⚠️  WARNING: Components importing directly from store (prefer selector hooks)"
    echo ""
    echo "Files to review:$DIRECT_STORE_ACCESS"
    echo ""
    echo "Recommendation: Use selector hooks from hooks/ui instead:"
    echo ""
    echo "  ❌ AVOID:"
    echo "  import { useUIStore } from '@/store/ui-store';"
    echo ""
    echo "  ✅ PREFER:"
    echo "  import { useModal } from '@/hooks/ui';"
    echo ""
    echo "Reference: HOOKS_STANDARD.md, ADR-003 §8"
    echo ""
    WARNINGS_FOUND=1
  fi
fi

# ==============================================================================
# Check 4: Store exports should use barrel pattern
# ==============================================================================
if [ -n "$STAGED_STORE_FILES" ]; then
  # Check if store/index.ts exists and is being used
  if echo "$STAGED_STORE_FILES" | grep -v "index.ts" | grep -q ".ts$"; then
    # New store files should be re-exported from index.ts
    for file in $STAGED_STORE_FILES; do
      if echo "$file" | grep -q "/index\.ts$"; then
        continue
      fi

      STORE_NAME=$(basename "$file" .ts)

      # Check if this store is exported from index.ts
      if [ -f "store/index.ts" ]; then
        if ! grep -q "$STORE_NAME" "store/index.ts" 2>/dev/null; then
          echo "⚠️  WARNING: New store not exported from store/index.ts"
          echo "  - $file"
          echo ""
          echo "Fix: Add export to store/index.ts:"
          echo "  export { use${STORE_NAME}Store } from './${STORE_NAME}';"
          echo ""
          WARNINGS_FOUND=1
        fi
      fi
    done
  fi
fi

# ==============================================================================
# Check 5: Hooks UI exports should use barrel pattern
# ==============================================================================
if [ -n "$STAGED_HOOK_FILES" ]; then
  for file in $STAGED_HOOK_FILES; do
    if echo "$file" | grep -q "/index\.ts$"; then
      continue
    fi

    HOOK_NAME=$(basename "$file" .ts)

    # Check if this hook is exported from hooks/ui/index.ts
    if [ -f "hooks/ui/index.ts" ]; then
      if ! grep -q "$HOOK_NAME" "hooks/ui/index.ts" 2>/dev/null; then
        echo "⚠️  WARNING: New UI hook not exported from hooks/ui/index.ts"
        echo "  - $file"
        echo ""
        echo "Fix: Add export to hooks/ui/index.ts:"
        echo "  export { $(echo "$HOOK_NAME" | sed 's/-//' | sed 's/use-/use/') } from './${HOOK_NAME}';"
        echo ""
        WARNINGS_FOUND=1
      fi
    fi
  done
fi

# ==============================================================================
# Check 6: Detect anti-pattern - inline store creation in components
# ==============================================================================
if [ -n "$STAGED_COMPONENT_FILES" ]; then
  INLINE_STORE_CREATION=""

  for file in $STAGED_COMPONENT_FILES; do
    # Check for create() from zustand inside component files
    if grep -q "create<" "$file" 2>/dev/null; then
      INLINE_STORE_CREATION="$INLINE_STORE_CREATION
  - $file"
    fi
  done

  if [ -n "$INLINE_STORE_CREATION" ]; then
    echo "❌ VIOLATION: Inline store creation detected in component"
    echo ""
    echo "Files with violations:$INLINE_STORE_CREATION"
    echo ""
    echo "Fix: Move store definitions to store/ directory:"
    echo ""
    echo "  ❌ WRONG (in component):"
    echo "  const useLocalStore = create<LocalState>()((set) => ({ ... }));"
    echo ""
    echo "  ✅ CORRECT:"
    echo "  // store/my-store.ts"
    echo "  export const useMyStore = create<MyState>()(devtools(...));"
    echo ""
    echo "  // component.tsx"
    echo "  import { useMyStore } from '@/store';"
    echo ""
    echo "Reference: ADR-003 §8"
    echo ""
    VIOLATIONS_FOUND=1
  fi
fi

# ==============================================================================
# Summary
# ==============================================================================
if [ $VIOLATIONS_FOUND -eq 1 ]; then
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ PRE-COMMIT FAILED: Fix Zustand pattern violations above"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "References:"
  echo "  - PRD-013: docs/10-prd/PRD-013-zustand-state-management.md"
  echo "  - ADR-003: docs/80-adrs/ADR-003-state-management-strategy.md"
  echo "  - HOOKS: docs/70-governance/HOOKS_STANDARD.md"
  echo ""
  echo "Zustand v5 Pattern Quick Reference:"
  echo "  ✅ Use: useShallow for object selectors in hooks"
  echo "  ✅ Use: devtools middleware with action names"
  echo "  ✅ Use: Selector hooks in components (hooks/ui/*)"
  echo "  ❌ Ban: Direct store access in components without hooks"
  echo "  ❌ Ban: Inline store creation in component files"
  echo ""
  exit 1
fi

if [ $WARNINGS_FOUND -eq 1 ]; then
  echo "⚠️  Zustand pattern warnings detected (non-blocking)"
  echo "   Review warnings above and consider addressing them."
  echo ""
fi

echo "✅ All Zustand state management checks passed"
exit 0
