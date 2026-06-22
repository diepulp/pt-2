# PRD Windows Certification — Phase-2 Handoff

**Status:** HANDOFF — not yet a numbered PRD. Proposed number on intake: **PRD-093** (next free integer after `docs/10-prd/PRD-092-loyalty-printing-linux-exemplar.md`).
**Artifact type:** Phase-2 backlog handoff — pre-PRD scoping document
**Feature:** POS Loyalty Instrument Printing — Windows production certification (Phase 2 / Gate E2)
**Predecessor:** PRD-092 (Linux/CUPS exemplar, Phase 1) — **COMPLETE** (automatable scope; one manual hardware gate, GATE-HW-2, open)
**Authority chain:** FIB-H-POS-LOYALTY-INSTRUMENT-PRINTING-001 → FIB-S → PRD-092 → EXEC-092 → **(this handoff) → PRD-093**
**Gate:** `WINDOWS_CERTIFICATION_REQUIRED` (ADR-062 D8 Gate E2)
**Drafted:** 2026-06-22
**Named hardware:** Epson TM-T88V (M244A) on UB-U05 USB (`04b8:0202`); production host OS = **Windows** (Linux remains dev/exemplar-only per ADR-062 amendment 2026-06-18)

> **One-line:** Phase 1 proved the *architecture* is correct on Linux/CUPS; Phase 2 must prove *Windows production is certified* — the `windows_spooler` adapter (RAW ESC/POS passthrough), the agent-as-Windows-Service lifecycle (ADR-063 D1–D4/D7), and the Gate E2 exit criteria that lift the anti-drift block on rollout.

---

## 1. Phase-1 → Phase-2 boundary

**Proven in Phase 1 (do NOT rebuild — drop-in adapter only):**
- OS-neutral `LoyaltyInstrumentPrinter { getStatus, print, testPrint }` contract; four-state result `requested | submitted | failed | unknown`.
- `print_attempt` audit relation: one controlled lifecycle row, closed state machine `requested → (once) → terminal`, terminal-immutable, reprint = new instance; RPC-only writes (DEC-007).
- Versioned templating `FulfillmentPayload → ReceiptDocument → renderer → adapter`; value authority = `FulfillmentPayload.face_value_cents`; `receipt_document_hash` over the canonical doc.
- Server-authoritative audit + terminal transition; co-located loopback agent fronting the OS spooler; exactly-once physical print across three layers (HTTP edge, DB `UNIQUE(casino_id, idempotency_key)`, agent `jobKey`).
- Operator UX retiring `window.print()` on the named redemption surface; manual-first (DEC-004); bounded outcome badge; nonce-bearing reprint with `unknown` duplicate-risk ack (DEC-008).
- **Device-encoding seam landed at the agent layer (NEW, Phase-1 learning):** `createEscPosCommandSpooler` wraps the OS-neutral text payload with ESC/POS init (`ESC @`) + `GS V` cut and submits it **RAW** (`lp -d <queue> -o raw`) to defeat the blank-paper symptom seen on the CUPS raster filter. The renderer stayed plain text; bytes live at/below the adapter boundary (GATE-PLATFORM-1). The `CupsSpooler` interface is the injectable seam (`createSimulatedCupsSpooler` default / `createCupsCommandSpooler` / `createEscPosCommandSpooler`).
- Renderer word-wraps to a configurable `columnWidth` (env `LOYALTY_PRINT_COLUMN_WIDTH`) — **the Windows path reuses this renderer unchanged.**

**Remains for Phase 2 (this handoff):**
- A `windows_spooler` adapter + a Windows agent that opens the printer with the **RAW datatype** and writes ESC/POS bytes (winspool/GDI). `Out-Printer` / generic-text-driver passthrough **cannot** emit raw bytes and risks the same blank output observed on the CUPS raster driver.
- ADR-063 **D1–D4 / D7** hardening: install, auto-start as a **Windows Service**, supervised restart, versioned update path, localhost trust-boundary + request auth, signing, exposure prevention.
- The completion/lifecycle decision: whether the Windows path can observe genuine device completion and, only if so, whether to admit `printed`/`acknowledged`/`completed` states and `PrinterFault` / `failure_domain=device` vocabulary (requires an ADR amendment — see §5).
- Gate E2 acceptance: `windows_agent_exists`, `windows_spooler_adapter_exists`, `real_printer_test_passes`, `audit_contract_identical`, `localhost_security_review_complete`.

**Anti-drift (frozen, ADR-062 D8):** Linux/CUPS MUST NOT become a permanent production assumption. Production rollout is **blocked** until Gate E2 / `WINDOWS_CERTIFICATION_REQUIRED` passes. "We'll port it later" is not an accepted posture — the gate is the forcing function.

---

## 2. Workstream backlog

| WS | Title | Scope | Traces to |
|----|-------|-------|-----------|
| **WS-W1** | `windows_spooler` adapter (RAW ESC/POS passthrough) | New adapter behind the unchanged `LoyaltyInstrumentPrinter<ReceiptDocument>` contract. Reuses the Phase-1 cups renderer and `ReceiptDocument` unchanged. Maps spooler outcome → `submitted` (never stronger), `agent_unreachable` → `failed`, post-submit ambiguity → `unknown` — identical canonical vocabulary to the cups adapter (`mapAgentResponseToOutcome`/`mapTransportErrorToOutcome` semantics carried over). **No CUPS/Windows types leak above the adapter boundary** (GATE-PLATFORM-1). | ADR-062 D3, GATE-PLATFORM-1/2/4 |
| **WS-W2** | Windows RAW print path (winspool/GDI) | The Windows equivalent of `lp -d <queue> -o raw`: open the printer with the **RAW datatype** (`StartDocPrinter` `pDatatype = "RAW"` via winspool, or equivalent) and write the ESC/POS byte buffer directly — `ESC @` init → rendered text → feed → `GS V` cut, mirroring `createEscPosCommandSpooler`. Explicitly NOT `Out-Printer` and NOT a generic/text driver (both risk the blank-output symptom). A `WindowsSpooler` realization of the same injectable spooler seam as `CupsSpooler`. | Phase-1 ESC/POS learning, ADR-062 D6 |
| **WS-W3** | Agent Windows-Service lifecycle (ADR-063 D1–D4) | Install the agent as a **Windows Service**: auto-start at boot, supervised restart on crash, named operational owner, observable version, versioned caller↔agent protocol with incompatible-agent refusal (D4). The Phase-1 agent must be started MANUALLY in `escpos` mode — productionizing exactly this is the D1–D4 backlog. Loopback bind (`127.0.0.1`) only (D1); no browser-embedded secret (D2); localhost request authentication binding the caller to the sanctioned surface (D3). | ADR-063 D1, D2, D3, D4 |
| **WS-W4** | Update / signing / trust-boundary hardening | Signed agent binary + signed/managed update channel (no silent self-mutation, no side-loading — D4); exposure prevention (no public/LAN listener — D1); localhost trust-boundary security review. Rollback disables the agent path with **no automatic browser fallback** (D7). | ADR-063 D4, D7, D1 |
| **WS-W5** | Completion-state decision (gated on real device-completion observability) | **Investigate-then-decide.** Determine whether the Windows RAW path can observe *genuine* device completion (not merely spooler acceptance). **Only if** verified-true: propose admitting `printed`/`acknowledged`/`completed` and the `PrinterFault` / `failure_domain=device` vocabulary — which requires an ADR-062/063 amendment AND re-evaluating the §7a terminology gate (these terms are currently NOT SRL-admitted and `device`/`PrinterFault` are FORBIDDEN). If observability is **not** genuine, the `submitted`-only ceiling holds unchanged and the decision is recorded as "no completion claim, deferred". **Default posture: no new state.** | ADR-062 D3/D7, ADR-063 D6, PRD-092 §7a |
| **WS-W6** | Gate E2 certification harness | Real Windows host + real TM-T88V acceptance proving the Gate E2 exit criteria: `windows_agent_exists`, `windows_spooler_adapter_exists`, `real_printer_test_passes`, `audit_contract_identical` (byte-identical `print_attempt` contract vs Linux), `localhost_security_review_complete`. Plus the Phase-1 distinguishability matrix on Windows: first-print, printer-offline, retry, deliberate reprint, cut + layout. | ADR-062 D8 Gate E2, GATE-PLATFORM-3 |
| **WS-W7** | Security posture (Windows) | Confirm loopback-only bind survives Windows networking/firewall; server-side target resolution (opaque `printer_target_id` resolved to a Windows printer/queue at the agent — never in the browser); no device address or secret in the bundle (D2); localhost request auth (D3). Windows-specific localhost permission review (GATE-SEC-1 promoted from minimal to certification item). | ADR-063 D1/D2/D3, GATE-SEC-1 |
| **WS-W8** | Regression parity with the Linux exemplar | Run the Phase-1 contract-parity suite with the `windows_spooler` adapter added: `windows_spooler` + `cups` + `fake` all pass ONE contract suite (GATE-PLATFORM-2), returning identical canonical result/failure vocabulary. Boundary lint still green (no Windows/winspool types above the adapter). `print_attempt` audit contract byte-identical. GATE-DOM-1 (no `promo_coupon`/ledger writes) and GATE-DUP-1 (idempotent replay / reprint lineage / adapter-fires-once) re-asserted on the Windows path. | GATE-PLATFORM-2, GATE-DOM-1, GATE-DUP-1, audit_contract_identical |

---

## 3. Out of scope (Phase 2)

- **Bidirectional ESC/POS / ePOS-direct.** UB-U05 hosts no ePOS-Print Service (hardware-foreclosed, ADR-062 amendment). Device-fault *fidelity* beyond what WS-W5 may admit stays out unless WS-W5 verifies genuine completion observability.
- **Multi-vendor / fleet / cloud queue abstraction**, multiple stations, runtime adapter hot-swap (one production adapter per deployment — ADR-062 D3), unattended/batch printing.
- **Generic/runtime/admin-authored template engine** (ADR-062 D6). Authoritative 80 mm legal text/expiry/validation identifier (FIB DEP-3) and barcode/QR symbology (Vector C GAP-C5) are content concerns that resolve before PRD-093 approval — they are PRD-entry dependencies, not in-build workstreams.
- **`window.print()` for non-loyalty docs** (MTL / shift reports) — `lib/print/` retained untouched (ADR-045 / ADR-062 D4).
- **Any change to instrument eligibility/value/redemption authority**; no new instrument types; value authority stays `FulfillmentPayload.face_value_cents`.
- **`printer_target` table** — configuration-only persists (ADR-062 D5) unless multi-station/reassignment lands (out of scope).

**Anti-drift note:** This handoff does NOT authorize shipping the Linux exemplar to production. Linux is the reference implementation only. Until WS-W6 closes Gate E2, the rollout block stands.

---

## 4. Locked invariants carried forward (do NOT relitigate)

- Four-state result `requested | submitted | failed | unknown`; **`submitted` = spooler accepted, NOT printed**. No completion/acknowledged state in the contract unless WS-W5 amends the ADR.
- `print_attempt` = one audited lifecycle row; closed state machine; terminal-immutable; reprint = new instance; RPC-only writes (DEC-007).
- Value authority = `FulfillmentPayload.face_value_cents` only (never `promo_coupon.face_value_amount`).
- Templating bounded: `FulfillmentPayload → ReceiptDocument → renderer → adapter`; HTML renderer preview-only/non-canonical (FR-7 rejects it before any device call).
- `window.print()` retained off-surface (non-loyalty).
- **Device encoding lives at the AGENT layer (GATE-PLATFORM-1).** The renderer stays OS-neutral plain text; the Windows adapter/agent replicates the RAW-passthrough pattern. Plain text through a generic/text Windows driver risks the blank-output symptom.
- **Terminology gate, NOT SRL** (PRD-092 §7a): print-lifecycle terms are local contract vocabulary (`srl_required: false`). `PrinterFault` / `ReceiptDocument` are NOT SRL-admitted; `PrinterFault` must not appear in DTOs/UI/schema. WS-W5 is the ONLY path that may reopen this, via ADR amendment.

---

## 5. Dependencies / open decisions requiring an ADR amendment before build

1. **Completion-state admission (WS-W5)** — Admitting `printed`/`acknowledged`/`completed` and/or `PrinterFault` / `failure_domain=device` is forbidden by ADR-062 D3/D7 and the §7a deferral. It requires:
   - an **ADR-062 amendment** (four-state vocabulary is currently frozen; `acknowledged` explicitly excluded),
   - an **ADR-063 D6 amendment** (agent currently reports no `failure_domain=device`),
   - a re-run of the §7a Terminology / Operator-Copy Gate (and possibly SRL admission if the terms prove to carry cross-domain semantics).
   This decision is **gated on empirical proof** that the Windows RAW path observes genuine device completion. **Default: no amendment, ceiling holds.**
2. **ADR-063 enforcement promotion** — D1–D4/D7 move from "not blocking (Linux exemplar)" to **mandatory certification items**. No reopening of transport selection (ADR-062 owns it; ADR-063 scope guard). Confirm no D1–D7 decision is being relitigated — only enforced.
3. **PRD-entry content dependencies (not architectural):** authoritative 80 mm legal layout / expiry / validation identifier (FIB DEP-3) and barcode/QR symbology (Vector C GAP-C5) must be resolved before PRD-093 approval (PRD-092 §7 / ADR-062 downstream obligations).
4. **Phase-1 close-out prerequisites:** GATE-HW-2 (manual Linux real-device acceptance) should be recorded, and the uncommitted WS1–WS9 work on branch `epson` committed, before Phase 2 begins on a clean base.

---

## 6. Cross-references

- **PRD-092** (Phase-1 PRD) — `docs/10-prd/PRD-092-loyalty-printing-linux-exemplar.md`
- **EXEC-092** (Phase-1 exec spec) — `docs/21-exec-spec/EXEC-092-loyalty-printing-linux-exemplar.md`
- **PRD-092 Implementation Precis** (post-build synthesis) — `docs/00-vision/epson/PRD-092-IMPLEMENTATION-PRECIS.md`
- **ADR-062** (controlled-path standard, D1–D8; D8 = two-phase sequencing + `WINDOWS_CERTIFICATION_REQUIRED`) — `docs/80-adrs/ADR-062-loyalty-instrument-printing-controlled-path.md`
- **ADR-063** (print-agent deployment / trust-boundary standard, D1–D7; D1–D4/D7 are the Phase-2 backbone) — `docs/80-adrs/ADR-063-loyalty-print-agent-deployment-standard.md`
- **Phase-1 seams** — `services/loyalty/printing/agent/loopback-agent.ts` (`CupsSpooler` interface, `createEscPosCommandSpooler`, RAW passthrough), `services/loyalty/printing/adapters/cups-adapter.ts` (outcome-mapping pattern to replicate)
- **Epson capability reference** — `docs/00-vision/epson/EPSON-EPOS-ESCPOS-CAPABILITY-REFERENCE.md`

---

## Appendix A: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-22 | Phase-2 handoff drafting | Initial backlog handoff — Windows certification (Gate E2), grounded in completed PRD-092 work and frozen ADR-062/063 |
