---
title: "UI Navigation Ownership Baseline"
doc_type: "standard"
version: "v1.0"
status: "active"
date: "2026-01-22"
project: "casino-player-tracker (PT-2)"
scope: "dashboards + navigation"
tags: ["baseline", "navigation", "route-ownership", "anti-duplication", "guardrails", "DoD"]
---

# Purpose

Prevent recurring refactors caused by **overlapping screens** (two routes rendering the same domain concept with different state models), by standardizing:

- **Route ownership** (one canonical screen per domain concept)
- **Navigation truth** (URL vs client state)
- **Component/data ownership** (single source of truth, no duplicate panel trees)
- **Guardrails** (DoD, lint/CI checks, review gates)

This baseline is intentionally blunt: it exists to stop dashboard development from degenerating into “two UIs for the same thing.”

---

# Précis: The Overlap Problem (Standardized)

## Symptom
Two or more UI surfaces attempt to represent the **same domain concept** (e.g., Player Detail) with overlapping panels, diverging navigation, or different state models.

## Typical Smell
- A list screen starts rendering **detail panels** based on local state (Zustand/Context), while a detail route already exists.
- “Quick view” grows into a shadow detail screen.
- Same components/panels exist in multiple folders with similar names.
- Deep links are inconsistent: some views are shareable (URL), others are not (client state only).

## Root Cause
**No declared canonical owner** for the domain concept + no enforced boundary between “lookup” and “detail.”

## Consequence
- duplicated component trees
- duplicated fetches and inconsistent caching
- unclear entry/exit navigation
- refactor pressure every time a new panel is added

---

# Baseline Rules (Non‑Negotiable)

## R1 — One Domain Concept → One Canonical Screen
If a concept is “Player Detail”, there is exactly one canonical route (e.g., `/players/[playerId]`) that owns its panels.

Any additional route must be:
- a redirect to the canonical route, or
- a thin wrapper that focuses a section within the canonical UI (no second implementation).

## R2 — URL is Authoritative for Selection
If the user can “select” an entity and see entity-specific information, the selection must be represented in the URL.

Client state may only be used for UI convenience (highlighting a row, ephemeral filter UI), never as navigational truth.

## R3 — Lookup Surfaces Do Not Render Detail Panels
Lookup pages (lists/search dashboards) may show **only list-level data**.

Lookup pages must not:
- fetch “panel datasets” keyed by an entity id
- render timeline/notes/compliance/metrics rails, etc.
- become a second detail surface under a different name

## R4 — Panels Have a Single Ownership Home
A panel (Notes, Timeline, Compliance, Metrics) must have a single canonical implementation located under the owning feature folder.

Re-exporting is allowed. Duplicating is not.

## R5 — If It Needs 60% of the Same Panels, It’s the Same Screen
When a proposed screen overlaps heavily with existing panels, the correct action is:
- add a section/tab within the canonical screen
- link to it
- do **not** fork a second “detail page” implementation

---

# Canonical Route Ownership Template

Every new dashboard/feature MUST include a route ownership map in its PRD:

| Domain Concept | Canonical Route | Lookup Route(s) | Notes |
|---|---|---|---|
| Player Detail | `/players/[playerId]` | `/players` | `/players` is lookup-only; no panels |
| Table Detail | `/tables/[tableId]` | `/tables` | Same rules apply |
| Visit Detail | `/visits/[visitId]` | `/visits` | Same rules apply |

**Rule:** If a PRD cannot fill this table cleanly, the feature is not ready.

---

# Implementation Baseline (How We Build It)

## Navigation Pattern (Required)
- List row click → `router.push(canonicalRoute)`
- Canonical screen owns all detail sections (tabs/anchors)

## Return Path (Required)
If lookup pages support filters/search, preserve them via URL params and returnTo:

- `/players?query=...&status=...`
- Navigate to `/players/[id]?returnTo=<encoded lookup url>`
- “Back to search” uses `returnTo`

**No hidden navigation state** for return paths.

---

# Guardrails (Definition of Done)

A dashboard feature is **not done** unless ALL are true:

## DoD‑A: Ownership and Routing
- Canonical route exists for the domain concept
- Lookup route does not render detail panels
- Any legacy/detail-adjacent routes redirect or thin-wrap canonical UI
- Deep links work (URL is authoritative)

## DoD‑B: Component Ownership
- Detail panels live under the canonical feature directory
- No duplicated panel implementations under lookup features
- Shared components are “dumb” primitives (buttons, badges), not feature panels

## DoD‑C: Data Fetch Discipline
- Canonical screen uses shared query keys / a query registry to prevent duplicate fetches
- Lookup screen fetches list payload only
- No entity-id keyed panel fetches inside lookup route

## DoD‑D: UX Completeness
- clear entry point(s) from lookup → canonical detail
- breadcrumbs in canonical detail
- reliable back navigation restoring lookup params

---

# Enforcement (CI/Lint/Review Gates)

## 1) ESLint Import Boundaries (Required)
Add `no-restricted-imports` rules to prevent:
- lookup routes importing feature panels from canonical feature directories
- canonical screens importing “dashboard preview panels” that recreate detail UI

Example policy (conceptual):
- `app/**/players/page.tsx` may not import from `components/player-360/**`
- `components/player-dashboard/**` may not export `*Panel` components that require `playerId`

## 2) File/Folder Conventions (Required)
- Canonical feature panels live under: `components/<feature>/**`
- Lookup-only components live under: `components/<feature>-lookup/**`
- Naming:
  - Panels: `*Panel.tsx` (canonical only)
  - Lookup: `*Row.tsx`, `*Badge.tsx`, `*Filters.tsx`

## 3) PRD Review Gate (Required)
PRD must include:
- Route Ownership Table
- Explicit “URL is authoritative” statement
- Explicit ban list for lookup route (what it must not render/fetch)

## 4) Anti-Duplication Tripwire (Optional)
A lightweight CI script that fails if forbidden import patterns appear.
(This is a tripwire. Use it in addition to ESLint.)

---

# Standard Decision Tree (Use in Reviews)

When someone proposes adding a panel or view:

1. **Is it entity-specific?**
   - Yes → belongs in canonical detail route.
   - No → can live in lookup.

2. **Does it need `entityId` to fetch or render?**
   - Yes → canonical only.
   - No → lookup allowed.

3. **Does it overlap with an existing canonical panel?**
   - Yes → extend canonical panel / add a tab/section.
   - No → create new canonical panel, still under canonical route.

4. **Is someone proposing a second route for “convenience”?**
   - Default answer: redirect/thin-wrap the canonical route.

---

# Example: Player 360 Consolidation (Applied)

- Canonical: `/players/[playerId]`
- Lookup: `/players` (search/list only)
- Legacy: `/players/[playerId]/timeline` → redirect to canonical (optional `#timeline`)

This is the model to replicate for other dashboards (tables, visits, ratings).

---

# Owner and Change Control

- Owner: Product/Engineering
- Changes require an ADR-style note:
  - What rule is changing?
  - Why?
  - What new enforcement exists to prevent drift?

If enforcement is not updated, the rule change is rejected.
