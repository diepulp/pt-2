#!/usr/bin/env bash
#
# DEV-ONLY launcher for the loyalty-printing loopback agent (PRD-092 Phase 1).
#
# Starts the committed loopback print agent in ESC/POS raw mode so the Linux
# exemplar physically prints on the Epson TM-T88V (plain-text `cups` mode goes
# through the raster driver and yields a BLANK slice — see the run notes in
# e2e/loyalty-printing/README.md).
#
# This is a developer-ergonomics wrapper around the EXISTING agent — it is NOT
# the production agent lifecycle. The canonical install/auto-start/update/
# hardening work is ADR-063 D1–D4/D7, deferred to the Windows certification PRD
# (Gate E2). Do not treat this script as a production deployment.
#
# Env overrides (all optional; defaults shown):
#   LOYALTY_PRINT_SPOOLER   escpos      (escpos = raw ESC/POS; cups = plain text)
#   LOYALTY_PRINT_AGENT_PORT 9787
#   LOYALTY_PRINT_TARGET_ID  loopback-cups
#   LOYALTY_PRINT_CUPS_QUEUE TM-T88V
#
set -euo pipefail

# Resolve repo root from this script's location (scripts/ -> repo root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load nvm if present so node/npx resolve under `systemd --user` (minimal env).
export NVM_DIR="${NVM_DIR:-${HOME}/.nvm}"
# shellcheck disable=SC1091
[ -s "${NVM_DIR}/nvm.sh" ] && . "${NVM_DIR}/nvm.sh" >/dev/null 2>&1 || true

export LOYALTY_PRINT_SPOOLER="${LOYALTY_PRINT_SPOOLER:-escpos}"
export LOYALTY_PRINT_AGENT_PORT="${LOYALTY_PRINT_AGENT_PORT:-9787}"
export LOYALTY_PRINT_TARGET_ID="${LOYALTY_PRINT_TARGET_ID:-loopback-cups}"
export LOYALTY_PRINT_CUPS_QUEUE="${LOYALTY_PRINT_CUPS_QUEUE:-TM-T88V}"

cd "${REPO_ROOT}"
echo "[loyalty-print-agent.sh] spooler=${LOYALTY_PRINT_SPOOLER} port=${LOYALTY_PRINT_AGENT_PORT} queue=${LOYALTY_PRINT_CUPS_QUEUE}"
exec npx tsx e2e/loyalty-printing/support/loopback-print-agent-server.ts
