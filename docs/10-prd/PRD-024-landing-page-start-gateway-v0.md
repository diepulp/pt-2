---
prd_id: PRD-024
title: "Landing Page Overhaul + Start Gateway v0"
status: Draft
version: 0.1.0
created: 2026-01-30
updated: 2026-01-30
author: Claude (lead-architect + frontend-design-pt-2)
priority: P1
category: FEATURE/UI + FEATURE/AUTH
bounded_contexts:
  - MarketingContext (new)
  - OnboardingContext (new)
  - AuthContext
depends_on:
  - PRD-PATCH-START-GATEWAY-v0.1
  - PRD-WIZARDS-BOOTSTRAP-SETUP-v0.1
supersedes: []
tags: [landing-page, start-gateway, onboarding, marketing, shadcn, static-generation]
---

# PRD-024: Landing Page Overhaul + Start Gateway v0

## 1. Overview

- **Owner:** Product/Engineering
- **Status:** Draft
- **Summary:** Replace the placeholder landing page with a production-quality marketing surface for Player Tracker and implement the Start Gateway (`/start`) deterministic routing bridge. The landing page becomes a static, SEO-friendly trust-building funnel. The Start Gateway maps auth + tenant state to the correct onboarding wizard or app screen server-side, eliminating blank-app states. This PRD consolidates the landing page guide, Start Gateway PRD-PATCH, and architectural gap analysis into one shippable scope.

## 2. Problem & Goals

### 2.1 Problem

The current landing page (`app/(public)/page.tsx`) is a minimal placeholder with wrong branding ("PT-2 Pit Station"), no marketing content, and a single "Sign in" link. It calls `supabase.auth.getUser()` server-side, preventing static generation and violating the requirement for a public, cacheable marketing surface.

Additionally:
- **No onboarding funnel exists.** Users who sign up land in the dashboard with no guided path. If they lack a staff binding or their casino setup is incomplete, they see a broken app shell.
- **Existing landing page components** (`components/landing-page/`) use wrong branding ("CasinoTrack Pro"), fake testimonials and stats, HeroUI components (not aligned with the app's shadcn stack), and `'use client'` with `ssr: false` — defeating SEO and static generation.
- **Middleware is disabled** (`middleware.ts.bak`), leaving all routes unprotected.
- **Auth redirects are hardcoded** to `/pit`, bypassing any gateway logic.

### 2.2 Goals

1. **Static marketing surface** — `/` renders as a fully static Server Component with zero auth calls, serving trust-building content aligned to MVP scope.
2. **Deterministic onboarding** — `/start` gateway routes users to `/signin`, `/bootstrap`, `/setup`, or `/pit` based on DB truth (auth state, staff binding, `setup_status`).
3. **Correct branding** — All marketing content uses "Player Tracker" with copy aligned to the approved copy deck.
4. **No blank states** — Every CTA leads to a deterministic outcome. No user lands on a broken shell.
5. **Auth enforcement restored** — Middleware re-enabled with correct public/protected path classification.

### 2.3 Non-Goals

- **Wizard implementation** — Bootstrap (Wizard A) and Setup (Wizard B) pages are out of scope. Gateway redirects to placeholder routes; wizard PRDs ship separately.
- **Billing / subscription portal** — Pricing page is informational ("Contact us for access").
- **`/app/*` route prefix migration** — Existing dashboard routes stay at `/pit`, `/players`, etc. Prefix migration is a future breaking change.
- **Multi-casino per user** — Tenant picker deferred.
- **Marketing personalization by auth state** — `/` shows identical content to all visitors.
- **HeroUI retention on marketing surface** — HeroUI is replaced by pure shadcn/Tailwind. HeroUI remains available for internal app use.
- **Framer-motion / motion library on marketing** — CSS transitions only on the marketing surface. No JS animation libraries.

## 3. Users & Use Cases

### 3.1 Primary Personas

| Persona | Context |
|---------|---------|
| **Prospective customer** | Visits `/` to evaluate Player Tracker for their card room |
| **New user (no account)** | Clicks "Get started", signs up, enters onboarding |
| **Returning user (setup incomplete)** | Signs in, gets routed to setup wizard |
| **Active user** | Signs in, gets routed directly to the app dashboard |

### 3.2 Top Jobs

- As a **prospective customer**, I need to understand what Player Tracker does and whether it fits my card room, so that I can decide to sign up.
- As a **new user**, I need "Get started" to guide me through account creation and tenant provisioning, so that I never see a blank or broken app.
- As a **returning user with incomplete setup**, I need to be routed to the setup wizard automatically, so that I can finish configuring before using the app.
- As an **active user**, I need "Sign in" to get me into the app quickly, so that I don't waste time navigating through marketing pages.

## 4. Scope & Feature List

### Marketing Surface

1. **`(marketing)` route group** with shared layout (header + footer)
2. **Landing page** (`/`) — static Server Component with 10 sections per guide
3. **Marketing header** — sticky nav with Product, How it works, Pricing, Contact links; "Get started" (`/start`) + "Sign in" (`/signin`) CTAs
4. **Marketing footer** — nav links, legal stubs, copyright
5. **Hero section** — headline, subhead, CTAs, credibility strip, static product mock
6. **Problems section** — 5 operational pain points
7. **Capabilities section** — 6 cards aligned to MVP scope
8. **How It Works section** — 3-step Start Gateway timeline
9. **Social proof section** — principles list (no fake testimonials)
10. **Pricing teaser section** — 2 tiers (pilot/early access + coming soon)
11. **FAQ section** — 7-question accordion (client island)
12. **Final CTA section** — repeat "Get started" + "Sign in"
13. **`/pricing` stub page**
14. **`/contact` stub page**

### Start Gateway

15. **`/start` gateway** — Server Component with decision tree: not authed → `/signin`, authed + no staff → `/bootstrap`, authed + staff + incomplete → `/setup`, authed + staff + ready → `/pit`
16. **`/signin` page** — wraps existing `LoginForm` in marketing layout
17. **`/auth/login` backwards-compat redirect** to `/signin`
18. **Database migration** — add `setup_status` and `setup_completed_at` to `casino_settings`

### Auth & Middleware

19. **Middleware re-enablement** — restore `middleware.ts` with expanded public path list
20. **Auth redirect update** — middleware redirects to `/signin` (not `/auth/login`)
21. **Dashboard layout auth guards** — re-enable commented-out auth checks (defense-in-depth)
22. **Post-login redirect** — `LoginForm` routes to `/start` instead of `/pit`
23. **Auth confirm redirect** — `auth/confirm/route.ts` defaults `next` to `/start`

### UI Consolidation

24. **Delete `components/landing-page/ui/`** — 47 duplicate shadcn files
25. **Update orphaned imports** — `ThemeToggle`, `Toaster` (sonner) point to `components/ui/`
26. **Deprecate `components/landing-page/`** — old HeroUI sections replaced by `components/marketing/`

## 5. Requirements

### 5.1 Functional Requirements

**Landing Page:**
- FR-1: `/` renders without any `supabase.auth.getUser()` or auth-dependent calls.
- FR-2: `/` serves as a Server Component eligible for static generation (`force-static`).
- FR-3: All section content matches the approved copy deck (`COPY-DECK-v0.1.md`).
- FR-4: Primary CTA ("Get started") links to `/start` on all sections.
- FR-5: Secondary auth CTA ("Sign in") links to `/signin`.
- FR-6: FAQ section uses shadcn Accordion as a client island within the Server Component page.
- FR-7: Mobile header toggle works as a client island (no full-page client boundary).
- FR-8: No HeroUI components on the marketing surface. shadcn + Tailwind only.
- FR-9: No JS animation libraries (framer-motion, motion/react). CSS transitions only.
- FR-10: No gradient text or gradient backgrounds.
- FR-11: Hero visual is a static product mock image (no live app screenshots, no external stock photos).

**Start Gateway:**
- FR-12: `GET /start` executes the decision tree per PRD-PATCH Section 4.
- FR-13: Gateway checks are server-side DB queries (not client state or local storage).
- FR-14: Staff binding check confirms `user_id = auth.uid()` AND `status = 'active'`.
- FR-15: Setup status read from `casino_settings.setup_status` for the staff's casino.
- FR-16: Gateway does not reveal tenant data on the page (redirect-only).

**Auth & Middleware:**
- FR-17: Middleware refreshes Supabase session on all routes.
- FR-18: Public paths (`/`, `/pricing`, `/contact`, `/signin`, `/start`, `/auth/*`) do not redirect to sign-in.
- FR-19: Protected paths (`/pit/*`, `/players/*`, `/loyalty/*`, `/compliance/*`, `/settings/*`, `/shift-dashboard/*`) redirect unauthenticated users to `/signin`.
- FR-20: `LoginForm` post-success navigates to `/start` (not `/pit`).
- FR-21: `auth/confirm` route defaults `next` parameter to `/start`.

### 5.2 Non-Functional Requirements

- NFR-1: Landing page Lighthouse Performance score >= 90 (static page, no client JS bundles beyond FAQ accordion and mobile nav).
- NFR-2: Marketing page total JS bundle < 50KB (excluding shared framework).
- NFR-3: `/start` gateway redirect completes within 500ms (single auth check + 1-2 DB queries).

> Architecture and schema details: see `LANDING-IA-v0.1.md` (component architecture), Start Gateway PRD-PATCH (decision tree), SRM v4.11.0 (bounded contexts).

## 6. UX / Flow Overview

### Marketing Flow
1. User lands on `/` (static marketing page)
2. Scrolls through: Hero → Problems → Capabilities → How it Works → Social Proof → Pricing → FAQ → Final CTA
3. Clicks "Get started" → navigates to `/start`

### Gateway Flow
```
/start
  ├── Not authenticated → /signin
  ├── Authenticated, no staff row → /bootstrap (placeholder)
  ├── Authenticated, staff active, setup != ready → /setup (placeholder)
  └── Authenticated, staff active, setup = ready → /pit
```

### Sign-in Flow
1. User clicks "Sign in" → `/signin` (marketing-layout page with LoginForm)
2. Enters credentials → form submits → auth succeeds
3. `LoginForm` navigates to `/start`
4. Gateway evaluates state → redirects to correct destination

### Route Map
```
(marketing)/          → /           Static landing page
(marketing)/pricing/  → /pricing    Pricing stub
(marketing)/contact/  → /contact    Contact stub
(marketing)/signin/   → /signin     Sign-in (wraps LoginForm)
(marketing)/start/    → /start      Gateway (Server Component redirects)
(public)/auth/*       → /auth/*     Existing auth flows
(onboarding)/bootstrap → /bootstrap  Wizard A placeholder
(onboarding)/setup    → /setup      Wizard B placeholder
(dashboard)/*         → /pit, /players, etc. (existing, protected)
```

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Blocks | Status |
|-----------|--------|--------|
| `casino_settings.setup_status` column | `/start` gateway decision tree | Not started — migration required |
| Middleware re-enablement | Auth enforcement for all protected routes | Disabled — `middleware.ts.bak` |
| Wizard A/B routes | `/bootstrap`, `/setup` redirect targets from gateway | Not built — PRD-WIZARDS drafted, no implementation |
| shadcn Accordion in `components/ui/` | FAQ section | Install required (`npx shadcn@latest add accordion`) |

### 7.2 Risks & Open Questions

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Middleware re-enablement surfaces auth bugs** | High — current system has NO active auth; re-enabling will expose broken flows | Test all auth paths (sign-in, sign-up, confirm, password reset, protected access) in dedicated PR before merging content changes |
| **Wizard routes don't exist** | Low — gateway can gracefully degrade | Gateway redirects all authed users to `/pit` until wizards are built; add `TODO` with tracking ref |
| **Content rewrite scope creep** | Medium — 10 sections is substantial | Use `COPY-DECK-v0.1.md` verbatim; polish in follow-up PRD |
| **47 duplicate shadcn files create import confusion** | Low — mechanical cleanup | Delete `components/landing-page/ui/` in consolidation phase; update orphaned imports |

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `/` renders the complete 10-section landing page as a static Server Component
- [ ] All section content matches `COPY-DECK-v0.1.md`
- [ ] "Get started" CTA navigates to `/start` from all placement points
- [ ] "Sign in" CTA navigates to `/signin`
- [ ] `/start` executes the gateway decision tree and redirects correctly for all 4 states
- [ ] `/signin` renders the sign-in form within marketing layout
- [ ] `/pricing` and `/contact` render stub content
- [ ] Post-login flow routes through `/start` (not directly to `/pit`)

**Data & Integrity**
- [ ] `casino_settings.setup_status` field exists with correct type and default
- [ ] `types/remote/database.types.ts` regenerated after migration
- [ ] Gateway gracefully handles missing staff rows and missing casino_settings

**Security & Access**
- [ ] Middleware is active and enforcing auth on protected routes
- [ ] Public routes accessible without authentication
- [ ] Dashboard and protected layouts re-enable auth guards (defense-in-depth)
- [ ] Gateway does not expose tenant data on `/start` page

**Testing**
- [ ] Landing page renders without errors in `npm run build` (static generation succeeds)
- [ ] Gateway redirect paths covered by unit or integration test
- [ ] Auth flow (sign-in → gateway → app) tested end-to-end

**Operational Readiness**
- [ ] No `console.*` calls in production marketing components
- [ ] No HeroUI imports in marketing surface components
- [ ] No framer-motion/motion imports in marketing surface components

**Documentation**
- [ ] `COPY-DECK-v0.1.md` finalized (approved section content)
- [ ] `LANDING-IA-v0.1.md` finalized (component architecture and decisions)
- [ ] Known limitations documented (wizard placeholders, pricing stub)

## 9. Related Documents

| Document | Purpose |
|----------|---------|
| `docs/00-vision/landing-page/player-tracker-landing-page-guide-v0.1.md` | Source guide — layout, IA, copy constraints, visual system |
| `docs/00-vision/landing-page/COPY-DECK-v0.1.md` | Approved headlines, subheads, CTA copy, FAQ content |
| `docs/00-vision/landing-page/LANDING-IA-v0.1.md` | Component architecture, route structure, visual specs, confirmed decisions |
| `docs/00-vision/company-onboarding/PRD-PATCH-START-GATEWAY-v0.1.md` | Start Gateway decision tree, data signals, acceptance criteria |
| `docs/00-vision/company-onboarding/PRD-WIZARDS-BOOTSTRAP-SETUP-v0.1.md` | Wizard A/B specs (dependency, not in this PRD scope) |
| `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Bounded context registry (v4.11.0) |
| `docs/30-security/SEC-002-casino-scoped-security-model.md` | Casino-scoped multi-tenancy model |
| `docs/80-adrs/ADR-030-auth-pipeline-hardening.md` | Auth hardening decisions (middleware, defense-in-depth) |

---

## Appendix A: Phased Rollout

> **For `prd-pipeline` consumption.** Maps scope items to ordered PRs.

### Phase 0 — Database Foundation (PR-1)
**Scope items:** #18 (migration)
- Add `setup_status text NOT NULL DEFAULT 'not_started'` to `casino_settings`
- Add `setup_completed_at timestamptz` to `casino_settings`
- Run `npm run db:types`
- **Depends on:** nothing

### Phase 1A — Middleware Re-enablement (PR-2a)
**Scope items:** #19, #20, #21
- Restore `middleware.ts` from `.bak` with expanded public paths
- Update redirect target from `/auth/login` to `/signin`
- Re-enable dashboard/protected layout auth checks
- **Depends on:** nothing (parallel with Phase 0)

### Phase 1B — Route Structure Scaffold (PR-2b)
**Scope items:** #1, #13, #14, #15, #16, #17, #26
- Create `(marketing)` route group with layout
- Create marketing header + footer (`components/marketing/`)
- Create stub pages: `/pricing`, `/contact`, `/signin`
- Create `/start` gateway Server Component
- Create `(onboarding)` placeholder routes
- Redirect `/auth/login` → `/signin`
- **Depends on:** Phase 0 (gateway queries `setup_status`)

### Phase 2 — Landing Page Content (PR-3)
**Scope items:** #2, #3, #4, #5, #6, #7, #8, #9, #10, #11, #12
- Rebuild landing page as Server Component (no `'use client'`)
- Implement all 10 sections per guide + copy deck
- Pure shadcn/Tailwind, no HeroUI, no motion, no gradients
- Wire all CTAs to `/start` and `/signin`
- **Depends on:** Phase 1B (route group + layout exist)

### Phase 3 — Auth Flow Updates (PR-4)
**Scope items:** #22, #23
- `LoginForm`: `router.push('/pit')` → `router.push('/start')`
- `auth/confirm`: default `next` → `/start`
- **Depends on:** Phase 1B (gateway route exists)

### Phase 4 — UI Consolidation (PR-5)
**Scope items:** #24, #25, #26
- Delete `components/landing-page/ui/` (47 files)
- Update orphaned imports (`ThemeToggle`, `Toaster`)
- Deprecate `components/landing-page/` (old HeroUI sections)
- **Depends on:** Phase 2 (new marketing components replace old)
