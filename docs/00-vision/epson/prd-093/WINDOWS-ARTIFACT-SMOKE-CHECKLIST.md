# Windows-Artifact Loadability Smoke Checklist — PRD-093 (EXEC P2-5)

Proves the Windows artifact is **alive** before the hardware E2 session. Automatable on a Windows CI /
certification runner; run by hand if no runner. **Real printer output is NOT required here.**

**Runner/host:** ______  **Agent version:** ______  **Date:** ______

| Check | Command (illustrative) | Pass |
|-------|------------------------|------|
| native dependency installs | `npm ci` (Windows) | ▢ |
| package produced (build halves) | `Invoke-PrintAgentRelease.ps1` (DEC-WIN-01 msbuild + esbuild bundle + pinned WinSW) | ▢ |
| bundled agent loads | `node -e "require('<stage>/agent-service-entry.js')"` (CJS bundle incl. native facade) | ▢ |
| service entry starts | `node <stage>/agent-service-entry.js` (foreground, with `PRINT_AGENT_CONFIG`) | ▢ |
| protocol health endpoint responds | `curl http://127.0.0.1:<port>/health` → 200 | ▢ |
| package integrity verifies | `node <stage>/verify-integrity.js <pkgDir>` → `OK …` | ▢ |

**Constraint:** real printer output stays manual (Gate W-A/W-C); this gate covers loadability only.
This repo has **no Windows runner**, so the `windows-artifact-smoke` gate is **conditional** — execute
when a runner is available, otherwise complete by hand before Phase 5.

> **Post-bundle note (step-1 build producer).** The agent now ships as TWO self-contained CJS
> bundles — `agent-service-entry.js` (the native `windows-spooler-native` facade is bundled *in*,
> not a separate file) and `verify-integrity.js`. Their **require-loadability + CJS shape is already
> proven on Linux CI** by `__tests__/scripts/print-agent/build-command-construction.test.ts`; the
> rows above re-confirm it on the Windows host against the real msbuild output + pinned WinSW.

**Sign-off:** ______ · date ______
