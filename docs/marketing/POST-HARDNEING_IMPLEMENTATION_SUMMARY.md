# PT-2 — What It Is and What It Proves

**Date:** 2026-03-27 | **Status:** Post-hardening implementation summary
**Purpose:** Layman-readable reference for stakeholders, landing page foundation, and sales enablement
**Source of truth:** Verified against running system (wedge-c branch, CI green, 4/4 wedges GREEN)

---

## In One Sentence

PT-2 is a table games management system that tracks every dollar, every decision, and every person involved — and can prove it did so correctly.

---

## What Legacy Systems Do

Traditional casino pit management software tracks players, sessions, and money at gaming tables. It works. Properties have used these systems for decades. But they share a common limitation: **you have to take their word for it.**

When a legacy system reports that Table 12 generated $4,200 in theoretical win last Tuesday, there is no way to inspect the formula, trace the inputs, or verify the calculation independently. The math happens inside a black box. If the number is wrong, you may never know — and if you suspect it is wrong, you cannot prove it.

The same is true for audit trails (who changed what?), loyalty points (where did they come from?), and compliance records (can you reconstruct this for a regulator?). Legacy systems store results. They do not store proof.

## What PT-2 Does Differently

PT-2 stores proof. Every financial calculation is transparent. Every action is attributed to a specific person. Every record is traceable from origin to outcome. The system is designed so that any number it produces can be independently verified by reading the inputs that created it.

The rest of this document explains each capability in plain terms, with a brief description of how it works under the hood.

---

## The Six Pillars

### 1. Transparent Theoretical Win Computation

**What it means:**
When a player sits at a blackjack table for 45 minutes betting an average of $25, the casino needs to know the "theoretical win" — how much the house mathematically expects to earn from that session. This number drives player ratings, comp decisions, loyalty points, and tax reporting.

Legacy systems compute theo behind closed doors. PT-2 computes it from a published formula with visible inputs:

> **Theo = Average Bet x House Edge x Session Duration x Decisions Per Hour**

Every input is recorded: the house edge for that game variant (say, 1.5% for 6-deck blackjack), the number of decisions per hour (say, 70), the player's average bet ($25), and exactly how long they played (45 minutes). The result — $19.69 in theoretical win — is stored on the rating slip at the moment it closes, and it never changes after that.

**Why it matters:**
If a regulator, auditor, or pit boss asks "where did this theo number come from?", the answer is not "the system calculated it." The answer is: "average bet was $25, house edge was 1.5%, session was 45 minutes at 70 decisions/hour, and here is the formula." Anyone with a calculator can verify it.

**How it works:**
A SQL function called `calculate_theo_from_snapshot` takes the rating slip record and the game settings snapshot captured at the time the session was active. It computes theo as a deterministic product of those inputs. The result is stored in a column called `computed_theo_cents` on the rating slip row, set once when the slip closes, and immutable thereafter. The game settings that produced it are preserved in the slip's `policy_snapshot` — so even if the casino later changes the house edge for blackjack, the historical calculation remains reproducible from the inputs that were active at the time.

---

### 2. Immutable Financial Records

**What it means:**
When money moves — a player buys in, cashes out, receives a marker, or generates a financial event — PT-2 creates a record that cannot be edited or deleted. If a correction is needed, a new record is created that references the original. The original stays intact.

This is the same principle used in accounting ledgers: you don't erase entries, you post adjustments. PT-2 enforces this at the database level, not as a policy that staff are expected to follow.

**Why it matters:**
In legacy systems, records can sometimes be modified after the fact — a supervisor overrides a number, an admin corrects a transaction, a batch process adjusts historical data. Each modification creates a gap between what happened and what the system says happened. PT-2 eliminates that gap. What the system says happened is what happened, because the records cannot be altered after creation.

**How it works:**
Financial transactions are stored in a `player_financial_transaction` table with no UPDATE or DELETE permissions. Every transaction flows through a controlled pathway (an RPC — a database-level function that enforces business rules before writing). A bridge trigger automatically creates a corresponding entry in the `mtl_entry` table (Minimum Tracking Log — a regulatory compliance record). Both records are append-only: new rows can be inserted, but existing rows cannot be changed or removed.

---

### 3. Append-Only Loyalty Ledger

**What it means:**
Every loyalty point a player earns or redeems is recorded as a separate line item in a ledger — like entries in a checkbook. Points earned from a blackjack session are one entry. Points redeemed for a dinner comp are another entry. The running balance is the sum of all entries.

No entry can be edited after it is written. If a correction is needed (say, points were awarded in error), a new entry is created with a negative value and a reason code. The original award and the correction are both visible in the history.

**Why it matters:**
A player disputes their loyalty balance. In a legacy system, the investigation involves searching through opaque point adjustment screens and hoping the audit trail is intact. In PT-2, the investigation is reading the ledger: every accrual, every redemption, every correction, who triggered it, when, and why. The balance is always the sum of the visible entries — there is no hidden state.

**How it works:**
The `loyalty_ledger` table stores one row per loyalty event. Each row has a `points_delta` (positive for accrual, negative for redemption), a reason code, a reference to the triggering entity (rating slip, comp, manual adjustment), and an `idempotency_key` that prevents the same event from being recorded twice even if the system retries. No UPDATE or DELETE operations are permitted on the table. The player's current balance in `player_loyalty` is derived from the ledger sum.

---

### 4. Enforced Identity and Actor Attribution

**What it means:**
Every action in PT-2 — opening a table, rating a player, closing a slip, issuing a comp, acknowledging an alert — is permanently attributed to the specific staff member who performed it. This attribution is derived from the person's authenticated login, not from a parameter they provide. A pit boss cannot perform an action "as" another person, and the system cannot record an action without knowing who did it.

**Why it matters:**
Legacy systems often rely on shared logins, manual overrides, or trust-based attribution ("who was on shift?"). When a dispute arises — who authorized this comp? who changed this rating? — the answer may be ambiguous. PT-2 eliminates ambiguity: the actor is the person whose credentials were used, verified against the staff database at the moment of action. This is non-spoofable.

**How it works:**
Every database function that modifies data begins by calling `set_rls_context_from_staff()`. This function reads the authenticated user's identity from their login token, looks up their staff record in the database, and sets three session variables: `actor_id` (who), `casino_id` (where), and `staff_role` (what they're allowed to do). These variables are local to the current database transaction — they cannot be carried over or shared. Every row written during that transaction inherits these values. If the staff member is not active or their credentials are invalid, the function fails and no data is written.

---

### 5. Structured Audit Traceability

**What it means:**
PT-2 can trace any financial event from its origin (a player sitting down at a table) through every downstream effect (financial transaction, compliance record, loyalty accrual, audit log entry). The data model links these records by design — a rating slip ID threads through every downstream table, so the chain is always reconstructable.

**Why it matters:**
An auditor asks: "Show me the complete lifecycle of rating slip #4821." In a legacy system, that means manually joining information across multiple screens, possibly multiple systems, over the course of hours. In PT-2, that chain — from slip to financial transaction to MTL entry to loyalty ledger entry — is structurally linked and queryable in under a second.

**How it works:**
A database view called `measurement_audit_event_correlation_v` joins four tables along their natural relationships: `rating_slip` → `player_financial_transaction` (via slip ID) → `mtl_entry` (via slip ID) → `loyalty_ledger` (via slip ID). The view uses PostgreSQL's `security_invoker` feature, which means every user who queries it sees only the data their permissions allow — casino-scoped, role-gated, with no bypass. The view is live: it reads current data, not a cached snapshot. (Note: the `audit_log` join is deferred until append-only immutability is enforced on that table — the base lineage of slip → financial → MTL → loyalty is operational today.)

**Where it surfaces today:**
The audit trace is accessible through two UI surfaces:

- **Per-slip trace** — any closed rating slip can be expanded to show its full lifecycle chain: the financial transaction it generated, the MTL compliance entry, and the loyalty ledger accrual. This is a collapsible panel in the rating slip detail view, loaded on demand.

- **Casino-level aggregate** — the Admin Reports dashboard (`/admin/reports`) displays audit correlation health metrics: what percentage of closed slips have a complete chain (slip → financial → MTL → loyalty), and where the chain breaks (missing PFT, missing MTL, missing loyalty entry).

**What is not yet available:**
Ad-hoc report generation (e.g., "generate an audit report for Table 12 from March 1–15"), downloadable PDF/CSV exports, date-range filters on the correlation view, and per-pit or per-table breakdowns are not implemented. The data layer supports these queries — the view is live and filterable by slip ID — but no UI surface exposes parameterized report generation or export functionality today. When an auditor or regulator needs a custom trace, it is currently a database-level query, not a self-service admin tool.

---

### 6. Statistical Anomaly Detection

**What it means:**
PT-2 watches four key financial metrics at every table — drop (money in), hold percentage, win/loss, and cash observations — and automatically detects when today's numbers are unusual compared to recent history. "Unusual" is defined statistically: the system computes what is normal for each table over the past 7 days, and flags values that deviate significantly from that baseline.

When an anomaly is detected, it becomes a persistent alert that a pit boss can review, acknowledge with notes, or flag as a false positive. Alerts are not ephemeral notifications — they are auditable records with a full lifecycle.

**Why it matters:**
A table that normally drops $8,000 per shift suddenly drops $2,100. In a legacy system, that anomaly might be noticed by an experienced floor supervisor — or it might not. PT-2 detects it automatically, records it, and presents it to the pit boss with context: what the baseline was, how far the observation deviated, and a recommended action.

This is not a replacement for human judgment. It is a system that ensures anomalies are surfaced rather than silently absorbed into aggregate reports.

**How it works:**
A function called `rpc_compute_rolling_baseline` calculates a 7-day rolling median and MAD (Median Absolute Deviation) for each metric at each table. The median is the "typical" value. The MAD, scaled by a statistical constant (1.4826), measures how much day-to-day variation is normal.

When current values are compared against the baseline, the system computes a deviation score: how many MADs away from the median the observation falls. Values beyond a configurable threshold (set by the casino admin) trigger anomaly alerts.

Alerts are stored in a `shift_alert` table with a forward-only state machine: `open` → `acknowledged` → `resolved`. Each acknowledgment is recorded in a separate `alert_acknowledgment` table with the staff member's identity, notes, and a false-positive flag. Alerts are deduplicated (same table, same metric, same gaming day = one alert) with a configurable cooldown to prevent noise.

An `rpc_get_alert_quality` function provides aggregate telemetry: total alerts, acknowledgment rate, false positive rate, and median time-to-acknowledge — giving the casino visibility into whether their thresholds are tuned correctly or producing too much noise.

---

## Additional Operational Capabilities

### Rating Coverage Measurement

PT-2 measures what percentage of table operating time is covered by active rating slips. If a table was open for 8 hours but only 5 hours had rated players, the system reports 62.5% rating coverage for that table on that day. Unrated time is visible — it is not silently excluded from reports.

This gives floor supervisors a concrete metric for operational completeness: are we rating the play we should be rating?

*Implementation: `measurement_rating_coverage_v` — a live database view that joins table session records with rating slip durations to compute rated, ghost, idle, and untracked seconds per table per gaming day.*

### Daily Loyalty Liability Snapshots

PT-2 computes the total outstanding loyalty liability — how many points are in circulation across all players, and what those points are worth in dollars — every day. The snapshot records the point total, the dollar valuation (using the casino's configured redemption rate), and the version of the valuation policy that was active when the snapshot was taken.

If the casino changes its redemption rate from 10 cents per point to 8 cents per point, prior snapshots remain unchanged — they reflect what the liability was under the policy that was active at the time. This creates a trend line that separates point growth from policy changes.

*Implementation: `rpc_snapshot_loyalty_liability` — idempotent daily snapshot stored in `loyalty_liability_snapshot`, valued against `loyalty_valuation_policy` (versioned, effective-dated).*

### Comp and Coupon Fulfillment

Operators issue comps and promotional coupons from a single workflow. The admin defines a reward catalog (bonus points, free play, physical comps). Promotional programs bundle rewards into issuable instruments. Floor staff issue instruments to specific players. The system tracks issuance, fulfillment, and print-ready output.

Every issuance is attributed to the staff member who issued it, tied to the player who received it, and traceable to the promotional program that authorized it.

*Implementation: `loyalty_reward` (catalog) → `loyalty_promo_instrument` (program linkage) → `loyalty_operator_issuance` (per-player tracking) → `rpc_issue_promo_coupon` (role-gated issuance).*

### Cross-Property Player Recognition

When a casino operator runs multiple properties, PT-2 recognizes the same player across locations. A player rated at Casino A is immediately visible at Casino B if both properties belong to the same company. Loyalty totals reflect portfolio-wide activity.

*Implementation: `player` (single identity record) → `player_casino` (per-property enrollment bridge) → `company` (parent entity). Cross-property recognition via company-scoped player queries.*

### Admin-Configurable Operations

Casino-specific settings — gaming day start time, timezone, alert thresholds, baseline window, game variants (house edge, decisions per hour, seat count, min/max bet), promo rules — are all configurable through the admin interface without engineering involvement. Changes take effect immediately and are recorded in the audit trail.

*Implementation: `casino_settings` (operational config) + `game_settings` (per-game-variant rules) + `alert_thresholds` (nested JSONB for baseline window, cooldown, severity multipliers). All exposed via admin API routes and UI.*

---

## Baseline Provenance — How Tables Get Their Starting Numbers

When a table opens for a new gaming day, PT-2 needs to know its opening bankroll — the chips in the tray before any play begins. This number is the foundation for every financial calculation that follows. Getting it wrong cascades through the entire day's records.

PT-2 uses a ranked cascade to establish this baseline:

1. **Closing snapshot from prior gaming day** — if the table closed yesterday with a recorded chip count, that becomes today's opening baseline. This is the strongest source: it was observed, recorded, and attributed to a specific staff member.

2. **Last observation from prior session** — if a full closing snapshot doesn't exist, the system falls back to the most recent chip observation from the previous session.

3. **Chip custody event** — if no session-level data exists, the system looks for fill/credit chip custody records.

4. **Manual entry** — if no automated source exists, a supervisor enters the opening baseline manually.

Each source is tagged with its provenance: where the number came from and how reliable it is. A baseline derived from a closing snapshot carries higher confidence than a manual entry. This provenance classification is visible to operators and auditors — they can see not just the number, but the quality of the evidence behind it.

*Implementation: `rpc_shift_table_metrics` — LATERAL join cascade with ranked source selection. `opening_source` column records provenance type. `opening_bankroll_cents` records the value. `coverage_type` records the quality tier.*

---

## What PT-2 Does Not Claim

Honesty about limitations is part of the product's integrity.

**Legacy comparison:** PT-2 computes its own theoretical win with full provenance. It provides an intake adapter for ingesting legacy system data through a supervised, admin-controlled process — but it does not validate the legacy system's calculation methodology, guarantee format consistency across exports, or assert that discrepancies reflect legacy errors rather than methodology differences. The trust assertion belongs to the admin who reviews the evidence, not to the system that ingests it. *(See FIB-P2K-21 for full substantiation.)*

**Prediction:** PT-2 detects statistical anomalies — values that deviate from recent baselines. It does not predict future outcomes, model seasonal patterns, or perform machine learning. The statistical method (median + MAD) is deliberately simple, transparent, and auditable.

**Automation:** PT-2 surfaces information for human decisions. It does not auto-close alerts, auto-correct anomalies, or auto-escalate issues. The system ensures nothing is missed; the operator decides what to do about it.

---

## The Principle

Casino software should not merely function. It should prove itself.

PT-2 is engineered so that every number it produces can be traced to the inputs that created it, attributed to the person who triggered it, and verified independently by anyone with access. That is not a feature. It is the architecture.

---

*Implementation summary generated 2026-03-27. Verified against PT-2 wedge-c branch. All capabilities described are operational and passing CI (tsc 0 errors, lint 0 errors, 83/83 tests, RPC compliance pass, SEC-007 pass). Strategic hardening: 4/4 wedges GREEN, 94% aggregate score, 27+ PRDs delivered, 21+ migrations deployed.*
