# Registry — Financial Surface Freshness Contract

**Companion artifact to [ADR-050](../80-adrs/ADR-050-financial-surface-freshness-contract.md).**
**Status**: scaffolding (first fact seeded; remaining facts pending backfill)
**Last amended**: 2026-04-19
**Owner**: Architecture Review

---

## Purpose

This registry is the single enumeration of **financially meaningful facts** in PT-2 and the **UI surfaces that consume them**. It is the authoritative list referenced by ADR-050 §5.

If a financial fact is not registered here, it is not governed. If a surface consumes a registered fact without appearing in that fact's row, it is out of contract.

This document is normative. Appendix A of ADR-050 is descriptive (topology snapshot); this file is the contract's active data.

---

## Amendment procedure

Any PR that:

- adds a new financially meaningful fact (per ADR-050 §1 scope boundary), OR
- adds a new surface consuming a registered fact, OR
- changes a surface's reaction model, SLA, or realtime hook, OR
- changes a fact's D1 authoritative mutation source or D2 canonical event source

MUST amend this file in the same PR. PRs that add financial UI without a corresponding registry amendment fail review.

Amendment format: edit the relevant fact's surface table, increment `Last amended` at the top of this file, and include a one-line changelog entry at the bottom under **Changelog**.

---

## Status vocabulary

Per surface row:

| Status | Meaning |
|---|---|
| `ACTIVE` | Surface meets its declared reaction model and SLA in production. |
| `PROPOSED` | Surface is registered but the implementation (realtime hook, window fix, publication membership) is not yet merged. |
| `PENDING-BACKFILL` | Surface pre-dates this contract and is known to be out of compliance. Registered here as a work item; remediation is scheduled. |
| `DEFERRED` | Surface is registered but intentionally not remediated in the current cycle; cite the governing PRD or ADR. |
| `RETIRED` | Surface no longer exists or no longer consumes this fact. Row retained for history. |

Per fact header:

| Status | Meaning |
|---|---|
| `ACTIVE` | Fact is registered with at least one `ACTIVE` surface and a verified D2. |
| `PROPOSED` | Fact is registered but no surface is yet `ACTIVE`. |
| `OPEN-VERIFICATION` | D2 RLS posture or publication membership is unresolved; see Open Verification Items. |

---

## Facts

### `FACT-RATED-BUYIN`

**Status**: `PROPOSED` (first surface blocked on EXEC-066 resumption)
**Definition**: A rated buy-in or rated adjustment that contributes to a gaming table's estimated drop and win/loss figures within a shift window.
**D1 — authoritative mutation source**: `player_financial_transaction` (via `rpc_create_financial_txn` for originals; `rpc_create_financial_adjustment` for adjustments).
**D2 — canonical freshness event source**: `table_buyin_telemetry` (read-symmetric with `rpc_shift_table_metrics`; Pattern C direct casino-scope RLS; bridge-terminal; idempotency key `pft:{id}`).
**D2 verification**: RLS posture consistent across both 2026-04-19 investigation streams. Publication membership **not yet declared via migration** — required backfill or new ADD-TABLE migration before first surface goes `ACTIVE` (ADR-050 §4 E3).

**Registered surfaces:**

| Surface | Status | Hooks | Reaction | SLA | Realtime hook | Window correctness | Owner context |
|---|---|---|---|---|---|---|---|
| `components/shift-dashboard-v3/shift-dashboard-v3.tsx` | `PROPOSED` | `hooks/shift-dashboard/use-shift-dashboard-summary.ts`, `hooks/shift-dashboard/use-shift-table-metrics.ts` | `LIVE` | 2s realtime / 30s fallback | `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` *(not yet implemented; ships with EXEC-066)* | Rolling-window refactor of `shift-dashboard-v3.tsx:87` *(not yet implemented; ships with EXEC-066)* | Shift Intelligence |

---

### `FACT-MTL-PATRON-DAILY-TOTAL`

**Status**: `PROPOSED`
**Definition**: Per-patron per-gaming-day aggregate of cash-in / cash-out volume used for CTR threshold tracking and compliance reporting.
**D1 — authoritative mutation source**: `player_financial_transaction` (indirect, via the forward bridge to MTL) for any operational money movement; `mtl_entry` direct write via `useCreateMtlEntry` for compliance-audit correction.
**D2 — canonical freshness event source**: `mtl_entry`.
**D2 verification**: Pattern C direct casino-scope RLS. Publication membership **not yet declared via migration** — required backfill before first surface goes `ACTIVE`.

**Registered surfaces:**

| Surface | Status | Hooks | Reaction | SLA | Realtime hook | Window correctness | Owner context |
|---|---|---|---|---|---|---|---|
| `components/mtl/compliance-dashboard.tsx` | `PENDING-BACKFILL` | `hooks/mtl/use-gaming-day-summary.ts`, `hooks/mtl/use-patron-daily-total.ts` | *(TBD — currently INTERVAL 15s, no realtime)* | *(TBD)* | *(not yet implemented)* | Gaming-day-scoped (operator-driven date navigation) — qualifies as MANUAL window semantics if reaction model is downgraded from INTERVAL | Compliance / MTL |

*Open question: should compliance dashboard be LIVE (intra-day threshold alerts) or INTERVAL (snapshot per gaming day)? See Open Verification Items.*

---

### `FACT-PIT-CASH-OBSERVATION`

**Status**: `PROPOSED`
**Definition**: Walk-with and phone-confirmed cash observations entered by pit staff for operational reconciliation and shift-level cash-obs rollups.
**D1 — authoritative mutation source**: `pit_cash_observation` (via `rpc_create_pit_cash_observation`). No upstream bridge.
**D2 — canonical freshness event source**: `pit_cash_observation` (D1 = D2; rule §3.3 of ADR-050 only applies when derivation exists).
**D2 verification**: Pattern C direct casino-scope RLS + actor binding. Publication membership **not yet declared via migration**.

**Registered surfaces:**

| Surface | Status | Hooks | Reaction | SLA | Realtime hook | Window correctness | Owner context |
|---|---|---|---|---|---|---|---|
| `components/shift-dashboard-v3/shift-dashboard-v3.tsx` (cash-obs cards) | `PENDING-BACKFILL` | `hooks/shift-dashboard/use-cash-obs-summary.ts`, `hooks/shift-dashboard/use-cash-observations.ts` | *(TBD — currently INTERVAL 30–60s, no realtime)* | *(TBD)* | *(not yet implemented)* | Inherits shift-dashboard rolling-window fix | Shift Intelligence |

---

### `FACT-PIT-APPROVALS`

**Status**: `ACTIVE` (existing realtime coverage; registration is a formality)
**Definition**: Pending fills and credits awaiting cashier confirmation, plus confirmed amounts with discrepancy flags.
**D1 — authoritative mutation source**: `table_fill`, `table_credit`.
**D2 — canonical freshness event source**: `table_fill`, `table_credit` (D1 = D2).
**D2 verification**: Pattern C direct casino-scope RLS (both tables, per `supabase/migrations/20251211153228_adr015_rls_compliance_patch.sql`). Publication membership currently realtime-observed by `useDashboardRealtime` — **membership source must be verified against migration history (E3 backfill)** before status is confirmed `ACTIVE` under this contract.

**Registered surfaces:**

| Surface | Status | Hooks | Reaction | SLA | Realtime hook | Window correctness | Owner context |
|---|---|---|---|---|---|---|---|
| `components/pit-panels/exceptions-approvals-panel.tsx` | `PENDING-BACKFILL` | `hooks/dashboard/use-exceptions-data.ts` | `LIVE` (in practice) | 2s realtime / 60s fallback (today) | `hooks/dashboard/use-dashboard-realtime.tsx` | **VIOLATION** — `use-exceptions-data.ts:149-150` freezes window at mount (ADR-050 §4 E2). Requires rolling-window fix for `ACTIVE` status. | Operations |

---

### `FACT-SESSION-CUSTODY`

**Status**: `ACTIVE` (existing realtime coverage; registration is a formality)
**Definition**: Rating-slip lifecycle state (open / paused / closed) and table occupancy used for operator seat management. Not a financial balance itself, but a **custody state with financial implications** per ADR-050 §1 scope boundary — open slips hold player financial context; incorrect custody produces reconciliation errors.
**D1 — authoritative mutation source**: `rating_slip`.
**D2 — canonical freshness event source**: `rating_slip`.
**D2 verification**: Pattern C direct casino-scope RLS. Publication membership observed in practice via `useDashboardRealtime`; E3 backfill required.

**Registered surfaces:**

| Surface | Status | Hooks | Reaction | SLA | Realtime hook | Window correctness | Owner context |
|---|---|---|---|---|---|---|---|
| `components/dashboard/pit-dashboard-client.tsx` | `PENDING-BACKFILL` | `hooks/dashboard/use-dashboard-tables.ts`, `hooks/dashboard/use-dashboard-stats.ts`, `hooks/dashboard/use-active-slips-for-dashboard.ts` | `LIVE` (in practice) | 2s realtime / 30s fallback | `hooks/dashboard/use-dashboard-realtime.tsx` | Table-scoped, no frozen-window exposure | Operations |

*Pending cleanup item: `ratingSlipKeys.activeForTable` vs `dashboardKeys.activeSlips` factory mismatch — mutations invalidate the rating-slip factory while the dashboard reads via the dashboard factory. Currently masked because realtime re-invalidates the dashboard factory on WAL events. Not a contract violation but a registry-visible smell; triage under a separate cleanup ticket.*

---

## Pending backfill — existing surfaces not yet registered

The following financially responsible surfaces were identified in the 2026-04-19 audit and require registration as contract rollout proceeds. Each gets its own fact and row as it is processed; do not register speculatively.

| Surface | Likely fact(s) | Known violations |
|---|---|---|
| `components/pit-panels/closed-sessions-panel.tsx` | `FACT-SESSION-CUSTODY` (closed-slip replay) | None identified; candidate for `INTERVAL` 30s classification |
| `components/pit-panels/analytics-panel.tsx` | `FACT-RATED-BUYIN` (historical), `FACT-SESSION-CUSTODY` (historical) | None; candidate for `MANUAL` with as-of timestamp |
| Rating-slip modal totals (`hooks/rating-slip-modal/*`) | `FACT-RATED-BUYIN`, `FACT-MTL-PATRON-DAILY-TOTAL` (via `usePatronDailyTotal` for threshold gating) | Inline loyalty keys at `use-close-with-financial.ts:221` and `use-move-player.ts:305` violate §4 E1 |
| `app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper.tsx` | `FACT-MTL-PATRON-DAILY-TOTAL` (historical) | Candidate for `MANUAL` |
| `components/mtl/gaming-day-summary.tsx` | `FACT-MTL-PATRON-DAILY-TOTAL` | Inherits compliance-dashboard reaction model question |

---

## Open verification items

These must be resolved before their referenced entries can be promoted to `ACTIVE`.

1. **PFT RLS posture** — the 2026-04-19 investigation streams disagreed on whether `player_financial_transaction`'s SELECT policy is Pattern C direct or EXISTS-indirect. Per ADR-050 Appendix A, this ADR does not assert PFT's realtime eligibility. **Resolution required** before any future fact is registered with PFT as its D2 (currently none are). Tracked independently of this registry; see the pending SEC ticket referenced in ADR-050 Appendix B.
2. **Publication membership inventory** — no migration under `supabase/migrations/` declares membership for any of the D2 tables named in this registry. A one-time audit against `pg_publication_tables` is required to determine which D2 tables already have ambient membership (must be backfilled into migration history per §4 E3) versus which require a new ADD-TABLE migration on first activation.
3. **MTL compliance-dashboard reaction model** — is intra-day CTR threshold alerting operationally required, or is the per-gaming-day snapshot model sufficient? This determines whether `FACT-MTL-PATRON-DAILY-TOTAL`'s first surface is `LIVE` or `INTERVAL`.
4. **`hooks/mtl/use-mtl-mutations.ts:85-101`** — the reverse-bridge comment and dead `playerFinancialKeys` invalidation block. Per ADR-050 Appendix A, this is a registry-visible smell: `useCreateMtlEntry` does not produce a `player_financial_transaction`, so the invalidation is out of contract. Cleanup is not blocking registration of `FACT-MTL-PATRON-DAILY-TOTAL`; triage under a separate ticket.

---

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-04-19 | Scaffold created alongside ADR-050 draft. Seeded `FACT-RATED-BUYIN` (PROPOSED), `FACT-MTL-PATRON-DAILY-TOTAL` (PROPOSED), `FACT-PIT-CASH-OBSERVATION` (PROPOSED), `FACT-PIT-APPROVALS` (PENDING-BACKFILL for existing realtime coverage), `FACT-SESSION-CUSTODY` (PENDING-BACKFILL for existing realtime coverage). Pending-backfill queue listed. Four open verification items recorded. | Architecture Review |
