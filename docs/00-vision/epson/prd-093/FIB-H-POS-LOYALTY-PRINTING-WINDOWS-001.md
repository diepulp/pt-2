# FIB-H — Windows Production Certification for Loyalty Instrument Printing

**Status:** Proposed — pipeline intake  
**Artifact type:** Feature Intake Brief — Human Scope Authority  
**Feature ID:** FIB-H-POS-LOYALTY-PRINTING-WINDOWS-001  
**Feature name:** POS Loyalty Instrument Printing — Windows Production Certification  
**Related phase:** Phase 2 / Gate E2  
**Predecessor:** PRD-092 — Linux/CUPS exemplar  
**Proposed downstream PRD:** PRD-093  
**Priority:** P0  
**Target decision horizon:** Production certification before Windows rollout  
**Primary owner:** Product / Architecture  
**Date opened:** 2026-06-22  

> **One-line intent:** Certify the controlled loyalty-instrument printing path already proven on Linux for the intended Windows production host, without redesigning the printing architecture or weakening its audit, idempotency, security, or truthful-outcome contracts.

---

## A. Feature identity

**Feature name:**  
POS Loyalty Instrument Printing — Windows Production Certification

**Feature ID / shorthand:**  
FIB-H-POS-LOYALTY-PRINTING-WINDOWS-001

**Related wedge / phase / slice:**  
Phase 2 — Windows production certification / ADR-062 Gate E2

**Requester / owner:**  
Product / Architecture

**Date opened:**  
2026-06-22

**Priority:**  
P0

**Target decision horizon:**  
Pre-production. The Windows certification gate must pass before the controlled loyalty-printing path may be rolled out in the intended production environment.

---

## B. Operator problem statement

A pit boss or authorized operator must be able to print a loyalty instrument from the existing redemption workflow on the Windows production workstation with the same controlled, audited, duplicate-safe behavior already proven in the Linux exemplar. Without Windows certification, the feature cannot be trusted or released in the intended production environment, and the system remains dependent on a development-only platform path.

---

## C. Pilot-fit / current-slice justification

The loyalty-printing architecture is already implemented and proven through the Linux/CUPS exemplar, but production will run on Windows. This slice is required now because Linux must not become an accidental production assumption, and the production rollout remains blocked until the Windows adapter, Windows Service lifecycle, localhost security posture, and real-device path are certified. The slice closes the platform gap without reopening the domain model, audit lifecycle, receipt contract, or operator workflow.

---

## D. Primary actor and operator moment

**Primary actor:**  
Pit boss or administrator authorized to issue loyalty instruments

**Secondary operational actor:**  
System administrator responsible for installing and maintaining the local print agent

**When does this happen?**  
During loyalty reward redemption or controlled reprint on the production POS workstation

**Primary surface:**  
Existing loyalty redemption / issuance surface

**Trigger event:**  
The operator explicitly selects Print or Reprint for an already-issued loyalty instrument

---

## E. Feature Containment Loop

1. Administrator installs the approved print agent on the Windows production workstation → system registers it as a Windows Service with the approved startup, identity, version, and recovery configuration.
2. The Windows workstation starts or reboots → the print agent starts automatically, binds only to the loopback interface, and reports a compatible protocol version.
3. Operator issues or selects an existing loyalty instrument on the approved redemption surface → system presents the existing manual Print action.
4. Operator selects Print → the server creates or resolves the canonical `print_attempt`, builds the canonical `ReceiptDocument`, and submits the unchanged print request to the local Windows agent.
5. The Windows agent authenticates the sanctioned caller, resolves the opaque printer target server-side, opens the configured printer through the Windows RAW print path, and writes the ESC/POS byte payload.
6. The Windows spooler accepts, rejects, or ambiguously handles the submission → system maps the result only to the existing canonical lifecycle vocabulary: `submitted`, `failed`, or `unknown`.
7. Operator sees the bounded result on the existing surface → system does not claim that `submitted` means physically printed.
8. Operator performs an explicit Reprint when permitted → system creates a new nonce-bearing print instance, preserves lineage to the prior attempt, and requires duplicate-risk acknowledgement when the prior result was `unknown`.
9. Administrator reviews service and security evidence during certification → system proves loopback-only exposure, caller authentication, service recovery, compatible version enforcement, and no automatic browser-print fallback.
10. Gate E2 is signed off against the real Windows host and named Epson printer → production rollout block may be lifted.

---

## F. Required outcomes

- The existing loyalty-instrument printing contract operates on the intended Windows production host without changing the application-facing printer contract.
- The Windows agent submits the existing ESC/POS byte payload through a RAW Windows spooler path to the named Epson TM-T88V.
- The agent runs as a managed Windows Service with automatic startup, supervised restart, observable version, and an explicit update and rollback path.
- The agent accepts requests only from the sanctioned local caller and is not exposed to the LAN or public network.
- The Windows path produces the same canonical audit lifecycle, idempotency behavior, failure vocabulary, and reprint lineage as the Linux exemplar.
- Real-device certification proves first print, printer-offline handling, retry/replay behavior, explicit reprint, layout, feed, and cut behavior.
- Production rollout remains blocked until all Gate E2 evidence is complete and signed.

---

## G. Explicit exclusions

- No redesign of the `LoyaltyInstrumentPrinter<ReceiptDocument>` contract.
- No new loyalty instrument families.
- No new operator-facing printing surface.
- No generic or administrator-authored receipt template engine.
- No browser-native `window.print()` fallback for the controlled loyalty path.
- No unattended, scheduled, or batch printing.
- No multi-vendor printer framework.
- No fleet-management or cloud-print platform.
- No runtime hot-swap between multiple production adapters.
- No bidirectional ESC/POS or ePOS-direct integration.
- No claim that spooler acceptance proves physical paper output.
- No `printed`, `acknowledged`, or `completed` state unless genuine device-completion observability is proven and separately admitted through ADR and terminology governance.
- No `failure_domain = device` or `PrinterFault` vocabulary in this slice unless separately authorized after evidence.
- No changes to loyalty issuance, ledger authority, instrument value authority, or redemption semantics.
- No expansion of controlled printing to MTL reports, shift reports, or unrelated documents.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Rebuild printing around a Windows-specific application contract | Windows is the production OS | The Linux exemplar already established an OS-neutral contract; Windows is a drop-in platform realization, not a new feature architecture |
| Use `Out-Printer` or a generic-text driver | Simpler Windows implementation | These paths do not guarantee byte-transparent RAW ESC/POS delivery and may recreate blank-output behavior |
| Bundle transport proof, installer, updater, and service hardening into one undifferentiated step | All are required for production | Separating RAW transport proof from service hardening localizes failures and prevents packaging concerns from obscuring printer-path correctness |
| Add `printed` after the job disappears from the spooler | Appears closer to operator intent | Queue disappearance is not reliable proof that paper was physically printed |
| Add a browser-print fallback when the agent is unavailable | Preserves operator continuity | It bypasses the controlled audit path and creates an ungoverned duplicate and provenance path |
| Generalize the agent for all document printing | Reuse opportunity | Expands a bounded production-certification slice into a generic print platform |
| Add remote/LAN access to simplify support | Easier administration | Violates the localhost trust boundary and unnecessarily widens the attack surface |
| Introduce silent self-updates | Operational convenience | Conflicts with signed, managed, rollback-capable deployment control |

---

## I. Dependencies and assumptions

- PRD-092 Linux/CUPS exemplar implementation exists and remains the canonical predecessor.
- The Phase-1 implementation is committed and anchored before Windows changes modify shared code.
- The remaining Phase-1 real-device gate is either closed or explicitly superseded by a stronger documented Windows certification gate.
- The canonical `ReceiptDocument`, renderer, document hash, audit lifecycle, and idempotency model are stable.
- The ESC/POS command construction seam is reusable across Linux and Windows.
- The named production printer is Epson TM-T88V (M244A).
- The intended production host is Windows.
- A Windows service identity and printer-queue permission model can be established.
- A sanctioned server-side caller can authenticate to the local agent without exposing credentials to the browser.
- Signed installation and update artifacts can be produced for the production environment.
- The production workstation permits loopback communication and local service installation.
- The existing controlled printing path remains manual-first.

---

## J. Open decisions allowed before scaffold approval

The following decisions may remain open at intake but must be resolved before the PRD is approved:

1. Exact Windows RAW implementation technology and binding used to call Winspool.
2. Windows Service account identity and printer-queue permissions.
3. Local request-authentication mechanism and credential-rotation strategy.
4. Signed installer and managed-update ownership.
5. Whether Phase-1 GATE-HW-2 closes independently or is formally superseded.
6. Whether genuine device-completion observability exists. Default posture remains: no new lifecycle state.

These are implementation and architecture decisions. They must not expand the operator outcome or containment loop.

---

## K. Out-of-scope but likely next

- Production deployment runbook for installing the certified agent at the pilot property.
- Operational support procedure for agent version drift, printer replacement, and rollback.
- A separate feature intake for additional printer models or additional controlled document families, if required by pilot evidence.

---

## L. Expansion trigger rule

Amend this intake brief if any downstream artifact proposes:

- a new operator-visible print outcome;
- a new lifecycle state;
- a new failure domain;
- a new printer vendor or printer family;
- a new document or instrument family;
- a new operator surface;
- browser-native fallback;
- unattended or batch printing;
- LAN, remote, or cloud agent access;
- runtime adapter switching;
- a generic print-management platform;
- device-completion claims not represented in this containment loop;
- changes to loyalty value authority, issuance semantics, or audit ownership.

Any such addition is scope expansion, not implementation detail.

---

## M. Scope authority block

**Intake version:**  
v0

**Frozen for downstream design:**  
No — proposed for human approval

**Downstream expansion allowed without amendment:**  
No

**Open questions allowed at scaffold stage:**  
The six decisions listed in §J only

**Human approval / sign-off:**  
Pending

---

## N. Canonical inheritance contract

The Windows phase inherits the following contracts unchanged from the Linux exemplar:

```text
Application contract:
  LoyaltyInstrumentPrinter<ReceiptDocument>

Document path:
  FulfillmentPayload
    → ReceiptDocument
    → canonical hash
    → renderer
    → platform adapter

Audit lifecycle:
  requested
    → submitted | failed | unknown

Truthfulness:
  submitted != physically printed

Failure domains:
  render_validation
  transport_submission

Idempotency:
  HTTP edge
  + UNIQUE(casino_id, idempotency_key)
  + agent jobKey deduplication

Reprint:
  new nonce-bearing instance
  + reprint_of lineage
  + duplicate-risk acknowledgement after unknown

Security:
  server-authoritative audit
  + loopback agent
  + opaque printer_target_id
  + no browser-held secret

Platform boundary:
  no Windows, Winspool, CUPS, Epson, or ESC/POS types above the adapter/agent layer
```

Any downstream artifact that changes these inherited contracts must cite an explicit amendment or superseding decision. Windows certification alone does not authorize such changes.

---

## O. Certification gates

### Gate W-A — Windows RAW transport proof

Required evidence:

- `windows_spooler` adapter exists behind the unchanged printer contract.
- The agent opens the Windows printer with RAW datatype semantics.
- The agent writes the canonical ESC/POS byte payload directly.
- Canonical outcome mapping remains unchanged.
- Shared adapter contract tests pass for `fake`, `cups`, and `windows_spooler`.
- No Windows-specific types escape the platform boundary.
- A manually launched Windows agent prints successfully on the real device.

### Gate W-B — Windows Service production hardening

Required evidence:

- Service installs deterministically.
- Service starts automatically after reboot.
- Service restarts according to the approved recovery policy.
- Service identity has only the required printer and configuration permissions.
- Agent binds only to `127.0.0.1`.
- Unauthorized local requests are rejected.
- Caller and agent protocol versions are checked.
- Incompatible versions fail closed.
- Installation and update artifacts are signed.
- Rollback disables the agent path without invoking browser printing.

### Gate W-C — Gate E2 certification

Required evidence:

- Real Windows host and real Epson TM-T88V are used.
- First-print path passes.
- Printer-offline path produces the canonical bounded failure.
- Retry and idempotent replay do not duplicate the first-print instance.
- Explicit reprint creates a new instance with correct lineage.
- Unknown-state reprint requires duplicate-risk acknowledgement.
- Receipt layout, encoding, feed, and cut pass.
- Reboot and service recovery pass.
- No LAN listener is present.
- Localhost security review is complete.
- `print_attempt` audit contract is identical to the Linux exemplar.
- Gate E2 sign-off is recorded before rollout.

---

## P. Definition of feature completion

This feature is complete only when:

```text
windows_agent_exists
AND windows_spooler_adapter_exists
AND real_printer_test_passes
AND audit_contract_identical
AND localhost_security_review_complete
AND windows_service_lifecycle_certified
AND signed_install_update_path_exists
AND no_browser_fallback_exists
```

A successful ad hoc Windows print is not feature completion.

A passing simulated adapter suite is not feature completion.

A Windows Service that prints but weakens audit, idempotency, security, or outcome truthfulness is not feature completion.

---

## Q. Direction statement

The chosen direction is **production certification of the existing controlled path**, not platform-specific reinvention.

The Windows implementation must replace only the platform realization below the established adapter boundary. It must preserve the domain contract, canonical document, audit lifecycle, duplicate controls, operator workflow, and truthful outcome ceiling.

The governing rule is:

> Prove RAW Windows transport first, harden it as a managed local service second, and lift the production rollout block only after real-device Gate E2 certification.
