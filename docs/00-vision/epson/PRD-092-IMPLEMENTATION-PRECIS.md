# PRD-092 — Implementation Precis

**Status:** COMPLETE (automatable scope) — one manual hardware gate open
**Artifact type:** Implementation Precis — post-build synthesis
**Feature:** POS Loyalty Instrument Printing — Linux/CUPS exemplar
**PRD:** `docs/10-prd/PRD-092-loyalty-printing-linux-exemplar.md`
**EXEC-SPEC:** `docs/21-exec-spec/EXEC-092-loyalty-printing-linux-exemplar.md`
**Intake chain:** FIB-H-POS-LOYALTY-INSTRUMENT-PRINTING-001 → FIB-S (…001.json) → PRD-092 → EXEC-092
**Branch:** `epson` (work uncommitted)
**Build completed:** 2026-06-22
**Named hardware:** Epson TM-T88V (M244A) on UB-U05 USB (`04b8:0202`, CUPS queue `TM-T88V`)

> **One-line:** the controlled, audited POS-printer path that replaces browser-native `window.print()` for loyalty redemption instruments on a single named surface — proven end-to-end on Linux/CUPS as the Phase-1 exemplar, with Windows certification deferred to a follow-on PRD.

---

## 1. What shipped

A server-authoritative print pipeline for two loyalty instrument families (entitlement coupons + points-comp slips) that:

1. Builds a canonical receipt document from the existing frozen `FulfillmentPayload` (no fork of the payload).
2. Writes one audited lifecycle row (`print_attempt`) through SECURITY DEFINER RPCs — never via direct table DML.
3. Submits exactly once to a co-located loopback print agent that fronts the OS spooler (CUPS), reporting a truthful spooler outcome.
4. Surfaces a bounded operator outcome (`submitted | failed | unknown`) — **`submitted ≠ printed`** — with manual-first print actions and a nonce-bearing reprint path.

All nine workstreams (WS1–WS9) are complete and verified. Phase-4 DoD gates are green (type-check / lint / build / write-path E2E). The only remaining gate is the manual real-device acceptance (GATE-HW-2).

---

## 2. Scope boundary

**In scope (Phase 1 — Linux exemplar, ADR-062 D8 / Gate E1):**
- One redemption surface (`components/player-360/header/issue-reward-button.tsx` and its drawer/panel subtree).
- Both instrument families routed through the single controlled path.
- Linux/CUPS adapter + a co-located loopback agent fronting the spooler.
- Audit lifecycle, idempotency, truthful failure reporting, fail-closed behavior.

**Explicitly out of scope (deferred to PRD #2 / Gate E2 — Windows certification):**
- `windows_spooler` adapter, installer/update, ADR-063 D1–D4/D7 hardening.
- Any `printed`/`acknowledged`/`completed` lifecycle state (no completion claim).
- `PrinterFault` / device-fault vocabulary in DTOs/UI/schema; `failure_domain = device` stays NULL (§7a).
- A generic/runtime/admin template engine. `lib/print/` `window.print()` remains for non-loyalty docs (MTL / shift reports).

**Anti-drift:** Linux must not become permanent production; rollout is blocked until the Windows certification gate (E2).

---

## 3. Architecture — the controlled path

```
operator surface (manual click)
        │  useControlledPrint  (hooks/loyalty/use-controlled-print.ts)
        ▼
POST /api/v1/loyalty/printing            ← the ONLY sanctioned print path
        │  withServerAction: auth · RLS context (ADR-024) · idempotency · role gate (pit_boss|admin)
        ▼
createInstrumentPrintingHttp.print()     (services/loyalty/printing/http.ts)
        │  FR-7 canonical-renderer guard (rejects html-preview before any device call)
        │  resolveInstrument → buildReceiptDocument → hashReceiptDocument
        │  server-derived idempotency key (DEC-005)
        ▼
rpc_request_print_attempt  → row 'requested' (insert-or-return-prior + same-casino instrument_ref resolution, P0003)
        │  terminal prior? → return replayed, NO adapter
        ▼
cups adapter  (services/loyalty/printing/adapters/cups-adapter.ts)
        │  cups renderer → POST AgentPrintJobRequest to 127.0.0.1 agent
        ▼
loopback agent (services/loyalty/printing/agent/loopback-agent.ts)
        │  D5 jobKey dedupe · D6 truthful outcome · resolves printerTargetId → CUPS queue
        ▼
CupsSpooler (simulated default / lp-command in prod) → accepted|completed|rejected
        ▲
rpc_transition_print_attempt → terminal ('submitted'|'failed'|'unknown'); single-flight via P0100
```

**Layering / platform boundary (GATE-PLATFORM-1):** device machinery (`spawn`, `lp`, `fetch`) is confined to `agent/loopback-agent.ts`. The contract, DTOs, schemas, mappers, templates, and renderers carry no upward dependency on adapters/agent and no CUPS/Epson/ESC-POS types. `cups`/`fake` are abstract adapter **keys**, not device encodings.

**Exactly-once physical print** is guaranteed at three layers: (1) HTTP `Idempotency-Key` edge single-flight for double-clicks, (2) DB `UNIQUE(casino_id, idempotency_key)` insert-or-return-prior, (3) agent `jobKey` dedupe (same instrument → same document → one spool). The `requested → terminal` transition is single-flight; the race loser hits the terminal-immutability trigger (P0100) and returns the prior row.

---

## 4. Workstream summary

| WS | Deliverable | Key outputs |
|----|-------------|-------------|
| **WS1** | `print_attempt` schema + RLS + immutability trigger | `20260619145557_create_print_attempt.sql` — polymorphic instrument ref; BEFORE UPDATE trigger (P0100 terminal-immutable / P0101 invalid-transition / P0102 identity-immutable); Pattern C RLS (row + role); `UNIQUE(casino_id, idempotency_key)`; index `(casino_id, result_status, requested_at)` |
| **WS2** | Controlled-write RPCs (SECURITY DEFINER) | `20260619151717_create_print_attempt_write_rpcs.sql` — `rpc_request_print_attempt` (insert-or-return-prior + instrument_ref resolution P0003), `rpc_transition_print_attempt` (requested→terminal only), `rpc_mark_stale_print_attempts_unknown` (reconciler); no spoofable operator/casino params (ADR-024); 14/14 int tests on live DB |
| **WS3** | InstrumentPrinting submodule + contract | `contract.ts` (4-state vocab, `LoyaltyInstrumentPrinter`), `dtos.ts`, `schemas.ts`, `mappers.ts`, `index.ts` — no `keys.ts` (YAGNI) |
| **WS4** | Receipt templating | `templates/{receipt-document,build-receipt,hash}.ts` + `renderers/{cups,fake,html-preview}-renderer.ts` — value authority = `FulfillmentPayload.face_value_cents` only; `receipt_document_hash` over canonical doc; `canonical` flag drives FR-7 |
| **WS5** | Transport adapters + loopback agent | `adapters/{cups,fake,index}.ts` + `agent/loopback-agent.ts` — server-side adapter POSTs to loopback agent; ADR-063 D5/D6 only; simulated + `lp`-command spoolers; `failure_domain=device` never populated |
| **WS6** | Controlled route + admin test-print | `app/api/v1/loyalty/printing/route.ts`, `…/test-print/route.ts`, `services/loyalty/printing/http.ts` — server-derived key, FR-7 runtime guard, fail-closed 503 when agent unconfigured, P-code → HTTP mapping; test-print fires the adapter directly (no audit row, no instrument) |
| **WS7** | Operator UX — retire `window.print()` | `hooks/loyalty/use-controlled-print.ts`, `components/loyalty/print-outcome-badge.tsx`, rewired `issue-reward-button.tsx` / `issue-reward-drawer.tsx` / `issuance-result-panel.tsx` — manual-first (auto-print dropped, DEC-004); bounded outcome badge; reprint-only resubmission with duplicate-risk ack for `unknown` |
| **WS8** | Test + boundary-lint suite | 11 test files under `__tests__/services/loyalty/printing/` + `eslint.config.mjs` boundary rule — contract parity, ReceiptDocument snapshot, GATE-DOM-1, GATE-DUP-1, idempotency derivation, instrument-ref resolution, comp-family path, render-validation fail-closed, transport-failure domain, stale reconciliation; all `*.int.test.ts` real-DB (Gate A clean); live-stack test-pass gate (10 int suites / 37 tests) |
| **WS9** | E2E write-path happy-path | `e2e/loyalty-printing/controlled-print-happy-path.spec.ts` (+ loopback agent server, README, dedicated config) — Mode B browser login → controlled print → `submitted` → `print_attempt` persisted with full correlation; **GREEN on a genuine local run** |

---

## 5. Key decisions

| ID | Decision |
|----|----------|
| **DEC-002** | Co-located Linux host; the **server** writes the audit row + terminal transition; the server-side cups adapter POSTs to a 127.0.0.1 loopback agent. Only ADR-063 D5 (idempotency) + D6 (truthful failure) are exercised. |
| **DEC-003** | Polymorphic `instrument_kind {promo_coupon | ledger_entry}` + `instrument_ref` (no hard FK); **both** families route through the controlled path (satisfies GATE-UX-1). Supersedes the original DEC-001 (entitlement-only FK). |
| **DEC-004** | Manual-first: auto-print **dropped** on the controlled path. Nothing prints without an explicit operator click. (`lib/print/` auto-attempt untouched for non-loyalty.) |
| **DEC-005** | Server-derived idempotency key = hash(`instrument_kind`, `instrument_ref`, `intent`). `first_print` collapses retries; an explicit reprint nonce forks a new instance. The client never mints the key. |
| **DEC-006** | `failure_domain` += `transport_submission` `{agent_unreachable | spooler_rejected | malformed_agent_response}` — amends the original render-validation-only guardrail. `device` remains forbidden (§7a). Pre-submit transport fault → `failed`; post-submit ambiguity → `unknown`. |
| **DEC-007** | `print_attempt` is **RPC-only for writes** — RLS denies direct INSERT/UPDATE/DELETE (SELECT same-casino only). `instrument_ref` resolution moved **into** `rpc_request_print_attempt` (P0003 on a non-resolving / cross-casino ref); the route lookup is UX-only. |
| **DEC-008** | `failed` **and** `unknown` are both terminal + immutable. **No Retry re-drive.** Resubmission is via a nonce-bearing Reprint only; `unknown` requires a duplicate-risk acknowledgement. |

Two adversarial (Devil's Advocate) passes hardened the EXEC-SPEC before/after build: pass 1 resolved the DEC-001 vs GATE-UX-1 contradiction (comp slip on the shared surface) and the auto-print duplicate-safety / idempotency-derivation / call-path risks; pass 2 split the test-pass gate into a real live-stack integration lane (closing the "skipped-green coverage theatre" hole), nailed the single-flight adapter-once invariant, and added instrument-ref-resolution + comp-family parity coverage.

---

## 6. Data model — `print_attempt`

One audit-controlled lifecycle row; a closed state machine `requested → (once) → terminal`, terminal immutable, reprint = a new instance.

- **Identity / provenance:** `print_attempt_id`, `casino_id` + `operator_id` (context-derived, ADR-024 — not parameters), `instrument_kind`, `instrument_ref`, `printer_target_id`, `station_id`, `requested_at`.
- **Document binding:** `template_id`, `template_version`, `receipt_document_hash` (digest of the canonical `ReceiptDocument`, not the transport payload).
- **Lifecycle:** `result_status ∈ {requested, submitted, failed, unknown}`, `failure_domain ∈ {render_validation, transport_submission}` (device forbidden), `failure_code`, `idempotency_key`, `reprint_of`.
- **Constraints:** `UNIQUE(casino_id, idempotency_key)`; BEFORE-UPDATE trigger enforcing terminal/identity immutability and legal transitions.

---

## 7. Security posture

- **Context derivation (ADR-024):** RPCs call `set_rls_context_from_staff()` — casino/operator derived from the JWT `staff_id` claim, never client-supplied. Forged-actor and cross-casino isolation proven by integration tests.
- **Controlled-write boundary (DEC-007):** direct authenticated INSERT/UPDATE/DELETE on `print_attempt` is RLS-denied; only the RPCs write. Verified: a direct status-flip leaves the row unchanged.
- **Role gate:** `pit_boss | admin`, enforced defense-in-depth at both the route and the RPC.
- **SECURITY DEFINER hygiene:** `SET search_path` per the pre-commit hook; `REVOKE PUBLIC/anon` + `GRANT authenticated`.
- **Transport bind:** the loopback agent binds `127.0.0.1` only (NFR-4); the device address is resolved at the agent layer and never reaches the browser (`printer_target_id` is opaque and server-configured, not client-supplied).
- **Fail-closed:** the route returns 503 when `LOYALTY_PRINT_AGENT_URL` is unset — a print can never silently succeed against no transport.

---

## 8. Locked invariants (do not relitigate)

- 4-state result `requested | submitted | failed | unknown`; **`submitted` = spooler accepted, not printed**. No completion/acknowledged state.
- `print_attempt` = one audited lifecycle row; closed state machine; terminal immutable; reprint = new instance.
- Canonical `failure {failure_domain, failure_code}`; `device` (PrinterFault) absent this phase.
- Value authority = `FulfillmentPayload.face_value_cents` only (never `promo_coupon.face_value_amount`).
- Templating bounded: `FulfillmentPayload → ReceiptDocument → renderer → adapter`; HTML renderer is preview-only and non-canonical (FR-7 rejects it before device).
- `window.print()` retained off-surface (non-loyalty).
- **Terminology gate, NOT SRL:** print-lifecycle terms are local integration-contract vocabulary (`srl_required: false`); governed by PRD-092 §7a glossary + operator-copy review. `PrinterFault`/`ReceiptDocument` are not SRL-admitted; `PrinterFault` must not appear in DTOs/UI/schema on the exemplar.

---

## 9. Gates & verification

| Gate | Result |
|------|--------|
| Schema validation (WS1) | PASS — `db:types-local` exit 0; `print_attempt` generated |
| Type-check | PASS — `tsc --noEmit` exit 0 |
| Lint | PASS — `npm run lint` exit 0 (boundary rule added; new files prettier-clean) |
| Production build | PASS — `npm run build` exit 0 |
| **Gate A — test fidelity (non-waivable)** | PASS — every `*.int.test.ts` is real-DB Mode C; no Supabase client-constructor mock |
| Live-stack integration (WS8) | PASS — 10 int suites / 37 tests on the local stack |
| **Write-path E2E (WS9)** | PASS — genuine local run; `submitted` + persisted-row correlation asserted |
| Gate B (render-proof) | N/A — `gate_b_classification = none` (not a derived-value surface) |
| **GATE-HW-2 — real device** | **OPEN (manual)** — TM-T88V on a Linux/CUPS rig; operator-run acceptance |

---

## 10. Delivered file inventory (branch `epson`, uncommitted)

**Migrations**
- `supabase/migrations/20260619145557_create_print_attempt.sql`
- `supabase/migrations/20260619151717_create_print_attempt_write_rpcs.sql`

**Service submodule** — `services/loyalty/printing/`
- `contract.ts`, `dtos.ts`, `schemas.ts`, `mappers.ts`, `index.ts`, `http.ts`, `README.md`
- `templates/{receipt-document,build-receipt,hash}.ts`
- `renderers/{cups,fake,html-preview}-renderer.ts`
- `adapters/{cups-adapter,fake-adapter,index}.ts`
- `agent/loopback-agent.ts`

**API**
- `app/api/v1/loyalty/printing/route.ts` (controlled POST)
- `app/api/v1/loyalty/printing/test-print/route.ts` (admin test-print)

**UI / hooks**
- `hooks/loyalty/use-controlled-print.ts`
- `components/loyalty/print-outcome-badge.tsx`
- (rewired) `components/player-360/header/issue-reward-button.tsx`, `components/loyalty/issue-reward-drawer.tsx`, `components/loyalty/issuance-result-panel.tsx`

**Tests** — `__tests__/services/loyalty/printing/`
- `print-attempt-rls.int.test.ts`, `controlled-write-boundary.int.test.ts`, `instrument-ref-resolution.int.test.ts`, `transport-failure-domain.int.test.ts`, `stale-reconciliation.int.test.ts`, `duplicate-safety.int.test.ts`, `idempotency-key-derivation.int.test.ts`, `no-instrument-authoring.int.test.ts`, `comp-family-controlled-path.int.test.ts`, `render-validation-fail-closed.int.test.ts` (int) · `printer-contract-parity.test.ts`, `receipt-document-snapshot.test.ts` (unit) · `_helpers.ts`
- `eslint.config.mjs` boundary-lint rule

**E2E** — `e2e/loyalty-printing/`
- `controlled-print-happy-path.spec.ts`
- `support/loopback-print-agent-server.ts`
- `README.md`
- `playwright.loyalty-printing.config.ts` (repo root — dedicated local-pointed config)

---

## 11. Known constraints & run gotchas

- **Auth mode for the controlled route:** the route's server client is `@supabase/ssr` **cookie-based**, so a Mode C Bearer token does **not** authenticate it — only a real browser session does. The E2E logs in via the dev password form at **`/signin`** (`DevLoginForm`, dev-only); the magic-link `/auth/login` surface cannot password-login.
- **Local-only write path:** the default `playwright.config.ts` force-loads the **remote** `.env.local` (`override: true`), which lacks the `print_attempt` migration (→ PGRST202). The write-path E2E must run against the **local** stack via `playwright.loyalty-printing.config.ts` with a loopback agent and a dev server carrying `LOYALTY_PRINT_AGENT_URL`. Full recipe in `e2e/loyalty-printing/README.md`.
- **Pre-existing E2E drift (not introduced here):** the shared `e2e/fixtures/auth.ts` `authenticateAndNavigate` helper is stale (targets the removed magic-link `#login-email` form). Several workflow specs likely share this rot — worth a separate cleanup.
- **PostgREST cache:** after applying the uncommitted migrations, reload PostgREST (`docker restart supabase_rest_pt-2`) if PGRST202 persists.

---

## 12. Remaining work

1. **GATE-HW-2 (manual):** real TM-T88V acceptance on a Linux/CUPS rig — wire `createCupsCommandSpooler` (`lp -d <queue>`), confirm a physical `submitted` outcome and audit row.
2. **Commit:** WS1–WS9 are uncommitted on `epson`.
3. **MVP-ROADMAP:** `docs/20-architecture/MVP-ROADMAP.md` is stale (v2.4.0, stops ~PRD-020; tracks none of the recent arc). PRD-092 completion is recorded in the build checkpoint, not injected into the architect-owned canonical doc — flagged for the Lead Architect.
4. **PRD #2 (Windows certification, Gate E2):** `windows_spooler` adapter + ADR-063 D1–D4/D7 hardening; lifts the Linux-exemplar anti-drift block.

---

*Authoritative sources: build checkpoint `.claude/skills/build-pipeline/checkpoints/PRD-092.json`; EXEC-092; ADR-062 / ADR-063; FIB-H/FIB-S-POS-LOYALTY-INSTRUMENT-PRINTING-001.*
