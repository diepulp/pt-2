# PT-2 Agentic Architecture — Systems Posture Overview

**Date:** 2026-04-23
**Purpose:** Non-technical overview of the agentic architecture currently in place on PT-2, organized by the five domains that matter to AI-native engineering roles.
**Scope:** Information / positioning reference. Not a technical spec.

---

## Context in one paragraph

PT-2 (casino pit management system) is built *with* agents, not just *by* humans using agents as assistants. The repository contains a working agentic operating model: specialized skills, phased pipelines, adversarial review, cross-session memory, and checkpoint-based resume. What follows is a plain-language read of that posture against the five domains typically used to evaluate AI-native engineering practice.

---

## 1. Agentic Workflows / Orchestration

**Posture:** Multi-phase pipelines with explicit gates, checkpoint resume, and scoped handoff between specialist agents — not single-prompt interactions.

PT-2 separates design from build. Two distinct pipelines, each with its own gate protocol, move work from vague idea to shippable change:

- **Feature Pipeline** (design-time) — a six-phase flow (ownership → scaffold → design → security → ADR freeze → PRD) that produces *what* and *why* artifacts. Each phase has a gate the human must pass before the next agent runs.
- **Build Pipeline** (execution-time) — accepts a PRD, EXEC-SPEC, or investigation doc and dispatches specialist skills (backend service builder, API builder, RLS expert, QA specialist, DevOps, E2E testing) across isolated workstreams. Includes complexity pre-screen to select a streamlined vs. full path and a single-pass adversarial review step.

Concrete mechanisms visible in the repo:
- 80+ persisted checkpoints under `.claude/skills/build-pipeline/checkpoints/` covering PRDs v030–v067, allowing any workstream to resume after interruption.
- `create-worktree` / `remove-worktree` skills isolate parallel feature branches so agent runs don't collide.
- FIB (Feature Intake Brief) authority chain (FIB-H prose → FIB-S structured) freezes human scope decisions before any agent is allowed to expand them — an "anti-invention" guardrail.

**Why this matters:** the system can execute multi-step work autonomously without losing the plot between steps, and it pauses at the right moments rather than plowing through.

---

## 2. Evaluation Harnesses

**Posture:** Output quality is evaluated at three layers — specification, implementation, and release — with an adversarial reviewer agent as the specification-layer check.

The harness is not a single eval suite; it is a stack:

- **Devil's Advocate skill** runs a structured P0–P3 review against specs (PRDs, ADRs, EXEC-SPECs, migration plans, RLS policies) and is required to verify claims against the actual codebase before filing a finding. It checks tenancy boundaries, authorization, idempotency, concurrency, migration safety, observability, and over-engineering.
- **CI quality gates** (`docs/40-quality/QA-002-quality-gates.md`) enforce pre-commit checks (lint, types, schema regen), PR-level coverage floors (≥80% overall, ≥90% services, 100% DTOs), and release-level performance budgets (LCP, bundle size).
- **Governance standards** encode the rubrics: `OVER_ENGINEERING_GUARDRAIL.md`, `ERROR_HANDLING_STANDARD.md`, `TESTING_GOVERNANCE_STANDARD.md` (ADR-044). These are not documents the agent may ignore; they are referenced in skill definitions and enforced via hooks.
- **Lint rules** encode bespoke invariants (no `ReturnType<>` service interfaces, no cross-context imports, no raw `Error` in `DomainError.details`) so common AI-generated drift is caught mechanically.

**Why this matters:** agent output is judged on correctness, safety, and complexity — not just whether it compiles.

---

## 3. Human-in-the-Loop (HITL)

**Posture:** Humans sit at a fixed set of named gates. The agent does not decide when to ask for approval; the skill definitions do.

Specific HITL surfaces:

- **Six design-phase gates** in the feature pipeline, each requiring explicit approval before the next phase starts.
- **Build pipeline gates** — the complexity pre-screen shows the chosen path and lets the human override it; the Devil's Advocate step can be inspected or bypassed; workstream-level `approval_required` flags pause execution between WS1/WS2/WS3.
- **Intake authority** — the FIB-S (structured intake) is signed off by a human and thereafter treated as immutable scope. Later agents that try to exceed it are blocked.
- **Pre-commit hooks** (`prevent-destructive.sh`, schema search-path enforcement) prevent certain classes of change from being committed at all without human override.
- **Escalation commands** — `/issue-log`, `/issue-checkpoint`, `/issue-resolve` give the agent a defined way to hand ambiguity back to the operator rather than guess.

**Why this matters:** judgment calls (scope, trade-offs, destructive changes) land on the human by design. The agent does not silently decide for you.

---

## 4. Compound AI Systems

**Posture:** Multiple specialized agents, multiple external tool integrations, and a persistent memory layer working together — no single "do-everything" prompt.

Composition visible in the system:

- **Specialist skill roster** — `lead-architect`, `backend-service-builder`, `api-builder`, `prd-writer`, `rls-expert`, `e2e-testing`, `qa-specialist`, `performance-engineer`, `devops-pt2`, `devils-advocate`, `frontend-design-pt-2`, `scrum-master`, `theme-factory`, plus Vercel/Sentry plugin skills. Each resolves a domain bottleneck instead of packing everything into a general agent.
- **MCP servers wired in** — Vercel (deployment, env, storage), Sentry (production errors), filesystem, Chrome DevTools (browser automation), sequential-thinking, Context7 (library docs). These provide tool access the base model does not have.
- **Memori engine** — cross-session memory with a four-tier namespace (permanent / architectural decisions / project state / short-TTL session backend). `/memory-recall`, `/arch-memory`, `/mvp-status`, `/memori-status`, `/memori-cleanup` commands query and maintain it.
- **Retrieval surfaces** — the Service Responsibility Matrix, DTO Catalog, and ADR index act as the authoritative knowledge base agents read before acting. This is the RAG layer, grounded in the project's own governance artifacts rather than generic docs.

**Why this matters:** the work of a single feature routinely involves a specification agent, an adversarial reviewer, a builder, a QA agent, plus memory recall and live tool calls — coordinated, not chained by hand.

---

## 5. Observability & Traceability

**Posture:** Every agent action is recoverable and every non-trivial decision has a durable trail.

The audit surface:

- **Per-skill checkpoint system** — `/arch-checkpoint`, `/backend-checkpoint`, `/api-checkpoint`, `/frontend-checkpoint`, `/issue-checkpoint`, `/skill-checkpoint`. Each saves current task, decisions, files modified, validation gates passed, open questions, and next steps. Any session can be reconstructed from a JSON checkpoint.
- **Cross-session memory index** — `MEMORY.md` serves as a short top-level index, with individual memory files behind it for active work, recent deliveries, feedback, and references. Enables agents to pick up cold without re-explaining context.
- **ADR trail** — 40+ accepted ADRs under `docs/80-adrs/`, with status, supersession links, and cross-references. Decisions are not lost in PR descriptions.
- **Operational runbooks** (`docs/50-ops/runbooks/`) — covers outbox worker, schema migration, RLS verification, type sync. These are what on-call uses, and they are also what the DevOps agent reads.
- **Session logging and hooks** — `context-init-session.sh` / `context-end-session.sh` bookend sessions; `.memori/session.log` captures activity; `prevent-destructive.sh` records its refusals.

**Why this matters:** when an agent makes a surprising decision, you can trace why — the checkpoint, the memory it read, the skill it ran, the ADR it cited.

---

## Overall read

PT-2's agentic architecture is past the prototype stage. It exhibits the properties typically asked of production AI-native systems:

- **Multi-step orchestration** with scoped handoff instead of single prompts.
- **Evaluation** at spec, implementation, and release layers.
- **HITL** at named gates — not ad hoc.
- **Compound composition** — multiple specialist agents + MCP tools + persistent memory.
- **Traceability** via checkpoints, ADRs, and memory indices.

It is an operating model, not a set of prompts. That distinction is the one worth leading with when presenting this work externally.
