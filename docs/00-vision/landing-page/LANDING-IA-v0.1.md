# Landing Page Information Architecture v0.1

**Date:** 2026-01-30
**Source:** `player-tracker-landing-page-guide-v0.1.md` Section 10
**Status:** Draft — awaiting review

---

## 1. Section Order (Final)

| # | Section | Component Type | Route/Anchor |
|---|---------|---------------|--------------|
| 1 | **Header** (sticky) | Server Component shell + Client island for mobile toggle | N/A |
| 2 | **Hero** | Server Component with client animation island | `#hero` |
| 3 | **Problems we remove** | Server Component (static bullets) | `#problems` |
| 4 | **Core capabilities** | Server Component (6 cards) | `#capabilities` |
| 5 | **How it works** | Server Component (3-step timeline) | `#how-it-works` |
| 6 | **Social proof** | Server Component (principles list) | `#principles` |
| 7 | **Pricing teaser** | Server Component (2 tiers) | `#pricing` |
| 8 | **FAQ** | Client Component (accordion) | `#faq` |
| 9 | **Final CTA** | Server Component (headline + buttons) | `#start` |
| 10 | **Footer** | Server Component | N/A |

> **Dropped:** Security teaser section and `/security` page — deferred. Security details available on request, not needed for the landing page target audience.

---

## 2. Route Structure

### Marketing (public, static)

```
app/
├── (marketing)/
│   ├── layout.tsx          # Marketing layout with shared header/footer
│   ├── page.tsx            # / — Landing page (force-static, NO auth)
│   ├── pricing/
│   │   └── page.tsx        # /pricing
│   └── contact/
│       └── page.tsx        # /contact
```

### Gateway + Auth (public, dynamic)

```
app/
├── (public)/
│   ├── layout.tsx          # Minimal layout (no marketing chrome)
│   ├── start/
│   │   └── page.tsx        # /start — Gateway (Server Component, dynamic)
│   └── auth/
│       ├── login/page.tsx  # /auth/login (existing, keep for backwards compat)
│       ├── sign-up/page.tsx
│       └── ...
├── signin/
│   └── page.tsx            # /signin — redirect to /auth/login OR new sign-in page
```

### App (authenticated)

```
app/
├── (dashboard)/            # Existing — /pit, /players, /loyalty, etc.
│   └── layout.tsx          # Dashboard layout with sidebar + header
├── (protected)/            # Existing — /shift-dashboard
│   └── layout.tsx
```

### Migration note

The PRD specifies `/app/*` prefix for authenticated routes. Current routes are at root level (`/pit`, `/players`). For v0.1:
- `/start` gateway redirects to `/pit` (existing dashboard root)
- Future PR migrates to `/app/*` prefix (breaking change, separate effort)

---

## 3. Component Architecture

### Landing Page Component Tree

```
(marketing)/page.tsx                    # Server Component (static)
├── MarketingHeader                     # Server + client island
│   ├── Logo                            # Server
│   ├── NavLinks                        # Server (anchor links)
│   ├── MobileMenuToggle               # Client ('use client')
│   ├── GetStartedButton → /start      # Server (Link)
│   └── SignInButton → /signin          # Server (Link)
├── HeroSection                         # Server (shadcn + Tailwind, no HeroUI)
│   ├── Headline                        # Server (DM Sans, no gradient text)
│   ├── Subhead                         # Server
│   ├── CTAGroup                        # Server
│   │   ├── GetStartedButton → /start
│   │   └── SecondaryCTA → #how-it-works
│   ├── CredibilityStrip               # Server (shadcn Badge)
│   └── HeroVisual                     # Server (static Image, no stock photos)
├── ProblemsSection                     # Server
│   └── ProblemBullet × 5              # Server
├── CapabilitiesSection                 # Server
│   └── CapabilityCard × 6             # Server (shadcn Card)
├── HowItWorksSection                  # Server
│   └── TimelineStep × 3              # Server (custom component)
├── SocialProofSection                 # Server
│   └── PrincipleItem × 4             # Server
├── PricingTeaserSection               # Server
│   └── PricingTier × 2               # Server (shadcn Card)
├── FAQSection                         # Client ('use client')
│   └── AccordionItem × 7             # Client (shadcn Accordion)
├── FinalCTASection                    # Server
│   ├── GetStartedButton → /start
│   └── SignInButton → /signin
└── MarketingFooter                    # Server
    ├── NavLinks                       # Server
    └── LegalLinks                     # Server
```

---

## 4. Component Inventory

### New components needed

| Component | Location | Type | Notes |
|-----------|----------|------|-------|
| `MarketingHeader` | `components/marketing/header.tsx` | Server + Client island | Replaces HeroUI Navbar |
| `MarketingFooter` | `components/marketing/footer.tsx` | Server | Replaces HeroUI Footer |
| `HeroSection` | `components/marketing/sections/hero.tsx` | Server (shadcn/Tailwind only) | Replaces HeroUI hero. No gradients, no stock images. Clean typography + product mock. |
| `ProblemsSection` | `components/marketing/sections/problems.tsx` | Server | NEW section |
| `CapabilitiesSection` | `components/marketing/sections/capabilities.tsx` | Server | Replaces features-section |
| `HowItWorksSection` | `components/marketing/sections/how-it-works.tsx` | Server | NEW — timeline component |
| `SocialProofSection` | `components/marketing/sections/social-proof.tsx` | Server | Replaces testimonials-section |
| `PricingTeaserSection` | `components/marketing/sections/pricing-teaser.tsx` | Server | Replaces pricing-section |
| `FAQSection` | `components/marketing/sections/faq.tsx` | Client | NEW section |
| `FinalCTASection` | `components/marketing/sections/final-cta.tsx` | Server | NEW section |
| `TimelineStep` | `components/marketing/timeline-step.tsx` | Server | Custom (no shadcn equiv) |

### Existing shadcn components to use

| Component | Source | Used By |
|-----------|--------|---------|
| `Card` | `components/ui/card.tsx` | Capabilities, Pricing |
| `Badge` | `components/ui/badge.tsx` | Credibility strip, pricing tier labels |
| `Button` | `components/ui/button.tsx` | All CTAs |
| `Accordion` | `components/landing-page/ui/accordion.tsx` | FAQ (move to `components/ui/`) |
| `Separator` | `components/ui/separator.tsx` | Section dividers |

### Components to install

| Component | Command |
|-----------|---------|
| Accordion | `npx shadcn@latest add accordion` (into `components/ui/`) |
| Navigation Menu | Already in `components/landing-page/ui/` — move or reinstall |

---

## 5. Visual System Implementation

### Typography (per guide Section 5)

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Hero headline | DM Sans | `text-4xl md:text-5xl lg:text-6xl` | Bold |
| Section headlines | DM Sans | `text-3xl md:text-4xl` | Semibold |
| Body copy | DM Sans | `text-base md:text-lg` (16-18px) | Regular |
| Card titles | DM Sans | `text-lg` | Semibold |
| Code/technical | JetBrains Mono | `text-sm` | Regular |

### Grid (per guide Section 5)

```css
/* Max-width container */
.marketing-container {
  max-width: 1200px;
  margin-inline: auto;
  padding-inline: 1rem; /* 16px mobile */
}

@media (min-width: 640px) {
  .marketing-container { padding-inline: 1.5rem; }
}
@media (min-width: 1024px) {
  .marketing-container { padding-inline: 2rem; }
}
```

Tailwind: `max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8`

### Spacing (per guide Section 5)

| Context | Desktop | Mobile | Tailwind |
|---------|---------|--------|----------|
| Section padding (vertical) | 64-96px | 40-64px | `py-16 md:py-20 lg:py-24` |
| Card padding | 20-28px | 20px | `p-5 md:p-7` |
| Inter-section gap | 0 (padding handles it) | - | - |

### Color

Uses existing PT-2 Industrial theme from `globals.css`:
- **Background:** `hsl(40 33% 98%)` (light), `hsl(240 5.9% 10%)` (dark)
- **Foreground:** `hsl(24 10% 10%)` (light), `hsl(210 40% 98%)` (dark)
- **Accent:** Deep teal `hsl(189 94% 37%)` — single accent color
- **Primary button:** `bg-primary text-primary-foreground`

No new colors needed. Theme already follows the guide's "Neutral base + 1 accent" rule.

---

## 6. Decisions / Open Questions

| # | Decision | Status |
|---|----------|--------|
| 1 | Replace HeroUI with shadcn/Tailwind for marketing surface | **Confirmed** — drop HeroUI entirely from marketing. Use shadcn components + Tailwind utilities only. No gradients on text or backgrounds. |
| 2 | Keep `components/landing-page/` or create `components/marketing/` | **Recommend new `components/marketing/`** — clean break from HeroUI versions |
| 3 | Landing page as Server Component (static) vs Client Component | **Server Component - Confirmed** — guide requires static/SEO-friendly |
| 4 | Remove motion/react from marketing pages | **Remove entirely - Confirmed** — CSS transitions only. No framer-motion on marketing surface. |
| 5 | Move accordion from `landing-page/ui/` to `components/ui/` | **Yes** — install fresh via shadcn CLI |
| 6 | Disposition of existing `components/landing-page/` | **Deprecate - confirmed** — keep temporarily for reference, remove after new implementation ships |

---

## 7. Implementation Priority

**Phase 1 — Foundation (PR-1)**
- Create `(marketing)` route group with layout
- Create marketing header + footer components
- Wire `/` to render static landing page (no auth)
- Remove auth check from root page

**Phase 2 — Content Sections (PR-2)**
- Hero section (aligned copy)
- Problems section (new)
- Capabilities cards (6, MVP-scoped)
- How It Works timeline (new)

**Phase 3 — Supporting Sections (PR-3)**
- Pricing teaser
- FAQ accordion
- Final CTA
- Social proof / principles

**Phase 4 — Gateway + Routes (PR-4)**
- `/start` gateway implementation
- `/signin` route
- Middleware re-enablement
- CTA wiring validation

**Phase 5 — Marketing Pages (PR-5)**
- `/pricing` page
- `/contact` page
