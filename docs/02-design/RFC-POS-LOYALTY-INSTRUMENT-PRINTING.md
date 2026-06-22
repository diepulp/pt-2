---
id: RFC-POS-LOYALTY-PRINT
title: "Design Brief: POS Loyalty Instrument Printing"
owner: LoyaltyService.InstrumentPrinting
status: Draft
date: 2026-06-18
affects: [LoyaltyService]
---

# Design Brief / RFC: POS Loyalty Instrument Printing

> Funnel: context → scope → overview → details → cross-cutting → alternatives → decisions.
> Design-time only. Proposes direction + alternatives; freezes nothing that is gated on hardware.

## 1) Context

**Problem.** The named loyalty *redemption* issuance surface prints match plays / approved instruments via the browser print dialog (`window.print()` through a hidden iframe, shipped as Vector C / ADR-045). That path cannot target a specific device, cannot report trustworthy device status, and cannot cleanly distinguish a failed print from a duplicate issuance. For a redeemable instrument this is unsafe: a missed print delays service, an uncontrolled retry can mint a second physical copy.

**Forces / constraints.**
- **Domain invariant (FIB-S):** printing authors no reward/financial fact. `promo_coupon` stays the untouched source-of-truth; a print failure/uncertainty must never create/mutate/redeem an instrument.
- **OS portability (FIB addendum):** one OS-neutral application contract; all platform/transport code behind a swappable adapter; one production adapter certified for the pilot; Linux dev via a deterministic fake.
- **Hardware reality (GATE-HW-1, still open):** the inventoried dev unit is a TM-T88V (M244A) on **UB-U05 USB**, driven by a one-way CUPS raster queue — **no ePOS-Print Service** on that interface.
- **Truthful status (FIB §I):** only persist the outcome strength the transport can actually observe.

**Prior art / existing patterns.**
- **Vector C / ADR-045** — hidden-iframe `window.print()` for comp slips + entitlement coupons; `FulfillmentPayload` **frozen** at `services/loyalty/dtos.ts:623`; render code in `lib/print/`. ADR-045's own "Negative" consequences flag the gap this RFC closes: *coupon print history (GAP-C0) and comp-slip print logging lack a defined persistence path.*
- **EmailService precedent** (SRM ⁸) — external/physical delivery as an append-only attempt log, not folded into the content's domain. Here we keep it *inside* LoyaltyService as a submodule (Phase 0 decision) since `promo_coupon` already lives there.
- **Native Epson capability reference** — `docs/00-vision/epson/EPSON-EPOS-ESCPOS-CAPABILITY-REFERENCE.md` (transport viability + ASB→fault mapping + per-transport truthful-status ceiling + `ReceiptDocument`→renderer validation).
- **Receipt templating guide** — `docs/00-vision/epson/POS-LOYALTY-INSTRUMENT-RECEIPT-TEMPLATING-GUIDE.md` (canonical `ReceiptDocument` model, renderer/adapter split, versioning, TEMPLATE-1..8 gates). Folded as a bounded supporting concern (§4.6); detailed impl deferred to PRD/EXEC.

## 2) Scope & Goals

**In scope**
- A controlled print path for the loyalty **redemption** instrument surface that targets a configured printer, writes a durable `print_attempt` audit, and surfaces a bounded outcome with explicit retry/reprint.
- An OS-neutral `LoyaltyInstrumentPrinter` application contract + one swappable transport adapter + a deterministic fake adapter for Linux dev.
- A `print_attempt` relation (audit/correlation) and a `printer_target` configuration concept.
- **Receipt templating as a bounded supporting concern** (§4.6): a canonical *versioned* receipt-document layer sitting between the frozen `FulfillmentPayload` and the printer adapter. The minimal templating *contract* is established here; detailed template implementation is deferred to PRD/EXEC (companion: receipt-templating guide).

**Out of scope**
- The shared `lib/print/` `window.print()` utility is **retained** for other documents (shift reports, MTL, future receipts). `window.print()` is superseded **only on the named loyalty redemption surface** (GATE-UX-1), never system-wide. (Per owner direction — coexistence, not replacement.)
- No generic cross-domain print platform, fleet/cloud queue, multi-vendor abstraction, second physical adapter, or unattended/batch printing (FIB §G, ADR-045 D5/D6).
- **No generic document-layout/template engine, WYSIWYG or runtime/admin-authored templates, arbitrary HTML/ESC-POS authoring, or cross-domain document infrastructure** (templating guide §15). Templates are application-owned, version-controlled code for this pilot.
- No change to instrument eligibility/value/redemption authority; no new instrument types.

**Success criteria (measurable)**
- Named surface performs **0** `window.print()` calls; 100% of its prints route through the controlled path.
- Every print/reprint writes exactly one `print_attempt` row with full correlation; reprints share instrument identity and carry distinct attempt lineage.
- On a real device: first-print, paper-out, cover-open (where observable), offline, failed, and deliberate reprint are each distinguishable (FIB GATE-HW-2 / GATE-PLATFORM-3).
- No print outcome ever creates/mutates a `promo_coupon` row (invariant test).

## 3) Proposed Direction (overview)

Introduce a **`LoyaltyService.InstrumentPrinting` submodule** exposing one OS-neutral contract — `LoyaltyInstrumentPrinter { getStatus, print, testPrint }` — returning the **four-state** normalized result vocabulary (`requested | submitted | failed | unknown`) and normalized `PrinterFault` set. The contract makes **no claim of physical completion**: `submitted` means the transport accepted the job, nothing stronger — there is no `acknowledged`/`printed` state in the pilot contract regardless of what a given transport could observe. Behind that contract sits **exactly one swappable transport adapter**, selected after GATE-HW-1, plus a **deterministic fake adapter** that Linux dev and CI run against the same contract suite. Each call writes and then transitions a **single audit-controlled `print_attempt` lifecycle row** (the principled replacement for ADR-045's deferred JSONB print-history idea). The instrument render payload is the **existing frozen `FulfillmentPayload`** (reused, not forked); only the *transport* changes for this surface. The shared `lib/print/` browser-print utility is untouched and continues serving other documents.

Between the frozen `FulfillmentPayload` and the adapter sits a **bounded templating layer**: a versioned template builder produces a transport-neutral canonical `ReceiptDocument`, which a transport-specific **renderer** turns into the production payload (ePOS commands / ESC/POS bytes / fake snapshot). HTML/iframe is demoted to a **preview-only** renderer — never the production payload on this surface.

```text
FulfillmentPayload (frozen, source of truth for content)
   └─► versioned template builder ─► ReceiptDocument (OS/transport-neutral, canonical print intent)
          ├─ HtmlPreviewRenderer  ─► iframe preview (approximate, non-canonical)
          ├─ FakeRenderer         ─► deterministic snapshot (Linux dev / CI)
          └─ {ePOS | ESC/POS} renderer ─► production payload ─► transport adapter ─► TM-T88V
```

The transport mechanism and the production adapter OS are **explicitly deferred** behind GATE-HW-1 and DEP-OS-1; the OS-neutral contract — and the OS/transport-neutral `ReceiptDocument` — make that deferral safe (renderer + adapter are swappable without touching the contract, the audit, the template, or the canonical document).

## 4) Detailed Design

### 4.1 Data model changes (design intent — no SQL here)

- **`print_attempt`** (new; owned by LoyaltyService via InstrumentPrinting). **One audit-controlled lifecycle row per attempt** — *not* append-only and *not* an event log. Identity and correlation fields are immutable once written; only `result_status` and `fault` transition (e.g. `requested` → `submitted`/`failed`/`unknown`) under controlled writes. Fields per FIB-S `print_attempt_contract`: `print_attempt_id` (PK, immutable), `instrument_id` (→ `promo_coupon`, immutable), `casino_id`, `operator_id`, `printer_target_id`, `station_id` (nullable), `requested_at` (immutable), `result_status` (`requested|submitted|failed|unknown`), `fault` (normalized `PrinterFault`, nullable). **Template/payload provenance (templating guide §5):** `template_id` and immutable `template_version`, plus a `receipt_document_hash` — a digest of the **canonical serialized `ReceiptDocument`**, *not* the transport-rendered payload (which legitimately varies by renderer/adapter). Hashing the canonical document gives a transport-independent, reproducible record of exactly what was requested for any prior print or reprint. Reprint lineage (e.g. `reprint_of` / explicit reprint intent) and an idempotency key satisfy GATE-DUP-1 (repeated delivery of one attempt must not silently emit a second copy).
- **`promo_coupon`** — unchanged. Read-only to this submodule. (Closes ADR-045 GAP-C0 *without* a `promo_coupon.metadata` JSONB append: a first-class relation is required for controlled lifecycle state, reprint lineage, idempotency, fault-state transition, and querying — none of which a JSONB blob serves well.)
- **`printer_target`** — designated printer config (target identity + transport params). **Resolved (this RFC):** **configuration-only** for the single fixed pilot printer (no table). Promote to a property/station-scoped table **only** if runtime reassignment, multiple stations, or audit-relevant target identity becomes required.

### 4.2 Service layer

- New submodule under `services/loyalty/` (e.g. `services/loyalty/printing/`) — functional factory, explicit interface, no new bounded context.
- Defines `LoyaltyInstrumentPrinter` (contract), `print_attempt` DTOs/mappers/keys/schemas (Pattern-compliant), the normalized result/fault types, and adapter registration.
- Authors **no** reward/financial fact. The only writes are to `print_attempt` (and `printer_target` if a table).

### 4.3 API surface

- A controlled print action for the named surface (route handler or server action, RFC-light): validate target + payload availability → write `print_attempt(requested)` → invoke adapter → update terminal `result_status`/`fault`. Fails closed before any success claim (FIB feature loop step 3).
- A non-redeemable **test print** path (admin) that exercises the adapter without an instrument (feature loop step 8).
- No public printer endpoint; no device address exposed to the browser (GATE-SEC-1).

### 4.4 UI/UX flow

- Reuse the existing issuance surface + render payload. Replace the surface's `window.print()` invocation with the controlled action; show bounded outcome (submitted / failed / unknown) and an **explicit** retry/reprint affordance — never silent auto-retry (FIB GATE-DUP-1; ADR-045 D1A manual-first posture preserved).
- Operator-visible distinction between first-print, retry-after-known-failure, and reprint-after-uncertain/confirmed (FIB open question #4) is surfaced from `print_attempt` lineage.

### 4.5 Security considerations

- **RLS / context:** `operator_id` + `casino_id` from authoritative context (ADR-024); `print_attempt` and `printer_target` casino-scoped (Pattern C). `print_attempt` is critical audit state — writes via session-var context.
- **Device trust boundary:** property-scoped `printer_target`; no browser-embedded shared secret; no public listener. **If the local-agent transport is chosen**, the localhost mediator is a new trust boundary → must prove localhost/LAN auth and that no secret ships in the browser bundle (triggers a mandatory deployment-standard ADR — FIB-S `adr_candidate`).
- **Audit trail:** `print_attempt` is the durable correlation record; never weakened to "confirmed" beyond what the transport observes.

### 4.6 Receipt templating (bounded supporting concern)

Templating is addressed here **only** to the extent needed to keep transport, audit, and adapter boundaries coherent. The detailed template implementation (per-instrument builders, block-by-block renderer mapping, asset handling) is **deferred to PRD/EXEC** — see the companion *POS Loyalty Instrument Receipt Templating Guide*.

```yaml
receipt_templating:
  scope: supporting_concern_within_feature
  source_input: existing_FulfillmentPayload          # frozen; not re-derived, not forked
  canonical_output: versioned_receipt_document       # ReceiptDocument: OS/transport-neutral print intent
  html_iframe_role: preview_only                     # approximate; never the production payload on this surface
  production_payload: adapter_rendered               # ePOS / ESC-POS renderer → adapter
  generic_template_engine: out_of_scope
  separate_feature: deferred_until_cross_domain_or_runtime_authoring_need
```

**Minimal contract established by this RFC:**
1. **Source input** — template builders consume the existing frozen `FulfillmentPayload` (+ a bounded `CasinoReceiptProfile` config: display name, address, logo selection, footer, printer target). They are **pure**: no instrument mutation, no token/issuance, no network, no printer/OS/Epson/`window.print()` calls.
2. **Canonical layer** — a versioned `ReceiptDocument` (block list: text/divider/image/barcode/feed/cut) is the transport-neutral print intent. Deterministic for a given `(template_version, instrument input)`; serializable for snapshots. Its blocks map 1:1 onto real ePOS `ePOSBuilder` and ESC/POS commands (validated — capability reference §5a).
3. **Renderer vs adapter** — a **renderer** converts `ReceiptDocument → payload` (ePOS / ESC-POS / fake / HTML-preview); the **adapter** sends payload → device. Both sit behind `LoyaltyInstrumentPrinter`; only they are transport-specific.
4. **Preview-only HTML** — the iframe/HTML path on the loyalty surface is preview/diagnostic only (labelled approximate until physical parity is certified); it is **not** the canonical production payload (GATE-UX-1; templating guide §9).
5. **Provenance on audit** — `template_id`, immutable `template_version`, and `receipt_document_hash` (digest of the canonical serialized `ReceiptDocument`, not the transport payload) are recorded on `print_attempt` (§4.1).
6. **Versioning** — template versions are immutable after release; layout/semantic changes create `vN+1`, never mutate `vN`. Stored as version-controlled code under the submodule (e.g. `services/loyalty/printing/templates/`), not DB-authored.

**Do NOT split templating into a separate feature** unless scope expands into any of: multiple independently managed instrument families; runtime/admin-authored templates; cross-domain printing; or reusable layout infrastructure beyond loyalty instruments. Until then it stays a supporting concern inside this feature.

> **Vocabulary reconciliation (flag for ADR, do not silently adopt):** the templating guide §12 lists `result_status` as `submitted|acknowledged|failed|unknown` and adds faults `invalid_document`/`unsupported_operation`. The **RFC contract supersedes it**: result stays the resolved four states `requested|submitted|failed|unknown` (no `acknowledged`/completion claim — §3). The guide's `invalid_document`/`unsupported_operation` are *render/validation-layer* outcomes (distinct from device faults); whether they join the canonical `PrinterFault` set is an **ADR reconciliation item**, not adopted here.

## 5) Cross-Cutting Concerns

- **Truthful-status mapping (grounded in Epson docs).** The pilot contract has **no state stronger than `submitted`**; a transport's richer observability changes only the *fidelity of faults*, never the success state (see capability reference §5):
  - Current one-way CUPS raster path → **`submitted`** on spooler-accept; faults unobservable (`fault` stays null).
  - Bidirectional ESC/POS agent (`DLE EOT`/ASB) → `submitted` + real faults (`paper_out`/`cover_open`/`offline`/autocutter→`driver_error`).
  - ePOS-direct (UB-E04/TM-i) → the device response arrives *after* print and could observe completion, but the pilot contract **still records `submitted`** — PT-2 deliberately does not claim physical completion. Its richer ASB only improves fault fidelity.
  - Any spooler/device "completed" signal **maps to `submitted`**; the contract never asserts `acknowledged`/`completed`.
- **Migration strategy:** additive (`print_attempt`; `printer_target` is configuration-only — no table); no change to `promo_coupon`; `lib/print/` untouched.
- **Observability:** the `print_attempt` lifecycle row doubles as the operational signal for print health (deferred dashboards per FIB §J — not built now).
- **Rollback:** rollback **disables controlled printing on the named surface** (remove the controlled action + adapter). Browser (`window.print()`) fallback on this surface is **not** automatic — it requires an explicit operational decision, never a silent code-path fallback (preserves duplicate-safety; FIB §G).
- **Testing governance (ADR-044):** the submodule declares: unit (mappers / result-fault mapping); **semantic snapshot** of the canonical `ReceiptDocument` (correct instrument id, value, expiry, terms, token, template id/version, feed/cut — templating guide §13.1 / TEMPLATE-1,4,5); **renderer contract** parity across fake / HTML-preview / production renderers (§13.2 / TEMPLATE-6) and fake-vs-production *adapter* parity (GATE-PLATFORM-2); and real-device acceptance (GATE-HW-2 / PLATFORM-3 / TEMPLATE-7). Linux CI runs semantic + renderer-contract + fake; real-device is the production-host gate. TEMPLATE-2 (no Epson/ESC-POS/spooler/CUPS/`window.print` calls outside the renderer/adapter) is a lint/boundary gate.

## 6) Alternatives Considered

### Alternative A: Managed local print agent (localhost mediator → OS print system) — **provisional recommendation**
- **Description:** browser → localhost agent → OS print system (CUPS today / Windows spooler) or bidirectional raw ESC/POS. OS-neutral contract; per-OS adapter behind it.
- **Tradeoffs:** works with the inventoried USB/CUPS reality now; can reach full device status if it uses a bidirectional ESC/POS channel. Cost: new localhost trust boundary + install/update ownership → **mandatory deployment-standard ADR**.
- **Why (provisionally) chosen:** the installed UB-U05 interface forecloses ePOS-direct; a mediator is the only controlled path that works on current hardware. **Not frozen** — confirm at GATE-HW-1.

### Alternative B: Epson ePOS-direct (browser → printer ePOS-Print Service over trusted LAN)
- **Description:** host POSTs ePOS-Print XML to the printer's on-board service; richest **fault fidelity** (ASB after print) — still surfaced as `submitted` + `fault` under the four-state pilot contract (no completion claim).
- **Tradeoffs:** OS-neutral, driverless, no local agent — the cleanest portability story.
- **Why not chosen (now):** **hardware-blocked.** Per Epson docs, ePOS-Print requires a TM-i or a UB-E04-class ePOS interface; the installed UB-U05 USB hosts no ePOS-Print Service. Viable only if GATE-HW-1 confirms (or the property installs) an ePOS interface. Kept as the preferred future target — the OS-neutral contract keeps it swappable.

### Alternative C: Harden `window.print()` in place (status quo+)
- **Description:** keep Vector C's iframe path, improve CSS/targeting.
- **Tradeoffs:** smallest change; reuses shipped code.
- **Why not chosen:** **rejected by FIB §G / GATE-UX-1** for this surface — still a browser dialog, no device targeting, no trustworthy status, weak duplicate/reprint control. (It does remain the right tool for *other* documents — hence coexistence, not deletion.)

## 7) Decisions Required

> The new ADR(s) **extend/amend ADR-045** (Pilot Reward Instrument Fulfillment Standard); they supersede it **only on the loyalty redemption surface** and do not retire its `lib/print/` utility for other documents.

**RESOLVED (ratified in Phases 0–1; ADR will record, not re-litigate):**
1. **Ownership:** `LoyaltyService.InstrumentPrinting` submodule; not a standalone service (deferred until printing is shared across domains). `promo_coupon` read-only; no reward/financial authoring.
2. **Audit shape:** dedicated **`print_attempt`** table as **one audit-controlled lifecycle row per attempt** (immutable identity/correlation; controlled `result_status`/`fault` transition) — **not** append-only, **not** an event log, **not** a `promo_coupon.metadata` JSONB append. Closes ADR-045 GAP-C0 + comp-slip logging gap.
3. **OS-neutral contract + adapter boundary:** one `LoyaltyInstrumentPrinter` contract, **four-state** `requested|submitted|failed|unknown` result (no completion claim — `submitted` = transport accepted) + `PrinterFault` vocabulary, all platform code behind one swappable adapter; deterministic fake for Linux dev; one production adapter certified.
4. **Coexistence:** retain `lib/print/` `window.print()` for non-loyalty documents; supersede it only on the named surface.
5. **`printer_target` shape:** configuration-only for the single fixed pilot printer (no table); promote to a table only on runtime reassignment / multiple stations / audit-relevant target identity.
6. **Receipt templating (bounded supporting concern):** frozen `FulfillmentPayload` → versioned `ReceiptDocument` → renderer → adapter; HTML/iframe preview-only on this surface; `template_id`/`template_version`/`receipt_document_hash` on `print_attempt`; no generic/runtime template engine. Templating stays inside this feature (not split) until cross-domain printing or runtime-authored templates arise. **ADR reconciliation item:** whether render/validation faults (`invalid_document`/`unsupported_operation`, templating guide §12) join the canonical `PrinterFault` set — the four-state *result* vocabulary is already fixed and not reopened.

**CONDITIONAL / BLOCKED (must not freeze in Phase 4 until the gate clears):**
7. **Transport mechanism** — A (local agent) | B (ePOS-direct) | C (rejected). **Recommendation:** A provisional, because UB-U05 forecloses B. **Blocked on GATE-HW-1** (inventory the *production* interface/firmware). If A and a localhost agent is chosen → **mandatory deployment-standard ADR** (FIB-S `adr_candidate`).
8. **Production adapter OS** — Windows (addendum assumption) | Linux/CUPS (only adapter proven today). **Blocked on DEP-OS-1.** Determines the single certified adapter (GATE-PLATFORM-3/4). Linux dev does not imply Linux production.

## 8) Open Questions

**Architectural — gated, must not freeze in Phase 4 until cleared:**
- **GATE-HW-1:** production printer interface/firmware — is it UB-U05 USB (→ agent) or an ePOS-capable UB-E04/TM-i (→ ePOS-direct viable)? Gates the transport decision.
- **DEP-OS-1:** confirmed pilot production workstation OS (Windows vs Linux). The only working adapter today is Linux/CUPS. Gates the single certified adapter.
- **Fault-observability scope (not a success-state question):** the four-state contract is fixed; the open scoping choice is whether the pilot agent uses a **bidirectional ESC/POS channel** (populates `fault`) or the current **one-way CUPS raster queue** (`submitted` with `fault` null). Decide alongside transport at GATE-HW-1.

**PRD-entry dependencies — not architectural decisions (resolve before PRD approval, FIB `prd_blocked_until`):**
- **Layout/validation (FIB DEP-3):** approved 80 mm content, legal text, expiration presentation, authoritative validation identifier.
- **Barcode/QR (Vector C GAP-C5):** whether the printed instrument carries a symbol, which symbology, which authoritative identifier.

These two do not change the architecture (contract, audit record, adapter boundary are invariant to layout content); they are PRD intake requirements.

## Links

- Feature Boundary: `docs/20-architecture/specs/loyalty-printing/FEATURE_BOUNDARY.md`
- Feature Scaffold: `docs/01-scaffolds/SCAFFOLD-POS-LOYALTY-INSTRUMENT-PRINTING.md`
- Intake: `docs/00-vision/epson/FIB-H-…`, `FIB-S-…`, `FIB-ADDENDUM-…`, `FIB-S-…-PATCH-001.json`
- ADR(s): TBD Phase 4 (extends ADR-045-pilot-reward-instrument-fulfillment)
- PRD: TBD Phase 5 (blocked until GATE-HW-1)
- Exec Spec: post-pipeline

## References

- Native Epson capability reference: `docs/00-vision/epson/EPSON-EPOS-ESCPOS-CAPABILITY-REFERENCE.md`
- Receipt templating guide (bounded supporting concern, §4.6): `docs/00-vision/epson/POS-LOYALTY-INSTRUMENT-RECEIPT-TEMPLATING-GUIDE.md`
- Hardware setup (dev rig): `docs/00-vision/epson/EPSON-TM-T88V-PRINTER-SETUP.md`
- Prior art: `docs/02-design/RFC-VECTOR-C-INSTRUMENT-FULFILLMENT.md`, `docs/80-adrs/ADR-045-pilot-reward-instrument-fulfillment.md`, `lib/print/`, `services/loyalty/dtos.ts:623`
- Epson official docs: TM-T88V TRG, ePOS-Print API UM (Rev K), UB-E04 TRG, ESC/POS real-time status reference (full URLs in the capability reference §6)
