# FEATURE INTAKE BRIEF

## A. Feature identity
- **Feature name:** Landing Page Operational Narrative Refactor
- **Feature ID / shorthand:** FIB-H-LP-001
- **Related wedge / phase / slice:** Marketing / Narrative Architecture Refactor
- **Requester / owner:** Product / Narrative Architecture
- **Date opened:** 2026-05-13
- **Priority:** P0
- **Target decision horizon:** Pilot positioning / pre-production public positioning

---

## B. Operator problem statement

The current landing page presents the platform as a flattened collection of dashboards, analytics, compliance tooling, and operational modules instead of a coherent operational intelligence system centered around casino floor workflows. This creates ambiguity for Directors of Operations, Shift Managers, and casino leadership evaluating the system because the operational origin of the platform — floor activity capture and operational accountability — is obscured behind feature taxonomy and generic SaaS positioning.

---

## C. Pilot-fit / current-slice justification

This belongs in the current slice because the landing page is the primary narrative surface for communicating the system’s operational value proposition to pilot candidates and operational leadership. Without this refactor, the platform appears fragmented, analytics-first, and semantically incoherent, weakening operator trust and obscuring the system’s actual differentiation: unified operational provenance and downstream accountability.

---

## D. Primary actor and operator moment

- **Primary actor:** Director of Operations / Shift Manager / General Manager
- **When does this happen?** During initial operational evaluation of the platform
- **Primary surface:** Public landing page (`/`)
- **Trigger event:** Casino operational leadership evaluates whether the system can provide operational oversight, accountability, and visibility into floor activity

---

## E. Feature Containment Loop

1. Director of Operations lands on the homepage → system immediately communicates operational-intelligence positioning centered on casino floor workflows.
2. Operator reviews the hero narrative → system establishes that floor activity is the operational source of downstream oversight and accountability.
3. Operator explores operational domains → system explains operational workflows before analytics or reporting surfaces.
4. Operator reviews accountability and provenance sections → system demonstrates operational traceability and regulatory defensibility.
5. Operator reviews financial provenance layer → system explains operational financial visibility without claiming accounting authority.
6. Operator reviews operational intelligence layer → system demonstrates how operational telemetry becomes managerial insight.
7. Operator reviews product surfaces → screenshots reinforce operational continuity instead of disconnected features.
8. Operator reaches conversion surface → system presents one coherent operational walkthrough CTA.
9. Operator exits the page understanding the platform as one operational system with downstream intelligence and accountability layers.

---

## F. Required outcomes

- Landing page communicates a coherent operational dependency chain instead of disconnected modules.
- Hero section clearly defines the platform as a casino operational intelligence system.
- Operational workflows become the primary narrative spine of the page.
- Compliance and financial provenance are presented as downstream operational consequences.
- Product screenshots reinforce operational workflows instead of feature inventory.
- CTA posture is consolidated into one operational walkthrough conversion path.
- Operational leadership can understand the system’s topology without architectural jargon.

---

## G. Explicit exclusions

- No full visual redesign system.
- No logo or branding redesign.
- No CMS migration.
- No SEO strategy overhaul.
- No new analytics surfaces or dashboards.
- No AI-first marketing repositioning.
- No customer onboarding redesign.
- No pricing strategy changes.
- No animation system overhaul.
- No new operational feature implementation.
- **No changes to the established visual DNA** — color tokens, typography scale, component patterns, spacing rhythm, motion rules, and background treatments are locked.

---

> **Visual DNA Preservation — Locked**
>
> The exemplar's visual language is excellent and must not be altered during this refactor. The scope is strictly limited to operational narrative restructuring: copy, section order, content hierarchy, and semantic framing. Every color token, typography scale, card pattern, spacing value, motion rule, and background treatment defined in the canonical reference must remain intact.
>
> Canonical reference: [docs/00-vision/landing-page/exemplar/VISUAL-DNA.md](exemplar/VISUAL-DNA.md)

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Role-segmented landing pages | Different operational actors evaluate the platform differently | Would fragment the operational narrative and worsen semantic flattening |
| Analytics-first positioning | Existing surfaces strongly emphasize telemetry and dashboards | Obscures the operational origin of the platform and makes the product appear like generic BI software |
| Separate trust/compliance section | Existing page isolates trust semantics into standalone sections | Trust should emerge naturally from operational accountability and provenance |
| AI-centric positioning | Modern SaaS positioning pressure | Weakens operational credibility and introduces unnecessary marketing abstraction |
| Full design system rewrite | Current page structural issues expose UI inconsistencies | Structural and semantic correction must happen before visual redesign |

---

## I. Dependencies and assumptions

- Existing screenshots remain reusable after narrative restructuring.
- Supporting operational-domain pages may be introduced incrementally.
- Existing architecture canon remains stable:
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
- The system continues positioning around operational telemetry and provenance rather than accounting authority.
- Current landing infrastructure supports section restructuring without requiring platform migration.

---

## J. Out-of-scope but likely next

- Supporting operational-domain subpages:
  - Floor Operations
  - Compliance & Audit
  - Financial Accountability
  - Operational Intelligence
- Narrative copy refinement pass
- Visual operational-topology diagram implementation

---

## K. Expansion trigger rule

Amend this intake brief if downstream artifacts introduce:
- new operator personas,
- a new conversion funnel,
- a new top-level marketing surface,
- AI positioning,
- onboarding workflow redesign,
- external integrations,
- pricing architecture changes,
- SEO-driven information architecture changes,
- new operational product claims not represented in the containment loop.

---

## L. Scope authority block

- **Intake version:** v1
- **Frozen for downstream design:** Yes
- **Downstream expansion allowed without amendment:** No
- **Open questions allowed to remain unresolved at scaffold stage:**
  - Final CTA copy
  - Supporting sub-page rollout sequencing
  - Exact visual treatment of operational topology diagram
- **Human approval / sign-off:** Pending

---

## Scope Authority Statement

This refactor exists to align the public landing page with the actual operational ontology of the system.

The landing page must explain:

> how casino floor activity becomes operational oversight, compliance visibility, financial provenance, and operational intelligence.

The landing page must not behave like a flattened SaaS capability catalog or dashboard inventory.

The system is to be presented as one operational intelligence system with downstream accountability and insight layers emerging from captured floor activity.
