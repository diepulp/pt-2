---
prd: FIB-H-LP-001
id: EXEC-LP-001
title: "Landing Page Operational Narrative Refactor"
slug: landing-page-narrative-refactor
status: draft
created: 2026-05-14
intake_authority:
  fib_h: docs/00-vision/landing-page/FIB-H-LANDING-PAGE-REFRACTOR.md
  fib_id: FIB-H-LP-001
  wireframe: docs/00-vision/landing-page/ZACHMAN-LANDING-WIREFRAME-v3.yaml
  visual_dna: docs/00-vision/landing-page/exemplar/VISUAL-DNA.md
complexity_prescreen: streamlined
gov010_check: "n/a — FIB-H is scope authority; no PRD input"
write_path_classification: none
e2e_mandate: "waived — read-only public surface, no write paths"

workstreams:
  WS1:
    name: "NAV + Hero Refactor"
    description: >
      Update navigation links to mirror the causal chain
      (Operations → Accountability → Intelligence + Pricing).
      Rewrite hero eyebrow, headline, subtitle, and CTAs per wireframe
      S1 prose scaffold. Consolidate to single primary CTA throughout.
      Eyebrow: "Casino Operational Intelligence". Headline: outcomes
      first, operational source second. No capability strip.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: []
    bounded_context: marketing
    estimated_complexity: low
    outputs:
      - "app/(landing)/page.tsx"
    gate: gate-0-preview-surface
    constraints:
      - "Visual DNA locked — no color, type, spacing, or motion changes"
      - "Primary CTA: 'Request an operational walkthrough' → /contact (all instances)"
      - "No hero capability strip or proof strip"

  WS2:
    name: "S2 Operational Domains + S3 Product Surfaces"
    description: >
      Restructure S2 with new heading, 5 domain cards (Floor Oversight,
      Session Tracking, Cash Accountability, Audit Compliance, Loyalty &
      Rewards), enforce card-copy constraint (one sentence, one consequence,
      no feature enumerations). Restructure S3 with new heading, 4 surface
      tabs, framing copy per wireframe prose scaffold. Replace any screenshots
      with labelled stub placeholders — partial delivery intentional.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1]
    bounded_context: marketing
    estimated_complexity: medium
    outputs:
      - "app/(landing)/page.tsx"
    gate: gate-0-preview-surface
    constraints:
      - "Visual DNA locked"
      - "S2 heading: 'Tables, sessions, cash, compliance, and loyalty — managed during the shift.'"
      - "Card copy: one sentence, one consequence — no enumeration lists"
      - "Loyalty card: no Wave 1 route — omit anchor element entirely, informational only"
      - "S3 heading: 'What operational leadership sees during a shift.'"
      - "Screenshot stubs: '[Surface Name — floor-origin descriptor]' — must name a floor event"

  WS3:
    name: "S4 Operational Accountability + S5 Intelligence + S6 CTA"
    description: >
      Merge existing Trust section and standalone Financial Provenance layer
      into unified S4 Operational Accountability with exactly 4 content blocks:
      Attributed Activity, Regulatory Visibility, Shift Continuity, Operational
      Audit Trail. Wire S4 detail routes to transitional sub-pages. Restructure
      S5 Operational Intelligence with 4 blocks and screenshot stubs; no
      outbound link in Wave 1. S6 CTA: single CTA only, no secondary CTA.
      Remove standalone Financial Provenance section from page.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS2]
    bounded_context: marketing
    estimated_complexity: medium
    outputs:
      - "app/(landing)/page.tsx"
    gate: gate-2-validation
    constraints:
      - "Visual DNA locked"
      - "S4: max 4 content blocks — cash detail removed (depth at /financial-accountability)"
      - "S4 positioning: operational financial visibility only — no settlement or accounting claims"
      - "S5: no outbound link in Wave 1"
      - "S6: no secondary CTA"
      - "Banned vocabulary: provenance, telemetry, ontology, mutation, derived state, estimated"

  WS4:
    name: "Transitional Routing + Compliance Pass"
    description: >
      Wire all wave_1_href links per transitional_routing spec in wireframe.
      S2 domain cards: Floor Oversight → /floor-oversight, Session Tracking →
      /session-tracking, Cash Accountability → /cash-accountability, Audit
      Compliance → /audit-compliance, Loyalty → no link. S4 detail routes:
      Compliance → /audit-compliance, Financial → /cash-accountability.
      S5: no outbound link. Do not modify existing sub-pages. Final visual
      DNA compliance review: confirm no token drift from VISUAL-DNA.md.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS3]
    bounded_context: marketing
    estimated_complexity: low
    outputs:
      - "app/(landing)/page.tsx"
    gate: gate-3-operator-signoff
    constraints:
      - "Do not touch /floor-oversight, /session-tracking, /cash-accountability, /audit-compliance"
      - "Loyalty card: no href, no disabled state — pure informational"
      - "S5 /operational-intelligence: reserved for Wave 2, not rendered"

execution_phases:
  - name: "Phase 1 — NAV + Hero"
    parallel: [WS1]
    gate: gate-0-preview-surface
  - name: "Phase 2 — Operational Domains + Product Surfaces"
    parallel: [WS2]
    gate: gate-0-preview-surface
  - name: "Phase 3 — Accountability + Intelligence + CTA"
    parallel: [WS3]
    gate: gate-2-validation
  - name: "Phase 4 — Routing + Compliance Pass"
    parallel: [WS4]
    gate: gate-3-operator-signoff

gates:
  gate-0-preview-surface:
    type: hard-stop
    description: >
      Visual DNA self-check before handoff to next workstream. Executor
      confirms no color, type, or spacing drift from VISUAL-DNA.md.
    checks:
      - "No #000000 backgrounds — use #000212"
      - "No #FFFFFF text — use #F7F8F8"
      - "No Inter / Roboto / Arial — DM Sans + JetBrains Mono only"
      - "No purple gradients — cyan hsl(189 94% 43%) only"
      - "No border-white/10 — use border-white/[0.06] or border-white/[0.08]"
      - "overflow-x-hidden on page root"
      - "No new animation patterns beyond VISUAL-DNA.md §5"

  gate-2-validation:
    type: hard-stop
    description: >
      Content structure validation: section merge correct, block counts
      within spec, banned vocabulary absent, CTA consolidated.
    checks:
      - "S4 has exactly 4 content blocks"
      - "Standalone Financial Provenance section removed"
      - "No banned buyer-facing vocabulary in rendered copy"
      - "Single primary CTA throughout page"
      - "Visual DNA self-check passed"

  gate-3-operator-signoff:
    type: human
    description: >
      Human reviews shipped Wave 1 page and confirms exemplar_contract.
      On approval: set exemplar_contract.status = CONFIRMED in
      ZACHMAN-LANDING-WIREFRAME-v3.yaml. Wave 2 is frozen until this passes.
    criteria:
      - "Headings: consequence-first, 3-8 words, no taxonomy labels"
      - "Content blocks: 3-4 per section, 1-2 sentences each"
      - "CTA: 'Request an operational walkthrough' / /contact — one instance per CTA surface"
      - "No banned vocabulary visible in rendered page"
      - "Screenshot stubs clearly labelled with floor-event descriptor"
      - "Visual DNA: no drift from exemplar"

risks:
  - id: R1
    description: >
      Existing page.tsx may have Trust and Financial Provenance as separate
      sibling sections. WS3 merge surgery risks accidentally removing shared
      Reveal wrappers or section container structure.
    mitigation: "Read full page.tsx before WS3. Merge content into S4; preserve wrapper structure."

  - id: R2
    description: >
      Domain card component may require a non-optional href prop. Loyalty
      card has no Wave 1 route.
    mitigation: "Omit anchor element entirely. Do not introduce new disabled UI pattern."

  - id: R3
    description: >
      S5 screenshot stub labels may drift to generic BI descriptors if not
      constrained to name a floor event.
    mitigation: "Stub must name a floor event: '[Checkpoint comparison — session deltas since last snapshot]' not '[Analytics view]'."

open_question_decisions:
  OQ1:
    question: "Should Loyalty card display a 'Coming soon' badge or render plain?"
    resolution: at-execution-time
    decision: >
      Render as plain informational card with no href and no badge.
      Do not introduce a 'Coming soon' UI pattern not present in VISUAL-DNA.md.
    verification: assumption

exemplar_contract_gate:
  status: PENDING_CONFIRMATION
  gate_type: gate-3-operator-signoff
  confirmed_by: "Human approval after Wave 1 ships"
  unlocks: "ZACHMAN-DERIVED-SURFACES-WAVE2.yaml Wave 2 execution"
---

# EXEC-LP-001 — Landing Page Operational Narrative Refactor

> This document contains implementation details. It is allowed to churn.
> The FIB-H-LP-001 scope authority is frozen and must not be invalidated.

## 1) Implementation Overview

Operational narrative restructuring of `app/(landing)/page.tsx`. Visual
DNA is locked. The refactor realigns section order, headings, copy, and
domain card content to the causal chain defined in FIB-H-LP-001, using
the prose scaffold in ZACHMAN-LANDING-WIREFRAME-v3.yaml as the execution
authority for all copy and content structure decisions.

- **FIB-H:** `docs/00-vision/landing-page/FIB-H-LANDING-PAGE-REFRACTOR.md`
- **Wireframe:** `docs/00-vision/landing-page/ZACHMAN-LANDING-WIREFRAME-v3.yaml`
- **Visual DNA:** `docs/00-vision/landing-page/exemplar/VISUAL-DNA.md` (locked)

## 2) Database Changes

None. Read-only public surface.

## 3) Service Layer

None. No service or API changes.

## 4) API Routes

None.

## 5) Frontend Components

| File | Change |
|------|--------|
| `app/(landing)/page.tsx` | Primary target — all workstreams |

No new components introduced. Existing component patterns (Reveal, GlassCard,
SectionHeader, PillButton) used as-is per VISUAL-DNA.md §11.

## 6) Section Architecture (Post-Refactor)

```
NAV    → Operations | Accountability | Intelligence | Pricing | CTA
S1     → Hero (eyebrow + headline + subtitle + single CTA)
S2     → Operational Domains (5 cards: floor, session, cash, compliance, loyalty)
S3     → Product Surfaces (4 tabs: Shift Dashboard, Player 360, Cash Monitor, Pit Terminal)
S4     → Operational Accountability (4 blocks: attribution, regulatory, continuity, audit trail)
S5     → Operational Intelligence (4 blocks: performance, checkpoint, anomaly, trend)
S6     → CTA (single: "Request an operational walkthrough")
FOOTER → Brand + legal
```

**Removed:** standalone Financial Provenance section, standalone Trust section
(content merged into S4).

## 7) Transitional Routing (Wave 1)

| Domain Card | Wave 1 href | Notes |
|-------------|-------------|-------|
| Floor Oversight | /floor-oversight | existing sub-page |
| Session Tracking | /session-tracking | existing sub-page |
| Cash Accountability | /cash-accountability | existing sub-page |
| Audit Compliance | /audit-compliance | existing sub-page |
| Loyalty & Rewards | — | no link; informational only |
| S4 Compliance detail | /audit-compliance | |
| S4 Financial detail | /cash-accountability | |
| S5 outbound | — | Wave 2 only |

Do not modify the existing sub-pages during Wave 1.

## 8) Screenshot Stub Convention

Stubs are intentional partial delivery. Format: `[Surface Name — floor-origin descriptor]`

Priority stub: `[Pit Terminal — live seat map with active sessions and pit occupancy]`

Stubs must name a floor event. `[Analytics view]` is rejected per R3.

## 9) Wave 2 Gate

Wave 2 (`ZACHMAN-DERIVED-SURFACES-WAVE2.yaml`) is frozen until
`exemplar_contract.status = CONFIRMED` via human `gate-3-operator-signoff`
review of the shipped Wave 1 page.
