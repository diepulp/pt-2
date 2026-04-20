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

## P0.1b Registry Alignment Sweep — 2026-04-19

Per `FINANCIAL-FRESHNESS-ROLLOUT.md` P0.1b. Each registered fact validated against the accepted ADR-050 text (§1–§7) and the five Decisions Resolved. Rows with unresolved D1/D2/D4 ambiguity are explicitly marked; those rows do not proceed into Phase 1 or Phase 2 by default.

| Fact | Sweep verdict | Phase gate |
|---|---|---|
| `FACT-RATED-BUYIN` | **CLEAR** — D1/D2/D3/D4 fully declared; aligned with Decision #1 (one fact covers rated buy-ins and rated adjustments). | Cleared for Phase 1 exemplar. |
| `FACT-MTL-PATRON-DAILY-TOTAL` | **BLOCKED** — D4 reaction model unresolved pending P0.3 stakeholder decision (Open Verification Item #3). | Does not proceed into Phase 3 until P0.3 resolves. |
| `FACT-PIT-CASH-OBSERVATION` | **CLEAR on declaration** — D4 declared `LIVE` 2s/30s, consistent with rollout Phase 2.A (new `use-pit-cash-observation-realtime.ts` hook). Surface row updated in-sweep. | Cleared for Phase 2.A. |
| `FACT-PIT-APPROVALS` | **CLEAR with precedent extension** — D1 names two tables (`table_fill`, `table_credit`) under one fact. Sweep accepts this as a scope-analogous extension of Decision #1 (one operator-visible concept covering distinct write paths). Documented, not blocked. | Cleared for Phase 2.B. |
| `FACT-SESSION-CUSTODY` | **CLEAR** — D1=D2 correctly declared per ADR-050 §3 rule 3 (no-derivation second clause). Scope boundary (custody state with financial implications) aligned with §1. | Cleared for Phase 2.C. |

Alignment corrections applied in the same pass:

1. `FACT-PIT-CASH-OBSERVATION` D2-verification wording: "rule §3.3 of ADR-050 only applies when derivation exists" inverted §3.3's second clause. Replaced with an explicit clause cite.
2. Open Verification Item #1 cross-reference: SEC ticket filing is scheduled under `FINANCIAL-FRESHNESS-ROLLOUT.md` P0.4, not referenced in ADR-050 Appendix B as previously stated.
3. `FACT-PIT-CASH-OBSERVATION` surface row: Reaction/SLA/realtime-hook fields updated from `(TBD)` to declared `LIVE` per sweep verdict.

---

## P0.2 Publication-Membership Audit — 2026-04-19

Per `FINANCIAL-FRESHNESS-ROLLOUT.md` P0.2. One `pg_publication_tables` query per D2 candidate (and one inventory-wide query for context).

**Result:** The `supabase_realtime` publication exists (`puballtables=false`, all DML enabled) but currently contains **zero user tables**. The only populated publication is `supabase_realtime_messages_publication`, which covers internal `realtime.messages_*` partitions (Broadcast/Presence mechanism, not `postgres_changes`).

| D2 table | Current membership | Decision |
|---|---|---|
| `table_buyin_telemetry` | none | ADD-TABLE migration |
| `mtl_entry` | none | ADD-TABLE migration |
| `pit_cash_observation` | none | ADD-TABLE migration |
| `table_fill` | none | ADD-TABLE migration |
| `table_credit` | none | ADD-TABLE migration |
| `rating_slip` | none | ADD-TABLE migration |

**Decision tree resolution:** every Phase 1 / Phase 2 / Phase 3 slice ships a fresh ADD-TABLE migration. **No backfill migrations are needed anywhere** — the "ambient membership / backfill" branch of E3 has zero occurrences in the current environment.

### Material follow-on finding — `useDashboardRealtime` integrity

`hooks/dashboard/use-dashboard-realtime.tsx:83-155` subscribes via `postgres_changes` to `gaming_table`, `rating_slip`, `table_fill`, and `table_credit`. None of those tables are in any user publication. Under the Supabase Realtime contract, `postgres_changes` events require publication membership; without it, the channel connects but no WAL events are delivered. **The "in-production realtime coverage" narrative previously attributed to `useDashboardRealtime` for `FACT-PIT-APPROVALS` and `FACT-SESSION-CUSTODY` is not supported by the database state.** Whatever freshness those surfaces exhibit in production must be driven by polling / mutation-side invalidation, not WAL.

This does not block rollout — it aligns the Phase 2.B and 2.C slices with reality (ADD-TABLE, not backfill). But it is a latent surface-behavior question recorded as Open Verification Item #5 below.

---

## Facts

### `FACT-RATED-BUYIN`

**Status**: `PROPOSED` (first surface pending exemplar slice implementation)
**Definition**: A rated buy-in or rated adjustment that contributes to a gaming table's estimated drop and win/loss figures within a shift window.
**D1 — authoritative mutation source**: `player_financial_transaction` (via `rpc_create_financial_txn` for originals; `rpc_create_financial_adjustment` for adjustments).
**D2 — canonical freshness event source**: `table_buyin_telemetry` (read-symmetric with `rpc_shift_table_metrics`; Pattern C direct casino-scope RLS; bridge-terminal; idempotency key `pft:{id}`).
**D2 verification**: RLS posture consistent across both 2026-04-19 investigation streams. Publication membership confirmed absent by P0.2 audit — **ADD-TABLE migration required** (no backfill path; `supabase_realtime` publication is empty) before the Phase 1 exemplar surface goes `ACTIVE`.

**Registered surfaces:**

| Surface | Status | Hooks | Reaction | SLA | Realtime hook | Window correctness | Owner context |
|---|---|---|---|---|---|---|---|
| `components/shift-dashboard-v3/shift-dashboard-v3.tsx` | `PROPOSED` | `hooks/shift-dashboard/use-shift-dashboard-summary.ts`, `hooks/shift-dashboard/use-shift-table-metrics.ts` | `LIVE` | 2s realtime / 30s fallback | `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` *(pending exemplar slice)* | Rolling-window refactor of `shift-dashboard-v3.tsx:87` *(pending exemplar slice)* | Shift Intelligence |

---

### `FACT-MTL-PATRON-DAILY-TOTAL`

**Status**: `PROPOSED` **[P0.1b sweep: BLOCKED on P0.3 — D4 reaction model pending stakeholder decision; see Open Verification Item #3]**
**Definition**: Per-patron per-gaming-day aggregate of cash-in / cash-out volume used for CTR threshold tracking and compliance reporting.
**D1 — authoritative mutation source**: `player_financial_transaction` (indirect, via the forward bridge to MTL) for any operational money movement; `mtl_entry` direct write via `useCreateMtlEntry` for compliance-audit correction.
**D2 — canonical freshness event source**: `mtl_entry`.
**D2 verification**: Pattern C direct casino-scope RLS. Publication membership confirmed absent by P0.2 audit — **ADD-TABLE migration required** before first surface goes `ACTIVE`.

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
**D2 — canonical freshness event source**: `pit_cash_observation` (D1 = D2 per ADR-050 §3 rule 3, no-derivation second clause).
**D2 verification**: Pattern C direct casino-scope RLS + actor binding. Publication membership confirmed absent by P0.2 audit — **ADD-TABLE migration required** before surface goes `ACTIVE`.

**Registered surfaces:**

| Surface | Status | Hooks | Reaction | SLA | Realtime hook | Window correctness | Owner context |
|---|---|---|---|---|---|---|---|
| `components/shift-dashboard-v3/shift-dashboard-v3.tsx` (cash-obs cards) | `PENDING-BACKFILL` | `hooks/shift-dashboard/use-cash-obs-summary.ts`, `hooks/shift-dashboard/use-cash-observations.ts` | `LIVE` | 2s realtime / 30s fallback | `hooks/shift-dashboard/use-pit-cash-observation-realtime.ts` *(not yet implemented; ships with Phase 2.A)* | Inherits shift-dashboard rolling-window fix | Shift Intelligence |

---

### `FACT-PIT-APPROVALS`

**Status**: `PROPOSED` (surface has in-production realtime coverage but requires E3 publication-membership backfill and §4 E2 window-correctness fix before any surface promotes to `ACTIVE`; inherited realtime is not presumed compliant per `FINANCIAL-FRESHNESS-ROLLOUT.md` Phase 2 validation note)
**Definition**: Pending fills and credits awaiting cashier confirmation, plus confirmed amounts with discrepancy flags.
**D1 — authoritative mutation source**: `table_fill`, `table_credit`.
**D2 — canonical freshness event source**: `table_fill`, `table_credit` (D1 = D2).
**D2 verification**: Pattern C direct casino-scope RLS (both tables, per `supabase/migrations/20251211153228_adr015_rls_compliance_patch.sql`). Publication membership confirmed absent by P0.2 audit for both tables — **ADD-TABLE migration required for each** (previous "ambient membership via `useDashboardRealtime`" framing was wrong; see Open Verification Item #5 for the underlying surface-behavior question). No backfill path exists.

**Registered surfaces:**

| Surface | Status | Hooks | Reaction | SLA | Realtime hook | Window correctness | Owner context |
|---|---|---|---|---|---|---|---|
| `components/pit-panels/exceptions-approvals-panel.tsx` | `PENDING-BACKFILL` | `hooks/dashboard/use-exceptions-data.ts` | `LIVE` (in practice) | 2s realtime / 60s fallback (today) | `hooks/dashboard/use-dashboard-realtime.tsx` | **VIOLATION** — `use-exceptions-data.ts:149-150` freezes window at mount (ADR-050 §4 E2). Requires rolling-window fix for `ACTIVE` status. | Operations |

---

### `FACT-SESSION-CUSTODY`

**Status**: `PROPOSED` (surface has in-production realtime coverage but requires E3 publication-membership backfill before any surface promotes to `ACTIVE`; inherited realtime is not presumed compliant per `FINANCIAL-FRESHNESS-ROLLOUT.md` Phase 2 validation note)
**Definition**: Rating-slip lifecycle state (open / paused / closed) and table occupancy used for operator seat management. Not a financial balance itself, but a **custody state with financial implications** per ADR-050 §1 scope boundary — open slips hold player financial context; incorrect custody produces reconciliation errors.
**D1 — authoritative mutation source**: `rating_slip`.
**D2 — canonical freshness event source**: `rating_slip`.
**D2 verification**: Pattern C direct casino-scope RLS. Publication membership confirmed absent by P0.2 audit — **ADD-TABLE migration required** (previous "observed in practice via `useDashboardRealtime`" framing was wrong; see Open Verification Item #5). No backfill path exists.

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

1. **PFT RLS posture** — the 2026-04-19 investigation streams disagreed on whether `player_financial_transaction`'s SELECT policy is Pattern C direct or EXISTS-indirect. Per ADR-050 Appendix A, this ADR does not assert PFT's realtime eligibility. **Resolution required** before any future fact is registered with PFT as its D2 (currently none are). SEC ticket filing is scheduled under `FINANCIAL-FRESHNESS-ROLLOUT.md` P0.4 (PFT RLS re-audit).
2. ~~**Publication membership inventory**~~ — **RESOLVED 2026-04-19 via P0.2 audit.** The `supabase_realtime` publication exists with zero user tables; all six D2 tables named by the registry require ADD-TABLE migrations, and no backfill path exists. See "P0.2 Publication-Membership Audit" section above.
3. **MTL compliance-dashboard reaction model** — is intra-day CTR threshold alerting operationally required, or is the per-gaming-day snapshot model sufficient? This determines whether `FACT-MTL-PATRON-DAILY-TOTAL`'s first surface is `LIVE` or `INTERVAL`.
4. **`hooks/mtl/use-mtl-mutations.ts:85-101`** — the reverse-bridge comment and dead `playerFinancialKeys` invalidation block. Per ADR-050 Appendix A, this is a registry-visible smell: `useCreateMtlEntry` does not produce a `player_financial_transaction`, so the invalidation is out of contract. Cleanup is not blocking registration of `FACT-MTL-PATRON-DAILY-TOTAL`; triage under a separate ticket.
5. **`useDashboardRealtime` `postgres_changes` integrity** — discovered 2026-04-19 via P0.2 audit. `hooks/dashboard/use-dashboard-realtime.tsx:83-155` subscribes via `postgres_changes` to `gaming_table`, `rating_slip`, `table_fill`, `table_credit`. Per P0.2 audit, none of those tables are in any user publication, so `postgres_changes` cannot deliver WAL events. Production freshness for `FACT-PIT-APPROVALS` and `FACT-SESSION-CUSTODY` surfaces must therefore come from polling / mutation-side invalidation, not WAL. Required: verify which mechanism is actually driving observed freshness, and decide whether the `postgres_changes` subscriptions should be (a) backed by their ADD-TABLE migrations (Phase 2.B / 2.C intent), or (b) removed as dead code. Does not block Phase 2.B / 2.C ADD-TABLE migrations — those are the intended fix either way.

---

## Changelog

| Date | Change | Author |
|---|---|---|
| 2026-04-19 | Scaffold created alongside ADR-050 draft. All five seed facts registered at fact-level `PROPOSED`: `FACT-RATED-BUYIN`, `FACT-MTL-PATRON-DAILY-TOTAL`, `FACT-PIT-CASH-OBSERVATION`, `FACT-PIT-APPROVALS`, `FACT-SESSION-CUSTODY`. `FACT-PIT-APPROVALS` and `FACT-SESSION-CUSTODY` have in-production realtime coverage at the surface level but still require E3 publication-membership backfill (and, for `FACT-PIT-APPROVALS`, §4 E2 window correctness) before any surface promotes to `ACTIVE`; their surface rows are `PENDING-BACKFILL`. Pending-backfill queue listed. Four open verification items recorded. | Architecture Review |
| 2026-04-19 | Bundle review sign-off: corrected fact-level status for `FACT-PIT-APPROVALS` and `FACT-SESSION-CUSTODY` (initial scaffold mislabeled both `ACTIVE` against the vocabulary at lines 49–53). Changelog scaffold entry rewritten with level-correct vocabulary (fact-level statuses are `ACTIVE` / `PROPOSED` / `OPEN-VERIFICATION` only; `PENDING-BACKFILL` is a surface-level status). Surface rows unchanged. ADR-050 header flipped `DRAFT → ACCEPTED` in the same commit. | Architecture Review |
| 2026-04-19 | **P0.1b Registry Alignment Sweep** (commit immediately after P0.1 acceptance). Per-fact verdicts: `FACT-RATED-BUYIN` CLEAR, `FACT-MTL-PATRON-DAILY-TOTAL` BLOCKED on P0.3, `FACT-PIT-CASH-OBSERVATION` cleared with D4=LIVE declared (consistent with rollout Phase 2.A), `FACT-PIT-APPROVALS` cleared with two-table D1 accepted as scope-analogous extension of Decision #1, `FACT-SESSION-CUSTODY` CLEAR. Alignment corrections: `FACT-PIT-CASH-OBSERVATION` §3.3 citation inverted → fixed; Open Verification Item #1 SEC-ticket cross-reference re-pointed from ADR-050 Appendix B to rollout P0.4. New sweep section added after Status vocabulary. | Architecture Review |
| 2026-04-19 | **P0.2 Publication-Membership Audit** — one `pg_publication_tables` query per D2 candidate. Result: `supabase_realtime` publication exists with zero user tables; all six D2 tables require ADD-TABLE migrations, no backfill path exists. OVI #2 resolved. Fact-level D2-verification narratives for all five facts updated to cite the audit and remove outdated "backfill" / "ambient membership" framing. OVI #5 opened: `useDashboardRealtime` subscribes `postgres_changes` to unpublished tables, so `FACT-PIT-APPROVALS` / `FACT-SESSION-CUSTODY` production freshness is not actually WAL-driven; underlying driver (polling vs. mutation invalidation) must be verified but does not block Phase 2.B / 2.C ADD-TABLE migrations. Rollout 2.B / 2.C "backfill" framing corrected to ADD-TABLE in companion commit to `FINANCIAL-FRESHNESS-ROLLOUT.md`. | Architecture Review |
