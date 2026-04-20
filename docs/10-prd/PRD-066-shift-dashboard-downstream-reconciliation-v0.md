---
id: PRD-066
title: Shift Dashboard Downstream Reconciliation (Win/Loss + Est. Drop)
owner: Lead Architect
status: Superseded
superseded_by: PRD-067
superseded_on: 2026-04-19
affects: [PRD-064, PRD-065, ADR-049]
created: 2026-04-19
last_review: 2026-04-19
phase: Phase H — Write-Path Hardening Pass 3 (Read-Plane)
pattern: C
http_boundary: false
investigation_ref: docs/issues/shift-dash/INVESTIGATION-2026-04-17-winloss-estdrop-staleness.md
---

> **SUPERSEDED 2026-04-19 by [PRD-067](./PRD-067-adr050-phase1-shift-dashboard-freshness-pilot-v0.md).**
> PRD-066 pre-dates ADR-050's acceptance and frames the shift-dashboard staleness problem as a local read-plane remediation with its own bespoke preflight (PFT RLS) and workstream taxonomy. ADR-050 now provides the normative contract for all financial-surface freshness; the shift-dashboard work is re-scoped as the Phase 1 exemplar of that contract. PRD-067 is the authoritative product container for the revised approach. This file is retained as historical prior-art — do not implement from it.

# PRD-066 — Shift Dashboard Downstream Reconciliation (Win/Loss + Est. Drop)

> **Slice type — READ-PLANE REMEDIATION:** PRD-064 closed the MTL buy-in write-path glitch. PRD-065 is executing the ADR-049 server-side command contract. Neither addresses what happens *downstream* when a committed adjustment writes correctly to `player_financial_transaction` + `table_buyin_telemetry` + `mtl_entry` but the shift-dashboard fails to display the change. This PRD closes the residual read-plane reconciliation gap on the two panels that operators rely on for shift-level cash judgment: **Win/Loss** and **Est. Drop**.

---

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** When an operator reverts or adjusts a rating-slip buy-in, the adjustment writes correctly to the server (bridge trigger fires, `rpc_shift_table_metrics` aggregates `RATED_ADJUSTMENT` into `rated_cents`, MTL derivation runs). The `/shift-dashboard` surface's Win/Loss and Est. Drop panels do **not** reflect the change without a manual page reload or time-window change. Investigation traced the residual staleness to two independent client-side gaps: (1) a frozen query time-window initialized once at component mount, which causes the RPC's `occurred_at < p_window_end` filter to permanently exclude post-mount adjustments; (2) absence of a Supabase realtime subscription on `player_financial_transaction` / `table_buyin_telemetry`, which prevents cross-tab write notifications from reaching the shift-dashboard cache. This PRD delivers the minimum set of client-side changes to make both panels reflect committed adjustments within the latency envelopes defined in §5.2 (same-tab vs cross-tab; realtime vs polling fallback).

**App-scope of this PRD:** client-side only on the happy path. No new migrations are authored, no new RPCs are introduced, and no RLS policies are altered by this PRD unless the required preflight proves the existing `player_financial_transaction` SELECT policy is not realtime-safe. If that happens, realtime wiring is blocked and a separate RLS remediation artifact must ship first. Server-side write behavior is already GREEN per the February 2026 remediation (archived `ISSUE-SHIFT-DASH-STALE-ADJ` EXEC-SPEC).

**Rollout prerequisite (environment + security preflight, not app code):** Supabase Realtime publication in the target environment must include `public.player_financial_transaction`, but publication must not be enabled or used until PFT SELECT isolation is proven for authenticated casino scope, including a shared/cross-property player fixture. If publication is absent in a given environment, enable it only after that isolation evidence passes. See §7.1 for verification and §8 DoD for the environment-gate checkbox.

> **Scope governance:** This is the read-plane slice of Phase H. Write-plane work for `useSaveWithBuyIn` (initial buy-in invalidation gap, see `DOWNSTREAM-CONSUMER-POSTURE.md` §B) is deliberately deferred — see §2.3.

---

## 2. Problem & Goals

### 2.1 Problem

Three independent layers must all align for the shift-dashboard to reflect a committed buy-in adjustment:

1. **Server write:** bridge trigger writes `table_buyin_telemetry` row with `telemetry_kind='RATED_ADJUSTMENT'`, `occurred_at=now()`, correct sign. ✅ GREEN (verified 2026-04-17 via migration `20260219002247_enable_adjustment_telemetry`).
2. **Client cache invalidation:** `useCreateFinancialAdjustment.onSuccess` invalidates `shiftDashboardKeys.summary.scope`. ✅ GREEN (landed Feb 2026 as WS3 of archived EXEC-SPEC).
3. **Client query parameters + notification transport:** the refetch triggered by (2) must query a time window that includes the adjustment, AND — for operators watching the dashboard in a separate browser tab from the one performing the adjustment — a write notification must reach the dashboard's cache. ❌ BOTH PARTS BROKEN.

#### 2.1.1 Cause C1 — Frozen query window

At `components/shift-dashboard-v3/shift-dashboard-v3.tsx:87`:

```ts
const [timeWindow, setTimeWindow] =
  useState<ShiftTimeWindow>(getDefaultWindow);
```

`getDefaultWindow()` returns `{ start: now-8h, end: now }` where `now` is captured **once**, at the moment of `useState` initialization. The window never advances. `useShiftDashboardSummary({ window: timeWindow })` keys the query by this stable window. `refetchInterval: 30_000` re-runs the fetch every 30 seconds with the **same** parameters.

`rpc_shift_table_metrics` filters telemetry by `tbt.occurred_at >= p_window_start AND tbt.occurred_at < p_window_end`. An adjustment committing at `mount + 5min` has `occurred_at = mount + 5min`, which is strictly greater than `window.end = mount`. The RPC permanently excludes it.

The invalidation from (2) refetches correctly — with the wrong window. The server returns a correct answer for the query it was given. The UI shows unchanged numbers indefinitely until the operator changes the window via `TimeWindowSelector` or reloads the page.

#### 2.1.2 Cause C2 — No realtime subscription

`hooks/dashboard/use-dashboard-realtime.tsx` subscribes to `gaming_table`, `rating_slip`, `table_fill`, `table_credit` for the pit dashboard. It is **not** wired into the shift-dashboard surface. The shift-dashboard has no Supabase realtime subscription.

Consequence: when Operator A adjusts a buy-in in one browser tab while Operator B (or Operator A's own other tab) is viewing `/shift-dashboard`, the adjustment never reaches Operator B's query cache. Operator B's dashboard refetches on its 30-second interval with its own (also frozen) window — and per C1, excludes the adjustment anyway.

### 2.2 Goals

| Goal | Observable Signal | Traces To |
|------|-------------------|-----------|
| **G1**: Same-tab adjustments trigger an immediate invalidation-driven refetch; both panels reflect the change as fast as the RPC round-trip allows | After an operator reverts a buy-in in the same browser tab as the shift-dashboard, both panels update on the invalidation-triggered refetch. Hard fallback: ≤ 30 s via the polling interval if the invalidation misfires or the rolling window edge case applies | FR-1, §2.1.1 |
| **G2**: Cross-tab adjustments appear on Win/Loss + Est. Drop within ≤ 2 seconds (realtime target); ≤ 30 s polling fallback when realtime is degraded | A Supabase realtime subscription on `player_financial_transaction` filtered by `casino_id` invalidates `shiftDashboardKeys.summary.scope` on insert within ≤ 2 s p95; if realtime is unavailable, the 30 s polling interval (FR-1) converges the same observer | FR-2, §2.1.2 |
| **G3**: Query window advances on each refetch | `window.end` recomputes to browser wall-clock `new Date()` at fetch time (either via advanced state or via a `queryFn`-level override — implementation choice in §4); this is a client freshness bound, not casino temporal authority. Post-mount adjustments with `occurred_at > initial-mount-time` are included in RPC results | FR-1, §2.1.1 |
| **G4**: No regression on PRD-036 metric provenance | `HeroWinLossCompact` continues to render `N/A` with the missing-baseline CTA when `win_loss_estimated_total_cents == null`; `MetricGradeBadge` + `OpeningSourceBadge` continue to render correctly | FR-5 |
| **G5**: No regression on PRD-064 containment | `e2e/repro-mtl-glitch.spec.ts` still green after the patch lands | FR-5 |

### 2.3 Non-Goals (Deliberately Out of Scope)

Each of these is legitimate work that does **not** belong in this read-plane slice. They are tracked separately and cited here only to make the boundary explicit.

- **`useSaveWithBuyIn` missing shift-dashboard invalidation** — write-plane gap covered in `DOWNSTREAM-CONSUMER-POSTURE.md` §B. Initial buy-ins currently don't trigger shift-dashboard refetch. Same file, different failure mode. Follow-on PRD.
- **`useCreateFinancialTransaction` (cashier/alt flows) missing shift-dashboard invalidation** — same class as above. Deferred.
- **Realtime subscription on `mtl_entry`** — PRD-064 §Deferred already named this. Distinct from `player_financial_transaction` realtime (this PRD). If wired in parallel, can share the same `use-shift-dashboard-realtime.ts` module.
- **`allCashObs()` + `alerts` invalidation in `useCreateFinancialAdjustment`** — those keys feed telemetry rollups and spike alerts, not Win/Loss or Est. Drop. Out of this PRD's observable symptom.
- **`pit_cash_observation` realtime subscription** — adjacent gap for the chips-taken path; different surface.
- **TimeWindowSelector UX revisions** — a "Live" mode or rolling-window toggle is a product decision. This PRD advances the window mechanically on refetch; it does not introduce new operator-visible controls.
- **Shift-intelligence alert surface staleness** — covered separately in `DOWNSTREAM-CONSUMER-POSTURE.md` §B.
- **Server-side materialization changes** — not needed; server is correct.

If in doubt, the rule is: *does this item close the Win/Loss or Est. Drop stale-display failure for the reverted-buy-in scenario?* If no, it is out of scope for this PRD.

---

## 3. Users & Use Cases

- **Primary users:** Pit boss, floor supervisor (the operators who watch `/shift-dashboard` to read live cash judgment metrics during an active shift).
- **Secondary users:** Shift manager, compliance officer (downstream viewers who may be reconciling dashboard figures against operator reports or regulatory filings; stale figures here create false discrepancies).

**Top Jobs:**

- As a **pit boss**, when I revert or adjust a mistaken buy-in in my pit-panels rating-slip modal, I need the shift-dashboard's Win/Loss and Est. Drop to update immediately in the same tab, with the 30-second polling interval as a hard fallback, so my next operational decision is based on the corrected figure. *(G1, G3)*
- As a **floor supervisor**, when I am watching the shift-dashboard in a separate browser tab and a pit boss adjusts a buy-in elsewhere in the casino, I need the dashboard to update within 2 seconds so I am not making floor-level decisions on stale data. *(G2)*
- As a **compliance officer**, when I reconcile end-of-shift figures against operator self-reports, I need the shift-dashboard to reflect the actual ledger state, not a frozen snapshot from the moment the page was loaded. *(G1, G2, G3)*
- As a **pit boss**, when there is no baseline yet recorded (no opening snapshot), I need the panel to continue showing N/A with the existing CTA rather than a zero or a regression-induced error. *(G4)*

---

## 4. Scope & Feature List

### 4.1 In Scope

**P0.1 — Rolling query window on refetch**
- `components/shift-dashboard-v3/shift-dashboard-v3.tsx`: the `timeWindow` that drives `useShiftDashboardSummary` must recompute `window.end` to `new Date()` on each refetch cycle (both `refetchInterval`-triggered and invalidation-triggered).
- **Preferred implementation — Option A2 (advance-params-in-queryFn):** keep `timeWindow.start` stable; mutate `timeWindow.end` to `new Date().toISOString()` inside `queryFn` at fetch time. Query key is stable across refetches; fetch params advance. Lower cache churn, no key thrash, and matches TanStack Query's intended separation between cache identity (the key) and fetch inputs (the closure-captured params). This is honest only because the summary query is treated as a live scoped view of the active dashboard, not an immutable historical slice; the cached resource identity is the current shift-dashboard summary scope, while the effective upper bound advances at fetch time. This is the default path.
- **Fallback — Option A1 (advance-state via ticker):** use only if the existing query-hook structure makes A2 impractical — e.g., if `window.end` is serialized into the key by `shiftDashboardKeys.summary(window)` such that advancing params without advancing the key would desync the cache. In that case, drive window recomputation from a `refreshTrigger` state that advances on a 30-second `setInterval`; the key legitimately changes on each tick. EXEC-SPEC must justify the fallback if A2 is not chosen.

**P0.2 — Realtime subscription on `player_financial_transaction`**
- New hook: `hooks/shift-dashboard/use-shift-dashboard-realtime.ts`.
- Subscribes to `public.player_financial_transaction` INSERT events filtered by `casino_id = <current>`.
- On receipt of an event, invalidates `shiftDashboardKeys.summary.scope` and `shiftDashboardKeys.allMetrics()`.
- Mounts once per `ShiftDashboardV3` instance; cleans up on unmount per React 19 effect semantics.
- Mirrors the pattern at `hooks/dashboard/use-dashboard-realtime.tsx` (pit-dashboard realtime subscriber). No new realtime primitives introduced.

**Why `player_financial_transaction` alone is sufficient for this slice:** `player_financial_transaction` is the authoritative write surface for all buy-ins, cash-outs, adjustments, and reversals that drive Win/Loss + Est. Drop. Both downstream tables relevant to those panels — `table_buyin_telemetry` and `mtl_entry` — are derived from `player_financial_transaction` via AFTER-INSERT triggers inside the same Postgres transaction, so by the time a realtime INSERT event fires, the derived rows are already committed and visible to the next RPC read. Subscribing additionally to `table_buyin_telemetry` would emit a second event for the same logical change (double-invalidation, no freshness win); subscribing to `mtl_entry` is out of scope per §2.3 (compliance surface, not Win/Loss).

**P0.3 — Observability**
- On both the polling/invalidation refetch path (P0.1) and the realtime-triggered invalidation path (P0.2), emit a lightweight log line (dev-only via existing `logError`-sibling or console.debug) tagged `shift-dashboard:refetch-reason=<polling|realtime|invalidation>`. Enables post-merge verification that both paths fire without requiring ticker state when Option A2 is used.

### 4.2 Out of Scope

See §2.3. Most notably: the `useSaveWithBuyIn` invalidation gap and the alert-surface staleness are parallel follow-ons and do **not** block this read-plane slice.

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1**: The shift-dashboard summary query (`useShiftDashboardSummary`) must, on every refetch (interval-triggered OR invalidation-triggered), submit a `window.end` value that reflects the browser's current wall-clock time at fetch time, not a value frozen at component mount. This browser clock is accepted only as a client freshness bound; gaming-day authority remains server/casino governed.
- **FR-2**: `ShiftDashboardV3` must mount a realtime subscription on `public.player_financial_transaction` filtered by `casino_id` from the auth context. On INSERT events (both original transactions and adjustments), the subscription must call `queryClient.invalidateQueries({ queryKey: shiftDashboardKeys.summary.scope })` and `queryClient.invalidateQueries({ queryKey: shiftDashboardKeys.allMetrics() })`.
- **FR-3**: The realtime subscription must unsubscribe cleanly on component unmount (no leaked channels, no memory leaks, no duplicate subscriptions on strict-mode double-invoke).
- **FR-4**: When the realtime subscription cannot establish (network, auth, or Supabase Realtime degradation), the dashboard must continue to function via interval polling (FR-1). Subscription failure is non-fatal.
- **FR-5**: No regression on PRD-036 null-baseline rendering (`HeroWinLossCompact` renders `N/A` + CTA when `winLossCents == null`). No regression on PRD-064 `e2e/repro-mtl-glitch.spec.ts`.

### 5.2 Non-Functional Requirements

- **NFR-1 (cross-tab, realtime target):** End-to-end latency from adjustment commit (on-server) to Win/Loss + Est. Drop panel update in a *cross-tab* observer must be **≤ 2 seconds at p95** via the realtime path (FR-2).
- **NFR-1b (cross-tab, polling fallback):** When Supabase Realtime is unavailable or the channel fails, the *cross-tab* observer must converge on the next polling interval — **≤ 30 seconds at p95** (FR-1 rolling window).
- **NFR-2 (same-tab, invalidation path):** End-to-end latency from adjustment commit to panel update in the *same-tab* session is expected to be **immediate** — bounded only by the `onSuccess` invalidation firing and the RPC round-trip. No explicit upper bound is promised on the fast path; operators will perceive the update as part of the adjustment interaction.
- **NFR-2b (same-tab, hard fallback):** If the invalidation misfires or the rolling-window path degrades, the *same-tab* observer must still converge within **≤ 30 seconds at p95** via the polling interval (FR-1). This is the hard ceiling; same-tab staleness beyond 30 s is a bug.
- **NFR-3**: The rolling window must not introduce perceptible latency on initial render or on routine refetches; the window computation is a single `new Date()` call per fetch.
- **NFR-4**: The realtime subscription must not create more than one active channel per mounted `ShiftDashboardV3` instance. Cross-tab multiplexing is handled by the operator's browser, not by this PRD.
- **NFR-5**: No regression on the 30s `refetchInterval` — it continues as the fallback path when realtime is degraded.
- **NFR-6**: No regression on ADR-024 casino-scope enforcement — the realtime filter must use `casino_id` from the authenticated staff context (via `useAuth().casinoId`), not a spoofable parameter.

### 5.3 Referenced Standards and Contracts

- Schema: `types/database.types.ts` (`player_financial_transaction`, `table_buyin_telemetry`).
- Write-path invariants: PRD-064 `INV-MTL-BRIDGE-ATOMICITY` (this PRD does not regress).
- Realtime pattern: existing `hooks/dashboard/use-dashboard-realtime.tsx`.
- Query key conventions: `hooks/shift-dashboard/keys.ts` (`.scope` for surgical invalidation).
- RLS: realtime rollout depends on proving the effective `player_financial_transaction` SELECT policy enforces authenticated casino scoping for realtime reads, including shared/cross-property player cases. Existing policies must not be assumed safe without this evidence.
- Metric provenance: PRD-036 null-baseline rendering (FR-5 no-regression).
- SRM v4.14.0: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — this PRD touches only client-side consumers; no bounded-context ownership changes.
- Over-engineering guardrail: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` (this PRD does not introduce new abstractions — it mirrors the existing dashboard realtime pattern and advances an existing `useState` initialization).

---

## 6. UX / Flow Overview

**Happy path (single-tab revert):**
1. Pit boss is viewing `/shift-dashboard`. Win/Loss reads $X, Est. Drop reads $Y.
2. Pit boss opens a rating-slip modal (overlay, same tab) and reverts a buy-in via adjustment.
3. `useCreateFinancialAdjustment.onSuccess` fires `invalidateQueries(shiftDashboardKeys.summary.scope)`.
4. Shift-dashboard query refetches with `window.end = now()` (rolling window, FR-1).
5. RPC includes the new `RATED_ADJUSTMENT` telemetry row. Response returns corrected `rated_cents` and `win_loss_estimated_cents`.
6. Win/Loss and Est. Drop panels re-render on the invalidation-triggered refetch — effectively immediate, bounded by the RPC round-trip (not by a 30 s interval).

**Happy path (cross-tab revert):**
1. Floor supervisor is viewing `/shift-dashboard` in Tab 1.
2. Pit boss reverts a buy-in in Tab 2 (different session or different browser tab).
3. Adjustment commits on server. Supabase Realtime emits an INSERT event on `player_financial_transaction`.
4. Tab 1's `use-shift-dashboard-realtime` subscriber (FR-2) receives the event and invalidates `shiftDashboardKeys.summary.scope`.
5. Query refetches with rolling window. Corrected figures render in Tab 1 within ≤ 2 seconds.

**Degraded path (realtime unavailable):**
1. Supabase Realtime is unreachable or the subscription fails to establish.
2. The realtime hook is non-fatal (FR-4) — the dashboard continues rendering with interval polling.
3. Same-tab adjustments still converge via invalidation + rolling window (invalidation path unaffected by realtime state; hard fallback ≤ 30 s per NFR-2b).
4. Cross-tab adjustments converge on the next polling interval — ≤ 30 s per NFR-1b.

**No-baseline path (unchanged):**
1. Pit boss is viewing `/shift-dashboard` at start of shift, before any opening snapshot is recorded.
2. `summary.casino.win_loss_estimated_total_cents` is `null`.
3. `HeroWinLossCompact` renders "N/A" with the missing-baseline CTA. No regression per FR-5 / PRD-036.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **No app-scope migrations required on the happy path.** Server-side behavior of `rpc_shift_table_metrics`, `rpc_create_financial_adjustment`, and the bridge trigger is unchanged. If PFT SELECT isolation fails, stop realtime rollout and ship a separate RLS remediation migration before this PRD proceeds.
- **Supabase Realtime must be enabled** for the `public.player_financial_transaction` table. Verify during implementation; if not currently enabled, a single `ALTER PUBLICATION supabase_realtime ADD TABLE player_financial_transaction;` statement is required only after PFT SELECT isolation has passed.
- **RLS pass-through on realtime reads must be proven** — the operator's subscription must return only rows matching authenticated casino scope. The EXEC-SPEC must include a concrete isolation procedure or integration test, including a shared/cross-property player fixture.
- **Existing realtime pattern** at `hooks/dashboard/use-dashboard-realtime.tsx` serves as the structural reference; no new realtime primitives introduced.
- **Parallel PRD-065 (ADR-049 execution)** is not a blocker. If PRD-065 collapses `useSaveWithBuyIn` or restructures the financial mutation topology, the realtime subscription on `player_financial_transaction` remains correct (the table is the authoritative write destination either way).

### 7.2 Risks

- **R-1 (Low):** If Option A1 (ticker fallback) is selected per §4.1 P0.1, the rolling window creates a new query key every 30 seconds, evicting the prior window's cache entry. Memory churn is mild (single query, bounded key set). Mitigation: prefer Option A2 (stable key, advancing params) whenever the query-hook structure permits it; A1 is fallback only.
- **R-2 (Low):** Realtime subscription on a high-write table (`player_financial_transaction`) could produce event volume under load. Mitigation: all events on this table correspond to rare operator actions (buy-in, adjustment, cashout). Volume is bounded by operator throughput, not system throughput. Expected rate: single-digit events per minute per casino.
- **R-3 (Medium):** Supabase Realtime degradation during a shift would silently put the dashboard back on polling. Operators may not notice. Mitigation: FR-4 ensures non-fatal degradation; P0.3 observability emits `refetch-reason` so ops can query connection health in Sentry/logs post-deploy.
- **R-5 (Low):** Cross-tab operator using two *different* casino scopes (multi-tenancy edge case) would receive realtime events for only their active casino. This is the intended behavior and matches ADR-015 / ADR-024 enforcement. Not a risk, documented for clarity.

### 7.3 Known Limitations

These behaviors are expected post-merge and are intentionally not addressed by this slice. They are shipped as-is and disclosed so downstream readers, operators, and follow-on PRDs start from an accurate baseline.

- **L-1 — Stale `window.start` on long-lived tabs.** The rolling window advances `window.end` on every refetch (P0.1), but `window.start` remains fixed at the value captured at component mount. A shift-dashboard tab left open for more than 8 hours without interaction will continue to query a window anchored to the original mount time, not a rolling 8-hour window relative to "now." This *will* happen for operators who leave the dashboard open across shift boundaries without reloading. The limitation distorts freshness semantics across shift boundaries and can materially distort operator judgment if the operator assumes the displayed window has rolled forward automatically. The `window.start` advance is deliberately treated as a TimeWindowSelector / "Live mode" product decision, not a mechanical refetch concern, and is scoped out of this PRD. Revisit if operators report it as a judgment-affecting issue; until then, the `TimeWindowSelector` remains the operator's explicit control.

---

## 8. Definition of Done (DoD)

Binary checkboxes. The PRD is considered **Done** when every one of these is true.

**Functionality (core reconciliation closure)**
- [ ] Win/Loss panel in `HeroWinLossCompact` reflects a same-tab buy-in adjustment on the invalidation-triggered refetch — effectively immediate, bounded by the RPC round-trip — without manual reload or window change. Hard fallback: ≤ 30 s polling.
- [ ] Win/Loss panel in `HeroWinLossCompact` reflects a cross-tab buy-in adjustment within ≤ 2 seconds of commit via realtime; ≤ 30 s via polling when realtime is degraded.
- [ ] Est. Drop KPI in `SecondaryKpiStack` shows the same reconciliation behavior as Win/Loss (both rely on the same `summary.casino` payload).
- [ ] No regression on `HeroWinLossCompact` null-baseline rendering (PRD-036).

**Data & Integrity**
- [ ] `refetchInterval` fallback path produces correct numbers when realtime is unreachable.
- [ ] Realtime subscription respects casino scoping — operators do not see events for other casinos.

**Security & Access**
- [ ] Realtime `casino_id` filter is derived from authenticated staff context (ADR-024), not from a prop, query param, or URL.
- [ ] No service-role client usage in this PRD's changes (RLS-respecting reads only).

**Testing**
- [ ] Unit test: `useShiftDashboardSummary` rolling-window behavior — given a mount time of T, a refetch at T+5min must submit `window.end ≥ T+5min`.
- [ ] Integration test: realtime subscription invalidates summary key on `player_financial_transaction` INSERT (mocked Supabase channel).
- [ ] E2E test required: `e2e/shift-dashboard-realtime-reconciliation.spec.ts` verifies reverse-buy-in or PFT-backed adjustment in Tab 2 updates Win/Loss in Tab 1 within 2 seconds through realtime, and verifies the 30-second polling fallback when realtime is blocked.
- [ ] Existing E2E `e2e/repro-mtl-glitch.spec.ts` remains green.

**Operational Readiness**
- [ ] P0.3 observability present — `refetch-reason` log line visible in dev tooling.
- [ ] Rollback path: each change is a self-contained diff (rolling window in `shift-dashboard-v3.tsx`; realtime hook in new file + single mount-site change). Each can be reverted independently.
- [ ] **App-scope confirmation:** this PRD's happy-path code changes author no migrations, no new RPCs, and no RLS policy changes. If PFT SELECT isolation fails, realtime wiring is blocked until a separate RLS remediation artifact ships.
- [ ] **Security preflight:** PFT SELECT isolation is proven for authenticated casino scope, including a shared/cross-property player fixture, before realtime publication is enabled or used.
- [ ] **Realtime isolation preflight:** A casino A realtime subscription does not receive casino B `player_financial_transaction` INSERT events for the same shared/cross-property player fixture.
- [ ] **Rollout prerequisite:** Realtime publication for `player_financial_transaction` verified enabled in target environment. If absent, the `ALTER PUBLICATION supabase_realtime ADD TABLE player_financial_transaction;` statement has been run and verified before merge in that environment only after the security preflight passes.

**Documentation**
- [ ] `DOWNSTREAM-CONSUMER-POSTURE.md` updated — §B Client Invalidation marks Win/Loss + Est. Drop as GREEN post-merge; §C Realtime marks `player_financial_transaction` as GREEN.
- [ ] Archived `ISSUE-SHIFT-DASH-STALE-ADJ` EXEC-SPEC cross-referenced as prior art (not a dependency).
- [ ] Known limitations documented (see §7.3 L-1; risks §7.2 R-1/R-2/R-3/R-5).

**Surface Governance**
- [ ] This PRD does NOT introduce a new surface — it patches behavior on the existing `/shift-dashboard` surface. Surface classification (ADR-041) does not apply.
- [ ] Metric provenance for Win/Loss + Est. Drop is unchanged; truth class and freshness class remain as documented under PRD-036. Freshness class post-merge is "live-ish with realtime target and 30s polling fallback" — update METRIC_PROVENANCE_MATRIX if it carries a freshness column and supports that nuance.

**Explicit non-DoD (for the record)**
- [ ] `useSaveWithBuyIn` shift-dashboard invalidation, `useCreateFinancialTransaction` shift-dashboard invalidation, `mtl_entry` realtime, `pit_cash_observation` realtime, and alert-surface reconciliation are **not** prerequisites for closing this PRD. Each has its own follow-on artifact.

---

## 9. Related Documents

### 9.1 Investigation and Prior Art
- `docs/issues/shift-dash/INVESTIGATION-2026-04-17-winloss-estdrop-staleness.md` — root-cause trace, verification trail, narrow remediation recommendation. **This PRD operationalizes that report's §4.1.**
- `docs/issues/_archive/ISSUE-SHIFT-DASHBOARD-STALE-BUYIN-ADJUSTMENT.md` — Feb 2026 archived issue (100× inflation + adjustment blackout). Server-side work already shipped.
- `docs/20-architecture/specs/_archive/ISSUE-SHIFT-DASH-STALE-ADJ/EXECUTION-SPEC-ISSUE-SHIFT-DASH-STALE-ADJ.md` — archived EXEC-SPEC whose WS1/WS2/WS3 shipped; this PRD addresses the residual WS-C1-C2 gap that the Feb spec did not enumerate.
- `docs/issues/mtl-rating-slip-glitch/DOWNSTREAM-CONSUMER-POSTURE.md` — PRD-064-era read-plane audit; names both C1 (implicitly via staleTime discussion) and C2 (realtime gap).

### 9.2 Parent / Parallel Work
- `docs/10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md` — parent containment slice (write-plane). Merged `3839ba9b`.
- `docs/10-prd/PRD-065-adr049-operator-atomicity-save-with-buyin-v0.md` — parallel write-plane; not a dependency.
- `docs/80-adrs/ADR-049-operator-action-atomicity-boundary.md` — parallel ADR; this PRD is correct regardless of ADR-049 outcome.

### 9.3 Surfaces and Services (Client-Side)
- `components/shift-dashboard-v3/shift-dashboard-v3.tsx` — orchestrator; P0.1 rolling-window edit.
- `components/shift-dashboard-v3/left-rail/hero-win-loss-compact.tsx` — Win/Loss panel; no edit, validated no-regression.
- `components/shift-dashboard-v3/left-rail/secondary-kpi-stack.tsx` — Est. Drop KPI; no edit, validated no-regression.
- `hooks/shift-dashboard/use-shift-dashboard-summary.ts` — summary query; possibly edited (P0.1 Option A2).
- `hooks/shift-dashboard/keys.ts` — key factory; no edit.
- `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` — **new file**; P0.2.
- `hooks/dashboard/use-dashboard-realtime.tsx` — structural reference for P0.2.
- `hooks/player-financial/use-financial-mutations.ts:121-183` — `useCreateFinancialAdjustment`; already invalidates `shiftDashboardKeys.summary.scope` (no edit needed).
- Remote `rpc_shift_table_metrics` — already GREEN; no change.

### 9.4 Governance
- `docs/10-prd/PRD-STD-001_PRD_STANDARD.md` — PRD shape this document conforms to.
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` — invoked to justify the narrow slice (no new abstractions; mirrors existing realtime pattern).

### 9.5 SDLC Taxonomy Cross-References

| Taxonomy Category | Where Read | Purpose |
|---|---|---|
| **V&S** — Vision / Strategy | `docs/00-vision/` (compliance posture threads) | Why operator-visible reconciliation is ship-critical for pilot casino cash judgment. |
| **ARCH** — Architecture | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | No bounded-context ownership changes; read-plane consumer only. |
| **API/DATA** | `types/database.types.ts`, `rpc_shift_table_metrics` | Existing contract — no changes. |
| **SEC/RBAC** | ADR-024 casino-scope derivation; ADR-015 realtime RLS pass-through | Realtime filter must honor both. |
| **DEL/QA** | `docs/40-quality/` + ADR-044 Testing Governance | Unit + integration + E2E tests per DoD. |
| **OPS/SRE** | — | P0.3 observability; no new runbook. |
| **GOV** | `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` | Justifies the narrow slice. |
| **GOV/SURF** | N/A — this PRD patches an existing surface, does not introduce a new one | — |
| **GOV/PROV** | PRD-036 provenance columns | No regression; freshness class updates. |

### 9.6 Related, Non-Blocking Artifacts (Follow-On)
- Follow-on PRD (to be scoped) — `useSaveWithBuyIn` + `useCreateFinancialTransaction` shift-dashboard invalidation. Cited; not a dependency.
- Follow-on PRD (to be scoped) — realtime subscription on `mtl_entry` for compliance-dashboard reconciliation.
- Follow-on PRD (to be scoped) — alert-surface reconciliation (`shift_anomaly_alert` polling-vs-realtime decision).

---

## 10. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-04-19 | Lead Architect | Initial draft — read-plane reconciliation slice for the shift-dashboard Win/Loss + Est. Drop staleness identified in the 2026-04-17 investigation. Two root causes (C1 frozen window; C2 no realtime). Closes both with a rolling window + a new `use-shift-dashboard-realtime` hook. No migrations; no server changes. Out of scope: `useSaveWithBuyIn` write-plane gap, alert-surface reconciliation, `mtl_entry` realtime, `pit_cash_observation` realtime — each tracked as a follow-on. |
| v0 (amended) | 2026-04-19 | Lead Architect | Directive sweep applied. (1) Replaced blanket "no migrations / no RPC / no RLS" language with explicit **app-scope vs rollout-prerequisite** framing in §1 and §8 DoD — app-scope authors no server changes; rollout precondition is Supabase Realtime publication on `player_financial_transaction`. (2) **Option A2 (advance-params-in-queryFn)** promoted to preferred implementation in §4.1 P0.1; A1 (ticker) framed as fallback only when query-hook structure makes A2 impractical. R-1 rewritten accordingly. (3) **Latency envelope normalized:** same-tab = immediate invalidation path with hard ≤ 30 s polling fallback; cross-tab = ≤ 2 s realtime target with ≤ 30 s polling fallback. G1/G2, NFR-1/1b/2/2b, §6 happy-path and degraded-path, and DoD functionality checkboxes restated. (4) Added explicit sentence in §4.1 P0.2 on **why subscribing only to `player_financial_transaction` is sufficient** (authoritative write surface; trigger-derived telemetry is already committed when the realtime event fires). (5) Added DoD checkbox for **environment-gated realtime publication verification**. (6) R-4 **reframed as known limitation L-1** in new §7.3 Known Limitations — it is expected behavior post-merge for tabs open > 8 h, not a probabilistic risk. |
| v0 (security/test amended) | 2026-04-19 | Lead Architect | Devil's Advocate sweep applied. Added mandatory PFT SELECT and realtime event isolation preflight, including shared/cross-property player fixture; made cross-tab Playwright verification required via `e2e/shift-dashboard-realtime-reconciliation.spec.ts`; clarified browser wall-clock use for live `window.end`; removed ticker-specific observability language from the Option A2 path. |
