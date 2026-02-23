---
id: GOV-010
title: Feature Development Gate — Document Pipeline
owner: Engineering
status: Accepted
date: 2026-02-22
affects: [PRD, ADR, EXEC-SPEC]
---

# Feature Development Gate

## Purpose

Prevent PRD rot by enforcing a document pipeline where decisions live in ADRs (small, stable), PRDs stay focused on *what must be true*, and exec specs stay focused on *how we build it this time*.

## The Gate Rule

**No PRD or Exec Spec may be written until:**

1. **Feature Scaffold exists** (`docs/01-scaffolds/SCAFFOLD-###-<slug>.md`)
   - Or is explicitly waived for trivial changes (< 1 day, single-file, no mechanism decisions)

2. **Design Brief / RFC exists** (`docs/02-design/RFC-###-<slug>.md`)
   - Or is explicitly waived for changes where a single obvious approach exists

3. **ADR(s) exist for any irreversible or mechanism-level decision** (`docs/80-adrs/ADR-###-<slug>.md`)
   - Required whenever the feature involves choosing between libraries, parsing strategies, integration patterns, data model approaches, or security posture changes
   - ADRs are the stable anchors; later changes create "superseded by ADR-XXX" records instead of rewriting PRDs

## Document Pipeline

```
Stage 0: Feature Scaffold     docs/01-scaffolds/    30-60 min, disposable
    |
Stage 1: Design Brief / RFC   docs/02-design/       Propose direction + alternatives
    |
Stage 2: ADR(s)               docs/80-adrs/         Lock one decision per ADR
    |
Stage 3: PRD                  docs/10-prd/          Requirements only, references ADRs
    |
Stage 4: Exec Spec            docs/21-exec-spec/    Implementation details, allowed to churn
```

## PRD Discipline

A PRD should focus on:
- User outcomes and flows
- Constraints (RLS/tenancy, auditability, conflict handling, idempotency)
- Acceptance criteria and reportability
- Non-goals and phased roadmap

A PRD should NOT:
- Hardcode mechanism choices (parser library, vendor SaaS, integration pattern) unless locked by ADR

**Rule of thumb:** If changing a library would require rewriting the PRD, the PRD is doing the ADR's job.

## When to Pivot

When a mechanism decision changes:
1. Supersede the original ADR with a new ADR (e.g., ADR-036 superseded by ADR-042)
2. Update the Exec Spec (expected — this is where "how" lives)
3. PRD remains mostly intact (it describes *what*, not *how*)

## Waiver

For trivial changes (bug fixes, copy changes, config tweaks), the gate can be skipped. Document the waiver in the PR description:

> **Gate waiver:** Trivial change — no scaffold/RFC/ADR required. Reason: <brief>.

## Pipeline Commands

| Command | Pipeline | Purpose |
|---------|----------|---------|
| `/feature <name>` | feature-pipeline | Start/resume design-time pipeline (Phases 0-5) |
| `/feature-status` | feature-pipeline | Read-only status display |
| `/build <input>` | build-pipeline | Start build-time pipeline from PRD or EXEC-SPEC |

See GOV-012 (`docs/70-governance/PIPELINE-CONSOLIDATION-SPEC.md`) for full pipeline specification.

## References

- Pipeline consolidation: `docs/70-governance/PIPELINE-CONSOLIDATION-SPEC.md` (GOV-012)
- Process playbook: `docs/70-governance/WORKFLOW-OPTIMIZATION-SCAFFOLD-RFC-ADR-PRD-EXEC.md`
- ADR concept: https://adr.github.io/
- Design docs at Google: https://www.industrialempathy.com/posts/design-docs-at-google/
