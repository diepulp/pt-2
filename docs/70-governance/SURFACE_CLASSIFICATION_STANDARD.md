# Surface Classification Standard

**Status:** Accepted
**Version:** 1.0.0
**Date:** 2026-03-07
**Owner:** Platform/Governance
**Implements:** ADR-041 D1 (Surface Classification Requirement), ADR-041 D2 (Proven Pattern Palette)

---

## 1. Purpose & Scope

This standard governs how new UI surfaces in PT-2 select their rendering delivery and data aggregation patterns. It exists to prevent ad hoc pattern selection by requiring every new surface EXEC-SPEC to declare its choices against a two-axis classification model with measurable selection criteria.

**Applies to:** Every new surface EXEC-SPEC. Existing surfaces are exempt until retroactive governance in Slices 2-3.

**Enforceability:** If an EXEC-SPEC is missing any of the four mandatory declaration fields (§5), it is non-compliant and must be returned for amendment. This is a hard rejection gate, not a suggestion.

**What this standard does NOT do:**
- Mandate runtime enforcement or linting (document-time compliance only)
- Introduce new architectural patterns (it catalogues proven ones)
- Apply to backend-only services or database migrations (surfaces only)

---

## 2. Two-Axis Classification Model

Every surface makes two orthogonal decisions:

1. **Rendering Delivery** — how the page loads (server vs. client)
2. **Data Aggregation** — how data reaches the page (aggregation strategy)

These axes are independent. A surface selects one pattern from each axis. The combination defines the surface's classification.

### 2a. Rendering Delivery Axis

How the page loads and delivers its initial content to the user.

| Pattern | When to Use | Selection Criteria | Reference Implementation | Security Mode |
|---------|-------------|-------------------|-------------------------|---------------|
| **RSC Prefetch + Hydration** | Server-seeded dashboards where initial paint matters | Read-heavy, ≥2 independent queries, visible above the fold | `app/(protected)/shift-dashboard/page.tsx` | N/A (rendering) |
| **Client Shell** | Interaction-heavy flows where server shaping adds no value | Form-driven, low-frequency, admin/config flows | `app/(dashboard)/admin/settings/` | N/A (client) |
| **Hybrid** | Surfaces requiring both server-seeded paint and heavy client interaction | Declared composition of proven patterns (see §2a.1) | Rating Slip Modal (RSC prefetch + client mutations) | Varies by composed patterns |

#### 2a.1 Hybrid Pattern Definition

"Hybrid" means a **declared composition of proven rendering patterns** — not a junk-drawer category. An EXEC-SPEC selecting Hybrid must:

1. Name which proven patterns are composed (e.g., "RSC Prefetch for initial load + Client Shell for mutation flows")
2. Explain why neither standalone pattern suffices
3. Identify the boundary between the composed patterns (e.g., "server renders dashboard read state; client handles form mutations")

If the composition does not map cleanly to proven patterns, the EXEC-SPEC must escalate via the no-fit clause (§6) rather than inventing a local exception.

### 2b. Data Aggregation Axis

How data reaches the page — the aggregation strategy for backend data.

| Pattern | When to Use | Selection Criteria | Reference Implementation | Security Mode |
|---------|-------------|-------------------|-------------------------|---------------|
| **BFF RPC Aggregation** (GOV-PAT-003) | Collapsing cross-context reads into one DB round trip | ≥3 bounded contexts, >100 calls/day, latency-sensitive | `rpc_get_rating_slip_modal_data` (DB function) | SECURITY DEFINER |
| **BFF Summary Endpoint** | Combining multi-level rollups into one HTTP response | Multiple metric levels (casino/pit/table), reducing client round-trips | `app/api/v1/shift-dashboards/summary/route.ts` | N/A (HTTP route) |
| **Simple Query / View** | Single-context read, low complexity | 1-2 tables, single bounded context, moderate frequency | Direct PostgREST or service-layer `.select()` | SECURITY INVOKER (views) |
| **Client-side Fetch** | Simple reads where aggregation adds no value | Single entity, low frequency, no cross-context join | `useCasinoSettings()` in admin flows | N/A (client) |

---

## 3. Pattern Catalogue

### 3.1 Proven Rendering Patterns

#### RSC Prefetch + Hydration

Server Components fetch data during SSR, providing immediate content paint. Client components hydrate for interactivity.

- **Strengths:** Fast initial paint, SEO-friendly, parallel data fetching on server, reduced client bundle
- **Weaknesses:** Server round-trip latency, complexity in mixing server/client state
- **When to avoid:** Pure form flows, low-frequency admin pages where server shaping adds no value

#### Client Shell

Minimal server-rendered shell with client-side data fetching and rendering via React Query.

- **Strengths:** Simple mental model, full client interactivity, no server component complexity
- **Weaknesses:** Loading spinners on initial paint, no server-side data prefetch
- **When to avoid:** Read-heavy dashboards, surfaces with ≥2 independent queries visible above the fold

#### Hybrid (Declared Composition)

Composition of RSC Prefetch and Client Shell patterns with explicit boundaries.

- **Strengths:** Optimizes both initial paint and interaction flows
- **Weaknesses:** Higher complexity, requires clear boundary documentation
- **When to avoid:** When either standalone pattern suffices — prefer simplicity

### 3.2 Proven Aggregation Patterns

#### BFF RPC Aggregation (GOV-PAT-003)

Database-level function that collapses cross-context reads into a single round trip.

- **Strengths:** Minimal latency, single DB call, strong consistency
- **Weaknesses:** Tight coupling to DB schema, SECURITY DEFINER governance (ADR-018)
- **When to avoid:** Single-context reads, low-frequency flows, admin pages

#### BFF Summary Endpoint

HTTP Route Handler that aggregates multi-level data (casino/pit/table rollups) into one response.

- **Strengths:** HTTP-level caching, transport-layer flexibility, reducible client round-trips
- **Weaknesses:** Additional HTTP hop, requires Route Handler maintenance
- **When to avoid:** Single-level data, single bounded context

#### Simple Query / View

Direct database query or SQL view for single-context reads.

- **Strengths:** Minimal abstraction, caller's RLS applies (INVOKER), easy to test
- **Weaknesses:** No cross-context aggregation, N+1 risk if misused
- **When to avoid:** ≥3 bounded contexts, multi-level rollups

#### Client-side Fetch

Client components fetch directly via React Query hooks.

- **Strengths:** Simplest pattern, no server involvement, good for low-frequency reads
- **Weaknesses:** Loading states, no server prefetch, no aggregation
- **When to avoid:** Cross-context joins, latency-sensitive reads, high-frequency surfaces

### 3.3 Reference Exemplar Combinations

Existing production surfaces that demonstrate proven axis combinations:

| Surface | Rendering Pattern | Aggregation Pattern | Reference Path | Security Mode |
|---------|------------------|--------------------|-----------------------|---------------|
| Shift Dashboard | RSC Prefetch + Hydration | BFF Summary Endpoint | `app/(protected)/shift-dashboard/page.tsx`, `app/api/v1/shift-dashboards/summary/route.ts` | N/A (rendering + HTTP route) |
| Rating Slip Modal | Hybrid (RSC prefetch + client mutations) | BFF RPC Aggregation (GOV-PAT-003) | `rpc_get_rating_slip_modal_data` (DB function) | SECURITY DEFINER |
| Admin Settings | Client Shell | Client-side Fetch | `app/(dashboard)/admin/` (settings flows) | N/A (client) |

These exemplars demonstrate that the pattern palette is complementary, not competing. Different surfaces legitimately require different combinations.

---

## 4. Selection Decision Matrix

For any new surface, answer both questions sequentially:

### Q1: Rendering Delivery

```
Does the surface need server-seeded initial paint?
├── YES: Read-heavy, ≥2 independent queries, visible above the fold
│   └── RSC Prefetch + Hydration
├── NO: Form-driven, low-frequency, admin/config flows
│   └── Client Shell
└── BOTH: Server-seeded paint AND heavy client interaction needed
    └── Hybrid (declare which proven patterns are composed — §2a.1)
```

**Measurable criteria for RSC Prefetch:**
- Surface is read-heavy (primary interaction is viewing data, not entering it)
- ≥2 independent data queries needed for initial render
- Content is visible above the fold (first meaningful paint matters)

**Measurable criteria for Client Shell:**
- Surface is form-driven (primary interaction is data entry)
- Low-frequency access (admin/config flows, not operational dashboards)
- Server-side data shaping adds no user-visible value

### Q2: Data Aggregation

```
How many bounded contexts does the surface read from?
├── 1-2 contexts
│   ├── Single entity, low frequency → Client-side Fetch
│   └── Moderate complexity → Simple Query / View
└── 3+ contexts
    ├── Multi-level rollup (casino → pit → table)? → BFF Summary Endpoint
    └── Flat cross-context join?
        ├── >100 calls/day + latency-sensitive → BFF RPC Aggregation
        └── <100 calls/day or admin flow → Simple Query acceptable
```

**Measurable criteria for BFF RPC Aggregation:**
- ≥3 bounded contexts in a single read
- >100 calls/day expected
- Latency-sensitive (operational dashboard, not admin report)

**Measurable criteria for BFF Summary Endpoint:**
- Multiple metric levels requiring rollup (e.g., casino/pit/table hierarchy)
- Reducing client round-trips is a meaningful performance gain

**Measurable criteria for Simple Query / View:**
- 1-2 tables from a single bounded context
- Moderate access frequency
- No cross-context join needed

**Measurable criteria for Client-side Fetch:**
- Single entity read
- Low frequency
- No cross-context join
- Server aggregation adds no value

---

## 5. Declaration Requirement

Every new surface EXEC-SPEC must include the following four mandatory fields. If any field is missing, the EXEC-SPEC is **non-compliant** and must be returned for amendment.

```yaml
Surface Classification:
  Rendering Delivery: [RSC Prefetch | Client Shell | Hybrid]
  Data Aggregation:   [BFF RPC | BFF Summary | Simple Query | Client Fetch]
  Rejected Patterns:  [Which proven patterns were considered and why they don't fit]
  Metric Provenance:  [For each surfaced metric: truth class + freshness class from Provenance Matrix]
```

### Field Requirements

1. **Rendering Delivery**: Name one proven rendering pattern. If Hybrid, specify which patterns are composed and why (§2a.1).
2. **Data Aggregation**: Name one proven aggregation pattern. Cite the selection criteria from §4 Q2 that led to the choice.
3. **Rejected Patterns**: For each axis, name at least one alternative pattern that was considered and explain why it was rejected, citing specific selection criteria from §4.
4. **Metric Provenance**: For each truth-bearing metric the surface displays, cite the Truth ID from the Metric Provenance Matrix (`docs/70-governance/METRIC_PROVENANCE_MATRIX.md`) with its truth class and freshness class.

---

## 6. No-Fit Escalation Clause

If no proven pattern from the palette (§2a, §2b) cleanly fits a surface's requirements, the EXEC-SPEC must **stop and raise an ADR or standards amendment** rather than inventing a local exception.

The pattern palette grows through governed amendment only:
1. Propose a new pattern as an ADR or ADR-041 amendment
2. Include reference implementation and selection criteria
3. After acceptance, the standard is updated to include the new pattern

**Ungoverned pattern proliferation — inventing a local pattern without amending the standard — is a compliance failure.**

---

## 7. Compliance Examples

### 7.1 PASS Example — Measurement Reports Dashboard

```yaml
Surface Classification:
  Rendering Delivery: RSC Prefetch + Hydration
    Rationale: Read-heavy dashboard with 4 independent metric queries above
    the fold. Users primarily view data, not enter it. Matches RSC selection
    criteria (read-heavy, ≥2 queries, above the fold).

  Data Aggregation: BFF Summary Endpoint
    Rationale: 4 metric levels from 6+ bounded contexts with casino/pit/table
    rollup hierarchy. >100 calls/day during shift operations. Multi-level
    rollup matches BFF Summary selection criteria (§4 Q2).

  Rejected Patterns:
    - Client Shell rejected: Read-heavy dashboard needs server-seeded paint
      for fast initial render. Violates RSC selection criterion "≥2 independent
      queries visible above the fold" (§4 Q1).
    - Simple Query rejected: 6+ bounded contexts violates "1-2 tables, single
      bounded context" criterion (§4 Q2). Would require N+1 client fetches.
    - BFF RPC rejected: Multi-level rollup (casino/pit/table) fits BFF Summary
      pattern better than flat cross-context join (§4 Q2).
    - Client-side Fetch rejected: Cross-context aggregation required;
      "no cross-context join" criterion not met (§4 Q2).

  Metric Provenance:
    - MEAS-001: Theo Discrepancy — Derived Operational / Request-time
    - MEAS-002: Audit Event Correlation — Compliance-Interpreted / Request-time
    - MEAS-003: Rating Coverage — Derived Operational / Request-time
    - MEAS-004: Loyalty Liability — Snapshot-Historical / Periodic (daily)
```

**Why this passes:** All four fields present. Pattern selections cite specific selection criteria from §4. Rejected patterns include rationale citing clause references. Metric provenance cites Truth IDs with truth class and freshness from the Provenance Matrix.

### 7.2 FAIL Example — Measurement Reports with Client-side Fetch

> "Measurement reports page uses client-side fetch for all 4 widgets."

**Why this fails (4 violations):**

1. **Missing Rejected Patterns** (§5 field 3): No alternatives considered or rejected. The declaration must explain why other patterns were not chosen.
2. **Missing Metric Provenance** (§5 field 4): No truth class or freshness declarations for the 4 measurement metrics.
3. **Data Aggregation violation** (§4 Q2): 6+ bounded contexts requires BFF RPC or BFF Summary — "no cross-context join" criterion for Client-side Fetch is not met.
4. **Rendering Delivery violation** (§4 Q1): Read-heavy dashboard with ≥2 independent queries above the fold requires RSC Prefetch — "server-seeded initial paint" criterion is met but Client Shell was implied.

---

## 8. Edge Transport Policy Cross-Reference

Data aggregation patterns that use HTTP transport (BFF Summary Endpoint, Client-side Fetch) must comply with the Edge Transport & Middleware Policy (`docs/20-architecture/EDGE_TRANSPORT_POLICY.md`):

- **§2 Allowed Entry Points**: BFF Summary Endpoints use Route Handlers (`app/api/v1/**/route.ts`) per the dual-entry transport pattern. Client-side Fetch uses React Query mutations/queries routed to Route Handlers.
- **§6 Service-Specific Notes**: The transport decision rule ("React Query flows → Route Handlers; Form/RSC flows → Server Actions") applies to all data aggregation patterns.
- **§4 Required Headers**: BFF endpoints must support `x-correlation-id` and `Idempotency-Key` (ADR-021) where applicable.

BFF RPC Aggregation (GOV-PAT-003) operates at the database layer and is not subject to HTTP transport policy, but is subject to SECURITY DEFINER governance (ADR-018).

---

## 9. References

| Document | Path |
|----------|------|
| ADR-041 (Surface Governance Standard) | `docs/80-adrs/ADR-041-surface-governance-standard.md` |
| ADR-039 (Measurement Layer) | `docs/80-adrs/ADR-039-measurement-layer.md` |
| RFC-001 (Standards Foundation Design) | `docs/02-design/RFC-001-standards-foundation.md` |
| Metric Provenance Matrix | `docs/70-governance/METRIC_PROVENANCE_MATRIX.md` |
| Edge Transport Policy | `docs/20-architecture/EDGE_TRANSPORT_POLICY.md` |
| GOV-PAT-003 (BFF RPC Pattern) | `docs/70-governance/patterns/GOV-PAT-003-bff-rpc-aggregation.md` |
| SRM §Measurement Layer | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (line 837) |
| Over-Engineering Guardrail | `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` |
| Server Actions Architecture | `docs/70-governance/SERVER_ACTIONS_ARCHITECTURE.md` |
