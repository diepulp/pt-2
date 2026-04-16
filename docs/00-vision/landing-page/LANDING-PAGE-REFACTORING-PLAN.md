# Landing Page Refactoring Plan — Progressive Disclosure

**Date:** 2026-04-09
**Branch:** `landing`
**Status:** Plan — pending approval
**Governing docs:** Zachman SoT, System Reality Map, Strategic Positioning, Juxtaposition Flow

---

## 1. What's Wrong With the Current Page

The production landing page follows a standard SaaS template:

```
Hero ("Replace your legacy table games system")
  → Pain (5 legacy problems)
    → What Changes (4 day-one wins)
      → Product Walkthrough (4 screenshots)
        → Compliance Trust Band
          → Pricing Teaser
            → FAQ
              → Final CTA
```

### Three structural problems

**P1 — Defensive framing.** The hero defines PT-2 by what it replaces. "Replace your legacy table games system" is a comparison posture — it anchors the visitor's mental model on the incumbent, not on PT-2. Every subsequent section then has to argue *away* from the old system instead of building toward a clear identity. The strategic positioning doc explicitly calls this out: *"If PT-2 is positioned as 'Modern replacement for legacy player tracking,' it will struggle."*

**P2 — Problem/Solution is generic.** The Pain → What Changes sequence is a SaaS copywriting pattern that any competitor can adopt. Five legacy pain points followed by four day-one promises is structurally identical to hundreds of B2B landing pages. It creates no distinction. The Zachman SoT mandates *"authority over persuasion"* and *"one dominant narrative"* — not a symptom/cure layout.

**P3 — Feature sprawl in the middle.** Product Walkthrough and Compliance Trust Band sit between the value proposition and the conversion point. The visitor encounters 4 feature showcases + 4 compliance cards before seeing pricing or a CTA. The Zachman SoT's signal compression rules say *"one section = one idea"* and the juxtaposition flow demands proof layers stay subordinate, not become the body.

### What the current page gets right

- Hero keeps the "hero holds for now" directive — visual treatment stays
- Compliance "built in, not bolted on" framing is correct and should persist
- "Numbers you can stand behind" is the canonical outcome line (currently unused on page)
- The 87-feature credibility ledger means every claim can be substantiated
- Single CTA focus on "Request a Demo" / guided conversion is correct

---

## 2. The Refactoring Thesis

**Kill Problem → Solution. Replace with progressive disclosure of operational identity.**

The page should answer four questions in order, each building on the last:

| Layer | Question | Visitor state | Time budget |
|-------|----------|---------------|-------------|
| **Foundation** | What is this? | Curious, scanning | ~5 seconds |
| **Workflows** | What does it help me do? | Engaged, evaluating fit | ~15 seconds |
| **Properties** | Why should I trust it? | Interested, looking for proof | ~20 seconds |
| **Outcome** | What's the business result? | Convinced enough to act | ~5 seconds |

This is the Zachman hierarchy: `FOUNDATION → WORKFLOWS → PROPERTIES → OUTCOME`

The current page interleaves these layers (hero mixes Foundation with comparison, Pain is a negative-framing of Workflows, What Changes is a positive-framing of the same Workflows, Product Walkthrough is Properties dressed as features, Compliance is Properties dressed as trust). The refactored page separates them cleanly.

---

## 3. Refactored Section Architecture

### Before (8 sections, Problem/Solution)

```
1. Hero           — "Replace your legacy table games system"
2. Pain           — 5 legacy problems
3. What Changes   — 4 day-one wins
4. Walkthrough    — 4 feature screenshots
5. Compliance     — 4 trust signals
6. Pricing        — teaser
7. FAQ            — 7 questions
8. Final CTA      — "Talk to us about your floor"
```

### After (7 sections, Progressive Disclosure)

```
1. Hero           — Identity + proof strip
2. Workflows      — What it helps you do (6 operational verbs)
3. Evidence       — Proof surfaces (screenshots + undersold capabilities)
4. Properties     — Why to trust it (structural, not cosmetic)
5. Pricing        — teaser (unchanged)
6. FAQ            — rewritten for progressive disclosure
7. Final CTA      — outcome-anchored close
```

### Section-by-section specification

---

#### S1. Hero — Foundation Layer

**Purpose:** Establish what PT-2 IS in under 10 seconds. No comparisons, no pain points, no feature lists.

**Current:**
- Headline: "Replace your legacy table games system."
- Subhead: "Player Tracker is a full replacement system of record..."
- CTAs: Request a Demo, See How It Works

**Refactored:**

| Element | Content | Rationale |
|---------|---------|-----------|
| **Category label** | Small text above headline — establishes category without consuming headline space | Borrowed from Linear/Stripe pattern. Anchors the visitor before the headline lands. |
| **Headline** | Declares what the system IS — identity statement, not comparison | Per Zachman: *"At the highest level, the landing page should not lead with modules. It should lead with what the system is."* |
| **Subhead** | One sentence expanding the identity into operational scope | Per juxtaposition flow: the subhead names the domains (floor coverage, player tracking, session rating, cash accountability, loyalty, compliance) |
| **Proof strip** | 3 terse trust signals directly under CTA | Per hero-trust doc: *"Traceable numbers / Attributed actions / Compliance-aware workflows"* — the first lightweight answer to "why should I believe you?" |
| **CTAs** | Primary: Request a Demo. Secondary: See How It Works. Tertiary: self-serve link. | Unchanged — conversion model is correct. |
| **Visual** | Product screenshot (shift dashboard) — placeholder for now | Unchanged — hero visual treatment holds. |

**What's removed:** The word "replace." The word "legacy." Any framing that defines PT-2 by comparison to what came before.

**Copy direction (not final copy — direction for copywriting):**
- Headline should feel like a category definition, not a sales pitch
- Draw from: *"One operating surface for the casino floor"* (juxtaposition flow)
- The Foundation identity: *"A real-time operational and compliance system of record for table-game floor operations"* — compress this into headline-grade prose

---

#### S2. Workflows — What It Helps You Do

**Purpose:** Disclose the 6 canonical operations. This replaces both Pain and What Changes — instead of "here's what's broken / here's what we fix," it's "here's what your floor does with this system."

**Current (Pain + What Changes = 9 items across 2 sections):**
- 5 pain points (legacy framing)
- 4 day-one wins (promise framing)

**Refactored (1 section, 6 items):**

The Zachman SoT defines exactly 6 canonical workflow messaging units:

1. **Cover the floor** — floor oversight, shift dashboard, checkpoint & delta
2. **Track sessions** — visit check-in/out, continuation, unidentified player tracking
3. **Rate play** — rating slips, average bet, theoretical win, pause/resume, table moves
4. **Manage cash activity** — buy-ins, cash-outs, threshold feedback, fills, drops
5. **Manage players** — Player 360, enrollment, search, exclusions, import
6. **Stay compliant** — MTL, CTR, audit notes, permanent records, staff attribution

**Layout:** 6-item grid (2×3 on desktop, 1-col on mobile). Each item:
- Verb-led title (the workflow name IS the headline)
- 2-3 sentence description grounded in Reality Map features
- No icons, no illustrations — typography carries the weight

**Key principle:** These are stated as operational activities, not benefits and not features. "Cover the floor" is something the pit boss already does — PT-2 is how they do it. This avoids both the "your current system is broken" negativity and the "we give you X" salesmanship.

**What's removed:** The entire Pain section. The entire What Changes section. The negative framing of legacy systems. The promise framing of day-one wins. Both are replaced by a neutral, authoritative disclosure of what the system does.

---

#### S3. Evidence — Proof Surfaces

**Purpose:** Show, don't tell. This replaces Product Walkthrough but reframes it — not "here's what you're getting" (feature tour) but "here's what it looks like in operation" (evidence of operational seriousness).

**Current (Product Walkthrough, 4 items):**
- Shift dashboard, Player 360, Table map, Operational logs

**Refactored (4-5 items, rebalanced):**

The System Reality Map identifies capabilities the current page undersells. The evidence section should feature-promote these while maintaining the progressive disclosure hierarchy (this is Layer 3 — proof, not the opening identity).

| # | Surface | Why elevated | Screenshot target |
|---|---------|-------------|-------------------|
| 1 | **Shift dashboard + checkpoint delta** | The strongest "real-time floor picture" proof. Checkpoint/delta tracking is unique — no legacy system does this. | Dashboard with checkpoint active |
| 2 | **Player 360** | Holds — this is the canonical player surface. | Player profile with timeline |
| 3 | **Cash accountability with threshold feedback** | Buy-in threshold indicator is the strongest Title 31 proof point. Currently invisible on the page. | Buy-in form showing threshold proximity |
| 4 | **Setup wizard + CSV import** | The "zero to operational" story. Currently buried. This is what makes "shift-ready" real. | Setup wizard mid-step or import mapping |

**Layout:** Alternating left/right feature showcases (reuse `FeatureShowcase` component). Each item:
- Short title (the surface name)
- 2-3 sentences of operational context (what it shows, why it matters)
- Screenshot (placeholder boxes initially, captured from running app later)

**What's removed:** "Operational logs" as a standalone showcase. Logs are a property (audit trail), not a surface — they belong in the Properties section. "Table map and pit layout" demoted from standalone showcase to a supporting mention within Workflows (it's part of "Cover the floor").

---

#### S4. Properties — Why to Trust It

**Purpose:** Disclose the structural attributes that make the system trustworthy. This replaces Compliance Trust Band but broadens it — compliance is one of four properties, not the entire trust argument.

**Current (Compliance Trust Band, 4 items):**
- Audit trail by default
- Title 31 awareness
- Row-level security
- Immutable financial records

**Refactored (4 properties from Zachman SoT):**

| # | Property | Substantiation (from Reality Map) |
|---|----------|----------------------------------|
| 1 | **Every number is traceable** | Permanent financial records, loyalty ledger, audit notes, timestamps on every mutation |
| 2 | **Every action is attributed** | Staff attribution on all operations, role-based access, no shared logins |
| 3 | **Nothing gets rewritten** | Append-only cash transactions, corrections create new entries, void audit trail |
| 4 | **Anomalies surface during operations** | Live threshold feedback on buy-ins, MTL progressive alerts, CTR banners, shift checkpoint deltas |

**Layout:** Clean 4-item row or 2×2 grid. Terse — each property is a statement + 1-2 sentence proof. No cards, no icons. The visual treatment should feel like a trust manifesto, not a feature grid.

**Compliance integration:** "Built in, not bolted on" becomes the section's framing line, not a separate section. Title 31, RLS, immutable records are folded into the 4 properties as substantiation, not as standalone claims.

**What's removed:** Compliance as a separate section. It's absorbed into Properties as the structural proof for why these properties hold.

---

#### S5. Pricing Teaser — Unchanged

"One product. One price per property." This section works. No changes.

---

#### S6. FAQ — Rewritten for Progressive Disclosure

**Purpose:** Handle objections that the progressive disclosure stack didn't address. The FAQ is the catch-all for questions the main narrative intentionally left out.

**Current:** 7 questions focused on product mechanics (setup wizard, data import, billing).

**Refactored:** 7 questions rebalanced toward the questions progressive disclosure creates:

| # | Question | Why this question |
|---|----------|-------------------|
| 1 | What does Player Tracker replace? | The page no longer says "replace" — visitors may still wonder |
| 2 | Who is this built for? | ICP clarification — small card rooms, not tribal enterprise |
| 3 | How long does setup take? | "Zero to operational" is in Evidence but visitors want specifics |
| 4 | Can I import player data from my current system? | The bridge question between old and new |
| 5 | Is this a compliance product? | The page shows compliance properties — clarify it's operations-first |
| 6 | What about pricing? | Pricing teaser is deliberately vague — FAQ handles the follow-up |
| 7 | Do I need to talk to someone before I can use it? | Self-serve vs. guided — handles both audiences |

**What's removed:** Questions about Start Gateway mechanics, multi-casino support, billing status — these are product-specific and don't belong on a marketing page.

**Fabricated claims to remove (per Reality Map):**
- Any mention of slot system integration
- Any mention of Slack support channel
- "2-4 week deployment" → reword to "within weeks"

---

#### S7. Final CTA — Outcome-Anchored Close

**Purpose:** The canonical outcome line should land here, not in the hero. The hero establishes identity; the close delivers the business result.

**Current:**
- Headline: "Talk to us about your floor."
- Subhead: "No pitch deck."

**Refactored:**

| Element | Content | Rationale |
|---------|---------|-----------|
| **Outcome line** | The canonical outcome from Zachman: *"Numbers you can stand behind."* | This is the most compressed expression of the entire value — telemetry integrity, compliance defensibility, auditability, operational visibility. It should close the page, not open it. |
| **Subhead** | "Talk to us about your floor." (demoted from headline to subhead) | The human-to-human invitation becomes the supporting line under the outcome. |
| **CTAs** | Book a Walkthrough (primary), See Pricing (secondary) | Unchanged. |

---

## 4. Progressive Disclosure Flow — Complete

```
┌─────────────────────────────────────────────────────────┐
│  S1  HERO — FOUNDATION                                  │
│  "What is this?"                                        │
│                                                         │
│  Identity statement + proof strip                       │
│  One operating surface for the casino floor.            │
│  [Request a Demo]  [See How It Works]                   │
│  Traceable · Attributed · Compliance-aware              │
├─────────────────────────────────────────────────────────┤
│  S2  WORKFLOWS                                          │
│  "What does it help me do?"                             │
│                                                         │
│  Cover the floor · Track sessions · Rate play           │
│  Manage cash · Manage players · Stay compliant          │
├─────────────────────────────────────────────────────────┤
│  S3  EVIDENCE                                           │
│  "What does it look like?"                              │
│                                                         │
│  Shift dashboard + delta | Player 360                   │
│  Cash threshold feedback | Setup wizard + import        │
├─────────────────────────────────────────────────────────┤
│  S4  PROPERTIES                                         │
│  "Why should I trust it?"                               │
│                                                         │
│  Traceable · Attributed · Append-only · Live alerts     │
│  "Compliance built in, not bolted on."                  │
├─────────────────────────────────────────────────────────┤
│  S5  PRICING                                            │
│  One product. One price per property.                   │
├─────────────────────────────────────────────────────────┤
│  S6  FAQ                                                │
│  Objection handling for what progressive disclosure     │
│  intentionally omitted.                                 │
├─────────────────────────────────────────────────────────┤
│  S7  FINAL CTA — OUTCOME                               │
│  "Numbers you can stand behind."                        │
│  Talk to us about your floor.                           │
│  [Book a Walkthrough]  [See Pricing]                    │
└─────────────────────────────────────────────────────────┘
```

---

## 5. What Gets Deleted

| Current section | Disposition |
|-----------------|------------|
| `PainSection` | **Deleted.** Negative legacy framing removed entirely. The operational verbs in Workflows carry the same information without the comparison posture. |
| `WhatChangesSection` | **Deleted.** Promise framing ("here's what you get on day one") absorbed into Workflows as neutral operational activities. |
| `ComplianceTrustSection` | **Absorbed** into Properties. Compliance is a proof layer, not a standalone section. |

Net: 8 sections → 7 sections. Two sections removed, one absorbed, one new (Workflows replaces Pain + What Changes).

---

## 6. What Does NOT Change

| Element | Reason |
|---------|--------|
| **Hero visual treatment** | "Hero holds for now" directive. Layout, screenshot placeholder, responsive behavior unchanged. |
| **Marketing layout** | Shared `(marketing)/layout.tsx` with sticky header + footer unchanged. |
| **Conversion model** | "Request a Demo" primary, guided conversion. Self-serve tertiary. |
| **Pricing teaser** | "One product. One price per property." Works as-is. |
| **Component architecture** | `Section`, `FeatureShowcase`, `CTABlock` wrappers unchanged. |
| **Visual direction** | Linear-inspired, typography-driven, no casino theming, no animations. |
| **Review variants** | `/review/landing-*` routes untouched — they remain comparison artifacts. |

---

## 7. Copy Constraints

### Headline direction (not final copy)

The hero headline should establish category identity. Candidate directions:

- **Identity-first:** "One operating surface for the casino floor."
- **System-of-record:** "The system of record for table-game floor operations."
- **Operational-first:** "Floor operations. One system. Complete record."

All draw from the juxtaposition flow's synthesized identity: *"PT-2 is a live casino floor operating system of record."*

### Subhead direction

Expand identity into operational scope. Draw from: *"It gives operators one attributable, traceable surface for floor coverage, player tracking, session rating, cash accountability, loyalty, and compliance."*

### Prohibited

- "Replace" / "replacement" in hero (comparison anchor)
- "Legacy" in hero (triggers defensive evaluation)
- "Better" / "modern" / "next-generation" (hollow SaaS perfume per Zachman)
- "AI insights" / "automated compliance" / "predictive analytics" (fabricated)
- "Trusted by X casinos" (no social proof exists)

### Permitted

- "System of record" — this is the canonical identity
- "Operational" — the core domain
- "Attributable" / "traceable" — the canonical properties
- "Numbers you can stand behind" — the canonical outcome (final CTA only)
- "Built in, not bolted on" — compliance framing (Properties section only)

---

## 8. Implementation Sequence

### Phase 1 — Structure (sections + layout)

1. Create new `WorkflowsSection` component (`components/marketing/sections/workflows.tsx`)
2. Create new `EvidenceSection` component (`components/marketing/sections/evidence.tsx`)
3. Create new `PropertiesSection` component (`components/marketing/sections/properties.tsx`)
4. Update `app/(marketing)/page.tsx` to new section order
5. Delete `PainSection` and `WhatChangesSection` imports

### Phase 2 — Hero revision

6. Revise `HeroSection` — new headline, subhead, proof strip
7. Keep visual layout, CTA structure, responsive behavior

### Phase 3 — Content

8. Write workflow descriptions (grounded in Reality Map feature inventory)
9. Write evidence captions (for screenshot showcases)
10. Write property statements (from Zachman canonical properties)
11. Rewrite FAQ for progressive disclosure
12. Revise Final CTA to outcome-anchored close

### Phase 4 — Cleanup

13. Remove unused section component files (`pain.tsx`, `what-changes.tsx`)
14. Verify `compliance-trust.tsx` is unused after Properties absorbs it, then remove
15. Verify build (`npm run build`)
16. Visual review on dev server

---

## 9. Validation Criteria

The refactored page is valid if (per Zachman SoT integrity constraints):

1. **Understood in 10 seconds** — hero establishes identity without requiring scroll
2. **Workflows recognizable** — a pit boss scanning the page sees their operational vocabulary
3. **Authority over persuasion** — no pain points, no promises, no comparisons
4. **Measurement implied** — the properties section communicates that this system produces auditable, defensible numbers
5. **Single CTA focus** — "Request a Demo" is the dominant action at every insertion point
6. **No fabricated claims** — every feature mentioned is backed by the 87-feature Reality Map
7. **Progressive disclosure order** — Foundation → Workflows → Properties → Outcome, never inverted

---

## 10. Relationship to Existing Artifacts

| Artifact | Role in refactoring |
|----------|-------------------|
| **Zachman SoT** | Rhetorical control — narrative hierarchy, messaging units, signal compression rules, integrity constraints |
| **System Reality Map** | Factual control — what can be claimed, feature credibility ledger, undersold capabilities |
| **Strategic Positioning** | Strategic frame — why "replace" is wrong, why operational intelligence is right |
| **Juxtaposition Flow** | Synthesis — the progressive disclosure hierarchy itself, the frozen SoT statement |
| **Hero Trust** | Hero-adjacent proof strip specification |
| **Landscape** | Current-state baseline for diffing against refactored version |
| **Rebuild Baseline v0.2** | Superseded by this plan for section architecture and copy direction; visual direction, component architecture, and conversion model carry forward |
