# Windows-Artifact Loadability Smoke — RESULT — PRD-093 (WS_WIN_SMOKE)

**Status:** ⛔ **MANUAL-PENDING** (NOT pass) — this repository has **no Windows runner**.

WS_WIN_SMOKE is a **trailing conditional certification gate** (audit P1-1), not a build prerequisite.
It blocks ONLY `windows_artifact_validated`, `gate_w_c_certified`, and `production_rollout`. It does
**NOT** block `code_complete`, `artifacts_ready`, WS_W8, WS_W6, or WS_DOD — all of which were reached
on the Linux pipeline. This record exists so the conditional gate stays accounted for rather than
silently skipped.

**Runner/host:** _(none — no Windows runner in this repo)_  **Agent version:** 0.93.0  **Date:** 2026-06-24

## Machine-verifiable subset (to run on a Windows runner, or by hand per WINDOWS-ARTIFACT-SMOKE-CHECKLIST.md)

| Check | Command (illustrative) | Result |
|-------|------------------------|--------|
| native dependency installs | `npm ci` (Windows) | ⛔ PENDING — no runner |
| native module builds | DEC-WIN-01 `.vcxproj` build (`winspool-print-helper.exe`) | ⛔ PENDING — no runner |
| native module loads | `node -e "require('.../windows-spooler-native.js')"` | ⛔ PENDING — no runner |
| service entry starts | `node .../agent-service-entry.js` (foreground) | ⛔ PENDING — no runner |
| /health responds | `curl http://127.0.0.1:<port>/health` → 200 | ⛔ PENDING — no runner |
| /diagnostics responds (authenticated) | `curl -H x-agent-credential:… http://127.0.0.1:<port>/diagnostics` | ⛔ PENDING — no runner |
| simulated non-print smoke completes | submit job via simulated WindowsSpooler | ⛔ PENDING — no runner |

## What IS proven on Linux (so the smoke is loadability-only)

- ESC/POS byte assembly + simulated WindowsSpooler vocabulary — `windows-spooler-escpos.test.ts` ✅
- §5.5 distinguishability matrix over the simulated spooler — `windows-distinguishability.test.ts` ✅
- Provision/certification command construction (pwsh-free) — `*-command-construction.test.ts` ✅
- The native helper's REAL execution (`winspool-print-helper.exe`) is Gate W-A (manual, real host).

## Certification linkage

- `windows_artifact_validated` stays **false** until: (1) a Windows runner (or operator) executes the
  checks above AND (2) `powershell_parser_status` is `passed` (currently `pending` — see
  `EXEC-093-DOD-REPORT.md`). Both conditions are required (audit P2-3).

**Execution owner:** ______ · **runner/host:** ______ · **date:** ______
**Result on real runner:** ▢ PASS ▢ FAIL (attach logs)
