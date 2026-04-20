# ADR-050: Financial Surface Freshness Contract

**Status**: ACCEPTED
**Date Drafted**: 2026-04-19
**Date Accepted**: 2026-04-19
**Decision Makers**: Architecture Review
**Validation**: Lint rule for E1, E2E window-correctness probes for E2, publication-membership audit query for E3. The shift-dashboard exemplar slice is this ADR's first reference implementation and drives validation of the standing enforcement.
**Related**: ADR-004 (real-time strategy, extended in the financial domain by this ADR), ADR-015 (RLS hybrid), ADR-025 (MTL authorization), ADR-031 (financial amount convention), ADR-041 (surface governance), ADR-049 (operator action atomicity)

---

## Context

PT-2 has a working **write-path standard** for financially meaningful facts: one authoritative mutation (`player_financial_transaction`), one atomic derivation fan-out (triggers to `table_buyin_telemetry` and `mtl_entry`), and casino-scoped RLS on every derived table. That half is solved.

What PT-2 does **not** have is a **read-plane freshness standard**. When a single financial fact changes, there is no common rule that governs which UI surfaces must update, which tables they subscribe to, which query keys they invalidate, or what freshness SLA they owe the operator. Each surface has invented its own answer. Evidence from the 2026-04-19 audit (see Appendix A):

- Only one mutation hook (`useCreateFinancialAdjustment`) invalidates shift-dashboard query keys. Buy-ins, cash-outs, and pit cash observations do not — so operators see stale numbers unless the mutation happens to be an adjustment.
- Two surfaces freeze their time window at mount with `useState(() => window)` and then rely on polling that refetches the same frozen window indefinitely: `components/shift-dashboard-v3/shift-dashboard-v3.tsx:87` and `hooks/dashboard/use-exceptions-data.ts:149-150`. Both exclude post-mount mutations from their own display.
- Two operationally load-bearing surfaces — shift-dashboard and MTL compliance — have **zero realtime subscriptions**, including one compliance-critical surface.
- Two mutation hooks (`use-close-with-financial.ts:221`, `use-move-player.ts:305`) invalidate loyalty queries using inline hard-coded key arrays rather than the `loyaltyKeys` factory.
- No migration calls `ALTER PUBLICATION supabase_realtime ADD TABLE` for any financial table. Publication membership is ambient, unverified, and drift-prone.
- A comment in `hooks/mtl/use-mtl-mutations.ts:85-90` describes a "bidirectional bridge" whose database trigger was proposed and deleted within a 21-hour window (commits `3d9f8262f` → `b6f4c1f3`, 2026-01-19 to 2026-01-20). The accompanying invalidation block still fires against a non-event.

Several of these items are bugs in their own right. They are called out here not to relitigate them, but to show that they are individual defects arising from a shared missing standard: the bridge already derives the correct rows, and nothing downstream guarantees that every financially responsible surface observes the result coherently and on time.

This ADR does not re-engineer the bridge. It formalizes the freshness promise that must hold on top of whatever derivation graph exists.

---

## Decision

### §1 — Four Mandatory Declarations per Financial Fact

Every financially meaningful fact in PT-2 is governed by exactly four declarations. A fact is any piece of data whose change, if unobserved by an operator, could produce incorrect operator judgment, regulatory exposure, or reconciliation error.

**Scope boundary.** This ADR governs facts that directly change financial balances, derived financial metrics, custody state with financial implications, or compliance totals tied to money movement. It does **not** automatically govern general operational telemetry, UX workflow state, or non-financial CRM state. A fact that is purely operational (e.g., which tab an operator has open) is outside this contract even if it happens to live adjacent to financial data.

**D2 is a freshness trigger, not the totality of provenance.** D2 governs *when* consumers are notified that a fact may have changed. It does not replace or collapse upstream provenance, derivation semantics, or audit lineage, which continue to live in the write-path standards (ADR-015, ADR-025, ADR-031, ADR-049).

| Declaration | Definition |
|---|---|
| **D1 — Authoritative mutation source** | The single table whose write defines the fact as having changed. Example: `player_financial_transaction` for money movement; `pit_cash_observation` for walk-with cash telemetry; `rating_slip` for session custody state. |
| **D2 — Canonical freshness event source** | The single table whose WAL event downstream consumers subscribe to. Must be the same level at which the financially responsible metric is read. May differ from D1 when D1 is upstream of derivation (example: D1=`player_financial_transaction`, D2=`table_buyin_telemetry` because `rpc_shift_table_metrics` reads TBT, not PFT). |
| **D3 — Registered consumer surfaces** | An enumerated list of UI surfaces that must react. Each entry names: surface file, hooks consumed, bounded context. No wildcards. New surfaces consuming the fact require an amendment to the registry. |
| **D4 — Reaction model + freshness SLA** | One of {LIVE, INTERVAL, MANUAL} (see §2) with a concrete SLA number, not a qualitative description. |

A fact without all four declarations is out of compliance. A surface consuming a fact without being in D3 is out of compliance.

### §2 — Reaction Models and Freshness SLAs

Three reaction models, no others:

**LIVE** — realtime subscription to D2 with polling fallback.
- Mount the canonical realtime hook for D2.
- Fallback polling interval ≤ 30s.
- SLA: operator sees new fact within **≤ 2s** under nominal conditions; **≤ 30s** under degraded realtime.
- Required for any surface used for in-shift operator judgment or real-time compliance gating.

**INTERVAL** — polling only, explicit upper bound.
- No realtime subscription.
- SLA: operator sees new fact within the declared polling interval. Declared SLA is capped at 60s.
- Required to document why realtime is not used (cost, noise, non-operational surface).
- Permitted for historical/audit surfaces where sub-minute lag is acceptable.

**MANUAL** — operator refresh.
- No automatic refetch. User action (tab navigation, button, date picker) triggers fetch.
- SLA: "as-of last fetch" — must be displayed to the operator in-UI.
- Permitted only for analytics, historical timelines, and post-hoc audit views. Never for surfaces feeding in-shift decisions.

**As-of timestamp is mandatory for MANUAL.** A surface declared MANUAL MUST render a visible "as-of" timestamp alongside the financial value(s), so operators cannot mistake a stale snapshot for live data. This requirement is part of the contract and enforceable at review time today; a shared `<AsOfBadge />` component to standardize the presentation is a planned follow-on but is not a prerequisite for compliance.

### §3 — Canonical Freshness Event Source Selection Rule

D2 must be chosen by this rule, applied in order:

1. **Read-symmetric**: D2 MUST be the same table (or a view over it) that the surface's read path aggregates. If `rpc_shift_table_metrics` reads `table_buyin_telemetry`, D2 is `table_buyin_telemetry`. Subscribing "one layer upstream" is prohibited.
2. **RLS-safe (PT-2 governance rule)**: for PT-2, tables with indirect or `EXISTS`-based SELECT policies are **disfavored and presumed ineligible** as D2 candidates unless explicitly verified for realtime correctness under the project's Supabase configuration and approved by architecture review. Pattern C hybrid direct casino-scope (per ADR-015) is the default-eligible posture. This is a project governance rule, not a claim about what WAL-time RLS evaluation can or cannot do in all circumstances; the rule exists to prevent silently unsafe subscriptions from reaching production without an explicit eligibility review.
3. **Bridge-terminal**: If the fact is produced by a derivation trigger, D2 is the **derived** table, not the source. This reuses the bridge output as the freshness signal instead of creating a second subscription surface. If no derivation trigger exists (the fact is written directly to its read-facing table), D2 equals D1 — this is permitted and expected for non-derived facts such as `pit_cash_observation`.
4. **Idempotent-indexed**: D2 must have an idempotency key or equivalent primary key so that realtime delivery duplication is survivable.

Rules 1 and 3 together encode the EXEC-066 pivot documented in `docs/issues/shift-dash/ALTENATE-DIRECTION.md`: subscribe to `table_buyin_telemetry`, not `player_financial_transaction`.

### §4 — Enforcement Rules

These three rules make the contract self-policing. Violations are findings, not style preferences.

**E1 — Factory-only invalidation keys.**
Every `queryClient.invalidateQueries` / `removeQueries` / `setQueryData` call in a mutation hook whose write produces a fact in the registry MUST use a key from a registered factory (`shiftDashboardKeys`, `mtlKeys`, `playerFinancialKeys`, `loyaltyKeys`, `dashboardKeys`, `ratingSlipKeys`, etc.). Inline tuple literals are prohibited. Enforced by code review today; the specifics of a custom ESLint rule (detection of inline `queryKey: [...]` literals in mutation hooks, allowlisted factories, exemptions for non-financial hooks) are tracked as a follow-on implementation ticket rather than specified in this ADR.

**E2 — Window-correctness proof.**
Every financially responsible query whose key includes a time window MUST prove that the window can include mutations committed after mount. Proof takes one of two forms: (a) the window advances on each refetch (tick counter or `queryFn`-time recompute), or (b) the surface is explicitly declared MANUAL with a visible as-of timestamp and no auto-refetch. Surfaces that silently freeze their window while auto-refetching are in violation.

**E3 — Declared, version-controlled publication membership.**
Publication membership for any D2 must be declared and version-controlled, normally via an `ALTER PUBLICATION supabase_realtime ADD TABLE <d2>` migration committed under `supabase/migrations/` with the normal naming convention. Ambient or dashboard-created membership is not sufficient for long-term compliance. Existing unmanaged membership (membership that is present in the running database but absent from migration history) must be **backfilled** into migration history before the table is considered a supported D2 under this contract. New D2 candidates that have no current membership at all ship the ADD-TABLE migration in the same PR that registers them.

### §5 — Consumer Surface Registry Format

The registry lives at `docs/20-architecture/REGISTRY_FINANCIAL_SURFACES.md` (created alongside this ADR). One row per (fact × surface) pair. Required columns:

| Column | Content |
|---|---|
| `fact_id` | Stable identifier (e.g., `FACT-RATED-BUYIN`, `FACT-MTL-PATRON-TOTAL`) |
| `D1_source` | Authoritative mutation source table |
| `D2_event_source` | Canonical freshness event source table |
| `surface` | Route or component file path |
| `hooks` | Hooks consumed (file paths) |
| `reaction_model` | LIVE / INTERVAL / MANUAL |
| `sla_seconds` | Concrete number |
| `realtime_hook` | Hook file path if LIVE; empty otherwise |
| `window_correctness` | Link to proof comment in query hook, or MANUAL+as-of declaration |
| `owner_context` | Bounded context per SRM |

**Granularity.** D3 registers **operator-visible consumer surfaces** (routes or top-level components the operator interacts with) and the **primary consuming hooks** that drive the financial display on those surfaces. It does **not** enumerate every nested helper component, every presentational child, or every utility hook reached transitively. The intent is a registry of meaningful read-plane participants, not an audit of every file that touches a query.

The registry is authoritative. Adding a financial fact to the system, or adding a surface that consumes one, requires a registry amendment in the same PR. PRs that add financial UI without amending the registry fail review.

### §6 — Change Control

- **Adding a new financial fact**: create a registry entry, declare D1–D4, ship the D2 publication migration (E3) and the canonical realtime hook (if LIVE) in the same PR.
- **Adding a new surface consuming an existing fact**: amend the registry row to add the surface; implement the reaction model using the existing canonical realtime hook. Do not create parallel subscriptions to the same D2.
- **Removing a derivation edge** (e.g., dropping a trigger): the registry row(s) referencing the affected D2 must be re-evaluated in the same PR. A D2 that no longer receives writes is a latent dead-event source.
- **Changing a reaction model** (e.g., promoting INTERVAL → LIVE): requires an amendment, not a silent hook change.

### §7 — Out of Scope

- This ADR does not decide which tables should have reverse-derivation triggers. The rating-slip ↔ MTL reverse bridge (proposed then deleted 2026-01-20) remains deferred under PRD-065.
- This ADR does not mandate any particular caching library or redesign of the realtime transport layer. It constrains how ADR-004's machinery is used in the financial domain.
- This ADR does not address write-path atomicity. `INV-MTL-BRIDGE-ATOMICITY` and ADR-049 already govern that.

---

## Consequences

### Positive

1. **One explanation, not N.** A new engineer adding a financial UI asks the same four questions instead of inventing their own answers. The ghost of the missing standard ("why does the buy-in update feel convoluted?") is answered once.
2. **Enforcement instead of vigilance.** E1 (factory rule), E2 (window rule), and E3 (publication rule) catch the three concrete bug classes the 2026-04-19 audit found, without relying on code review alertness.
3. **Operator SLAs become contractual.** Freshness is no longer an implicit expectation. A MANUAL surface that silently drifts into operator decision-making is visibly wrong — its reaction model and SLA are declared, and promoting it requires an amendment.
4. **Registry forces the conversation.** Adding a financially responsible surface without the amendment is a governance violation, not a style nit. This scales: the contract does not depend on any single reviewer knowing the whole read-plane.

### Negative

1. **Registry overhead.** Every financial UI change adds a registry amendment. This is the intended cost. Pilots that skip the registry in a hurry must be called out.
2. **Publication migrations must be backfilled.** The first implementation of this ADR (EXEC-066) must add the TBT publication migration. Every subsequent fact that already reads from a derived table carries a one-time migration debt.
3. **Lint rule for E1 must be written.** Until the rule ships, E1 is enforced by review only.
4. **Some surfaces will reveal their true class.** Surfaces that were implicitly treating themselves as LIVE while actually INTERVAL (shift-dashboard today) must either upgrade to LIVE with realtime + fallback or downgrade to INTERVAL with an explicit SLA the operator sees.

### Neutral / Latent

1. **The stale comment at `hooks/mtl/use-mtl-mutations.ts:85-90` and the dead invalidation block at `:91-101` are not fixed by this ADR.** They are correctly captured by the registry: if direct MTL entry does not produce a `player_financial_transaction`, the invalidation of `playerFinancialKeys` on `useCreateMtlEntry` success is out of contract and should be removed in a follow-up. The contract makes the finding visible; it does not mandate a specific cleanup.
2. **The shift-dashboard exemplar slice becomes the first reference implementation.** It is drafted natively against this ADR (D1–D4 declarations, §4 E1/E2/E3 workstreams, registry promotion), not as a continuation of any prior spec. It retargets to TBT per §3, ships the first publication migration (or backfill) per E3, and the shift-dashboard surface becomes the first `ACTIVE` registry row. Subsequent surfaces inherit the pattern via the Replication Checklist produced at the exemplar's merge.

---

## Appendix A — Current Derivation Topology (2026-04-19)

Descriptive snapshot. Not normative. Updated when the topology changes.

```
                   ┌────────────────────────┐
                   │ player_financial_      │  D1 — authoritative write
                   │ transaction (PFT)      │    rpc_create_financial_txn()
                   └──────┬─────────┬───────┘
                          │         │
                          │         │
       trg_bridge_        │         │  trg_derive_mtl_from_finance
       finance_to_        │         │  (widened 2026-02-17 for
       telemetry          ▼         ▼   adjustments/reversals)
                   ┌────────────┐ ┌────────────┐
                   │ table_     │ │ mtl_entry  │  D2 candidates
                   │ buyin_     │ │            │
                   │ telemetry  │ │            │
                   │ (TBT)      │ │            │
                   └─────┬──────┘ └─────┬──────┘
                         │              │
                    ┌────▼──────────────▼──────────────┐
                    │ rpc_shift_table_metrics (TBT)    │
                    │ rpc_mtl_* / gaming_day_summary    │
                    │ rpc_player_timeline               │
                    └──────────────────────────────────┘

       pit_cash_observation    ← independent D1 (no upstream trigger)

                PFT  ◄── ✗ no reverse bridge ✗ ──  mtl_entry
                       (proposed 2026-01-19, deleted 2026-01-20,
                        deferred via PRD-065)
```

RLS posture — the 2026-04-19 investigation streams disagreed on `player_financial_transaction` specifically: the server-derivation stream read its SELECT policy as Pattern C direct casino-scope, while the earlier alternate-direction assessment (`docs/issues/shift-dash/ALTENATE-DIRECTION.md`) described it as indirect (EXISTS via `player_casino + visit`) and treated that as the WS0 blocker that pushed EXEC-066 off PFT onto TBT. Those cannot both be true. **Pending a targeted RLS re-audit of PFT, this ADR does not assert PFT's realtime eligibility.** The claim is limited to the tables named as D2 for registered surfaces. The first exemplar (Appendix B) uses `table_buyin_telemetry`, whose Pattern C direct casino-scope policy is consistent across both investigation streams.

For the other candidates, both streams agreed: `table_buyin_telemetry`, `mtl_entry`, and `pit_cash_observation` carry Pattern C direct casino-scope SELECT policies and are eligible D2 candidates under §3.2. PFT's posture is an open verification item, not a settled fact.

Publication membership — no `ALTER PUBLICATION supabase_realtime ADD TABLE` migration exists for any financial table as of this writing. Each D2 named by a future registry entry must ship the membership migration (E3).

Known stale artifacts documented for awareness, not blocking this ADR:
- `hooks/mtl/use-mtl-mutations.ts:85-90` comment describes a reverse bridge that does not exist.
- `hooks/mtl/use-mtl-mutations.ts:91-101` invalidates PFT caches on MTL creation against no real event.
- `components/shift-dashboard-v3/shift-dashboard-v3.tsx:87` and `hooks/dashboard/use-exceptions-data.ts:149-150` freeze their time window at mount (E2 violations).
- `hooks/rating-slip-modal/use-close-with-financial.ts:221` and `hooks/rating-slip-modal/use-move-player.ts:305` invalidate loyalty queries with inline key arrays (E1 violations).

---

## Appendix B — Worked Example: Shift-Dashboard Win/Loss (EXEC-066)

First application of the contract. Becomes the first row of `REGISTRY_FINANCIAL_SURFACES.md`.

| Field | Value |
|---|---|
| `fact_id` | `FACT-RATED-BUYIN` |
| `D1_source` | `player_financial_transaction` |
| `D2_event_source` | `table_buyin_telemetry` (read-symmetric with `rpc_shift_table_metrics`; Pattern C RLS direct; bridge-terminal) |
| `surface` | `components/shift-dashboard-v3/shift-dashboard-v3.tsx` |
| `hooks` | `hooks/shift-dashboard/use-shift-dashboard-summary.ts`, `hooks/shift-dashboard/use-shift-table-metrics.ts` |
| `reaction_model` | LIVE |
| `sla_seconds` | 2s realtime / 30s fallback |
| `realtime_hook` | `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` (proposed new hook; will ship with the exemplar slice's implementation PR) |
| `window_correctness` | Rolling-window refactor of `shift-dashboard-v3.tsx:87` (will ship with the exemplar slice's implementation PR) |
| `owner_context` | Shift Intelligence (SRM) |

Migration to ship with the exemplar slice: `ALTER PUBLICATION supabase_realtime ADD TABLE table_buyin_telemetry` (or a backfill migration, per §4 E3, if membership is already present in the running environment but absent from migration history).

EXEC-066 and its three investigation memos (`INVESTIGATION-2026-04-17-winloss-estdrop-staleness.md`, `ALTENATE-DIRECTION.md`, `architecture-review-financial-surface-freshness-contract.md`) are **archived as contract prior-art** under `docs/20-architecture/specs/_archive/ISSUE-SHIFT-DASH-FRESHNESS/`. EXEC-066 itself has no residual implementation role: the exemplar slice is drafted natively against this ADR, not as a rewrite of any prior spec. The separate PFT SELECT policy posture — originally WS0 of EXEC-066 — is no longer a precondition for shift-dashboard freshness and is tracked as the open verification item noted in Appendix A.

---

## Decisions Resolved

Five questions were parked during drafting and resolved before adoption. Recorded here so future readers see what was contested and what was settled.

| # | Question | Decision | Reflected in |
|---|---|---|---|
| 1 | Distinct FACT-ID for adjustments vs. rated buy-ins? | **One fact.** `FACT-RATED-BUYIN` covers rated buy-ins and rated adjustments — both are signals of the same underlying fact (shift estimated drop / win-loss), and the RPC's `rated_cents` aggregation already treats them uniformly. | Registry: `FACT-RATED-BUYIN` definition |
| 2 | Can `pit_cash_observation` use D1 = D2 given it has no upstream derivation? | **Yes.** When no derivation trigger exists, D2 equals D1. Made explicit in §3.3. | §3 rule 3 (amended); Registry: `FACT-PIT-CASH-OBSERVATION` |
| 3 | Registry location — `docs/20-architecture/` or `docs/70-governance/`? | **`docs/20-architecture/`.** The registry is a structural contract (an enumeration of facts and their consumers), not a prohibition or guardrail. | `docs/20-architecture/REGISTRY_FINANCIAL_SURFACES.md` |
| 4 | E1 lint rule specifics — in this ADR, or a follow-on? | **Declared here, implemented separately.** The rule's text lives in this ADR (§4 E1). Detection specifics, allowlisted factories, and exemption handling are tracked as a follow-on implementation ticket. | §4 E1 (amended) |
| 5 | MANUAL as-of timestamp — require per-surface now, or ship a shared component first? | **Require now.** As-of timestamp is mandatory in the contract for any MANUAL surface, enforceable at review time. A shared `<AsOfBadge />` component is a planned follow-on but not a prerequisite for compliance. | §2 MANUAL (amended) |
