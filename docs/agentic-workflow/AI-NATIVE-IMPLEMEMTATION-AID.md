
# AI‑Native Implementation Aid (Agentic Primitives + Context Engineering)

**Purpose:** A practical, copy‑pasteable starter you can drop into any repo to build **reliable, repeatable AI workflows** using three layers:
1) Markdown Prompt Engineering → 2) Agent Primitives → 3) Context Engineering → Agentic Workflows.

> Based on the *AI Native Development Guide* core concepts (Markdown Prompt Engineering, **Agent Primitives**, **Context Engineering**, **Agentic Workflows**) and the GitHub Copilot blog’s reliability framework (Oct 2025). Use this as scaffolding; customize to your domain.

---

## AI-Native Development Framework Overview

| Layer | Purpose | Key Deliverables | Governance Hooks |
| --- | --- | --- | --- |
| **Prompt Engineering** | Normalize intent into structured procedures that an assistant can follow repeatably. | Role cards, heading templates, validation gates, option/decision scaffolds. | Prompt linting on `UserPromptSubmit` (see `.claude/hooks/lint-prompt.sh`). |
| **Agent Primitives** | Encode behavior into deterministic files that tools can load (instructions, chat modes, skills). | `.github/instructions/*.instructions.md`, `.github/chatmodes/*.chatmode.md`, `.claude/skills/*/SKILL.md`. | STOP gates before risky actions, folder scopes enforced per chat mode. |
| **Context Engineering** | Assemble the right mix of instructions + memories for each path in the repo. | Hierarchical `AGENTS.md`, context packs under `context/*.context.md`, memory snapshots. | `scripts/compile_agents.mjs` + `npm run agents:check` to prevent drift. |
| **Agentic Workflows** | String primitives together into end-to-end flows with human approvals and telemetry. | `.github/prompts/*.prompt.md`, `.agent/last-plan.json`, approval log, tool usage log. | Post-tool hooks run lint/type/tests; approvals captured in `.agent/approval.log`. |

**Feedback Loop**
- **Plan → Execute → Verify → Capture lessons**: Every workflow begins with a patch plan, pauses for approval, runs automated checks, then writes back to `memory/*.memory.md`.
- **Telemetry**: `.claude/hooks/log-shell-command.sh` and `require-approval.sh` ensure shell usage + approvals are auditable.
- **Doc Sync**: Skills such as `docs-sync` keep SRM, ADRs, and memory stubs aligned (see `.claude/skills/docs-sync/SKILL.md`).

---

## Use Case Overview

| Use Case | Trigger | Workflow | Outputs | Notes |
| --- | --- | --- | --- | --- |
| **Implement from Spec** | Approved feature spec with clear acceptance criteria. | `.github/prompts/implement-from-spec.prompt.md` + backend/frontend chat modes. | PatchPlan JSON, staged diffs, updated docs & memories. | STOP gate before file edits; run lint/type/test post-write. |
| **Debug and Propose** | Incident, regression, or failing test needing triage. | `.github/prompts/debug-and-propose.prompt.md` with relevant instructions (security, backend). | Markdown report containing Summary, RootCause, Options, Recommendation, ValidationPlan. | Requires human approval before remediation code is generated. |
| **Refactor Safely** | Tech debt or performance improvements without behavior change. | `.github/prompts/refactor.prompt.md` to produce phased PatchPlan with rollback steps. | Structured refactor plan, diff previews, regression test checklist. | STOP if coverage gaps appear; propose mitigation. |
| **RLS Audit Skill** | Security review of Supabase row-level policies. | `.claude/skills/rls-audit/SKILL.md` invoked via Skill tool. | Audit summary referencing `SEC-001`, list of policy gaps, remediation steps. | Ensures casino scoping and role alignment stay intact. |
| **Docs Sync Skill** | Architecture docs updated or SRM drift suspected. | `.claude/skills/docs-sync/SKILL.md` + doc automation scripts. | Validation logs (`npm run validate:matrix-schema`, `validate-adr-sync`), refreshed compressed memories. | Use before major releases or after schema changes to avoid documentation drift. |
| **Agent Context Guard (CI)** | Pull request or nightly pipeline. | `npm run agents:check` + hooks dry-run. | CI signal ensuring `AGENTS.md` is current and hooks emit telemetry. | Planned addition to `agent-context-guard` job for continuous enforcement. |

Use these as building blocks: start with the high-level workflow, load the correct chat mode (frontend, backend, reviewer), then let the hooks enforce STOP gates, linting, and audit trails.

---

## Example Workflow — Implement Feature from Spec

1. **Load Context**  
   - Launch the assistant with `--agents ./AGENTS.md` and `--prompt-template ./.github/prompts/implement-from-spec.prompt.md`, selecting the appropriate chat mode (e.g., `.github/chatmodes/backend-dev.chatmode.md`).  
   - The prompt is linted by `.claude/hooks/lint-prompt.sh`, enforcing headings, bullet lists, and STOP gates.
2. **Summarize Spec & Draft Plan**  
   - Assistant digests `specs/<feature>.spec.md`, then emits a PatchPlan enumerating each file and intent (stored in `.agent/last-plan.json`).  
   - Plan references SRM responsibilities and highlights docs/tests to touch.
3. **Approval Gate**  
   - Human reviewer inspects the plan; if satisfied, they log `APPROVED: Reviewer Name @ 2025-11-04T18:30Z` in `.agent/approval.log`.  
   - Without the entry, `.claude/hooks/require-approval.sh` blocks any write/edit tool invocation.
4. **Apply Changes**  
   - Assistant generates diffs honoring instructions (security/backend/testing).  
   - If new primitives were added, run `npm run agents:compile` so `AGENTS.md` stays in sync.
5. **Post-Write Checks**  
   - Shell commands are recorded by `.claude/hooks/log-shell-command.sh`, while `.claude/hooks/prevent-destructive.sh` guards against `git reset --hard` and similar.  
   - `.claude/hooks/format-and-test.sh` runs `npm run lint:check`, `npm run type-check`, and `npm run test` (or coverage) to satisfy QA gates.
6. **Docs & Memory Updates**  
   - Update relevant docs (e.g., `docs/25-api-data/...`, `docs/30-security/...`) and append lessons to `memory/project.memory.md` or domain memories.  
   - Trigger `docs-sync` Skill when SRM or ADR changes require validation.
7. **Telemetry Review & Merge Prep**  
   - `.agent/tool-usage.log` and `.agent/approval.log` accompany the PR for audit.  
   - CI `agent-context-guard` job (planned) runs `npm run agents:check` ensuring context files remain canonical.

---

## 0) Repository Scaffold (drop‑in)

```
.github/
  instructions/
    security.instructions.md
    frontend.instructions.md
    backend.instructions.md
    testing.instructions.md
  chatmodes/
    backend-dev.chatmode.md
    frontend-dev.chatmode.md
    reviewer.chatmode.md
  prompts/
    implement-from-spec.prompt.md
    debug-and-propose.prompt.md
    refactor.prompt.md
  specs/
    feature.spec.md            # template instance per feature
  context/
    api-security.context.md
    db.context.md
  memory/
    project.memory.md
AGENTS.md                      # compiled & hierarchical (see §4)
docs/
  ai-native/README.md
```

Minimal starter (commit these files even if empty): `.github/instructions/`, `.github/chatmodes/`, `.github/prompts/`, `.github/context/`, `.github/memory/`, `.github/specs/`, and a root `AGENTS.md`.

---

## 1) Layer 1 — Markdown Prompt Engineering (the **foundation**)

**Goals**
- Transform vague tasks into **structured procedures**.
- Use **headers, lists, and roles** to guide the model’s reasoning.
- Add **validation gates** (“stop and ask before applying changes”).

**Snippet: “expert role + steps + gates”**

```md
You are an expert **{role}** working in this repository.
Project context: see [Architecture Overview](./docs/architecture.md).

**Do:**
1. Clarify intent and constraints in 3 bullets.
2. Propose 2–3 options with trade‑offs (perf, complexity, security).
3. Select the best option given constraints; justify briefly.
4. Produce changes: show diff blocks or file paths + code blocks.
5. **Stop** and request human approval before writing files.

**Don’t:**
- Change public APIs without a deprecation note.
- Introduce new dependencies without listing impact and license.
```

---

## 2) Layer 2 — Agent **Primitives** (the **implementation**)

Define small, composable files that the tooling can load deterministically.

### 2.1 Instructions Files (`*.instructions.md`)

```md
# security.instructions.md
applyTo: ["**/*"]
scope: "repository"
rules:
- Prefer constant‑time comparisons for secrets.
- Don’t log credentials or tokens.
- Enforce input validation (zod / schema at boundaries).
- Add idempotency keys to all write workflows.
validation:
- For each changed file, list: inputs validated? outputs sanitized? secrets touched?
```

```md
# frontend.instructions.md
applyTo: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"]
rules:
- React 19 conventions; avoid prop‑drilling; colocation; server actions via wrappers.
- Use React Query for server data; Zustand for ephemeral UI state.
- Tailwind utility‑first; no inline styles unless dynamic.
- Accessibility: focus order, labels, keyboard nav.
```

### 2.2 Chat Modes (`*.chatmode.md`)

```md
# backend-dev.chatmode.md
role: "Senior Backend Engineer"
allowedTools:
- shell.exec
- git
- db.sql
constraints:
- Never run destructive SQL without explicit --confirm flag in prompt.
- Stay within backend paths: "services/**", "db/**"
```

### 2.3 Agentic Workflows (`*.prompt.md`)

```md
# implement-from-spec.prompt.md
intent: "Implement feature exactly as per spec"
entrypoint:
- Load nearest AGENTS.md, then load spec at ./specs/{feature}.spec.md
steps:
1) Parse acceptance criteria → generate tasks with owners & estimates.
2) Produce a patch plan (files, diffs).
3) Generate code in staged diffs.
4) Run checks: typecheck, lint, unit tests.
5) Stop for approval.
```

### 2.4 Specifications (`*.spec.md`)

```md
# feature.spec.md (template)
Title: <Feature name>
Objective: <1–2 sentences>
Scope: In / Out
Non‑functional: Perf, Security, Observability
Acceptance Criteria:
- [ ] Given/When/Then …
- [ ] Telemetry emitted: events, fields
Interfaces / DTOs:
```ts
type Request = { id: string; /* … */ }
type Response = { ok: boolean; /* … */ }
```
Risks & Rollback:
```

### 2.5 Agent Memory (`*.memory.md`)

```md
# project.memory.md
Decisions:
- 2025‑10‑20: Adopt SRM v3.0.2; schema mirrors matrix (lower_snake_case).
Patterns that worked:
- Vertical slice: service wrapper + query key standard.
Pitfalls:
- Over‑memoization with no effect; prop‑drilling.
```

### 2.6 Context Helpers (`*.context.md`)

```md
# api-security.context.md
JWT: algs, rotation, TTLs
API: rate limits, idempotency, pagination
RLS: policy patterns & examples
```

---

## 3) Layer 3 — **Context Engineering** (the **optimizer**)

**Principles**
- **Hierarchical discovery**: Agents load the nearest `AGENTS.md` up the tree.
- **Session splitting**: separate sessions for plan → implement → test.
- **Modular loading**: `applyTo` patterns ensure only relevant rules load.
- **Memory‑driven development**: persist lessons to `*.memory.md`.

**Project‑level `AGENTS.md` (compiled)**

```md
# AGENTS.md (root)
Inherit: none
AppliesTo: repository
Includes:
- .github/instructions/security.instructions.md
- .github/instructions/frontend.instructions.md
- .github/instructions/backend.instructions.md
- .github/chatmodes/*
- context/*.context.md
Memory:
- memory/project.memory.md
```

**Folder‑level `AGENTS.md` (e.g., `frontend/AGENTS.md`)**

```md
# AGENTS.md (frontend)
Inherit: "../../AGENTS.md"
AppliesTo: ["app/**/*", "components/**/*"]
Includes:
- .github/instructions/frontend.instructions.md
```

> Tip: Use a small script or CLI to **compile** instructions → hierarchical `AGENTS.md` so your context works across agents (IDE, CLI, async runners).

---

## 4) Agentic **Workflows** (end‑to‑end)

**Example: “Secure Auth Feature”**

1. Select chat mode: `backend-dev.chatmode.md`.
2. Load instructions: security + backend.
3. Load context: `api-security.context.md`, `db.context.md`.
4. Execute workflow: `implement-from-spec.prompt.md` with `specs/auth-login.spec.md`.
5. Human gate: approval before write.
6. Memory update: add lessons to `project.memory.md`.

---

## 5) Governance: Human Validation Gates

Insert **STOP** gates at risky steps:
- Creating migrations / RLS policies.
- Rotating secrets.
- Changing public APIs or schema.
- Mass refactors.

**Gate template**

```md
GATE: STOP & REVIEW
Show: risks, rollback, blast radius, diff summary, test plan.
Proceed only with: "APPROVED: <name> @ <time>"
```

---

## 6) Reliability Patterns (battle‑tested)

- **Deterministic inputs**: Every workflow takes an explicit spec or form.
- **Idempotency**: include idempotency keys & natural keys for writes.
- **Schema‑first**: generate types from DB; no hand‑rolled table types.
- **Separation of concerns**: Chat modes constrain tool use & folders.
- **Observability**: every workflow emits events (started/succeeded/failed) with correlation IDs.

---

## 7) Structured Output (JSON Schema) — quick starter

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PatchPlan",
  "type": "object",
  "properties": {
    "tasks": { "type": "array", "items": { "type": "string" } },
    "files": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "diff": { "type": "string" }
        },
        "required": ["path","diff"]
      }
    }
  },
  "required": ["tasks","files"]
}
```

Prompt addition:

```
Return ONLY valid JSON conforming to PatchPlan. If invalid, self‑repair.
```

---

## 8) CLI / Local Execution (example)

> Works with any agent CLI that can read AGENTS.md, run prompts, and enforce stop‑gates.

```bash
# Plan from spec, dry run:
agent run .github/prompts/implement-from-spec.prompt.md   --spec specs/auth-login.spec.md   --mode .github/chatmodes/backend-dev.chatmode.md   --dry-run

# After approval, apply patch:
agent apply --plan ./.agent/last-plan.json
```

---

## 9) Team‑Scale Adoption (checklist)

- [ ] Create the scaffold in every repo (or a repo template).
- [ ] Define 2–3 **chat modes** that match your team’s roles.
- [ ] Author 3–5 **instructions** files (security, frontend, backend, testing, docs).
- [ ] Write 2–3 **workflows** (`*.prompt.md`) with stop‑gates.
- [ ] Add 1 **memory** file and start logging decisions.
- [ ] Set success metrics (lead time, MTTR, review rework rate).
- [ ] Quarterly **context hygiene** review: prune rules, consolidate memory.
- [ ] Add a CI check: `AGENTS.md` must be present and non‑empty at repo root.

---

## 10) Ready‑to‑Use Templates (copy/paste)

<details>
<summary><strong>reviewer.chatmode.md</strong></summary>

```md
role: "Staff+ Code Reviewer"
allowedTools: []
constraints:
- Read‑only. Never write files.
- Output only review notes (bullets + code blocks).
style:
- Concise bullets, cite files/lines, propose exact diffs.
```
</details>

<details>
<summary><strong>debug-and-propose.prompt.md</strong></summary>

```md
intent: "Diagnose a bug and propose safe fixes"
steps:
1) Summarize the observed failure.
2) Locate the fault (files/lines).
3) Propose 2–3 fixes with trade‑offs.
4) Recommend one fix, justify.
5) STOP for approval.
6) After approval, generate diffs only.
```
</details>

<details>
<summary><strong>testing.instructions.md</strong></summary>

```md
applyTo: ["**/*"]
rules:
- Unit tests for pure logic (>=80% lines).
- Contract tests on server actions.
- Snapshot tests for UI components with stable props.
- Include seed data + fixtures for edge cases.
```
</details>

---

## 11) Integration Notes for Web Apps (Next.js + Supabase)

- Server actions expose typed adapters; React Query wraps client consumption.
- Store domain rules in `.instructions.md` (frontend/backend/testing).
- RLS examples and DB access patterns live in `db.context.md`.
- Emit telemetry from workflows to correlate PRs ↔ deployments.

---

## 12) Maintenance Cadence

- Weekly: update memory; prune stale context.
- Monthly: audit instructions vs “what actually shipped.”
- Quarterly: refactor workflows; update stop‑gates; revisit metrics.

---

### Appendix A: Minimal File Stubs

```md
# .github/instructions/backend.instructions.md
applyTo: ["services/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"]
rules: [ "Prefer composable server actions", "Use DTO types from DB generator" ]
```

```md
# memory/project.memory.md
Decisions: []
Patterns that worked: []
Pitfalls: []
```

```md
# AGENTS.md
Includes: [".github/instructions/backend.instructions.md"]
```

---

**You’re set.** Commit the scaffold, start with one workflow (`implement-from-spec`), and evolve from there. Reliability comes from the ritual: specs → prompts → gates → memory.
