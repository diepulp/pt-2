---
id: PRD-067
title: ADR-050 Phase 1 Exemplar — Shift-Dashboard Financial Freshness Pilot
owner: Lead Architect
status: Draft
affects: [ADR-050, REGISTRY_FINANCIAL_SURFACES, FINANCIAL-FRESHNESS-ROLLOUT]
created: 2026-04-19
last_review: 2026-04-19
phase: Phase 1 — ADR-050 Exemplar (pilot, not imperial)
pattern: C
http_boundary: false
supersedes: PRD-066
driving_authority: ADR-050 (ACCEPTED 2026-04-19)
---

# PRD-067 — ADR-050 Phase 1 Exemplar: Shift-Dashboard Financial Freshness Pilot

> **Supersedes PRD-066.** The legacy PRD (and its child EXEC-066, EXEC-066a/b, and three investigation memos in `docs/issues/shift-dash/`) pre-date ADR-050's acceptance. This PRD replaces PRD-066 wholesale; it is not an extension. PRD-066 is re-statused `Superseded` in the same commit. The archived prior-art remains readable as historical context but is **not** a requirements source for this PRD — the authority is ADR-050 §1–§7 and the companion registry and rollout matrix.

> **Slice type — PILOT (not imperial).** This PRD ships the Phase 1 exemplar of ADR-050's freshness contract. It does **not** authorize Phase 2 fan-out. Fan-out is contingent on exemplar evidence via the four Phase 1 Exit Criteria in `FINANCIAL-FRESHNESS-ROLLOUT.md` §Phase 1. Reassessment of broader adoption happens against what this exemplar teaches, not on schedule.

---

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** ADR-050 (Financial Surface Freshness Contract, ACCEPTED 2026-04-19) defines a four-declaration contract (D1–D4) governing how financial facts reach operator UIs. This PRD delivers the first worked application of that contract: the shift-dashboard surface's observation of `FACT-RATED-BUYIN`. It is scoped to one fact × one surface, shipping five workstreams (W0–W4) that together satisfy §4 E1/E2/E3 enforcement and meet the declared LIVE reaction model (≤2s realtime / ≤30s fallback). The registry row in `REGISTRY_FINANCIAL_SURFACES.md` promotes `PROPOSED → ACTIVE` on completion. The exemplar's reviewer produces a Replication Checklist — including the invalidation-coordination pattern (see §5.3) — which is the prerequisite for any Phase 2 slice. Without that checklist, Phase 2 does not begin.

**Driving authority:** ADR-050 §1–§7 + the five Decisions Resolved. This PRD does not re-argue the contract; it applies it to one surface and records the application.

**Scope boundary:** strictly the shift-dashboard Win/Loss + Est. Drop panels observing rated buy-ins and rated adjustments. No MTL, no pit-approvals, no session-custody, no cash-obs, no historical/analytics surfaces. Those remain on their current polling / mutation-invalidation flows until their own slices are scheduled.

---

## 2. Problem & Goals

### 2.1 Problem

The shift-dashboard surface reads aggregated rated-buy-in telemetry via `rpc_shift_table_metrics` (which aggregates `table_buyin_telemetry`). Three defects prevent it from meeting any credible freshness SLA today:

1. **E2 violation (frozen window):** `components/shift-dashboard-v3/shift-dashboard-v3.tsx:87` initializes a time window once at mount via `useState(() => window)` and never advances it. Post-mount mutations are structurally excluded from the window regardless of refetch cadence.
2. **E3 violation (zero publication membership):** Per the P0.2 audit committed as `f52d34ca`, `table_buyin_telemetry` is not a member of any publication. Any `postgres_changes` subscription to TBT today delivers zero events.
3. **Illusory realtime:** `hooks/dashboard/use-dashboard-realtime.tsx:83-155` subscribes `postgres_changes` on tables that, per the same P0.2 audit, have zero publication membership. Observed freshness on the current dashboard is driven entirely by polling + mutation-side invalidation; the realtime subscription is decorative. This is Registry OVI #5 (tracked separately but not blocking this PRD).

The aggregate effect: an operator adjusting a buy-in in one tab watches another tab's Win/Loss and Est. Drop numbers remain stale indefinitely, until the operator interacts with the time-window picker or reloads.

### 2.2 Goals

- **G1 — Declare and enforce the four ADR-050 declarations for `FACT-RATED-BUYIN`** on the shift-dashboard surface. D1, D2, D3, D4 all present and verifiable in the registry row.
- **G2 — Satisfy §4 E2** by replacing the frozen-window hook pattern at `shift-dashboard-v3.tsx:87` with a rolling-window approach that advances per refetch.
- **G3 — Satisfy §4 E3** by shipping an `ALTER PUBLICATION supabase_realtime ADD TABLE table_buyin_telemetry` migration under `supabase/migrations/` with the standard naming convention.
- **G4 — Deliver the first canonical financial-domain realtime hook** (`hooks/shift-dashboard/use-shift-dashboard-realtime.ts`) subscribing to TBT WAL events.
- **G5 — Resolve the duplicate-invalidation coordination pattern** between mutation-side invalidation (existing `useCreateFinancialAdjustment`) and the new WAL-side invalidation (W2), and document the chosen pattern in the Replication Checklist so every subsequent slice inherits it.
- **G6 — Promote the registry row** for `FACT-RATED-BUYIN` / shift-dashboard from `PROPOSED → ACTIVE` and produce the Replication Checklist that unblocks Phase 2.

### 2.3 Non-Goals (explicit, not defensive)

- **NG1 — No fan-out to Phase 2 slices.** 2.A (cash-obs), 2.B (pit-approvals), 2.C (session-custody), and Phase 3 (MTL) are out of scope. They wait on exemplar exit criteria.
- **NG2 — No change to `player_financial_transaction` RLS posture.** PFT RLS re-audit is rollout P0.4 and Registry OVI #1. PFT is not D2 for any currently registered fact, so it is not required for this exemplar.
- **NG3 — No reverse bridge.** The rating-slip ↔ MTL reverse bridge (proposed and deleted 2026-01-20) remains deferred under PRD-065.
- **NG4 — No change to `trg_bridge_finance_to_telemetry`.** The forward bridge is the source of truth for `FACT-RATED-BUYIN`'s derivation; this PRD only observes its output.
- **NG5 — No deprecation of `useDashboardRealtime`.** Its non-functional `postgres_changes` subscriptions (Registry OVI #5) are tracked on a separate investigation track. This PRD does not remove or replace that hook.
- **NG6 — No cleanup of unrelated stale references.** The dead invalidation block at `hooks/mtl/use-mtl-mutations.ts:91-101` and the reverse-bridge comment at `:85-90` (Registry OVI #4) are not touched here.
- **NG7 — No §4 E1 lint rule implementation.** The rule's text is declared in ADR-050 §4 E1; the ESLint implementation is rollout Phase 5.1 (parallel hardening track).
- **NG8 — No new shared UI components** (e.g., `<AsOfBadge />`). Not required for LIVE; rollout Phase 5.2 if needed.

---

## 3. Users & Use Cases

### 3.1 Primary user: Pit Boss / Floor Supervisor operating the shift-dashboard

- **U1 — Adjust a buy-in in Tab A; watch Win/Loss and Est. Drop update in Tab B within 2 seconds via cross-tab WAL propagation.** Today: stale indefinitely. Post-exemplar: ≤2s realtime, ≤30s polling fallback.
- **U2 — Adjust a buy-in in Tab A; see Tab A's own panels update within the declared LIVE SLA via the exemplar's chosen mutation-path coordination pattern (F5).** The mechanism differs from U1: same-tab freshness is driven by mutation-side response coordinated with the new WAL-side invalidation, not by cross-tab WAL propagation. Today: mutation-side invalidation produces a refetch with the wrong (frozen) window. Post-exemplar: the chosen coordination pattern produces exactly one refetch over a rolling window that returns the correct aggregate, still within the declared LIVE SLA.
- **U3 — Observe aggregate numbers through a shift's lifespan without reloading.** Today: window staleness compounds; numbers silently drift from reality. Post-exemplar: window advances each refetch; realtime covers inter-poll gaps.

### 3.2 Secondary user: Engineer adding the next financial surface (Phase 2+ author)

- **U4 — Read the Replication Checklist and implement a Phase 2 slice mechanically.** The exemplar's value is precisely that the next slice is not guesswork. The PRD's success includes producing a checklist concrete enough that 2.A / 2.B / 2.C can be written from it without re-deriving the invalidation-coordination pattern.

---

## 4. Scope & Feature List

All items below are testable and scoped to the one fact × one surface. No item implies changes outside this pair.

- **F1** — Ship migration `YYYYMMDDHHMMSS_add_tbt_to_supabase_realtime.sql` containing `ALTER PUBLICATION supabase_realtime ADD TABLE public.table_buyin_telemetry`. Timestamp generated via `date +%Y%m%d%H%M%S`.
- **F2** — Replace `shift-dashboard-v3.tsx:87` `useState(() => window)` with a rolling-window mechanism (tick counter, query-time recompute, or equivalent) such that each refetch computes a fresh `window_end`.
- **F3** — Create `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` as the canonical LIVE realtime hook for `FACT-RATED-BUYIN`. Subscribes to `postgres_changes` on `table_buyin_telemetry`. Uses the casino-scoped channel name convention.
- **F4** — On TBT WAL events, invalidate `shiftDashboardKeys.summary.*` and `shiftDashboardKeys.tableMetrics.*` via the registered factory (§4 E1 compliance).
- **F5** — Resolve the duplicate-invalidation coordination: choose either (a) remove the shift-dashboard invalidations from `useCreateFinancialAdjustment.onSuccess` once WAL coverage is live, OR (b) make the WAL hook idempotent via WAL-sequence deduplication, OR (c) a documented hybrid. The choice MUST be captured in the Replication Checklist and its rationale noted in the registry row's `window_correctness` column or a linked comment.
- **F6** — Contract-property test `e2e/adr-050/exemplar-rated-buyin.spec.ts` probing: (a) cross-tab Win/Loss update within 2s nominal, (b) polling fallback to 30s under degraded realtime, (c) rolling-window correctness (post-mount adjustment included without reload).
- **F7** — Unit/integration coverage: §4 E1 factory compliance for **all in-scope mutation hooks writing to `FACT-RATED-BUYIN` / D1 (`player_financial_transaction`) and affecting this surface**, not merely the ones already known to invalidate shift-dashboard keys (the test surface is defined by the fact-and-surface pair, not by existing invalidation wiring — otherwise blind spots are preserved); §4 E2 window-advance assertion for the refactored hook.
- **F8** — Registry promotion: amend `REGISTRY_FINANCIAL_SURFACES.md` row for `FACT-RATED-BUYIN` / `components/shift-dashboard-v3/shift-dashboard-v3.tsx` from `PROPOSED → ACTIVE`, filling in the realtime-hook and window-correctness columns with concrete file references. Changelog entry added.
- **F9** — Replication Checklist authored at `docs/20-architecture/specs/REPLICATION-CHECKLIST-ADR-050.md`, including the four canonical sections (what changed, where, in what order; invalidation-coordination pattern; pitfalls encountered; slice-specific ADR exceptions, if any) per `FINANCIAL-FRESHNESS-ROLLOUT.md` §Phase 1 exit criteria.

---

## 5. Requirements

### 5.1 Functional requirements

| ID | Requirement | ADR-050 clause |
|---|---|---|
| FR1 | D1 declared as `player_financial_transaction` | §1 D1 |
| FR2 | D2 declared as `table_buyin_telemetry` | §1 D2, §3.1, §3.3 |
| FR3 | D3 declared as `components/shift-dashboard-v3/shift-dashboard-v3.tsx` with exact hook paths | §1 D3, §5 |
| FR4 | D4 declared as LIVE; SLA ≤2s realtime / ≤30s fallback | §1 D4, §2 LIVE |
| FR5 | TBT is a declared publication member via migration under `supabase/migrations/` | §4 E3 |
| FR6 | The surface's time window includes post-mount mutations | §4 E2 |
| FR7 | All mutation hooks writing to D1 that invalidate shift-dashboard keys use a registered factory | §4 E1 |
| FR8 | Duplicate-invalidation coordination pattern explicitly chosen, documented, and referenced from the registry row | Rollout §Phase 1 exit criterion #3 (amended) |

### 5.2 Non-functional requirements

| ID | Requirement | Measurement |
|---|---|---|
| NFR1 | LIVE SLA: operator observes a committed adjustment within 2s under nominal realtime conditions | E2E probe F6 |
| NFR2 | Polling fallback SLA: ≤30s under degraded realtime | E2E probe F6 |
| NFR3 | Publication-membership migration is reversible (`DROP TABLE` migration possible without row-level data loss). Rollback changes runtime freshness behavior and requires the registry row to be demoted from `ACTIVE`. | Rollout §Reversibility |
| NFR4 | No increase in shift-dashboard mutation-path latency (invalidation coordination must not regress the write path) | Existing mutation tests; no new harness required |
| NFR5 | WAL event volume from TBT publication monitored post-deployment | Observability track (not blocking) |

### 5.3 The invalidation-coordination constraint (named explicitly)

The existing `useCreateFinancialAdjustment` hook (and adjacent mutation hooks that touch rated buy-ins) invalidate shift-dashboard query keys on success. Once W0 (TBT publication membership) and W2 (the new realtime hook) land, the same mutation produces a TBT WAL event that independently invalidates the same query keys via the new hook. Without deliberate coordination, every mutation produces two refetches.

This PRD requires the exemplar slice to:

- Resolve the coordination by picking (a), (b), or (c) from F5 above.
- Document the choice, its rationale, and any edge cases in the Replication Checklist.
- Ensure the chosen pattern is mechanically applicable by Phase 2 slices without re-derivation.

The Replication Checklist is the deliverable that makes this constraint *a pattern* rather than a local fix; rollout §Phase 1 exit criterion #3 elevates the requirement.

---

## 6. UX / Flow Overview

- **Mount:** operator navigates to `/shift-dashboard`. The surface mounts with rolling-window parameters. Initial render uses the current window; no frozen state.
- **Steady-state LIVE:** TBT realtime subscription is active. Polling is enabled as fallback at 30s. Operator sees aggregate values update continuously as buy-ins / adjustments commit.
- **Mutation in same tab:** operator commits an adjustment via `useCreateFinancialAdjustment`. Under the chosen coordination pattern (F5), the mutation produces exactly one refetch. Updated aggregate visible within 2s.
- **Mutation in another tab:** operator commits an adjustment in Tab A. WAL event reaches Tab B's TBT subscription; Tab B invalidates and refetches within 2s. Operator sees update without refreshing Tab B.
- **Degraded realtime:** WebSocket disconnects or channel stalls. Polling fallback (30s) continues to return fresh data because the window is rolling. Operator sees update within 30s.
- **Post-promotion:** registry row is `ACTIVE`. Subsequent slice authors consult the Replication Checklist. Phase 2 decision to proceed is gated on exit criterion #4 (Replication viability).

---

## 7. Dependencies & Risks

### 7.1 Prerequisites (blocking)

- **ADR-050 ACCEPTED** ✅ (`76ad0759`, 2026-04-19)
- **P0.1b Registry Alignment Sweep complete** ✅ (`5e3407b7`, `FACT-RATED-BUYIN` verdict CLEAR)
- **P0.2 Publication-Membership Audit complete** ✅ (`f52d34ca`, TBT needs ADD-TABLE migration; no backfill path; REPLICA IDENTITY DEFAULT + valid PK)
- **Pilot-containment amendment landed** ✅ (`ab7a81c7`, exit criterion #3 requires invalidation-coordination capture)

### 7.2 Out-of-band tracks (not blocking this PRD)

- **P0.3** — MTL reaction-model decision. Blocks Phase 3 (FACT-MTL-PATRON-DAILY-TOTAL). Unrelated to this PRD.
- **P0.4** — PFT RLS re-audit. Opens the door to future PFT-as-D2 registrations (none today). Unrelated to this PRD.
- **Registry OVI #5** — `useDashboardRealtime` surface-behavior verification. Relevant to Phase 2.B / 2.C, not Phase 1.

### 7.3 Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Double-refetch per mutation if F5 coordination is not merged with W0+W2 | Medium | Low (wasted round-trip, not wrong data) | F5 is gated by the Replication Checklist; exit criterion #3 requires it captured |
| Shift-dashboard behavior change reveals latent bugs previously masked by staleness | Medium | Low–Medium | Normal QA during W3; scope is one surface |
| WAL event volume spike post-W0 | Low | Low | Observability track; no blocking metric |
| Slice-specific ADR exception discovered during implementation | Low | Medium (invalidates "proven replicable" criterion #4) | Capture in Replication Checklist with explicit rationale; if the exception is structural, this PRD's exit is *partial* and Phase 2 does not begin |

### 7.4 Open questions

- **Q1 (truly open):** Coordination pattern F5 — is the preferred default (a) remove mutation-side shift-dashboard invalidations once WAL is live, or (b) WAL-seq idempotency in the new hook, or (c) a documented hybrid? All three are in-contract; the choice + rationale is the Replication Checklist's content. Implementation is free to select.

### 7.5 Deferred considerations

Items already resolved in favor of containment; listed so the decision is not re-opened during implementation.

- **Extracting a shared `useRollingWindow` hook** — explicitly deferred. W1 ships the rolling-window fix inline on `shift-dashboard-v3.tsx:87`. Phase 2.A inherits the same surface and is the natural point at which to decide if extraction is warranted. Doing so in this PRD would scope-creep Phase 1 and blur the exemplar's "one fact × one surface" boundary.

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] `FACT-RATED-BUYIN` registry row promoted from `PROPOSED → ACTIVE` in `REGISTRY_FINANCIAL_SURFACES.md`
- [ ] Win/Loss and Est. Drop panels reflect a committed rated buy-in or rated adjustment within 2s nominal / 30s degraded (cross-tab and same-tab)
- [ ] Rolling-window refactor at `shift-dashboard-v3.tsx:87` satisfies §4 E2 (post-mount mutations visible without reload or window change)

**Data & Integrity**
- [ ] `table_buyin_telemetry` is a declared member of `supabase_realtime` publication via migration in `supabase/migrations/`
- [ ] `trg_bridge_finance_to_telemetry` unchanged; no new derivation edges introduced
- [ ] No change to `player_financial_transaction` write path or RLS

**Security & Access**
- [ ] Realtime channel scoped by casino_id (Pattern C direct casino-scope RLS on TBT already verified by P0.1b sweep)
- [ ] No new RLS policies authored; no SECURITY DEFINER changes

**Testing**
- [ ] E2E probe covers LIVE SLA (2s realtime / 30s fallback) and rolling-window correctness
- [ ] Integration test covers §4 E1 factory compliance on mutation hooks that invalidate shift-dashboard keys
- [ ] Unit test covers the rolling-window advance mechanism

**Operational Readiness**
- [ ] Publication migration is reversible via `DROP TABLE` migration (verified by dry-run; not shipped)
- [ ] Realtime hook includes graceful disconnect / reconnect behavior under the existing `useRealtimeChannel` pattern
- [ ] Basic logging on WAL event arrival + invalidation fire (existing pattern; no new observability primitives)

**Documentation**
- [ ] `REGISTRY_FINANCIAL_SURFACES.md` row updated with concrete `realtime_hook` and `window_correctness` values; changelog entry added
- [ ] PRD-066 re-statused `Superseded` in its frontmatter, with a one-line pointer to PRD-067
- [ ] Replication Checklist (see Phase 1 Exit Criteria below) authored and linked from the registry row

> **Archival note (not a DoD item):** the legacy EXEC-066, EXEC-066a, EXEC-066b, and the three investigation memos in `docs/issues/shift-dash/` are scheduled for archival under `docs/20-architecture/specs/_archive/ISSUE-SHIFT-DASH-FRESHNESS/` at EXEC-SPEC drafting time. This is filing hygiene, not pilot completion work — it is called out so it does not get forgotten, not gated on PRD DoD.

**Phase 1 Exit Criteria (by reference to `FINANCIAL-FRESHNESS-ROLLOUT.md` §Phase 1)**
- [ ] **#1** — W0–W4 all merged
- [ ] **#2** — Registry row `ACTIVE`
- [ ] **#3** — Replication Checklist written, including the invalidation-coordination pattern per F5/§5.3
- [ ] **#4** — Replication viability confirmed (no undocumented slice-specific ADR exceptions; the pattern is proven replicable, not just technically correct for this one surface)

**Phase 2 Gate (not a DoD item; a downstream posture)**
- Phase 2 fan-out (2.A / 2.B / 2.C) does not begin until all four exit criteria above are satisfied. This is the pilot-containment guarantee.

---

## 9. Related Documents

### Driving authority

- `docs/80-adrs/ADR-050-financial-surface-freshness-contract.md` — Financial Surface Freshness Contract (ACCEPTED 2026-04-19)

### Companion artifacts

- `docs/20-architecture/REGISTRY_FINANCIAL_SURFACES.md` — `FACT-RATED-BUYIN` registered entry; P0.1b sweep verdict; P0.2 audit section
- `docs/20-architecture/FINANCIAL-FRESHNESS-ROLLOUT.md` — Phase 1 description, W0–W4 workstreams, four Phase 1 exit criteria

### Superseded prior-art (archived, not requirements-bearing)

- `docs/10-prd/PRD-066-shift-dashboard-downstream-reconciliation-v0.md` — Superseded by this PRD
- `docs/21-exec-spec/EXEC-066-shift-dashboard-downstream-reconciliation.md` — to be archived under `docs/20-architecture/specs/_archive/ISSUE-SHIFT-DASH-FRESHNESS/`
- `docs/21-exec-spec/EXEC-066a-silent-guard-foundation.md` — archival scope TBD at EXEC-SPEC drafting (not bound to this PRD)
- `docs/21-exec-spec/EXEC-066b-silent-guard-sweep.md` — archival scope TBD at EXEC-SPEC drafting (not bound to this PRD)
- `docs/issues/shift-dash/INVESTIGATION-2026-04-17-winloss-estdrop-staleness.md` — archive target
- `docs/issues/shift-dash/ALTENATE-DIRECTION.md` — archive target
- `docs/issues/shift-dash/architecture-review-financial-surface-freshness-contract.md` — archive target

### Related ADRs (not superseded, but cited)

- ADR-004 — Real-time strategy (extended in the financial domain by ADR-050)
- ADR-015 — RLS hybrid (Pattern C direct casino-scope used by TBT)
- ADR-031 — Financial amount convention
- ADR-041 — Surface governance standard (REGISTRY_FINANCIAL_SURFACES is ADR-050's domain-specific registry; not a new surface requiring full §5 §4 surface classification treatment, but the registry's role is analogous)
- ADR-049 — Operator action atomicity

### Downstream (not in scope, but named for clarity)

- Rollout Phase 2 (2.A / 2.B / 2.C) — gated by this PRD's exit criteria
- Rollout Phase 3 (MTL) — gated additionally on P0.3
- Rollout Phase 4 (backfill queue) — no dependency on this PRD beyond contract adoption
- Rollout Phase 5 (hardening: E1 ESLint, `<AsOfBadge />`, CI pub-membership check, stale-reference cleanup) — parallel, non-blocking

---

## Appendix A: ADR-050 Declaration Reference Card (for FACT-RATED-BUYIN)

| Declaration | Value |
|---|---|
| **D1** | `player_financial_transaction` (via `rpc_create_financial_txn` for originals; `rpc_create_financial_adjustment` for adjustments) |
| **D2** | `table_buyin_telemetry` (read-symmetric with `rpc_shift_table_metrics`; Pattern C direct casino-scope RLS; bridge-terminal via `trg_bridge_finance_to_telemetry`; idempotency key `pft:{id}`) |
| **D3 — surface** | `components/shift-dashboard-v3/shift-dashboard-v3.tsx` |
| **D3 — hooks** | `hooks/shift-dashboard/use-shift-dashboard-summary.ts`, `hooks/shift-dashboard/use-shift-table-metrics.ts`, `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` (new) |
| **D4 — reaction model** | LIVE |
| **D4 — SLA** | ≤2s realtime / ≤30s fallback |
| **Owner context** | Shift Intelligence |

## Appendix B: Phase 1 Exit Criteria Reference (from `FINANCIAL-FRESHNESS-ROLLOUT.md`)

1. All W0–W4 land.
2. Registry row for `FACT-RATED-BUYIN` / shift-dashboard is `ACTIVE`.
3. Reviewer produces a Replication Checklist (including the invalidation-coordination pattern per rollout line 70).
4. Replication viability confirmed — no undocumented slice-specific ADR exceptions.

## Appendix C: Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| v0 | 2026-04-19 | Lead Architect | Initial draft. Supersedes PRD-066. Native to ADR-050. Pilot-containment posture explicit. |
| v0.1 | 2026-04-19 | Lead Architect | Review-feedback patches: (1) U2 distinguishes same-tab mutation-path coordination from cross-tab WAL propagation; (2) F7 scope tightened to "in-scope mutation hooks writing to FACT-RATED-BUYIN / D1 and affecting this surface" to prevent blind spots; (3) NFR3 acknowledges rollback changes runtime freshness behavior and demotes registry row; (4) archival choreography demoted from DoD to a documentation note; (5) Q1 (`useRollingWindow` extraction) moved to §7.5 Deferred Considerations; only the F5 coordination choice remains truly open. |
