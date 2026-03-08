# PT-ARCH-MAP — Directory Index

Architecture investigation, reality assessment, and hardening plan for PT-2.

## Reading Order

Start here and follow the sequence — each document builds on the previous.

| # | Document | Purpose |
|---|----------|---------|
| 1 | [Investigation Brief](pt_architecture_investigation_brief.md) | Investigation charter — defines the questions, scope, and methodology |
| 2 | [Architecture Reality Report](PT_ARCHITECTURE_REALITY_REPORT.md) | Findings — 6-agent assessment of how PT-2 actually works vs. governance docs |
| 3 | [Hardening Direction Plan](pt2-hardening-direction-plan.md) | Strategy — converts report findings into 5 tightening areas |
| 4 | [Hardening Direction Plan (scope-aligned)](pt2-hardening-direction-plan%28scope-aligned%29.md) | Refined strategy — same plan scoped to current constraints |
| 5 | [Initial Slice Alignment Assessment](pt-initial-slice-alignment-assessment.md) | Validation — confirms chosen slices align with the global strategy |
| 6 | [Standards Foundation](STANDARDS-FOUNDATION.md) | Execution plan — direction & slicing for Hardening Area 1 (Surface Policy) |
| 7 | [Initiation Plan — Merge Strategy](INITIATION-PLAN-MERGE-STRATEGY.md) | Operational protocol — worktree rules, sequential merge, slice coordination |
| 8 | [Hardening Slice Manifest](HARDENING-SLICE-MANIFEST.md) | Tracker — cross-slice status, artifacts produced, amendments |

## Document Flow

```
Investigation Brief          (what to investigate)
  └── Architecture Reality Report   (what was found)
        └── Hardening Direction Plan        (what to do about it)
              └── Hardening Direction Plan (scope-aligned)  (scoped to constraints)
                    ├── Initial Slice Alignment Assessment  (validates slice choices)
                    └── Standards Foundation                (Area 1 execution plan)
                          ├── Initiation Plan — Merge Strategy  (how slices ship)
                          └── Hardening Slice Manifest          (progress tracker)
```

## Supporting Artifacts

The `../strategic-hardening/` directory contains the catalyst documents that led to this hardening effort:

| Document | Purpose |
|----------|---------|
| [ADR-039 Measurement Layer — Précis](../strategic-hardening/ADR-039%20Measurement%20Layer%20—%20Overview%20Précis.md) | What was built — 5 migrations, theo columns, audit correlation view, rating coverage view |
| [ADR-039 Metric Provenance Matrix Plan](../strategic-hardening/adr-039-metric-provenance-matrix-plan.md) | ADR-039-scoped plan — ensures each measurement is defined, traceable, and defensible |
| [Cross-Surface Metric Provenance Governance](../strategic-hardening/pt-cross-surface-metric-provenance-governance-plan.md) | Expanded governance — truth classification, provenance matrix, freshness standards across all surfaces |

These form a telescoping scope chain:

```
ADR-039 Précis (what was built — infrastructure, no UI)
  └── Metric Provenance Matrix Plan (ADR-039-scoped governance)
        └── Cross-Surface Provenance Governance (all surfaces, all truth classes)
              └── Hardening Direction Plan (umbrella: 5 areas — this directory)
```

## Key Conclusions

- **Architecture is sound** — strong service boundaries, bounded contexts, RLS/security, and ingestion
- **Hardening, not rewrite** — weaknesses are in runtime discipline, not structural design
- **Five tightening areas**: rendering/surface policy, observability, release confidence, caching/runtime standards, operational edge spots
- **Four execution slices**: standards foundation → measurement UI → shift provenance → pit refactor
