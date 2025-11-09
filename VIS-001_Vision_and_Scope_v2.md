# Vision & Scope (V&S)

**ID Prefix**: `VIS-###`  
**Owner**: Product  
**Phase**: Inception, Discovery, Evolve

```yaml
---
id: VIS-001
title: PT-2 Casino Management Platform Vision
owner: Product
status: Draft
created: 2025-10-25
last_review: 2025-11-08
---
```

## Purpose

Aligns direction and guards against scope creep with clear problem statements, goals, non-goals, and stakeholder identification.

---

## Vision Brief (One-Pager)

**North Star**: *Table-centric player tracking with compliant session logging and basic loyalty accrual, ready for a single-casino pilot.*

**Problem**  
Pit operations struggle with fragmented tools and manual steps. Player time is miscounted, mid-session rewards are error-prone, and compliance context is hard to reconstruct. This creates revenue leakage, audit risk, and operator fatigue.

**Solution Approach**  
A pit-friendly, table-first workflow: open/close tables cleanly, start/pause/resume/close rating slips with accurate timekeeping, and award **mid-session rewards** safely (idempotent, auditable). Compliance signals are ambient and built-in. The system is guided by a matrix-first contract (SRM ↔ schema ↔ RLS) and minimal, reversible slices for MVP.

**Definition of Success (qualitative)**  
One casino runs a full shift with minimal training, reliable accrual, and auditable trails—and asks us back tomorrow.

---

## Success Metrics (KPIs & Measurable Outcomes)

- **Latency/UX**: p95 session creation < **2s**; pit dashboard LCP ≤ **2.5s**.  
- **Reliability**: zero “stuck” rating slips; idempotent mid-session rewards (no duplicates).  
- **Operability**: an operator completes 3 key flows in **< 2 minutes** total during pilot.  
- **Security**: all RLS tests pass; least-privilege roles enforced (deny-all → allow paths).  
- **Observability**: dashboards live for **Active tables**, **Open slips**, **Rewards/hour**, error rate, with actionable alerts.

---

## Out-of-Scope (MVP)

- Full cashier workflows; automated watchlist writes; points→cash conversions.  
- Advanced analytics/forecasting; multi-property roll-ups.  
- Non-table games and kiosk integrations.  
- Complex exceptions beyond happy-path dealer rotation.

---

## Stakeholder Map

- **Pit Boss / Floor Supervisor** — *Primary*: run the pit, resolve edge cases quickly.  
- **Dealer** — *Primary*: record clean begins/pauses/resumes/ends as part of normal workflow.  
- **Cage/Accounting (read-only, MVP)** — *Secondary*: verify in-session rewards; reconcile at day-end.  
- **Compliance Analyst (read-only, MVP)** — *Secondary*: review threshold proximity & context when needed.  
- **Engineering / Architecture** — *Enablers*: uphold SRM↔schema↔RLS integrity; ensure idempotency and performance budgets.  
- **Product / Leadership** — *Sponsors*: define scope, outcomes, and pilot success criteria.

---

## Market Analysis (Lightweight, MVP-relevant)

- **Status quo**: Manual logs or legacy trackers with weak mid-session reward controls lead to double-count risk and poor audit trails.  
- **Differentiators (PT-2)**: (1) **Operator-first ergonomics** (2–3 steps per core action), (2) **Matrix-first contracts** preventing drift, (3) **RLS-by-default** security posture, (4) **Idempotent reward RPC** ensuring no duplicate issuance, (5) **Built-in observability** from day one.

---

## Product Pillars (Design Principles)

1. **Operator-first ergonomics** — minimal taps, clear states, forgiving flows.  
2. **Matrix-first contracts** — SRM mirrors schema & RLS; DTOs/OpenAPI stay in lockstep.  
3. **RLS-by-default** — deny-all first; narrow allow paths by `casino_id` + role.  
4. **Idempotent writes** — natural keys & RPCs to prevent duplicate rewards/time.  
5. **Observability by default** — correlate by `{casino_id, staff_id, rating_slip_id, visit_id}`.

---

## In-Scope (MVP Capabilities)

- **Casino**: staff auth, casino settings (gaming day), table catalog.  
- **Table Context**: open/close table; dealer rotation (happy path).  
- **Player & Visit**: enroll player; start/stop visit; seat at table.  
- **Rating Slip (telemetry)**: start/pause/resume/close; seconds accrued; AOV visible.  
- **Loyalty**: issue **mid-session reward** via RPC; ledger written and read back in session.  
- **Finance (minimal)**: manual deposit/withdraw entry (feature-flagged).  
- **MTL (read-only)**: threshold proximity badge and recent loyalty activity in context.

---

## Key User Journeys (Happy Paths)

1. **Open Table → Seat Player → Start Slip → Award Mid-Session Reward → Close Slip**.  
2. **Pause/Resume Slip** for temporary player leave without losing accuracy.  
3. **End-of-Shift Review**: validate open slips closed; loyalty issuances visible; no anomalies.

---

## Constraints & Assumptions

- **Deployment**: single-casino pilot; connectivity is generally stable with occasional flakiness.  
- **Security**: RLS derived from SRM; deny-all first; role-based allow paths.  
- **Data lifecycle**: gaming-day derivation governed centrally; soft-delete where needed; log retention defined.

---

## Risks & Mitigations

- **Scope creep** → enforce slice gates; defer non-MVP to Phase-2.  
- **RLS complexity** → start deny-all; add allow-paths with tests per role.  
- **Schema/PostgREST drift** → CLI migrations only; verify schema cache after deploy.  
- **Performance regressions** → define p95 SLOs now; `EXPLAIN` top queries pre-merge.

---

## Release Definition of Done (Pilot-ready)

- RLS policies for MVP tables verified by tests.  
- API catalog/OpenAPI in sync with server actions.  
- Dashboards show **Active tables**, **Open slips**, **Rewards/hour**, error rate.  
- Pilot runbook with feature flags and rollback switches.  
- Operator sign-off with P0s resolved; P1s triaged with owners/dates.

---

## Problem Landscape (Revenue-Leak Issues → PT‑2 Levers)

| Issue | How money leaks | Field signals / useful metrics | PT‑2 levers (MVP) |
|---|---|---|---|
| **Inaccurate rating & comp leakage** | Wrong time-on-device and AOV inflate reinvestment or under-reward loyal patrons. | Variance between theo vs. actual; comp-to-theo above target; duplicate adjustments. | Server-trusted timing on rating slips; precise `accumulated_seconds`; AOV windows; idempotent mid-session reward RPC with ledger visibility. |
| **Labor mis-allocation on table games** | Too many/few open tables vs demand → idle labor or lost hands/decisions. | Decisions/hour, seats filled, occupancy, contribution per open table. | Live table status + seated/active slips; open/close decision support; rotation telemetry. |
| **Sub-optimal table minimums & speed** | Low mins at peak / high mins off-peak; slow games reduce wagers/hour. | Decisions/hour by daypart, average wager, hold % by game. | Daypart dashboards; alerts for min-setting anomalies; accurate pause/resume ensures true HPH. |
| **Advantage play / game protection gaps** | Hole-carding, past-posting, team play undetected → direct loss. | Abnormal bet progressions, dealer rotation correlations, win spikes. | Correlate slip timestamps with rotation and table state to accelerate investigations. |
| **AML/BSA exposure** | Missed/late CTR/SAR filings → fines and audit costs. | Unlinked session activity to patron/visit; weak audit trails. | Correlate session + reward events to visit/patron; produce auditable timelines. |
| **Inefficient mid-session loyalty** | Manual awards double-post or arrive late (miss peak sentiment). | Duplicate ledger entries; low redemption; poor offer ROI. | One-click, idempotent mid-session reward RPC; in-slip ledger visibility. |
| **Dealer error & training gaps** | Mis-pays and procedure drift → direct loss and guest friction. | Error incidents by game/shift; new-dealer/fatigue spikes. | Align telemetry with rotations and states to enable QA/coaching. |
| **Scheduling inefficiency** | Overstaffing (idle) or understaffing (lost experience/revenue). | Idle table time; understaffed peaks; turnover. | Feed real-time demand signals (active slips, seats) to scheduling decisions. |

---

## Business Impact Targets (Pilot)

- **+5–10%** decisions/hour on properly staffed tables via live demand signals.  
- **−10–20%** comp leakage through accurate timing and idempotent reward issuance.  
- **Compliance risk reduction** through auditable session timelines linked to visits/patrons.

---

## Vision Paragraph (Drop‑in)

Pit teams operate with clarity and confidence: tables are staffed and priced to demand, sessions are timed accurately, and loyalty is awarded mid-play without duplicates. Advantage play, comp leakage, and AML blind spots shrink because every slip and reward is correlated to a visit and patron under role-based, auditable controls. Success is a full-shift pilot with higher contribution per table, tighter reinvestment, and clean compliance trails.

---

## Current Documents

- *To be populated during reorganization*

---

## Related Categories

- **PRD** (`/docs/10-prd/`): release-level requirements derived from vision.  
- **ARCH** (`/docs/20-architecture/`): system design aligned with vision (SRM, diagrams, NFRs).  
- **GOV** (`/docs/70-governance/`): standards that enforce vision principles.
