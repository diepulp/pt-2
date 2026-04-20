# Financial Surface Freshness Contract — Rollout Matrix

**Companion to** [ADR-050](../80-adrs/ADR-050-financial-surface-freshness-contract.md) **and** [REGISTRY_FINANCIAL_SURFACES.md](./REGISTRY_FINANCIAL_SURFACES.md).
**Status**: proposed plan; awaiting ADR-050 acceptance.
**Date**: 2026-04-19
**Owner**: Architecture Review

---

## Principles

1. **Each slice is individually shippable and reversible.** One PR per (fact × surface) pair, with its own registry amendment and acceptance criteria. No multi-surface mega-PRs.
2. **Exemplar first, replication after.** The first surface to land establishes the pattern. Subsequent surfaces inherit it. Do not parallelize replication until the exemplar has shipped and been reviewed.
3. **Registry is the ledger.** A slice is "done" when its row in `REGISTRY_FINANCIAL_SURFACES.md` is marked `ACTIVE`. Until then it is `PROPOSED` or `PENDING-BACKFILL`.
4. **Contract compliance ≠ surface cleanup.** A slice's scope is the five contract properties (D1–D4 declared, E1/E2/E3 satisfied). Adjacent cleanup (e.g., the `ratingSlipKeys` vs `dashboardKeys` factory drift) is noted in the slice but not bundled unless it blocks compliance.
5. **Open verification items do not fan out.** If a slice depends on an unresolved item (e.g., PFT RLS posture), it blocks on that item rather than inventing a workaround.

---

## Per-Slice Workstream Template

Every slice below follows the same seven-step shape so replication is mechanical once the exemplar proves the pattern:

1. **Audit** — verify D2 RLS posture, current publication membership, current reaction model.
2. **D2 publication membership** — ADD-TABLE migration (if membership absent) or backfill migration (if membership ambient). Satisfies §4 E3.
3. **Realtime hook** (LIVE surfaces only) — canonical `use-<domain>-realtime.ts` mounted from the surface.
4. **Window correctness** (if applicable) — rolling-window or explicit MANUAL+as-of. Satisfies §4 E2.
5. **E1 sweep** — verify mutation hooks writing to D1 use factory keys for all financial invalidations. Satisfies §4 E1.
6. **Tests** — E2E probe for the declared SLA; integration test for the realtime → invalidation → refetch path.
7. **Registry promotion** — amend the fact's row from `PROPOSED` / `PENDING-BACKFILL` to `ACTIVE`.

---

## Phase 0 — Cross-cutting Prerequisites

These unblock everything downstream. None of them are themselves compliance-bearing; they are gates.

| # | Prerequisite | Output | Blocks | Effort | Owner |
|---|---|---|---|---|---|
| P0.1 | **ADR-050 acceptance** — architecture review sign-off; header status `DRAFT` → `ACCEPTED` | ADR-050 becomes citable | All phases | trivial | Architecture Review |
| P0.1b | **Registry alignment sweep** — validate the initial `REGISTRY_FINANCIAL_SURFACES.md` rows against accepted ADR-050 text and the five accepted Decisions Resolved. Any row carrying unresolved D1/D2/D4 ambiguity is explicitly marked blocked and does not proceed into Phase 1 or Phase 2 by default. | Registry is a credible ledger from slice zero | All phases | ≤ 1 day | Architecture Review |
| P0.2 | **Publication-membership audit** — one `pg_publication_tables` query per D2 candidate | Per-slice decision tree: ADD-TABLE migration vs backfill migration | Phases 1–3 | ≤ 1 day | devops-pt2 / performance-engineer |
| P0.3 | **MTL reaction-model decision** — resolve Registry Open Verification Item #3 (LIVE vs INTERVAL for intra-day CTR alerts) | `FACT-MTL-PATRON-DAILY-TOTAL`'s D4 is declared | Phase 2 MTL slice only | stakeholder decision | Compliance + Architecture |
| P0.4 | **PFT RLS re-audit** — resolve Registry Open Verification Item #1 | SEC ticket closed; PFT's D2 eligibility determined | Any future slice that names PFT as D2 (**none in current registry**) | ≤ 1 sprint | rls-expert |

**P0.1, P0.2, P0.4 can run in parallel.** **P0.1b depends on P0.1** (it operates on the accepted text). P0.3 is a stakeholder decision; kick off early so it is settled by the time Phase 2 reaches the MTL slice.

---

## Phase 1 — Exemplar

One slice. Ship, review, pattern-verify. Do not start Phase 2 until this is `ACTIVE`.

| Slice | `FACT-RATED-BUYIN` × `components/shift-dashboard-v3/shift-dashboard-v3.tsx` |
|---|---|
| Why this one | Deepest investigation trail (INVESTIGATION-2026-04-17, ALTERNATE-DIRECTION, architecture-review memo). Most of the technical design is already settled. No open verification items block it. Operationally visible — first win is a real fix, not just governance paperwork. |
| Artifact | Exemplar exec-spec (EXEC-NNN number assigned at drafting), framed natively against ADR-050. EXEC-066 and its three investigation memos archived under `docs/20-architecture/specs/_archive/ISSUE-SHIFT-DASH-FRESHNESS/` as contract prior-art — not reworked, not referenced as a parent spec |
| D1 → D2 | `player_financial_transaction` → `table_buyin_telemetry` |
| Workstreams | W0 publication migration (TBT); W1 rolling-window refactor of `shift-dashboard-v3.tsx:87`; W2 `use-shift-dashboard-realtime.ts` subscription to TBT; W3 contract-property tests; W4 registry promotion |
| Acceptance | All §4 rules satisfied *for this slice*; registry row `PROPOSED → ACTIVE`; reviewer has written the replication checklist (see **Exemplar Exit Criteria** below) |
| Expected duration | 1–2 sprints |
| Depends on | P0.1, P0.2 |

### Exemplar Exit Criteria

Phase 1 is complete when:

1. All W0–W4 land.
2. Registry row for `FACT-RATED-BUYIN` / shift-dashboard is `ACTIVE`.
3. Reviewer produces a **Replication Checklist** — a one-page distillation of "what changed, where, in what order" from the exemplar slice, written so that the next slice's author can follow it mechanically. This is the actual deliverable that unblocks Phase 2. Without it, Phase 2 is guesswork.
4. **Replication viability.** Reviewer confirms the exemplar did not require undocumented slice-specific exceptions to ADR-050 beyond those captured in the Replication Checklist. The pattern is proven replicable, not just technically correct for this one surface.

---

## Phase 2 — Replication (fan-out after exemplar lands)

Three slices. Can run in **parallel** once the Replication Checklist exists. Each is its own PR, its own registry amendment.

| Slice | Fact | Surface | D1 → D2 | Key work | Depends on |
|---|---|---|---|---|---|
| 2.A | `FACT-PIT-CASH-OBSERVATION` | `components/shift-dashboard-v3/*` (cash-obs cards) | `pit_cash_observation` → self (D1 = D2) | W0 publication migration; W2 `use-pit-cash-observation-realtime.ts`; W3 tests; W4 registry promotion. **W1 rolling window inherited from Phase 1** (same surface) | Phase 1 `ACTIVE`; P0.2 |
| 2.B | `FACT-PIT-APPROVALS` | `components/pit-panels/exceptions-approvals-panel.tsx` | `table_fill` / `table_credit` → self | W0 publication **backfill** migration (membership ambient today via `useDashboardRealtime`); W1 fix frozen window at `use-exceptions-data.ts:149-150` (§4 E2 violation); W3 LIVE SLA probe; W4 registry promotion. **W2 realtime already exists in `useDashboardRealtime`** — no new hook, just register it. | Phase 1 `ACTIVE`; P0.2 |
| 2.C | `FACT-SESSION-CUSTODY` | `components/dashboard/pit-dashboard-client.tsx` | `rating_slip` → self | W0 publication backfill migration; W3 LIVE SLA probe; W4 registry promotion. **W2 realtime already exists.** Factory-mismatch cleanup (`ratingSlipKeys.activeForTable` vs `dashboardKeys.activeSlips`) noted in slice but deferred to a separate cleanup PR unless it blocks §4 E1 compliance. | Phase 1 `ACTIVE`; P0.2 |

**Why these three are Phase 2 and not later:** 2.A piggybacks on Phase 1's same surface and shares the rolling-window fix. 2.B and 2.C already have realtime coverage in production — they are mostly registration + backfill + one E2 fix, not new infrastructure. Cheapest wins after the exemplar, and they close the contract over the three load-bearing operator surfaces in one cycle.

**Validation note for inherited / pre-existing realtime (applies to 2.B, 2.C, and any future slice inheriting from `useDashboardRealtime` or a similar pre-existing hook).** A slice that already has realtime wiring is **not presumed compliant**. Before the row is promoted to `ACTIVE` it must explicitly verify that (a) the current subscription target matches the ADR-050 D2 selection for the fact, (b) the current invalidation/refetch path satisfies the declared reaction model, and (c) the SLA semantics are actually met under degraded conditions. "We already have a hook" is not a waiver — it is a head start.

**Composition note for 2.A.** Because 2.A shares the exemplar surface, validate hook composition, duplicate-invalidation behavior, and same-surface freshness interactions before merge. Adding a second canonical realtime hook to the same surface can produce overlapping invalidation storms or subtle ordering effects that do not show up in isolation. Shared-surface inheritance reduces work; it does not waive verification.

**Not in Phase 2:** `FACT-MTL-PATRON-DAILY-TOTAL` — blocked on P0.3 reaction-model decision. Split into its own phase rather than parallelize under uncertainty.

---

## Phase 3 — MTL Compliance Slice

One slice. Gated on Phase 2 completion and on P0.3.

| Slice | Fact | Surface | D1 → D2 | Key work | Depends on |
|---|---|---|---|---|---|
| 3.A | `FACT-MTL-PATRON-DAILY-TOTAL` | `components/mtl/compliance-dashboard.tsx` | `player_financial_transaction` (forward bridge) / `mtl_entry` (direct) → `mtl_entry` | Per Replication Checklist. **Reaction model (D4)** and **windowing behavior (§4 E2)** are separate decisions, both resolved by P0.3: (a) whether the surface auto-refreshes after a date is selected; (b) whether the operator must explicitly fetch/refresh; (c) whether the window itself advances after mount. Operator-driven date navigation by itself does not determine whether the surface is LIVE, INTERVAL, or MANUAL. | P0.3; Phase 2 `ACTIVE` |

Rationale for separate phase: the reaction-model decision is a stakeholder call with compliance implications. Isolating it prevents Phase 2's parallel surfaces from being held up by a MTL-specific decision.

---

## Phase 4 — Backfill Queue (sequenced, opportunistic)

Each surface gets its own slice. No ordering enforcement — slot into routine work as bandwidth allows. A surface leaves the queue when its row is `ACTIVE` in the registry.

| Slice | Fact(s) | Surface | Known violations | Likely reaction model |
|---|---|---|---|---|
| 4.A | `FACT-SESSION-CUSTODY` (historical) | `components/pit-panels/closed-sessions-panel.tsx` | none | INTERVAL 30s |
| 4.B | `FACT-RATED-BUYIN` (historical), `FACT-SESSION-CUSTODY` (historical) | `components/pit-panels/analytics-panel.tsx` | none | MANUAL + as-of badge |
| 4.C | `FACT-RATED-BUYIN`, `FACT-MTL-PATRON-DAILY-TOTAL` (threshold gating) | rating-slip-modal totals (`hooks/rating-slip-modal/*`) | **§4 E1 violations:** inline loyalty keys at `use-close-with-financial.ts:221`, `use-move-player.ts:305` | mixed; modal inherits parent surface |
| 4.D | `FACT-MTL-PATRON-DAILY-TOTAL` (historical) | `app/(dashboard)/players/[playerId]/timeline/_components/compliance-panel-wrapper.tsx` | none | MANUAL + as-of badge |
| 4.E | `FACT-MTL-PATRON-DAILY-TOTAL` | `components/mtl/gaming-day-summary.tsx` | inherits 3.A reaction model | inherits 3.A |

---

## Phase 5 — Contract Enforcement Hardening (parallel, non-blocking)

These do not block any slice. They raise the floor for future work and prevent regression.

| # | Item | Output | Owner |
|---|---|---|---|
| 5.1 | **E1 lint rule** — ESLint rule flagging inline `queryKey: [...]` literals in mutation hooks under `hooks/` that write to D1 tables | PR + CI gate | typescript-pro |
| 5.2 | **`<AsOfBadge />` shared component** — standardizes MANUAL as-of timestamp presentation | PR; optional adoption during Phase 4 | frontend-design-pt-2 |
| 5.3 | **Stale-reference cleanup** — remove dead invalidation block at `hooks/mtl/use-mtl-mutations.ts:91-101` and correct the comment at `:85-90` | PR | backend-service-builder |
| 5.4 | **CI publication-membership check** — script that asserts every D2 named in the registry has corresponding migration-declared publication membership | CI job | devops-pt2 |

---

## Dependency Graph

```
 P0.1 (ADR accepted) ──┬─► Phase 1 (exemplar) ──► Phase 2 (2.A, 2.B, 2.C parallel) ──┐
                       │                                                              ├─► Phase 4 backfill (opportunistic)
 P0.2 (pub audit)   ───┤                                                              │
                       │                                                              │
 P0.3 (MTL model)   ───┴─────────────────────► Phase 3 (MTL slice) ──────────────────┘

 P0.4 (PFT RLS)     ──► (no current registry slice blocked) ──► future PFT-as-D2 slices

 Phase 5 (hardening) ── runs in parallel throughout; does not block any slice
```

---

## Cadence Proposal

**Framing.** The table below is a **target sequence and planning horizon**, not a forecast or a program-management commitment. It describes the intended flow if no blocking review findings emerge, no open verification items reopen, and no slice turns up surprises in validation. The rest of this document is explicit that phase gates, stakeholder decisions, and exemplar-exit reviews can extend any horizon. Use these as sequencing targets, not as dates.

| Horizon | Target |
|---|---|
| Week 1 | P0.1 and P0.2 targeted to land. P0.1b sweep runs immediately after P0.1. P0.3 kicked off as stakeholder decision. P0.4 SEC ticket filed. |
| Weeks 2–3 | Phase 1 (exemplar) implementation targeted; reviewer produces Replication Checklist at exit. |
| Week 4 | Phase 1 merged and `ACTIVE`, if exemplar exit criteria are met. Phase 2 slices 2.A / 2.B / 2.C kicked off in parallel. |
| Weeks 5–6 | Phase 2 slices targeted to land. Contract coverage targeted to reach four of five registered facts. P0.3 decision targeted to be settled. |
| Weeks 7–8 | Phase 3 (MTL slice) targeted to land, conditional on P0.3 outcome. |
| Ongoing | Phase 4 backfill queue processed opportunistically. Phase 5 hardening items slotted in parallel. |

Deliberate slack between Phases 1 and 2. The exemplar's reviewer is also the Phase 2 unblocker (Replication Checklist authorship). Rushing Phase 2 before that checklist exists collapses the whole "exemplar first" principle into "do it five times in parallel and hope," which is exactly the ad hoc pattern ADR-050 is replacing.

---

## Reversibility

Each slice is an independent PR against a registry row. If a slice needs to be rolled back:

- Revert the PR.
- Amend the registry row back to its prior status (`PROPOSED` or `PENDING-BACKFILL`).
- Note the rollback in the registry's Changelog.

Publication-membership migrations are reversible, but rollback is not consequence-free. Dropping a D2's publication membership does not delete row data, but it **does change runtime freshness behavior** and invalidates the contract posture of any surface currently relying on that D2. Any rollback that removes D2 publication membership MUST demote the affected registry row(s) from `ACTIVE` to the appropriate pre-rollout status and record the demotion in the registry Changelog. Realtime hook additions are client-side and remove cleanly.

The only irreversible step is Phase 0 — once ADR-050 is `ACCEPTED`, future financial UI work is governed by it. That is the intended effect.
