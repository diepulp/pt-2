1. **What a PRD is actually for**

## A PRD is not:

- a full technical spec

- a full UX spec

- a copy of your SRM, API surface, and schema docs

**A PRD is:**

A single alignment document that says: “For this slice of the product, here is the problem, who it’s for, what success looks like, and what we are/aren’t doing.”

In other words, it’s an orchestrator for the other docs, not - a replacement.

2. Scope: whole project vs feature-level

Think in three levels:

Product Vision / Strategy (project-wide)

One doc for the entire Casino Player Tracker / PT-2.

Why it exists, who it serves, high-level roadmap, big bets.

Release / Phase PRD (recommended scope)
Example scopes:

“PT-2 MVP – Casino Floor Ops + Basic Rating”

“Phase 6 – Loyalty + Mid-Session Rewards”

“MTL Journal v1 – Gaming Day & Audit Log”

Each of these has its own PRD. This is usually the sweet spot: big enough to be meaningful, small enough to reason about.

Feature Specs / Design Docs (below PRD)

Per feature or bounded context:
“Rating Slip Flow v1”,
“Visit Lifecycle & Gaming Day”,
“Loyalty Ledger UI v1”, etc.

These can be UX-heavy or tech-heavy, but they hang off the PRD, not inside it.

So:

Don’t write a single “everything PRD” for the whole system.

Do write a PRD per phase or release (MVP, Phase 2, etc.), and let the feature docs + SRM stay separate.

3. How to avoid the “everything in one doc” trap

Since you already have a design-first stack (SRM, schema, API routes, hooks standards, etc.), your PRD should:

Summarize decisions at a human level

Link out to canonical docs instead of repeating them

Concretely, your PRD could have a section like:

Related Canonical Docs

Service Responsibility Matrix v3.0.2 – ownership & RLS rules

Supabase database.types.ts (2025-10-22) – DB schema SoT

API Surface v1 (/api/v1/**) – route catalog and DTOs

Hooks Standard v1.1 – client access patterns

No copying, just pointers.

4. A simple PRD structure you can actually fill out

Here’s a lean template you can use that won’t try to swallow your whole design corpus.

1. **Overview**

Name: e.g. “PT-2 MVP – Rating & Visit Core PRD”

Owner: (you, or role)

Status: Draft / In Review / Approved

Summary (3–5 sentences):
What slice are we building, for whom, and why now?


What slice are we building, for whom, and why now?

2. Problem & Goals

Problem:
What concrete pain are we solving? (e.g. supervisors can’t reliably track player time/average bet; comp decisions are subjective and inconsistent.)

Goals (3–5 bullets):

Make X process measurable and repeatable

Reduce manual reconciliation by Y

Enable A/B testing of loyalty rules, etc.

Non-Goals / Out of Scope:

No multi-property support yet

No advanced analytics / dashboards, etc.

3. Users & Use Cases

Primary users: (pit supervisors, shift managers, compliance, etc.)

For each user, list top 3 jobs:

As a [user], I need to [job] so that [outcome].

This is where you define what has to be possible, not the UI details.

4. Requirements (What must exist)

Use short, testable statements – link out to details:

Functional requirements:

“Supervisors can start/stop a visit and see active visits per table.”

“The system computes theoretical win and points using GameSettings per table.”

“Rating slips cannot be closed without a visit association.”

Each can link to:

API routes doc

SRM snippet

Figma / flow diagram

Non-functional / constraints:

“All data access controlled via RLS; no service role keys in browser.”

“Latency budget for table view < 500 ms for 13 active tables.”

“Gaming day is computed via compute_gaming_day as defined in SRM.”

You’re not rewriting the SRM — you’re selecting which pieces matter for this release.

5. UX / Flow Overview

Keep this high-level:

3–5 screenshots or flow diagrams, or just text:

“Supervisor opens ‘Floor View’ → selects table → opens Rating Panel → fills slip → saves.”

Link to:

Figma file

Interaction specs if they exist

6. Data, Telemetry & Success Metrics

What you’ll track to know if this slice is working:

of ratings entered per shift

Average time to enter/close a rating

Reduction in manual comp adjustments

Tie these to your existing schema (“metrics live in Performance/Loyalty context; see SRM §…”) instead of spelling out tables again.

7. Dependencies & Risks

Dependencies:

“Supabase schema patch X merged and migrated.”

“Hook standard v1.1 implemented for /player, /visit, /rating_slip.”

Risks / Open Questions:

“Are partial ratings allowed if player leaves mid-shoe?”

“Do we support multi-casino scope in MVP or later?”

This is the “parking lot” for things the SRM might talk about in detail, but which block the release if unresolved.

8. Related Documents

Just a list of links:

SRM section(s) relevant to this PRD

database.types.ts reference

API surface doc for /api/v1/visit, /api/v1/rating-slip, etc.

Hooks standard

Observability / test plan docs