# Landing Page Landscape & Prose Posture

**Date:** 2026-04-09
**Branch:** `landing`
**Status:** Current-state audit of all marketing surfaces and review variants

---

## 1. Route Map

| Route | Layout | File | Render | Notes |
|-------|--------|------|--------|-------|
| `/` | `(marketing)` | `app/(marketing)/page.tsx` | Static (`force-static`) | **Production landing.** 8 section components. |
| `/pricing` | `(marketing)` | `app/(marketing)/pricing/page.tsx` | Static | Feature list + "talk to us" CTA. |
| `/contact` | `(marketing)` | `app/(marketing)/contact/page.tsx` | Client | Form UI only (no backend wiring). |
| `/signin` | `(marketing)` | `app/(marketing)/signin/page.tsx` | Server | Wraps `<LoginForm />`. Links to `/contact`. |
| `/review/landing-brutalist` | None (standalone) | `app/review/landing-brutalist/page.tsx` | Client | Self-contained, monospace/uppercase aesthetic. |
| `/review/landing-dark` | None (standalone) | `app/review/landing-dark/page.tsx` | Client | Self-contained, forced dark mode, dot-grid bg. |
| `/review/landing-linear` | None (standalone) | `app/review/landing-linear/page.tsx` | Client | Self-contained, Linear-inspired violet accent. |
| `/review/landing-zachman` | None (standalone) | `app/review/landing-zachman/page.tsx` | Client | Self-contained, Zachman progressive disclosure (Foundation → Workflows → Properties → Outcome). |
| `/review/landing-zachman-dark` | None (standalone) | `app/review/landing-zachman-dark/page.tsx` | Client | Zachman progressive disclosure in dark variant DNA. Dark hero preserved. Interactive tab evidence. |

---

## 2. Shared Marketing Layout

**File:** `app/(marketing)/layout.tsx`

```
MarketingHeader (sticky, backdrop-blur)
  main (flex-1)
MarketingFooter
```

All `(marketing)` routes share this chrome. Review variants are fully self-contained with their own header/footer.

---

## 3. Shared Components

| Component | File | Purpose |
|-----------|------|---------|
| `Section` | `components/marketing/section.tsx` | Spacing wrapper. Props: `id`, `muted` (bg-muted/30), `className`. Container `max-w-[1200px]`. |
| `FeatureShowcase` | `components/marketing/feature-showcase.tsx` | Side-by-side screenshot + description. `reverse` prop flips order. Placeholder if no `screenshotSrc`. |
| `CTABlock` | `components/marketing/cta-block.tsx` | Primary/secondary buttons + optional microcopy. **Currently unused** by any page. |
| `MobileMenuToggle` | `components/marketing/mobile-menu-toggle.tsx` | Client component. Hamburger/X toggle, absolute dropdown. |
| `MarketingHeader` | `components/marketing/header.tsx` | Logo, nav (Product, Pricing, Contact), Sign in + Request a Demo. |
| `MarketingFooter` | `components/marketing/footer.tsx` | 4-column grid: brand tagline, Product links, Company links, Legal (placeholder spans). |

---

## 4. Production Landing Page — Section-by-Section

### 4.1 Header

**Nav links:** Product (`/#how-it-works`), Pricing (`/pricing`), Contact (`/contact`)
**CTAs:** Sign in (`/signin`), Request a Demo (`/contact`)
**Mobile:** Hamburger toggle with same links.

### 4.2 Hero

| Element | Content |
|---------|---------|
| **Headline** | "Replace your legacy table games system." |
| **Subhead** | "Player Tracker is a full replacement system of record for table games operations — built for card rooms ready to move past aging software and manual workarounds." |
| **Primary CTA** | Request a Demo → `/contact` |
| **Secondary CTA** | See How It Works → `#how-it-works` |
| **Tertiary link** | "Already ready to explore? Start setup" → `/start` |
| **Visual** | Placeholder box: "Shift dashboard screenshot" (no actual image). Hidden on < lg. |

### 4.3 Pain Section (`#pain`)

**Headline:** "What legacy systems cost you."
**Subhead:** "The system works — until it doesn't. These are the operational costs that don't show up on the invoice."

| # | Pain Point | Description |
|---|-----------|-------------|
| 1 | Weak floor visibility | Shift dashboard is a spreadsheet. Knowing what happened means asking around or waiting for reports. |
| 2 | Clumsy workflows | Paper rating slips. Manual data entry after the fact. Double-handling slows the pit and introduces errors. |
| 3 | Delayed reporting | Can't answer "how did the floor do today?" until hours later. Yesterday's news. |
| 4 | Manual reconciliation | Cash totals, chip fills, player activity — reconciling across binders and systems takes time nobody has. |
| 5 | Expensive vendor lock-in | Legacy vendor charges for every change. Adding a table, updating a threshold, or pulling a report costs time and money. |

**Layout:** 3-column grid (sm:2, lg:3).

### 4.4 What Changes (`#what-changes`)

**Headline:** "What changes on day one."
**Subhead:** "Player Tracker replaces the patchwork. Here's what your floor gets immediately."

| # | Win | Description |
|---|-----|-------------|
| 1 | Real-time floor picture | See active tables, open sessions, and player activity from one dashboard — not from walking the floor. |
| 2 | Shift-ready from day one | Rating slips, visits, buy-ins, and cash events captured in the system as they happen. No double-entry. |
| 3 | Instant operational answers | How did the floor do this shift? Who was rated? What was the total cash-in? Answers in seconds. |
| 4 | One system, one truth | Players, tables, ratings, loyalty, compliance — in one place. No cross-referencing binders and spreadsheets. |

**Layout:** 2-column grid.

### 4.5 Product Walkthrough (`#how-it-works`)

**Headline:** "See what you're getting."
**Subhead:** "Player Tracker is built for the way card rooms actually operate — from shift start to close."

Uses `FeatureShowcase` component — alternating left/right layout. All have **placeholder images** (no screenshots yet).

| # | Feature | Description | Alt Text |
|---|---------|-------------|----------|
| 1 | Shift dashboard | Live overview — active tables, open sessions, cash activity, shift KPIs. Everything a pit boss needs, updated in real time. | "Shift dashboard screenshot" |
| 2 | Player 360 | Full player profile with visit history, ratings, buy-ins, theoretical win, loyalty status. One screen replaces the binder, spreadsheet, and sticky note. | "Player 360 screenshot" |
| 3 | Table map and pit layout | Visual floor — which tables are open, who is seated, current activity. Configure areas, games, table positions to match physical layout. | "Pit map screenshot" |
| 4 | Operational logs | Structured, searchable event log with staff attribution. Cash transactions, threshold alerts, shift notes — audit-ready by default. | "Operational logs screenshot" |

### 4.6 Compliance Trust Band (`#compliance`)

**Headline:** "Compliance built in, not bolted on."
**Subhead:** "Player Tracker isn't a compliance product — it's an operations platform that happens to be audit-grade. The controls are structural, not cosmetic."

| # | Signal | Description |
|---|--------|-------------|
| 1 | Audit trail by default | Every mutation, transaction, access — logged with staff attribution and timestamps. No add-on, no configuration. |
| 2 | Title 31 awareness | Currency activity capture, gaming-day-aware aggregation, threshold monitoring built into operational flow — not bolted on. |
| 3 | Row-level security | Casino-scoped data isolation at the database level. Staff see only their property. No shared logins, no leaky queries. |
| 4 | Immutable financial records | Cash transactions, loyalty ledger entries, rating slip financials are append-only. The record is the record. |

**Layout:** 2-column grid.

### 4.7 Pricing Teaser (`#pricing`)

**Headline:** "One product. One price per property."
**Subhead:** "No tiers. No modules. No per-seat pricing games. You get the full platform for each property you operate."

**Included list (8 items):**
1. Shift dashboard and floor overview
2. Player profiles and visit tracking
3. Rating slips and theoretical win
4. Cash activity and threshold monitoring
5. Loyalty points and rewards
6. Operational logs and audit trail
7. Role-based access control
8. Ongoing updates and support

**CTA:** Talk to Us About Pricing → `/contact`

### 4.8 FAQ (`#faq`)

**Headline:** "Common questions."

| # | Question | Answer Summary |
|---|----------|----------------|
| 1 | What does Player Tracker replace? | Legacy table games systems — paper slips, standalone tracking software, spreadsheets, manual logs. Becomes your SoR for sessions, ratings, cash activity, loyalty. |
| 2 | Who is this built for? | Owner-operators, GMs, operations leads at small card rooms. "If you run a floor and feel limited by your current systems, this is for you." |
| 3 | Is this a compliance product? | No. Operations platform with compliance built into architecture. Supports your compliance program, doesn't replace it. |
| 4 | How long does setup take? | Guided wizard — areas, tables, games, staff. Most properties operational within a single session. |
| 5 | Can I import data from my current system? | Yes. Supervised import tool. Records quarantined, classified by match confidence, applied after admin review. |
| 6 | What about pricing? | One product, one price per property. No tiers, no per-seat fees. Contact for details. |
| 7 | Do I need to talk to someone before I can use it? | Short walkthrough recommended. Self-serve available if preferred. |

**Component:** shadcn `Accordion` (single, collapsible). `'use client'`.

### 4.9 Final CTA

**Headline:** "Talk to us about your floor."
**Subhead:** "We'll walk through how Player Tracker fits your property — your tables, your workflows, your pain points. No pitch deck."
**Primary CTA:** Book a Walkthrough → `/contact`
**Secondary CTA:** See Pricing → `/pricing`

### 4.10 Footer

**Brand tagline:** "The table games system your card room has been waiting for."

| Column | Links |
|--------|-------|
| Product | How it works, Compliance, Pricing |
| Company | Contact, Sign in |
| Legal | Privacy Policy (span), Terms of Service (span) — not linked |

**Copyright:** Dynamic year.

---

## 5. Pricing Page (`/pricing`)

**Headline:** "Pricing"
**Subhead:** "One product. One price per property. No tiers, no modules, no per-seat fees."

**"What you get" list (12 items):** Shift dashboard, player profiles, rating slips, cash activity, loyalty program, operational logs, MTL-style transaction log, role-based access control, row-level data isolation, guided setup wizard, player data import tools, ongoing updates and support.

**"How pricing works" section:** Per property, full platform, same features, same support, no upsells. "We'll work with you to find the right arrangement."

**CTA:** Talk to Us About Pricing → `/contact`

---

## 6. Contact Page (`/contact`)

**Headline:** "Talk to us about your floor."
**Subhead:** "Tell us about your property and we'll set up a walkthrough. No sales pressure — just a conversation about whether Player Tracker is a good fit."

**Form fields:** Name (required), Property name (required), Email (required), Phone (optional), Message (textarea).
**Submit:** Client-side only — sets `submitted = true`, shows "Thanks for reaching out."
**Note:** "We typically respond within one business day."

---

## 7. Sign-in Page (`/signin`)

Wraps existing `<LoginForm />` component. Footer link: "Not sure where to start? Request a demo" → `/contact`.

---

## 8. Review Variants — Comparative Analysis

All three variants reuse the **same 8-section narrative structure** as production but with divergent visual treatments and prose adjustments.

### 8.1 Brutalist (`/review/landing-brutalist`)

**Visual identity:** Monospace font, uppercase headings, wide letter-spacing, numbered cards with `01`–`05` prefixes, `Badge` components, green dot status indicators. Cards use heavy 2px borders.

**Key prose differences from production:**

| Section | Production | Brutalist |
|---------|-----------|-----------|
| Hero badge | *(none)* | "System of Record for Table Games" |
| Hero subhead | "...built for card rooms ready to move past aging software" | "...Real-time player tracking, shift management, compliance, and reporting — built for the modern pit." |
| Status bar | *(none)* | SYSTEM STATUS: OPERATIONAL, LATENCY: <50ms, UPTIME: 99.97% |
| Pain subhead | "...costs that don't show up on the invoice" | "...daily operational friction" |
| Pain #1 detail | "Shift dashboard is a spreadsheet" | "Legacy systems give you a snapshot from 30 minutes ago" |
| Pain #5 detail | "charges for every change" | "charges six figures annually for software that hasn't meaningfully changed since the early 2000s" |
| What Changes subhead | "Here's what your floor gets immediately" | "Not a roadmap. Not a future release. These are operational improvements your floor staff experiences on day one." |
| Product subhead | "...the way card rooms actually operate" | "Four core surfaces that cover every aspect of pit operations. Each one designed for the person who actually uses it." |

**Pricing features (8 items, different from production):**
Unlimited users, all modules, shift+player+compliance, real-time pit map, Player 360, audit trail, API access, onboarding included.

**FAQ (7 items, different questions):** Deployment timeline (2-4 weeks), CMS/slot integration, historical data migration, pricing structure, data isolation, tablet support, support tiers.

### 8.2 Dark (`/review/landing-dark`)

**Visual identity:** Forced dark mode (`bg-[#0a0a0a]`), dot-grid background pattern, radial gradient spotlights, white/10 borders, accent-colored icons, animated pulse dot ("Now in early access"), interactive tab selector for product walkthrough.

**Key prose differences from production:**

| Section | Production | Dark |
|---------|-----------|------|
| Hero badge | *(none)* | "Now in early access" (animated pulse) |
| Hero headline | Single line | Line break: "Replace your legacy" / "table games system." (accent color on second line) |
| Hero subhead | "...built for card rooms ready to move past aging software" | "Built for pit bosses and floor supervisors who need to see the floor, rate players, and close the shift — without fighting their software." |
| Pain subhead | "...costs that don't show up on the invoice" | "...costs that never show up on a vendor invoice" |
| What Changes subhead | "Here's what your floor gets immediately" | "Player Tracker is not a dashboard bolted onto your existing mess. It replaces the mess." |
| Product subhead | "...the way card rooms actually operate" | "Four screens that run your floor. No bloat, no buried menus, no training manuals." |
| Compliance subhead | "...audit-grade. The controls are structural, not cosmetic." | "Regulatory readiness is not an add-on module. It is how the system was designed from the first line of code." |
| Final CTA subhead | "No pitch deck." | "Whether you manage four tables or four hundred, Player Tracker scales to your operation." |

**Product walkthrough:** Interactive tab selector (left rail) + single screenshot placeholder (right). Stateful (`useState`).

**Pricing features (9 items):** Adds "All table game types", "Loyalty engine", "Title 31 compliance tools" vs production.

**FAQ (7 items, different):** Implementation timeline (2 weeks), CMS/loyalty integration, table game support, pricing structure, data security, historical data, trial/pilot program.

### 8.3 Linear (`/review/landing-linear`)

**Visual identity:** Desaturated violet accent (`#5E6AD2`), Inter-style tight tracking, subtle radial glow behind hero, gradient text on hero headline, pill-shaped buttons (`rounded-full`), section labels in accent color, grid-border "What Changes" layout, centered compliance section, minimal footer.

**Key prose differences from production:**

| Section | Production | Linear |
|---------|-----------|--------|
| Hero pill | *(none)* | "Modern table games management" |
| Hero subhead | "...built for card rooms ready to move past aging software" | "Built for pit bosses and floor supervisors who need real answers, not workarounds." |
| Pain subhead | "...costs that don't show up on the invoice" | "...costs that compound quietly" |
| Pain #1 | "Shift dashboard is a spreadsheet" | "Decisions rely on radio chatter and gut feel." |
| What Changes subhead | "Here's what your floor gets immediately" | "Player Tracker replaces fragmented tools with a single, integrated system your floor team can trust from the first shift." |
| What Changes #2 | "No double-entry, no transcription lag" | "No six-month rollout. Player Tracker works with your pit structure, your rating criteria, your workflow." |
| Product subhead | "...the way card rooms actually operate" | "Purpose-built screens for the workflows your floor team runs every shift. No training manual required." |
| Compliance center | *(left-aligned)* | Centered heading + 4-column grid with icons |
| Compliance subhead | "...audit-grade" | "Regulatory requirements aren't afterthoughts. Player Tracker was designed from the data model up to satisfy gaming commission expectations." |
| Pricing CTA | "Talk to Us About Pricing" | "Get a Quote" |
| Final CTA subhead | "No pitch deck." | "Whether you're replacing an existing system or building your table games operation from scratch, we'll walk you through exactly how Player Tracker fits." |

**FAQ (7 items):** Adds "Is this approved for regulated gaming markets?" and "Can I run a pilot on a single pit?" vs production.

---

## 9. Prose Posture Summary

### Consistent across all variants

- **Headline:** "Replace your legacy table games system." (universal)
- **Positioning:** Replacement system of record, not a compliance product
- **Pain framing:** Legacy system operational friction (5 pain points, same titles everywhere)
- **Compliance stance:** "Built in, not bolted on" (exact phrase in all 4 versions)
- **Pricing stance:** "One product. One price per property." (exact phrase in all 4 versions)
- **Final CTA headline:** "Talk to us about your floor." (exact phrase in all 4 versions)
- **Trust signals:** Same 4 items everywhere (audit trail, Title 31, RLS, immutable records)
- **Product features:** Same 4 screens everywhere (shift dashboard, Player 360, table map, operational logs)

### Divergent across variants

| Dimension | Production | Brutalist | Dark | Linear |
|-----------|-----------|-----------|------|--------|
| **Hero badge/pill** | None | "System of Record" | "Now in early access" | "Modern table games management" |
| **Tone** | Matter-of-fact, mid-tempo | Assertive, blunt, technical | Atmospheric, confident | Polished, refined |
| **Pain descriptions** | Narrative, specific | Quantified ("six figures"), more operational friction | Terse, punchy | Emotional ("gut feel", "compound quietly") |
| **What Changes subhead** | Neutral ("here's what you get") | Direct ("Not a roadmap") | Confrontational ("It replaces the mess") | Trust-building ("a system your floor team can trust") |
| **Product subhead** | Feature-oriented | User-centric ("designed for the person who uses it") | Minimalist ("Four screens, no bloat") | Workflow-oriented ("purpose-built screens") |
| **FAQ topics** | Setup wizard, data import, self-serve | Deployment, CMS/slot integration, tablet | CMS/loyalty, game types, pilot program | Regulatory approval, pilot on single pit |
| **CTA language** | "Talk to Us About Pricing" | "Get Property Pricing" | "Get a Quote" | "Get a Quote" |

### Screenshot status

**All 4 versions use placeholder boxes.** No actual product screenshots have been captured or inserted anywhere.

---

## 10. Gaps & Observations

1. **No screenshots:** All product walkthrough sections show placeholder boxes. No images exist.
2. **`CTABlock` unused:** The shared `cta-block.tsx` component is imported nowhere. Hero and Final CTA sections inline their own button groups.
3. **Legal pages not linked:** Footer shows "Privacy Policy" and "Terms of Service" as non-interactive `<span>` elements.
4. **Contact form has no backend:** `handleSubmit` sets state only. No API call, no email, no webhook.
5. **Review variants are fully self-contained:** Each is 500-800 lines with duplicated data arrays. Not component-based — designed for visual comparison, not code reuse.
6. **Inconsistent FAQ sets:** Production has 7 questions, each variant has 7 different questions. Strongest questions are scattered across variants.
7. **Dark variant has interactive state:** Product walkthrough uses `useState` for tab selection — only variant with runtime interactivity beyond the accordion.
8. **"Now in early access" (Dark only):** This claim doesn't appear in production or other variants. May or may not reflect current positioning intent.
9. **Self-serve entry point:** Production hero links to `/start` ("Already ready to explore? Start setup"). No variant includes this.
10. **Mobile menu:** Production has `MobileMenuToggle`. No variant has mobile nav handling.
