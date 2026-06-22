# SEC Note: POS Loyalty Instrument Printing

**Feature:** loyalty-printing (LoyaltyService.InstrumentPrinting)
**Date:** 2026-06-18
**Author:** Feature Pipeline (Phase 3)
**Status:** Draft

> Tiny threat model. Design-time only. Scopes the security surface introduced by the
> controlled print path; defers nothing that is gated on hardware (GATE-HW-1 / DEP-OS-1)
> beyond what is explicitly listed under Deferred Risks.
>
> **Resolved (2026-06-18):** GATE-HW-1 / DEP-OS-1 confirmed UB-U05 USB (no ePOS) on a Windows host
> → **Alternative A (managed local print agent)** is the chosen transport. The localhost print-agent
> trust boundary (T2/T3/C2/C3) is therefore **unconditional**, and its durable controls are now
> governed by **ADR-063 (Loyalty Print Agent — Deployment & Trust Boundary Standard)**. The
> previously-conditional Alt-B (ePOS-direct) branch does not apply.

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| `promo_coupon` instrument source-of-truth | Financial | The redeemable instrument. A print operation must never create/mutate/redeem/reclassify it (FIB-S invariant). |
| `print_attempt` lifecycle row | Compliance / Audit | Durable correlation + non-repudiation record of every print/reprint; the audit trail closing ADR-045 GAP-C0. |
| Actor attribution (`operator_id`, `casino_id` on `print_attempt`) | Audit | Non-repudiation: who printed what, where, when. Must not be spoofable. |
| `receipt_document_hash` + `template_id`/`template_version` provenance | Compliance / Audit | Tamper-evident record of exactly what canonical document was requested for any print or reprint. |
| Patron-facing instrument terms (value, expiry, validation identifier/symbology) | Operational / PII-adjacent | Rendered onto a physical instrument; incorrect value/identifier is a financial-integrity and patron-trust risk. |
| `printer_target` configuration (device address / transport params) | Operational | Property-scoped routing config. Exposure widens the device attack surface; must not reach the browser bundle. |
| Localhost print-agent channel *(Alt A only)* | Operational | New trust boundary between browser and OS print system; an unauthenticated listener is a local-network attack surface. |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Print failure/uncertainty mints or mutates an instrument | High | Low | P1 |
| T2: Unauthenticated localhost agent accepts forged print jobs *(Alt A)* | Med | Med | P2 |
| T3: Secret/credential shipped in browser bundle to reach the agent/device *(Alt A)* | High | Med | P1 |
| T4: Device address / transport params exposed to the browser | Med | Med | P2 |
| T5: Cross-casino print-attempt read/write (tenant leakage) | High | Med | P1 |
| T6: Actor-attribution spoofing on `print_attempt` (forged `operator_id`) | Med | Low | P2 |
| T7: Silent duplicate physical copy via uncontrolled retry/reprint | High | Med | P1 |
| T8: HTML preview payload mistaken for / substituted as the production payload | Med | Low | P2 |
| T9: `print_attempt` tampering — backdating, status downgrade, or correlation rewrite | Med | Low | P2 |

### Threat Details

**T1: Print failure mints an instrument**
- **Description:** A failed, unknown, or retried print causes a write to `promo_coupon` (issue/mutate/redeem).
- **Attack vector:** Print path coupled to issuance; a retry handler re-invokes issuance instead of re-invoking transport.
- **Impact:** Double issuance / unauthorized instrument creation — direct financial loss and audit corruption.

**T2: Unauthenticated localhost agent (Alt A only)**
- **Description:** Any local process / other origin POSTs a print job to the localhost mediator.
- **Attack vector:** Agent binds a port with no origin/auth check; a malicious local page or process drives the printer.
- **Impact:** Unsanctioned printing, paper/consumable exhaustion, spoofed instruments on the physical device.

**T3: Secret in browser bundle (Alt A only)**
- **Description:** A shared key/token needed to talk to the agent or device is embedded in client JS.
- **Attack vector:** Read the bundle; replay the secret.
- **Impact:** Anyone with the static asset can drive the printer / impersonate the surface.

**T5: Cross-casino print-attempt leakage**
- **Description:** Staff at Casino A read or write `print_attempt` rows for Casino B.
- **Attack vector:** Missing/weak RLS; `casino_id` taken from request rather than authoritative context.
- **Impact:** Tenant isolation breach, regulatory exposure.

**T7: Silent duplicate copy**
- **Description:** An ambiguous outcome (`unknown`) is auto-retried, emitting a second physical instrument.
- **Attack vector:** Automatic retry / silent fallback to `window.print()` on the named surface.
- **Impact:** Two redeemable physical copies of one instrument — financial exposure (GATE-DUP-1).

**T8: Preview-as-production substitution**
- **Description:** The approximate HTML/iframe preview payload is sent to the device as if canonical.
- **Attack vector:** Renderer selection not enforced; preview renderer reachable on the production print action.
- **Impact:** Uncertified layout printed on a redeemable instrument; provenance hash no longer matches device output.

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | No-authoring invariant: print path writes only `print_attempt` | Submodule has no `promo_coupon` write capability; invariant test asserts zero `promo_coupon` mutations across all print outcomes (RFC §2 success criteria). |
| T2 | Localhost-only listener + origin/loopback binding *(Alt A)* | Agent binds `127.0.0.1` only, no public/LAN listener; verifies request origin. Proven at GATE-SEC-1 before transport freeze. |
| T3 | No browser-embedded secret *(Alt A)* | Auth (if any) brokered server-side; bundle audit / boundary lint asserts no device/agent secret in client assets (GATE-SEC-1). |
| T4 | Device address never crosses to the browser | `printer_target` resolved server-side; print action takes an opaque target reference, not a device address (RFC §4.3, §4.5). |
| T5 | Casino-scoped RLS (Pattern C) + authoritative context (ADR-024) | `print_attempt`/`printer_target` policies bind `casino_id = current_setting('app.casino_id')`; context derived from JWT staff claim, never request payload. |
| T6 | Actor binding via session-var context | `operator_id`/`casino_id` written from `app.actor_id`/`app.casino_id` (`SET LOCAL`), not client-supplied; WITH CHECK binds insert to context. |
| T7 | Explicit retry/reprint only + idempotency key + reprint lineage | No silent auto-retry; no automatic `window.print()` fallback. `print_attempt` carries idempotency key + `reprint_of` lineage (GATE-DUP-1, RFC §4.1/§4.4). |
| T8 | Renderer enforcement: HTML is preview-only | Production print action accepts only adapter-rendered payloads; HTML/iframe renderer is non-canonical and not reachable on the production path (GATE-UX-1, RFC §4.6). |
| T9 | Immutable identity/correlation + controlled transition | Identity, correlation, `requested_at`, and provenance fields immutable once written; only `result_status`/`fault` transition under controlled writes (RFC §4.1). |

### Control Details

**C1: No-authoring invariant (T1)**
- **Type:** Preventive
- **Location:** Application (submodule capability) + Database (no grant to mutate `promo_coupon`)
- **Enforcement:** Both
- **Tested by:** Invariant test — every print outcome (`requested|submitted|failed|unknown`) asserts zero `promo_coupon` writes (RFC §2/§5).

**C5: Casino-scoped RLS + authoritative context (T5/T6)**
- **Type:** Preventive
- **Location:** RLS + session-var context (ADR-024 / ADR-030 write-path enforcement)
- **Enforcement:** Database
- **Tested by:** RLS policy tests (cross-casino deny) + actor-binding test (forged `operator_id` rejected).

**C7: Duplicate-safety (T7)**
- **Type:** Preventive
- **Location:** Application (print action + retry affordance) + Database (idempotency key uniqueness)
- **Enforcement:** Both
- **Tested by:** GATE-DUP-1 — repeated delivery of one attempt emits exactly one copy; reprint produces distinct attempt lineage sharing instrument identity.

**C8: Renderer enforcement (T8)**
- **Type:** Preventive
- **Location:** Application (renderer/adapter boundary) + boundary lint (TEMPLATE-2)
- **Enforcement:** Application
- **Tested by:** Renderer-contract parity tests + lint gate (no Epson/ESC-POS/spooler/CUPS/`window.print` calls outside renderer/adapter).

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| ~~Localhost-agent auth hardening fully specified~~ **RESOLVED** | Transport now selected (Alt A) | Closed → governed by **ADR-063**; localhost bind, auth, idempotency, exposure-prevention frozen there. Implementation/cert at build (GATE-PLATFORM-3). |
| Production OS hardening posture (Windows vs Linux/CUPS) | Production workstation OS unconfirmed | DEP-OS-1 confirms pilot OS → certify the single adapter's host posture |
| Device-fault fidelity (paper-out/cover-open/offline) | One-way CUPS raster cannot observe device faults | Bidirectional ESC/POS channel adopted at GATE-HW-1 |
| Print-health dashboards / alerting | Observability surface deferred (FIB §J) | Operational monitoring requirement post-pilot |
| Tamper-proof audit (append-only log / signing) | `print_attempt` controlled-transition model sufficient for pilot | Regulatory requirement for cryptographic print-audit |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| `instrument_id` (→ `promo_coupon`) | Plaintext FK | Correlation to source instrument; no secret content. |
| `operator_id`, `casino_id` | Plaintext (from session-var context) | Audit attribution; bound to authoritative context, not client input. |
| `receipt_document_hash` | Hash (digest of canonical serialized `ReceiptDocument`) | Transport-independent, reproducible provenance; not the transport payload. No need to store the rendered payload. |
| `template_id`, `template_version` | Plaintext (immutable) | Provenance; version-controlled code identifiers, not secrets. |
| `printer_target` device address / transport params | Server-side config only — **not** stored on `print_attempt`, **never** in browser bundle | Device address is an attack-surface asset; the audit row stores only `printer_target_id`. |
| Agent/device credential *(Alt A, if any)* | Not in browser; server-brokered | No client-readable secret (T3 / GATE-SEC-1). |

---

## RLS Summary

> Tables are casino-scoped (Pattern C, ADR-020). `printer_target` is **configuration-only for the
> pilot (no table)** per RFC §4.1; the row below applies only if it is promoted to a table.

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `print_attempt` | pit_boss, admin (same casino) | pit_boss, admin (via submodule, context-bound) | pit_boss, admin — **status/fault transition only**; identity/correlation immutable | Denied |
| `promo_coupon` | (existing LoyaltyService policy) | **Denied to InstrumentPrinting** (read-only) | **Denied to InstrumentPrinting** | Denied |
| `printer_target` *(only if promoted to table)* | same-casino staff | admin | admin | Denied |

---

## Validation Gate (sec-approved)

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] Sensitive fields have storage-form justification
- [x] RLS covers all CRUD operations (incl. UPDATE restricted to status/fault transition; DELETE denied)
- [x] No plaintext storage of secrets (no device/agent secret on `print_attempt` or in browser bundle)
- [x] No-authoring invariant captured as a P1 threat with a Preventive + tested control (T1/C1)
- [x] Duplicate-safety (GATE-DUP-1) captured (T7/C7)
- [x] Conditional localhost-agent boundary scoped to Alt A and deferred to the GATE-HW-1 deployment ADR

---

## Links

- Feature Boundary: `docs/20-architecture/specs/loyalty-printing/FEATURE_BOUNDARY.md`
- Design Brief / RFC: `docs/02-design/RFC-POS-LOYALTY-INSTRUMENT-PRINTING.md`
- Scaffold: `docs/01-scaffolds/SCAFFOLD-POS-LOYALTY-INSTRUMENT-PRINTING.md`
- Extends: ADR-045 (Pilot Reward Instrument Fulfillment Standard) — superseded only on the loyalty redemption surface
- Classification authority: ADR-058 / Feature Classification & Transport Selection Standard — feature is **CLS-007 External Integration** + **CLS-003 Authoring**; CLS-007 mandates an ADR when delivery/security is affected (both apply here)
- Security ADRs: ADR-024 (authoritative context), ADR-030 (write-path session-var enforcement), ADR-020 (Pattern C)
- Gates: GATE-SEC-1 (agent trust boundary), GATE-HW-1 (transport), DEP-OS-1 (production OS), GATE-DUP-1 (duplicate-safety), GATE-UX-1 (surface supersession)
