# Player Tracker SaaS Landing Page Guide (v0.1)
**Date:** 2026-01-30  
**Scope anchor:** PRD-PATCH — START GATEWAY (Onboarding Mapping + Provisioning Bridge) v0.1 

This guide is a **layout + information architecture (IA)** playbook for a clean, credible SaaS landing page for *Player Tracker* that stays aligned with the Start Gateway PRD patch:
- `/` remains **public, static, SEO/caching-friendly**
- all onboarding/app entry is **deterministic via `/start`**
- no “blank app” states; CTAs always route into the correct wizard/app surface

---

## 1) North Star: what the landing page must do
Your landing page is not the app. It is a **trust-building funnel** that answers, in order:

1) **What is this?** (Player/shift CRM + ops telemetry for card rooms)  
2) **What does it solve today?** (pit/shift needs, consistency, audit trail, visibility)  
3) **How do I start without getting lost?** (Start Gateway deterministic routing)  
4) **Is it safe/compliant?** (security posture + data boundaries)  
5) **What happens after I click?** (bootstrap → setup → app)

Everything else is garnish. If you’re debating a section, ask: *does it increase clarity, trust, or conversion without leaking app logic into marketing?*

---

## 2) Route map and CTA rules (non-negotiable)
Per the PRD patch, the marketing site must wire CTAs like this:

- **“Get started”** → `/start`  
- **“Sign in”** → `/signin`  
- Marketing pages: `/pricing`, `/security`, `/contact` (public)  
- App pages: `/app/*` (auth-protected)

**Do not**:
- render auth-dependent content on `/`
- store onboarding state in local storage
- send users directly to `/app` from marketing CTAs

**Why:** `/start` is the bridge that maps auth + tenant provisioning + setup status to the correct wizard/app screen server-side. 

---

## 3) Recommended landing page structure (clean + conversion-minded)

### 3.1 Header (sticky)
**Left:** logo + product name  
**Right nav:** Product • How it works • Security • Pricing • Contact  
**Buttons:**  
- Primary: **Get started** → `/start`  
- Secondary: **Sign in** → `/signin`

Keep it boring and predictable.

---

### 3.2 Hero (above the fold)
**Goal:** immediate positioning + one confident CTA.

**Headline (example):**  
> Player Tracker: a shift-ready CRM for table games operations.

**Subhead (example):**  
> Track play, rewards, visits, and floor activity in one place—built for pit bosses and shift managers who need answers fast.

**Primary CTA:** Get started → `/start`  
**Secondary CTA:** View security → `/security`

**Optional credibility strip:** “Built for card rooms • Role-based access • Audit-first logs”

**Hero visual:** simple product mock (static image), not a live app screenshot that implies auth state.

---

### 3.3 “Problems we remove” (3–5 bullets)
Make these operational, not abstract “streamline synergy” nonsense.

- **No more blank states:** Start Gateway routes every user to the correct next step.
- **Fast player context:** win/loss, buy-ins, visits, rewards—visible without hunting.
- **Shift continuity:** standardized logs and consistent handover signals.
- **Audit posture:** append-only events where it matters; changes leave a trail.
- **One tenant truth:** staff binding + casino settings drive access and readiness.

---

### 3.4 Core capabilities (cards, 6 max)
Keep scope aligned with what exists or is explicitly in MVP scope. Use short titles and one sentence each.

Example card set:
1) **Player 360**
   - Value snapshot, visit history, reward history.
2) **Shift dashboards**
   - Running totals and operational visibility for the floor.
3) **Rewards history**
   - “Why didn’t I get a matchplay?” answered by timeline and issuance rules.
4) **Visits & sessions**
   - Who is in, who was in, and what happened.
5) **Operational logs**
   - Table events, rotations, and handover notes.
6) **Role-based access**
   - Staff roles + tenant scoping, no shared logins.

**Design rule:** 2 rows max on desktop. If you need more, your messaging is bloated.

---

### 3.5 How it works (the “Start Gateway” section)
This is where you *quietly* operationalize the PRD patch in plain language.

Use a 3-step timeline:

1) **Sign in**
   - Secure authentication.
2) **Bootstrap**
   - If you’re new, create your casino workspace and bind your staff account.
3) **Initial setup**
   - Configure basics (tables, settings). When ready, the app opens.

Add a small note:
- “Player Tracker never guesses where you belong—**it checks the database and routes you correctly**.” 

**Optional:** a micro-diagram (text is fine) showing:
`/ → /start → (/signin | /app/bootstrap | /app/setup | /app)`

---

### 3.6 Social proof (even if thin)
If you have none, don’t fake it. Use:
- “Designed with floor workflows in mind” + a short principles list
- or “Early access” language with a simple quote from *you* as the builder (honest)

---

### 3.7 Security & compliance teaser
A short section with a link to `/security`. Avoid over-claiming.

Bullets:
- Auth-protected `/app/*` routes
- Tenant isolation via staff binding + casino scoping
- Minimal marketing surface: no tenant data on `/start` (redirect-only)
- Audit-minded event logging patterns

Finish with: **Learn more** → `/security`

---

### 3.8 Pricing (simple, v0-friendly)
You’re not implementing billing now, so don’t build a pricing calculator.
Use a minimal block:
- “Pilot / Early access” plan (contact sales / request access)
- “Standard” placeholder (coming soon)

CTA: **Contact** → `/contact`  
Secondary CTA: **Get started** → `/start` (still fine)

---

### 3.9 Final CTA section (“Start clean”)
Repeat the core promise and funnel.

**Headline:**  
> Get operational in one guided path.

**Body:**  
> Start Gateway routes you to the right step—bootstrap, setup, or straight into the app.

Buttons:
- Get started → `/start`
- Sign in → `/signin`

---

### 3.10 Footer
- Product • Security • Pricing • Contact  
- Legal placeholders (Privacy, Terms) even if stubs
- Company address optional

---

## 4) Copywriting constraints (to prevent scope creep)
Keep language aligned with what your PRD actually guarantees.

### Say:
- “Guided setup”
- “Deterministic start”
- “Shift-ready dashboards”
- “Audit-first logs”
- “Role-based access”

### Avoid (until true):
- “AI insights”
- “Automated compliance”
- “Guaranteed profitability”
- “Real-time everything”

If a feature isn’t in v0 scope, it belongs on a “Roadmap” page later—not on `/`.

---

## 5) Visual system: clean layout rules
A clean SaaS landing lives or dies on spacing and hierarchy.

**Typography**
- One display font size for hero headline
- Body copy 16–18px equivalent
- Strict line length (60–80 chars)

**Grid**
- Max-width container ~ 1100–1200px
- 12-column grid feel; use 2/3/4 column sections

**Spacing**
- Section padding: 64–96px desktop, 40–64px mobile
- Card padding: 20–28px

**Color**
- Neutral base + 1 accent
- One primary button style across the site

**Components**
- Card
- Badge
- Button
- Accordion (for FAQs)
- Simple timeline

---

## 6) “Start Gateway” UI cues on marketing (subtle but explicit)
Because the Start Gateway is core to preventing confusion, surface it in marketing without turning `/` into app logic:

### A) Microcopy under “Get started”
> “We’ll route you to the right step automatically.”

### B) FAQ entry
**Q:** What happens after I click Get started?  
**A:** You’ll be routed to sign-in, bootstrap, setup, or the app—based on your account’s tenant binding and setup status. 

### C) On `/signin`
Add a short hint:
> “After sign-in, you’ll continue through the Start Gateway.”

---

## 7) FAQ (recommended set)
Keep it tight—5–7 questions.

1) **What is Player Tracker for?**  
2) **Who is it for? (pit, shift, ops, admin)**  
3) **What happens after I sign in?** (Start Gateway explanation) 
4) **Do I need to set up tables first?** (Yes, via setup wizard)  
5) **Can one user manage multiple casinos?** (Defer; non-goal) 
6) **Do you have billing?** (Defer)  
7) **How is data secured?** (link to /security)

---

## 8) Minimal wireframe outline (for implementation)
Use this as the skeleton in code.

1) Header (nav + CTA buttons)
2) Hero (headline, subhead, CTA, small mock image)
3) Problems removed (bullets)
4) Core capabilities (6 cards)
5) How it works (timeline + `/start` mapping)
6) Security teaser (bullets + link)
7) Pricing teaser (simple)
8) FAQ (accordion)
9) Final CTA
10) Footer

---

## 9) Quality bar checklist (ship/no-ship)
Before you call the landing page “done”:

- [ ] Primary CTA goes to `/start`, secondary auth CTA goes to `/signin` 
- [ ] `/` renders as fully static without auth-derived personalization 
- [ ] One clear value proposition in the hero, no buzzword soup  
- [ ] Capabilities list matches MVP scope (no speculative features)  
- [ ] “How it works” explains bootstrap/setup/app routing simply  
- [ ] Security page exists (even if short), and marketing doesn’t overpromise  
- [ ] Mobile layout is readable with sane spacing (no cramped cards)

---

## 10) Suggested next artifacts (optional)
If you want to keep this disciplined, generate these as short docs:

- [`COPY-DECK-v0.1.md` approved headlines, subheads, CTA copy](docs/00-vision/landing-page/COPY-DECK-v0.1.md)
- [`LANDING-IA-v0.1.md` final section order + components](docs/00-vision/landing-page/LANDING-IA-v0.1.md)
- `SECURITY-PAGE-v0.1.md` (claims + what you actually enforce)
