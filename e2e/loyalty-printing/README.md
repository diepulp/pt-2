# Loyalty Printing E2E (PRD-092 WS9)

Write-path happy path for the controlled loyalty-instrument print:

> operator session → `POST /api/v1/loyalty/printing` → `submitted` → `print_attempt` persisted.

`controlled-print-happy-path.spec.ts` is **E2E — Mode B (browser login)**. It logs in
as the seed operator (`pitboss@dev.local`, `admin`), creates a same-casino entitlement
coupon, drives the controlled Print action through the authenticated browser request
context, and asserts the persisted audit row.

## Why this needs a dedicated run recipe

The default `playwright.config.ts` force-loads `.env.local` with `override: true`, and
`.env.local` points at the **remote** project — which lacks the `print_attempt`
migration (→ `PGRST202`). A loyalty-printing write-path E2E therefore **must** run
against the **local** stack, with a live loopback print agent (the route fails closed
with `503` when `LOYALTY_PRINT_AGENT_URL` is unset — by design).

## Prerequisites

1. Local Supabase up with the print migrations applied:
   ```bash
   npx supabase start
   # 20260619145557_create_print_attempt + 20260619151717_create_print_attempt_write_rpcs
   ```
2. Loopback print-agent server running (real agent + simulated CUPS spooler):
   ```bash
   LOYALTY_PRINT_AGENT_PORT=9787 npx tsx \
     e2e/loyalty-printing/support/loopback-print-agent-server.ts
   ```
3. A dev server started with **local** Supabase env + the agent URL. Source the local
   stack env first so the dev server (and the Playwright process) point local, not remote:
   ```bash
   set -a; source <(npx supabase status -o env); set +a
   export NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
          NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
          SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
          LOYALTY_PRINT_AGENT_URL="http://127.0.0.1:9787" \
          LOYALTY_PRINT_TARGET_ID="loopback-cups"
   PORT=3100 npm run dev
   ```
4. Run the spec against the committed **local-pointed** config
   `playwright.loyalty-printing.config.ts` (it does not re-load the remote
   `.env.local`, so the local Supabase env exported above wins, and it points
   `baseURL` at `:3100`):
   ```bash
   # NEXT_PUBLIC_SUPABASE_URL etc. exported above keep the test's service client local.
   npx playwright test --config ./playwright.loyalty-printing.config.ts --reporter=list
   ```
   > The bare gate form `npx playwright test e2e/loyalty-printing/ --reporter=list`
   > uses the default (remote-pinned) config and will NOT work for this write-path
   > test — always use the dedicated config above.

## Full-template hardware run (GATE-HW-2, TM-T88V)

To print the **full template** (not the admin test slip) on the physical TM-T88V
from both UI surfaces (player-360 header + rating-slip modal), launch the agent
with the **ESC/POS raw** spooler. Plain text through the Epson raster driver
renders blank on the thermal head; the raw ESC/POS path (`lp -d <queue> -o raw`
with `ESC @` init + `GS V` cut) is what actually marks paper.

```bash
# Agent → real device via ESC/POS raw. Queue defaults to TM-T88V.
LOYALTY_PRINT_AGENT_PORT=9787 \
LOYALTY_PRINT_SPOOLER=escpos \
LOYALTY_PRINT_CUPS_QUEUE=TM-T88V \
  npx tsx e2e/loyalty-printing/support/loopback-print-agent-server.ts
```

Then start the dev server as in step 3 above (with `LOYALTY_PRINT_AGENT_URL` and
`LOYALTY_PRINT_TARGET_ID=loopback-cups`), open a player's **Player 360** header or
a **rating-slip modal**, issue a reward, and click **Print** in the result panel.
A `submitted` badge + a `print_attempt` row confirm the controlled path; the
operator confirms the physical slip (GATE-HW-2).

- **Cutoff fix:** the cups renderer now word-wraps every line to the column width
  (default 42; override per deployment) so nothing is clipped at the right edge.
- **Column width:** if the head clips or wraps too early, tune
  `createCupsRenderer({ columnWidth })`.

## Dev-only auto-start (optional)

A developer-ergonomics wrapper keeps the ESC/POS agent running without a manual
launch. This is NOT the production agent lifecycle — install/auto-start/update/
hardening is ADR-063 D1–D4/D7, deferred to the Windows certification PRD (Gate E2).

- **One-off / foreground:** `npm run print-agent` (runs `scripts/loyalty-print-agent.sh`
  in `escpos` mode; env-overridable).
- **Auto-start on login + restart on failure (`systemd --user`):**
  ```bash
  cp scripts/loyalty-print-agent.service ~/.config/systemd/user/
  systemctl --user daemon-reload
  systemctl --user enable --now loyalty-print-agent
  # status / logs / stop:
  systemctl --user status loyalty-print-agent
  journalctl --user -u loyalty-print-agent -f
  systemctl --user disable --now loyalty-print-agent
  ```
  Starts on graphical login by default; for start-before-login add
  `loginctl enable-linger "$USER"`. Paths in the unit assume the repo at
  `/home/diepulp/projects/pt-2` — adjust if your checkout differs.

## Status

E2E is **advisory** (QA-006) — not yet CI-wired, does not block merge. The manual
real-device acceptance (GATE-HW-2, TM-T88V on a Linux/CUPS rig) remains a separate
manual gate.
