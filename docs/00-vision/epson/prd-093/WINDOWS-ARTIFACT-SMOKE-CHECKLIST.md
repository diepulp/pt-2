# Windows-Artifact Loadability Smoke Checklist — PRD-093 (EXEC P2-5)

Proves the Windows artifact is **alive** before the hardware E2 session. Automatable on a Windows CI /
certification runner; run by hand if no runner. **Real printer output is NOT required here.**

**Runner/host:** ______  **Agent version:** ______  **Date:** ______

| Check | Command (illustrative) | Pass |
|-------|------------------------|------|
| native dependency installs | `npm ci` (Windows) | ▢ |
| native module builds | DEC-WIN-01 build command | ▢ |
| native module loads | `node -e "require('.../windows-spooler-native.js')"` | ▢ |
| service entry starts | `node .../agent-service-entry.js` (foreground) | ▢ |
| protocol health endpoint responds | `curl http://127.0.0.1:<port>/health` → 200 | ▢ |
| simulated non-print smoke completes | submit job with `PRINT_AGENT_SPOOLER=windows-simulated` | ▢ |

**Constraint:** real printer output stays manual (Gate W-A/W-C); this gate covers loadability only.
This repo has **no Windows runner**, so the `windows-artifact-smoke` gate is **conditional** — execute
when a runner is available, otherwise complete by hand before Phase 5.

**Sign-off:** ______ · date ______
