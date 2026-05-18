# LANDING PAGE VS DERIVED SURFACE NARRATIVE BOUNDARY

**Document type:** Narrative governance artifact  
**Status:** Proposed canonical boundary standard  
**Applies to:** `FIB-H-LANDING-PAGE-REFRACTOR.md` / `FIB-H-LP-001`, `LANDING_PAGE_NARRATIVE_CONTAINMENT_DIRECTIVE.md`, and `ZACHMAN-LANDING-WIREFRAME-v3.yaml`  
**Date:** 2026-05-14  
**Reference input:** `fib-amendment-draft.md`  

---

## 1. Purpose

This artifact disambiguates the narrative role of:

- the public landing page, and
- derived operational surfaces.

The landing page and derived surfaces are not interchangeable.

They serve different buyer moments, different cognitive depths, and different architectural functions.

Without this boundary, the landing page risks absorbing too much detail and reverting to:

```text
module → module → module → module
```

The required pattern is:

```text
one operational system revealed progressively
```

The landing page creates the continuous camera movement.

Derived surfaces provide bounded zoom-ins.

---

## 2. Scope Authority

This document does not amend `FIB-H-LP-001`.

It governs how the FIB is expressed across surfaces.

The FIB remains authoritative for:

- the operator problem,
- the primary buyer,
- the operational-intelligence positioning,
- the exclusion of AI-first, pricing, onboarding, and full redesign work,
- the requirement that floor activity becomes oversight, accountability, and insight.

This document is authoritative for:

- what belongs on the main landing page,
- what must move to derived surfaces,
- how derived surfaces inherit narrative from the landing page,
- how much detail each surface may carry,
- how routing should preserve causal continuity.

---

## 3. Core Boundary Principle

The landing page answers:

> Why should operational leadership believe this is one coherent operational system?

Derived surfaces answer:

> How does one part of that operational system work in practice?

The landing page must preserve cognitive throughput.

Derived surfaces may spend attention.

The landing page should create confidence through sequencing, compression, and proof.

Derived surfaces should create confidence through workflow detail, operational examples, and deeper surface walkthroughs.

---

## 4. Narrative Architecture

### 4.1 Landing page architecture

The landing page is the spine.

It must follow one progressive zoom:

```text
Hero
→ Operations
→ Product Surfaces
→ Operational Accountability
→ Operational Intelligence
→ CTA
```

Its job is to maintain one continuous operational frame.

Every section must feel like:

```text
the same system coming into clearer focus
```

not:

```text
a new product pitch
```

### 4.2 Derived surface architecture

Derived surfaces are controlled expansions of one layer of the spine.

They inherit context from the landing page and deepen it with:

- workflow sequence,
- product walkthrough,
- operational examples,
- screenshots or UI evidence,
- accountability context,
- role-specific usage moments,
- boundary and constraint language where needed.

Derived surfaces must not restart the entire product story.

They continue from the section that routed to them.

---

## 5. Surface Intent Matrix

Post-FDCM consolidation: the landing page resolves into four executive-operational domains. Operational Intelligence is the emergent cross-cutting layer produced by all four domains interacting — it is not a standalone derived surface.

| Surface | Executive Domain | Primary Intent | Buyer Question | Depth Allowed | Must Not Do |
|---|---|---|---|---|---|
| Landing page | — | Establish one operational system | “Is this coherent and relevant to my floor?” | Compressed | Explain full architecture |
| `/floor-operations` | Floor Operations | Expand live floor workflow | “How does this manage floor activity?” | Workflow depth | Become a general dashboard page |
| `/player-intelligence` | Player Intelligence | Expand player profile and loyalty depth | “Who is this player and what is their operational value?” | Player profile + loyalty depth | Become a CDP or analytics platform. Restart the product pitch from the hero. |
| `/financial-accountability` | Financial Accountability | Expand operational cash accountability | “Can I see cash movement with attribution?” | Cash-event depth | Claim accounting, settlement, or reconciliation authority |
| `/compliance-audit` | Compliance & Governance | Expand review and regulatory visibility | “Can this record hold up during review?” | Compliance depth | Claim legal or regulatory completion beyond scope |

**Operational Intelligence is not a derived surface.** It is the emergent layer produced when all four domains interact. It appears on the landing page as a consequence of the operational chain — not as a standalone pillar or a route to a fifth page. Intelligence surfaces (shift anomalies, aging sessions, runtime KPIs) are embedded within domain-specific derived surfaces, not collected into a separate `/operational-intelligence` route.

---

## 6. Landing Page Boundary

The landing page may include:

- category framing,
- operational worldview,
- compressed workflow claims,
- early product proof,
- high-level accountability claims,
- high-level intelligence claims,
- one conversion path.

The landing page must avoid:

- exhaustive feature inventory,
- implementation explanation,
- long compliance workflows,
- full financial event taxonomy,
- dashboard-by-dashboard walkthroughs,
- role-by-role journeys,
- architecture diagrams presented as buyer education,
- repeated restatement of the entire platform premise.

### Main-page test

A landing-page section is valid if it can be read quickly and summarized as:

```text
This shows why the operating system stays connected.
```

It is too deep if it requires:

```text
This explains every step, variant, exception, and downstream consequence.
```

That material belongs on a derived surface.

---

## 7. Derived Surface Boundary

Derived surfaces may include:

- deeper workflow steps,
- UI sequence detail,
- operational exceptions,
- role-specific interaction moments,
- supporting screenshots,
- concrete examples,
- links to adjacent causal layers,
- constraints that prevent overclaiming.

Derived surfaces must avoid:

- reopening the hero claim,
- reintroducing the whole product,
- competing with the landing page for category positioning,
- becoming an unrelated product page,
- using mesh navigation that treats all surfaces as peers,
- expanding into new personas or product claims outside the FIB.

### Derived-surface test

A derived surface is valid if it can be summarized as:

```text
This continues one landing-page claim in operational detail.
```

It is drifting if it requires:

```text
This page explains the platform from a different angle.
```

That creates semantic branching.

---

## 8. Routing Governance

Routes must preserve causal continuity.

The landing page routes into derived surfaces from specific operational claims.

Derived surfaces should then link forward or back along the causal chain, not sideways to every peer page.

Approved routing model:

```text
Landing section
→ relevant derived surface
→ adjacent causal surface
```

Rejected routing model:

```text
Every page
→ every other page
```

Mesh navigation makes the system feel like a module catalog.

Directional navigation makes the system feel like one operational chain.

### Current routing interpretation

Post-FDCM consolidation (4 executive domain cards):

- `S2 / Run the Floor` routes to `/floor-operations` (Wave 1 interim: `/floor-oversight`).
- `S2 / Understand the Player` has no Wave 1 route — routes to `/player-intelligence` in Wave 2.
- `S2 / Track the Money` routes to `/financial-accountability` (Wave 1 interim: `/cash-accountability`).
- `S2 / Defend the Operation` routes to `/compliance-audit` (Wave 1 interim: `/audit-compliance`).
- `S4 / Operational Accountability` routes to `/compliance-audit` and `/financial-accountability`.
- `S5 / Operational Intelligence` routes to `/operational-intelligence`.

---

## 9. Content Allocation Rules

### 9.1 Put on the landing page

Use the landing page for:

- the minimum claim required to keep the buyer moving,
- one operational consequence per block,
- visual proof that makes the claim credible,
- short transitions between adjacent layers,
- consequence-first headings.

### 9.2 Move to derived surfaces

Move content to derived surfaces when it needs:

- more than one paragraph,
- more than 3–4 proof points,
- workflow variants,
- exception handling,
- role-specific details,
- compliance or financial caveats,
- implementation-adjacent explanation,
- multiple screenshots to understand the claim.

### 9.3 Cut or defer

Cut or defer content when it:

- introduces a new top-level buyer frame,
- creates a new product category,
- requires a new persona,
- implies accounting authority,
- turns intelligence into generic analytics,
- requires architecture education to be understood.

---

## 10. Compression Standard

The landing page optimizes for:

```text
scan → infer → commit attention
```

Derived surfaces optimize for:

```text
orient → inspect → evaluate
```

This means the landing page should be materially shorter, visually lighter, and more consequence-driven than every derived surface.

If the landing page and a derived surface carry the same density, the boundary has failed.

---

## 11. Consequence-First Language Boundary

Landing-page headings should usually describe operational consequence.

Derived-surface headings may name operational domains if the page already inherits context.

### Landing page preferred

```text
Activity tied to people, tables, and the gaming day.
See what changed across the shift.
Cash movement visible while the floor is still active.
```

### Derived surface acceptable

```text
Floor Operations
Compliance & Audit
Financial Accountability
Operational Intelligence
```

The landing page sells the consequence.

The derived surface organizes the detail.

---

## 12. Screenshot Boundary

Landing-page screenshots must absorb explanation burden.

They should show enough context for the buyer to infer:

- this is real product surface area,
- floor activity is visible,
- staff/table/session/cash context is connected,
- the page is not a generic BI dashboard.

Derived-surface screenshots may be more numerous and more annotated.

They may explain:

- workflow sequence,
- exception handling,
- operational state changes,
- review steps,
- threshold behavior,
- role-specific actions.

Landing-page screenshots prove credibility.

Derived-surface screenshots support evaluation.

---

## 13. Surface-Specific Boundaries

### 13.1 Landing page

The landing page should not enumerate every workflow.

It should make the buyer understand:

> floor activity becomes operational visibility, accountability, and managerial insight.

Success condition:

> The buyer sees one operational system, not a list of modules.

### 13.2 Floor Operations

`/floor-operations` should expand:

- live table state,
- active sessions,
- shift rhythm,
- player check-in and rating flow,
- table moves and session continuity,
- checkpoint and floor visibility.

It should not expand:

- all compliance review detail,
- all cash event exception handling,
- broad intelligence positioning.

### 13.3 Compliance & Audit

`/compliance-audit` should expand:

- threshold visibility,
- gaming-day accumulation,
- per-patron review,
- printable or reviewable records,
- audit trail context,
- linked session and financial events.

It should not claim:

- legal sufficiency,
- regulatory filing automation,
- full compliance program coverage,
- accounting truth.

### 13.4 Financial Accountability

`/financial-accountability` should expand:

- buy-ins,
- cash-outs,
- voids,
- fills,
- credits,
- attribution,
- discrepancy notes,
- table financial context.

It should not claim:

- settlement authority,
- final accounting totals,
- full custody reconstruction,
- reconciliation finality.

Use operational cash language, not accounting authority language.

### 13.5 Player Intelligence

`/player-intelligence` should expand:

- player identity, enrollment, notes, and operational flags,
- visit history and session continuity across the gaming record,
- game preference patterns derived from session activity,
- loyalty position: tier, points balance, and redemption history,
- loyalty accrual mechanics and operator-configurable economics,
- reward catalog (points_comp and entitlement families),
- promo programs with lifecycle and exposure tracking,
- frequency rules that govern issuance limits.

It should not claim:

- predictive analytics or AI-driven player recommendations,
- marketing automation or engagement campaign management,
- accounting authority for comp valuations,
- full CDP or loyalty platform feature parity.

Player value must remain visibly grounded in actual floor activity — session data, not external modeling.

---

### 13.6 Operational Intelligence — Cross-Cutting Layer (Not a Standalone Surface)

Per FDCM consolidation, Operational Intelligence is not a standalone executive domain and does not map to a dedicated derived surface.

It is the emergent layer produced by all four domains interacting:

```text
Floor Operations
        ↓
Player Intelligence
        ↓
Financial Accountability
        ↓
Compliance & Governance
        ↓
Operational Intelligence
```

Intelligence signals — shift anomalies, aging sessions, runtime KPIs, theo integrity, floor efficiency metrics — are surfaced within the four domain pages where they are operationally grounded.

**There is no `/operational-intelligence` derived surface.**

Intelligence framing on the landing page is a consequence section, not a pillar. It shows the buyer what becomes visible when the operational chain is complete. It does not route to a fifth page.

If intelligence-adjacent content grows to warrant a dedicated surface in a future wave, it must be scoped through a new FDCM amendment — not inherited from this document.

---

## 14. Governance Checks

Before implementing or revising a landing-page section, answer:

- Does this deepen the same operational reality?
- Can the buyer scan it without parsing architecture?
- Is the heading consequence-first?
- Does the screenshot carry part of the explanation?
- Is there only one cognitive frame?
- Is anything here better suited to a derived surface?

Before implementing or revising a derived surface, answer:

- Which landing-page claim does this inherit from?
- What operational workflow does it deepen?
- What detail is allowed here that was intentionally compressed on the landing page?
- Does routing preserve causal continuity?
- Does the page avoid reopening the full product pitch?
- Does the page avoid claims excluded by the FIB?

---

## 15. Anti-Patterns

### 15.1 Landing page anti-patterns

- Turning the main page into a topology lecture.
- Naming every internal layer as a buyer-facing section.
- Treating screenshots as decorative proof after long prose.
- Repeating the platform premise in every section.
- Promoting compliance, cash, audit, and trust into too many peer sections.
- Using headings that describe taxonomy instead of consequences.

### 15.2 Derived surface anti-patterns

- Starting with the same hero argument as the landing page.
- Making each page sound like a standalone product line.
- Linking every derived surface to every other derived surface.
- Expanding beyond the operational claim that routed the buyer there.
- Adding new product promises to fill page space.
- Reusing main-page compression when the page needs concrete evaluation detail.

---

## 16. Canonical Rule

The landing page is the guided operational walkthrough.

Derived surfaces are bounded operational inspections.

The landing page should make the buyer think:

> This system keeps the floor, staff, sessions, cash movement, and review trail connected.

Derived surfaces should let the buyer verify:

> Here is how that connection works in this part of the operation.

If a page does not serve one of those two jobs, it is outside the narrative architecture.

