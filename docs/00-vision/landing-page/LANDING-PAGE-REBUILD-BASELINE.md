# Landing Page Rebuild Baseline — v0.2

**Date:** 2026-04-06
**Status:** In progress — brainstorming phase
**Supersedes:** v0.1 guide, IA, and copy deck (retained for reference)

---

## 1. Purpose

Full rebuild of the PT-2 marketing site: landing page, pricing, contact, and signin. The v0.1 implementation is placeholder-grade — generic SaaS structure with basic shadcn cards and copy that undersells the product's replacement positioning.

This rebuild aligns the marketing surface with the product's actual value: a full replacement system of record for table games operations, with compliance baked in as a trust factor rather than the front-door identity.

---

## 2. Ideal Customer Profile (ICP)

### Primary audience

Owner-operators, GMs, and operations leads at **small card rooms and similar smaller gaming properties** stuck on aging legacy systems.

These are economic buyers or close to them. They feel the pain in practical terms:

- Weak floor visibility
- Clumsy workflows
- Delayed reporting
- Manual reconciliation
- Poor adaptability
- Expensive dependence on incumbent vendors

**Not:** tribal enterprise buyers, compliance officers, or "everyone with a badge and an opinion."

### Secondary audience

Compliance, surveillance, and audit-adjacent stakeholders are **secondary validators**, not the lead target. They can block adoption or create hesitation, but they are not the first emotional or commercial hook.

### Positioning consequence

- Lead with operations: replacing rigid legacy systems, gaining floor visibility, improving operational control, making the room easier to run.
- Support with compliance: audit trail, traceability, defensibility, controls, Title 31 awareness.
- **Do not position as a compliance product.**

---

## 3. Conversion Model

### CTA hierarchy

| Position | CTA | Target |
|----------|-----|--------|
| Hero primary | **Request a Demo** | `/contact` (or future scheduling) |
| Hero secondary | **See How It Works** | `#how-it-works` (scroll) |
| Mid-page | **Book a Walkthrough** | `/contact` |
| Footer | **Talk to Us About Your Floor** | `/contact` |
| Tertiary (small text link) | Already ready to explore? Start setup | `/start` |

### Conversion intent

The page is a **sales tool**, not an onboarding funnel. Primary conversion is guided — the operator talks to a person before they're in the product. Self-serve remains available as an escape hatch.

---

## 4. Scope

### Pages in scope

| Route | Description |
|-------|-------------|
| `/` | Landing page — full rebuild |
| `/pricing` | Pricing page — single product, per-property, "talk to us" |
| `/contact` | Contact page — form UI (wiring deferred) |
| `/signin` | Sign-in page — restyled to match |

### Shared components

- Marketing header (sticky, backdrop blur)
- Marketing footer
- Reusable section wrapper
- Feature showcase (screenshot + description pairs)
- CTA block (reusable across 3 insertion points)

---

## 5. Visual Direction

**Baseline reference:** Linear (linear.app)

- Clean, dense, authoritative
- Neutral palette, no casino theming — no felt-green, no card suits, no chip imagery
- Typography-driven hierarchy
- Confident whitespace
- Dark mode support (follows existing PT-2 theme tokens)

### Visual system

| Element | Specification |
|---------|--------------|
| Container | `max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8` |
| Section spacing | `py-16 md:py-20 lg:py-24` |
| Hero headline | `text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight` |
| Section headlines | `text-3xl md:text-4xl font-semibold` |
| Body copy | `text-base md:text-lg` (16–18px) |
| Color | Existing PT-2 theme tokens — neutral base + single accent |
| Header | `h-14`, `bg-background/80`, `backdrop-blur-xl`, thin `border-b` |

### What's NOT included

- Framer Motion / animation libraries
- Casino-themed imagery or palette
- Gradient text
- Stock photography
- Video backgrounds

---

## 6. Product Screenshots

Screenshots will be **captured from the running dev app** during implementation. Target screens:

- Shift dashboard
- Player 360
- Pit map / table layout
- Operational logs / MTL

These are inserted as static images in feature showcase sections.

---

## 7. Page Architecture — Landing (`/`)

### Section order

| # | Section | Purpose |
|---|---------|---------|
| 1 | **Header** (sticky) | Nav + demo CTA |
| 2 | **Hero** | Replacement positioning headline, demo CTA, product screenshot |
| 3 | **Pain** | What legacy systems cost you (operational, not technical) |
| 4 | **What changes** | Day-one operational wins |
| 5 | **Product walkthrough** | 3–4 feature areas with screenshots |
| 6 | **Compliance trust band** | Audit trail, Title 31 awareness, RLS — "built in, not bolted on" |
| 7 | **Pricing teaser** | Single product, what's included, talk-to-us CTA |
| 8 | **FAQ** | Rewritten for the ICP |
| 9 | **Final CTA** | "Talk to us about your floor" |
| 10 | **Footer** | Nav, legal, copyright |

### Key differences from v0.1

- Hero headline shifts from "shift-ready CRM" to **replacement positioning** (replacing legacy systems)
- "Problems" section reframed as **pain of legacy systems** (not "what changes on day one")
- New **product walkthrough** section with real screenshots
- New **compliance trust band** — compliance as a supporting trust signal, not the lead
- CTAs changed from self-serve "Get started" to guided "Request a Demo"
- Social proof section dropped (no testimonials; principles absorbed into trust band)

---

## 8. Page Architecture — Pricing (`/pricing`)

Single product, per-property pricing (model not finalized).

- **What you get** — feature summary list
- **How pricing works** — "One product. One price per property." + brief explanation
- **CTA** — "Talk to us about pricing" → `/contact`

No tiers. No price grid. No "coming soon" placeholders.

---

## 9. Page Architecture — Contact (`/contact`)

- **Headline** — "Talk to us about your floor"
- **Form fields** — Name, property name, email, phone (optional), message
- **Form submission** — UI only for now, wiring deferred
- **Side content** — Brief reassurance copy (response time expectation, no-pressure tone)

---

## 10. Component Architecture (Approach B — Clean Rebuild)

Delete existing `components/marketing/sections/*.tsx`. Rebuild with purpose-built components.

### New shared components

| Component | Purpose |
|-----------|---------|
| `Section` | Wrapper for consistent spacing, backgrounds, container width |
| `FeatureShowcase` | Screenshot + description pair (left/right alternating) |
| `CTABlock` | Reusable CTA group (primary + secondary buttons, optional microcopy) |

### Section components (rebuilt)

| Component | File |
|-----------|------|
| `MarketingHeader` | `components/marketing/header.tsx` |
| `MarketingFooter` | `components/marketing/footer.tsx` |
| `HeroSection` | `components/marketing/sections/hero.tsx` |
| `PainSection` | `components/marketing/sections/pain.tsx` |
| `WhatChangesSection` | `components/marketing/sections/what-changes.tsx` |
| `ProductWalkthroughSection` | `components/marketing/sections/product-walkthrough.tsx` |
| `ComplianceTrustSection` | `components/marketing/sections/compliance-trust.tsx` |
| `PricingTeaserSection` | `components/marketing/sections/pricing-teaser.tsx` |
| `FAQSection` | `components/marketing/sections/faq.tsx` |
| `FinalCTASection` | `components/marketing/sections/final-cta.tsx` |
| `MobileMenuToggle` | `components/marketing/mobile-menu-toggle.tsx` |

### Deleted components

- `components/marketing/sections/problems.tsx` → replaced by `pain.tsx`
- `components/marketing/sections/capabilities.tsx` → replaced by `product-walkthrough.tsx`
- `components/marketing/sections/how-it-works.tsx` → absorbed into walkthrough
- `components/marketing/sections/social-proof.tsx` → absorbed into compliance trust band
- `components/marketing/timeline-step.tsx` → no longer needed

---

## 11. Copy Direction

### Hero headline candidates (to be refined)

- "Replace your legacy table games system."
- "Your floor deserves better software."
- "The table games system your card room has been waiting for."

### Tone

- Operational, confident, direct
- No buzzwords, no "streamline synergy"
- Speaks to operators who know their floor, not to IT procurement

### Prohibited language (carried from v0.1)

- "AI insights"
- "Automated compliance"
- "Guaranteed profitability"
- "Real-time everything"
- "Trusted by 100+ casinos"
- "Predictive analytics"

---

## 12. Source Documents

| Document | Role |
|----------|------|
| `docs/marketing/PT2_Marketing_Narrative_Replacement_Positioning.md` | Replacement positioning, structural integrity claims |
| `docs/marketing/PT_COMPLIANCE_SELL_SHEET.md` | Compliance capabilities, Title 31 alignment, FAQ |
| `docs/00-vision/landing-page/player-tracker-landing-page-guide-v0.1.md` | Prior IA guide (superseded) |
| `docs/00-vision/landing-page/COPY-DECK-v0.1.md` | Prior copy deck (superseded) |
| `docs/00-vision/landing-page/LANDING-IA-v0.1.md` | Prior IA spec (superseded) |

---

## 13. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Final hero headline copy | Pending — candidates listed above |
| 2 | Pricing model details (price point, what's included) | Not finalized — page designed to work without a number |
| 3 | Contact form submission backend | Deferred — UI only for now |
| 4 | Product screenshots — which views, which states | To be decided during implementation |
| 5 | Domain/deployment for marketing site | Not discussed |
