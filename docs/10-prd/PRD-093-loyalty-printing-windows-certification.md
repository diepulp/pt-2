---
id: PRD-093
title: POS Loyalty Instrument Printing — Windows Production Certification (Gate E2)
owner: Lead Architect
status: Accepted
affects: [ADR-062, ADR-063, ADR-024, PRD-092, FEATURE-loyalty-printing]
created: 2026-06-22
last_review: 2026-06-22
phase: Phase 2 (Windows Certification / Gate E2)
pattern: A
http_boundary: true
renders_derived_value_surface: false
---

# PRD-093 — POS Loyalty Instrument Printing: Windows Production Certification

## 1. Overview

- **Owner:** Lead Architect (LoyaltyService.InstrumentPrinting submodule)
- **Status:** Accepted (EXEC-ready)
- **Summary:** Certify the controlled loyalty-instrument printing path — already proven on
  Linux/CUPS in PRD-092 — for the intended **Windows** production host, **without redesigning the
  printing architecture**. PRD-092 proved the *architecture* is correct (contract, `ReceiptDocument`,
  renderer, `print_attempt` audit lifecycle, idempotency, reprint lineage, truthful four-state outcome);
  PRD-093 proves *Windows production is certified*. New work is a `windows_spooler` adapter that writes
  the existing ESC/POS byte payload through a **RAW** winspool path, the print agent as a managed
  **Windows Service** (ADR-063 D1–D4/D7), localhost trust-boundary hardening, a signed install/update
  path, and real-device **Gate E2** acceptance on the named Epson TM-T88V. Success means *Windows is
  certified*, not that the domain model, audit contract, or operator workflow changed. Per ADR-062 D8,
  production rollout remains **blocked** until Gate E2 / `WINDOWS_CERTIFICATION_REQUIRED` passes.

## 1a. Normative Invariants (single source of truth)

These invariants are **normative for the entire PRD**. Later sections reference them by ID rather
than restating policy; if any section appears to conflict, this block wins.

- **INV-1 (inherited contract).** The `LoyaltyInstrumentPrinter<ReceiptDocument>` contract,
  `ReceiptDocument`, renderer, `print_attempt` lifecycle, idempotency, and reprint lineage are
  inherited from PRD-092 **unchanged**. PRD-093 adds only a Windows platform realization *below* the
  adapter boundary. No renderer redesign.
- **INV-2 (frozen vocabulary).** Result vocabulary is `requested | submitted | failed | unknown`.
  `submitted ≠ physically printed`. `printed` / `acknowledged` / `completed` / `PrinterFault` /
  `failure_domain=device` are **forbidden** in DTOs, UI, and persisted schema in PRD-093 — with **no
  in-PRD reopening path** (see INV-6).
- **INV-3 (test-print is adapter-direct).** `print()` writes exactly one controlled `print_attempt`;
  the administrative `testPrint()` exercises the adapter **directly and writes no `print_attempt` row**
  (PRD-092 administrative test-print contract).
- **INV-4 (contract-identical audit).** The Windows `print_attempt` is **contract-identical** (not
  asserted byte-identical) to Linux per the §5.4 parity definition; platform diagnostics are confined
  to agent-local logs and MUST NOT enter the canonical contract.
- **INV-5 (no browser fallback).** Rollback or agent-unavailability yields `failed`/`unknown` — never
  an automatic `window.print()` fallback.
- **INV-6 (completion is evidence-only).** PRD-093 captures device-completion *evidence* only. Any
  stronger signal produces an ADR/FIB candidate for a **later** slice; it does **not** mutate vocabulary,
  schema, operator copy, or ADR authority inside this PRD.

## 2. Problem & Goals

### 2.1 Problem

The loyalty-printing architecture is implemented and proven through the Linux/CUPS exemplar (PRD-092),
but production will run on **Windows**. Until Windows is certified, the controlled path cannot be
trusted or released in the intended production environment, and the system remains dependent on a
development-only platform path. ADR-062 D8 forbids Linux/CUPS from becoming a permanent production
assumption: "we'll port it later" is not an accepted posture — Gate E2 is the forcing function. The
Windows RAW transport must be proven (a generic-text / `Out-Printer` path risks the same blank-output
symptom defeated on the CUPS raster filter), the agent must run as a supervised, signed, loopback-only
Windows Service, and the real device must pass the distinguishability matrix before the rollout block
is lifted.

### 2.2 Goals

| Goal | Observable Metric |
|------|-------------------|
| **G1**: Windows RAW transport proven behind the unchanged contract | A `windows_spooler` adapter opens the printer with RAW datatype and writes the canonical ESC/POS byte payload; a manually launched agent prints on the real TM-T88V (Gate W-A). |
| **G2**: Adapter parity preserved across platforms | `windows_spooler` + `cups` + `fake` pass **one** contract suite with identical canonical result/failure vocabulary; **no** Windows/winspool types above the adapter boundary (GATE-PLATFORM-1/2). |
| **G3**: Agent certified as a managed Windows Service | Service installs deterministically, auto-starts after reboot, restarts per the approved recovery policy, binds `127.0.0.1` only, rejects unauthorized callers, enforces version compatibility fail-closed, and ships signed install/update artifacts (Gate W-B). |
| **G4**: Audit contract **contract-identical** to the Linux exemplar | The `print_attempt` lifecycle, idempotency, failure vocabulary, and reprint lineage on the Windows path are contract-identical to PRD-092 per the §5.4 parity definition (`audit_contract_identical`, INV-4). |
| **G5**: Real-device Gate E2 certified; rollout block liftable | On the real Windows host + real TM-T88V: first-print, printer-offline (per the §5.5 custody matrix), retry/idempotent replay, explicit reprint, unknown-state duplicate-risk ack, layout/feed/cut, reboot/recovery, and localhost security review all pass; Gate E2 sign-off recorded (Gate W-C). |

### 2.3 Non-Goals

- **Redesign of the `LoyaltyInstrumentPrinter<ReceiptDocument>` contract**, `ReceiptDocument`, renderer,
  audit lifecycle, idempotency model, or operator surface — all inherited **unchanged** (FIB-H §N).
- **Any new lifecycle state** (`printed` / `acknowledged` / `completed`) or device-fault vocabulary
  (`PrinterFault` / `failure_domain=device`) — **forbidden in PRD-093 with no in-PRD reopening path**
  (INV-2/INV-6). WS-W5 captures device-completion *evidence only*; any stronger signal becomes an
  ADR/FIB candidate for a **later** slice and does not mutate vocabulary or schema here (§5.3).
- **`Out-Printer` / generic-text-driver** transport — cannot emit byte-transparent RAW ESC/POS and risks
  the blank-output symptom (FIB-H §G/§H).
- **Browser-native `window.print()` fallback** for the controlled loyalty path; rollback disables the
  agent path with **no** automatic browser printing.
- New instrument families, new operator-facing print surface, generic/admin-authored template engine,
  multi-vendor / fleet / cloud-print platform, runtime adapter hot-swap, bidirectional ESC/POS or
  ePOS-direct, unattended/scheduled/batch printing, LAN/remote/cloud agent access (FIB-H §G).
- Any change to loyalty issuance, ledger authority, instrument value authority, or redemption semantics;
  no expansion of controlled printing to MTL reports, shift reports, or unrelated documents.
- `lib/print/` `window.print()` for **non-loyalty** documents — retained untouched (ADR-045 / ADR-062 D4).

## 3. Users & Use Cases

**Primary user — Pit Boss / Administrator authorized to issue loyalty instruments (operator):**
- Print or controlled-reprint an already-issued loyalty instrument from the existing redemption surface
  on the Windows production workstation, with the same controlled, audited, duplicate-safe behavior as Linux.
- See the bounded outcome (`submitted | failed | unknown`) and perform an **explicit** reprint when
  permitted — never a silent auto-retry, never a browser fallback.

**Secondary user — System Administrator (print-agent owner):**
- Install and maintain the approved print agent as a Windows Service with approved startup, identity,
  version, and recovery configuration; apply signed updates and roll back when needed.
- Review service and security evidence during certification (loopback-only exposure, caller auth,
  recovery, version enforcement, no browser fallback).

## 4. Scope & Feature List

### 4.1 In Scope (Phase 2 — Windows Certification / Gate E2)

**Windows RAW transport (Gate W-A → WS-W1 / WS-W2):**
1. `windows_spooler` adapter behind the unchanged `LoyaltyInstrumentPrinter<ReceiptDocument>` contract;
   reuses the Phase-1 renderer and `ReceiptDocument` unchanged.
2. Windows RAW print path (winspool): open the printer with the **RAW datatype**
   (`StartDocPrinter pDatatype = "RAW"`), write `ESC @` init → rendered text → feed → `GS V` cut —
   mirroring `createEscPosCommandSpooler`. A `WindowsSpooler` realization of the same injectable spooler seam.
3. Canonical outcome mapping carried over unchanged: spooler accepted → `submitted` (never stronger),
   agent unreachable → `failed`, post-submit ambiguity → `unknown`.

**Windows Service lifecycle & hardening (Gate W-B → WS-W3 / WS-W4 / WS-W7):**
4. Agent installed as a **Windows Service**: deterministic install, auto-start at boot, supervised
   restart per approved recovery policy, named operational owner, observable version.
5. Localhost trust boundary: loopback (`127.0.0.1`) bind only (D1); no browser-embedded secret (D2);
   localhost request authentication binding the caller to the sanctioned surface (D3).
6. Versioned caller↔agent protocol with incompatible-agent refusal, fail-closed (D4).
7. Signed agent binary + signed/managed update channel (no silent self-mutation, no side-loading);
   rollback disables the agent path with **no** browser fallback (D7).
8. Server-side opaque `printer_target_id` resolution to a Windows printer/queue at the agent — never in
   the browser; Windows-specific localhost permission review (GATE-SEC-1 promoted to a certification item).

**Completion-observability evidence capture (WS-W5 — evidence only, ships no vocabulary change):**
9. Capture a bounded evidence note on whether the Windows RAW path exposes *genuine* device-completion
   signals (not mere spooler acceptance). **PRD-093 ships with `requested|submitted|failed|unknown` and
   `failure_domain=device` forbidden regardless of the finding (INV-2/INV-6).** Any positive evidence
   becomes an ADR/FIB candidate for a later slice — it is **not** an admission inside this PRD (§5.3).

**Certification & parity (Gate W-C → WS-W6 / WS-W8):**
10. Gate E2 certification harness on the real Windows host + real TM-T88V proving the exit criteria and
    the distinguishability matrix.
11. Regression parity: `windows_spooler` added to the Phase-1 contract suite; boundary lint green;
    `print_attempt` audit contract-identical (§5.4); GATE-DOM-1 and GATE-DUP-1 re-asserted on the Windows path.

### 4.2 Out of Scope

- Everything in §2.3 Non-Goals, plus the FIB-H §G exclusions and §L expansion triggers.
- `printer_target` table — configuration-only persists (ADR-062 D5) unless multi-station/reassignment
  lands (out of scope).
- Production deployment runbook, operational support procedure for version drift / printer replacement,
  and any additional printer model or document family — out-of-scope-but-likely-next (FIB-H §K), not in
  this build.

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1** The operator prints/reprints an already-issued loyalty instrument from the existing redemption
  surface on the Windows host through the controlled path; the application-facing printer contract is unchanged (Gate W-A).
- **FR-2** The `windows_spooler` adapter opens the printer with the **RAW datatype** and writes the
  canonical ESC/POS byte payload (`ESC @` → text → feed → `GS V` cut) directly via winspool — **not**
  `Out-Printer` and **not** a generic/text driver (WS-W2).
- **FR-3** `submitted` means the Windows spooler accepted the job — **no** claim of physical completion;
  any "completed"/queue-disappearance maps to `submitted` (truthful-outcome ceiling preserved).
- **FR-4** Canonical outcome mapping is identical to the cups adapter: agent unreachable / pre-submit
  transport fault → `failed`; post-submit ambiguity → `unknown`; render/validation failure caught before
  the adapter → `failure_domain=render_validation`, `result_status=failed`.
- **FR-5** A failed/uncertain/retried print **never** writes `promo_coupon` or any ledger row (GATE-DOM-1).
- **FR-6** Idempotent replay of the same key returns the prior outcome and emits no second copy; explicit
  reprint creates a new nonce-bearing instance sharing instrument identity with `reprint_of` lineage; an
  `unknown`-state reprint requires a duplicate-risk acknowledgement (GATE-DUP-1, DEC-008).
- **FR-7** The agent runs as a managed Windows Service: deterministic install, auto-start after reboot,
  supervised restart per the approved recovery policy, observable version (WS-W3).
- **FR-8** The agent binds `127.0.0.1` only; unauthorized local requests are rejected; caller↔agent
  protocol versions are checked and incompatible versions fail closed (WS-W3, NFR D1/D3/D4).
- **FR-9** Install and update artifacts are signed; rollback disables the agent path with **no** automatic
  browser printing (WS-W4, D4/D7).
- **FR-10** The `printer_target_id` is opaque and resolved to a Windows printer/queue **server-side at the
  agent** — never in the browser (WS-W7, D2).
- **FR-11** The `print_attempt` audit contract, lifecycle state machine, and write-via-RPC-only boundary
  on the Windows path are **contract-identical** to the Linux exemplar per the §5.4 parity definition
  (`audit_contract_identical`, INV-4, WS-W8). Platform diagnostics (Win32 codes, queue/driver names,
  agent version) MUST NOT enter the canonical contract.
- **FR-12** WS-W5 records an explicit device-completion-observability *evidence note*. PRD-093 ships the
  `submitted`-only ceiling and introduces no new lifecycle state regardless of the finding (INV-2/INV-6).
- **FR-13** `print()` produces exactly one controlled `print_attempt` lifecycle. The administrative
  `testPrint()` exercises the Windows adapter **directly and creates no `print_attempt` row** — preserving
  the PRD-092 administrative test-print contract (no issued instrument, no audit row) (INV-3).

### 5.2 Non-Functional Requirements

- **NFR-1 Contract OS-neutrality (GATE-PLATFORM-1):** no Windows/winspool/ESC-POS types/strings/IDs appear
  above the adapter/agent boundary; device machinery stays confined to the agent layer.
- **NFR-2 Adapter parity (GATE-PLATFORM-2):** `windows_spooler` + `cups` + `fake` pass the **same** contract
  suite and return the canonical result/failure vocabulary.
- **NFR-3 RLS / context (ADR-024):** `operator_id` + `casino_id` from authoritative session-var context;
  `print_attempt` casino-scoped (Pattern C); RPC-only writes — unchanged from PRD-092.
- **NFR-4 Security (GATE-SEC-1, certification-grade):** loopback-only bind survives Windows
  networking/firewall; no LAN/public listener; localhost request authentication; no device address or
  secret in the browser bundle. (Promoted from PRD-092's "minimal" to a certification item.)
- **NFR-5 Lint/boundary gate (TEMPLATE-2):** above the renderer/adapter/agent layer the boundary lint
  bans **implementation** leakage only — Windows API imports/types, winspool function names, printer-queue
  implementation identifiers, ESC/POS byte constants, and child-process/native-binding machinery. Canonical
  transport *vocabulary* (`submitted`, "spooler accepted") remains legal in contract docs, mappers, and tests.
- **NFR-6 Service availability:** the Windows Service auto-recovers from crash and reboot per the approved
  recovery policy without operator intervention; degraded/unreachable agent yields `failed`/`unknown`, never
  a silent success or browser fallback.
- **NFR-7 Supply-chain integrity:** the agent binary is signed and the approved update package or manifest
  integrity is cryptographically verified; no silent self-update, no side-loading. (This does not mandate a
  dedicated update-channel implementation — a verified package or manifest satisfies it.)

> Architecture details: See ADR-062 (controlled-path standard, D1–D8), ADR-063 (print-agent deployment /
> trust-boundary standard, D1–D7), and the PRD-092 Implementation Precis for the Phase-1 seams to reuse.

### 5.3 Completion-Observability Evidence Capture (WS-W5 — evidence only, no in-PRD vocabulary change)

The four-state vocabulary `requested | submitted | failed | unknown` is **frozen** for PRD-093 (INV-2).
`submitted ≠ physically printed`. WS-W5 is **not** an implementation workstream that may reopen the
lifecycle vocabulary, schema, DTOs, operator copy, or ADR authority inside this PRD. Its only deliverable
is a **bounded evidence note** recording whether the Windows RAW path exposes *genuine* device-completion
signals (not mere spooler acceptance).

**Disposition rule (INV-6):** PRD-093 ships with `requested|submitted|failed|unknown` and
`failure_domain=device` forbidden **regardless of the finding**. Any evidence suggesting genuine device
completion creates an **ADR/FIB candidate for a later slice** — it does not authorize a vocabulary, schema,
or copy change here. A future admission, if ever pursued, would require its own ADR-062 amendment
(`acknowledged` is explicitly excluded today), ADR-063 D6 amendment, and a re-run of the §7a
Terminology / Operator-Copy Gate. **Default: no completion claim, deferred to a successor slice.**

### 5.4 Audit Parity Definition (`contract-identical`, per INV-4)

`audit_contract_identical` is defined as — and is tested as — the following, **not** raw byte equality:

- **Schema:** identical `print_attempt` columns, constraints, state transitions, and RPC-only write boundary.
- **Vocabulary:** identical `result_status` values, identical `failure_domain` values, and an identical
  canonical `failure_code` set.
- **Behavior:** identical idempotency replay, identical reprint lineage, and identical terminal immutability.

**Prohibited in the canonical `print_attempt` contract:** Win32 error codes, queue names, driver names,
agent version, or other service-local diagnostics. These MAY remain in **agent-local structured logs** only.
The term **"byte-identical" is not used** anywhere as an acceptance claim unless a named, serialized golden
fixture actually proves byte equality.

### 5.5 Printer-Offline / Custody Matrix (truthful-transport contract)

`submitted` reflects **spooler custody**, not paper. The Windows path maps offline/fault conditions as:

| Condition | Canonical outcome |
|-----------|-------------------|
| Definitive rejection **before** spooler acceptance | `failed` / `failure_domain=transport_submission` / `failure_code=spooler_rejected` |
| Spooler **accepts custody while the device is offline** | `submitted` — the spooler took the job; UI MUST NOT relabel this as printed (INV-2) |
| Ambiguous result **after** submission | `unknown` |

This matrix is the acceptance reference for the Gate W-C printer-offline case (§8).

## 6. UX / Flow Overview

**Flow 1: Controlled print on the Windows production workstation**
1. Operator issues or selects an already-issued loyalty instrument on the existing redemption surface →
   the existing manual **Print** action appears (manual-first, DEC-004).
2. Operator selects **Print** → the server creates/resolves the canonical `print_attempt`, builds the
   canonical `ReceiptDocument`, and submits the unchanged print request to the local Windows agent.
3. The Windows agent authenticates the sanctioned caller, resolves the opaque `printer_target_id`
   server-side, opens the printer via the **RAW** winspool path, and writes the ESC/POS byte payload.
4. The spooler accepts/rejects/ambiguously handles the submission → outcome maps only to
   `submitted | failed | unknown`; the bounded badge never claims physical print.

**Flow 2: Explicit reprint**
1. Operator performs an explicit **Reprint** when permitted → a new nonce-bearing instance is created with
   `reprint_of` lineage to the prior attempt.
2. If the prior result was `unknown`, the operator must acknowledge duplicate risk before the reprint proceeds.

**Flow 3: Service lifecycle & certification (administrator)**
1. Administrator installs the signed agent → registered as a Windows Service with approved startup,
   identity, version, recovery.
2. Workstation starts/reboots → the agent auto-starts, binds loopback only, reports a compatible protocol version.
3. Administrator reviews service/security evidence → loopback-only exposure, caller auth, recovery,
   version enforcement, and no browser-print fallback are proven.
4. Gate E2 is signed off against the real Windows host + named Epson printer → the production rollout block may be lifted.

## 7. Dependencies & Risks

### 7.1 Prerequisites (Phase-1 close-out — must clear before Phase 2 on a clean base)

- **PRD-092 committed:** the uncommitted WS1–WS9 work on branch `epson` is committed and anchored before
  Windows changes modify shared code (Handoff §5.4).
- **GATE-HW-2 disposition: ✅ CLOSED (retrospective evidence reconciliation).** The Phase-1 manual Linux
  real-device acceptance is **satisfied**; the open item was stale governance bookkeeping, not missing proof.
  It is closed here by reconciling the existing real-device evidence, and is additionally subsumed by the
  stronger Gate W-C / Gate E2 certification on the production OS + named device (FIB-H §J.5 resolved).
- **Stable inherited contracts:** canonical `ReceiptDocument`, renderer, `receipt_document_hash`, audit
  lifecycle, and idempotency model are stable; the ESC/POS construction seam is reusable across Linux and Windows.
- **Named hardware / host:** Epson TM-T88V (M244A); production host OS = Windows; loopback communication and
  local service installation permitted on the production workstation.
- **ADR-062 / ADR-063 frozen**; ADR-063 D1–D4/D7 **promoted** from "not blocking (Linux exemplar)" to
  mandatory certification items (enforcement promotion only — no D1–D7 decision relitigated).

### 7.2 Receipt-content disposition (NOT a PRD-093 in-build dependency)

PRD-093 certifies the **exact canonical `ReceiptDocument` delivered by PRD-092 — unchanged (INV-1).
No renderer redesign occurs in this slice.** Receipt content is therefore **not** a PRD-093 entry
dependency:

- **FIB DEP-3** (authoritative 80 mm legal layout / expiry / validation identifier) and **Vector C
  GAP-C5** (barcode/QR symbology + identifier) are **PRD-092 close-out obligations**, not Windows-
  certification work. If either requires a layout/symbology change, that change belongs in a **separate
  predecessor patch to the frozen canonical document**, after which Windows certifies the frozen result.
- PRD-093 MUST NOT become a hidden receipt-content or templating-completion slice. Any renderer change
  proposed under this PRD is a FIB-H §L expansion trigger (§7.4).

### 7.3 EXEC Delegation Register (FIB-H §J — implementation decisions)

Per FIB-H §J, the §J items are **implementation and architecture decisions**, not scope decisions — they
"must not expand the operator outcome or containment loop." This PRD is **EXEC-ready (status: Accepted)**:
the scope-bearing predecessor corrections are closed, GATE-HW-2 is reconciled, and the remaining items are
**delegated to domain experts at EXEC-093 time via the build pipeline**, gated within their respective
certification gate (W-A/W-B). They do not block PRD approval; each is recorded in the EXEC-093 decision
ledger before the corresponding gate closes.

| # | Decision | Disposition |
|---|----------|-------------|
| 1 | Exact Windows RAW implementation technology/binding used to call winspool | **Delegated → EXEC (Gate W-A domain expert)**; must prove `StartDocPrinter pDatatype="RAW"` |
| 2 | Windows Service account identity and printer-queue permission model | **Delegated → EXEC (Gate W-B domain expert)**; least-privilege justification recorded |
| 3 | Localhost request-authentication contract and credential-rotation strategy | **Delegated → EXEC (Gate W-B domain expert)**; satisfies §8 adversarial matrix |
| 4 | Signed installer / managed-update ownership (named certificate owner) | **Delegated → EXEC (Gate W-B domain expert)**; satisfies §8 supply-chain fields |
| 5 | GATE-HW-2 disposition | **✅ CLOSED** — retrospective evidence reconciliation (§7.1); subsumed by Gate W-C |
| 6 | Whether genuine device-completion observability exists | **Frozen default: no new state** (INV-2/INV-6); evidence-only (§5.3) |

Two predecessor-correction items are also **CLOSED** in this revision: **(7) ✅** test-print audit-contract
correction (INV-3, FR-13, §8); **(8) ✅** receipt-content disposition (§7.2 — certify the frozen PRD-092
document; no renderer redesign).

Decisions 1–4 MUST be recorded in the EXEC-093 decision ledger and satisfy their gate's evidence before that
gate closes; they MUST NOT expand the operator outcome or containment loop (any such drift is a FIB-H §L trigger).

### 7.4 Risks / open questions

- **Blank-output regression:** a generic-text / `Out-Printer` path risks the same blank-paper symptom
  defeated on CUPS — mitigated by the RAW-datatype mandate (FR-2) as a hard Gate W-A item.
- **OS-neutrality leakage:** any Windows/winspool type escaping the adapter boundary breaks parity and the
  inherited contract — mitigated by NFR-1/NFR-5/GATE-PLATFORM-1 as a hard DoD item.
- **Scope-expansion drift (FIB-H §L):** any downstream artifact proposing a new outcome, lifecycle state,
  failure domain, vendor/family, surface, browser fallback, batch/unattended printing, LAN/remote/cloud
  access, runtime adapter switching, or device-completion claims **requires a FIB-H amendment** — it is
  scope expansion, not implementation detail.

## 7a. Terminology / Operator-Copy Gate (inherited from PRD-092 §7a — NOT SRL)

```yaml
srl_required: false
reason: >
  Printing terms are local integration-contract vocabulary, not ambiguous
  cross-domain business semantics. Windows certification inherits the gate unchanged.
required_instead:
  - local glossary (unchanged from PRD-092)
  - operator copy review (Windows surface parity)
  - submitted_not_printed invariant
  - PrinterFault deferral
do_not_admit_now:        # not SRL-admitted unless WS-W5 amends ADR + re-gate
  - PrinterFault
  - ReceiptDocument
  - printed
  - acknowledged
  - completed
```

The six local lifecycle/action terms (`requested`, `submitted`, `failed`, `unknown`, `retry`, `reprint`)
carry their PRD-092 definitions **unchanged** and must remain consistent across DTOs, API responses, tests,
and Windows UI copy. **Deferral constraint (hard):** `PrinterFault`, `printed`, `acknowledged`, `completed`,
and `failure_domain=device` MUST NOT appear in DTOs, UI labels, or persisted schema on the Windows path.
WS-W5 may produce *evidence* that motivates a future ADR/FIB candidate, but it does **not** reopen this gate
inside PRD-093 (INV-6); any admission is a successor slice with its own ADR-062/063 amendment + §7a re-run.

## 8. Definition of Done (DoD) — Gate E2

Windows production certification is **Done** when:

**Functionality**
- [ ] Operator prints/reprints from the existing Windows redemption surface through the controlled path;
      the application-facing contract is unchanged; **0** `window.print()` calls on the loyalty surface.
- [ ] `print()` produces exactly one controlled `print_attempt` lifecycle with a terminal state on Windows (INV-3).
- [ ] `testPrint()` exercises the Windows adapter directly and creates **zero** `print_attempt` rows —
      PRD-092 administrative test-print contract preserved (INV-3, FR-13).
- [ ] Explicit reprint with `reprint_of` lineage works; `unknown`-state reprint requires duplicate-risk ack;
      no silent auto-retry; no automatic browser fallback (INV-5).

**Data & Integrity**
- [ ] No print outcome creates/mutates `promo_coupon` or any ledger row (GATE-DOM-1 re-asserted on Windows).
- [ ] Closed state machine enforced on Windows: `requested` → once → terminal; terminal immutable; reprint =
      new instance with shared instrument identity + distinct lineage (GATE-DUP-1).
- [ ] `print_attempt` audit contract is **contract-identical** to the Linux exemplar per the §5.4 parity
      definition (`audit_contract_identical`, INV-4); no Win32 code / queue / driver / version metadata in the
      canonical contract.

**Security & Access**
- [ ] Agent binds `127.0.0.1` only; no LAN/public listener present (verified on Windows networking/firewall).
- [ ] `printer_target_id` resolved server-side at the agent; no device address/secret in the browser bundle.
- [ ] Windows localhost security review complete (GATE-SEC-1, certification-grade).
- [ ] Adversarial request matrix — each case is rejected **before** any winspool submission and creates **no**
      duplicate physical job: missing auth · invalid auth · replayed authenticated request · expired
      timestamp/nonce · incompatible protocol version (fail-closed) · malformed `job_key` · unknown
      `printer_target_id`.

**Testing**
- [ ] **Adapter parity (GATE-PLATFORM-2):** `windows_spooler` + `cups` + `fake` pass one contract suite with
      canonical result/failure vocabulary.
- [ ] **Contract OS-neutrality (GATE-PLATFORM-1):** no Windows/winspool types/semantics above the
      adapter/agent boundary (lint/boundary check, TEMPLATE-2/NFR-5).
- [ ] **Test-print invariant test:** test-print emits **one** adapter submission and **zero** `print_attempt`
      rows (INV-3, FR-13).
- [ ] **Printer-offline matrix test (§5.5):** definitive pre-acceptance rejection → `failed`; spooler accepts
      custody while device offline → `submitted` (never relabeled printed); post-submission ambiguity → `unknown`.
- [ ] Phase-1 distinguishability matrix passes on Windows: first-print, printer-offline, retry/idempotent
      replay, explicit reprint, cut + layout.

**Operational Readiness**
- [ ] **Gate W-A — Windows RAW transport proof:** `windows_spooler` adapter opens the printer with RAW
      datatype, writes the canonical ESC/POS byte payload, mapping unchanged; a manually launched agent
      prints successfully on the real device.
- [ ] **Gate W-B — Windows Service production hardening:** deterministic install; auto-start after reboot;
      supervised restart per recovery policy; least-privilege service identity; loopback-only bind;
      unauthorized requests rejected; version checked + fail-closed; rollback disables the agent path with no
      browser printing. **Supply-chain acceptance (each verified, not nominal):** `agent_binary_signature_verified`
      · `installer_signature_verified` · `update_manifest_or_package_integrity_verified` ·
      `signing_certificate_owner_named` · `expired_or_invalid_signature_fails_closed` ·
      `rollback_package_version_pinned`. **No self-update framework** is built unless the approved deployment
      mechanism explicitly requires one.
- [ ] **Gate W-C — Gate E2 certification:** real Windows host + real TM-T88V; first-print pass;
      printer-offline per the §5.5 custody matrix; retry/idempotent replay does not duplicate the first-print
      instance; explicit reprint correct lineage; unknown-state reprint duplicate-risk ack; receipt
      layout/encoding/feed/cut pass; reboot + service recovery pass; no LAN listener; localhost security review
      complete; `print_attempt` audit **contract-identical** (§5.4); **Gate E2 sign-off recorded before rollout.**
- [ ] Rollback path defined: disabling the agent path with **no** automatic `window.print()` fallback.

**Exemplar / Platform Proof (ADR-062 D8 anti-drift)**
- [ ] Exactly one production adapter realization added (`windows_spooler`) alongside `cups` + `fake`; no new
      vendor/framework; no runtime adapter hot-swap (one production adapter per deployment).
- [ ] Production rollout block (`WINDOWS_CERTIFICATION_REQUIRED`) is liftable **only** after all Gate E2
      evidence is complete and signed; Linux/CUPS is not shipped to production.

**Governance**
- [ ] **Terminology / Operator-Copy Gate** (§7a) re-passed on the Windows surface: six local terms consistent
      across DTOs, API responses, tests, and UI copy; operator-copy review complete.
- [ ] **`submitted` ≠ printed** invariant holds in copy and contract — no Windows UI label or DTO implies
      physical print completion.
- [ ] **`PrinterFault` / `printed` / `acknowledged` / `completed` / `failure_domain=device` absent** from
      DTOs, UI labels, and persisted schema (INV-2 — no in-PRD admission path).
- [ ] **WS-W5 device-completion evidence note recorded** — PRD-093 ships `submitted`-only regardless; any
      positive evidence is filed as an ADR/FIB candidate for a successor slice, **not** admitted here (INV-6).
- [ ] ADR-058 classification section present and matches FEATURE_BOUNDARY (CLS-007 + CLS-003).
- [ ] No FIB-H §L expansion trigger crossed without a FIB-H amendment.

**Documentation**
- [ ] Certified that the **frozen PRD-092 canonical `ReceiptDocument` is unchanged** — no renderer redesign
      in PRD-093 (INV-1, §7.2); any DEP-3 / GAP-C5 content change is handled as a PRD-092 predecessor patch.
- [ ] Known limitations documented (submitted-only ceiling, no in-PRD reopening; one production adapter per
      deployment; no browser fallback).

## 9. Feature Classification & Transport Selection (ADR-058 — mandatory)

```yaml
primary_classification: external_integration        # CLS-007 — hardware integration (Windows realization)
secondary_classifications: [authoring]              # CLS-003 — writes print_attempt
authors_domain_fact: true                           # print_attempt lifecycle row (audit-identical to PRD-092)
emits_projection_input: false                       # no proven async consumer (print-health dashboards deferred)
requires_transactional_outbox: false                # finance_outbox MUST NOT carry print events
consumes_outbox_events: false
renders_derived_value_surface: false                # renders existing instrument representation; no financial authority value
selected_transport: external_integration            # resolved: managed_local_agent -> windows_spooler (RAW winspool)
narrowest_valid_transport_justification: >
  CLS-007 has no default transport; PRD-092 resolved transport to a managed local agent fronting the OS
  spooler. PRD-093 realizes the same managed-local-agent transport on Windows via a windows_spooler adapter
  (RAW winspool ESC/POS passthrough). This is a platform realization below the established adapter boundary,
  not a new transport selection — ADR-062 owns transport; ADR-063 D1-D4/D7 are promoted to enforced
  certification items (scope guard: no transport reopening).
rejected_mechanisms:
  - mechanism: Out-Printer / generic-text driver
    reason: cannot emit byte-transparent RAW ESC/POS; risks the blank-output symptom seen on CUPS raster
  - mechanism: ePOS-direct (Option B)
    reason: hardware-foreclosed — UB-U05 hosts no ePOS-Print Service (ADR-062 amendment)
  - mechanism: browser window.print() fallback
    reason: bypasses the controlled audit path; creates an ungoverned duplicate/provenance path (FIB-H §G)
  - mechanism: transactional outbox
    reason: no projection/replay consumer; adjacency to loyalty is not dependency
fib_amendment_required: false                       # FIB-H-POS-LOYALTY-PRINTING-WINDOWS-001 already scopes Windows certification
```

## 10. Related Documents

- **FIB-H (scope authority)** — `docs/00-vision/epson/prd-093/FIB-H-POS-LOYALTY-PRINTING-WINDOWS-001.md`
- **Phase-2 Handoff (workstream backlog WS-W1..WS-W8)** — `docs/00-vision/epson/PRD-WINDOWS-CERTIFICATION-HANDOFF.md`
- **PRD-092 (Phase-1 PRD)** — `docs/10-prd/PRD-092-loyalty-printing-linux-exemplar.md`
- **PRD-092 Implementation Precis (Phase-1 seams to reuse)** — `docs/00-vision/epson/PRD-092-IMPLEMENTATION-PRECIS.md`
- **EXEC-092 (Phase-1 exec spec)** — `docs/21-exec-spec/EXEC-092-loyalty-printing-linux-exemplar.md`
- **ADR-062** (controlled-path standard, D1–D8; D8 = two-phase sequencing + `WINDOWS_CERTIFICATION_REQUIRED`) — `docs/80-adrs/ADR-062-loyalty-instrument-printing-controlled-path.md`
- **ADR-063** (print-agent deployment / trust-boundary standard; D1–D4/D7 = the Phase-2 backbone) — `docs/80-adrs/ADR-063-loyalty-print-agent-deployment-standard.md`
- **ADR-045** (extends; `window.print()` retained off-surface) — `docs/80-adrs/ADR-045-pilot-reward-instrument-fulfillment.md`
- **Phase-1 seams** — `services/loyalty/printing/agent/loopback-agent.ts` (`CupsSpooler` interface, `createEscPosCommandSpooler`, RAW passthrough), `services/loyalty/printing/adapters/cups-adapter.ts` (outcome-mapping pattern to replicate)
- **Feature Boundary** — `docs/20-architecture/specs/loyalty-printing/FEATURE_BOUNDARY.md`
- **Classification standard (ADR-058)** — `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml`
- **Epson capability reference** — `docs/00-vision/epson/EPSON-EPOS-ESCPOS-CAPABILITY-REFERENCE.md`

---

## Appendix A: Workstream Backlog (from Phase-2 Handoff §2 — maps to gates)

| WS | Title | Gate | Requirements |
|----|-------|------|--------------|
| **WS-W1** | `windows_spooler` adapter (RAW ESC/POS passthrough) | W-A | FR-1, FR-3, FR-4, NFR-1/2 |
| **WS-W2** | Windows RAW print path (winspool/GDI) | W-A | FR-2 |
| **WS-W3** | Agent Windows-Service lifecycle (ADR-063 D1–D4) | W-B | FR-7, FR-8 |
| **WS-W4** | Update / signing / trust-boundary hardening (D4/D7/D1) | W-B | FR-9, NFR-7 |
| **WS-W5** | Completion-observability **evidence capture** (no in-PRD vocabulary change) | — | FR-12, §5.3, INV-6 |
| **WS-W6** | Gate E2 certification harness (real host + real device) | W-C | G5, DoD Gate W-C |
| **WS-W7** | Security posture (Windows localhost) | W-B/W-C | FR-10, NFR-4 |
| **WS-W8** | Regression parity with the Linux exemplar | W-C | FR-5, FR-6, FR-11, NFR-2 |

## Appendix B: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-06-22 | PRD Writer (from FIB-H + Phase-2 Handoff) | Initial draft — Windows production certification (Gate E2) bounded slice; inherits PRD-092 contracts unchanged |
| 0.2 | 2026-06-22 | PRD Writer (audit remediation) | Applied audit PATCH_REQUIRED P1-1…P1-4 + P2-1…P2-5 + P3-1: added §1a normative invariant block (INV-1…6); corrected `testPrint()` to adapter-direct / zero `print_attempt` (FR-13, INV-3); re-scoped WS-W5 to evidence-only (no in-PRD vocabulary change, INV-6); defined §5.4 `contract-identical` audit parity (dropped "byte-identical"); added §5.5 printer-offline custody matrix; removed DEP-3/GAP-C5 as PRD-093 entry deps (§7.2, certify frozen doc); re-scoped §J decisions as a PRD approval gate (status stays Draft until D1–D5 + test-print + content disposition resolved); added supply-chain signing acceptance fields and adversarial-request matrix; narrowed NFR-5 boundary lint to implementation leakage only |
| 0.3 | 2026-06-22 | PRD Writer (audit close-out) | CONDITIONAL_PASS close-out: OBS-1 (marked §7.3 items 7–8 CLOSED), OBS-2 (normalized NFR-7 to "approved update package or manifest integrity verified"); **GATE-HW-2 closed via retrospective evidence reconciliation** (§7.1/§7.3 D5 — stale governance, not missing proof; subsumed by Gate W-C); re-scoped §7.3 from approval-blocker to **EXEC Delegation Register** — D1–D4 delegated to domain experts at EXEC-093 time per FIB-H §J (implementation decisions, recorded in the EXEC-093 decision ledger before their gate closes); **status Draft → Accepted (EXEC-ready)** |
