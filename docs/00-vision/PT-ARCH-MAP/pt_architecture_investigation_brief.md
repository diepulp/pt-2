# PT Architecture Investigation Brief

## Purpose

This brief instructs an architecture investigation team to produce a reality-based map of the PT application. The goal is not to defend the current design, force a rewrite, or impose dogma from any article or framework. The goal is to surface how the application actually works today, where governance aligns with reality, where it does not, and what risks or improvement opportunities follow.

Treat PT as a modern distributed web application with multiple runtimes, multiple interaction modes, data ingestion paths, server/client rendering trade-offs, and operational/compliance requirements. Assume that existing governance docs are useful but incomplete until verified against implementation.

## Investigation objectives

Produce a comprehensive architectural assessment of PT that:

1. Maps the system as it exists in reality, not as intended in documents.
2. Identifies all major execution boundaries, communication paths, rendering modes, data pipelines, and ownership lines.
3. Surfaces ad hoc implementation patterns, undocumented exceptions, duplicated responsibilities, and unclear runtime policies.
4. Assesses whether current implementation choices are justified by workload and constraints, or whether they reflect drift, convenience, or unexamined defaults.
5. Recommends concrete improvement areas, standards, and governance updates without assuming a rewrite is necessary.

## Primary question

Does PT have a clear, coherent, constraint-driven architecture, or is it accumulating hidden complexity behind governance artifacts while features are still being implemented ad hoc?

## Secondary questions

### Workload and surface classification

- What major application surfaces exist today?
- Which are public-facing, authenticated operational, admin, compliance, reporting, onboarding, or batch-processing surfaces?
- What are the distinct workload types across these surfaces?
- Which surfaces are content-heavy, latency-sensitive, interaction-heavy, realtime-sensitive, or compliance/audit-sensitive?
- Has PT explicitly classified these workloads, or are rendering/data choices made locally per feature?

### Rendering and runtime architecture

- For each route or major screen, determine where rendering work occurs:
  - static/pre-rendered,
  - request-time server-rendered,
  - server component driven,
  - streamed,
  - client-rendered,
  - hybrid.
- Identify where hydration occurs, whether hydration is necessary, and whether client interactivity is staged or all-at-once.
- Identify any routes or components where SSR/server components are used without clear benefit.
- Identify any routes or components where client-side rendering is used despite large initial data shaping needs that may be better handled server-side.
- Determine whether view models are intentionally prepared server-side or assembled opportunistically in client hooks/components.
- Surface duplicate fetches, waterfall fetch patterns, hydration mismatches, stale initial payloads, or server/client responsibility confusion.

### State ownership and truth boundaries

- Map all state categories:
  - persisted domain state,
  - session/auth state,
  - UI-only state,
  - derived/transformed view state,
  - optimistic state,
  - cached server state,
  - realtime transient state.
- For each category, identify the canonical owner.
- Identify places where the same business concept is represented in multiple layers with unclear precedence.
- Identify where derived state is recomputed in multiple places.
- Determine whether current client state management and server state fetching patterns are aligned with clear ownership rules.

### Data fetching and server/client contracts

- Map how data enters each page or workflow:
  - server component fetch,
  - route handler,
  - server action,
  - direct client fetch,
  - Supabase client query,
  - RPC call,
  - background job result,
  - realtime subscription.
- Identify inconsistencies in validation, authorization, error handling, and typing across these paths.
- Determine whether there is an intentional contract for where business logic, authorization checks, and data shaping should occur.
- Surface logic that is duplicated across UI, service layer, RPCs, or database constraints.

### Data ingestion architecture

- Produce a full lifecycle map for ingestion-related flows, including any current or planned CSV/import pipelines:
  - source acquisition,
  - file storage,
  - parsing,
  - normalization,
  - mapping,
  - validation,
  - staging,
  - reconciliation,
  - domain persistence,
  - auditing,
  - recovery/replay.
- Determine which stages are implemented, partially implemented, planned, or missing.
- Identify where batch processing, idempotency, partial failures, retries, poison batches, and observability are handled.
- Identify whether ingestion is modeled as a first-class pipeline or treated as scattered feature logic.
- Determine whether business reconciliation is improperly coupled to raw import processing.
- Assess whether ingestion architecture matches PT’s compliance and auditability requirements.

### Communication pipelines and integration paths

- Map all communication channels across the app:
  - browser to app server,
  - browser to backend service,
  - app server to database,
  - app server to worker,
  - worker to storage,
  - worker to database,
  - realtime/pubsub,
  - audit/logging/metrics channels.
- For each channel, document:
  - protocol/mechanism,
  - ownership,
  - retry behavior,
  - timeout/failure handling,
  - observability,
  - authorization boundary.
- Identify channels that bypass intended service/domain contracts.
- Surface multiple entry points for the same domain operation that may drift from one another.

### Bounded contexts vs runtime reality

- Compare documented bounded contexts and service responsibility ownership against actual codepaths.
- Determine whether code follows domain boundaries in practice or leaks across them.
- Identify where one context assembles another context’s view model, mutates another context’s data, or embeds assumptions that should be externalized.
- Surface “ghost ownership” patterns, where documentation says one thing but runtime behavior says another.

### Debuggability and fault localization

- For major workflows, trace how a failure would be diagnosed.
- Determine whether faults can be localized to:
  - render stage,
  - hydration stage,
  - client interaction stage,
  - API/service stage,
  - RPC/database stage,
  - worker/async stage,
  - policy/auth stage.
- Identify areas where failures are hard to place because responsibilities are blurred.
- Assess current logging, tracing, metrics, correlation IDs, audit trails, and failure visibility.
- Determine whether the architecture helps or hinders root-cause analysis.

### Performance and caching

- Identify caching layers and invalidation mechanisms:
  - CDN,
  - route/cache layer,
  - server memoization,
  - client query cache,
  - DB/materialized/derived data caches,
  - background precomputation.
- Determine whether caching strategy is explicit or accidental.
- Surface stale data risks, duplicated fetches, or over-fetching.
- Identify high-latency workflows and where time is spent:
  - network,
  - server composition,
  - DB/RPC,
  - hydration,
  - client computation.
- Determine whether performance budgets exist per surface or whether optimization is reactive.

### Security, authorization, and compliance boundaries

- Map where authorization is enforced:
  - UI gating,
  - server checks,
  - RPC checks,
  - RLS,
  - DB constraints.
- Identify duplicate or inconsistent authorization paths.
- Determine whether compliance-sensitive workflows have explicit architectural treatment or are mixed into general-purpose paths.
- Surface areas where convenience may have weakened auditability or boundary clarity.

### Operational fitness

- Determine whether the current architecture matches team reality:
  - deployment model,
  - operational complexity,
  - observability maturity,
  - headcount,
  - support burden,
  - testability.
- Identify architecture choices that are valid in theory but brittle in current team conditions.
- Assess whether the system has hidden operational tax from SSR usage, workers, Supabase coupling, migration volume, or hybrid runtime complexity.

## Required deliverables

Produce the following:

### 1. Reality map

A clear map of the application showing:
- major surfaces,
- rendering/runtime modes,
- domain boundaries,
- data flows,
- communication paths,
- sync vs async workflows,
- ingestion pipelines,
- critical state owners.

### 2. Decision inventory

A catalog of major architectural decisions currently embodied in the system, whether or not they were formally documented. For each decision:
- what the decision appears to be,
- where it is implemented,
- whether it is documented,
- whether it appears intentional, emergent, or accidental.

### 3. Friction register

A ranked list of architectural friction points, including:
- symptom,
- likely root cause,
- impact,
- affected surfaces/domains,
- evidence,
- recommended remediation options.

### 4. Drift analysis

A comparison of:
- governance docs,
- intended bounded context ownership,
- actual runtime behavior,
- actual data and communication paths.

Highlight gaps, contradictions, and missing standards.

### 5. Risk classification

Classify findings as:
- acceptable trade-off,
- needs standardization,
- needs architectural review,
- likely defect in system design,
- dangerous ambiguity.

### 6. Recommendations

Provide recommendations in three horizons.

#### Immediate

Low-risk clarifications, standards, and instrumentation that can be adopted now.

#### Near-term

Targeted refactors or contracts to reduce ambiguity and improve maintainability.

#### Strategic

Larger architectural decisions requiring ADRs, roadmap changes, or new governance.

## Standards for analysis

- Do not assume hybrid architecture is good by default; prove whether it is coherent.
- Do not assume ad hoc implementation is bad by default; determine whether it reflects justified local optimization or ungoverned drift.
- Do not recommend rewrites unless the evidence shows the current shape is structurally unsound.
- Prefer explicit boundaries, explicit ownership, and explicit failure propagation over magical abstractions.
- Distinguish between “documented but not enforced,” “enforced but undocumented,” and “neither documented nor enforced.”
- Pay special attention to repeated exceptions and workarounds; they often indicate missing policy.
- Treat ingestion, SSR/hydration, communication pipelines, and observability as first-class architecture concerns, not implementation details.

## Specific anti-patterns to hunt for

Actively look for:

- route-level rendering decisions made without surface classification,
- server/client duplication of transformation logic,
- multiple pathways to perform the same business action,
- client components doing heavy data shaping better suited to server composition,
- server-side coupling to UI concerns that blocks frontend iteration,
- RPCs or DB logic acting as shadow service layer without explicit acknowledgment,
- ingestion pipelines with weak idempotency or unclear stage boundaries,
- missing replay/recovery semantics for batch imports,
- realtime additions that bypass established ownership rules,
- inconsistent validation across UI/server/DB,
- hard-to-localize failures due to mixed responsibilities,
- governance docs that do not describe runtime behavior,
- architecture decisions encoded only in habit or tribal knowledge.

## Output format

Return a structured report with:

1. Executive summary.
2. Reality map.
3. Findings by theme.
4. Drift analysis.
5. Ranked improvement opportunities.
6. Standards/governance proposals.
7. Open questions requiring explicit architectural decisions.

Where helpful, include matrices or tables, but prioritize clarity over ceremony.
