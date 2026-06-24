# Gate E2 Certification Checklist (Gate W-C) — PRD-093

**Run on:** real Windows production host + real Epson TM-T88V (M244A). Driven by playbook Phase 5.
**Authority:** passing this checklist + recording the sign-off is what lifts
`WINDOWS_CERTIFICATION_REQUIRED` (ADR-062 D8).

**Host:** ______  **Printer serial:** ______  **Agent version:** ______  **Date:** ______

## Distinguishability matrix (real device)

| # | Case | Expected canonical outcome | Pass | Evidence |
|---|------|----------------------------|------|----------|
| 1 | First print | `submitted`; paper marks; one `print_attempt` row | ▢ | |
| 2 | Offline — pre-acceptance rejection | `failed`/`transport_submission`/`spooler_rejected` | ▢ | |
| 3 | Offline — spooler accepts custody (device offline) | `submitted` (NOT relabeled printed) | ▢ | |
| 4 | Post-submission ambiguity | `unknown` | ▢ | |
| 5 | Retry / idempotent replay | prior outcome; no 2nd copy; no dup row | ▢ | |
| 6 | Explicit reprint | new nonce instance; `reprint_of` lineage | ▢ | |
| 7 | `unknown`-state reprint | duplicate-risk ack required | ▢ | |
| 8 | Layout / encoding / feed / cut | correct on paper | ▢ | |
| 9 | Reboot + service recovery | agent up; prints again | ▢ | |
| 10 | `testPrint()` admin | adapter-direct; ZERO `print_attempt` rows (INV-3) | ▢ | |
| 11 | No LAN listener | loopback only | ▢ | |
| 12 | Audit contract-identical (§5.4) | schema/vocab/behavior == Linux; no Win32/queue/driver/version in canonical contract | ▢ | |

## Invariant re-confirmation
- ▢ `submitted` ≠ printed — no UI label/DTO implies physical completion
- ▢ `printed`/`acknowledged`/`completed`/`PrinterFault`/`failure_domain=device` absent from DTOs/UI/schema (INV-2)
- ▢ no automatic `window.print()` fallback on any path (INV-5)
- ▢ GATE-DOM-1: no print outcome created/mutated `promo_coupon` or any ledger row
- ▢ GATE-DUP-1: closed state machine; terminal immutable; reprint = new instance

## Sign-off
- Gate E2 certified by: ______  Role: ______  Date: ______
- ▢ `WINDOWS_CERTIFICATION_REQUIRED` lifted — where/how recorded: ______
- Receipts / photos / log excerpts attached: ______
