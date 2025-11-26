---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces with high design quality for PT-2 architecture. Use this skill when building web components, pages, or applications. Generates creative, polished code that follows PT-2 technical standards (React 19, Next.js App Router, Tailwind v4, shadcn/ui) while avoiding generic AI aesthetics.
allowed-tools: SlashCommand, context7, mcp__sequential-thinking__sequentialthinking, supabase, Read, Write, Edit, Glob, Bash, TodoWrite, BashOutput, KillShell, Task, mcp__tavily-remote__tavily_extract, mcp__tavily-remote__tavily_map, mcp__tavily-remote__tavily_map, mcp__tavily-remote__tavily_search, shadcn mcp
license: Complete terms in LICENSE.txt
---

This skill guides creation of distinctive, production-grade frontend interfaces for the PT-2 project that avoid generic "AI slop" aesthetics while adhering to PT-2's technical architecture.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## PT-2 Architecture Context

**IMPORTANT**: This project follows specific technical standards. Before implementing any frontend code, consult the reference files:

- **`references/ADR-003-state-management-strategy.md`** - **AUTHORITATIVE** state management strategy (TanStack Query v5, Zustand, query key factories, cache invalidation, real-time)
- **`references/pt2-technical-standards.md`** - Technology stack requirements (React 19, Next.js App Router, Tailwind v4, shadcn/ui)
- **`references/pt2-architecture-integration.md`** - Service layer integration, DTOs, Server Actions, data patterns

**Quick Technical Requirements**:
- ✅ React 19 with App Router (NOT Pages Router)
- ✅ Tailwind CSS v4 utilities (NOT inline styles or v3 syntax)
- ✅ shadcn/ui components (copy-paste from registry)
- ✅ Server Actions for mutations (NOT fetch to API routes)
- ✅ TanStack Query for client-side data
- ✅ TypeScript strict mode

Read the reference files when technical implementation details are needed.

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

## Implementation Workflow for PT-2

Follow this workflow when building frontend interfaces for PT-2:

### 1. Understand Requirements & Design Direction
- Clarify the component/page purpose and audience
- Choose a bold aesthetic direction (see "Design Thinking" above)
- Identify any specific PT-2 domain context (players, visits, loyalty, etc.)

### 2. Consult Technical Standards

**Read `references/ADR-003-state-management-strategy.md` FIRST** (authoritative):
- TanStack Query v5 configuration and patterns
- Query key factories (REQUIRED - never hardcode keys)
- Cache invalidation strategies (hierarchical, direct updates)
- Pagination patterns (`placeholderData`, Infinite Query)
- Real-time → cache reconciliation (Supabase subscriptions)
- Zustand for ephemeral UI state only
- Mutation retry policies and idempotency

**Then read `references/pt2-technical-standards.md` for**:
- Tailwind v4 configuration and custom utilities
- shadcn/ui component installation and usage
- React 19 patterns (Server Actions, useActionState, useOptimistic)
- Performance requirements (virtualization, skeletons, staleTime)
- Code quality standards (ESLint, Prettier, testing)

### 3. Integrate with PT-2 Architecture
**Read `references/pt2-architecture-integration.md` for**:
- Choosing Server Component vs Client Component pattern
- Using service layer and DTOs correctly
- Implementing mutations with Server Actions
- Setting up TanStack Query with service keys
- Real-time data synchronization patterns
- Error handling with ServiceResult<T>

### 4. Implement with Creative Excellence
- Write production-grade code that follows PT-2 standards
- Apply your chosen aesthetic direction with precision
- Use shadcn/ui as foundation, customize for the aesthetic
- Ensure Tailwind v4 utilities create the desired visual impact
- Add animations and micro-interactions that delight

### 5. Verify Technical Compliance
- ✅ Uses Tailwind v4 syntax (not v3)
- ✅ Uses shadcn/ui components where appropriate
- ✅ Server Components for static content, Client Components for interactivity
- ✅ Server Actions for all mutations
- ✅ Service keys from `services/{domain}/keys.ts`
- ✅ DTOs imported from service types
- ✅ Lists > 100 items use virtualization
- ✅ Loading states use skeletons (not spinners)

### Common PT-2 Frontend Patterns

**Pattern: Interactive Data Table**
- Use shadcn/ui `<Table>` component
- Virtualize with `@tanstack/react-virtual` if > 100 rows
- Query data with TanStack Query + service keys
- Apply creative styling via Tailwind v4 utilities

**Pattern: Form with Server Action**
- Use shadcn/ui `<Form>` components
- Submit via Server Action with `useActionState`
- Show loading state during submission
- Style with bold, distinctive form design

**Pattern: Real-time Dashboard**
- Server Component for initial data
- Client Component with TanStack Query for interactivity
- Supabase subscription for real-time updates
- Invalidate queries on change events
- Creative, information-dense layout

**Pattern: Master-Detail View**
- Server Component for list (or Client + Query)
- Dynamic route for detail page `[id]/page.tsx`
- Prefetch on hover for instant navigation
- Distinctive visual hierarchy between list and detail

## Quick Reference: PT-2 + Aesthetics

Combine PT-2's technical requirements with exceptional design:

| Technical Requirement | Creative Opportunity |
|-----------------------|----------------------|
| Tailwind v4 utilities | Custom `@theme` tokens for distinctive color palettes |
| shadcn/ui components | Customize via Tailwind classes for unique visual identity |
| Server Actions | Loading states as micro-interaction moments |
| TanStack Query | Skeleton loading as part of aesthetic language |
| React 19 patterns | `useOptimistic` for delightful instant feedback |
| TypeScript strict | Type-safe design system tokens and variants |

## Resources Available

- **`references/ADR-003-state-management-strategy.md`** - **AUTHORITATIVE** state management ADR (TanStack Query v5, Zustand, patterns)
- **`references/pt2-technical-standards.md`** - Complete technical stack guide
- **`references/pt2-architecture-integration.md`** - Service integration patterns
- **PT-2 Documentation**: `docs/70-governance/FRONT_END_CANONICAL_STANDARD.md` (if deeper context needed)
- **shadcn/ui Registry**: https://ui.shadcn.com (for component installation)