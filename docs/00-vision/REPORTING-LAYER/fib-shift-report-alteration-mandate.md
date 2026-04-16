# FIB Alteration Mandate — Shift Report Containment Alignment

**Artifact target:** `FIB-H-SHIFT-REPORT.md`  
**Purpose:** align the intake with pilot containment and remove the remaining scope drift vectors identified in audit.  
**Status:** proposed amendment mandate for immediate splice into the FIB before downstream PRD / EXEC work.

---

## Mandate Summary

The Shift Report FIB remains **pilot-viable as a single feature intake**, but it currently blends one coherent operator-facing feature with multiple implementation classes:

1. **report data assembly / orchestration**
2. **report presentation / document rendering**
3. **bounded export behavior**

This is acceptable **only because** the feature is still framed as a **read-only orchestration surface over existing services**.

The document must therefore be tightened so that it does **not silently drift** into:
- new data-layer invention
- generalized reporting infrastructure
- expanded export/report-generation platform work

The mandate is to **preserve one FIB**, while making its containment logic sharper and its amendment triggers harder.

---

## Governing Interpretation

The Shift Report is to be treated as:

> **One operator-facing feature with two internal execution lanes.**

That means:

- **Product scope:** one feature
- **Engineering scope:** two explicitly bounded workstreams
- **Expansion rule:** any new data substrate or generalized reporting behavior requires amendment

Do **not** split this into two separate FIBs yet.  
Do **not** allow the unified FIB to conceal backend invention.

---

## Required Alterations

## 1. Add explicit internal workstream partitioning

The FIB must explicitly declare two internal lanes:

### WS1 — Report Assembly
Construct a read-only `ShiftReportDTO` from **existing** service outputs.  
Allowed work:
- field mapping
- section composition
- totals reconciliation
- snapshot assembly
- read-only aggregation using already-served data

Not allowed under WS1:
- new domain logic
- new report-only business rules
- new persistence
- new schema work
- new RPC/view creation unless the FIB is amended

### WS2 — Report Presentation
Render the assembled DTO on the report page and support:
- on-screen report rendering
- browser print
- CSV export for the financial summary table only

Not allowed under WS2:
- server-side PDF generation
- scheduled delivery
- email distribution
- configurable layouts
- multi-format export expansion

**Intent:** stop the document from treating orchestration and rendering as a vague single blob.

---

## 2. Remove custom time window language

The current intake language implies both:
- standard shift-based reporting
- custom time-window reporting

That is too loose for pilot scope.

### Mandated replacement
Replace any language like:
> “shift selector (swing/day/grave or custom time window)”

with:

> **Shift selector based on existing casino-configured shift boundaries only. Custom time windows are excluded from MVP scope.**

**Reason:** custom windows drag the feature toward generalized reporting semantics, interpretation disputes, and likely downstream query creep.

---

## 3. Resolve the closed-session ambiguity before downstream design

The current FIB leaves unresolved whether closed session count should come from:
- a filtered visit query
- or a new lightweight RPC

This is not a harmless open question. It is a hidden scope fork.

### Mandate
Before PRD / EXEC generation, the FIB must be updated to state one of the following:

- **Option A:** closed-session count is derived from an existing filtered visit query and remains in-scope
- **Option B:** closed-session count is removed from MVP scope
- **Option C:** a new RPC is required, which triggers formal amendment because the feature is no longer “assembly and rendering only”

**Reason:** the FIB may not simultaneously claim “no new RPCs” while leaving an unresolved path that may require one.

---

## 4. Reframe “actionable highlighting” as derivative only

The current containment loop says the system highlights sections containing actionable items.

This must be narrowed.

### Mandated clarification
Add language stating:

> **Any highlighting or emphasis in the report must be purely derivative of existing alert, coverage, or compliance states already produced by current services. The report introduces no new interpretive scoring, thresholding, or prioritization logic.**

**Reason:** without this guardrail, the report quietly becomes a secondary decision engine.

---

## 5. Lock CSV scope to the financial summary only

CSV export is acceptable only because it is tightly bounded.

### Mandated clarification
State explicitly:

> **CSV export applies only to the per-table financial summary rows shown in Section 1. No other report sections are exportable in MVP.**

**Reason:** “export” otherwise metastasizes into a cross-section data portability project.

---

## 6. Strengthen the no-new-data-substrate rule

The current exclusions and dependencies are decent, but they need one harder sentence.

### Mandated addition
Add a rule such as:

> **If implementation reveals that the report cannot be assembled exclusively from existing services, routes, views, and already-accepted read pathways, the feature must pause for amendment rather than inventing new report-specific data infrastructure under the same intake.**

**Reason:** this is the main containment doctrine keeping the unified FIB honest.

---

## 7. Preserve the single-FIB structure, but state why

The brief should justify why this remains one intake item despite multiple technical lanes.

### Mandated rationale
Add wording such as:

> **This remains one FIB because the operator experiences the shift report as one coherent workflow: generate, review, print, and hand off a single management artifact. Internal execution is partitioned for delivery discipline, not because the operator problem is separable.**

**Reason:** this closes the conceptual gap and prevents future confusion about whether the FIB is improperly bundled.

---

## Suggested Patch Language

The following language can be spliced directly into the FIB.

### Add under Dependencies / Assumptions or as a new implementation note

> **Implementation partition:** This feature executes in two bounded internal lanes. **WS1 — Report Assembly** constructs a read-only `ShiftReportDTO` from existing service outputs only. **WS2 — Report Presentation** renders that DTO on-screen and supports browser print plus CSV export for the financial summary table only. Neither lane may introduce new business logic, persistence, configurable report infrastructure, or report-specific schema/RPC work without formal amendment.

### Replace shift-window language in the containment loop

> Pit boss selects gaming day and configured shift boundary → system fetches and assembles data from existing services in parallel, shows a loading state. **Custom time windows are excluded from MVP scope.**

### Add to required outcomes or exclusions

> Any highlighting in the rendered report must be derivative of existing service states only (e.g., unresolved alerts, weak coverage, compliance triggers). The report introduces no new scoring, prioritization, or decision logic.

### Add to required outcomes or exclusions

> CSV export is limited to the Section 1 per-table financial summary rows. No other report sections are exportable in MVP.

### Add to scope authority / expansion trigger rule

> If any required report element cannot be sourced through existing services and accepted read paths, implementation must stop for amendment rather than adding new report-specific infrastructure under this intake.

---

## Alignment Verdict

After the above alterations, the FIB should be interpreted as:

- **contained**
- **pilot-safe**
- **single-feature coherent**
- **multi-lane in execution, not multi-feature in scope**

That is the correct shape.

Without these alterations, the document remains directionally good but still leaves enough ambiguity for backend creep, generalized reporting drift, and quiet expansion of export semantics.

---

## Final Directive

**Amend the FIB, do not split it.**  
But make the amendment discipline explicit enough that the document cannot smuggle in a reporting platform under the guise of a shift handoff feature.
