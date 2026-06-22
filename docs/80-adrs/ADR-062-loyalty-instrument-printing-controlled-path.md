---
id: ADR-062
title: Loyalty Instrument Printing — Controlled Print Path Standard
status: Accepted (Frozen — transport resolved post-inventory)
date: 2026-06-18
amended: 2026-06-18
deciders: [agent, product-owner]
affects: [LoyaltyService]
extends: ADR-045
classification: [CLS-007 external_integration, CLS-003 authoring]
references:
  - docs/20-architecture/specs/loyalty-printing/FEATURE_BOUNDARY.md
  - docs/02-design/RFC-POS-LOYALTY-INSTRUMENT-PRINTING.md
  - docs/20-architecture/specs/loyalty-printing/SEC_NOTE.md
  - docs/80-adrs/ADR-045-pilot-reward-instrument-fulfillment.md
  - docs/80-adrs/ADR-063-loyalty-print-agent-deployment-standard.md
  - docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml
  - docs/00-vision/epson/EPSON-EPOS-ESCPOS-CAPABILITY-REFERENCE.md
  - docs/00-vision/epson/FIB-H-POS-LOYALTY-INSTRUMENT-PRINTING-001.md
  - docs/00-vision/epson/FIB-ADDENDUM-POS-PRINT-OS-PORTABILITY-001.md
---

# ADR-062: Loyalty Instrument Printing — Controlled Print Path Standard

> **Decision-only document (Phase 4 freeze).** Schema, RLS SQL, route handlers, templates,
> and test files are implementation details extracted by build-pipeline at EXEC/PRD time —
> they are deliberately absent here. This ADR **extends ADR-045** and supersedes it **only on
> the named loyalty redemption surface**; ADR-045's `lib/print/` `window.print()` utility
> remains in force for all other documents.

## Status note

Seven core decisions (D1–D7) are **Accepted (Frozen)**; the 2026-06-18 amendment adds **D8**
(two-phase platform sequencing + `WINDOWS_CERTIFICATION_REQUIRED` gate). The two previously
Deferred-Blocked decisions (transport mechanism, production adapter OS) are now **Resolved**
following GATE-HW-1 / DEP-OS-1 hardware inventory — see **Amendment (2026-06-18, post-inventory)**
below. The companion deployment-standard ADR is authored as **ADR-063** (deployment / trust
boundary only — it does **not** reopen transport selection) and is **gated to the Windows phase**
(D8 Phase 2), not the Linux exemplar.

## Amendment (2026-06-18, post-inventory) — GATE-HW-1 / DEP-OS-1 resolved

Hardware inventory of the USB-attached unit returned: plain **TM-T88V** on a **UB-U05 USB**
interface (`lsusb` 04b8:0202 "Interface Card UB-U05"; CUPS URI `usb://EPSON/TM-T88V?serial=…`).
UB-U05 **hosts no ePOS-Print Service**, so ePOS-direct (Option B) is hardware-foreclosed
independent of firmware. Production host OS confirmed as **Windows** (Linux remains dev-only).

**These are recorded resolved facts, not new decisions** — they collapse the deferral the original
freeze deliberately held open:

- **T-1 Transport → Option A (managed local agent).** Pattern: `managed local agent → OS print
  spooler → printer`. Option B foreclosed (no ePOS interface); Option C already rejected (FIB §G).
- **T-2 Platforms → two-platform sequencing (exemplar vs production).** Linux/CUPS is the
  **exemplar / reference implementation** that proves the architecture (business logic, contract,
  audit, workflow, idempotency); **Windows/`windows_spooler` is the production certification
  target**. These are *not the same role*: Linux proves *the feature is correct*; Windows proves
  *production is certified*. (Corrects the original "Linux/CUPS — dev only / might be production"
  framing: Linux was never a production target, and is now elevated above "mere dev" to the
  reference implementation.)
- **Observability → `submitted`-only.** One-way OS-spooler submission; **device faults out of
  scope** for the pilot (`failure_domain = device` stays null on both adapters). No bidirectional
  ESC/POS channel. The four-state result vocabulary (D3) is unaffected.
- **T-3 Deployment-standard ADR → ADR-063**, but **gated to the Windows phase** (see D8): it is
  *not blocking* the Linux exemplar (no production install) and *mandatory* for Windows production.

Decision matrix (frozen):

```yaml
transport:        managed_local_agent -> os_print_spooler -> printer
observability:    submitted_only
device_faults:    out_of_scope
exemplar_platform:    { os: linux,   adapter: cups }            # reference implementation — proves architecture
production_platform:  { os: windows, adapter: windows_spooler } # certification target — proves production
platform_certification: required_before_rollout                 # WINDOWS_CERTIFICATION_REQUIRED (D8)
```

### D8: Two-phase platform sequencing + WINDOWS_CERTIFICATION_REQUIRED gate (frozen)
Delivery proceeds in platform-separated phases so feature bugs and platform/driver/permission bugs
never tangle:

- **Phase 1 — Linux exemplar (reference implementation).** Proves `ReceiptDocument` generation,
  localhost-agent request handling, `print_attempt` audit, idempotency, operator workflow, spooler
  submission, and the four-state result — on `cups`. **Exit = Gate E1:** GATE-PLATFORM-1
  (contract OS-neutrality — *no CUPS-specific types/semantics above the adapter boundary*),
  GATE-PLATFORM-2 (fake + cups adapters pass one contract suite), GATE-HW-2 (real-device exemplar
  on the Linux rig), GATE-DOM-1, GATE-DUP-1, GATE-UX-1, GATE-SEC-1 (minimal). Success = **the
  architecture is correct**, *not* "Windows is certified."
- **Phase 2 — Windows certification (production).** Proves the `windows_spooler` adapter satisfies
  the *same* contract, Epson driver behavior, install/update procedures, localhost trust boundary,
  and **byte-identical audit contract**. **Exit = Gate E2 / `WINDOWS_CERTIFICATION_REQUIRED`:**
  GATE-PLATFORM-3 (Windows real-device cert), GATE-PLATFORM-4 (no cross-platform overbuild),
  DEP-OS-3, and full **ADR-063** enforcement. Explicit exit criteria: windows_agent_exists ·
  windows_spooler_adapter_exists · real_printer_test_passes · audit_contract_identical ·
  localhost_security_review_complete.

**Anti-drift rule (frozen):** Linux MUST NOT become a permanent production assumption. Rollout to
production is **blocked** until `WINDOWS_CERTIFICATION_REQUIRED` (Gate E2) passes. "We'll port it
later" is not an accepted production posture — the gate is the forcing function.

## Context

The named loyalty *redemption* issuance surface prints redeemable instruments via the browser
print dialog (ADR-045 D1: hidden-iframe `window.print()`). For a redeemable instrument that path
cannot target a specific device, cannot report trustworthy device status, and cannot distinguish a
failed print from a duplicate issuance — a missed print delays service, an uncontrolled retry can
mint a second physical copy. ADR-045's own "Negative" consequences flagged this gap (GAP-C0:
coupon print history and comp-slip print logging lack a defined persistence path).

This ADR records the durable decisions that close that gap with a controlled print path, an
audit-controlled `print_attempt` record, and an OS-neutral printer contract — while keeping
the domain invariant that printing authors no reward or financial fact.

Per the Feature Classification & Transport Selection Standard (ADR-058), this feature is
**CLS-007 External Integration** (hardware integration) with secondary **CLS-003 Authoring**
(`print_attempt`). CLS-007 has no default transport by design, which is why the transport
decision is gated, not pre-committed (see Deferred-Blocked below).

## Decision

### D1: Ownership — `LoyaltyService.InstrumentPrinting` submodule (not a standalone service)
Printing is a delivery/audit concern over `promo_coupon`, which already lives in LoyaltyService.
A new **`InstrumentPrinting` submodule** owns the print-attempt audit, the OS-neutral application
contract, and its transport adapter. It authors **no** reward/financial fact. `promo_coupon` /
`promo_program` are **read-only** to the submodule. A standalone `InstrumentPrintService` is
**deferred** until printing is shared across a second domain (promotion trigger recorded in the
Feature Boundary). No new SRM service row, no service-admission ADR now.

### D2: Audit shape — one audit-controlled `print_attempt` lifecycle row per attempt
A **dedicated `print_attempt` relation**, written as a **single audit-controlled lifecycle row per
attempt** — **not** append-only, **not** an event log, **not** a `promo_coupon.metadata` JSONB
append. Identity and correlation fields are **immutable** once written; only `result_status` and the
canonical `failure` record (`{failure_domain, failure_code}`, nullable — see D7) transition under
controlled writes. A first-class relation is required because controlled lifecycle state, reprint
lineage, idempotency, failure-state transition, and querying are all needed. This closes ADR-045
GAP-C0 (redemption-instrument print history) **on the named loyalty redemption surface**. Whether
comp-slip print logging is also served depends on whether comp-slip issuance flows through this exact
surface and path — not claimed here unless confirmed in the PRD. (Field list is implementation detail.)

**Legal lifecycle transition (frozen — closed state machine):** `requested` transitions **exactly
once** to one of the terminal outcomes `submitted | failed | unknown`. `submitted`, `failed`, and
`unknown` are **terminal** and **do not transition in place** — a terminal row is never reopened or
reclassified. Any subsequent observation (retry, reprint, reconciliation) creates a **new**
`print_attempt` lifecycle instance that shares instrument identity and carries distinct attempt
lineage; it never mutates a prior terminal row. (Aligns with the immutable-event posture used
elsewhere in the system.)

### D3: OS-neutral contract + one production adapter per deployment + four-state result vocabulary
One application contract — `LoyaltyInstrumentPrinter { getStatus, print, testPrint }` — behind which
sits **one production transport adapter active per deployment** (selected at **deployment time**
post-GATE-HW-1; **not runtime hot-swappable** and **not** an adapter framework), plus **one
deterministic test adapter** that Linux dev / CI run against the same contract suite.

**Result vocabulary is fixed at four states: `requested | submitted | failed | unknown`.**
`submitted` means *the transport accepted the job* — **no claim of physical completion**. There is
**no** `acknowledged`/`printed`/`completed` state in the pilot contract, regardless of what a given
transport could observe; any spooler/device "completed" signal **maps to `submitted`**. A normalized
`PrinterFault` set carries device-fault fidelity where the transport can observe it; richer transport
observability improves *fault fidelity only*, never the success state.

**Invariant (carried from FIB-S):** a print failure or uncertain result MUST NOT create, mutate,
authorize, redeem, or financially reclassify a loyalty instrument. The only writes are to
`print_attempt`.

### D4: Coexistence — supersede `window.print()` only on the named surface
ADR-045's `lib/print/` `window.print()` utility is **retained** for non-loyalty documents (shift
reports, MTL, future receipts). It is superseded **only on the named loyalty redemption surface**
(GATE-UX-1) — never system-wide. Rollback **disables controlled printing on that surface**; a
browser-print fallback on that surface is **never automatic** — it requires an explicit operational
decision (preserves duplicate-safety).

### D5: `printer_target` — configuration-only for the pilot
The designated printer is **configuration-only** (no table) for the single fixed pilot printer.
Promote to a property/station-scoped table **only** on runtime reassignment, multiple stations, or
audit-relevant target identity. The device address/transport params are **never** exposed to the
browser; the audit row references an opaque target identifier only. That identifier is a **stable
configuration key** recorded on **every** `print_attempt` and is **immutable across ordinary
configuration edits** (display name, address, logo, transport params) — it changes only when the
target identity itself is intentionally re-provisioned. This guarantees every historical attempt
resolves to a well-defined target for audit, even without a `printer_target` table.

### D6: Receipt templating — bounded supporting concern inside the feature
The frozen `FulfillmentPayload` is the content source of truth; a **versioned template builder**
produces a transport-neutral canonical **`ReceiptDocument`**; a transport-specific **renderer**
produces the production payload (ePOS / ESC-POS / fake); the **adapter** sends payload → device.
**HTML/iframe is demoted to preview-only** on this surface — never the production payload.
Provenance recorded on `print_attempt`: `template_id`, immutable `template_version`, and
`receipt_document_hash` — a digest of the **canonical serialized `ReceiptDocument`**, *not* the
transport-rendered payload. Template versions are immutable after release (`vN+1`, never mutate
`vN`); stored as version-controlled code, not DB-authored. **No** generic/runtime/admin-authored
template engine. Templating is **not** split into a separate feature until cross-domain printing or
runtime-authored templates arise.

### D7 (reconciliation): canonical failure vocabulary — render/validation vs device domains
The receipt-templating guide §12 listed `result_status` as `submitted|acknowledged|failed|unknown`
and faults `invalid_document`/`unsupported_operation`. **This ADR supersedes that wording:** the
result vocabulary is the four states of D3 (no `acknowledged`).

Failures persist through a **single canonical `failure` record** on `print_attempt` — a
**discriminated `{failure_domain, failure_code}`** (nullable; populated only when `result_status`
is `failed` or `unknown`). This gives both failure kinds one defined persistence path and resolves
the D2/D7 gap (there is exactly one mutable failure field, discriminated by domain):

- **`failure_domain = device`** → `failure_code` ∈ the normalized **`PrinterFault`** set
  (`paper_out | cover_open | offline | driver_error`). Observable only on a bidirectional transport;
  null under the one-way CUPS raster path.
- **`failure_domain = render_validation`** → `failure_code` ∈ `{ invalid_document,
  unsupported_operation }` — a malformed or untemplatable `ReceiptDocument` caught **before/at
  render**, never sent to the device. **Categorically distinct** from a device fault.

Both domains resolve `result_status` to `failed`. The `render_validation` codes **do not** join the
device `PrinterFault` set — they are a separate domain under the one canonical `failure` field.
(Exact column naming is implementation detail; the discriminated two-domain model is what is frozen.)

## Formerly Deferred-Blocked decisions — now Resolved (post-inventory 2026-06-18)

| # | Decision | Gate | Resolution |
|---|----------|------|------------|
| T-1 | **Transport mechanism** — managed local agent (A) vs ePOS-direct (B); harden-in-place (C) rejected | **GATE-HW-1** ✅ | **Option A (managed local agent → OS spooler → printer).** B foreclosed: installed UB-U05 USB hosts no ePOS service. |
| T-2 | **Platform roles** — Windows vs Linux/CUPS | **DEP-OS-1** ✅ | **Two-platform sequencing (D8):** Linux/CUPS = **exemplar / reference implementation**; Windows/`windows_spooler` = **production certification target**. |
| T-3 | **Deployment-standard ADR** (localhost-agent trust boundary, install/update ownership) | mandatory now that T-1 = Option A | **Authored as ADR-063** — deployment/trust boundary only; does not reopen transport. **Gated to the Windows phase (D8 Phase 2)**; not blocking the Linux exemplar. |

The deferral the original freeze held open is now closed by recorded inventory facts (see Amendment
above). The OS-neutral contract (D3) and OS/transport-neutral `ReceiptDocument` (D6) made the
deferral safe and made the Windows-adapter selection a drop-in: only the adapter realization
changed; the contract, audit, `ReceiptDocument`, and four-state result are untouched.

## Consequences

**Positive**
- Closes ADR-045 GAP-C0 with a principled first-class audit relation.
- Redeemable-instrument duplicate-safety: explicit retry/reprint, no silent auto-retry, no automatic browser fallback.
- Transport/OS portability isolated behind one contract; hardware uncertainty does not block the design.
- Truthful status: the system never claims more than the transport observed.

**Negative / accepted**
- Transport A introduces a Windows localhost print-agent trust boundary + install/update ownership, governed by **ADR-063**.
- Device-fault fidelity is **out of scope** for the pilot: the one-way OS-spooler path (CUPS dev / Windows-spooler prod) leaves `failure_domain = device` null. Adopting a bidirectional ESC/POS channel later would populate it — a future expansion, not pilot scope.
- Production certification must run on the **actual Windows host** (GATE-PLATFORM-3 / DEP-OS-3); Linux/CUPS dev success does not certify production.

## Downstream obligations

- **Terminology governance (amended 2026-06-18 — supersedes the prior SRL-admission obligation):**
  the print-lifecycle terms (`requested | submitted | failed | unknown`, `retry`, `reprint`) are
  **local integration-contract vocabulary, not ambiguous cross-domain business semantics**, so **SRL
  admission is NOT required** (`srl_required: false`). They are governed by a **local Terminology /
  Operator-Copy Gate** defined per consuming PRD (e.g. PRD-092 §7a): local glossary + operator-copy
  review + the `submitted ≠ printed` invariant. **`PrinterFault` / device-fault vocabulary** and
  **`ReceiptDocument`** are **not SRL-admitted**; `PrinterFault` MUST NOT appear in DTOs, UI labels, or
  persisted schema until device-fault observability is in scope (post-exemplar). Either term graduates
  to SRL only if it later proves to carry ambiguous cross-domain semantics — not by default.
- **PRD (Phase 5):** must carry the mandatory Feature Classification & Transport Selection section
  (ADR-058 `required_sections.prd`). GATE-HW-1 is now cleared, so the PRD declares a **concrete**
  transport (`selected_transport: external_integration_tbd` → resolved to managed-local-agent /
  windows_spooler); it references ADR-062 + ADR-063. Remaining PRD-entry deps are content-only (below).
- **PRD-entry dependencies (not architectural):** approved 80 mm layout/legal text/expiry/validation
  identifier (FIB DEP-3) and barcode/QR symbology (Vector C GAP-C5) — resolve before PRD approval.
