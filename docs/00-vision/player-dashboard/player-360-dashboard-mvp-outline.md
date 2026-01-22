# Player 360° Dashboard — MVP Development Areas (High-Level)

Goal: Build an **MVP-scoped CRM dashboard** that provides a **360° view of each player/customer** by feeding data pipelines from multiple sources, creating a **single source of truth** for customer interactions and history. The dashboard is envisioned as a blend of **analytical** and **collaborative** CRM: it shares customer information across operational dashboards (e.g., shift reports) while analyzing customer data for patterns and insights.

---

## 1) Source-of-truth model (the spine)

This is the canonical definition of “a player” and what the dashboard treats as reality.

- **Player master identity**
  - Player core profile (name/DOB/contact, identifiers, status)
  - Casino-scoped identity links (player ↔ casino, enrollment, tier/flags)
  - Dedup/merge strategy (MVP can be manual merge + audit log)

- **Interaction timeline as the primary UI primitive**
  - Everything becomes an event: visits, rating slips, rewards, notes, transactions, incidents, exclusions, communications
  - A single sortable timeline drives the “360 view”

- **Facts vs derived metrics**
  - Facts: append-only events (auditable)
  - Derived: computed aggregates (theo, ADT, worth bands, recency, volatility)

---

## 2) Data ingestion and pipelines (how truth gets in)

MVP doesn’t need fancy streaming. It needs **repeatable, idempotent ingestion**.

- **Data sources (typical)**
  - Rating slip telemetry (table activity)
  - Financial transactions (buy-in/cash-out; marker if ever added)
  - Loyalty ledger (rewards issued, points movement)
  - Staff notes / interactions (collaborative CRM layer)
  - Compliance logs (MTL/CTR-related tracking, if in scope)

- **Pipeline patterns**
  - Append-only writes + idempotency keys
  - Reconciliation strategy (how “corrections” are represented)
  - Backfill strategy (no historical data now, but design for future backfills)

---

## 3) Analytics layer (the “statistical model” boundary)

This is where the dashboard decides what it *knows* (derived) vs what it merely *shows* (facts).

- **MVP player metrics (high leverage)**
  - Recency / frequency (visits, sessions)
  - Monetary proxies (cash-in totals, average buy-in, net direction if tracked)
  - Table activity proxies (time played, avg bet, theo if you have rules)
  - Reward usage + responsiveness (issued vs redeemed vs ignored)
  - Staff interactions count (notes, disputes, service touches)

- **Player segmentation (simple first)**
  - Worth banding (low/med/high by theo or cash-in)
  - Risk/attention flags (high volatility, high cash activity, disputes)
  - Engagement bands (active / cooling / dormant)

- **Insights (MVP-safe)**
  - Favor **change detection** over predictions:
    - “Player has dropped 60% in visits vs their last 30 days”
    - “Avg session length up, but cash-in down”
  - Avoid ML in MVP: start with **rules + deltas**

---

## 4) Collaboration + workflow (CRM, not just charts)

This is where dashboards become operationally useful.

- **Shared artifacts**
  - Player notes (author + timestamp + visibility rules)
  - Tags/flags (VIP, service preferences, dispute history, comps sensitivity)
  - Tasks/reminders (lightweight: “follow up next visit”)

- **Cross-dashboard portability**
  - Shift reports should be able to pull the same player snapshot:
    - “who is in the room”
    - “who needs attention”
    - “who had an incident”

---

## 5) UI/UX composition (how humans consume the 360)

Treat the dashboard as a few stable panels.

- **Core layout**
  - Header: identity, tier/status, quick flags
  - Left: key metrics (small set, high confidence)
  - Center: timeline (events feed)
  - Right: collaboration (notes, tags, tasks)
  - Tabs: Visits / Play / Rewards / Transactions / Compliance (only if needed)

- **MVP rule**
  - If it doesn’t land into the timeline as an event, it probably doesn’t belong yet.

---

## 6) Security, audit, and governance (don’t bolt it on later)

Especially in casino ops, your CRM will be interrogated.

- **RLS + actor attribution**
  - Every interaction event: who did it, when, under which role

- **Audit trail**
  - Notes edits, merges, manual overrides are logged

- **Data correctness posture**
  - Display “source” and “last updated” for key facts (reduces staff folklore)

---

## 7) Performance & delivery mechanics (MVP without regret)

This is where you decide how metrics are served and kept responsive.

- **Read patterns**
  - Real-time where it matters (current visit / active slip), cached elsewhere

- **Aggregation strategy**
  - Start with simple queries/views; materialize only when pain appears

- **Definition of Done discipline**
  - Each dashboard panel must define:
    - authoritative source tables
    - update path
    - RLS policy coverage
    - failure mode (missing data, stale data)

---

# A sane MVP slice (to avoid building a universe)

Start with **one player page** that includes:

1. Player header + flags  
2. Unified timeline of events (visit + rating slip + rewards + staff notes)  
3. 6–10 core metrics (recency/frequency + 2–3 money proxies + 2–3 play proxies)  
4. Notes + tags + “attention needed” indicator  
5. “Used in shift report” summary widget (same truth, different lens)

Next step after this outline: **define the canonical event schema** (“interaction” taxonomy), then map each existing table/RPC into those event types and the minimum metric set.
