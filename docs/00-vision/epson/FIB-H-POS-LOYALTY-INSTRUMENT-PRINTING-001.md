# FIB-H — POS Loyalty Instrument Printing

**Status:** Proposed — human review required before freeze  
**Artifact type:** Feature Intake Brief — Human Scope Authority  
**Feature ID:** FIB-H-POS-PRINT-001  
**Date opened:** 2026-06-17  
**Priority:** P0 — pilot operational dependency  
**Target decision horizon:** Pilot / pre-production  
**Owner:** Product / Operations  
**Named hardware:** Epson TM-T88V, regulatory/model marking M244A  
**Current mechanism:** Browser-native `window.print()`

> **Scope note:** This brief freezes the operator outcome and rollout boundary. It does not select the printer transport. The exact installed interface must be inventoried before the scaffold chooses direct Epson ePOS, an OS-driver path, or a local print agent.

---

## A. Feature identity

**Feature name:** POS Loyalty Instrument Printing  
**Feature ID / shorthand:** FIB-H-POS-PRINT-001  
**Related wedge / phase / slice:** Pilot hardening / loyalty instrument delivery  
**Requester / owner:** Product / Operations  
**Priority:** P0  
**Target decision horizon:** The pilot must have predictable, operator-controlled printing before match plays or other redeemable loyalty instruments are used in live operations.

---

## B. Operator problem statement

A pit or loyalty operator must be able to issue a match play or other approved loyalty instrument from its normal workflow and receive one correctly formatted physical instrument at the designated receipt printer. The current `window.print()` path opens a generic browser print flow, depends on page-level print styling and workstation defaults, and cannot provide dependable printer targeting, cut behavior, device status, or a trustworthy distinction between a failed print and a duplicate issuance.

---

## C. Pilot-fit / current-slice justification

Physical loyalty instruments are part of the operator-to-patron fulfillment loop. Without a controlled POS-printer path, staff must navigate a browser dialog, select a device manually, and infer whether output succeeded. That is too fragile for a redeemable instrument: a missed print delays service, while an uncontrolled retry can create a second physical copy. This slice is required before the workflow is treated as production-ready.

---

## D. Primary actor and operator moment

**Primary actor:** Pit boss, floor supervisor, or authorized loyalty operator  
**Secondary actor:** Property administrator configuring the designated printer  
**When does this happen?** Immediately after an approved instrument is created or selected for issuance; later, during an explicitly authorized reprint  
**Primary surface:** Existing match-play / loyalty-instrument issuance surface  
**Trigger event:** Operator chooses **Print** for a specific existing instrument  
**Physical destination:** One configured Epson TM-T88V-class receipt printer at the operator station or designated property location

---

## E. Feature Containment Loop

1. Authorized operator opens an existing eligible loyalty instrument → system shows the instrument’s printable state and the designated printer status.
2. Operator selects **Print** → system submits a print request for that exact instrument without opening the browser’s generic print dialog.
3. System validates that the target printer configuration and required instrument payload are available → invalid or unavailable conditions fail closed before claiming success.
4. Printer produces the approved narrow-paper layout → output contains the required instrument identity, patron-facing terms, validation data, and no unrelated page chrome.
5. Printer completes feed and cut behavior → system reports a bounded outcome such as submitted, completed/acknowledged, or failed/unknown according to the selected transport’s actual capabilities.
6. Operator sees a failed or uncertain outcome → system offers a deliberate retry/reprint action rather than silently issuing another instrument.
7. Operator initiates a reprint → system preserves the same instrument identity, records the reprint attempt, and makes the duplicate-copy posture visible according to downstream policy.
8. Administrator changes or verifies the station’s printer configuration → system can run a non-redeemable test print without creating a loyalty instrument.

---

## F. Required outcomes

- Printing no longer depends on `window.print()` or a browser print dialog for the named workflow.
- The application targets the configured printer rather than whichever printer the browser or operating system last used.
- The printed layout is purpose-built for 80 mm thermal receipt media and includes only approved instrument content.
- Printing an existing instrument does not create, mutate, authorize, redeem, or financially reclassify that instrument.
- A print attempt has a durable correlation to the instrument, operator, property, workstation/printer target, timestamp, and result posture.
- Retry and reprint are explicit actions; an uncertain transport result is never presented as confirmed success.
- Printer unavailable, paper-out, cover-open, network/agent unavailable, and malformed-payload conditions fail visibly and do not create an additional instrument.
- A non-redeemable test print is available for installation and support validation.

---

## G. Explicit exclusions

- No redesign of match-play eligibility, approval, value calculation, expiration, redemption, voiding, or accounting rules.
- No new loyalty instrument types beyond those already approved by their owning feature.
- No receipt-printing platform for every document in the application.
- No kitchen, cage, report, table-inventory, or general office printing.
- No cloud print queue, fleet-management platform, remote internet printing, or generic printer abstraction spanning vendors.
- No automatic fallback to `window.print()` after the controlled path fails; fallback could hide an untracked duplicate.
- No silent auto-reprint, background retry that can produce an unexpected physical copy, or batch printing.
- No claim of guaranteed physical output when the chosen transport can prove only request acceptance.
- No raw printer credentials, unrestricted printer network access, or browser-delivered shared secrets.
- No assumption that every TM-T88V/M244A unit exposes ePOS; interface capability must be verified on the installed hardware.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Keep `window.print()` and improve CSS | Lowest code change | Still depends on a dialog, workstation defaults, and weak outcome/status semantics |
| Adopt Epson ePOS JavaScript immediately | Epson supports direct web printing on compatible ePOS-enabled devices | “TM-T88V” alone does not prove that the installed interface exposes ePOS; transport selection must follow hardware inventory |
| Install a generic local print agent for all printers | Could hide USB/network differences | Over-broad before the actual interface and pilot topology are known |
| Build a server-side cloud print queue | Centralized management sounds attractive | Adds remote-device routing, security, liveness, and duplicate-delivery complexity not required for one pilot printer |
| Reissue a new instrument when printing fails | Produces a fresh printable record | Conflates fulfillment failure with domain issuance and can create duplicate redeemable value |
| Automatically fall back to browser printing | Appears operationally resilient | Creates an uncorrelated second path and weakens duplicate/reprint controls |

---

## I. Dependencies and assumptions

- The existing workflow can identify one immutable instrument record before printing begins.
- Instrument content, value, eligibility, and redemption semantics remain owned by the existing loyalty/match-play domain; the printer path renders a representation only.
- The target workstation or local network can reach the selected printer transport without exposing the printer publicly.
- The exact installed printer interface is **not yet proven**. TM-T88V variants can use USB, serial, parallel, powered USB, Ethernet, Wi-Fi, or Bluetooth; direct web printing requires an ePOS-capable configuration rather than the model name alone.
- Epson documents JavaScript control from an HTML5 web application for ePOS-supported TM printers, while the UB-E04 Ethernet interface specifically adds ePOS Print Service support for web/cloud applications. The scaffold must verify the installed interface/firmware before selecting this route.
- Thermal stock dimensions, required logos, barcode/QR symbology, legal text, expiration presentation, and duplicate-copy marking must be supplied by the owning instrument specification or resolved before PRD approval.
- The selected mechanism must state what “success” means: request accepted, printer acknowledged, or physical completion. The UI and audit record must not promise a stronger state than the transport can observe.

---

## J. Out-of-scope but likely next

- Controlled rollout to additional stations/properties after the single-printer exemplar is certified.
- Redemption-side validation and duplicate-copy policy hardening, if not already governed by the loyalty instrument domain.
- Operational printer-health monitoring only after real pilot evidence shows that manual status checks are insufficient.

---

## K. Expansion trigger rule

Amend this brief before any downstream artifact introduces:

- another printer model/vendor or more than one printer per station;
- unattended, scheduled, batch, or remote printing;
- a new loyalty instrument type or a change to issuance/redemption authority;
- automatic retry or fallback capable of producing another physical copy;
- a generic cross-domain print service;
- a new top-level printer administration console;
- cloud-hosted device routing or external print-provider integration;
- printed PII beyond fields already approved for the instrument;
- a claim that print completion constitutes instrument issuance or redemption.

---

## L. Scope authority block

**Intake version:** v0  
**Frozen for downstream design:** No — requires human confirmation and hardware-interface inventory  
**Downstream expansion allowed without amendment:** No  
**Open questions allowed to remain unresolved at scaffold stage:**

1. What interface module is physically installed: USB, serial, Ethernet, UB-E04/ePOS-capable Ethernet, or TM-T88V-i/intelligent variant?
2. Is the application workstation-managed Windows hardware, a kiosk browser, tablet, or mixed fleet?
3. Must the printed instrument carry a barcode/QR code, and what existing validation identifier is authoritative?
4. What operator-visible distinction is required between first print, retry after known failure, and reprint after uncertain/confirmed output?
5. Which outcome can the selected transport truthfully observe and persist?

**Human approval / sign-off:** Pending

---

## M. Research context for downstream design

- Epson lists the TM-T88V with built-in USB plus configurable serial, parallel, powered USB, Ethernet, wireless, or Bluetooth connectivity. The installed interface therefore determines the feasible integration path.
- Epson’s ePOS SDK for JavaScript allows an HTML5 web application to control an ePOS-Print-supported TM printer directly and avoids installing a driver on each client device.
- Epson’s UB-E04 Ethernet interface provides ePOS Print Service support for web and cloud applications; its ePOS function must be enabled/configured.
- The base TM-T88V supports ESC/POS commands, but raw ESC/POS capability does not itself give a sandboxed browser permission to access USB, TCP sockets, or an OS print spooler.

### Transport decision gate for Scaffold/RFC

The scaffold must inventory the actual hardware before selecting one bounded mechanism:

| Installed topology | Candidate direction | Gate |
|---|---|---|
| TM-T88V-i or TM-T88V with confirmed ePOS-capable interface/firmware reachable on trusted LAN | Epson ePOS SDK / ePOS-Print | Prove browser/network security compatibility, printer status semantics, and device configuration |
| USB-attached conventional TM-T88V on managed workstation | Local print agent or managed OS-driver bridge | Prove installation/update ownership, localhost authentication, job idempotency, and failure reporting |
| Conventional Ethernet interface without ePOS service | Local/network print bridge using driver or ESC/POS | Prove that no browser-direct assumption is made and that raw port access remains outside the browser |

**No architecture choice is authorized by this FIB.** The chosen path belongs in the scaffold/RFC after the interface inventory gate.
