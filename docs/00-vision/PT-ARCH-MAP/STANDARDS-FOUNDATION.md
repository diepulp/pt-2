# Standards Foundation — Direction & Slicing Plan

> **Date**: 2026-03-07
> **Type**: Direction artifact (not a PRD — implementation details belong in future EXEC-SPECs)
> **Parent**: PT-2 Hardening Direction Plan (scope-aligned)
> **Scope**: Aligning Hardening Area 1 (Surface Policy) with Cross-Surface Metric Provenance, using ADR-039 measurement UI as the proving ground
> **Validated by**: [Initial Slice Alignment Assessment](pt-initial-slice-alignment-assessment.md)

---

## Artifact Cascade

The strategic documents form a telescoping governance stack:

```
ADR-039 Précis (what was built — infrastructure, no UI)
  └── Metric Provenance Matrix Plan (ADR-039-scoped, superseded)
        └── Cross-Surface Provenance & Truth Governance (all surfaces)
              └── Hardening Direction Plan (umbrella: 5 areas)
```

ADR-039 revealed that building measurement infrastructure is the easy part. The harder problem is **governing truth delivery across surfaces**. The hardening plan then placed that truth governance inside a broader runtime discipline framework.

---

## Current State — The Gap

| Layer | Status |
|---|---|
| ADR-039 database infrastructure | **Complete** — 5 migrations, 2 views, 1 RPC, 2 tables, theo materialization |
| Shift Dashboard V3 | **Complete** — RSC prefetch, BFF summary endpoint, provenance display, trust badges |
| Rating Slip Modal | **Complete** — BFF RPC aggregation (GOV-PAT-003), 5 bounded contexts in 1 call |
| Admin `/reports` page | **Placeholder** — empty "coming soon" shell |
| ADR-039 measurement UI | **Zero** — no components consume the 4 artifacts |
| Surface Classification Standard | **Does not exist** — rendering and data aggregation choices are ad hoc |
| Metric Provenance Matrix | **Does not exist** — no metric has formal provenance declaration |
| Pit Dashboard | **Client shell** — 4+ round trips, no server prefetch |

The gap is structural: the measurement data is live and queryable, multiple surfaces prove that strong patterns exist, but **no standard governs how new surfaces should be built**, and **no provenance matrix governs the truth those surfaces display**.

---

## The Narrowing Insight

Three concerns converge on a single proving ground:

1. **Hardening Area 1** (Surface Policy) needs a standard before more surfaces proliferate.
2. **Cross-Surface Provenance** needs a pilot on real metrics to prove the matrix is practical.
3. **ADR-039 UI** needs to be built — 4 artifacts with no frontend.

**The narrowing**: Build the ADR-039 measurement UI as the **first surface that complies with both standards simultaneously**. Don't build the UI first and retrofit governance later. Establish the lightest viable standards, then use the measurement surface build to prove them.

---

## Proven Pattern Palette

The codebase already contains multiple exemplary patterns. The Surface Classification Standard must recognize all of them as the palette that new surfaces select from — **not canonize one pattern as universally correct**.

| Pattern | What It Governs | Reference Implementation | When to Apply |
|---|---|---|---|
| **RSC Prefetch + Hydration** | Rendering delivery — how the page loads | Shift Dashboard V3 (`page.tsx` → `dehydrate` → `HydrationBoundary`) | Server-seeded dashboards where initial paint matters |
| **BFF RPC Aggregation** (GOV-PAT-003) | Data aggregation — collapsing cross-context reads into one DB round trip | Rating Slip Modal (`rpc_get_rating_slip_modal_data`) | 3+ bounded contexts, >100 calls/day, latency-sensitive |
| **BFF Summary Endpoint** | Data aggregation — combining multi-level rollups into one HTTP response | Shift Dashboard Summary (`/api/v1/shift-dashboards/summary`) | Multiple metric levels served together, reducing client round-trips |
| **Client-led with explicit contracts** | Interaction-heavy forms where server shaping adds no value | Admin Settings, Import Wizard | Forms, wizards, low-frequency admin flows |

These are **complementary, not competing**. Rendering delivery (RSC vs client shell) and data aggregation (BFF RPC vs simple query vs summary endpoint) are orthogonal choices. A surface can combine them — the shift dashboard already does (RSC prefetch calls the BFF summary endpoint server-side).

The Surface Classification Standard should require new surfaces to declare **both** their rendering delivery pattern and their data aggregation pattern, because they solve different problems.

> **Note for future EXEC-SPECs**: The specific pattern selection for each ADR-039 measurement widget (e.g., whether audit event correlation warrants a BFF RPC given its 4-context span, or whether the existing SQL view is sufficient at expected call volumes) is an implementation decision. This direction artifact identifies the palette; EXEC-SPECs make the per-surface selection.

---

## Execution Slices

The large effort breaks into four related slices. Each is independently shippable but sequentially informed.

### Slice 0 — Standards Foundation

Establish the minimum governance artifacts that subsequent slices build against.

**Deliverables**:
- **Surface Classification Standard** — declares rendering delivery and data aggregation policy per surface class, referencing the proven pattern palette above
- **ADR-039 Metric Provenance Matrix** — 4 rows covering the 4 measurement artifacts, applying the Cross-Surface Metric Provenance & Truth Governance framework (`pt-cross-surface-metric-provenance-governance-plan.md`) to its first concrete metrics

The provenance governance plan defines the framework structure (truth classes, runtime classifications, required columns, investigation phases). Slice 0 instantiates that framework for ADR-039's 4 artifacts only. This is the minimum viable proof that the framework works — enough to make rendering, freshness, and reconciliation decisions for the measurement UI.

**Enforceability requirement**: Slice 0 is directional documentation, but it must be concrete enough to actually constrain EXEC-SPECs. The Surface Classification Standard must produce enforceable selection criteria — not aspirational prose — so that future route work, dashboard design, and rendering/fetch decisions are governed by it. If Slice 0 produces a standard that cannot reject a bad EXEC-SPEC or force a rendering choice, it has failed. A standard without teeth is a shrine.

### Slice 1 — ADR-039 Measurement UI

Build the measurement reports surface as the first surface that conforms to both the Surface Classification Standard and the provenance declarations from Slice 0.

**Scope**: Service layer, API routes, RSC page, report widgets, hooks, tests for the 4 ADR-039 measurement artifacts (theo discrepancy, audit correlation, rating coverage, loyalty liability).

**Key decision inputs from Slice 0**:
- Surface classification determines rendering delivery and data aggregation pattern
- Provenance matrix determines freshness, reconciliation, truth class, and computation layer per widget
- Pattern palette determines whether a given widget warrants BFF RPC, simple query, or summary endpoint

**Scope constraint**: Slice 1 builds exactly 4 widgets against exactly 4 provenance declarations. It does not expand the provenance framework beyond ADR-039 metrics, define new truth classes, or introduce governance process that isn't needed by these 4 artifacts. The framework becomes production-grade through successive population in Slices 2–3, not by front-loading ambition here. Concurrency between framework and surface is where scope creep dresses up as cleverness — constrain it.

### Slice 2 — Shift Dashboard Provenance Alignment

Retroactive governance: audit existing Shift Dashboard V3 metrics against the provenance framework and populate additional rows. Document what exists, identify gaps. No rebuild — this is a framework-expansion and audit exercise.

The shift dashboard already has provenance primitives in code (`provenance.ts`, trust badges, coverage bars). This slice brings those under the formal governance structure and proves the framework scales beyond 4 rows.

### Slice 3 — Pit Dashboard Refactor

Apply the Surface Classification Standard to convert the Pit Dashboard from a client shell to a governed surface. This is the Hardening Area 1 payoff — proving the standard works for refactoring existing surfaces, not just building new ones.

---

## Slice Sequence

```
Slice 0  ────────────────►  Standards Foundation
  │                          (Surface Classification + ADR-039 provenance declarations)
  │
Slice 1  ────────────────►  ADR-039 Measurement UI
  │                          (4 widgets against 4 provenance rows — no broader framework work)
  │
  ├── Slice 2  ──────────►  Shift Dashboard Provenance Alignment (framework expansion)
  │
  └── Slice 3  ──────────►  Pit Dashboard Refactor (Area 1 payoff)
```

Slice 0 is prerequisite. Slice 1 is constrained to building against the established declarations. Slices 2 and 3 are independently schedulable after Slice 1 and are where the provenance framework grows beyond ADR-039.

---

## What This Deliberately Defers

- **Non-ADR-039 provenance entries** (shift, compliance, player, executive metrics) — the framework structure exists from the governance plan; population beyond 4 rows happens in Slices 2–3 and beyond
- **Materialized views or snapshot pipelines** — the provenance declarations will reveal whether any metric needs escalation from live SQL; current evidence suggests they don't yet
- **Broader provenance process or tooling** — the framework is a matrix and a set of standards, not a platform; if tooling is needed, it earns its way in through Slice 2–3 experience

## What This Defers But Must Not Forget

The architecture reality report identifies **observability** and **E2E release confidence** as top-tier weaknesses — equal in severity to the surface policy gaps this plan addresses. These slices target Hardening Areas 1 and 4. They do not solve Hardening Areas 2 (observability) or 3 (E2E in CI).

Success on surface classification and provenance governance does not reduce the urgency of:
- production error monitoring, request tracing, and worker telemetry (Area 2),
- E2E journey coverage in CI to catch composition regressions at merge time (Area 3),
- caching/timeout standards and runtime delivery contracts (Area 4 remainder),
- operational hygiene fixes — admin role transport, dependency pinning, worker visibility (Area 5).

These remain independent tracks that should be pursued on their own timeline. The risk of landing Hardening Area 1 successfully is that it creates the illusion the system is hardened. It is not — it is hardened in one dimension.

---

## Bottom Line

The hardening plan says "standardize before you proliferate." The provenance governance plan defines the cross-surface framework. The ADR-039 précis says "infrastructure is ready, UI is zero."

All three converge: **instantiate the provenance framework for ADR-039's 4 metrics, build the measurement UI against those declarations, and expand the framework to other surfaces only after the first surface proves the structure works.** The Surface Classification Standard ensures rendering and data aggregation choices are also governed.

The standard must recognize the full palette of proven patterns (RSC prefetch, BFF RPC, BFF summary, client-led) rather than canonizing one. Rendering delivery and data aggregation are orthogonal decisions — the standard should require both to be declared per surface.