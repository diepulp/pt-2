---
id: SCAFFOLD-POS-LOYALTY-PRINT
title: "Feature Scaffold: POS Loyalty Instrument Printing"
owner: LoyaltyService.InstrumentPrinting
status: Draft
date: 2026-06-18
---

# Feature Scaffold: POS Loyalty Instrument Printing

> Timebox: 30-60 minutes. If it's longer, you're drifting into a design doc.

**Feature name:** POS Loyalty Instrument Printing
**Owner / driver:** LoyaltyService — `InstrumentPrinting` submodule
**Stakeholders (reviewers):** Product / Operations, Security
**Status:** Draft
**Last updated:** 2026-06-18

**Intake authority:** FIB-H-POS-PRINT-001 / FIB-S-POS-PRINT-001 (+ OS-portability addendum & patch)
**Phase 0 boundary:** `docs/20-architecture/specs/loyalty-printing/FEATURE_BOUNDARY.md`

## 1) Intent (what outcome changes?)

- **User story:** As a pit boss / floor supervisor, when I print an issued match play or loyalty instrument, the system sends it to a **specific, configured receipt printer** with a controlled, audited outcome — instead of the generic browser print dialog — so a failed or uncertain print never silently produces a second redeemable copy.
- **Primary actor:** Pit Boss / Floor Supervisor (issuing operator); secondary: Property Administrator (configures the designated printer, runs a non-redeemable test print).
- **Success looks like:** The named **loyalty redemption** issuance surface prints to the designated Epson TM-T88V via a controlled path with **no `window.print()` on that surface**, every attempt writes a durable `print_attempt` record (operator, instrument, printer, result), and known-failure / unknown-result / explicit-reprint are distinguishable on a real device — while the shared browser-print utility continues to serve all other documents unchanged.

## 2) Constraints (hard walls)

- **Coexists, does not remove:** Vector C (ADR-045) renders comp slips + entitlement coupons via the **shared** hidden-iframe `window.print()` utility (`lib/print/`), `FulfillmentPayload` **frozen** at `services/loyalty/dtos.ts:623`. This feature **adds** a controlled POS transport for the loyalty *redemption* instrument surface and **reuses** the existing render payload/layout — it must not fork the instrument contract. The `lib/print/` browser-print utility is **not** deprecated or removed; it remains the general system capability for other documents (shift reports, MTL, future receipts). `window.print()` is superseded **only on the named loyalty redemption surface** (GATE-UX-1) — never system-wide.
- **Domain (FIB invariant):** Printing authors no reward/financial fact. `promo_coupon` stays source-of-truth and read-only; print failure/uncertainty must never mint a redeemable instrument.
- **OS portability (addendum):** One OS-neutral application contract (`LoyaltyInstrumentPrinter`) with normalized result (`requested|submitted|failed|unknown`) and fault vocabulary. All platform/transport code (CUPS, spooler, ePOS, USB) confined to a swappable adapter behind that contract.
- **Security (FIB GATE-SEC-1):** No public printer endpoint, no browser-embedded shared secret, property-scoped target. RLS context via ADR-024 (`operator_id`, `casino_id`).
- **Hardware reality:** Inventoried dev unit is **USB (UB-U05, `04b8:0202`) driven via CUPS raster** — i.e. **no ePOS** on this interface. Browser sandbox cannot reach USB/CUPS/sockets directly without a dialog or a local mediator.

## 3) Non-goals (what we refuse to do in this iteration)

- No generic cross-domain print platform, printer fleet/cloud queue, or multi-vendor abstraction (FIB §G).
- **Does NOT deprecate, remove, or re-route the shared `lib/print/` iframe / `window.print()` utility (ADR-045).** That mechanism stays in the system and remains available for shift reports, MTL, and future documents. The controlled POS path is additive and loyalty-redemption-scoped; the two mechanisms **coexist**.
- No MTL / cage / report printing — `mtl-entry-view-modal.tsx:445` `window.print()` stays untouched this slice.
- No new loyalty instrument types; no change to issuance/redemption authority.
- No automatic retry or `window.print()` fallback that could produce an uncorrelated second copy.
- No second physical-printer adapter (e.g. Linux *production* adapter) unless the FIB is amended.
- No barcode/QR symbology decision here (inherits Vector C GAP-C5 deferral unless layout requires it).

## 4) Inputs / Outputs (thin interface, not design)

- **Inputs:** existing `FulfillmentPayload` (`CompFulfillmentPayload | EntitlementFulfillmentPayload`) for an *already-issued* instrument; designated `printer_target` config for the station; operator/casino RLS context.
- **Outputs:** a physical 80 mm receipt at the configured printer; a durable `print_attempt` audit row; an operator-visible bounded outcome (submitted / failed / unknown) with explicit retry/reprint.
- **Canonical contract(s):** `LoyaltyInstrumentPrinter` (OS-neutral app interface — RFC-owned); `PrintableInstrumentDTO` = the existing frozen `FulfillmentPayload` (intra-LoyaltyService, reused — not net-new).

## 5) Options (forced tradeoffs)

> The headline decision is the **transport mechanism**. ePOS-direct is the portability-ideal but is **hardware-blocked** on the inventoried interface, which collapses the realistic pilot choice toward a local mediator.

### Option A: Managed local print agent (localhost service → OS print system) — *recommended pending GATE-HW-1*

- **Pros:** Works with the USB/CUPS reality today; gives real device status, job idempotency, and a controlled (non-dialog) submission. OS-neutral browser contract; per-OS adapter (Windows spooler / Linux CUPS) stays behind it. Matches FIB `managed_local_print_agent`.
- **Cons / risks:** Introduces a durable local agent + trust boundary + deployment/update ownership → **mandatory ADR** (FIB-S adr_candidate condition). Heaviest install footprint.
- **Cost / complexity:** Med-High. New localhost service + one production adapter + fake adapter for Linux dev contract tests.
- **Security posture impact:** New localhost trust boundary — must prove localhost/LAN auth, no public listener, no secret in browser bundle (GATE-SEC-1).
- **Exit ramp:** App contract is OS-neutral, so the agent can later be replaced by ePOS-direct (if hardware gains ePOS) without touching render payloads or `print_attempt`.

### Option B: Epson ePOS-direct (browser → printer over trusted LAN)

- **Pros:** OS-neutral, driverless, no local agent; cleanest portability story; same path on Linux + Windows.
- **Cons / risks:** **Ineligible on the inventoried unit** — UB-U05 USB exposes no ePOS Print Service. Requires a different interface (UB-E04 / TM-T88V-i) confirmed by GATE-HW-1.
- **Cost / complexity:** Low-Med *if* hardware supports it; otherwise infinite (blocked).
- **Security posture impact:** Network-reachable device on trusted LAN; certificate/host posture to prove.
- **Exit ramp:** Remains the preferred target if/when an ePOS interface is installed; keep the contract ready for it.

### Option C: Harden Vector C `window.print()` in place (status quo+)

- **Pros:** Smallest change; reuses shipped `lib/print/` entirely.
- **Cons / risks:** **Rejected by FIB §G / GATE-UX-1** — still a browser dialog, can't target a specific device, no trustworthy status, weak duplicate/reprint control. Does not satisfy the operator outcome.
- **Cost / complexity:** Low, but does not close the feature.
- **Security posture impact:** Unchanged.
- **Exit ramp:** N/A — this is the thing being retired.

## 6) Decisions (explicit)

> One decision is resolved now; two remain explicitly **conditional** on external gates. The RFC (Phase 2) proceeds with the audit shape fixed and transport/OS framed as conditional. The PRD (Phase 5) stays **blocked until GATE-HW-1**.

```yaml
decisions:
  audit_shape:
    decision: dedicated_print_attempt_table
    model: single_audit_controlled_lifecycle_row_per_attempt   # not append-only, not an event log
    status: resolved
    rationale: >
      Controlled lifecycle state (requested -> submitted/failed/unknown),
      reprint lineage, idempotency keys, fault-state transition, and
      queryability are all ill-served by a promo_coupon.metadata JSONB append.
      One row per attempt: immutable identity/correlation, mutable status/fault.
      promo_coupon stays the unchanged instrument source-of-truth; print_attempt
      records delivery/audit only and claims no physical completion.

  transport:
    status: blocked
    gate: GATE-HW-1
    provisional_direction: managed_local_print_agent
    note: >
      Do not freeze until GATE-HW-1 confirms the production printer interface.
      If production hardware exposes ePOS, direct network printing (Option B)
      remains viable. The OS-neutral LoyaltyInstrumentPrinter contract holds
      either way, so this stays swappable behind the adapter.

  production_adapter_os:
    status: blocked
    gate: DEP-OS-1
    note: >
      Resolve before selecting the single pilot adapter (GATE-PLATFORM-3/4).
      Linux development does not imply Linux production support; the
      application contract remains OS-neutral regardless.
```

- **Decision deadline:** transport + OS cannot finalize before GATE-HW-1 / DEP-OS-1; audit shape is fixed as of this scaffold.

## 7) Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| Vector C / ADR-045 print stack (`lib/print/`, frozen `FulfillmentPayload`) | Required | **Shipped** |
| `promo_coupon` source-of-truth (`20260106235611_loyalty_promo_instruments.sql`) | Required | **Shipped** |
| GATE-HW-1 — production printer interface/firmware inventory | Required (blocks transport) | **Missing** |
| DEP-OS-1 — confirmed pilot production workstation OS | Required (blocks adapter) | **Pending** |
| Approved 80 mm layout + validation identifier/symbology | Required (blocks PRD) | **Pending** (FIB DEP-3) |
| New ADR — local-agent trust boundary / deployment standard | Required *if Option A* | **Not started** |

## 8) Risks / Open questions

| Risk / Question | Impact | Mitigation / Learning Plan |
|-----------------|--------|---------------------------|
| Production unit interface differs from dev USB unit | High | GATE-HW-1 must inventory the *deployed* printer before transport lock-in |
| Addendum assumes Windows, but only Linux/CUPS adapter is proven | High | Resolve DEP-OS-1 early; the working CUPS rig may be dev-only or the actual pilot host |
| Local agent install/update ownership on floor hardware | Med | Scope to one production adapter; fake adapter covers Linux dev; ADR governs deployment |
| CUPS "completed" ≠ physical paper/cut success | Med | Map spooler-accepted → `submitted`, never `completed`; only claim what the transport observes |
| Reprint vs duplicate redeemable copy | High | `print_attempt` idempotency + explicit reprint intent; never silent auto-retry (FIB GATE-DUP-1) |

## 9) Definition of Done (thin)

- [ ] Transport + audit-shape + OS decisions recorded in ADR(s) (Phase 4)
- [ ] OS-neutral `LoyaltyInstrumentPrinter` contract + normalized result/fault vocabulary agreed (RFC)
- [ ] Acceptance criteria mapped to FIB gates (GATE-HW-1/2, GATE-DUP-1, GATE-UX-1, GATE-PLATFORM-1..4)
- [ ] Implementation plan delegated (PRD → build), gated on GATE-HW-1

## Links

- Feature Boundary: `docs/20-architecture/specs/loyalty-printing/FEATURE_BOUNDARY.md`
- Intake: `docs/00-vision/epson/FIB-H-…`, `FIB-S-…`, `FIB-ADDENDUM-…`, `FIB-S-…-PATCH-001.json`
- Hardware ref: `docs/00-vision/epson/EPSON-TM-T88V-PRINTER-SETUP.md`
- Prior art: Vector C — `docs/01-scaffolds/SCAFFOLD-VECTOR-C-INSTRUMENT-FULFILLMENT.md`, ADR-045, `lib/print/`
- Design Brief/RFC: TBD (Phase 2)
- ADR(s): TBD (Phase 4 — likely amends/extends ADR-045)
- PRD: TBD (Phase 5 — blocked until GATE-HW-1)
