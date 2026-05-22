# FIB-H — Financial Telemetry Phase 1.2B-B — Render Migration

status: DRAFT
date: 2026-05-03
owner: Financial Telemetry (Cross-context)

predecessor_fib: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-2b/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-2B-CANONICALIZATION.md
predecessor_phase: Phase 1.2B-A (Service Canonicalization — EXEC-074, closed 2026-04-30, commit e83a2c12)

parent:
- FIB-H Phase 1.2B-A §G — `formatDollars → formatCents` listed as deferred Presentation obligation (DEF-004)
- ROLLOUT-TRACKER.json DEF-004

successor_slice: Phase 1.2B-C — Contract Expansion (full 28-route OpenAPI + route test matrices + DEC-6 + deprecation observability). Requires its own FIB + PRD pair.

---

# Scope Guardrail Block

**Governance reference:** `docs/70-governance/FIB_GENERATION_SCOPE_GUARDRAIL.md`

**One-line boundary:**
This FIB changes how integer-cents financial values render in `start-from-previous.tsx`; it does not expand the API contract, add route tests, or wire observability.

**Primary change class:** Presentation

**Coverage mode:** Representative

Exact surfaces in scope:
- `components/player-sessions/start-from-previous.tsx` — lines 202, 208, 226

No other files receive logic changes. The Q-4 consumer audit (confirming no other `FinancialValue.value` field is passed to `formatDollars` in the codebase) is a grep-only discovery step, not a logic change.

**Primary layer:** UI

Secondary layers: none. No route handler, service, OpenAPI, or test file receives logic changes.

**Layer budget:**
- Logic-bearing files: 1 (`start-from-previous.tsx`)
- Directory boundaries: 1 (`components/player-sessions/`)
- Bounded contexts: 1 (player-sessions UI component)
- All thresholds within single-class limits — no hidden multi-class scope review required.

**Cause vs consequence split:**

| Category | This FIB | Next FIB |
|---|---|---|
| BRIDGE-001 service retirement (cause) | Complete — Phase 1.2B-A | — |
| UI render correction (immediate surface consequence) | In scope | — |
| OpenAPI contract expansion (downstream alignment) | Not in scope | Phase 1.2B-C |
| Route-boundary test matrices (enforcement) | Not in scope | Phase 1.2B-C |
| Deprecation observability (observability) | Not in scope | Phase 1.4 / Phase 1.2B-C |

**Adjacent consequence ledger:**

| Temptation removed from MUST | Why adjacent | Disposition |
|---|---|---|
| Full 28-route OpenAPI expansion | Contract documentation is a direct consequence of a canonicalized service layer | Phase 1.2B-C — Transport/Enforcement FIB |
| 4-case route-boundary test matrices for `recent-sessions` and `live-view` | Test coverage expands naturally after the unit is stable | Phase 1.2B-C — Enforcement FIB |
| DEC-6 `shift-intelligence/alerts` OpenAPI path + route test birth | `ShiftAlertDTO` was promoted in 1.2B-A; surface gap exists | Phase 1.2B-C — Enforcement FIB |
| Structured log events for deprecated-field usage | Observability belongs after the stable contract is documented | Phase 1.4 or Phase 1.2B-C |
| `start-from-previous.test.tsx` / `start-from-previous-modal.test.tsx` component test birth | Component is being touched | Phase 1.3 — DEF-006 / PRD-071 Appendix D |
| `components/financial/FinancialValue.tsx` component birth | Integer-cents contract is stable — could introduce display component now | Phase 1.3 — component design, theming, accessibility are a distinct phase |

At least three items were explicitly removed from MUST scope; each is cross-class relative to the Presentation primary class.

**Atomicity test:**
1. Can this FIB ship without the deferred downstream work? Yes — the three call-site swaps produce a correct render; OpenAPI, test matrices, and observability are independent.
2. Can the deferred downstream work begin after this FIB without rewriting it? Yes — Phase 1.2B-C's OpenAPI expansion and test matrices consume the same service contract regardless of whether the render bug is fixed first.
3. Is the shipped FIB internally consistent and truthful? Yes — after the migration, `start-from-previous.tsx` renders `$75` for a 7500-cent value under the existing whole-dollar formatter contract. No half-true state is introduced.

**GOV-FIB-001 §7 red flags check:**
- "Claims one primary class but includes logic work from another class" — No. Only `start-from-previous.tsx` receives a logic change; all cross-class items are in the Adjacent Consequence Ledger.
- "Claims representative scope but uses full-inventory language" — No. Exact file and lines named.
- "Must land atomically across service, API, UI, tests, and observability" — No. UI only.
- All remaining red flags: Not triggered.

---

# A. Identity

**Feature name:** Phase 1.2B-B — Render Migration

**Feature ID:** FIB-H-FIN-PHASE-1-2B-B

**Related phase:** Wave 1 Phase 1.2B-B (successor to Phase 1.2B-A Service Canonicalization)

**Requester / owner:** Vladimir Ivanov

**Date opened:** 2026-05-03

**Priority:** P1 — live display bug; introduced by Phase 1.2B-A BRIDGE-001 retirement

**Target decision horizon:** Phase 1.2B close

---

# B. Operator Problem

After Phase 1.2B-A retired BRIDGE-001, `FinancialValue.value` became integer cents at the service boundary. The "Start from Previous Session" panel still calls `formatDollars` on those values. A pit boss reviewing a player's prior buy-in of $75 (stored as 7500 cents) now sees `$7,500` in the UI — off by a factor of 100. This is a display error on the surface a pit boss consults when deciding whether and at what limit to open a new session for a returning player. The fix is to call the correct formatter.

---

# C. Pilot-fit / current-slice justification

The render bug was a known consequence of BRIDGE-001 retirement — DEF-004 in the tracker deferred it deliberately until integer-cents was confirmed stable at the service boundary. Phase 1.2B-A confirmed that. The bug cannot wait for Phase 1.3 (UI component design) because that phase introduces display components and formatter consolidation; the pit boss is looking at incorrect dollar amounts right now, before Phase 1.3 begins.

---

# D. Primary actor and operator moment

**Primary actor:** Pit boss / floor supervisor

**When does this happen?** When opening a new session at a table for a returning player — the pit boss reviews the player's most recent session (buy-in, cash out, net) to set table limits and rating slip parameters.

**Primary surface:** `components/player-sessions/start-from-previous.tsx` — the three financial field renders in the prior-session card.

**Trigger event:** `FinancialValue.value` is now integer cents (Phase 1.2B-A). `formatDollars` is the wrong formatter for integer-cents values.

---

# E. Feature Containment Loop

1. Developer runs `rg -n "formatDollars\\([^\\)]*\\.value\\)" app components hooks services lib -S` for runtime UI/service code → confirms 3 call sites in `start-from-previous.tsx` (lines 202, 208, 226) before the swap and no results after the swap; `start-from-previous-modal.tsx` and `rating-slip-modal.tsx` are clean (no FinancialValue reads); `player-list-panel.tsx:234` reads `player.total_net_today` (bare number, separate contract — not in scope).
2. Developer updates the import in `start-from-previous.tsx`: `import { formatDollars }` → `import { formatCents }`.
3. Developer replaces `formatDollars(session.total_buy_in.value)` with `formatCents(session.total_buy_in.value)` at line 202.
4. Developer replaces `formatDollars(session.total_cash_out.value)` with `formatCents(session.total_cash_out.value)` at line 208.
5. Developer replaces `formatDollars(session.net.value)` with `formatCents(session.net.value)` at line 226.
6. Pit boss opens a returning player's profile where prior `total_buy_in` = 7500 cents → display shows `$75`; prior `net` = -2500 cents → display shows `-$25`. Display is correct under the existing whole-dollar formatter contract.

---

# F. Required outcomes

- `formatDollars` is absent from `start-from-previous.tsx` for all three `FinancialValue.value` field reads
- `formatCents` is the formatter at lines 202, 208, and 226
- No other runtime UI `formatDollars` call site passes a `FinancialValue.value` integer-cents field (Q-4 audit clean)
- `npm run type-check` exits 0
- `npm run lint` exits 0
- `npm run build` exits 0
- DEF-004 closed in `ROLLOUT-TRACKER.json` with the implementation commit SHA or `commit_sha_pending: true` plus a tracker-only SHA closure before Phase 1.2B-C starts

---

# G. Explicit exclusions

**Phase 1.2B-C scope (own FIB + PRD required):**
- Full 28-route OpenAPI expansion for financially-relevant routes
- 4-case route-boundary test matrices for `recent-sessions` and `live-view`
- DEC-6: `GET /api/v1/shift-intelligence/alerts` OpenAPI path entry + route-boundary test birth
- Structured log events per deprecated-field usage at route handlers

**Phase 1.3 scope:**
- `components/financial/FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx`
- Forbidden-label removal from DOM (`Handle`, `Total Drop`, etc.)
- `lib/format.ts` and 18+ local formatter variants — consolidation pass
- Component test birth: `start-from-previous.test.tsx`, `start-from-previous-modal.test.tsx`, `rating-slip-modal.test.tsx` (DEF-006)
- `components/shift-dashboard-v3/**` migration to `<FinancialValue>`

**Phase 1.4 scope:**
- ESLint `no-unlabeled-financial-value` / `no-forbidden-financial-label`
- I5 truth-telling harness subset
- CI red on envelope regression

**All phases:**
- `hold_percent` FinancialValue wrapping — ever (DEF-NEVER)
- `player-list-panel.tsx:234` — `formatDollars(player.total_net_today)` reads a bare `number`, not a `FinancialValue.value` field; out of scope for this migration

---

# H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Bundle OpenAPI expansion into this slice | Contract work is a consequence of stable integer-cents unit | OpenAPI expansion is Transport/Enforcement — a different change class from Presentation. GOV-FIB-001 §4: secondary classes allowed only in Deferred Work, not MUST. |
| Bundle 4-case route test matrices into this slice | Test coverage improves after unit is stable | Enforcement class. The render migration can ship and be verified without expanding test matrices. Adding them here makes the diff multi-layer and creates a dependency chain where a test failure blocks a 3-line UI fix. |
| Defer the render fix to Phase 1.3 with component birth | Minimizes total number of slices | Phase 1.3 is a UI design phase. Leaving a factor-of-100 display error in production through the entire Phase 1.3 cycle is not acceptable. DEF-004 was deferred only until integer-cents was confirmed stable, which it now is. |
| Migrate `formatDollars` at `player-list-panel.tsx:234` in the same pass | File is in the same directory | `player.total_net_today` is a bare `number` field — not a `FinancialValue.value` integer-cents field. Migrating it would change its display semantics, not fix a cents/dollars mismatch. Out of scope. |

---

# I. Dependencies and assumptions

- Phase 1.2B-A exit gate ✅ (EXEC-074, commit `e83a2c12`, 2026-04-30): `FinancialValue.value` is integer cents at the service boundary; `financialValueSchema.int()` enforced; BRIDGE-001 retired
- `formatCents` exists in `lib/format.ts` and accepts `number` — same signature as `formatDollars`; import swap is sufficient, no new utility required
- `start-from-previous-modal.tsx` confirmed clean — no `FinancialValue` financial field reads (confirmed during context gathering)
- `rating-slip-modal.tsx` confirmed clean — no `RecentSessionDTO` / `VisitLiveViewDTO` field reads (confirmed during context gathering)
- `player-list-panel.tsx:234` confirmed out of scope — `player.total_net_today` is a bare `number` (confirmed during context gathering)
- No SQL migration required; no service layer changes; no route handler changes

---

# J. Out-of-scope but likely next

- **Phase 1.2B-C** — Contract Expansion: full 28-route OpenAPI annotation + 4-case route test matrices + DEC-6 `shift-intelligence/alerts` route coverage + deprecation observability. Requires its own FIB-H + FIB-S + PRD + EXEC-SPEC.
- **Phase 1.3** — UI Layer: Split Display + Labels: `FinancialValue.tsx`, `AttributionRatio.tsx`, `CompletenessBadge.tsx`, forbidden-label removal, formatter consolidation, component test birth.

---

# K. Expansion trigger rule

Amend this brief if any downstream artifact proposes:
- Touching any file other than `start-from-previous.tsx` for logic changes
- Adding a new test file for `start-from-previous.tsx` (Phase 1.3 per DEF-006)
- Adding OpenAPI path entries (Phase 1.2B-C)
- Adding route-boundary tests (Phase 1.2B-C)
- Wiring runtime log events (Phase 1.2B-C / Phase 1.4)

---

# L. Scope authority block

**Intake version:** v1

**Frozen for downstream design:** Yes

**Downstream expansion allowed without amendment:** No

**Open questions allowed to remain unresolved at scaffold stage:** None — Q-4 consumer audit is a grep step resolved during EXEC-SPEC planning, not a design question.

**Human approval / sign-off:** Vladimir Ivanov / 2026-05-03
