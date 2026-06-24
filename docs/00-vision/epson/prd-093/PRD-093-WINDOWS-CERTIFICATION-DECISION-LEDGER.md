# PRD-093 — Windows Certification Decision Ledger (DEC-WIN-01..04)

**EXEC Gate 0 artifact.** Resolve each decision, record rationale, obtain human approval. No implementation
workstream (WS_W2/W3/W4/W7) may begin until this is approved. **Gate-0 invariant:** these decisions may
instantiate the PRD contract but may NOT alter lifecycle vocabulary, audit schema, printer family, browser
fallback, or network scope (FIB-H §L).

**Status:** ☑ APPROVED — approver **Lead Architect (EXEC-093 GATE_0)** — date **2026-06-22**
— verdict **simplify_and_approve**

---

## Proportionality note (read first — defines the threat model these decisions target)

This feature wires **one locally-attached Epson TM-T88V receipt printer** through **one loopback agent** on a
**pilot workstation**, called by **one trusted operator surface**, with **no LAN exposure**. The decisions
below are scoped to *that* operational reality — not a fleet, remote-printing platform, or hostile
multi-tenant host.

**Explicitly NOT in this threat model:** an attacker who has fully compromised the Windows host. If the host
is owned, the attacker can already drive the printer, the service, the browser, and local files directly — a
miniature PKI, asymmetric capability tokens, replay watermarks, or dual-signature packaging would **not**
restore trust in a compromised endpoint, so they are not built. The earlier review iteration overfit this
threat model; this ledger corrects to proportionality.

**Controls kept (each addresses a real failure mode):** loopback-only listener · opaque `printerTargetId`
resolved locally at the agent · server-issued short-lived single-use job token · **durable `jobKey`
deduplication as the authoritative duplicate barrier** · RAW Winspool submission · Windows Service auto-start
+ restart-on-failure · signed versioned release package · manual Gate E2 physical verification · no browser
fallback.

**Mechanisms deliberately dropped as disproportionate:** Ed25519 capability tokens · nonce-LRU + persisted
replay-watermark machinery · dual independent signing systems · re-signing the third-party wrapper · elaborate
key-rotation · cross-restart replay analysis · native-helper phase-marker protocol. These remain defensible
for a **future** fleet / remote-print / multi-tenant expansion (a FIB-H §L expansion trigger), not this pilot.

---

## DEC-WIN-01 — RAW Winspool binding (helper executable)  → consumed by **WS_W2**

**Selection:** `bundled_native_helper_exe`.

| Field | Value |
|-------|-------|
| Binding | A **bundled native helper executable** (`winspool-print-helper.exe`) the agent spawns; the complete RAW ESC/POS byte payload is piped to its **stdin**, a small result is read from **stdout**. Mirrors the inherited `createEscPosCommandSpooler` (spawn `lp`, pipe ESC/POS bytes, read result) — a platform port below the adapter boundary, not a redesign (INV-1). |
| RAW path | `OpenPrinter` → `StartDocPrinter(pDatatype="RAW")` → `StartPagePrinter` → `WritePrinter` (loop until the full buffer is written) → `EndPagePrinter`/`EndDocPrinter`/`ClosePrinter`. Byte payload `ESC @` → text → feed → `GS V` cut. **Not** `Out-Printer`, **not** a generic/text driver (FR-2; defeats the blank-output symptom). |
| Trusted path | Spawned **only** by absolute, install-rooted path (`<installDir>\native\winspool-print-helper.exe`), explicit argv, **no shell, no `PATH` resolution**. The helper ships inside the signed package (DEC-WIN-04); a non-matching on-disk hash → refuse to spawn. |
| Timeout rule | Hard launch timeout (default **10 s**). On timeout the agent kills the child and **maps conservatively to `unknown`** — the job may already have reached the spooler, so success is never fabricated and failure is never asserted. (No phase-marker protocol — the conservative `unknown` is the whole rule.) |
| Partial write | `WritePrinter` loops until the full buffer is written; any short/failed write → abort the doc, guaranteed `ClosePrinter` cleanup, return `rejected`. A partial job is never reported accepted. |
| Error mapping | Through the **inherited `cups-adapter.ts` mappers (no fork)**: spooler accepted → `submitted`; spooler rejected → `failed`/`failure_domain=transport_submission`; spawn/exec failure → `failed` (`agent_unreachable`); post-launch timeout → `unknown`. Win32 codes / queue / driver names stay **agent-local** (INV-4), never in `print_attempt`. |
| Build / runtime surface | MSVC (`<winspool.h>`, links `winspool.lib`), x64, **static CRT (`/MT`)** → no VC++ redist; no Node-ABI coupling. `.vcxproj` under `services/loyalty/printing/agent/native/`. |

**Rejected:** `Out-Printer`/generic-text (blank-output risk); `node-ffi-napi` (fragile, unmaintained); in-process
N-API addon (Node-ABI coupling, no crash isolation, complicates signing).

---

## DEC-WIN-02 — Windows Service hosting & identity  → consumed by **WS_W3**

**Selection:** `WinSW_managed_Windows_Service`.

| Field | Value |
|-------|-------|
| Hosting mechanism (ONE) | **WinSW** — a single declarative-XML service wrapper, hosting `node.exe <agent>` as a Windows Service. (Not bare `sc.exe` — node isn't a valid SCM binary; not NSSM — registry-mutation config is less idempotent. A simple approved wrapper is acceptable; WinSW is the selected one.) |
| Dependency posture | WinSW is bundled at a **pinned version with its SHA-256 recorded in the package manifest** (DEC-WIN-04) and integrity-verified at provisioning. **No re-signing** — the pinned manifest hash is the trust anchor. |
| Listener / network scope | **Loopback `127.0.0.1` only** (D1) — no LAN/public listener, ever. |
| Startup | **Automatic**, `DependOnService=Spooler` (start after the Windows Print Spooler). |
| Recovery | Restart-on-failure (1st @5 s, 2nd @10 s, subsequent @30 s; reset after 1 day) — auto-recovers from crash/reboot without operator action (NFR-6). |
| Identity (least-privilege) | Dedicated per-service **virtual account `NT SERVICE\d3lt-print-agent`** (no password). Deny interactive logon; not Administrator; **not LocalSystem**. |
| Queue permissions | `Print` permission on the **`EPSON TM-T88V` queue only**; no Manage-Printers/Documents/admin. Read config dir, write log dir — nothing else. |
| Install / uninstall | Declarative + **idempotent**: `install` re-run-safe (in-place reconfigure), `uninstall` stops + removes cleanly; WS_W9 orchestrates `stop→uninstall→install` for upgrades. |
| Logs | Agent + Win32/native diagnostics to ACL'd rolling files under `C:\ProgramData\d3lt\print-agent\logs\`; service lifecycle events to the Windows Event Log. |

---

## DEC-WIN-03 — Localhost authorization (short-lived single-use job token)  → consumed by **WS_W3** (impl) + **WS_W7** (rls-expert review)

**Selection:** `short_lived_single_use_job_token`. **Authoritative duplicate barrier:** `durable_jobKey_deduplication`.

The agent binds `127.0.0.1` only and is reached by the operator's browser via localhost (D1). The browser
holds **no secret** (D2). Authorization is a **short-lived, server-issued, single-use job token** — not a
cryptographic capability protocol.

| Field | Value |
|-------|-------|
| Token | The server-side controlled-path process (owner of the `print_attempt` write) issues a **short-lived, high-entropy random token** when the operator initiates a print, **bound to `jobKey` + `printerTargetId`**, with a short expiry. |
| Agent handling | The agent **stores the token briefly, accepts it once (single-use), and consumes it** on submission. A request with a missing / expired / already-consumed / mismatched token is **rejected before any spooler submission** (no spool, no paper). |
| Duplicate barrier | **Durable `jobKey` deduplication is the authoritative duplicate barrier** (inherited ADR-062 D2 / ADR-063 D5, unchanged). Even if a token were re-presented, the durable `jobKey` dedup returns the prior outcome and emits **no** second physical copy. The token gates *authorization*; dedup gates *duplication*. |
| Opaque target | `printerTargetId` is opaque and resolved to the real Windows queue **only at the agent**, server-side (FR-10) — never in the browser bundle. |
| Protocol version | Caller↔agent protocol version is checked; **incompatible → fail-closed reject** (D4), mapped pre-spool. |
| Browser-bundle exclusion | ☑ no token-minting secret, device address, or `printerTargetId → queue` map ships in the client bundle; the browser relays only the ephemeral, job-bound, single-use token. |

Implemented in dedicated `request-auth.ts` + `request-auth-config.ts` + `protocol-version.ts` (not folded into
`loopback-agent.ts`, audit P1-3). **WS_W7's rls-expert review** confirms: token binding to `jobKey`/`printerTargetId`,
short expiry, single-use consumption, pre-spool rejection, loopback-only exposure, and dedup as the duplicate barrier.

---

## DEC-WIN-04 — Packaging / signing / update / rollback  → consumed by **WS_W4** (orchestrated by WS_W9)

**Selection:** `signed_versioned_ZIP_with_hash_manifest`.

| Field | Value |
|-------|-------|
| Packaging | **One signed, versioned ZIP** `d3lt-print-agent-<version>.zip` containing the Node agent bundle, the native helper (DEC-WIN-01), the pinned WinSW wrapper + XML (DEC-WIN-02), the PowerShell scripts/modules, and a **`manifest.json`** listing every file + its **SHA-256**, `package_version`, and `protocol_version`. |
| Integrity verification | **Single signing system, fail-closed:** the release package is signed; `verify-integrity.ts` verifies the package signature, then recomputes and compares **SHA-256 of every file against the manifest** (this is how the pinned WinSW + helper hashes are enforced). Any mismatch / missing / invalid signature → **abort**, agent not installed/started. No dual independent signing system. |
| Signing authority | **`<deployment-org code-signing authority>`** — real cert subject/owner recorded in `SUPPLY-CHAIN-ACCEPTANCE-TEMPLATE.md` on the certification host (PENDING-ON-CERT-HOST, WS_W4 manual). |
| Update model | **Manual managed update** — operator fetches the new signed package and runs `Provision-PrintAgent.ps1` (verify → stop → swap → reinstall → restart). **No silent self-update, no auto-download, no side-loading.** A `protocol_version` bump forces callers to refuse an incompatible agent (D4). |
| Rollback | `rollback-agent.ps1` disables the agent path (controlled path → `failed`/`unknown`, manual-retry affordance) and restores the **pinned previous `package_version`** (hash-verified). **No automatic `window.print()` browser fallback** (INV-5, D7). |

---

## Approval

| Role | Name | Decision | Date |
|------|------|----------|------|
| Lead Architect (owner) | Lead Architect (EXEC-093 GATE_0) | ☑ approve — simplify_and_approve | 2026-06-22 |
| backend-service-builder (consult) | (DEC-01/02/03 bound to inherited seams) | concur | 2026-06-22 |
| rls-expert (security consult) | (mandatory reviewer at WS_W7 — DEC-03 token model) | review-at-WS_W7 | 2026-06-22 |
| devops-pt2 (consult) | (DEC-02/04 service mechanism + packaging) | concur | 2026-06-22 |

---

## Downstream consumption map (for executors)

| Decision | Feeds | What the executor must NOT re-decide / re-inflate |
|----------|-------|---------------------------------------------------|
| DEC-WIN-01 | WS_W2 (`windows-spooler-native.ts` + `native/` vcxproj) | helper-exe binding, RAW datatype, absolute-path spawn, timeout→`unknown`, dedup-via-inherited-mappers |
| DEC-WIN-02 | WS_W3 (`PrintAgentService.psm1`, service install) | WinSW (pinned hash, **no re-sign**), virtual-account identity, loopback-only, recovery policy |
| DEC-WIN-03 | WS_W3 (`request-auth.ts`/`request-auth-config.ts`/`protocol-version.ts`), WS_W7 (rls-expert review) | short-lived single-use token bound to `jobKey`+`printerTargetId`, pre-spool rejection, **dedup is the duplicate barrier** — do **not** reintroduce asymmetric/PKI/replay-watermark machinery |
| DEC-WIN-04 | WS_W4 (`package-agent.ps1`, `verify-integrity.ts`, `rollback-agent.ps1`), WS_W9 (orchestration) | one signed ZIP + SHA-256 manifest (**single** signing system), no self-update, pinned rollback |

**Gate-0 invariant re-asserted:** no new lifecycle state, failure domain, printer family, browser fallback, or
network scope. Vocabulary remains `requested|submitted|failed|unknown`; `printed`/`acknowledged`/`completed`/
`PrinterFault`/`failure_domain=device` forbidden (INV-2/INV-6); listener loopback-only (D1). Re-inflating any
dropped mechanism, or crossing any invariant, is a FIB-H §L amendment — not an EXEC decision.
