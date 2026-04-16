# FIB Amendment Note — PDF Rendering and Generation Direction

**Target artifact:** `FIB-H-SHIFT-REPORT.md`  
**Amendment purpose:** establish the sanctioned approach for generating the Shift Report PDF from dynamic data, and prevent the feature from defaulting to browser-print improvisation or client-side export hacks.  
**Status:** proposed amendment for splice before PRD / EXEC generation.

---

## Amendment Summary

The Shift Report is no longer to be treated as merely:

- a web page that can be printed
- a browser-rendered view with convenience export
- a UI surface whose output artifact is left to client behavior

The clarified direction is:

> **The Shift Report PDF must be generated through a template-first, server-generated document pipeline.**

This amendment establishes the canonical approach for turning dynamic report data into a stable PDF artifact suitable for printing, attachment, and circulation.

---

## Governing Decision

The sanctioned rendering/generation path is:

1. **Assemble a canonical `ShiftReportDTO` from dynamic data**
2. **Render that DTO into a fixed report template**
3. **Generate the PDF on the server**
4. **Use the on-screen page as a review surface, not the authoritative artifact path**
5. **Retain browser print only as a convenience fallback, not the canonical generation method**

This is the approved architectural posture for MVP.

---

## Why This Amendment Is Required

If the Shift Report is expected to function as:

- a tangible handoff artifact
- a digital attachment distributed over email
- a management-readable and archive-worthy document

then `window.print()` and raw browser print behavior are not sufficient as the primary generation mechanism.

Browser print does not reliably guarantee:

- stable pagination
- consistent formatting across environments
- canonical artifact identity
- predictable attachment quality
- durable archival behavior

Likewise, client-side PDF assembly is not to be treated as the default path because it introduces unnecessary variability, weaker control over document generation, and more brittle output behavior.

Therefore:

> **The authoritative report artifact must be produced server-side from a fixed template using a canonical DTO.**

---

## Required FIB Changes

## 1. Establish the canonical generation pipeline

The FIB must explicitly define the report production flow as:

### Step 1 — Report Assembly
A read-only service assembles a `ShiftReportDTO` from existing, accepted data sources.

### Step 2 — Template Rendering
A fixed report template consumes the DTO and produces a report representation suitable for canonical PDF generation.

### Step 3 — Server-side PDF Generation
The server generates the PDF artifact from the rendered report template.

### Step 4 — Optional Preview Surface
The app may render the same DTO into an on-screen preview for operator review, but this is a review surface only.

### Step 5 — Distribution / Print Usage
The generated PDF is the artifact used for printing, email attachment, and archival.

---

## 2. Define the DTO-first rule

The template and PDF layer must not be responsible for live business computation.

### Mandated rule
The FIB should state:

> **All business computation, totals reconciliation, quality derivation, and field preparation must occur before rendering. The report template consumes a display-ready `ShiftReportDTO` and introduces no independent business logic.**

This keeps the document layer presentational and prevents calculation drift between the UI and the PDF artifact.

---

## 3. Define the template-first rule

The PDF must come from a fixed, standardized template rather than ad hoc rendering behavior.

### Mandated rule
Add language such as:

> **The Shift Report PDF is generated from a fixed report template with standardized section order, typography, spacing, and pagination behavior. It is not generated from a free-form dashboard printout or user-configurable layout.**

This amendment intentionally rejects:
- user-configurable report layouts
- report-builder semantics
- multiple templates in MVP
- layout decisions deferred to browser quirks

---

## 4. Establish server-side ownership of the artifact

The FIB should explicitly separate the client review surface from server-owned artifact generation.

### Mandated rule
Add wording such as:

> **The client may request preview, PDF generation, and manual distribution actions, but the canonical report artifact is generated server-side. The browser does not own the authoritative PDF generation path.**

This preserves control over:
- formatting
- generation consistency
- attachment quality
- auditability of the produced artifact

---

## 5. Reclassify browser print correctly

Browser print is still allowed, but its status must be downgraded.

### Mandated rule
Replace any implication that browser print is the primary artifact path with:

> **Browser print remains an operator convenience fallback only. It is not the canonical generation path for the Shift Report artifact.**

This is a containment rule, not a ban.

---

## 6. Reject client-side PDF bricolage

The FIB should pre-empt a common implementation trap.

### Mandated rule
Add language stating:

> **Client-side PDF construction from browser state is excluded from MVP as the primary generation approach. Any client-side export behavior must remain secondary to the server-generated canonical PDF artifact.**

This prevents the feature from drifting into brittle front-end export improvisation.

---

## 7. Add a rendering ownership lane or expand the existing partition

The current internal workstream model should either:
- add a dedicated rendering/generation lane
- or expand the rendering lane to explicitly include server-generated PDF creation

### Recommended partition

#### WS1 — Report Assembly
Construct a read-only `ShiftReportDTO` from existing service outputs only.

#### WS2 — Canonical Report Rendering
Render the DTO into:
- on-screen review surface
- fixed report template
- canonical document markup suitable for PDF generation

#### WS3 — PDF Generation and Distribution
Generate the canonical PDF server-side and support bounded manual distribution / attachment workflows.

If keeping only two lanes, then WS2 must be expanded to explicitly include server-side canonical PDF generation.

---

## 8. Add output-mode separation

The FIB should distinguish between the report’s different output modes.

### Mandated output modes
- **Preview mode** — on-screen operator inspection
- **Artifact mode** — canonical PDF
- **Print mode** — print from canonical artifact or fallback convenience
- **Distribution mode** — manual sending of canonical PDF

This removes ambiguity around whether the page itself is the report.

---

## 9. Add amendment triggers for renderer drift

The expansion trigger rule should be updated to stop quiet renderer sprawl.

### Add triggers for amendment if:
- multiple PDF templates are proposed
- role-based report variants are proposed
- user-configurable layouts are proposed
- document builder semantics are proposed
- client-side PDF generation becomes primary
- artifact snapshot persistence / registry is introduced
- signing / certification / watermark workflows are introduced

---

## Preferred Technical Direction

The FIB should not over-prescribe a specific library at intake stage, but it should prescribe the architectural pattern.

### Approved pattern
> **Canonical DTO → fixed template → server-generated PDF**

This is the direction to freeze.

### Why this pattern is preferred
- matches the report’s structured business-document shape
- keeps calculations out of the rendering layer
- centralizes artifact generation
- produces a stable attachment for email and print
- avoids browser-specific print variability
- keeps future archival / governance options open

### What is intentionally not selected as the primary path
- raw browser print / `window.print()`
- client-side PDF generation from UI state
- direct free-form report-builder approach

---

## Suggested Patch Language

The following text can be spliced directly into the FIB.

### Add under internal workstream partition

> **WS2 — Canonical Report Rendering**  
> Render the assembled `ShiftReportDTO` into both an on-screen review surface and a fixed Shift Report template suitable for canonical PDF generation. This lane includes standardized layout, controlled pagination behavior, and print-safe formatting. It does not include configurable layouts, report-builder semantics, or template variants in MVP.
>
> **WS3 — PDF Generation and Distribution**  
> Generate the canonical Shift Report PDF server-side from the fixed report template and support bounded manual distribution of that artifact. This lane excludes scheduled delivery, recurring automation, signing/certification workflows, and distribution-policy engines.

### Add to required outcomes

> The Shift Report PDF is generated server-side from a fixed report template using a canonical `ShiftReportDTO`.  
> The on-screen report page acts as a review surface only and is not the authoritative artifact-generation path.  
> Browser print remains available only as a convenience fallback and is not the canonical report-generation method.

### Add to exclusions

> Client-side PDF generation as the primary artifact path is excluded from MVP.  
> User-configurable report layouts, multiple templates, report-builder behavior, and browser-owned canonical generation are excluded from MVP.

### Add to dependencies / assumptions or implementation note

> The document layer is DTO-first and presentation-only. All business computation, totals preparation, and quality derivation must occur before template rendering. The template and PDF generation layers introduce no independent business logic.

---

## Alignment Verdict

This amendment gives the Shift Report a sane document pipeline:

- assemble data once
- render from one canonical DTO
- generate one authoritative PDF server-side
- preview separately
- distribute the artifact, not the page

That is the right shape for a report expected to leave the application and circulate as a management artifact.

---

## Final Directive

**Freeze the report generation direction as: canonical DTO → fixed template → server-generated PDF.**  
**Treat the page as preview, not the artifact.**  
**Retain browser print only as fallback convenience.**  
**Keep client-side PDF generation out of the primary path.**
