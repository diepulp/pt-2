---
id: ADR-063
title: Loyalty Print Agent — Deployment & Trust Boundary Standard
status: Accepted (Frozen)
date: 2026-06-18
deciders: [agent, product-owner]
affects: [LoyaltyService]
depends_on: ADR-062
classification: [CLS-007 external_integration]
references:
  - docs/80-adrs/ADR-062-loyalty-instrument-printing-controlled-path.md
  - docs/20-architecture/specs/loyalty-printing/SEC_NOTE.md
  - docs/20-architecture/specs/loyalty-printing/FEATURE_BOUNDARY.md
  - docs/00-vision/epson/FIB-ADDENDUM-POS-PRINT-OS-PORTABILITY-001.md
  - docs/00-vision/epson/FIB-S-POS-LOYALTY-INSTRUMENT-PRINTING-001.json
---

# ADR-063: Loyalty Print Agent — Deployment & Trust Boundary Standard

> **Decision-only document (Phase 4).** Scoped strictly to the **deployment and trust boundary**
> of the managed local print agent. Implementation (install scripts, port numbers, auth token
> format, code) is extracted by build-pipeline at EXEC/PRD time and is deliberately absent here.

## Scope guard (read first)

**Transport is already decided in ADR-062 and is NOT reopened here.** ADR-062 §Amendment fixed:
`managed local agent → OS print spooler → printer`, `submitted`-only observability, device faults
out of scope, production adapter `windows_spooler` (Linux/CUPS = dev only).

| In scope (this ADR) | Explicitly OUT of scope |
|---------------------|-------------------------|
| Localhost trust boundary | Transport re-evaluation (ADR-062 owns it) |
| Installation / update ownership | ESC/POS reconsideration |
| Localhost request authentication | Spooler reconsideration (one-way vs bidirectional) |
| Job idempotency enforcement at the agent | Printer feature expansion / fault-fidelity upgrades |
| Failure reporting from agent → caller | Adding `acknowledged`/completion states |
| Exposure prevention (no public/LAN listener) | Multi-printer fleet / cross-domain print platform |

Any pressure to revisit a right-column item is a **different ADR**, not an amendment to this one.

## Applicability & sequencing (ADR-062 D8)

This ADR's **enforcement is gated to the Windows production phase (ADR-062 D8 Phase 2)** — it is
**not blocking the Linux exemplar (Phase 1)**, where the goal is proving architecture, not certifying
a production deployment.

| | Phase 1 — Linux exemplar | Phase 2 — Windows certification |
|---|---|---|
| Goal | prove the feature/architecture | prove production deployment |
| ADR-063 status | **not blocking** (no production install) | **mandatory** (Gate E2 / `WINDOWS_CERTIFICATION_REQUIRED`) |
| Which decisions are exercised | **D5 idempotency + D6 failure reporting** only — they are part of proving the workflow/audit, so the exemplar agent must honor them | **all of D1–D7** — loopback bind, no-secret, localhost auth, install/update ownership, exposure prevention become certification items |

Rationale: D5/D6 are *contract* behaviors (duplicate-safety, truthful results) that must be proven
with the architecture in Phase 1. D1–D4/D7 are *deployment/trust-hardening* behaviors that only
acquire teeth once software is installed onto production workstations — Windows install ownership,
Windows localhost permissions, and floor-exposure prevention. Certifying them against the Linux
exemplar would prove the wrong platform. **Linux MUST NOT become a permanent production assumption
(ADR-062 D8 anti-drift rule): production rollout is blocked until Gate E2 passes.**

## Context

ADR-062 selected the managed-local-agent transport (Option A) after GATE-HW-1 confirmed a UB-U05
USB interface with no ePOS service, on a **Windows** production host. A localhost mediator between
the browser and the OS print spooler is therefore a **new trust boundary** that did not exist under
ADR-045's `window.print()` path. FIB-S flagged this as an `adr_candidate`; the addendum's
GATE-PLATFORM-3/4 require certification on the real Windows host. This ADR freezes the durable
deployment and trust-boundary decisions for that agent. It governs **how the agent is run and
trusted**, not **what it prints or over which transport**.

## Decision

### D1: Localhost-only listener — no public or LAN-reachable surface
The agent binds **loopback only** (`127.0.0.1`). It MUST NOT bind a routable/LAN interface, MUST NOT
be reachable from another host, and MUST NOT expose a public endpoint. The browser reaches it only
via localhost on the same workstation. (Closes SEC_NOTE T2; satisfies GATE-SEC-1 "no public device
endpoint".)

### D2: No browser-embedded shared secret
No device address, agent credential, or shared secret ships in the browser bundle. Any authentication
material is provisioned to the **workstation/agent**, not the client JavaScript. The browser presents
only an authenticated *operator* request (ADR-024 context); it never holds a static key that, if
extracted from the bundle, would let any reader drive the printer. (Closes SEC_NOTE T3.)

### D3: Localhost request authentication — caller must be the sanctioned surface
The agent authenticates inbound requests; an arbitrary local process or other-origin page MUST NOT be
able to drive printing. Authentication binds the request to the sanctioned loyalty surface/session
(mechanism is implementation detail — e.g. origin allow-list + a workstation-provisioned, rotat­able
local token). Unauthenticated/unrecognized callers are rejected. (Closes SEC_NOTE T2; GATE-SEC-1
"property-scoped target".)

### D4: Installation & update ownership is an operational responsibility, not ad-hoc
The agent is **managed software**: a named owner is responsible for installation, versioning, and
updates on each pilot workstation. Version is observable (the agent reports its version; recorded
where the print path can correlate it). Contract/protocol changes between caller and agent are
**versioned**; a caller MUST detect and refuse an incompatible agent rather than silently mis-printing.
No silent self-mutation; no unmanaged side-loading. (Satisfies the addendum's install/update-ownership
requirement.)

### D5: Job idempotency is enforced at the agent boundary
The agent honors the **idempotency key** carried on the print request (ADR-062 D2 lineage/idempotency):
re-delivery of the **same** key MUST NOT emit a second physical copy; it returns the prior outcome.
A **distinct** key (explicit reprint, per ADR-062's new-instance rule) is a new job. This is the
agent-side half of GATE-DUP-1 — duplicate-safety holds even across caller retries, network hiccups,
or agent restarts.

### D6: Failure reporting is explicit and maps to the canonical vocabulary
The agent returns an explicit outcome the caller maps onto ADR-062's four-state result + canonical
`failure` vocabulary. Spooler-accept → `submitted`. Submission rejected/unreachable agent → `failed`
or `unknown` per whether the caller can tell the job was not accepted. The agent **never fabricates a
success it did not get from the spooler**, and (pilot scope) reports **no** `failure_domain = device`
faults — consistent with ADR-062's `submitted`-only ceiling. Render/validation failures are caught
**before** the agent is called (they never reach it).

### D7: Rollback disables the agent path; no automatic browser fallback
Disabling the controlled path on the named surface (ADR-062 D4) also disables agent invocation.
A browser-print fallback on that surface is **never automatic** — it requires an explicit operational
decision. The agent failing/absent yields a `failed`/`unknown` result and a manual retry affordance;
it does NOT silently revert to `window.print()` (which would defeat duplicate-safety).

## Consequences

**Positive**
- The new trust boundary is explicitly governed: loopback-only, authenticated, no browser secret.
- Duplicate-safety is enforced at the last hop (the agent), not just the application layer.
- Update/version discipline prevents silent caller/agent drift on managed floor workstations.
- Truthful failure reporting is preserved end-to-end (no fabricated success).

**Negative / accepted**
- Each pilot workstation carries managed agent software with a named operational owner (real install/update cost).
- Certification must run on the actual Windows host (GATE-PLATFORM-3 / DEP-OS-3); dev success does not certify production.
- A Windows-specific agent realization is required; portability to another OS would be a new adapter + re-certification (expansion trigger, not pilot scope).

## Downstream obligations

- **Build/EXEC:** agent install/update runbook, loopback bind + auth mechanism, idempotency-key handling, version-handshake, and the Windows real-device certification (GATE-PLATFORM-3) are implementation/acceptance items — not decided here.
- **SEC:** this ADR is the durable home for SEC_NOTE threats T2/T3 and GATE-SEC-1; the SEC Note's conditional "localhost-agent trust boundary (Alt A)" rows are now unconditional and governed here.
