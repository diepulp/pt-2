---
description: Start the Context Management Evolution implementation workflow
---

Load and execute the systematic workflow for implementing the Context Management & Memory Evolution proposal.

**Workflow**: `.claude/workflows/implement-context-management.prompt.md`

**What this implements**:
1. Session Layer (PostgreSQL `context` schema + Python services)
2. Memory Pipeline Upgrade (provenance fields + ETL)
3. Hybrid Retrieval (PostgreSQL full-text search)
4. Compaction Strategies (sliding window + summarization)
5. Multi-Agent Coordination (AgentHandoff protocol)
6. Memory File Sync

**Prerequisites** (verify before proceeding):
- [ ] Memori PostgreSQL schema exists
- [ ] `lib/memori/` directory exists
- [ ] Supabase local running (`npx supabase start`)
- [ ] Python environment configured

**Reference**: `docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md`

---

Begin by reading the workflow file and starting Phase 1 (Schema Design) in Architect mode.
