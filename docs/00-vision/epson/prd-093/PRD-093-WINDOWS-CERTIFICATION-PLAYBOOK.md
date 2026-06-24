# PRD-093 — Windows Production Certification Playbook (human-executed)

**Audience:** the administrator certifying on the production Windows workstation + named Epson TM-T88V
(M244A).
**Posture:** the operator runs **two governed commands**, not dozens of manual steps. Everything
machine-verifiable is automated by `Provision-PrintAgent.ps1` and `Invoke-GateE2Certification.ps1`
(backed by the agent's loopback `/health` + `/diagnostics` endpoints). The human only **supplies
inputs** (account, cert, owner, policy) and **physically confirms** (receipt printed / legible /
cut / no duplicate) and signs off. Production rollout (`WINDOWS_CERTIFICATION_REQUIRED`, ADR-062 D8)
stays blocked until the Gate E2 evidence report is signed.

> **Scope guard (FIB-H §L).** Nothing here may add a print outcome, lifecycle state, failure domain,
> printer family, operator surface, browser fallback, batch/unattended printing, LAN/remote access, or
> device-completion claim. If a step seems to require any of those, STOP — it is scope expansion
> needing a FIB-H amendment.

---

## 0. Prerequisites & inputs you must gather first

| Need | Detail | How |
|------|--------|-----|
| Printer | Epson TM-T88V (M244A), USB `04b8:0202`, installed & connected | `Get-Printer` |
| Service account | **you choose** the least-privilege account | recorded in DEC-WIN-02 |
| Signing certificate | **you supply** from the named authority | `Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert` |
| Deployment owner | **you name** | recorded in decision ledger |
| Firewall + credential policy | **you approve** | recorded in DEC-WIN-03 |
| Signed agent package | from the build (`package-agent.ps1` output, signed on this host) | `d3lt-print-agent.zip` |
| Local admin | required for service install + firewall | `whoami /groups` |

**Phase 0 — resolve & approve the four decisions first** in
`PRD-093-WINDOWS-CERTIFICATION-DECISION-LEDGER.md` (DEC-WIN-01 binding · DEC-WIN-02 service mechanism
+ identity · DEC-WIN-03 auth/firewall policy · DEC-WIN-04 packaging/signing). The two scripts consume
these choices.
**Gate 0 sign-off:** ▢ ledger complete · ▢ approved · approver ______ · date ______

---

## A. Provision — one governed command

```powershell
.\Provision-PrintAgent.ps1 `
  -PrinterQueue   "EPSON TM-T88V" `
  -ServiceAccount ".\d3lt-print-agent" `
  -ConfigPath     "C:\ProgramData\d3lt\print-agent" `
  -PackagePath    ".\d3lt-print-agent.zip"
```

The script performs, in order, and records each in `provisioning-evidence-report.md` (+ `.json`),
written under `-ConfigPath`:

| # | Automated step | Pass criterion |
|---|----------------|----------------|
| 1 | Validate prerequisites | OS, Node, native deps, admin rights present |
| 2 | Verify package signature | Authenticode valid; signer == named authority; **fail-closed on tamper/expiry** |
| 3 | Install files | files land under `-ConfigPath` |
| 4 | Apply ACLs | least-privilege; `-ServiceAccount` has printer + config access only |
| 5 | Install Windows Service (DEC-WIN-02 mechanism) | service registered; StartType=Automatic |
| 6 | Configure startup + recovery | recovery policy matches approved policy |
| 7 | Generate config file | agent config written; opaque `printer_target_id` → queue mapping |
| 8 | Bind loopback | listener = `127.0.0.1` only |
| 9 | Validate printer queue | `-PrinterQueue` exists & reachable |
| 10 | Start service | service Running |
| 11 | Health + diagnostics probes | `/health` 200; `/diagnostics` reports compatible protocol version + native module loaded |
| 12 | Authentication checks | valid request accepted; missing/invalid rejected |
| 13 | **No LAN listener** | no `0.0.0.0`/host-IP bind; no inbound firewall allow on the agent port |
| 14 | Emit evidence report | `provisioning-evidence-report.json` + `.md` written under `-ConfigPath` with all results |

**If any automated step fails, the script stops and writes the failure to the report — do not
hand-patch around it.** Re-run after correcting the input/decision.

**Provisioning sign-off:** ▢ report shows all steps PASS · administrator ______ · date ______

> Re-runs are idempotent. To update, re-run `Provision-PrintAgent.ps1` with the new signed
> `-PackagePath` (verify → stop → swap → reinstall → restart). To roll back, run the dedicated
> `rollback-agent.ps1` (it restores the pinned previous `package_version`, hash-verified); rollback
> disables the agent path with **no** browser fallback (INV-5) — confirm no browser print dialog
> appears on the loyalty surface afterward.

---

## B. Certify — one governed command

```powershell
.\Invoke-GateE2Certification.ps1
```

**Automated (machine-verifiable) — the script runs and records these:**
- transport tests (controlled path → `submitted`/`failed`/`unknown` mapping)
- authentication tests + replay + expired-request rejection (each rejected **before** spooler
  submission, **no** duplicate job)
- reboot-survival verification (service auto-starts; re-probes health)
- package signature + installer integrity re-verification
- log collection
- Gate E2 evidence collection → `gate-e2-evidence-report.json` + `.md` (under `-ConfigPath`; distinct from the provisioning report)

**Paused for human physical confirmation (Y/N only) — you watch the printer and answer:**
```
Did exactly one receipt print?                 [Y/N]
Was the content legible?                        [Y/N]
Did the cutter operate correctly (feed + cut)? [Y/N]
Was any duplicate paper output emitted?        [Y/N]   (expected: N)
```
Each answer is written into the evidence report alongside the automated results.

**Distinguishability matrix** (the script drives the machine cases; you confirm the physical ones):

| # | Case | Expected | Auto/Human |
|---|------|----------|-----------|
| 1 | First print | `submitted`; one `print_attempt` row; paper marks | auto + Y/N |
| 2 | Offline — pre-acceptance rejection | `failed`/`transport_submission`/`spooler_rejected` | auto |
| 3 | Offline — spooler accepts custody (device offline) | `submitted` (NOT relabeled printed) | auto |
| 4 | Post-submission ambiguity | `unknown` | auto |
| 5 | Retry / idempotent replay | prior outcome; no 2nd copy; no dup row | auto + Y/N (no duplicate) |
| 6 | Explicit reprint | new nonce instance; `reprint_of` lineage | auto |
| 7 | `unknown`-state reprint | duplicate-risk ack required | auto |
| 8 | Layout / encoding / feed / cut | correct on paper | Y/N |
| 9 | Reboot + service recovery | agent up; prints again | auto + Y/N |
| 10 | `testPrint()` admin | adapter-direct; ZERO `print_attempt` rows (INV-3) | auto |
| 11 | No LAN listener | loopback only | auto |
| 12 | Audit contract-identical (§5.4) | schema/vocab/behavior == Linux; no Win32/queue/driver/version in canonical contract | auto |

**Gate E2 sign-off (lifts the rollout block):**
- ▢ evidence report shows all automated checks PASS
- ▢ all physical confirmations = expected (one receipt, legible, cut OK, no duplicate)
- Gate E2 certified by ______ · role ______ · date ______
- ▢ **`WINDOWS_CERTIFICATION_REQUIRED` may now be lifted** — where recorded: ______

---

## C. Human input & confirmation summary (the only manual surface)

**Supply before running:** service account · signing certificate · deployment owner · firewall +
credential policy approval · physically installed printer.
**Confirm during certification (Y/N):** one receipt emitted · legible · feed/cut correct · no duplicate.
**Sign:** Gate 0, provisioning, Gate E2.

Fill the supporting artifacts as you go: `SUPPLY-CHAIN-ACCEPTANCE.md` (from `-TEMPLATE`),
`LOCALHOST-SECURITY-REVIEW.md` (incl. mandatory rls-expert review), `WS-W5-...-EVIDENCE.md`
(default: deferred). The scripts auto-generate `provisioning-evidence-report.{json,md}` and
`gate-e2-evidence-report.{json,md}` (under `-ConfigPath`) for you.

---

## Rollout decision record

| Gate | Status | Artifact | Signed by | Date |
|------|--------|----------|-----------|------|
| Gate 0 — decisions | ▢ | DECISION-LEDGER.md | | |
| Provisioning | ▢ | provisioning-evidence-report.{json,md} (script-generated) | | |
| Supply chain | ▢ | SUPPLY-CHAIN-ACCEPTANCE.md | | |
| Localhost security | ▢ | LOCALHOST-SECURITY-REVIEW.md | | |
| Gate E2 | ▢ | gate-e2-evidence-report.{json,md} (script-generated) + GATE-E2-CERTIFICATION-CHECKLIST.md | | |
| Completion evidence | ▢ | WS-W5-...-EVIDENCE.md | | |

**Production rollout is authorized only when every row is signed and Gate E2 is certified.**

---

## GATE-HW-2 context (read before you start)

GATE-HW-2 (the PRD-092 Linux/CUPS real-device acceptance) is **closed by retrospective
manual-evidence reconciliation** — it **was performed manually**; only its governance record went
stale. See `GATE-HW-2-RECONCILIATION.md`. That establishes the Phase-1 *Linux* baseline only and is
**not** a substitute for Windows certification: **Gate E2 here is the authoritative real-device gate
for the Windows production host.** You do not repeat the Linux test.
