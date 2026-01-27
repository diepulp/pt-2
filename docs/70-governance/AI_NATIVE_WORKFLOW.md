---
id: GOV-120
title: AI-Native Agentic Workflow Framework
owner: Engineering Enablement
status: Draft
affects: [SEC-001, QA-001, ARCH-SRM]
created: 2025-11-02
last_review: 2025-11-02
---

## Purpose

Define the repository-standard scaffold for agent-assisted development so any LLM-enabled CLI (Claude, Codex, etc.) can follow the same instructions, chat modes, and workflows. This document is the source of truth for the framework outlined in `docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md` and anchors it within the SDLC taxonomy.

## Directory Scaffold

```
.github/
  instructions/        # SDLC-aligned guardrails (SEC, ARCH, PRD, QA)
  chatmodes/           # Role prompts mapping to team responsibilities
  prompts/             # End-to-end workflows with stop-gates
context/               # Domain-specific quick references
memory/                # Institutional knowledge snapshots
specs/                 # Feature spec templates (PRD alignment)
AGENTS.md              # Hierarchical context entrypoint
```

Each file is format-agnostic and can be consumed by any compliant agent CLI.

## Instruction Sets (Layer 1)

| File | SDLC Group | Highlights |
| --- | --- | --- |
| `.github/instructions/security.instructions.md` | SEC/RBAC | Enforces RLS/RBAC alignment with `SEC-001..003`. |
| `.github/instructions/backend.instructions.md` | ARCH + API/DATA | Mirrors SRM ownership, Supabase typing, telemetry expectations. |
| `.github/instructions/frontend.instructions.md` | PRD + GOV | References frontend standards, accessibility, and PRD traceability. |
| `.github/instructions/testing.instructions.md` | DEL/QA | Encodes coverage targets, integration tags, and fixtures policy. |

## Chat Modes (Layer 2)

- `backend-dev.chatmode.md`: Senior backend engineer scope; enforces safe tool usage and RLS gates.
- `frontend-dev.chatmode.md`: Staff frontend engineer; focuses on accessibility and UI contract safety.
- `reviewer.chatmode.md`: Read-only reviewer enforcing SDLC references in feedback.

These modes are LLM-neutral; any assistant that reads YAML/Markdown can apply them.

## Workflows (Layer 3)

- `implement-from-spec.prompt.md`: Drives feature delivery with PatchPlan JSON, documents taxonomy mapping, and STOP gates.
- `debug-and-propose.prompt.md`: Structured remediation flow identifying impacts across SEC/QA/ARCH.
- `refactor.prompt.md`: Behavior-preserving refactor plan with rollback coverage.

Each workflow mandates human approval before edits, fulfilling governance requirements from §5 of the implementation aid.

## Branch Protection & Review Flow

- `main` is protected: no direct pushes; all changes go through PRs.
- PRs are opened from `agent/*` or `feature/*` branches and require Code Owner review.
- Required checks: `npm run lint`, `npm run type-check`, `npm test` (GitHub Actions).
- Merge is allowed only after Code Owner approval and passing checks.

## Context & Memory

- `context/api-security.context.md`: Collates JWT, rate limits, RLS, and audit expectations.
- `context/db.context.md`: Summarizes migration rules, integrity checks, and SRM mappings.
- `memory/project.memory.md`: Logs strategic decisions, patterns, pitfalls, and next actions.

## Hierarchical Loading

`AGENTS.md` lists the canonical instruction/chatmode/prompt/context files. Subdirectories may add their own `AGENTS.md` inheriting this configuration. Tools should load the nearest `AGENTS.md` upward, ensuring deterministic context regardless of LLM provider.

## Adoption Checklist

- [x] Directories scaffolded under `.github/`, `context/`, `memory/`, `specs/`.
- [x] Instruction, chat mode, and prompt templates committed with SDLC references.
- [x] Root `AGENTS.md` enumerates canonical resources for CLI and IDE agents.
- [ ] Define CODEOWNERS for domain surfaces (e.g., `components/player-360/**`).
- [ ] Protect `main` branch; require PRs, Code Owner review, and CI checks.
- [ ] Add CI workflow running lint, type-check, and tests on PRs.
- [ ] Implement automation to compile AGENTS hierarchy and validate presence.
- [ ] Restore `.claude/memory` parity and map to the new `memory/` directory.
- [ ] Define CLI presets (Claude/Codex) that point to these artifacts.

## Maintenance Cadence

- Weekly: update memory entries and prune obsolete instructions.
- Monthly: audit prompts vs. shipping workflows; adjust stop-gates.
- Quarterly: review alignment with SDLC taxonomy and regenerate documentation backlinks.

## Related References

- docs/patterns/SDLC_DOCS_TAXONOMY.md
- docs/agentic-workflow/AI-NATIVE-IMPLEMEMTATION-AID.md
- docs/30-security/README.md
- docs/40-quality/README.md
