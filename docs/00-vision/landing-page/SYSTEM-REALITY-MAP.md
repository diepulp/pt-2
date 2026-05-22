# PT-2 System Reality Map

**Date:** 2026-04-09
**Purpose:** Feature posture source of truth for landing page claims. What the system does today — not how it works.

---

## 1. Zachman Framework — Feature Posture

### Scope

| Column | Answer |
|--------|--------|
| **WHAT** | Players, tables, rating slips, visits, cash transactions, loyalty balances, compliance records |
| **HOW** | Track players, rate sessions, capture cash, earn and redeem loyalty, monitor thresholds, configure the property |
| **WHERE** | Shift dashboard, pit floor, player profiles, cashier console, compliance dashboard, admin settings |
| **WHO** | Admin, pit boss, cashier, dealer — four roles with access control |
| **WHEN** | Gaming day boundaries, shift windows, session lifecycles, compliance thresholds |
| **WHY** | Replace legacy systems with one system of record for floor operations |

---

### WHAT — What the system knows about

| Entity | What it captures |
|--------|-----------------|
| **Player** | Name, DOB, contact, card ID, enrollment, exclusion status, identity documents, loyalty tier |
| **Visit** | Check-in/out, gaming day, visit kind, session continuation chains |
| **Rating Slip** | Table, seat, average bet, play duration (pauses excluded), table move history |
| **Cash Transaction** | Buy-ins, cash-outs, adjustments, voids — all with staff attribution |
| **Loyalty** | Points balance, tier, full transaction ledger, reward history |
| **Table** | Label, game type, betting limits, pit/area, session status, chip inventory |
| **Compliance** | MTL entries, CTR thresholds, audit notes, exclusions |
| **Casino Config** | Timezone, gaming day start, bank mode, alert thresholds, loyalty valuation rate |

### HOW — What users can do

**Floor Operations (Pit Boss) — primary surface: Pit Terminal (/pit)**
- Navigate pits and tables, view real-time seat map with named occupants
- Manage full table session lifecycle: open, activate (custody gate), rundown, close
- Start new player sessions from any seat; seat-click opens session instantly
- Pause, resume, close, and move players between tables with session continuity
- Record buy-ins with live compliance threshold feedback (interlock prevents losing entry)
- Capture chip counts by denomination; take live inventory snapshots mid-shift
- View casino-wide active player list (up to 200 players, searchable, sortable)
- Monitor cash observation alerts, pending fill/credit approvals, and telemetry flags
- Review closed sessions and continue from any prior session (start-from-previous)
- View per-table analytics: attribution ratio, win/loss, estimated drop, hourly chart

**Shift Visibility (Pit Boss) — primary surface: Shift Dashboard (/shift-dashboard)**
- View casino-wide shift metrics, win/loss trends, coverage quality, and alerts
- Create mid-shift checkpoints and track performance deltas
- Search players instantly across the casino
- Issue loyalty rewards and print comp slips
- Create MTL entries with progressive threshold tracking

**Cashier Operations**
- Process and void cash-outs with audit trail
- Confirm fills and credits with discrepancy notes
- Acknowledge drop box receipts

**Admin Operations**
- Bootstrap a new casino property from scratch
- Run guided setup wizard (games, tables, par targets)
- Import player databases from legacy systems via CSV
- Invite staff with role-based access tokens
- Configure alert thresholds, shift boundaries, loyalty rates
- Manage reward catalog and promotional programs
- View measurement reports and system alerts

### WHERE — Operational surfaces

| Surface | What it shows |
|---------|--------------|
| **Shift Dashboard** | Casino-wide KPIs, coverage quality, alerts, trends |
| **Pit Terminal** | Primary shift-operations interface for pit supervisors. Five-panel tabbed surface: Tables (seat map, session lifecycle, custody gate), Active Sessions (casino-wide live player list), Inventory (chip counts, drop events, rundown report), Analytics (attribution ratio, table metrics, hourly activity), Closed Sessions (gaming-day history, start-from-previous). Right sidebar: Exceptions & Approvals (cash alerts, pending fill/credit confirmations, telemetry flags). |
| **Player 360** | Full player profile: identity, sessions, financials, loyalty, timeline |
| **Cashier Console** | Cash-out processing, fill/credit confirmations, drop acknowledgements |
| **Compliance Dashboard** | Per-patron daily cash aggregates with threshold alerts |
| **Admin Settings** | Alert thresholds, shift config, loyalty valuation policy, game definitions |
| **Reward Catalog Admin** | Reward definitions, points pricing, tier entitlement config, frequency limits — two families: points_comp (redeemable comps) and entitlement (match play / free play) |
| **Promo Program Admin** | Match play / free play program management: face values, required wager, date windows, lifecycle (active/inactive/archived), coupon inventory and exposure reporting |
| **Setup Wizard** | Step-by-step property configuration |
| **Player Import** | CSV upload with column mapping, validation, and batch processing |

### WHO — Role access

| Capability | Admin | Pit Boss | Cashier |
|-----------|-------|----------|---------|
| Shift dashboard & floor overview | Yes | Yes | -- |
| Player tracking & rating | Yes | Yes | -- |
| Cash-out & voids | -- | -- | Yes |
| Fill/credit/drop confirmations | -- | -- | Yes |
| Compliance dashboard & MTL | Yes | Yes | -- |
| Reward issuance | Yes | Yes | -- |
| Settings & reports | Yes | Yes | -- |
| Staff invites & setup | Yes | -- | -- |
| Player import | Yes | -- | -- |
| Lock screen (shared terminal PIN) | Yes | Yes | Yes |

### WHEN — Time boundaries

| Boundary | What it means |
|----------|--------------|
| **Gaming Day** | Configurable start time — all metrics, visits, and compliance thresholds reset at the boundary |
| **Shift Window** | Selectable time range for dashboard metrics |
| **Checkpoint** | User-created snapshot for tracking win/loss change during shift |
| **Table Session** | Open → Active → Rundown → Closed lifecycle with inventory gates |
| **Rating Slip** | Open → Pause/Resume → Close with auto-calculated play duration |
| **Compliance Thresholds** | $3,000 MTL / $10,000 CTR — progressive alerts during the gaming day |

### WHY — Business rules the system enforces

- Cash and loyalty records are permanent — corrections create new entries, never overwrite
- Each property's data is isolated at the database level
- Play duration automatically excludes pauses
- Table activation requires opening inventory confirmation
- Buy-in entry shows live compliance threshold proximity
- Table moves preserve session continuity
- Cash-out voids require a reason and audit note
- Loyalty overdraw requires supervisor authorization

---

## 2. FIB-S — High-Level System View

### F — Functions

```
F1  FLOOR OVERSIGHT
    Shift dashboard, checkpoint & delta, alerts, coverage quality, metrics drill-down

F2  PLAYER MANAGEMENT
    Search, Player 360, enrollment, identity verification, exclusions, CSV import

F3  SESSION TRACKING
    Visit check-in/out, rating slips, average bet, pause/resume, table moves,
    session continuation, unidentified player tracking

F4  TABLE OPERATIONS
    Session lifecycle, custody gate, seat map, betting limits, pit navigation,
    chip inventory, rundown reports

F5  CASH ACCOUNTABILITY
    Buy-ins, cash-outs, voids, fill/credit confirmations, drop acknowledgements,
    pit observations, visit financial summaries

F6  LOYALTY & REWARDS
    Auto points accrual, manual credits, redemption, comp slip issuance,
    tier entitlements, promo coupons, reward catalog, promo programs,
    exposure reporting, liability tracking, session reward preview

F7  COMPLIANCE & AUDIT
    MTL threshold tracking, CTR alerts, compliance dashboard, audit notes,
    player timeline, permanent financial records, printable compliance logs

F8  ADMINISTRATION
    Casino bootstrap, setup wizard, game configuration, alert thresholds,
    shift settings, valuation policy, staff invites, measurement reports

F9  ACCESS & SECURITY
    Login/signup/password reset, 4-role access control, lock screen, smart routing
```

### I — Information Flow

```
PLAYER → VISIT → RATING SLIP → THEORETICAL WIN
  │         │          │               │
  │         │          │               ▼
  │         │          │          LOYALTY (balance, tier, ledger)
  │         ▼          │               │
  │    CASH TRANS      │               ▼
  │    (buy-in,        │          REWARDS (comps, entitlements, coupons)
  │     cash-out,      │
  │     void)          │
  │         │          │
  │         ▼          ▼
  │    COMPLIANCE      TABLE / SESSION
  │    (MTL, CTR,      (status, inventory,
  │     audit notes)    drops, fills, bank)
  │
  ▼
  EXCLUSIONS (block, alert, monitor)

  Cross-cutting: staff attribution, timestamps, gaming day, casino isolation
```

### B — Behavior (Key Workflows)

1. **Shift start:** Login → smart routing → shift dashboard → checkpoint → monitor
2. **Player arrival:** Search → check-in → assign table → rate → pause/move/close → check-out
3. **Cash event:** Buy-in with threshold feedback → MTL alert at $3K → CTR banner at $10K
4. **Table lifecycle:** Open → custody confirmation → active play → rundown → close with inventory
5. **Reward:** Rating closes → points auto-earned → staff issues comp → print fulfillment
6. **New property:** Register → bootstrap casino → setup wizard → invite staff → operational
7. **Compliance review:** Navigate gaming days → patron aggregates → drill-down → audit notes → print

### S — Structure

```
MARKETING SITE  →  AUTH  →  GATEWAY (routes by status)
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         ONBOARDING      MAIN APP          ADMIN
         Register        Pit floor         Alerts
         Bootstrap       Shift dash        Reports
         Setup wizard    Player 360        Settings
         Player import   Cashier           Rewards
         Staff invites   Compliance        Promos
                         Loyalty
```

---

## 3. Feature Credibility Ledger

What the system does today, organized by landing page claim.

### Claim: "Real-time floor picture"

| Feature | Status |
|---------|--------|
| Casino-wide shift dashboard with KPIs | Working |
| Win/loss trend chart by pit | Working |
| Cash observation alerts by severity | Working |
| Pit and table metrics drill-down | Working |
| Coverage quality per table | Working |
| Shift time window selector | Working |
| Mid-shift checkpoint with delta tracking | Working |
| Floor activity radar (rated vs. unrated) | Working |
| Casino-wide active players list | Working |
| **9 features** | **9/9 working** |

### Claim: "Shift-ready from day one"

| Feature | Status |
|---------|--------|
| Casino bootstrap (register, name, timezone, gaming day) | Working |
| 5-step setup wizard (games, tables, par targets, review) | Working |
| Game catalog with common table games + custom game builder | Working |
| Auto-generate tables from game variants with smart labels | Working |
| Table bank mode selection (house/player/mixed) | Working |
| Staff invites with role assignment | Working |
| CSV player import (7-step wizard with vendor format support) | Working |
| Smart post-login routing | Working |
| **8 features** | **8/8 working** |

### Claim: "Player profiles and visit tracking"

| Feature | Status |
|---------|--------|
| Instant player search with keyboard shortcut | Working |
| Player 360 profile (identity, sessions, financials, loyalty) | Working |
| Summary metrics (session value, cash velocity, engagement, rewards) | Working |
| Weekly activity chart with multiple time ranges | Working |
| Filterable interaction timeline | Working |
| Visit check-in/out with session continuation | Working |
| Player enrollment and identity verification | Working |
| Exclusion management (block, alert, monitor) | Working |
| Profile editing | Working |
| Recent players list | Working |
| **10 features** | **10/10 working** |

### Claim: "Rating slips and theoretical win"

| Feature | Status |
|---------|--------|
| Create, pause, resume, close rating slips | Working |
| Play duration auto-calculated (pauses excluded) | Working |
| Average bet capture | Working |
| Theoretical win computation | Working |
| Player moves between tables with session continuity | Working |
| Start from previous session workflow | Working |
| Unidentified player tracking | Working |
| **7 features** | **7/7 working** |

### Claim: "Cash activity and threshold monitoring"

| Feature | Status |
|---------|--------|
| Buy-in recording with live threshold feedback | Working |
| Cash-out recording with large-amount confirmation | Working |
| Cash-out void with reason and audit note | Working |
| Fill/credit confirmation with discrepancy notes | Working |
| Drop acknowledgement | Working |
| Chip inventory by denomination | Working |
| Drop and fill tracking | Working |
| Bank summary and rundown report | Working |
| MTL threshold tracking ($3K progressive alerts) | Working |
| CTR threshold alert ($10K with regulatory reference) | Working |
| **10 features** | **10/10 working** |

### Claim: "Loyalty program — points, tiers, and rewards"

| Feature | Status |
|---------|--------|
| Automatic base accrual on rating slip close (theo-based, deterministic) | Working |
| Mid-session reward issuance — issue points while session is still open | Working |
| Manual points credit for service recovery (requires justification note) | Working |
| Promotional overlay credit — campaign multiplier or fixed bonus on top of base accrual | Working |
| Points redemption with supervisor-gated overdraw | Working |
| Reversal entries — reference original, remain permanently in ledger | Working |
| Append-only ledger — corrections never overwrite; full transaction history preserved | Working |
| Comp slip issuance with print fulfillment (face value, player name, staff attribution) | Working |
| Tier-locked entitlement rewards — match play and free play per player tier | Working |
| Entitlement coupon issuance with validation number and print fulfillment | Working |
| 5-tier loyalty system: bronze, silver, gold, platinum, diamond | Working (display; progression deferred) |
| Promo coupon lifecycle — issue, void, replace with full audit trail | Working |
| Anonymous promo coupon issuance (no player association required) | Working |
| Reward catalog management — create, configure, activate/deactivate rewards | Working |
| Promo program management with coupon inventory tracking | Working |
| Promo exposure and liability reporting — issued count, outstanding face value, patron at-risk | Working |
| Live session reward preview — estimated points visible during open session | Working |
| Multi-property loyalty display | Working |
| Idempotent issuance — deduplication key prevents double-credit on retry | Working |
| **19 features** | **19/19 working** |

### Claim: "Property-configurable loyalty economics"

> The loyalty program runs on the property's own rules — not vendor defaults.
> Operators set the exchange rate, build the reward catalog, define tier benefits,
> and create promotional programs with their own face values and wager requirements.

| Feature | Status |
|---------|--------|
| Valuation policy — configurable cents-per-point exchange rate, versioned with effective date | Working |
| Per-reward points cost — set how many points each comp or entitlement costs | Working |
| Per-reward overdraw permission — allow redemption below zero balance (supervisor role required) | Working |
| Per-reward fulfillment type — comp slip, coupon, or none per reward | Working |
| Tier entitlement config — define face values per tier for match play or free play rewards | Working |
| Per-reward frequency limits — cap issuance per visit, per gaming day, per week, or per month | Working |
| Per-reward cooldown minutes — enforce minimum spacing between issuances of the same reward | Working |
| Note-required flag per frequency rule — mandate supervisor justification for specific rewards | Working |
| Promo program configuration — set face value, required match wager, and active date window | Working |
| Promo program lifecycle — active, inactive, archived status management | Working |
| Earn configuration — points per theoretical win, default multiplier, rounding policy | Service layer working; admin UI deferred |
| Per-reward eligibility rules — min/max tier gates, minimum balance, visit kind filter | DTO and service layer working; admin UI deferred |
| **10 features working** | **2 admin UIs deferred** |

### Claim: "Compliance built in, not bolted on"

| Feature | Status |
|---------|--------|
| Staff attribution on every action | Working |
| Permanent financial records (no edits, no deletes) | Working |
| Permanent loyalty ledger | Working |
| MTL entry creation with threshold awareness | Working |
| CTR alert with regulatory reference | Working |
| Compliance dashboard (per-patron daily aggregates) | Working |
| Audit notes on compliance records | Working |
| Casino-scoped data isolation | Working |
| Void audit trail (reason + note + linked reversal) | Working |
| Exclusion management | Working |
| Identity verification | Working |
| Table custody gate (opening inventory required) | Working |
| Printable compliance records | Working |
| **13 features** | **13/13 working** |

### Claim: "Pit terminal — primary shift-operations surface"

| Feature | Status |
|---------|--------|
| Five-panel tabbed interface with collapsible sidebar navigation | Working |
| Keyboard shortcuts (Cmd/Ctrl + 1–5) and mobile swipe / bottom-tab navigation | Working |
| Visual seat map with named occupant display and real-time subscription updates | Working |
| Multi-pit navigation — select any pit and table without leaving the surface | Working |
| Session lifecycle toolbar — new slip, activate, rundown, edit limits, enroll player, close session | Working |
| Custody activation gate — OPEN → ACTIVE transition requires opening inventory confirmation (non-bypassable) | Working |
| Unsaved buy-in interlock — non-dismissible prompt blocks session close when a financial entry is pending | Working |
| Casino-wide live player list — up to 200 active players across all pits, searchable and sortable | Working |
| Per-player session detail: name, DOB, table/pit, seat, duration, status, loyalty tier, avg bet | Working |
| Table inventory panel — chip counts by denomination, bank total, drop events for gaming day | Working |
| Chip Count Capture dialog — take a live inventory snapshot at any point during the shift | Working |
| Rundown report card — available during ACTIVE and RUNDOWN session states | Working |
| Table analytics — attribution ratio, coverage tier, win/loss, estimated drop, avg session, hourly activity chart | Working |
| Session breakdown by player segment — count and theoretical win per segment | Working |
| Closed sessions panel — gaming-day closed slips with player name, duration, avg bet, loyalty tier | Working |
| Start-from-previous — one-click workflow to continue a player's session from any closed slip | Working |
| Exceptions & Approvals sidebar — cash observation spike alerts with severity levels | Working |
| Exceptions & Approvals sidebar — pending fill/credit approvals awaiting cashier confirmation | Working |
| Exceptions & Approvals sidebar — flagged tables with no telemetry coverage | Working |
| Realtime status indicator visible in sidebar footer | Working |
| Reconciliation badge on sessions with unresolved inventory discrepancies | Working |
| **21 features** | **21/21 working** |

### Claim: "Role-based access control"

| Feature | Status |
|---------|--------|
| Four roles (admin, pit boss, cashier, dealer) | Working |
| Admin area gating | Working |
| Alert badge visibility by role | Working |
| Lock screen for shared terminals | Working |
| Staff invites with role selection | Working |
| Smart routing by staff status | Working |
| Supervisor authorization for loyalty overdraw | Working |
| **7 features** | **7/7 working** |

### Claim: "Table map and pit layout"

| Feature | Status |
|---------|--------|
| Visual table with seat positions | Working |
| Seat occupancy display | Working |
| Multi-pit navigation with search and favorites | Working |
| Table status indicators | Working |
| Table session lifecycle (open/activate/rundown/close) | Working |
| Betting limits editor | Working |
| **6 features** | **6/6 working** |

### Claim: "Guided setup wizard"

| Feature | Status |
|---------|--------|
| Company registration | Working |
| Casino bootstrap (name, timezone, gaming day) | Working |
| Game configuration (catalog + custom) | Working |
| Table creation with smart labeling | Working |
| Par target setting | Working |
| Review and completion | Working |
| **6 features** | **6/6 working** |

### Claim: "Player data import"

| Feature | Status |
|---------|--------|
| CSV file upload with vendor labeling | Working |
| Auto-detect column mapping | Working |
| Data preview before processing | Working |
| Batch processing with progress tracking | Working |
| Execution with validation | Working |
| Import report (created, updated, skipped, errors) | Working |
| **6 features** | **6/6 working** |

---

## 4. Landing Page Credibility Assessment

### All claims supported

Every claim on the production landing page maps to working features. Total: **124 working features across 11 domains** (2 loyalty admin UI items deferred, service layer working).

> **Note:** The Pit Terminal surface (21 features) and the Loyalty configuration domain (12 features, 10 working) were entirely absent from the prior credibility assessment. Both are strong product differentiators and must be represented on the landing page.

### Fabricated claims — must be removed

| Claim | Source | Problem |
|-------|--------|---------|
| "Slot system integration is on the roadmap" | Brutalist FAQ | No slot integration exists or is planned. Fabricated. **Remove.** |
| "Direct Slack channel for first 90 days" | Linear FAQ | No Slack support channel exists. Fabricated. **Remove.** |

### Claims that need qualification

| Claim | Reality | Fix |
|-------|---------|-----|
| "Most properties operational within a single session" | Setup wizard is fast; CSV import is a separate multi-step process | Reword to separate setup from data migration |
| Tier progression | Tiers display correctly; automatic promotion not yet implemented | Don't promise automatic tier advancement |
| "2-4 week deployment" | Plausible but unverified | Say "within weeks" not a specific number |

### What the landing page undersells

| Capability | Why it matters for marketing |
|-----------|------------------------------|
| **CSV player import** | The rapid-deployment bridge. Properties walk in with thousands of player records — this is what makes "shift-ready from day one" real. Currently buried as a checkbox item. Deserves featured treatment. |
| **Casino bootstrap + setup wizard** | Register, name your property, configure games and tables, invite your team — all in one session. The "zero to operational" story is stronger than the landing page tells it. |
| **Admin custom settings** | Threshold alerts, gaming day boundaries, loyalty valuation rates, bank mode — the property runs on its own rules, not vendor defaults. Addresses the "expensive vendor lock-in" pain directly. |
| **Checkpoint & delta tracking** | Unique feature. Take a snapshot mid-shift, track how performance changes. No legacy system does this. |
| **Buy-in threshold indicator** | Compliance feedback during data entry, not after. The strongest Title 31 proof point. |
| **Cashier console** | Entire role surface (3 tabs: cash-outs, confirmations, drops) not mentioned on landing page at all. |
| **Player interaction timeline** | Filterable chronological log of everything that happened with a player. Powerful audit and operational tool. |
| **Visit continuation** | Players move tables, take breaks, come back — the system treats it as one continuous session. "Visit tracking" undersells this. |
| **Custody activation gate** | Table can't go active without confirming opening inventory. Structural compliance, not a checkbox. |
| **Exclusion management** | Block, alert, or monitor — handles self-exclusions, trespass, regulatory bans. |
| **Gaming day configuration** | The system understands that a casino day doesn't start at midnight. |

---

## 5. Total Feature Inventory

| Domain | Working | Deferred UI |
|--------|---------|-------------|
| Pit Terminal (shift-operations surface) | 21 | — |
| Floor Oversight | 9 | — |
| Player Management | 10 | — |
| Session Tracking | 7 | — |
| Table Operations | 6 | — |
| Cash Accountability | 10 | — |
| Loyalty & Rewards (floor-facing) | 19 | — |
| Loyalty — Property Configuration (admin) | 10 | 2 |
| Compliance & Audit | 13 | — |
| Administration (setup, bootstrap, config, import) | 12 | — |
| Access & Security | 7 | — |
| **TOTAL** | **124** | **2** |

124 working features across 11 domains, 2 admin UI items deferred (earn config UI, eligibility UI). Every landing page claim is backed by implemented, working functionality.

> **Surface overlay note:** The Pit Terminal, Loyalty floor-facing, and Loyalty configuration entries supplement the underlying domain entries — they document surface and configuration area visible to buyers, not additional distinct features.
