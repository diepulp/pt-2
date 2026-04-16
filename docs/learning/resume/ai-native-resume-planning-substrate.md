# AI-Native Resume Planning Substrate  
**Target alignment:** Remitly — AI-Native Software Engineer  
**Date:** 2026-04-10

## Purpose

This document is a **planning substrate**, not the resume itself. Its purpose is to capture the competency mapping between the current PT-2 AI-native configuration posture, the five CCA Foundations competency domains, and the target expectations implied by the Remitly AI-Native Software Engineer posting.

The intended downstream use is to scaffold:
- an AI-native resume summary,
- targeted experience bullets,
- and supporting prose for cover-letter or portfolio positioning.

---

## Executive read

The current PT-2 AI-native posture is a strong match for the role because the target posting is not asking for superficial “AI app” experience. It is asking for someone who can:

- direct AI agents to build end-to-end products,
- translate messy requirements into executable specifications,
- evaluate generated output for quality, security, and reliability,
- instrument outcomes,
- and document reusable patterns.

That maps closely to the PT-2 operating model already established through:
- AI-native delivery pipelines,
- specialist skill routing,
- governance hooks,
- structured specs,
- adversarial review,
- and persistent memory/context systems.

The main strategic caution is rhetorical rather than technical: the resume must not present the work as abstract framework-building for its own sake. It should present the system as **an AI-native product delivery mechanism used to ship software faster, more consistently, and with stronger quality controls**.

---

## High-level match to the target role

The job signal appears to screen for five practical capabilities:

1. **AI-agent operator, not casual user**  
   The role expects direct use of AI agents as the primary software production mechanism.

2. **Problem-to-spec translation**  
   The role values engineers who can convert ambiguity, customer need, or internal product requirements into concrete build instructions.

3. **Judgment over generated output**  
   The role expects critical evaluation of AI-produced code and artifacts for correctness, security, privacy, and robustness.

4. **Instrumentation and iteration**  
   The role is not limited to generation; it expects the engineer to observe results and improve the system based on actual outcomes.

5. **Documentation of patterns and prompts**  
   The role values codifying what works so the organization can repeat it.

The current PT-2 posture aligns well to all five.

---

## CCA domain map

| CCA domain | Current PT-2 evidence | Fit to role | Resume emphasis |
|---|---|---|---|
| **D1 — Agentic Architecture & Orchestration** | `/feature` and `/build` orchestrate work across specialist skills; multi-agent adversarial review teams; checkpoint-resume behavior | Very high | Emphasize orchestration of AI agents across design, implementation, review, and execution |
| **D2 — Tool Design & MCP Integration** | MCP server stack, plugin surfaces, hook-based tool boundaries, internal memory/query surfaces | High | Emphasize bounded tool surfaces and agent access to docs, data, tests, deployment, and system context |
| **D3 — Claude Code Configuration & Workflows** | `CLAUDE.md`, skills catalog, slash commands, lifecycle hooks, expert routing, governance gates | Extremely high | Emphasize operationalization of Claude Code into a governed production workflow |
| **D4 — Prompt Engineering & Structured Output** | FIB, PRD, EXEC-SPEC, structured review rubrics, validation loops, machine-readable outputs | Very high | Emphasize translation of ambiguous needs into validated structured artifacts that AI can execute |
| **D5 — Context Management & Reliability** | Memori engine, cross-session recall, checkpoint persistence, tiered retention, resumable workstreams | High | Emphasize continuity, context integrity, and reduced drift across long-running AI-assisted work |

---

## Domain-by-domain planning notes

### D1 — Agentic Architecture & Orchestration

This is one of the strongest alignment areas.

PT-2 already demonstrates:
- a two-pipeline model separating design from execution,
- delegation to bounded specialist skills instead of a single generalist agent,
- adversarial review teams with tiered escalation,
- and resumable orchestration across long-running workflows.

This maps directly to the target role’s expectation that the engineer **direct AI agents to build products** rather than merely use them for isolated coding assistance.

**Resume translation angle:**
- Orchestrated AI agents across planning, implementation, quality review, and execution.
- Built workflows where agents handled specialized responsibilities under explicit governance rather than acting as unbounded assistants.

**Risk to avoid in prose:**
Do not overstate this as abstract “multi-agent research.” Keep it grounded in product delivery and execution outcomes.

---

### D2 — Tool Design & MCP Integration

This is a solid supporting domain.

PT-2 includes:
- MCP-connected tool surfaces for docs, reasoning, web research, browser automation, deployment, and database operations,
- plugin usage,
- and hooks that act as tool governance boundaries.

Memori also functions as an internal structured knowledge surface rather than raw document scraping, which is a strong AI-native design signal.

**Resume translation angle:**
- Designed agent-accessible tool surfaces so AI workflows could operate directly on code, documentation, operational context, tests, and deployment systems.
- Reduced prompt-copy sprawl by exposing structured system surfaces instead of relying on repeated manual context injection.

**Risk to avoid in prose:**
Do not disappear into jargon like “MCP-native substrate” unless the audience is known to care. The business translation is better: agents could act on the real system safely and consistently.

---

### D3 — Claude Code Configuration & Workflows

This is arguably the clearest and strongest practical alignment.

PT-2 already contains:
- a strong `CLAUDE.md` behavioral contract,
- a skill catalog,
- slash command workflow surfaces,
- lifecycle hooks,
- pre-tool and post-tool enforcement,
- prompt quality gates,
- and expert-routing rules.

This is exactly the kind of evidence that proves the user did not just “use Claude,” but actually **configured and governed it as an engineering system**.

**Resume translation angle:**
- Operationalized Claude Code through hooks, skills, command surfaces, validation routines, and workflow policies.
- Built governed AI-assisted delivery flows that standardized quality, memory persistence, formatting, testing, and review behavior.

**Risk to avoid in prose:**
Do not let this read like a hobbyist prompt-tinkering setup. It should read like workflow engineering.

---

### D4 — Prompt Engineering & Structured Output

This domain is also strong, especially for a role that values turning needs into buildable specs.

PT-2 already demonstrates:
- structured intake artifacts,
- PRD standards,
- execution specs,
- validation loops,
- reasoning-budget allocation,
- and machine-readable intermediates.

This matters because many engineers claim prompt skill while still relying on improvised, fragile instructions. PT-2 instead uses **structured prompt-to-artifact translation**.

**Resume translation angle:**
- Turned ambiguous operational requirements into structured, validated artifacts that AI agents could execute reliably.
- Increased output reliability through schema-like document discipline, validation loops, and execution-ready specifications.

**Risk to avoid in prose:**
Avoid making this sound academic. The benefit is delivery reliability, lower ambiguity, and better downstream execution.

---

### D5 — Context Management & Reliability

This is the differentiator.

Many candidates can say they used AI coding tools. Far fewer can credibly say they built systems that preserved continuity, reduced context loss, and supported long-running, resumable AI-assisted work.

Memori provides:
- cross-session memory,
- per-skill learning,
- checkpoint persistence,
- semantic recall,
- tiered retention,
- and expiration logic that fails safely away from stale context.

That is a serious reliability story.

**Resume translation angle:**
- Built persistent context and checkpoint systems so AI-assisted workflows remained resumable, consistent, and less prone to drift.
- Reduced session reset costs by creating cross-session memory and structured recall for prior decisions, progress state, and architectural constraints.

**Risk to avoid in prose:**
Do not pitch this as abstract “memory research.” Pitch it as a practical reliability and continuity mechanism.

---

## Strongest positioning for the target role

If the resume is tailored to this posting, the best ordering is:

1. **D1 — Agentic orchestration**
2. **D3 — Claude Code workflow engineering**
3. **D5 — Context reliability / memory**
4. **D4 — Structured prompt/spec discipline**
5. **D2 — Tool-surface design**

Why this order:

- D1 matches the explicit ask to direct AI agents to build products.
- D3 proves the candidate can operationalize AI into a repeatable workflow.
- D5 differentiates the candidate from generic AI-tool users.
- D4 proves requirements translation and output discipline.
- D2 rounds out the system-design credibility.

---

## Strategic framing guidance for the eventual resume

### What to emphasize

Emphasize:
- shipping via agent orchestration,
- converting ambiguous needs into execution-ready artifacts,
- governing AI behavior through hooks, skills, and workflow rules,
- evaluating AI-generated output critically,
- and building continuity systems that make long-running AI workflows reliable.

### What to de-emphasize

De-emphasize:
- certification language as the lead frame,
- abstract framework novelty,
- and purely internal complexity that does not cash out into delivery speed, quality, or reliability.

The resume should not sound like:
> Built a highly elaborate orchestration framework for its own sake.

It should sound like:
> Built an AI-native software delivery system that made product execution faster, more consistent, and easier to govern.

---

## Resume-ready prose substrate

### Summary paragraph candidate

AI-native software engineer building full-stack applications through agent orchestration rather than manual linear coding. Designed a governed delivery system for PT-2 that turns operator problems into structured execution specs, routes work to specialized AI skills, persists cross-session context, and enforces quality through hooks, validation gates, adversarial review, and checkpoint-resumable workflows. Strong across agentic orchestration, Claude Code workflow design, structured prompting, and context reliability, with practical experience shipping AI-assisted systems against real operational constraints.

---

### Targeted bullet bank

- Architected a two-pipeline AI-native SDLC that separated feature design from execution, enabling requirements-to-build handoff through structured artifacts, phase gates, and resumable agent workflows.
- Orchestrated specialized AI skills for architecture, backend services, API design, RLS, QA, performance, and E2E testing instead of relying on a single general-purpose coding agent.
- Operationalized Claude Code through `CLAUDE.md`, slash commands, lifecycle hooks, and validation routines to standardize memory persistence, code generation behavior, formatting, testing, and review.
- Built deterministic workflow governance with pre-tool and post-tool enforcement to block destructive actions, require approvals, and automatically run quality routines after change operations.
- Turned ambiguous operator needs into structured intake, PRD, and execution artifacts that AI systems could implement more reliably and with less downstream ambiguity.
- Designed multi-agent adversarial review workflows that evaluated generated artifacts across security, architecture, implementation completeness, test quality, and performance before execution.
- Built Memori, a cross-session memory engine with tiered retention, semantic recall, checkpoint restore, and per-skill learning to reduce context loss and improve continuity across long-running AI-assisted delivery workflows.
- Created agent-accessible tool and knowledge surfaces spanning code, documentation, browser automation, research, deployment, and system state, reducing manual prompt injection and improving execution consistency.
- Treated AI output as draft implementation requiring governed review, using validation scripts, testing gates, and execution-stage controls to assess correctness, security, and reliability before shipping.

---

## Honest maturity notes

The posture is strong, but the future resume should remain honest about maturity boundaries.

Current known gaps or softer areas include:
- CI/CD integration into the AI workflow layer is not yet fully realized,
- some structured artifacts are governed procedurally rather than by strict machine-enforced schemas,
- and some tool/resource boundary governance remains implicit rather than explicitly codified.

These are not disqualifying weaknesses. They are maturity deltas. If needed, they can be framed as:
- “established production-style local workflow governance, with CI/CD hardening identified as the next maturity step,”
- or
- “combined strong runtime discipline with ongoing investment in machine-enforced schemas and deployment gating.”

---

## Blunt verdict

Yes, the current PT-2 AI-native configuration posture is more than sufficient to support AI-native resume prose aligned to the target role.

The winning story is not:
- “familiar with AI tools,”
- nor “mapped to five certification domains.”

The winning story is:
- built a real delivery system where AI agents were configured, governed, orchestrated, reviewed, and given memory so they could produce useful software against messy operational requirements.

That is the substantive substrate from which the resume should later be scaffolded.

---

## Suggested downstream artifacts

This substrate can now feed the next three resume-planning steps:

1. **Resume scaffold**
   - Summary
   - Experience bullets
   - Skills / tooling strip
   - Selected project section

2. **Targeted cover-letter paragraph**
   - Translate the same positioning into narrative form tied to the posting

3. **Interview story bank**
   - One story each for orchestration, workflow governance, memory/reliability, and structured spec generation

---

## Source basis

This planning substrate was synthesized from:
- the current PT-2 AI-native architecture précis,
- the Memori engine CCA mapping précis,
- and the target Remitly AI-Native Software Engineer posting.

It is intended to remain as a planning artifact prior to resume scaffolding.
