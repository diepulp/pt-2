# EXEC-093 — Automated Definition of Done Report (WS_DOD)

**PRD:** PRD-093 — POS Loyalty Instrument Printing, Windows Production Certification (Gate E2)
**Date:** 2026-06-24
**Runner:** Linux repository (no Windows runner) — codeable-vs-manual tiering applies.

This is the automated DoD convergence (audit P2-1): the full repo gate set proving the application
still type-checks, lints (boundary lint green), tests, and BUILDS after the WS_W1–W9 slice.

---

## Gate results (codeable scope)

| Gate | Command | Result |
|------|---------|--------|
| type-check | `npm run type-check` | ✅ PASS — 0 errors |
| lint | `npm run lint` | ✅ PASS — exit 0; **boundary lint green** (GATE-PLATFORM-1: Windows/winspool + CUPS device machinery banned above the adapter/agent boundary) |
| test (PRD-093 scope) | `npm run test` (printing + print-agent suites) | ✅ PASS — every PRD-093 suite green (see inventory) |
| build | `npm run build` | ✅ PASS — `✓ Compiled successfully` |
| Gate A — test fidelity | `check-test-fidelity.py` over touched `*.int.test.ts` | ✅ PASS — `detected: false` (no Supabase client-constructor mock; the int test genuinely hits the DB) |

### PRD-093 test inventory (all green)

| Suite | Lane | Tests |
|-------|------|-------|
| `printer-contract-parity.test.ts` (windows⇔cups⇔fake) | unit | 14 |
| `windows-localhost-security.test.ts` (WS_W7 adversarial matrix) | unit | 11 |
| `windows-distinguishability.test.ts` (WS_W6 §5.5 custody matrix) | unit | 7 |
| `windows-spooler-escpos.test.ts` (WS_W2) | unit | 13 |
| `agent-auth-version.test.ts` (WS_W3) | unit | — |
| `__tests__/scripts/print-agent/*` (WS_W4/W6/W9 command construction + integrity) | unit | 47 |
| `windows-audit-parity.int.test.ts` (WS_W8) | **integration (genuine real-DB run)** | 3 |

> The WS_W8 integration suite was executed against the live local Supabase stack with
> `RUN_INTEGRATION_TESTS=true` — **3/3 PASS** (audit-contract identity for `submitted` + `failed`,
> GATE-DOM-1 no-instrument-mutation, GATE-DUP-1 jobKey dedupe one physical spool). Not merely skipped.

---

## PowerShell parser status (audit P2-3 — per-status fields, NOT pass/fail)

| Field | Value |
|-------|-------|
| `powershell_parser_validated` | **false** |
| `powershell_parser_status` | **pending** |

**Reason:** `pwsh` is unavailable on the Linux pipeline runner. The six PowerShell deliverables
(`Provision-PrintAgent.ps1`, `Invoke-GateE2Certification.ps1`, `package-agent.ps1`,
`rollback-agent.ps1`, `PrintAgentService.psm1`, `PrintAgentEvidence.psm1`) have their **deterministic
command construction asserted pwsh-free** by the TS command-construction suites (all green). The
AST-level parser check runs when a Windows/pwsh runner is available.

**CERTIFICATION RULE (audit P2-3):** `windows_artifact_validated` **cannot** become true while
`powershell_parser_status` is `pending`. This deferred parser check therefore constrains the Windows
certification status **without blocking code-complete or artifacts-ready**.

---

## Completion states reached

| State | Reached | Notes |
|-------|---------|-------|
| `code_complete` | ✅ YES | type-check + lint + PRD-093 tests + build all green on Linux |
| `artifacts_ready` | ✅ YES | both governed commands + provisioning/certification tooling + checklists + templates produced |
| `windows_artifact_validated` | ⛔ PENDING | requires a Windows runner + `powershell_parser_status: passed` (WS_WIN_SMOKE, trailing conditional gate) |
| `production_certified` | ⛔ PENDING | requires real host + real TM-T88V + Gate E2 sign-off (lifts `WINDOWS_CERTIFICATION_REQUIRED`) |

---

## Honest gap disclosure (repo-wide test lane)

The repo-wide unit lane (`npm run test:ci`) reports **8 failing suites / 54 failing tests that are
OUTSIDE the PRD-093 changeset and pre-exist on `feat/epson-win`**:

```
components/player-360/__tests__/summary-band.test.tsx
components/player-360/__tests__/filter-tile.test.tsx
components/shift-dashboard-v3/__tests__/shift-dashboard-v3.test.tsx
components/shift-dashboard-v3/__tests__/floor-activity-radar.test.tsx
components/modals/rating-slip/__tests__/rating-slip-modal.test.tsx
components/loyalty/__tests__/issue-reward-drawer.test.tsx
hooks/dashboard/__tests__/http.test.ts
.eslint-rules/__tests__/no-raw-provider-message.test.js
```

None are in PRD-093 scope (printing / print-agent). The PRD-093 boundary-lint additions to
`eslint.config.mjs` are scoped to `services/loyalty/printing/**` and the loyalty UI/route surface and
cannot affect these suites (they are component/hook/rule unit tests that never load that config block).
**This slice neither introduced nor is responsible for these failures**; they are a pre-existing branch
condition, recorded here rather than silently absorbed.

---

## Verdict

**WS_DOD: PASS for the PRD-093 codeable scope.** `code_complete` + `artifacts_ready` reached on Linux.
`windows_artifact_validated` and `production_certified` remain the manual/off-platform gates
(WS_WIN_SMOKE + Gate E2), as designed. `WINDOWS_CERTIFICATION_REQUIRED` (ADR-062 D8) stays in place
until the real host records the manual evidence.
