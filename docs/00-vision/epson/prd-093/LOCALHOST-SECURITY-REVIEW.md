# Localhost Security Review (GATE-SEC-1, certification-grade) — PRD-093

Driven by EXEC-093 WS_W7. The adversarial-matrix **logic** is proven in CI
(`__tests__/services/loyalty/printing/windows-localhost-security.test.ts` — 11/11 GREEN); this
review confirms it on the **live service + real Windows network/firewall**, and records the
**mandatory rls-expert review** sign-off (EXEC P2-4). The threat model is the DEC-WIN-03
proportionality scope: one locally-attached TM-T88V, one loopback agent, one trusted operator
surface, no LAN exposure. A fully-compromised host is explicitly out of scope (the ledger's
proportionality note).

**Host:** ______  **Agent port:** ______  **Date:** ______

---

## A. CI-proven security properties (automated — GREEN)

These hold by construction and are enforced by the WS_W7 suite. Each adversarial request is
rejected **before any spooler submission** (counting spooler `calls() === 0`) and emits **no
duplicate job**.

| Property | Mechanism | CI assertion |
|----------|-----------|--------------|
| missing auth rejected pre-spool | `verifyAndConsume` → `missing_token` | ✅ |
| invalid auth (unknown token) rejected pre-spool | `unknown_token` | ✅ |
| replayed authenticated request → no 2nd copy | single-use consume + durable `jobKey` dedup | ✅ |
| consumed token replay-rejected at authorizer | `replayed_token` | ✅ |
| expired token rejected pre-spool | lazy expiry on access (short TTL) | ✅ |
| incompatible protocol version → fail-closed | `isCompatibleProtocolVersion` exact-match | ✅ |
| malformed `job_key` rejected pre-spool | token binding mismatch | ✅ |
| unknown `printer_target_id` rejected pre-spool | token binding mismatch | ✅ |
| opaque `printerTargetId` resolved server-side (FR-10) | agent `queueMap`, never client | ✅ |
| loopback-only bind; non-loopback client refused (NFR-4) | `createHttpLoopbackAgentClient` guard | ✅ |

**Pre-spool guarantee:** auth is an additive authorization gate; the **durable `jobKey` dedup is
the authoritative duplicate barrier** (DEC-WIN-03). Even a re-presented token cannot mint a second
physical copy.

## B. Live-host exposure review (MANUAL — Gate W-B/W-C — PENDING)

| Check | Expected | Result |
|-------|----------|--------|
| Listener bind | `127.0.0.1` ONLY (no `0.0.0.0`/host-IP) | ▢ PENDING |
| `Get-NetTCPConnection`/`netstat` LocalAddress | loopback only | ▢ PENDING |
| Windows Firewall inbound rule for agent port | none allowing LAN/public | ▢ PENDING |
| `printer_target_id` resolution | server-side at agent only; never in browser | ▢ PENDING |
| Browser bundle scan | no device address / `printerTargetId→queue` map / token-minting secret | ▢ PENDING |
| Service identity | `NT SERVICE\d3lt-print-agent`, not LocalSystem/Administrator | ▢ PENDING |

## C. Credential storage review (MANUAL — PENDING)

| Check | Expected | Result |
|-------|----------|--------|
| Browser holds no secret | only the ephemeral, job-bound, single-use token relayed (D2) | ▢ PENDING |
| Loopback `/diagnostics` + `/authorize` credential | provisioned, not in client bundle | ▢ PENDING |
| Token entropy | 256-bit random (`randomBytes(32)`) | ✅ (code) / ▢ host-confirm |

---

## D. Mandatory security review (rls-expert) — EXEC P2-4

> Reviewer verdict recorded by the rls-expert skill dispatched at WS_W7. Verdict: **PASS on all five
> dimensions, no P0/P1** for the DEC-WIN-03 proportionality scope (one local TM-T88V, one loopback
> agent, one trusted operator, no LAN; fully-compromised host out of scope).

| Review dimension | Verdict | Reviewer note |
|------------------|---------|---------------|
| authentication envelope sound | ✅ PASS | 256-bit `randomBytes(32)` token bound to `(jobKey, printerTargetId)`; clamped short TTL (non-positive TTL falls back to default — cannot disable short-lived guarantee); single-use via `consumed` flag; `binding_mismatch` does NOT consume, preserving the token for the legitimate caller. |
| replay resistance adequate | ✅ PASS (w/ dependency) | dedup→auth→spooler ordering correct: a pure same-`jobKey` replay returns the prior outcome with no fresh token and no second spool; rejections are not cached (retryable, no DoS). See **OBS-1** — the agent `submitted` map is in-memory; the *durable* barrier is the inherited server-side `print_attempt`/`jobKey`. |
| credential storage acceptable (no browser exposure) | ✅ PASS | Browser relays only the ephemeral single-use token; `/authorize` + `/diagnostics` gated by server-side `serviceCredential`; `printerTargetId→queue` map + token minting are agent-side only; `/diagnostics` returns an exact-literal 6-field allow-list (no spread; bare 401). |
| listener exposure = loopback only | ✅ PASS | `server.listen(port, '127.0.0.1')`; `createHttpLoopbackAgentClient` refuses non-loopback baseUrl (LAN/`0.0.0.0`/hostname). Host firewall/netstat confirmation is the Gate W-B/W-C manual item (Section B). |
| pre-spool rejection guarantee holds | ✅ PASS | Every protocol/token rejection returns before `spooler.submit`; counting-spooler proves `calls()===0` for the full adversarial matrix; dedup guarantees no duplicate job. |

**Non-blocking observations (P2/P3) + recommended host-time confirmations:**
- **OBS-1 (P2):** The agent's `submitted` dedup map is process-memory, not durable across service restart. This is acceptable because the **authoritative durable barrier is the inherited server-side controlled path** (`print_attempt` row + `jobKey`, ADR-062 D2 / ADR-063 D5) — the agent performs no DB writes. *Manual confirmation (Gate W-C):* the server-side controlled path must not re-issue a token / re-initiate a print for a `jobKey` that already has a terminal `print_attempt`.
- **OBS-2 (P3):** `serviceCredential` is a static shared secret loaded from the config file. *Manual confirmation (Gate W-B):* the config dir (`C:\ProgramData\d3lt\print-agent`) is ACL'd to the `NT SERVICE\d3lt-print-agent` virtual account only.
- **OBS-3 (P3):** The client-side loopback guard also accepts `::1`, but the server binds `127.0.0.1` (IPv4) only. Harmless; *manual confirmation:* no IPv6 listener is present at the host netstat review (Section B).

**rls-expert reviewer:** rls-expert skill (WS_W7 mandatory reviewer) · **verdict:** PASS (no P0/P1) · **date:** 2026-06-24

## E. Sign-off

- CI security suite GREEN: ✅ (11/11)
- rls-expert review: ✅ PASS (Section D — no P0/P1; OBS-1/2/3 carried to host-time confirmations)
- Live-host exposure review (Gate W-B/W-C): ▢ PENDING (Sections B/C + OBS-1/2/3)
- Security review complete (codeable scope): ✅ 2026-06-24 · live-host scope PENDING on cert host
