# PT-2 Agentic Architecture — Systems Posture Overview

**Date:** 2026-04-23
**Purpose:** Non-technical overview of the agentic architecture currently in place on PT-2, organized by the five domains that matter to AI-native engineering roles.
**Scope:** Information / positioning reference. Not a technical spec.

---

## Context in one paragraph

PT-2 (casino pit management system) is built *with* agents, not just *by* humans using agents as assistants. The repository contains a working agentic operating model: specialized skills, phased pipelines, adversarial review, cross-session memory, checkpoint-based resume, and now an explicit transport/middleware policy that defines how agent-built entry points must behave at runtime. What follows is a plain-language read of that posture against the five domains typically used to evaluate AI-native engineering practice.

---

## 1. Agentic Workflows / Orchestration

**Posture:** Multi-phase pipelines with explicit gates, checkpoint resume, scoped handoff between specialist agents, and explicit multi-agent execution patterns — not single-prompt interactions.

PT-2 separates design from build. Two distinct pipelines, each with its own gate protocol, move work from vague idea to shippable change:

- **Feature Pipeline** (design-time) — a six-phase flow (ownership → scaffold → design → security → ADR freeze → PRD) that produces *what* and *why* artifacts. Each phase has a gate the human must pass before the next agent runs.
- **Build Pipeline** (execution-time) — accepts a PRD, EXEC-SPEC, or investigation doc and dispatches specialist skills (backend service builder, API builder, RLS expert, QA specialist, DevOps, E2E testing) across isolated workstreams. Includes complexity pre-screen to select a streamlined vs. full path and a single-pass adversarial review step.
- **Edge transport policy** — once a feature reaches implementation, agent-built entry points must follow the dual-entry transport rule in `docs/20-architecture/EDGE_TRANSPORT_POLICY.md`: React Query flows go through Route Handlers, while form and RSC flows go through Server Actions. That means orchestration does not stop at planning; it continues into the runtime shape of the system.

Cross-referencing the SDLC taxonomy adds an important nuance: the workflow model is not documented in only one place. It is distributed across **ARCH** artifacts (SRM, service and transport patterns), **PRD/EXEC-SPEC** planning artifacts (workstream decomposition and dependencies), **DEL/QA** artifacts (validation gates and test mandates), and **GOV** artifacts (anti-invention, testing-governance, and guardrails). In other words, the orchestration logic is part of the system's delivery architecture, not just its prompt library.

Concrete mechanisms visible in the repo:
- 80+ persisted checkpoints under `.claude/skills/build-pipeline/checkpoints/` covering PRDs v030–v067, allowing any workstream to resume after interruption.
- `create-worktree` / `remove-worktree` skills isolate parallel feature branches so agent runs don't collide.
- FIB (Feature Intake Brief) authority chain (FIB-H prose → FIB-S structured) freezes human scope decisions before any agent is allowed to expand them — an "anti-invention" guardrail.
- **Coordinator-subagent pattern** is explicit in the build pipeline: the orchestrator generates the EXECUTION-SPEC, delegates architectural scaffolding to `lead-architect`, dispatches each workstream to a domain expert, then merges and validates the results before presenting the next gate. The main agent coordinates; specialist agents do bounded work.
- **Hub-and-spoke pattern** is also explicit: independent workstreams are marked `parallel` and dispatched concurrently in a single phase when they have no design dependencies. The repo contains repeated examples of this in execution specs and planning docs (`WS1 + WS2 + WS3` style parallel phases, plus older parallel-execution workflows designed for expert sub-agents).
- The coordinator does more than fan out work — it also performs synthesis and governance checks afterward: intake traceability, anti-invention validation, write-path classification, execution-spec validation, and phase-by-phase checkpoint updates.
- **Context-rot mitigation is built into orchestration itself**: validation gates create checkpoint summaries, phase transitions trigger memory extraction, and `/build --resume` restores execution from persisted state instead of forcing the next session to reconstruct intent from a long chat log.
- The transport layer itself is standardized: both Route Handlers and Server Actions are expected to compose the same wrapper chain (`withAuth` → `withRLS` → `withIdempotency` → `withAudit` → `withTracing`) so independently generated implementations converge on one operational pattern.

**Why this matters:** the system can execute multi-step work autonomously without losing the plot between steps, use the right parallelization model for the dependency graph at hand, and force generated runtime surfaces back into a shared transport contract instead of drifting by feature.

---

## 2. Evaluation Harnesses

**Posture:** Output quality is evaluated at three layers — specification, implementation, and release — with an adversarial reviewer agent as the specification-layer check.

The harness is not a single eval suite; it is a stack:

- **Devil's Advocate skill** runs a structured P0–P3 review against specs (PRDs, ADRs, EXEC-SPECs, migration plans, RLS policies) and is required to verify claims against the actual codebase before filing a finding. It checks tenancy boundaries, authorization, idempotency, concurrency, migration safety, observability, and over-engineering.
- **CI quality gates** (`docs/40-quality/QA-002-quality-gates.md`) enforce pre-commit checks (lint, types, schema regen), PR-level coverage floors (≥80% overall, ≥90% services, 100% DTOs), and release-level performance budgets (LCP, bundle size).
- **Governance standards** encode the rubrics: `OVER_ENGINEERING_GUARDRAIL.md`, `ERROR_HANDLING_STANDARD.md`, `TESTING_GOVERNANCE_STANDARD.md` (ADR-044). These are not documents the agent may ignore; they are referenced in skill definitions and enforced via hooks.
- **Transport-policy checks** add implementation-layer assertions: middleware lint ensures Server Actions use the shared wrapper, header audits verify `x-correlation-id` and `Idempotency-Key`, DTO drift checks compare transport payloads to SRM-defined schemas, and integration tests confirm audit rows plus idempotency persistence.
- **Lint rules** encode bespoke invariants (no `ReturnType<>` service interfaces, no cross-context imports, no raw `Error` in `DomainError.details`) so common AI-generated drift is caught mechanically.

**Why this matters:** agent output is judged on runtime contract fidelity as well as correctness, safety, and complexity — not just whether it compiles.

---

## 3. Human-in-the-Loop (HITL)

**Posture:** Humans sit at a fixed set of named gates. The agent does not decide when to ask for approval; the skill definitions do.

Specific HITL surfaces:

- **Six design-phase gates** in the feature pipeline, each requiring explicit approval before the next phase starts.
- **Build pipeline gates** — the complexity pre-screen shows the chosen path and lets the human override it; the Devil's Advocate step can be inspected or bypassed; workstream-level `approval_required` flags pause execution between WS1/WS2/WS3.
- **Intake authority** — the FIB-S (structured intake) is signed off by a human and thereafter treated as immutable scope. Later agents that try to exceed it are blocked.
- **Transport choice is constrained, not improvised** — the edge policy removes a class of discretionary decisions from individual agents by defining up front which client flows must be implemented as Route Handlers versus Server Actions.
- **Pre-commit hooks** (`prevent-destructive.sh`, schema search-path enforcement) prevent certain classes of change from being committed at all without human override.
- **Escalation commands** — `/issue-log`, `/issue-checkpoint`, `/issue-resolve` give the agent a defined way to hand ambiguity back to the operator rather than guess.

**Why this matters:** judgment calls (scope, trade-offs, destructive changes, and even transport selection rules) are surfaced to humans or frozen in policy by design. The agent does not silently decide for you.

---

## 4. Compound AI Systems

**Posture:** Multiple specialized agents, multiple external tool integrations, and a persistent memory layer working together — no single "do-everything" prompt.

Composition visible in the system:

- **Specialist skill roster** — `lead-architect`, `backend-service-builder`, `api-builder`, `prd-writer`, `rls-expert`, `e2e-testing`, `qa-specialist`, `performance-engineer`, `devops-pt2`, `devils-advocate`, `frontend-design-pt-2`, `scrum-master`, `theme-factory`, plus Vercel/Sentry plugin skills. Each resolves a domain bottleneck instead of packing everything into a general agent.
- **MCP servers wired in** — Vercel (deployment, env, storage), Sentry (production errors), filesystem, Chrome DevTools (browser automation), sequential-thinking, Context7 (library docs). These provide tool access the base model does not have.
- **Memori engine** — cross-session memory with a four-tier namespace (permanent / architectural decisions / project state / short-TTL session backend). `/memory-recall`, `/arch-memory`, `/mvp-status`, `/memori-status`, `/memori-cleanup` commands query and maintain it.
- **Three-layer context architecture** addresses “lost in the middle” directly: static context files capture durable project rules, skills carry domain-specific memory, and Memori/session infrastructure persists learnings, session events, and workflow state across long-running work.
- **Retrieval surfaces** — the Service Responsibility Matrix, DTO Catalog, ADR index, and now the edge transport policy act as the authoritative knowledge base agents read before acting. This is the RAG layer, grounded in the project's own governance artifacts rather than generic docs.
- **Compaction and handoff protocols** prevent long sessions from degrading into prompt archaeology: sliding windows, token-budget summarization, checkpoint summaries at validation gates, and session-handoff workflows preserve the state an incoming agent actually needs.
- **Shared runtime middleware** turns separate generated surfaces into one compound execution path: auth, RLS context, idempotency, audit, tracing, and realtime gating are treated as platform capabilities that multiple agent-authored entry points reuse.

**Why this matters:** the work of a single feature routinely involves a specification agent, an adversarial reviewer, a builder, a QA agent, memory recall, context compaction/handoff, and shared runtime enforcement — coordinated, not chained by hand.

---

## 5. Observability & Traceability

**Posture:** Every agent action is recoverable and every non-trivial decision has a durable trail.

The audit surface:

- **Per-skill checkpoint system** — `/arch-checkpoint`, `/backend-checkpoint`, `/api-checkpoint`, `/frontend-checkpoint`, `/issue-checkpoint`, `/skill-checkpoint`. Each saves current task, decisions, files modified, validation gates passed, open questions, and next steps. The primary role of these JSON checkpoints is operational: resume long-running work after interruption, preserve progress across `/clear` or failed runs, and let a human or agent restart from the first incomplete phase without reconstructing state manually.
- **Cross-session memory index** — `MEMORY.md` serves as a short top-level index, with individual memory files behind it for active work, recent deliveries, feedback, and references. Enables agents to pick up cold without re-explaining context.
- **Validation-gate memory extraction** makes state capture incremental rather than end-loaded: gate passage logs events, updates scratchpad state, and creates memory checkpoints before the next phase begins.
- **ADR trail** — 40+ accepted ADRs under `docs/80-adrs/`, with status, supersession links, and cross-references. Decisions are not lost in PR descriptions.
- **Operational runbooks** (`docs/50-ops/runbooks/`) — covers outbox worker, schema migration, RLS verification, type sync. These are what on-call uses, and they are also what the DevOps agent reads.
- **Transport metadata as trace surface** — the edge policy requires `x-correlation-id` across actions and routes, `Idempotency-Key` on mutations, audit log writes with actor/domain/correlation context, `application_name` propagation into downstream SQL, and tracing metadata that maps domain failures to clean HTTP responses.
- **Session logging and hooks** — `context-init-session.sh` / `context-end-session.sh` bookend sessions; `.memori/session.log` captures activity; `prevent-destructive.sh` records its refusals.

**Why this matters:** when an agent run stalls, fails, or gets interrupted, the system can recover from persisted workflow state instead of starting over; and when an agent makes a surprising decision, you can still trace the checkpoint, the memory it read, the gate where it was compacted, the skill it ran, the middleware chain it passed through, and the correlation ID attached to it.

---

## Overall read

PT-2's agentic architecture is past the prototype stage. It exhibits the properties typically asked of production AI-native systems:

- **Multi-step orchestration** with scoped handoff instead of single prompts.
- **Evaluation** at spec, implementation, and release layers.
- **HITL** at named gates — not ad hoc.
- **Compound composition** — multiple specialist agents + MCP tools + persistent memory.
- **Traceability** via checkpoints, ADRs, memory indices, and transport-level audit/tracing metadata.
- **Runtime policy enforcement** so agent-authored features share one ingress, middleware, and DTO discipline.

It is an operating model, not a set of prompts. That distinction is the one worth leading with when presenting this work externally.
