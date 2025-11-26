
# Context Management Handoff: Sessions & Memory  
*Reference summary + design guide for updating your context system*

---

## 1. Purpose

This document distills the whitepaper into a **practical design spec** for your context management layer:

- How to **structure sessions** (short-term state).
- How to **design memory** (long-term state).
- How these interact with **RAG / tools / multi-agent orchestration**.
- What to **operationalize in production** (performance, security, evaluation).

Use it as a handoff reference for developers working on agent runtimes, session storage, memory services, and RAG.

---

## 2. Core Concepts

### 2.1 Context Engineering

Context engineering is the dynamic assembly of *all* information that goes into a single LLM call:

- Instructions and system prompts.
- Tool definitions and schemas.
- Conversation history.
- Long-term memories.
- External knowledge (RAG, APIs).
- Scratchpads and intermediate artifacts.

Think of three bands:

1. **Context to guide reasoning**  
   - System prompt, tool schemas, few-shot examples.

2. **Evidential / factual data**  
   - Long-term memories, RAG docs, tool outputs, sub-agent results, artifacts.

3. **Immediate conversational info**  
   - Current user turn, recent history, scratchpad / state.

Your context system’s job is to ensure the model sees **no more and no less** than what’s relevant for this turn, within token, latency, and cost constraints.

### 2.2 Sessions vs Memory

- **Session = workbench** (short-term, per conversation)  
  - Chronological log of **events** (user messages, model replies, tool calls/results).  
  - Optional **state object** (scratchpad / working memory).

- **Memory = filing cabinet** (long-term, cross-session)  
  - Extracted, condensed, **framework-agnostic** facts & summaries.  
  - Stored in a separate **memory manager**, potentially shared across agents/frameworks.

---

## 3. Target Architecture (High-Level)

### 3.1 Per-Turn (“Hot Path”) Flow

For each turn in a conversation:

1. **Fetch context**
   - Load session events + state.
   - Retrieve relevant memories (user/session/app).
   - Retrieve RAG / external knowledge if needed.

2. **Prepare context**
   - Apply compaction (truncate, summarize).
   - Build final prompt: system instructions + tools + memories + selected history.

3. **Invoke LLM + tools (possibly multi-step)**
   - Append all model/tool events into session.

4. **Background updates**
   - Push new/updated events to a **memory manager** for extraction + consolidation.
   - Optionally create/update session-level summaries.

### 3.2 Off the Hot Path (Background Services)

- Memory **generation** (ETL pipeline: ingest → extract → consolidate → store).  
- Memory **maintenance** (pruning, TTL, re-consolidation).  
- **Compaction jobs** for long sessions.  

---

## 4. Session Design Guidelines

### 4.1 Data Model

Each **Session** should include:

- **Metadata**
  - `session_id`, `user_id`, timestamps, app/agent IDs, tenant/casino, etc.

- **Events** (append-only, ordered)
  - `id`
  - `session_id`
  - `type`: `user_message | model_message | tool_call | tool_result | system_event`
  - `role`: `user | assistant | tool | system`
  - `parts`: text, images, tool args/result payloads, structured JSON, etc.
  - `created_at`

- **State / Scratchpad** (structured JSON)
  - Temporary working data (e.g., active task, cart, intermediate plan, partial results).

**Design goals:**

- Events should map cleanly to your LLM API’s `Content` objects (role + parts).
- Session logs should be append-only for auditing, with optional compaction overlays.

### 4.2 Storage & Isolation

- Use a **durable DB** (not just in-memory) in production.
- Enforce **strong isolation**:
  - Per-user / per-tenant ACLs so sessions cannot be cross-read.
- Define **TTL policies**:
  - Auto-expire or archive inactive sessions after N days/months.
- Maintain **strict chronological ordering**:
  - Append-only, ordered by `created_at` or sequence number.

### 4.3 Long-Context Management (Compaction)

Implement multiple strategies:

1. **Sliding Window**
   - Keep the last *N* turns when building context.

2. **Token-Based Truncation**
   - Work backwards from the most recent events until you hit a token budget.
   - Drop or summarize older events.

3. **Recursive Summarization**
   - Periodically replace older dialogue spans with LLM-generated summaries.
   - Optionally keep raw logs in cold storage for compliance/audit.

**Triggers for compaction:**

- Turn count threshold (e.g., every 20 messages).
- Token threshold (e.g., when context exceeds X tokens).
- Time-based (e.g., compact idle sessions every night).
- Workflow events (e.g., when a task is marked complete).

**Key rule:**  
Compaction changes **what you send to the LLM**, but not necessarily what you store. Decide per-regulatory context whether to keep raw logs, summaries, or both.

### 4.4 Security & Privacy

- **Redact PII** before writing to session store where feasible.  
- Provide user controls to:
  - Opt out of persistent sessions.
  - Delete sessions or entire history.
- Ensure:
  - Encrypted at rest.
  - Encrypted in transit.
  - Principle of least privilege for access roles.

---

## 5. Multi-Agent Session Patterns

### 5.1 Shared Session History

- A central session log; all agents append to it.
- Use when agents are tightly coupled and must see each other’s outputs.
- Agents may still:
  - Filter or label events.
  - Restrict the subset of events they send to the LLM.

### 5.2 Per-Agent Private History + A2A

- Each agent has its own internal session/log.
- Agents communicate via **A2A messages** or **agent-as-tool** calls.
- Use when:
  - You want encapsulation and clear boundaries.
  - You mix frameworks (e.g., LangGraph + custom orchestrator).

### 5.3 Interoperability Strategy

- Avoid sharing **raw** session objects across frameworks.
- Use **Memories** (canonical, framework-agnostic data) as the shared layer.
- Treat memory as the “API” between heterogeneous stacks.

---

## 6. Memory System Design

### 6.1 Memory Manager Responsibilities

Create a dedicated **Memory Manager** service/bounded context that:

- Stores memories in framework-agnostic formats (strings, JSON).
- Implements an **LLM-driven ETL pipeline**:
  - **Ingestion** – receive events or candidate memories.
  - **Extraction** – turn raw content into atomic memories.
  - **Consolidation** – reconcile new and existing memories.
  - **Storage** – commit to DB / vector store / knowledge graph.
  - **Retrieval** – expose search and loading APIs.
- Exposes core APIs:
  - `generate_memories(source_events | pre_extracted)`
  - `retrieve_memories(scope, query)`
  - `delete_memory` / `prune_memories`

### 6.2 Memory vs RAG

- **RAG**: static, shared, factual docs.  
  - “Expert on the world.”

- **Memory**: dynamic, user-scoped context.  
  - “Expert on the user (and app state).”

RAG and memory can both be plugged into the context, but they are distinct systems with different lifecycles and governance.

### 6.3 Memory Types

By **content**:

- **Declarative (“what”)**
  - User facts, preferences, goals, episodic summaries.
- **Procedural (“how”)**
  - Playbooks / workflows that encode how to perform recurring tasks.

By **scope**:

- **User-level**
  - Cross-session personalization; per-user memories.
- **Session-level**
  - Compact representation of a single long session.
- **Application-level / global**
  - Shared procedural or configuration memories, sanitized of PII.

### 6.4 Organization Patterns

- **Collections**
  - Many small “atomic” memories (facts, mini-summaries).
- **Structured profile**
  - Stable key-value profile (name, language, preferences).
- **Rolling summary**
  - Single evolving narrative summary per user or session.

### 6.5 Storage Options

- **Vector store**
  - Semantic similarity search over unstructured text.
- **Knowledge graph**
  - Entities and relationships with typed edges.
- **Hybrid**
  - Entities + edges stored in DB, enriched with embeddings for similarity search.

---

## 7. Memory Generation (ETL Pipeline)

### 7.1 Extraction

Goal: decide **what is meaningful enough** to store as memory.

Patterns:

- Define **topics** or schemas that memories should adhere to.
- Use **few-shot examples** showing good/bad memory extractions.
- Distinguish:
  - **Explicit** memories (“remember that…”).
  - **Implicit** memories (inferred preferences, behavioral patterns).

### 7.2 Consolidation

Goal: keep the corpus **coherent, non-redundant, and up-to-date**.

Given new candidate memories:

- **UPDATE**
  - Enrich or correct an existing memory.
- **CREATE**
  - Add a new memory when none is similar enough.
- **DELETE / INVALIDATE**
  - Remove or mark stale/contradicted memories.

Add **forgetting** mechanisms:

- TTL or time-based decay.
- Topic-specific limits (e.g., keep last N trips).
- Conflict resolution strategies (recency, source trust).

### 7.3 Provenance & Confidence

Track for each memory:

- **Source type**
  - Bootstrapped, explicit user input, implicit extraction, tool outputs, etc.
- **Timestamps**
  - When created, last updated, last used.
- **Lineage**
  - Which sessions/events contributed.
- **Confidence score**
  - Evolves with corroboration/contradiction.

Use provenance:

- In **consolidation** (conflict resolution).
- At **inference time** (inject confidence hints into prompt).

### 7.4 Triggers for Generation

Architectural choices:

- **End of session**
  - Cheap; lower temporal granularity.
- **Every N turns**
  - Balanced cost/fidelity.
- **Every turn / real-time**
  - High fidelity; expensive.
- **Memory-as-tool**
  - Agent decides when to call `create_memory` based on context.

**Rule:** generation runs **asynchronously** after responding to the user. Never block the main interaction on memory writes.

---

## 8. Memory Retrieval & Inference

### 8.1 Retrieval Strategy

For **collections**:

- Score memories by:
  - **Relevance**
  - **Recency**
  - **Importance** (importance weights set at generation)
- Optional enhancements:
  - Query rewriting (LLM refines search query).
  - Reranking (LLM re-scores top-K results).
  - Caching for repeated queries.

For **profiles / rolling summaries**:

- Direct lookup or fetching a single summary document per scope.

### 8.2 When to Retrieve

Two main patterns:

1. **Proactive retrieval**
   - Always fetch relevant memories at the start of each turn.
   - Cache results within a turn to avoid repeated queries.

2. **Reactive retrieval (“memory-as-tool”)**
   - Agent decides when to call `load_memory` / `search_memory`.
   - Lower average latency and cost.
   - Requires good tool descriptions and agent policies.

### 8.3 Injecting Memories into Context

Options:

1. **System instructions**
   - Use for stable/global info (user profile, app norms).
   - Strong influence; reconstruct each turn.

2. **Conversation history injection**
   - Insert memories as pseudo-messages (e.g., “System note: The user prefers X.”)
   - Maintain correct role & POV to avoid confusion.

3. **Tool outputs**
   - Memories appear as outputs of a `memory` tool in the conversation.

A practical hybrid:

- Put stable profile & procedural guidelines into the **system prompt**.
- Inject episodic and task-specific memories via **dialogue** or **tool calls**.

---

## 9. Production & Governance Checklist

### 9.1 Sessions

- [ ] **Strict ACLs** per user/tenant.
- [ ] **PII redaction** before storage where feasible.
- [ ] **TTL / retention policy** for sessions.
- [ ] **Compaction strategy** implemented, tested, and monitored.
- [ ] Session operations are **low-latency** and horizontally scalable.
- [ ] Audit trails available for compliance where required.

### 9.2 Memory

- [ ] Memory generation runs **non-blocking**, via workers or dedicated service.
- [ ] Queue + retry / dead-letter mechanisms for LLM/DB failures.
- [ ] Concurrency control on shared memories (transactions or optimistic locking).
- [ ] Multi-region replication handled inside the memory system, exposing one logical view.
- [ ] **User controls**:
  - Opt-out of memory.
  - Delete all memories.
  - Revoke particular sources or topics.
- [ ] Defenses against **memory poisoning** and prompt-injection into persistent memory.

### 9.3 Evaluation

Track:

- **Generation quality**
  - Precision, recall, F1 against curated golden memories.
- **Retrieval quality**
  - Recall@K, MRR, latency.
- **End-to-end impact**
  - Task success with vs without memory.
  - User satisfaction metrics.

Use metrics to tune:

- Topic definitions & extraction prompts.
- Consolidation rules and confidence thresholds.
- Retrieval scoring & caching strategies.

---

## 10. Integration Plan for Your Current Context System

This section serves as a concrete handoff for developers updating the current context management approach.

### 10.1 Clarify Service Boundaries

- Define and document responsibilities for:
  - **Session service**
    - Owns logs and scratchpad.
  - **Memory service**
    - Owns long-term, user-scoped, and app-level memories.
  - **RAG / Knowledge service**
    - Owns static or slowly-changing knowledge.

### 10.2 Standardize Context Assembly

Create a single entrypoint per agent type, e.g.:

```ts
type BuiltContext = {
  system: string;
  tools: ToolSpec[];
  history: SessionEvent[];
  memories: MemoryRecord[];
  scratchpad?: unknown;
};

async function buildContext(turn: TurnInput): Promise<BuiltContext> {
  // 1) Load session events + scratchpad
  // 2) Compact / window history under token budget
  // 3) Retrieve memories (user, session, app)
  // 4) Add relevant RAG documents if applicable
  // 5) Return assembled context
}
```

### 10.3 Introduce / Upgrade Memory Manager

- Implement minimal memory service with:
  - `generateMemories(events | text)`
  - `retrieveMemories(userId, query, scope)`
  - `deleteMemories(userId, filter)`
- Start with:
  - **User-level collections** of atomic facts.
  - A **user profile** document (key-value).
  - Optional **session summary** per long-running session.

### 10.4 Wire Retrieval into the Hot Path

- Start with **proactive retrieval**:
  - Fetch top-K user and app-level memories at the beginning of each turn.
- Combine with a **sliding window** history strategy.
- Confirm token budgets and adjust K / window size accordingly.

### 10.5 Move Generation to Background

- After each session or every N turns:
  - Enqueue a job: `GenerateMemoriesFromSession(session_id)`.
- Worker pipeline:
  1. Load new session events since last generation.
  2. Call LLM to extract candidate memories.
  3. Consolidate with existing memories.
  4. Store updated memory set.

### 10.6 Add Governance & Observability

- Implement:
  - Structured logs for session and memory operations.
  - Metrics: latency, errors, queue depth, memory corpus size.
- Add dashboards for:
  - Memory growth and retention.
  - Generation & retrieval latency.
  - Opt-out and delete operations.

---

## 11. Developer Handoff Summary

For developers integrating this context management approach:

1. **Data Models**
   - Implement/verify `Session`, `SessionEvent`, `SessionState`, and `Memory` schemas.
2. **APIs**
   - Provide clear service interfaces for:
     - Session CRUD + append event.
     - Memory generate/retrieve/delete.
     - RAG/knowledge fetch.
3. **Context Builder**
   - Centralize logic that builds the full LLM context for each turn.
4. **Pipelines**
   - Set up asynchronous pipelines for memory generation and session compaction.
5. **Policies**
   - Define and configure TTL, compaction, PII handling, and user controls.
6. **Monitoring**
   - Instrument the system to observe correctness, performance, and user impact.

Treat this document as the **canonical reference** for how sessions, memory, and RAG should cooperate in your agent architecture going forward.
