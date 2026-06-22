# Feature Boundary: POS Loyalty Instrument Printing

> **Ownership Sentence:** This feature belongs to **LoyaltyService**, in a new **`InstrumentPrinting`** submodule (physical-output integration), and may only write **`print_attempt`** (a single audit-controlled lifecycle row per attempt — delivery/audit state) — and reference **`printer_target`** (printer configuration; configuration-only for the pilot). It authors **no** reward or financial fact. The instrument source-of-truth, `promo_coupon`, is **read-only** to this submodule and is exposed for rendering via LoyaltyService's internal **`PrintableInstrumentDTO`** projection.

**Feature ID:** loyalty-printing
**Intake authority:** FIB-H-POS-PRINT-001 / FIB-S-POS-PRINT-001 (+ OS-portability addendum & patch, 2026-06-18)
**SRM version at Phase 0:** 4.27.0
**Status:** Phase 0 — `srm-ownership` gate **PASSED** (decision below)

---

## Phase 0 Decision (ratified)

```yaml
owner: LoyaltyService.InstrumentPrinting   # submodule, not a standalone service
print_attempt: owned
promo_coupon: read_only
reward_fact_authoring: forbidden
standalone_service: deferred                # promote only when printing is shared across multiple domains
```

---

## Feature Classification (ADR-058 / Feature Classification & Transport Selection Standard)

> Recorded per `RULE-7.1` (no transport before classification) and admission checks `ADM-1..10`.
> Governing authority: `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml` (v1.1.0), adopted by ADR-058.

```yaml
primary_classification: external_integration        # CLS-007 — "hardware integration beyond existing table-context APIs"
secondary_classifications:
  - authoring                                        # CLS-003 — writes print_attempt (delivery/audit fact)
authors_domain_fact: true                            # print_attempt lifecycle row
emits_projection_input: false                        # print-health dashboards deferred (FIB §J); no proven async consumer — adjacency ≠ dependency
requires_transactional_outbox: false                 # no outbox; finance_outbox MUST NOT carry print events (CLS-007 forbidden)
consumes_outbox_events: false
renders_derived_value_surface: false                 # renders an existing instrument representation; authors no financial authority value
selected_transport: external_integration_tbd         # CLS-007 default_transport = null → explicit architecture review (BLOCKED @GATE-HW-1)
narrowest_valid_transport_justification: >
  CLS-007 has no default transport by design; the production transport (managed local agent vs ePOS-direct)
  is gated on GATE-HW-1 (production printer interface) and DEP-OS-1 (production OS). Selection is deferred to
  Phase 4 ADR conditional freeze, not pre-committed here.
fib_amendment_required: false                        # FIB-H/FIB-S already scope hardware integration; no new scope-expansion trigger
```

**CLS-007 required-properties conformance:** separate FIB ✅ · ADR-on-delivery/security ✅ (Phase 4) · explicit failure model ✅ (four-state result + `PrinterFault`) · explicit data-ownership model ✅ (this doc) · explicit casino scoping ✅ (SEC Note / RLS) · explicit retention & observability posture ✅ (`print_attempt` audit + deferred dashboards). **Forbidden-use check:** `finance_outbox` is not used as a print/event transport ✅.

---

## Bounded Context

- **Owner service:**
  - **LoyaltyService** — existing Reward context (SRM §LoyaltyService). Gains an **`InstrumentPrinting`** submodule responsible for physical-output integration: the print-attempt audit, the OS-neutral application print contract (`LoyaltyInstrumentPrinter`), and its transport adapter. The submodule authors no reward/financial fact.

- **Writes (LoyaltyService, via InstrumentPrinting submodule):**
  - `print_attempt` — **dedicated table, resolved Phase 1.** A **single audit-controlled lifecycle row per attempt** (not append-only, not an event log): immutable identity/correlation (`print_attempt_id`, `instrument_id` → `promo_coupon`, `casino_id`, `operator_id`, `printer_target_id`, `station_id`, `requested_at`, `template_id`, `template_version`, `receipt_document_hash`) with a controlled `result_status` (`requested | submitted | failed | unknown`) / `fault` (normalized `PrinterFault`) transition. Chosen over a `promo_coupon.metadata` JSONB append because controlled lifecycle state, reprint lineage, idempotency, fault-state transition, and querying require a first-class relation.
  - `printer_target` — **configuration-only for the pilot (resolved Phase 2, RFC §4.1)**; promote to a table only on runtime reassignment / multiple stations / audit-relevant target identity.

- **Owns (code, not DB) — templating (bounded supporting concern, RFC §4.6):** versioned receipt template builders + the canonical `ReceiptDocument` model + transport renderers (ePOS / ESC-POS / fake / HTML-preview), under `services/loyalty/printing/`. Consumes the frozen `FulfillmentPayload` as source input; HTML/iframe is preview-only on this surface. No generic/runtime template engine. Not split into a separate feature until cross-domain printing or runtime-authored templates arise.

- **Reads (read-only):**
  - `promo_coupon`, `promo_program` — the instrument source-of-truth, owned by LoyaltyService. The submodule renders a representation only; it never writes these.

- **Contracts:**
  - `PrintableInstrumentDTO` *(internal LoyaltyService projection, read-only)* — instrument identity, patron-facing terms, validation symbology/identifier, and value presentation needed to render the 80 mm layout. Because printing now lives inside LoyaltyService, this is an **intra-context** projection, **not** a cross-context published DTO.
  - Auth/identity context (`operator_id`, `casino_id`) via the standard authoritative RLS context (ADR-024) — not a new contract.

---

## Critical Invariant (carried from FIB-S)

> A print failure or uncertain result **must not** create, mutate, authorize, redeem, or financially reclassify a loyalty instrument. `InstrumentPrintService` writes only `print_attempt`; the instrument source-of-truth remains `promo_coupon` in LoyaltyService.

---

## Why a submodule of LoyaltyService (not a standalone service)

- `promo_coupon` is the instrument source-of-truth and already lives in LoyaltyService; printing is a delivery/audit concern over that same instrument, so co-locating avoids a cross-context hop for the common case.
- `print_attempt` records **delivery/audit state only** — printing authors no reward or financial fact, so the submodule cannot threaten "Loyalty is the sole source of truth for rewards" as long as the read-only / no-authoring invariant holds.
- A standalone `InstrumentPrintService` is **premature** until printing is shared across multiple domains. Encapsulating it as a submodule keeps the option open without paying the cost of a new bounded context now (no new SRM service row, no service-admission ADR).
- The OS-portability transport-adapter boundary (CUPS / ePOS / local agent) is satisfied **inside** the submodule — the adapter stays behind the `LoyaltyInstrumentPrinter` contract and does not leak into reward authoring code.

**Promotion trigger (deferred standalone service):** extract `InstrumentPrinting` into its own context when any of: printing serves a second domain (e.g. MTL receipts), a generic cross-domain print contract is needed, or the transport/admin surface grows beyond the single-printer pilot. Until then it remains `LoyaltyService.InstrumentPrinting`.

---

## Carried-forward risks (not Phase 0 blockers; resolve in RFC/SEC)

- **DEP-OS-1 / hardware:** `EPSON-TM-T88V-PRINTER-SETUP.md` shows the dev unit is **USB (UB-U05, `04b8:0202`)** via CUPS — i.e. **not** ePOS-capable, pointing transport toward the local-agent/OS-driver path. Production OS (Windows vs Linux) is **unconfirmed**; a working *Linux* CUPS adapter already exists, in tension with the addendum's "Windows-likely / Linux-dev-only" assumption. GATE-HW-1 must inventory the production unit before transport selection.
- Admitting a new bounded context to the SRM is an **ADR-worthy** decision (Phase 4) and an SRM change-log entry.

---

## Validation Checklist (srm-ownership gate)

- [x] Ownership sentence is clear and specific
- [x] All tables written are listed (`print_attempt`; `printer_target` flagged for RFC confirmation)
- [x] Cross-context contracts identified (`PrintableInstrumentDTO`)
- [x] Owner service has explicit responsibility (physical-output integration; authors no reward fact)
