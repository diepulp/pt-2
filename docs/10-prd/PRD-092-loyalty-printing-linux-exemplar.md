---
id: PRD-092
title: POS Loyalty Instrument Printing — Linux Exemplar (Reference Implementation)
owner: Lead Architect
status: Draft
affects: [ADR-062, ADR-063, ADR-045, ADR-058, ADR-024, FEATURE-loyalty-printing]
created: 2026-06-18
last_review: 2026-06-18
phase: Phase 1 (Linux Exemplar / Gate E1)
pattern: A
http_boundary: true
renders_derived_value_surface: false
---

# PRD-092 — POS Loyalty Instrument Printing: Linux Exemplar

## 1. Overview

- **Owner:** Lead Architect (LoyaltyService.InstrumentPrinting submodule)
- **Status:** Draft
- **Summary:** Replace the browser `window.print()` path on the named loyalty *redemption* surface
  with a controlled print path that targets a configured printer, persists a durable `print_attempt`
  audit, and returns a truthful four-state outcome. This PRD is the **Linux exemplar (reference
  implementation)** per ADR-062 D8: it proves the architecture — `ReceiptDocument` generation,
  the `LoyaltyInstrumentPrinter` contract, the managed local agent, the audit lifecycle, idempotency,
  the operator workflow, and one-way CUPS spooler submission — on Linux/CUPS only. **Windows
  production certification is a separate follow-on PRD (PRD #2) and is out of scope here.** Success
  means *the architecture is correct*, not *Windows is certified*.

## 2. Problem & Goals

**Problem.** The named loyalty redemption issuance surface prints redeemable instruments via a hidden
iframe `window.print()` (ADR-045 D1 / Vector C). For a redeemable instrument this is unsafe: it cannot
target a specific device, cannot report trustworthy status, and cannot distinguish a failed print from
a duplicate issuance — a missed print delays service, an uncontrolled retry can mint a second physical
copy. ADR-045's own GAP-C0 flagged the missing print-history persistence path.

**Goals (observable, binary):**
1. The named redemption surface performs **0** `window.print()` calls; 100% of its prints route through the controlled path (GATE-UX-1).
2. Every print/reprint writes **exactly one** `print_attempt` row with full correlation; reprints share instrument identity and carry distinct attempt lineage.
3. No print outcome (`submitted | failed | unknown`) ever creates/mutates a `promo_coupon` row (GATE-DOM-1, invariant test).
4. The `cups` production adapter and the deterministic `fake` adapter pass **one** contract suite with no CUPS-specific type/semantic leaking above the adapter boundary (GATE-PLATFORM-1/2).
5. On a real TM-T88V (Linux/CUPS rig): first-print, printer-offline, retry, and deliberate reprint are each distinguishable (GATE-HW-2).

**Non-goals (explicit):**
- **Windows / `windows_spooler` adapter, install/update procedures, Windows localhost security review** — deferred to PRD #2 (Gate E2 / `WINDOWS_CERTIFICATION_REQUIRED`).
- **Device-fault fidelity** (paper-out/cover-open/offline as `failure_domain=device`) — out of scope; one-way CUPS raster cannot observe it. `submitted`-only ceiling.
- **Bidirectional ESC/POS**, ePOS-direct, fleet/cloud queue, multi-vendor abstraction, unattended/batch printing.
- **Generic/runtime/admin-authored template engine**; authoritative legal layout + barcode symbology (see Dependencies).
- Any change to instrument eligibility/value/redemption authority; no new instrument types.
- `lib/print/` `window.print()` for **non-loyalty** documents (shift reports, MTL) — retained untouched (ADR-045 / ADR-062 D4).

## 3. Users & Use Cases

**Primary user — Pit Boss / Floor Supervisor (operator) on the redemption surface:**
- Issue a redeemable instrument and print it to the configured pit printer via the controlled action.
- See a bounded outcome (submitted / failed / unknown) and choose an **explicit** retry or reprint — never a silent auto-retry.
- Distinguish first-print vs retry-after-failure vs reprint-after-uncertain from `print_attempt` lineage.

**Secondary user — Admin / Floor tech:**
- Run a non-redeemable **test print** that exercises the adapter without issuing an instrument.

## 4. Scope & Feature List

1. `LoyaltyInstrumentPrinter` contract — `{ getStatus, print, testPrint }` — OS-neutral, in `services/loyalty/printing/`.
2. Versioned template builder: frozen `FulfillmentPayload` → canonical transport-neutral `ReceiptDocument` (block list: text/divider/image/barcode/feed/cut).
3. Renderers: `cups` (production payload), `fake` (deterministic snapshot), `html-preview` (preview-only, non-canonical).
4. `cups` transport adapter (one-way spooler submission) + deterministic `fake` adapter, both behind the contract.
5. `print_attempt` relation — single audit-controlled lifecycle row per attempt (design intent; schema in EXEC).
6. Closed state machine: `requested` → exactly once → terminal `submitted | failed | unknown`; terminal rows immutable; new observation = new instance.
7. Canonical `failure {failure_domain, failure_code}` field; only `render_validation` domain populated on the exemplar (`device` stays null).
8. Controlled print action (route handler / server action): validate target+payload → write `print_attempt(requested)` → invoke adapter → transition terminal status; fails closed before any success claim.
9. Non-redeemable admin **test-print** path.
10. Operator UX: replace the surface's `window.print()` with the controlled action; explicit retry/reprint affordance; no silent auto-retry; no automatic browser fallback.
11. Idempotency key + reprint lineage on `print_attempt`; exemplar agent honors idempotency (ADR-063 D5) and reports failure truthfully (ADR-063 D6).
12. `template_id` / immutable `template_version` / `receipt_document_hash` (digest of canonical serialized `ReceiptDocument`) provenance on `print_attempt`.

## 5. Requirements

**Functional**
- FR-1 The named redemption surface invokes the controlled action and makes **no** `window.print()` calls (GATE-UX-1).
- FR-2 Each `print()`/`testPrint()` writes one `print_attempt(requested)` then transitions to exactly one terminal state.
- FR-3 `submitted` means the CUPS spooler accepted the job — **no** claim of physical completion; any spooler "completed" maps to `submitted`.
- FR-4 A failed/uncertain/retried print **never** writes `promo_coupon` (GATE-DOM-1).
- FR-5 Re-delivery of the same idempotency key returns the prior outcome and emits no second copy; explicit reprint creates a new attempt instance sharing instrument identity (GATE-DUP-1).
- FR-6 Render/validation failures (`invalid_document`/`unsupported_operation`) are caught before the adapter, persist as `failure_domain=render_validation`, and resolve `result_status=failed`.
- FR-7 The HTML renderer is reachable only as labelled **preview**, never as the production payload on this surface.

**Non-functional**
- NFR-1 **Contract OS-neutrality (GATE-PLATFORM-1):** no CUPS-specific types/strings/IDs appear above the adapter boundary; the contract suite runs without a physical printer (against `fake`).
- NFR-2 **Adapter parity (GATE-PLATFORM-2):** `cups` and `fake` adapters pass the same contract suite and return the canonical result/failure vocabulary.
- NFR-3 **RLS / context (ADR-024):** `operator_id` + `casino_id` from authoritative session-var context; `print_attempt` casino-scoped (Pattern C); writes via session-var context.
- NFR-4 **Security (GATE-SEC-1, minimal):** exemplar agent binds loopback only; no device address or secret in the browser bundle. (Full ADR-063 D1–D4/D7 hardening is PRD #2.)
- NFR-5 **Lint/boundary gate (TEMPLATE-2):** no Epson/ESC-POS/CUPS/spooler/`window.print` calls outside the renderer/adapter layer.

## 6. UX / Flow Overview

- Operator issues instrument on the redemption surface → clicks **Print** (controlled action replaces the old print dialog).
- System writes `print_attempt(requested)`, renders `ReceiptDocument` → `cups` payload, submits to the spooler, transitions to `submitted` (or `failed`/`unknown`).
- Outcome shown as a bounded badge; on `failed`/`unknown` the operator gets an **explicit** Retry; a confirmed reprint is a distinct, labelled action.
- No silent auto-retry; if the agent is down the operator sees `failed`/`unknown` + manual retry — never an automatic `window.print()` fallback.
- Admin test-print: a separate non-redeemable action exercises the adapter end-to-end.

## 7. Dependencies & Risks

**Prerequisites**
- ADR-062 (D1–D8) frozen; ADR-063 authored (enforcement gated to PRD #2). Linux/CUPS rig with TM-T88V (UB-U05 USB) present and a configured CUPS queue (`TM-T88V`, verified).
- Frozen `FulfillmentPayload` at `services/loyalty/dtos.ts` (reused, not forked).

**Provisional-for-exemplar / deferred to PRD #2**
- **DEP-3** — authoritative 80 mm legal text / expiry presentation / validation identifier: a **provisional** layout suffices to prove rendering on the exemplar; authoritative content is a production-cert concern.
- **Vector C GAP-C5** — barcode/QR symbology + authoritative identifier: provisional/optional on the exemplar; finalized in PRD #2.

**Risks / open questions**
- **Terminology governed by a local gate, NOT SRL (`srl_required: false`):** print-lifecycle terms are local integration-contract vocabulary, not ambiguous cross-domain business semantics — see §7a. SRL admission is explicitly **not** a prerequisite for this exemplar.
- CUPS-semantic leakage into the contract would break the future Windows port — mitigated by NFR-1/GATE-PLATFORM-1 as a hard DoD item.
- Provisional layout must be visibly marked non-authoritative so it cannot be mistaken for production-approved content.

## 7a. Terminology / Operator-Copy Gate (replaces SRL admission)

```yaml
srl_required: false
reason: >
  Printing terms are local integration-contract vocabulary, not ambiguous
  cross-domain business semantics.
required_instead:
  - local glossary
  - operator copy review
  - submitted_not_printed invariant
  - PrinterFault deferral
do_not_admit_now:        # not SRL-admitted in this exemplar
  - PrinterFault
  - ReceiptDocument
```

This PRD does **not** require SRL admission. The Linux exemplar introduces print-lifecycle terms whose
meaning is **local to the printing integration contract**. These terms MUST be defined in the PRD/EXEC
glossary and reflected **consistently** across DTOs, API responses, tests, and UI copy.

**Required local definitions:**
- `requested` — a print attempt was created before adapter invocation.
- `submitted` — the local OS spooler accepted the job; **this does not claim physical print completion**.
- `failed` — the controlled path failed before spooler acceptance or during render validation.
- `unknown` — the controlled path could not determine whether submission occurred.
- `retry` — another attempt after a `failed`/`unknown` outcome.
- `reprint` — an intentional new physical copy for the same instrument.

**Deferral constraint (hard):** `PrinterFault` and the device-fault vocabulary are deferred and **MUST NOT**
be introduced in DTOs, UI labels, or persisted schema in this exemplar (the one-way CUPS path cannot
observe device faults; `failure_domain=device` stays null). `ReceiptDocument` is used as a local
integration-contract term but is **not SRL-admitted** now. Either term graduates to SRL only if/when it
later proves to carry ambiguous cross-domain semantics — not by default.

## 8. Definition of Done (DoD) — Gate E1

The Linux exemplar is **Done** when:

**Functionality**
- [ ] Named redemption surface routes 100% of prints through the controlled action; **0** `window.print()` calls (GATE-UX-1).
- [ ] `print()` and `testPrint()` both produce exactly one `print_attempt` with a terminal state.
- [ ] Explicit retry and confirmed reprint work; no silent auto-retry; no automatic browser fallback.

**Data & Integrity**
- [ ] No print outcome creates/mutates `promo_coupon` (GATE-DOM-1 invariant test).
- [ ] Closed state machine enforced: `requested` → once → terminal; terminal rows never mutate; reprint = new instance with shared instrument identity + distinct lineage (GATE-DUP-1).
- [ ] `receipt_document_hash` is the digest of the canonical serialized `ReceiptDocument` (not the transport payload); `template_version` immutable.

**Security & Access**
- [ ] `print_attempt` casino-scoped; `operator_id`/`casino_id` from authoritative context (ADR-024).
- [ ] Exemplar agent binds loopback only; no browser-embedded device secret (GATE-SEC-1 minimal).

**Testing**
- [ ] Semantic snapshot of `ReceiptDocument` (instrument id, value, expiry, terms, token, template id/version, feed/cut).
- [ ] **Adapter parity (GATE-PLATFORM-2):** `cups` + `fake` pass one contract suite returning canonical result/failure vocabulary.
- [ ] **Contract OS-neutrality (GATE-PLATFORM-1):** suite runs without a physical printer; no CUPS types/semantics above the adapter boundary (lint/boundary check, TEMPLATE-2).
- [ ] Happy-path E2E: issue → controlled print → `submitted` → `print_attempt` persisted.

**Operational Readiness**
- [ ] **Real-device exemplar (GATE-HW-2)** on the Linux/CUPS rig: first-print, printer-offline, retry, deliberate reprint, cut + layout validation each distinguishable.
- [ ] `print_attempt` lifecycle row usable as the operational print-health signal (dashboards deferred).
- [ ] Rollback path defined: disabling the controlled action on the surface (no automatic `window.print()` fallback).

**Exemplar Proof (platform exemplar per ADR-062 D8)**
- [ ] Exactly one production adapter realization proven (`cups`) + the deterministic `fake`; **no Windows/`windows_spooler` adapter built here** (GATE-PLATFORM-4 no-overbuild posture).
- [ ] Shared mechanism (contract, audit, idempotency, result/failure vocabulary) proven end-to-end under real execution on Linux.
- [ ] Windows certification explicitly deferred to PRD #2; Linux is **not** a production assumption (ADR-062 D8 anti-drift).

**Governance**
- [ ] **Terminology / Operator-Copy Gate** (§7a) passed: the six local lifecycle/action terms are defined in the PRD/EXEC glossary and reflected consistently across DTOs, API responses, tests, and UI copy; operator-copy review complete.
- [ ] **`submitted` ≠ printed** invariant holds in copy and contract — no UI label or DTO implies physical print completion.
- [ ] **`PrinterFault` / device-fault vocabulary absent** from DTOs, UI labels, and persisted schema (deferral check); `ReceiptDocument` used locally, **not** SRL-admitted.
- [ ] ADR-058 classification section present and matches FEATURE_BOUNDARY (CLS-007 + CLS-003).

**Documentation**
- [ ] Provisional receipt layout documented and visibly marked non-authoritative.
- [ ] Known limitations documented (submitted-only, device faults out of scope, Linux exemplar only).

## 9. Feature Classification & Transport Selection (ADR-058 — mandatory)

```yaml
primary_classification: external_integration        # CLS-007 — hardware integration
secondary_classifications: [authoring]              # CLS-003 — writes print_attempt
authors_domain_fact: true                           # print_attempt lifecycle row
emits_projection_input: false                       # no proven async consumer (print-health dashboards deferred)
requires_transactional_outbox: false                # finance_outbox MUST NOT carry print events
consumes_outbox_events: false
renders_derived_value_surface: false                # renders existing instrument representation; no financial authority value
selected_transport: external_integration            # resolved: managed_local_agent -> cups spooler (Linux exemplar)
narrowest_valid_transport_justification: >
  CLS-007 has no default transport; GATE-HW-1 resolved transport to managed local agent (UB-U05 USB,
  no ePOS). This PRD realizes it on Linux/CUPS as the reference implementation; Windows/windows_spooler
  is a separate certification PRD.
rejected_mechanisms:
  - mechanism: ePOS-direct (Option B)
    reason: hardware-foreclosed — UB-U05 hosts no ePOS-Print Service
  - mechanism: harden window.print() (Option C)
    reason: rejected by FIB §G / GATE-UX-1 — no device targeting, no trustworthy status, weak duplicate control
  - mechanism: transactional outbox
    reason: no projection/replay consumer; adjacency to loyalty is not dependency
fib_amendment_required: false                       # FIB-H/FIB-S already scope hardware integration
```

## 10. Related Documents

- **ADR-062** (transport/controlled-path standard, D1–D8) — `docs/80-adrs/ADR-062-loyalty-instrument-printing-controlled-path.md`
- **ADR-063** (print-agent deployment standard; enforcement gated to PRD #2) — `docs/80-adrs/ADR-063-loyalty-print-agent-deployment-standard.md`
- **ADR-045** (extends; `window.print()` retained off-surface) — `docs/80-adrs/ADR-045-pilot-reward-instrument-fulfillment.md`
- **Feature Boundary** — `docs/20-architecture/specs/loyalty-printing/FEATURE_BOUNDARY.md`
- **RFC / Design Brief** — `docs/02-design/RFC-POS-LOYALTY-INSTRUMENT-PRINTING.md`
- **SEC Note** — `docs/20-architecture/specs/loyalty-printing/SEC_NOTE.md`
- **Classification standard (ADR-058)** — `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml`
- **SRL** — `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md` *(referenced for the deferral decision only; `srl_required: false` — terms governed by the §7a Terminology / Operator-Copy Gate)*
- **Epson capability reference** — `docs/00-vision/epson/EPSON-EPOS-ESCPOS-CAPABILITY-REFERENCE.md`

---

## Appendix A: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-18 | Feature Pipeline (Phase 5) | Initial draft — Linux exemplar (Gate E1) bounded slice |
