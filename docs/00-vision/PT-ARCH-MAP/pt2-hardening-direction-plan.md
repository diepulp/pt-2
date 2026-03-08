# PT-2 Hardening Direction Plan
## Formalizing the Tightening Direction Suggested by the Architecture Reality Report

> **Date**: 2026-03-07  
> **Context**: Follow-on hardening plan derived from the PT-2 Architecture Reality Report  
> **Intent**: Convert report findings into concrete development direction, standards, and execution tracks

---

## 1. Executive framing

The Architecture Reality Report does **not** describe a structurally unsound system. Its overall conclusion is that PT-2 has a strong architectural core: service boundaries are disciplined, bounded-context ownership matches implementation, the RLS/security model is mature, and the import pipeline already behaves like a first-class ingestion system rather than improvised feature glue. The main weaknesses are concentrated in runtime composition, operational visibility, and standardization of page-level execution patterns. See executive summary, risk summary, and ranked opportunities.  

That distinction matters.

This is **not** a rescue plan for a fraudulent architecture. It is a **hardening plan** for a good system that has reached the point where the next failures will come not from missing domains or weak schema discipline, but from inconsistent rendering strategy, weak production observability, thin release confidence, and missing runtime standards. The report found zero dangerous ambiguities and zero likely systemic design defects, but it did identify three areas needing architectural review and five needing standardization. 

The practical implication is simple: PT-2 should not be reimagined. It should be tightened where runtime behavior is currently less governed than service, security, and schema behavior.

---

## 2. The five tightening areas and what they really mean

The report effectively suggests five main tightening directions:

1. **Rendering and surface policy**
2. **Production observability**
3. **Release confidence / E2E in CI**
4. **Caching, timeouts, and runtime delivery standards**
5. **Operational hardening of edge weak spots** (admin role transport, worker visibility, dependency reproducibility)

These do not all carry equal weight. Some are standards gaps. Some are architecture review items. A few are simply hygiene items that should be closed quickly.

---

## 3. Hardening area 1 — Rendering and surface policy

### What the report found

The report identifies rendering architecture as one of the clearest weak spots:
- there is **no formal surface classification** per route,
- SSR/CSR/RSC choices are made ad hoc,
- the Shift Dashboard shows the best pattern in the codebase,
- the Pit Dashboard remains a client shell with 4+ network round trips before meaningful paint,
- several application surfaces fetch everything on the client. fileciteturn2file1 fileciteturn2file2

This is not yet architectural decay, but it is exactly how architectural drift starts: one page gets built with a deliberate pattern, the next page gets built by convenience, and soon rendering strategy becomes a local guess instead of an application policy.

### Why this matters now

PT-2 is growing into multiple surface classes:
- public/static,
- onboarding/interaction-heavy,
- operational/live,
- compliance,
- admin,
- ingestion,
- reporting.

Those surfaces do **not** have the same workload profile. A route that benefits from server-prefetch and shaped view models is not the same as a polling-heavy import wizard or a highly interactive admin form. The danger is not that PT-2 chose the “wrong” rendering model. The danger is that it has not yet formally declared which rendering strategy belongs to which surface class.

### Suggested tightening direction

Formalize a **Surface Classification Standard**.

This should not merely list routes. It should declare, per surface class:

- intended rendering mode,
- default data-fetch strategy,
- allowed exceptions,
- hydration expectations,
- caching posture,
- realtime posture,
- timeout behavior,
- performance budget expectations.

At minimum, define these classes:

- **Static informational surfaces** — CDN/static, no client fetch for primary content
- **Interaction-heavy onboarding/admin forms** — client-led, but with explicit fetch contracts and timeout policy
- **Operational dashboards** — server-prefetch where possible, shaped view models, controlled hydration
- **Realtime operational surfaces** — hybrid/server-seeded, client-subscribed, no uncontrolled fetch waterfalls
- **Batch/infrastructure flows** — client shells allowed, but progress/reporting semantics formalized
- **Compliance/reporting surfaces** — deterministic query path, explicit freshness and reproducibility rules

### My added suggestion

Do **not** stop at `SURFACE_CLASSIFICATION.md`. That would be decent, but too passive.

Add a lightweight **Route Architecture Header** convention for major pages or route groups. Every major surface should declare:
- classification,
- rendering mode,
- data owner,
- fetch pattern,
- freshness target,
- error boundary strategy,
- why exceptions exist.

Otherwise the standard becomes another respectable PDF-shaped corpse.

### Development effort to establish

- Produce the classification document.
- Audit all major routes against it.
- Refactor the Pit Dashboard to use the Shift Dashboard server-prefetch pattern as the canonical operational dashboard template.
- Promote one reusable “operational dashboard shell” pattern for future metric surfaces.
- Require new major routes to declare classification before implementation.

---

## 4. Hardening area 2 — Production observability

### What the report found

Observability is one of the three items marked for architectural review. The report states:
- no external monitoring platform,
- no distributed tracing,
- no production metrics collection,
- console logging disabled in production,
- correlation IDs exist but are not exported to HTTP headers,
- worker observability is minimal and failed batches require manual DB inspection. fileciteturn2file2turn2file3

This is the most serious weakness in the report, because it affects every other area. A system may be functionally correct and still be operationally half-blind.

### Why this matters now

You are introducing measurement surfaces and rent-paying metrics. That means the system is moving from “can we render and mutate state correctly?” toward “can we trust, explain, and defend what production is doing?” Without observability, wrong numbers, silent drift, failing background work, or page-level regressions will remain annoyingly invisible until users or operators complain.

That is not paranoia. That is how decent systems become stressful systems.

### Suggested tightening direction

Create an **Operational Observability Baseline**.

This baseline should include:

- error monitoring in production,
- request tracing and correlation propagation,
- worker/job telemetry,
- route-level latency metrics,
- external dependency timing,
- dashboard data fetch timings,
- batch pipeline health signals,
- alert thresholds for failure patterns.

At minimum:
- integrate Sentry or equivalent,
- expose correlation IDs to response headers,
- add instrumentation for route handlers, RPC-heavy pages, worker jobs, and import batches,
- add minimal RED-style metrics (rate, errors, duration) for critical endpoints and jobs.

### My added suggestion

Split observability into two layers:

#### Layer A — Platform observability
For app/server/worker health:
- request failures,
- latency,
- queue/job failures,
- exception traces,
- deployment regression signals.

#### Layer B — Business observability
For measurement surfaces:
- stale data age,
- recompute failures,
- metric fetch cost,
- divergence between source truth and displayed aggregates,
- freshness SLA violations.

If you only do Layer A, you will know the app is wounded.
If you also do Layer B, you will know whether the numbers are lying.

### Development effort to establish

- Integrate monitoring before broader production rollout.
- Export correlation IDs end-to-end.
- Add worker health metrics and dead-letter/failed batch alerting.
- Instrument all ADR-039 measurement queries and surfaces with timing/freshness telemetry.
- Create a minimal operational dashboard for engineering itself.

---

## 5. Hardening area 3 — Release confidence and E2E in CI

### What the report found

The report praises PR gates overall, but explicitly calls out that Playwright E2E tests exist and are not part of CI. UI regressions therefore remain undetected before merge. fileciteturn2file2turn2file3

### Why this matters now

This matters more than teams like to admit. A system can have excellent service discipline and still regress at the composed workflow layer:
- hydration breakage,
- auth redirects,
- SSR/client mismatch,
- route protection,
- sequence bugs in cashier/compliance/admin flows,
- dashboard regressions after “minor” fetch refactors.

In other words: your domain layer can be clean while your user journey is quietly on fire.

### Suggested tightening direction

Promote E2E from “we have tests” to “we enforce journeys.”

Start by selecting a **thin but critical CI E2E subset**, not the whole kitchen sink:
- login/start flow,
- shift dashboard load,
- pit dashboard basic data paint,
- player import happy path shell,
- one admin/settings path,
- one compliance path.

The goal is not maximal browser coverage. The goal is to catch composition regressions at merge time.

### My added suggestion

Introduce **Surface Gate Coverage**, not just test counts.

Each major surface class should have at least one CI-gated E2E proving its core route contract:
- route loads,
- auth is enforced,
- critical data paints,
- primary user action works,
- error state is survivable.

That is far more valuable than masturbating over total test count while the important journeys stay unguarded.

### Development effort to establish

- Create a separate Playwright CI workflow.
- Provision Supabase + browser in CI.
- Define a minimal required route-journey suite by surface class.
- Add failure ownership rules so E2E failures are treated as product-surface regressions, not “QA noise.”

---

## 6. Hardening area 4 — Runtime delivery standards: caching, timeouts, and fetch policy

### What the report found

The report identifies several missing standards:
- no server-side caching policy,
- no client fetch timeout policy,
- no rendering mode selection criteria,
- no performance budgets per surface. fileciteturn2file2turn2file4

It also specifically notes that all caching is client-side and that reference data is re-fetched on every server render because `cache()`, `revalidate`, and `unstable_cache` are not used. fileciteturn2file3

### Why this matters now

Without runtime delivery standards, performance becomes accidental:
- one page uses a nice prefetch pattern,
- another performs client waterfalls,
- reference data is fetched repeatedly,
- slow dependencies are allowed to hang,
- no one knows what “too slow” means per route.

That is not yet a failure, but it is certainly the embryo of one.

### Suggested tightening direction

Create a **Runtime Delivery Standard** covering:

- server caching policy,
- reference-data caching classes,
- client and server fetch timeout rules,
- retry policy per request type,
- stale-time alignment with business freshness needs,
- performance budgets per surface class,
- when realtime is allowed vs overkill,
- when SSR or prefetch is required.

At minimum define:
- which data qualifies as reference data,
- default `revalidate` intervals by data class,
- default timeout thresholds,
- which requests may retry,
- which requests must fail fast,
- which surfaces require a first meaningful data-paint target.

### My added suggestion

Treat data delivery as a first-class architecture concern, not a hook-level convenience.

For ADR-039 metric surfaces especially, define a **freshness contract** per metric group:
- live,
- near-real-time,
- request-time,
- cached,
- periodic,
- snapshot.

This should align with the Metric Provenance Matrix work, otherwise dashboards will drift into inconsistent freshness semantics while pretending to be authoritative.

### Development effort to establish

- Add server caching for stable reference data.
- Define timeout wrappers for client and server fetch paths.
- Declare performance budgets by surface class.
- Tie dashboard fetch policy to metric freshness categories.
- Audit direct Supabase bypass hooks to ensure they remain justified and bounded.

---

## 7. Hardening area 5 — Edge weak spots and operational hygiene

### What the report found

The report highlights several smaller, but still real, hardening items:
- admin role is derived via a DOM attribute in one path, which is fragile and SSR-hostile,
- worker observability is minimal,
- Supabase packages are pinned to `latest`, making builds non-reproducible. fileciteturn2file2turn2file3

These are not sweeping architecture failures. They are the kinds of weak seams that become embarrassing incidents later.

### Suggested tightening direction

Close these as **fast hardening wins**:

- replace DOM-derived role access with a proper provider/context or server-resolved role path,
- make worker health visible without manual DB spelunking,
- pin Supabase versions and treat dependency reproducibility as a runtime stability requirement.

### My added suggestion

Group these under a **Hardening Hygiene Track** and clear them deliberately, instead of letting them sit as shame pebbles in the shoe.

Not everything needs an ADR. Some things need to stop being stupid.

### Development effort to establish

- remove SSR-fragile role transport,
- expose worker/job health signals,
- pin package versions,
- add dependency update cadence and review rules.

---

## 8. Formal development tracks to pursue

The report’s recommendations should be turned into the following execution tracks.

### Track A — Runtime Architecture Standardization
Purpose: eliminate page-level guesswork.

Includes:
- surface classification standard,
- rendering selection criteria,
- route architecture header convention,
- canonical operational dashboard pattern,
- Pit Dashboard refactor to server-prefetch pattern.

### Track B — Observability Foundation
Purpose: make production behavior visible.

Includes:
- error monitoring,
- correlation propagation,
- route/job metrics,
- worker telemetry,
- business-metric freshness and divergence telemetry.

### Track C — Delivery Confidence
Purpose: make workflow regressions harder to merge.

Includes:
- Playwright CI workflow,
- critical route-journey coverage,
- E2E ownership rules,
- eventual gating thresholds by surface class.

### Track D — Data Delivery and Freshness Governance
Purpose: formalize how data reaches surfaces.

Includes:
- server caching standard,
- fetch timeout policy,
- performance budgets,
- metric freshness categories,
- alignment with ADR-039 provenance work.

### Track E — Hardening Hygiene
Purpose: close low-effort weak seams.

Includes:
- admin role transport cleanup,
- worker visibility improvements,
- dependency pinning,
- small runtime integrity fixes.

---

## 9. Priority order

Recommended order of execution:

### Priority 1
**Observability Foundation**  
Because blind systems lie to operators and hide regressions.

### Priority 2
**Runtime Architecture Standardization**  
Because ad hoc page patterns will multiply if not arrested now.

### Priority 3
**Delivery Confidence**  
Because composed route workflows need merge-time protection.

### Priority 4
**Data Delivery and Freshness Governance**  
Because ADR-039 measurement surfaces need defensible runtime contracts.

### Priority 5
**Hardening Hygiene**  
Because these are quick wins and should not be allowed to linger, but they are not the main architectural risk.

---

## 10. Guidance for further development effort

Future development should proceed under these rules:

### Rule 1 — No major new surface without declared classification
Every new route group or major page must declare:
- surface class,
- rendering mode,
- primary fetch path,
- freshness target,
- failure boundary,
- why this pattern is appropriate.

### Rule 2 — Metric surfaces must declare freshness and provenance
No business-facing metric should appear in UI without:
- canonical definition,
- computation owner,
- freshness category,
- reconciliation path.

### Rule 3 — Runtime behavior must be governed like schema and services are governed
PT-2 already governs service and schema behavior well. The next maturity step is to apply similar discipline to:
- rendering,
- caching,
- timeouts,
- observability,
- dashboard composition.

### Rule 4 — Repeated exceptions must be harvested into standards
If the same workaround appears twice, it is no longer a local exception. It is an undocumented policy begging to be formalized.

### Rule 5 — Operational confidence is now part of architecture
A page is not “done” because it renders and mutates correctly. It is mature when:
- it is observable,
- its delivery pattern is intentional,
- its data freshness is explicit,
- its regressions are catchable,
- its key numbers are defensible.

---

## 11. Bottom line

The report suggests a reassuring but demanding conclusion:

PT-2 is **not weak at its core**. It is weak where many ambitious systems are weak once they outgrow early-stage implementation convenience:
- page/runtime policy,
- production visibility,
- release confidence,
- metric delivery rigor.

That means the right next move is not re-architecture. It is **selective hardening**.

The application today is good enough to justify confidence.
It is not yet hardened enough to justify complacency.

That is the direction this plan formalizes.
