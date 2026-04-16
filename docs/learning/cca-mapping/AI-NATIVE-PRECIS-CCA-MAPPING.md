# PT-2 Pit Station — AI-Native Architecture Précis

## Mapping the CCA Foundations Exam Five Competency Domains

**Audience:** Engineers, product leads, and technical stakeholders seeking to understand the AI-augmented SDLC in PT-2.
**Purpose:** Inventory and evaluate PT-2's AI-native infrastructure against the Claude Certified Architect Foundations (CCA-F) competency framework, surface gaps, and identify learning opportunities.

---

## Background: CCA-F Competency Framework

The Anthropic Claude Certified Architect – Foundations exam (released March 2026) validates production-grade AI system design across five weighted domains:

| Domain | Weight | Core Concern |
|--------|--------|--------------|
| **D1** Agentic Architecture & Orchestration | 27% | Multi-agent loops, delegation, orchestration patterns |
| **D2** Tool Design & MCP Integration | 18% | MCP servers, tool boundary design, resource management |
| **D3** Claude Code Configuration & Workflows | 20% | `CLAUDE.md` hierarchies, slash commands, CI/CD hooks |
| **D4** Prompt Engineering & Structured Output | 20% | Schema-driven prompts, validation loops, structured I/O |
| **D5** Context Management & Reliability | 15% | Long-context preservation, handoff patterns, state continuity |

PT-2 maps non-trivially across all five domains. What follows is a domain-by-domain inventory with evidence.

---

## D1 — Agentic Architecture & Orchestration (27%)

*The exam tests ability to design single-agent loops, multi-agent orchestrations, hub-and-spoke topologies, delegation protocols, and escalation logic.*

### What PT-2 has built

**Two production pipelines, both fully agentic:**

**`/build` (build-pipeline skill)** is the execution orchestrator. It accepts any specification document (PRD, EXEC-SPEC, investigation doc) and drives it through a 4-phase cycle:

```
Spec → [GOV-010 check] → EXECUTION-SPEC → [validate] → [DA review] → [approve] → Execute → DoD
```

The orchestrator is a pure coordinator — it never writes implementation code. All workstreams are dispatched as `Skill()` calls to domain expert agents. This is a textbook *hub-and-spoke* topology: a central planner plus leaf executors with no side-channel coupling.

**`/feature` (feature-pipeline skill)** is the design orchestrator. It runs a 6-phase design pipeline (SRM check → Scaffold → RFC → SEC Note → ADRs → PRD) with phase gates at each transition. It delegates to domain specialists (`lead-architect`, `rls-expert`, `prd-writer`) and terminates at handoff to `/build`.

**Adversarial review teams (the DA protocol):** Both pipelines deploy multi-agent *adversarial reviewer teams* — the most sophisticated agentic pattern in PT-2. Before any EXEC-SPEC executes or PRD is approved, a team is scored against a *magnitude rubric*:

| Score | Tier | Team Size |
|-------|------|-----------|
| 0–2 | Tier 0 Self-Certified | No team — phase gates sufficient |
| 3–5 | Tier 1 Focused | 1–2 targeted reviewers |
| 6+ | Tier 2 Full | 6 agents (build) or 4 agents (feature) |

For Tier 2 build-pipeline reviews, the team structure is:

```
r1-security   r2-architecture   r3-implementation   r4-test-quality   r5-performance
       ↘            ↓                  ↓                   ↓              ↙
                               synthesis-lead
```

The protocol has **two phases**: independent deep-dive first, then cross-pollination via `SendMessage`. Reviewers route findings to the owning reviewer for verification before the synthesis-lead deduplicates and issues a consolidated verdict (PASS / WARN / BLOCK). Blocked specs trigger a retry loop (max 2 attempts) before forcing a human decision. Agents communicate via `TeamCreate` / `SendMessage` / `TeamDelete` lifecycle management.

**Parallel dispatch discipline:** Both pipelines enforce single-message multi-`Skill` dispatch for independent workstreams — the canonical pattern for parallelism without sequential blocking.

**CCA-F alignment:** Demonstrates agentic loop design (both pipelines), hub-and-spoke architecture, escalation logic (BLOCK/retry), agent lifecycle management, delegation protocol, and token economics via tier selection. This is arguably PT-2's strongest domain.

**Gap:** No explicit *lifecycle hooks* (`onStart`, `onError`, `onComplete`) at the agent SDK level — resilience is handled via checkpoint state rather than SDK-native hooks.

---

## D2 — Tool Design & MCP Integration (18%)

*The exam tests MCP server configuration, resource vs. tool distinction, tool boundary design, and preventing reasoning overload from excessive tool surface area.*

### What PT-2 has built

**MCP server stack (session-loaded):**

| Server | Category | Purpose |
|--------|----------|---------|
| `context7` | Knowledge | Authoritative library docs (React, Next.js, Supabase, etc.) |
| `sequential-thinking` | Reasoning | Step-by-step reasoning budget for EXEC-SPEC generation |
| `tavily-remote` | Research | Web search + extract for current information |
| `filesystem` | Storage | Direct file system access beyond project boundaries |
| `playwright` | Browser | E2E test execution, screenshots, DOM interaction |
| `supabase` | Database | Direct Supabase project management (migrations, edge functions) |
| `vercel-plugin` | Deployment | Vercel project management, deployment lifecycle |
| `atlassian` | PM | Jira/Confluence integration |

**Claude Code plugins:**

| Plugin | Purpose |
|--------|---------|
| `typescript-lsp` | TypeScript LSP — symbol navigation, type checking in-agent |
| `pyright-lsp` | Python LSP — for validation scripts |
| `skill-creator` | Skill authoring meta-tool |
| `superpowers` | Superpowers skill framework |

**Hook-based tool governance (PreToolUse):**

```
PreToolUse[Bash]       → prevent-destructive.sh     (blocks rm -rf, force push, etc.)
PreToolUse[write|edit] → require-approval.sh         (write gate)
```

This is *tool boundary design* implemented as hooks — an agent cannot execute destructive shell commands without the hook intercepting first. The hook system acts as a safety boundary around the tool surface.

**Specialized plugin layer:** Two `.claude-plugin` plugins live in `.claude/plugins/`:
- `docs-sync` — keeps documentation in sync with code changes
- `rls-audit` — domain-specific security audit capability

**CCA-F alignment:** Active MCP server configuration, deliberate server selection (right tool for each category), hook-based tool boundary enforcement. The `sequential-thinking` MCP is particularly notable — it's explicitly invoked for EXEC-SPEC generation to allocate reasoning budget (`mcp__sequential-thinking__sequentialthinking`).

**Gap:** No explicit *resource vs. tool* distinction design documentation. MCP resources (static context) vs. tools (callable functions) aren't formally governed — tools are configured but the boundary between them is implicit.

---

## D3 — Claude Code Configuration & Workflows (20%)

*The exam tests `CLAUDE.md` hierarchy design, custom slash commands, CI/CD pipeline integration, hooks, and memory hierarchies.*

### What PT-2 has built

**`CLAUDE.md` as the project constitution.** PT-2's `CLAUDE.md` is a production-grade configuration artifact:
- Project structure overview with explicit `NO src/ directory` directive
- Critical guardrails (types, services, DTOs, code quality, complexity, migrations)
- Agent shell safety rules with output-size limits to prevent buffer overflow crashes
- Service layer pattern specification
- RLS & security architecture summary with ADR cross-references
- Memori engine commands
- Skills catalog cross-reference

This is not a generic README — it's a precision *behavioral contract* for the agent.

**Skills catalog — 14+ domain-specific skill modules:**

| Skill | Role in Pipeline |
|-------|-----------------|
| `build-pipeline` | Execution orchestrator |
| `feature-pipeline` | Design orchestrator |
| `lead-architect` | Architecture + EXEC-SPEC scaffolding |
| `backend-service-builder` | Service layer implementation |
| `api-builder` | Route handlers and OpenAPI contracts |
| `rls-expert` | RLS policies, ADR-015/018/020/024 patterns |
| `prd-writer` | PRD-STD-001 compliant requirements |
| `devils-advocate` | Adversarial review (standalone or DA team agent) |
| `e2e-testing` | Playwright specs and E2E mandate enforcement |
| `qa-specialist` | Quality gates and test coverage |
| `perf-audit` | 5-stream parallel audit swarm |
| `performance-engineer` | SLO definitions, query patterns |
| `frontend-design-pt-2` | React 19 + PT-2 visual DNA |
| `devops-pt2` | CI/CD, migration, deployment |

Each skill is a self-contained agent role definition with: `name`, `description`, `SKILL.md` instructions, bounded `references/` context, and optional `scripts/` for executable validation.

**Hooks as behavioral governance:**

```
UserPromptSubmit → memori-init-session.sh    (load cross-session memory)
UserPromptSubmit → lint-prompt.sh            (prompt quality gate)
PreToolUse[Bash] → prevent-destructive.sh   (block destructive commands)
PreToolUse[write|edit] → require-approval.sh
PostToolUse[write|edit|bash] → memori-record-work.sh  (persist to Memori)
PostToolUse[write|edit|bash] → format-and-test.sh     (autoformat + test)
```

This forms a complete *session lifecycle* instrumented at every tool event.

**Slash command surface:**
`/build`, `/feature-start`, `/feature-resume`, `/feature-status`, `/feature-gate`, `/perf-audit`, `/lead-architect`, `/backend-service-builder`, `/rls-expert`, `/e2e-testing`, `/memory-recall`, `/mvp-status`, `/arch-memory`

**Expert routing matrix** (`build-pipeline/references/expert-routing.md`): maps every workstream domain to a specific executor skill. This prevents the general agent from incorrectly handling domain-specific patterns (ADR-015 RLS, DTO canonical standard, React 19 patterns).

**GOV-010 prerequisite gate:** Every `/build` invocation runs a prerequisite check — verifies `scaffold_ref` and `adr_refs` exist in PRD frontmatter before execution begins. This is CI/CD-style gate logic applied to the agent workflow layer.

**E2E Mandate gate:** Build-pipeline auto-detects write-path PRDs (INSERT/UPDATE/DELETE signals) and injects a mandatory E2E workstream. This is agent-enforced quality governance.

**CCA-F alignment:** Mature `CLAUDE.md` hierarchy, comprehensive slash command surface, full hook lifecycle, agent-enforced CI gates, expert routing. PT-2's second strongest domain.

**Gap:** No formal CI/CD *pipeline integration* (Vercel/GitHub Actions). The hooks exist within Claude Code sessions but don't yet wire into deployment gates.

---

## D4 — Prompt Engineering & Structured Output (20%)

*The exam tests JSON schema enforcement, few-shot techniques, validation retry loops, structured output reliability, and reasoning separation.*

### What PT-2 has built

**EXECUTION-SPEC as structured output format.** The EXEC-SPEC is PT-2's primary structured artifact — a YAML frontmatter document with:
- Workstream array (ID, name, type, bounded_context, executor, dependencies, outputs, gate)
- Execution phases with parallel/sequential ordering
- Gates definition
- DoD criteria

The build-pipeline validates every generated EXEC-SPEC against a Python validation script before proceeding:
```bash
python .claude/skills/build-pipeline/scripts/validate-execution-spec.py docs/21-exec-spec/EXEC-###.md
```
This implements a *validation retry loop* — if the spec fails structural or governance checks, it doesn't proceed.

**Sequential thinking allocation.** EXEC-SPEC generation explicitly invokes `mcp__sequential-thinking__sequentialthinking`. This is *reasoning separation* — the token-intensive planning step is allocated dedicated thinking budget before structured output is produced.

**Extended thinking triggers in lead-architect:**

| Phrase | Budget | Use Case |
|--------|--------|---------|
| `think` | Low | Simple assertions |
| `think hard` | Moderate | Complex workflows |
| `think harder` | High | Multi-step verification |
| `ultrathink` | Maximum | Security + architecture |

This is a formalized *prompt engineering vocabulary* for budget allocation.

**PRD-STD-001 standard.** Every PRD must have:
- Required YAML frontmatter (id, title, owner, status, affects, created, phase, pattern, http_boundary)
- 9 mandatory sections in fixed order
- Definition of Done with 6 categories (Functionality, Data & Integrity, Security, Testing, Operational Readiness, Documentation)
- SDLC taxonomy cross-references

**FIB (Feature Intake Brief) — structured intake format.** Before entering the design pipeline, features are captured in a 10-section structured document:

| Section | Content |
|---------|---------|
| A | Feature identity |
| B | Operator problem statement |
| C | Pilot-fit / current-slice justification |
| D | Primary actor and operator moment |
| E | Feature Containment Loop (narrative flow) |
| F | Required outcomes |
| G | Explicit exclusions (scope walls) |
| H | Adjacent ideas considered and rejected |
| I | Dependencies and assumptions |
| J | Out-of-scope but likely next |

**FIB-H** (Heavy) is the full 10-section format used for complex features. **FIB-S** (Slim/Lite) variants (`FIB-PILOT-CONTAINMENT`, `FIB-OPEN-CUSTODIAL-CHAIN-PILOT-LITE`) are abbreviated versions for smaller scope items. Section H ("adjacent ideas rejected") is particularly notable: it encodes a mini devil's advocate pass *into the intake document itself*, preventing scope creep before the formal DA review.

**Zachman Progressive Disclosure.** Applied to PT-2's landing page architecture, the Zachman framework is used as an *information hierarchy* model:

```
Foundation Layer  → What the system is
Workflows Layer   → How operators use it
Evidence Layer    → Proof it works
Properties Layer  → Technical trust signals
Outcome Layer     → Business value
```

This maps Zachman's interrogatives (why/what/how/who/when/where) to a user-facing disclosure sequence — structured prompt engineering applied to UI/UX information architecture.

**DA magnitude scoring rubric.** The adversarial review tier selection uses a *structured scoring matrix* with explicit signal definitions, point values, and evidence sources — forcing the agent to enumerate signals from the artifact before making a tier decision.

**Temporal integrity checks.** Both pipelines run timestamp comparisons between upstream artifacts before DA review, catching specification drift before expensive review cycles begin.

**CCA-F alignment:** Strong structured output discipline (EXEC-SPEC, PRD, FIB), validation loops (GOV-010, E2E mandate, validate-execution-spec.py), reasoning separation (sequential thinking), extended thinking vocabulary, structured scoring rubrics.

**Gap:** No JSON schema validators for FIB/PRD formats — compliance is validated procedurally by skills, not via machine-enforced schemas. No few-shot example libraries baked into skill references.

---

## D5 — Context Management & Reliability (15%)

*The exam tests long-context preservation, the "lost in the middle" problem, handoff patterns, prompt caching, confidence calibration, and agent memory architecture.*

### What PT-2 has built

**Memori Engine — cross-session memory.** PT-2's Memori system is a custom persistent memory architecture:

```
UserPromptSubmit → memori-init-session.sh   (load prior context)
PostToolUse      → memori-record-work.sh    (persist new work)
```

Every session starts by reloading cross-session memory and ends by persisting new decisions. This solves the *context continuity problem* — agents pick up exactly where prior sessions left off. Memory is queryable via `/memory-recall`, `/arch-memory`, `/mvp-status`.

**Checkpoint-based pipeline resume.** Both pipelines maintain JSON checkpoint files:

```json
{
  "schema_version": 2,
  "current_phase": 3,
  "status": "in_progress",
  "gates": { "sec-approved": { "passed": true, "timestamp": "..." } },
  "artifacts": { "scaffold": "docs/01-scaffolds/SCAFFOLD-001.md" },
  "srm_validation": { ... },
  "coherence": { "non_goals": [...], "violations": [] }
}
```

Long pipelines can be resumed with `--resume` without losing state. The `coherence.non_goals[]` field tracks scope boundaries *across phases* — a coherence check at each subsequent phase verifies the current artifact doesn't violate non-goals established in the scaffold. This is cross-turn context preservation applied to multi-phase workflows.

**Context injection protocol.** Before EXEC-SPEC generation, three bounded context files are loaded:

```
architecture.context.md  → SRM ownership, DTO patterns, bounded context rules
governance.context.md    → Service template, migration standards, test locations
quality.context.md       → Test strategy, coverage targets, quality gates
```

Expert skills each carry their own `references/` directories — scoping the context window to domain-relevant material only.

**QUICK_START.md + freshness preflight.** The lead-architect skill runs:
```bash
python .claude/skills/lead-architect/scripts/check_primitive_freshness.py
```
This checks whether key architectural primitives (SRM, ADR docs) are stale before beginning a design session — *confidence calibration* at context load time.

**Agent shell safety rules (output management).** CLAUDE.md contains explicit rules preventing large-output commands from flooding the agent context:
```bash
# Never:
gh run view <ID> --log-failed        # floods context buffer

# Always:
gh run view <ID> --log-failed > /tmp/ci-log.log 2>&1
# Then: Read tool on /tmp/ci-log.log
```
This is *context overflow prevention* — treating the agent's context window as a managed resource.

**Temporal integrity checking.** Both pipelines detect when upstream artifacts (PRDs, ADRs) have been modified after dependent artifacts (EXEC-SPECs) were generated, flagging drift before expensive DA review cycles.

**CCA-F alignment:** Persistent memory architecture (Memori), checkpoint-based long-pipeline state, bounded context injection per skill, output-size governance, temporal drift detection.

**Gap:** No API-level *prompt caching* (`cache_control` headers) — Memori is session-load-time caching, not token-level caching. No explicit confidence calibration outputs (agents don't self-report uncertainty scores).

---

## Supplementary: SDLC Taxonomy

PT-2's SDLC taxonomy defines **10 documentation categories** mapped across **8 lifecycle phases**:

```
V&S → PRD → ARCH → ADR → API/DATA → SEC/RBAC → DEL/QA → OPS/SRE → REL/CHANGE → GOV
```

Canonical locations (`docs/00-vision/` through `docs/80-adrs/`), document ID schemes (GOV-XXX, PRD-XXX, ADR-XXX), RACI-lite ownership, and status lifecycle (Draft → Proposed → Accepted → Superseded → Deprecated) are all defined.

The taxonomy is enforced by the build-pipeline: GOV-010 checks that PRDs reference the correct upstream artifacts. The SDLC taxonomy ensures agent-generated artifacts land in the right category and don't create documentation sprawl.

---

## Domain Scorecard

| CCA-F Domain | PT-2 Evidence Density | Assessment | Key Gap |
|---|---|---|---|
| D1 Agentic Architecture | Multi-agent DA teams, hub-and-spoke pipelines, tiered orchestration | **Strong** | No SDK-level lifecycle hooks |
| D2 Tool Design & MCP | 8 MCP servers, plugins, hook-based tool governance | **Solid** | No formal resource/tool distinction docs |
| D3 Claude Code Config | CLAUDE.md, 14+ skills, full hook lifecycle, expert routing | **Strong** | No CI/CD pipeline integration (Vercel/GH Actions) |
| D4 Prompt Engineering | EXEC-SPEC, FIB, PRD-STD-001, Zachman, scoring rubrics | **Strong** | No JSON schema validators; no few-shot example libraries |
| D5 Context Management | Memori engine, checkpoints, bounded context injection | **Solid** | No API-level prompt caching; no confidence scores |

---

## Précis Summary

PT-2 is a casino pit management application built on a deliberately AI-native SDLC. Its defining characteristic is not that it *uses* AI — it is that its entire software delivery lifecycle is *orchestrated by* AI agents operating under a governance framework designed specifically for the application domain.

**The two-pipeline model** is the architectural spine: `/feature` designs (what and why), `/build` executes (how). Both pipelines are specification-driven, checkpoint-resumable, and gate-protected. Neither pipeline allows the general-purpose agent to produce domain code directly — all implementation is delegated to bounded expert skill agents with injected domain context.

**The adversarial review protocol** is the quality mechanism: before any specification reaches execution or approval, a multi-agent team independently attacks it from five angles (security, architecture, implementation completeness, test quality, performance), cross-pollinates findings, and synthesizes a verdict. The magnitude scoring system ensures review overhead is proportional to risk.

**The governance stack** — CLAUDE.md, hooks, SDLC taxonomy, SRM, ADRs, FIBs, GOV-010 gates, E2E mandate — forms a *deterministic rule system* that the agent operates within. Claude doesn't decide architectural patterns; it applies the ones the team has documented and enforces them through validation scripts, pre-commit hooks, and structured output requirements.

**The memory architecture** — Memori engine at the session level, checkpoints at the pipeline level, bounded `references/` context at the skill level — solves the context continuity problem at three different time scales.

**Where PT-2 is AI-native and where it isn't**: The SDLC *process* is AI-native. The *application* (player session tracking, rating slips, loyalty) is a conventional Next.js/Supabase application with no AI in the runtime product. AI is the delivery mechanism, not the product feature.

---

## Identified Infrastructure Gaps

| Gap | Domain | Impact | Remediation Path |
|-----|--------|--------|-----------------|
| No CI/CD integration (Vercel, GitHub Actions) | D3 | High | `/devops-pt2` skill has the spec; needs execution |
| No branch protection on main | D3 | High | GitHub repo settings + required status checks |
| No API-level prompt caching (`cache_control`) | D5 | Medium | Add caching headers to repeated governance context loads |
| No JSON schema validators for FIB/PRD | D4 | Low | Add Zod schemas for intake documents |
| No Agent SDK lifecycle hooks | D1 | Low | Evaluate `onStart`/`onError` hooks for crash recovery |
| No few-shot example libraries in skills | D4 | Low | Add `examples/` directories to key skills |
| MCP resource vs. tool boundary undocumented | D2 | Low | Governance doc for MCP server categorization |

---

*Document type: Learning / Reference*
*Location: `docs/learning/`*
*Last updated: 2026-04-10*
