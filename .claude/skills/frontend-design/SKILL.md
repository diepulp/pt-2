---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality for PT-2 architecture. Use this skill when building web components, pages, or applications. Generates creative, polished code that follows PT-2 technical standards (React 19, Next.js App Router, Tailwind v4, shadcn/ui) while avoiding generic AI aesthetics.
license: Complete terms in LICENSE.txt
---

## Quick Start

**START HERE**: Read `references/QUICK_START.md` for the fastest path to implementation.

```
references/
├── QUICK_START.md              ← START HERE (single entry point)
├── frontend-rules.md           ← Condensed rules for state, performance, types
├── pt2-technical-standards.md  ← Stack specifics (Tailwind v4, shadcn, React 19)
├── pt2-architecture-integration.md ← Service layer patterns
└── ADR-003-state-management-strategy.md ← Full state management ADR
```

### Pre-flight Check (Optional)

```bash
python .claude/skills/frontend-design/scripts/check_primitive_freshness.py
```

---

## Overview

This skill guides creation of distinctive, production-grade frontend interfaces for the PT-2 project that avoid generic "AI slop" aesthetics while adhering to PT-2's technical architecture.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## PT-2 Architecture Context

**Quick Technical Requirements**:
- ✅ React 19 with App Router (NOT Pages Router)
- ✅ Tailwind CSS v4 utilities (NOT inline styles or v3 syntax)
- ✅ shadcn/ui components via MCP server (de-facto UI standard)
- ✅ Server Actions for mutations (NOT fetch to API routes)
- ✅ TanStack Query for client-side data
- ✅ TypeScript strict mode

See `references/QUICK_START.md` for implementation workflow and code templates.

---

## shadcn UI - De-facto Standard 🎨

**shadcn/ui is the de-facto UI component library for PT-2.** Access components via the shadcn MCP server.

### MCP Server Access

Use `mcp__shadcn__*` tools to browse and install components:

```bash
# Available MCP tools for shadcn
mcp__shadcn__list_components    # List all available components
mcp__shadcn__get_component      # Get component details/code
mcp__shadcn__install_component  # Install component to project
```

### Registered Component Registries

The project has multiple registries configured in `components.json`:

| Registry | URL | Use Case |
|----------|-----|----------|
| **shadcn/ui** (default) | `https://ui.shadcn.com` | Core components (Button, Dialog, Form, etc.) |
| **@aceternity** | `https://ui.aceternity.com` | Animated effects, backgrounds, hero sections |
| **@originui** | `https://originui.com` | Alternative component variants |
| **@shadcnui-blocks** | `https://shadcnui-blocks.com` | Pre-built page blocks and layouts |
| **@kokonutui** | `https://kokonutui.com` | Extended component collection |
| **@tweakcn** | `https://tweakcn.com` | Customized shadcn variants |

### Installing Components

```bash
# Default shadcn/ui registry
npx shadcn@latest add button dialog form table

# From specific registries (use registry prefix)
npx shadcn@latest add @aceternity/background-beams
npx shadcn@latest add @originui/button
npx shadcn@latest add @kokonutui/card
```

### Project Configuration

```json
// components.json (already configured)
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "ui": "@/components/ui"
  },
  "iconLibrary": "lucide"
}
```

### Component Usage Pattern

```typescript
// Import from local components/ui (shadcn copies components here)
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

// Customize via Tailwind classes
<Button variant="default" className="bg-primary hover:bg-primary/90">
  Action
</Button>
```

### When to Use Each Registry

- **Core UI elements** → Default shadcn/ui (Button, Input, Select, Dialog, etc.)
- **Animated backgrounds/effects** → @aceternity (for distinctive aesthetics)
- **Alternative component styles** → @originui, @tweakcn
- **Pre-built page sections** → @shadcnui-blocks
- **Extended components** → @kokonutui

## Memory Recording Protocol 🧠

This skill tracks execution outcomes to build design pattern knowledge and improve over time.

### Memory Activation Model

Memory is **automatically activated** when this skill is invoked via the `Skill` tool.

**How automatic activation works:**
1. `PreToolUse` hook detects `Skill` tool invocation
2. `skill-init-memori.sh` extracts skill name and initializes namespace
3. Memori client is enabled for `skill_frontend_design` namespace
4. All subsequent `record_memory()` calls in this session use the skill namespace

**Automatic activation points:**
- ✅ Skill invocation via `Skill` tool - **auto-enabled via hook**

**Manual activation** (if needed outside skill invocation):

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:frontend-design")
memori.enable()  # Required for manual initialization
context = SkillContext(memori)
```

**Hook configuration** (`.claude/settings.local.json`):
```json
{
  "PreToolUse": [
    {
      "matcher": "Skill",
      "hooks": [{ "command": "skill-init-memori.sh" }]
    }
  ]
}
```

### Skill Execution Tracking

Record complete execution outcomes after frontend implementation:

```python
from lib.memori import create_memori_client, SkillContext

# Initialize Memori for this skill
memori = create_memori_client("skill:frontend-design")
memori.enable()  # REQUIRED: Activates memory recording
context = SkillContext(memori)

# Record skill execution outcome
context.record_skill_execution(
    skill_name="frontend-design",
    task="Create PlayerLookupTable component",
    outcome="success",  # or "failure", "partial"
    pattern_used="Virtualized data table with minimalist aesthetic",
    validation_results={
        "tailwind_v4_compliant": True,
        "shadcn_components_used": True,
        "server_actions_for_mutations": True,
        "accessibility_checked": True
    },
    files_created=[
        "app/components/player-lookup-table.tsx",
        "app/components/player-lookup-table.test.tsx"
    ],
    issues_encountered=[
        "Initial design too generic (revised to add texture)",
        "Virtualization needed for 500+ rows"
    ],
    duration_seconds=240,
    lessons_learned=[
        "Large tables require @tanstack/react-virtual",
        "Noise texture adds depth to minimalist designs"
    ],
    user_satisfaction="approved"  # or "needs_revision", "rejected"
)
```

### Query Past Design Patterns Before Starting

Before implementing a component, check what worked before:

```python
# Search for similar past frontend implementations
past_executions = memori.search_learnings(
    query="table component for player data display",
    tags=["table", "virtualization", "player"],
    category="skills",
    limit=5
)

if past_executions:
    print(f"\n📚 Learning from {len(past_executions)} past implementations:\n")
    for execution in past_executions:
        metadata = execution.get('metadata', {})
        print(f"  Task: {metadata.get('task', 'N/A')}")
        print(f"  Pattern Used: {metadata.get('pattern_used', 'N/A')}")
        print(f"  Outcome: {metadata.get('outcome', 'N/A')}")
        print(f"  Issues: {metadata.get('issues_encountered', [])}")
        print()

    # Analyze patterns
    successful = [e for e in past_executions if e.get('metadata', {}).get('outcome') == 'success']
    if successful:
        # Recommend most successful pattern
        patterns = [e['metadata']['pattern_used'] for e in successful if e.get('metadata', {}).get('pattern_used')]
        if patterns:
            recommended = max(set(patterns), key=patterns.count)
            print(f"💡 Recommendation: Use {recommended} (highest success rate)\n")
```

### Frontend-Specific Memory Queries

**Query aesthetic direction success rates:**
```python
# Find successful aesthetic directions for dashboards
dashboard_aesthetics = memori.search_learnings(
    query="dashboard design aesthetic direction",
    tags=["dashboard", "aesthetic"],
    category="skills",
    limit=10
)

# Analysis: "Minimalist with texture had 80% approval rate"
```

**Query component pattern effectiveness:**
```python
# Find virtualization implementations
virtualization_patterns = memori.search_learnings(
    query="virtualized table large dataset",
    tags=["virtualization", "performance"],
    limit=5
)
```

**Query state management decisions:**
```python
# Find TanStack Query + Zustand patterns
state_patterns = memori.search_learnings(
    query="TanStack Query state management pattern",
    tags=["tanstack-query", "zustand", "state"],
    limit=5
)
```

### When to Record Manually

Record execution outcomes at these key moments:

- [ ] **After component creation** (aesthetic chosen, patterns used, validation results)
- [ ] **After design direction decisions** (why minimalist vs maximalist)
- [ ] **After performance optimizations** (virtualization, skeleton loaders)
- [ ] **After user corrections** (learn from feedback on design quality)
- [ ] **After discovering patterns** (shadcn customization insights, Tailwind v4 tricks)

### Analytics Available

Query skill effectiveness:

```python
# Aesthetic direction success rates
minimalist_designs = memori.search_learnings(
    query="minimalist design aesthetic",
    tags=["minimalist"],
    category="skills",
    limit=50
)

success_count = sum(
    1 for e in minimalist_designs
    if e.get('metadata', {}).get('outcome') == 'success'
)
success_rate = (success_count / len(minimalist_designs)) * 100 if minimalist_designs else 0

print(f"Minimalist aesthetic success rate: {success_rate:.1f}%")
print(f"Total implementations: {len(minimalist_designs)}")

# Component pattern usage
component_patterns = memori.search_learnings(
    query="component pattern",
    tags=["component", "pattern"],
    limit=200
)

# Analyze trends
pattern_counts = {}
for p in component_patterns:
    pattern = p.get('metadata', {}).get('pattern_used', 'Unknown')
    pattern_counts[pattern] = pattern_counts.get(pattern, 0) + 1

print("\nTop patterns:")
for pattern, count in sorted(pattern_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
    print(f"  {pattern}: {count} occurrences")
```

### Namespace Reference

The skill uses the namespace `skill_frontend_design` in the database. This maps from:
- Client initialization: `create_memori_client("skill:frontend-design")`
- Database user_id: `skill_frontend_design`

Related namespaces:
| Client Key | Database user_id |
|------------|------------------|
| `skill:frontend-design` | `skill_frontend_design` |
| `skill:backend-service-builder` | `skill_backend_service_builder` |
| `skill:lead-architect` | `skill_lead_architect` |
| `frontend-dev` | `pt2_frontend` |
| `main` | `pt2_agent` |

---

## Context Threshold Management 📊

This skill is designed for long-running frontend implementation sessions. When context usage approaches **60%** of the context window, the skill proactively manages session continuity.

### Context Awareness Protocol

**Monitor context usage throughout the session.** When you estimate context is approaching 60%:

1. **Announce threshold reached:**
   ```
   ⚠️ Context Usage Alert: Approaching 60% threshold.
   Recommend saving checkpoint before /clear to preserve session state.
   ```

2. **Save checkpoint before /clear:**
   ```python
   from lib.memori import create_memori_client, SkillContext

   memori = create_memori_client("skill:frontend-design")
   memori.enable()
   context = SkillContext(memori)

   context.save_checkpoint(
       current_task="[Current frontend task]",
       reason="context_threshold_60pct",
       decisions_made=["Aesthetic direction", "Component patterns"],
       files_modified=["component.tsx", "styles.css"],
       open_questions=["Outstanding design question?"],
       next_steps=["Next action 1", "Next action 2"],
       key_insights=["Key learning from session"],
       workflow="component-creation",
       notes="Additional context for resume"
   )
   ```

3. **Inform user and recommend /clear:**
   ```
   ✅ Checkpoint saved. Session state persisted to Memori.

   You can now run /clear to reset context. After clearing:
   - Run `/frontend-checkpoint restore` to resume from checkpoint
   - Or start fresh with new context
   ```

### Post-Clear Session Resume

After `/clear`, restore session context immediately:

```python
from lib.memori import create_memori_client, SkillContext

memori = create_memori_client("skill:frontend-design")
memori.enable()
context = SkillContext(memori)

# Load and display formatted checkpoint
resume_context = context.format_checkpoint_for_resume()
print(resume_context)
```

### Slash Command Reference

- **`/frontend-checkpoint save`** - Save current session state before /clear
- **`/frontend-checkpoint restore`** - Resume from last checkpoint after /clear

---

## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## Implementation Workflow

See `references/QUICK_START.md` for the complete implementation workflow including:
- Pattern selection (Server Component, Client + Query, Real-time, Forms)
- Code templates for each pattern
- Validation checklist
- Anti-patterns to avoid

See `references/frontend-rules.md` for condensed technical rules.

---

## Real-Time Events & Cache Invalidation

**Canonical Reference**: `docs/35-integration/INT-002-event-catalog.md`

When implementing real-time UI updates, use the event catalog patterns:

### Cache Invalidation from Events

```typescript
// Shared helper maps events to React Query keys
function invalidateByDomainEvent(queryClient: QueryClient, event: string, payload: EventPayload) {
  switch (event) {
    case 'rating_slip.created':
      queryClient.invalidateQueries({ queryKey: ['rating-slip', 'list', payload.casino_id] });
      break;
    case 'rating_slip.updated':
      queryClient.setQueryData(['rating-slip', 'detail', payload.rating_slip_id], payload);
      queryClient.invalidateQueries({
        queryKey: ['rating-slip', 'by-visit', payload.visit_id],
        refetchType: 'active'  // Batched, avoids refetch storms
      });
      break;
    case 'loyalty.balance_updated':
      queryClient.setQueryData(
        ['player', 'loyalty', 'balance', payload.player_id, payload.casino_id],
        payload.balance
      );
      break;
    // ... other events from INT-002
  }
}
```

### Realtime Subscription Pattern

```typescript
'use client'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

function useRealtimeInvalidation(casinoId: string) {
  const queryClient = useQueryClient()
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase
      .channel(`casino:${casinoId}`)
      .on('broadcast', { event: 'rating_slip.updated' }, ({ payload }) => {
        invalidateByDomainEvent(queryClient, 'rating_slip.updated', payload)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [casinoId, queryClient, supabase])
}
```

### Event Batching

- Use **250-500ms batching** for list invalidations
- Use `refetchType: 'active'` to avoid background refetch storms
- For high-volume telemetry (RatingSlip, TableContext), prefer **poll + ETag** over realtime streams