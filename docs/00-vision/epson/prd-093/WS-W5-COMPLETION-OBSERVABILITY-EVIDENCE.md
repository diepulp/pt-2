# WS-W5 — Completion-Observability Evidence Note (evidence-only, INV-6) — PRD-093

> **Disposition (REQUIRED FIELD): `no completion claim, deferred.`**

**This note ships NO vocabulary, schema, DTO, copy, or ADR change** (INV-2/INV-6). It only records
whether the Windows RAW path exposed a **genuine** device-completion signal (not mere spooler
acceptance). PRD-093 ships `requested|submitted|failed|unknown` with `failure_domain=device`
**forbidden regardless of the finding**.

**Basis:** static analysis of the delivered Windows RAW path (WS_W2 `winspool-print-helper.exe` +
`windows-spooler-native.ts`) against the one-way winspool transport.
**Host:** code-complete analysis (Linux repo; real-host re-confirmation folded into Gate W-A/W-C).
**Date:** 2026-06-22  **Author:** Lead Architect (EXEC-093 WS_W5).

## Finding

| Question | Answer |
|----------|--------|
| Did the RAW winspool path expose any signal beyond "spooler accepted custody"? | **No.** The delivered path surfaces only `StartDocPrinter` job-id, complete-`WritePrinter`, and `EndDocPrinter` success — all **spooler-custody** signals. |
| If yes, what signal? (e.g. job-completion notification, status query, error feedback) | n/a — none. Win32 faults are mapped agent-local (INV-4); a drained queue is a spooler-transport "completed", which the inherited contract already collapses to `submitted`. |
| Is it a *genuine device-completion* signal, or still spooler-level? | **Spooler-level only.** A job id and a drained queue both still mean `submitted`, not paper produced. One-way RAW USB exposes no bidirectional device-completion channel the agent consumes. |
| Reproducible? | **Yes** — it is a structural property of the one-way RAW winspool transport, identical posture to the Linux/CUPS exemplar (`submitted ≠ printed`). |

> ePOS-direct / bidirectional device status was hardware-foreclosed (ADR-062 amendment; UB-U05 hosts
> no ePOS-Print Service) and is out of scope (§2.3 / FIB-H §G) — so even the theoretical stronger-signal
> path is absent on this host.

## Disposition (select one)

- ☑ **DEFAULT — no completion claim, deferred.** No genuine device-completion observability found.
  The `submitted`-only ceiling holds unchanged. Forbidden terms remain forbidden in DTOs, UI labels,
  and persisted schema: `printed` · `acknowledged` · `completed` · `PrinterFault` · `failure_domain=device`.

- ▢ **Positive evidence → ADR/FIB candidate for a SUCCESSOR slice.** A future admission would require
  its own ADR-062 amendment (four-state vocab is frozen; `acknowledged` excluded), ADR-063 D6
  amendment, and a re-run of the §7a Terminology / Operator-Copy Gate. **Not admitted in PRD-093.**
  Candidate filed at: _(none — finding is negative)_

**Recorded by:** Lead Architect (EXEC-093 WS_W5) · date 2026-06-22
