# Memori Engine — AI-Native Context Management Précis

## Mapping to the CCA Foundations Five Competency Domains

**Audience:** Engineers, product leads, and technical stakeholders interested in how AI agents sustain continuity and learning across sessions.
**Purpose:** Explain what the Memori engine does, why it matters as an AI-native infrastructure component, and how it expresses each of the five CCA-F competency domains in practice.

---

## What Memori Is

Every AI coding session starts cold. The agent has no memory of what was decided last week, which service pattern was chosen for the loyalty domain, or where a three-hour implementation session stopped before context got full. The standard workaround is to paste prior context back into the prompt by hand — which is slow, incomplete, and never done consistently.

Memori solves this problem at the infrastructure level. It is PT-2's **cross-session memory engine**: a persistent store where agents record what they learn, decide, and build, so that future sessions pick up with the same working knowledge a human engineer carries between days. The agent doesn't just re-read files — it recalls *interpretations*, *decisions*, and *progress states* that live nowhere in the codebase itself.

---

## The Core Idea: Memory Has a Shelf Life

Not all knowledge ages the same way. A business rule about casino gaming days is permanent. An architectural decision about service patterns belongs to the project forever. MVP completion status is relevant while the project is active. A checkpoint from a paused implementation session is only useful for the next few days.

Memori models this reality with a **four-tier hierarchy**, each tier with its own retention policy:

```
┌────────────────────────────────────────────────────────┐
│  Tier 1 — Project Knowledge        (Permanent)         │
│  Business rules, coding standards, UI patterns         │
├────────────────────────────────────────────────────────┤
│  Tier 2 — Architectural Decisions  (Permanent)         │
│  ADRs, pattern choices, compliance designs             │
├────────────────────────────────────────────────────────┤
│  Tier 3 — MVP Progress             (Operational)       │
│  Phase milestones, service completion, PRD status      │
├────────────────────────────────────────────────────────┤
│  Tier 4 — Session Checkpoints      (7-day TTL)         │
│  Active task state, modified files, next steps         │
└────────────────────────────────────────────────────────┘
```

The two permanent tiers represent the institutional memory of the project. The operational tier tracks delivery progress. The ephemeral tier holds the short-term "what I was doing" that allows a session to resume without losing its thread.

---

## What Memori Remembers

The system recognizes five categories of memory, each suited to a different kind of agent knowledge:

| Category | What it holds | Example |
|----------|---------------|---------|
| **Facts** | Business rules, domain invariants | "Gaming day runs 6 AM to 6 AM next day" |
| **Skills** | Patterns that work, what to use where | "Pattern B works well for CRUD-heavy services" |
| **Rules** | Guardrails and constraints | "No ReturnType inference in service factories" |
| **Preferences** | Validated engineering choices | "Use optimistic locking for concurrent visit updates" |
| **Context** | Active task state at checkpoint time | "Currently implementing VisitService mutations; next: error handling" |

Each memory also carries **tags** for domain (`domain:loyalty`, `domain:player`) and **importance scores** (0.0–1.0), enabling relevance-ranked retrieval rather than flat text search.

---

## How Agents Interact with Memori

Two hooks in the Claude Code lifecycle instrument every session automatically:

- **Session start** (`UserPromptSubmit`) → `memori-init-session.sh` — loads relevant prior knowledge before the first tool call
- **After every write/edit/bash** (`PostToolUse`) → `memori-record-work.sh` — persists what was just done

This means memory recording is not something the agent must remember to do. It happens as a side effect of working. The explicit actions are checkpointing (when context fills up) and querying (when starting a feature where prior decisions may apply).

**Slash commands for direct interaction:**

| Command | What it does |
|---------|-------------|
| `/memory-recall <query>` | Semantic search across all tiers |
| `/arch-memory` | Surface architectural decisions |
| `/mvp-status` | Current implementation progress |
| `/arch-checkpoint save` | Snapshot current architect session |
| `/arch-checkpoint restore` | Resume from prior snapshot |
| `/backend-checkpoint save\|restore` | Same for backend-service-builder sessions |
| `/memori-status` | Health view of the memory store |
| `/memori-cleanup` | Purge expired session data |

---

## Domain Mapping: Memori Through the CCA-F Lens

### D1 — Agentic Architecture & Orchestration

Memori is the **persistence substrate** that makes multi-agent pipelines resumable. When the build-pipeline dispatches a six-agent adversarial review team, the synthesis-lead's consolidated verdict is persisted. When the feature-pipeline completes a PRD, the gate states are checkpointed. If a pipeline is interrupted mid-flight, `/build --resume` reloads the checkpoint and continues from the last completed workstream.

Beyond pipelines, Memori enables **agent role continuity**. The `lead-architect` skill resumes from its prior session checkpoint, so it enters a design session already knowing what ADRs were created last week and which bounded contexts were last modified. The agent behaves less like a stateless function and more like a team member who picks up where they left off.

The tier separation also enforces a clean **memory isolation boundary** — analogous to the bounded context isolation in the service layer. Session memory doesn't pollute architectural memory; architectural decisions don't get overwritten by MVP progress notes. Each tier has a defined owner and write policy.

---

### D2 — Tool Design & MCP Integration

Memori exposes its functionality through a **Python client API** (`lib.memori.create_memori_client`) that functions as an internal MCP-like resource: a structured, queryable knowledge surface that agents call rather than raw file reads.

The distinction matters. When an agent needs to know "what pattern did we use for the loyalty service?", it calls `memori.search_learnings(query="loyalty service pattern")` rather than scanning ADR files. The result is relevance-ranked, tagged, and returned in a format the agent can reason over directly — not raw markdown to parse.

The **chatmode-to-namespace routing** acts as a tool boundary design: different agent roles write to different memory tiers. The frontend-design skill writes UI patterns to `pt2_project` (permanent), while the lead-architect writes decisions to `arch_decisions` (permanent) and session state to `session_lead_architect_{YYYY_MM}` (ephemeral). The tool interface enforces this automatically — `create_memori_client("skill:lead-architect")` routes to the correct namespace without the agent having to specify it.

This prevents **reasoning overload from undifferentiated memory**. An agent querying for "what should I do for this service pattern?" doesn't wade through session checkpoints or MVP progress notes — the namespace routing surfaces only what's relevant to its role.

---

### D3 — Claude Code Configuration & Workflows

Memori is wired into the **session lifecycle via hooks** — the canonical Claude Code mechanism for ambient behavioral automation:

```
UserPromptSubmit → memori-init-session.sh    (context restored before first response)
PostToolUse      → memori-record-work.sh     (knowledge written after every change)
```

This is hook-based automation at its most direct: agents gain memory without explicit memory management instructions in CLAUDE.md. The `CLAUDE.md` simply tells agents *what commands are available* (`/memory-recall`, `/mvp-status`, `/arch-memory`); the hooks handle the lifecycle.

The **slash command surface** (`/arch-checkpoint`, `/backend-checkpoint`, `/skill-checkpoint`) parallels the `/build --resume` pattern: any long-running agent workflow can be saved and resumed by ID. This is a first-class workflow primitive, not an afterthought.

Memori also provides a **per-skill learning system**. The `backend-service-builder` skill records what patterns worked, which services were completed, and what lessons were learned after each execution. Future invocations of the skill query this history before beginning — the skill improves its own behavior over time from accumulated project-specific experience.

---

### D4 — Prompt Engineering & Structured Output

Every memory written to Memori is a **structured record**, not free-form text. The schema enforces:
- `content` — the memory body (100–300 characters ideal)
- `category` — controlled vocabulary (facts, preferences, skills, rules, context)
- `metadata` — typed JSONB (type, domain, rationale, affected_services, alternatives_considered)
- `importance` — float 0.0–1.0
- `tags` — array for cross-domain retrieval
- `embedding` — vector(1536) for semantic search

This structure means **memory retrieval is a prompt engineering act**: the agent constructs a natural language query, the embedding similarity search returns ranked results, and the agent synthesizes a decision from structured evidence rather than raw text. The `importance` score acts as a relevance weight in the retrieval prompt.

The **documentation regression use case** is particularly notable. When an agent discovers that the SRM says `loyalty_tier` but the schema has `loyalty_level`, it records a structured regression:
```
type: schema_drift
affected_docs: [SRM, schema.ts]
resolution: aligned with implementation
lessons_learned: always regenerate types after schema changes
```
This is *few-shot knowledge capture*: the resolution and lesson are stored so future agents inherit the correct behavior without re-discovering the drift.

The **namespace decision tree** (which tier for which memory?) functions as a structured prompt: the agent follows a branching logic — session checkpoint? → Tier 4 / architectural decision? → Tier 2 / MVP progress? → Tier 3 / everything else → Tier 1 — to route each memory correctly. Structure governs output placement.

---

### D5 — Context Management & Reliability

Memori is the primary answer to **the "lost in the middle" problem** at the session boundary. Claude Code has a finite context window. When a complex implementation session nears 60% utilization, the agent checkpoints its working state to Tier 4:

```
current_task:      "Implementing VisitService mutations"
decisions_made:    ["Using optimistic locking", "Separating read/write paths"]
files_modified:    ["services/visit/mutations.ts", "services/visit/queries.ts"]
next_steps:        ["Add error handling for lock conflicts", "Write integration tests"]
key_insights:      ["Supabase RPC works better than direct inserts for complex transactions"]
```

After `/clear`, the next session loads this checkpoint within seconds via `/arch-checkpoint restore`. The agent doesn't re-read files to reconstruct state — it *recalls* the interpretive layer that human engineers carry in their heads between work sessions.

The **7-day TTL on session checkpoints** is a deliberate reliability design. Stale context is more dangerous than no context: a two-month-old session checkpoint describing a schema that no longer exists would actively mislead an agent. The TTL ensures ephemeral memory expires naturally, while the permanent tiers (Tier 1 and 2) accumulate institutional knowledge without decay.

**Temporal integrity** extends to the memory layer itself. The `load_latest_checkpoint()` method filters by `expires_at > NOW()` — the agent never retrieves logically expired memory even if physical cleanup hasn't run. The system fails safe toward "no memory" rather than "stale memory."

**Backwards compatibility** in memory retrieval (searching both current session namespaces and legacy namespace patterns) means the context management system doesn't break when namespace conventions change — another reliability-first design choice.

---

## What Memori Is Not

Understanding the boundaries helps clarify the design intent:

- **Not a project management system** — it doesn't replace Linear, GitHub Issues, or PRDs. It holds the *interpretive layer* that lives between the tickets and the code.
- **Not a documentation generator** — it captures decisions, not documents. The ADR in `docs/80-adrs/` is the canonical record; the Memori entry is the retrievable summary an agent can act on.
- **Not a long-term audit trail** — session checkpoints expire. Permanent knowledge in Tier 1 and 2 is stable, but Memori is not an append-only event log for compliance purposes.
- **Not a replacement for good CLAUDE.md** — Memori holds learned, dynamic knowledge. CLAUDE.md holds fixed behavioral contracts. They operate at different layers.

---

## Summary: Memori in One Paragraph

Memori is the mechanism by which PT-2's AI agents accumulate institutional knowledge across sessions. It organizes memory across four tiers — permanent project knowledge, permanent architectural decisions, operational progress tracking, and ephemeral session checkpoints — with each tier carrying an appropriate retention policy. Agents write to it automatically via hooks and read from it via semantic search and slash commands. The result is a system where an agent starting a new session isn't starting from scratch: it knows the pattern decisions made three months ago, the service completion status as of last sprint, and exactly what task was in progress when the last session was cleared. Mapped against the CCA-F framework, Memori primarily delivers on D5 (context management and reliability), but touches all five domains — as the substrate that makes agentic pipelines resumable, skill execution learnable, structured output queryable, and tool boundaries enforceable.

---

*Document type: Learning / Reference*
*Location: `docs/learning/`*
*Last updated: 2026-04-10*
