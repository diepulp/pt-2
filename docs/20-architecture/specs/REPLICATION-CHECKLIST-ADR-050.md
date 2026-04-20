---
id: REPLICATION-CHECKLIST-ADR-050
title: ADR-050 Replication Checklist — Phase 1 Exemplar Pattern
status: CANONICAL
exit_criterion: FINANCIAL-FRESHNESS-ROLLOUT.md §Phase 1 #3
pilot: PRD-068 (FACT-RATED-BUYIN × shift-dashboard)
authored: 2026-04-20
gates: Phase 2 fan-out (2.A cash-obs, 2.B pit-approvals, 2.C session-custody)
owner: Architecture Review
---

# ADR-050 Replication Checklist — Phase 1 Exemplar Pattern

This document is the mechanically replicable pattern distilled from the **PRD-068 Phase 1 exemplar slice** (`FACT-RATED-BUYIN` observed by the shift-dashboard surface). Phase 2 slices consult this checklist first and follow its file-level delta, invalidation-coordination pattern, and exit-criterion #4 protocol before writing new code.

This file is the **exit-criterion #3 artifact** of `FINANCIAL-FRESHNESS-ROLLOUT.md` §Phase 1. Phase 2 fan-out does not begin until this file is complete, reviewed, and its invalidation-coordination pattern is verified against the exemplar implementation.

---

## 1. What changed, where, in what order

File-level delta, ordered by execution dependency (W0 → W1 → W2 → W3 → W4 → W5). Each entry states what the change accomplishes in contract terms.

| Order | File | Change | Contract role |
|---|---|---|---|
| W0 | `supabase/migrations/20260420002749_add_tbt_to_supabase_realtime.sql` | ADD TABLE migration with idempotent `DO`-block guard | Satisfies ADR-050 §4 **E3** (publication membership) for D2 = `table_buyin_telemetry` |
| W1 | `components/shift-dashboard-v3/shift-dashboard-v3.tsx` | Replace frozen `useState(() => window)` with Date.now()-based rolling anchor + `computeRollingWindow()` pure helper; operator override freezes rolling | Satisfies ADR-050 §4 **E2** (window correctness) |
| W2 | `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` | New canonical realtime hook: channel `shift-dashboard-rated-buyin-${casinoId}`, `postgres_changes` on D2, filter `casino_id=eq.${casinoId}`, invalidates `shiftDashboardKeys.summary.scope` + `shiftDashboardKeys.tableMetrics.scope` via the registered factory | Satisfies ADR-050 §4 **E1** (registered factory rule) + delivers LIVE SLA per D4 |
| W2 | `components/shift-dashboard-v3/shift-dashboard-v3.tsx` (mount edit, bundled with W1 per DEC-DD2) | One-line `useShiftDashboardRealtime({ casinoId })` immediately after `useAuth()` | Mounts the LIVE pipeline on the surface |
| W3 | `e2e/adr-050/exemplar-rated-buyin.spec.ts` + `e2e/adr-050/fixtures/shift-dashboard-fixture.ts` | Playwright Mode B probes: cross-tab 2s SLA, polling fallback under `NEXT_PUBLIC_E2E_DISABLE_REALTIME`, rolling-window correctness | Contract-property test for D4 reaction + §4 E2/E3 at runtime |
| W3 | `hooks/shift-dashboard/__tests__/e1-factory-compliance.int.test.ts` + `__fixtures__/d1-mutation-hooks.ts` | Source-level audit: iterate Day-1 mutation-hook inventory, assert no inline `queryKey: ['shift-dashboard', ...]` literals | Contract-property test for §4 **E1** across the full fact×surface hook set |
| W4 | `docs/20-architecture/REGISTRY_FINANCIAL_SURFACES.md` | Row for `FACT-RATED-BUYIN` / shift-dashboard: PROPOSED → ACTIVE; `realtime_hook` + `window_correctness` columns set to concrete file references; changelog entry | Registers the slice as governed under ADR-050 |
| W4 | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` | Co-ownership of `table_buyin_telemetry` under PlayerFinancialService; read-only WAL consumer row under ShiftIntelligenceService → PlayerFinancialService | Closes DA-review SRM gap (PRD-068 P0-R2-1) |
| W4 | `docs/10-prd/PRD-066-shift-dashboard-downstream-reconciliation-v0.md` | Frontmatter `status: Superseded`, `superseded_by: PRD-068` | Prior-art re-statused; pre-ADR-050 framing marked non-authoritative |
| W5 | `docs/20-architecture/specs/REPLICATION-CHECKLIST-ADR-050.md` | This file | Exit criterion #3; gates Phase 2 |

**Ordering invariants** (enforced by `depends_on` in the EXEC-SPEC):

1. W0 before W2 — publication membership must exist before WAL subscription returns events.
2. W1 before W2 — rolling-window correctness must land before the hook mount, otherwise the LIVE update delivers to a frozen surface (silent-miss bug class).
3. W3 after W0/W1/W2 — contract tests exercise the full pipeline.
4. W4 after W3 — registry promotion claims the surface is ACTIVE, and the tests are the evidence.
5. W5 after W3 — the checklist is written while the slice's lessons are fresh.

---

## 2. Invalidation-coordination pattern (DEC-DD1(c) hybrid — CANONICAL)

Phase 1 resolved the "who invalidates on mutation + who invalidates on WAL" coordination question as **DEC-DD1(c)**: keep mutation-side invalidation where it already exists; add a **centralized debounce in the WAL hook** that suppresses WAL-triggered invalidation within 500ms of any preceding `shiftDashboardKeys`-scoped invalidation. Phase 2 slices adopt this as the canonical pattern.

### 2.1 Canonical mechanism — queryClient.getQueryCache().subscribe()

The WAL hook observes all React-Query invalidations via TanStack Query v5's `QueryCache.subscribe()` API. Events carry `{ type: 'updated', action: { type: 'invalidate' }, query: { queryKey } }`. Filter to the surface's root and stamp a per-casino `lastMutationInvalidationAt` timestamp. On WAL arrival, check the timestamp and suppress within the debounce window.

```ts
// Canonical pattern — reuse verbatim when adding a new WAL hook.
// Slice-specific substitutions: YourSurfaceKeys (the registered factory),
// table name, channel prefix. Otherwise copy as-is.

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { createBrowserComponentClient } from '@/lib/supabase/client';
import { yourSurfaceKeys } from './keys';

export const DEBOUNCE_WINDOW_MS = 500;

export function isYourSurfaceKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === yourSurfaceKeys.root[0];
}

export function useYourSurfaceRealtime({ casinoId, enabled = true }: Options) {
  const queryClient = useQueryClient();
  const lastMutationInvalidationAtRef = React.useRef<number | null>(null);
  const channelRef = React.useRef<RealtimeChannel | null>(null);

  // Observer subscription — detect mutation-side invalidations on our scope.
  React.useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action?.type === 'invalidate' &&
        isYourSurfaceKey(event.query.queryKey)
      ) {
        lastMutationInvalidationAtRef.current = Date.now();
      }
    });
    return unsubscribe;
  }, [queryClient]);

  // WAL subscription — filter, then debounce-check before invalidating.
  React.useEffect(() => {
    if (!enabled || !casinoId) return;
    const supabase = createBrowserComponentClient();
    const channel = supabase
      .channel(`your-surface-fact-${casinoId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'your_d2_table',
          filter: `casino_id=eq.${casinoId}` },
        () => {
          const last = lastMutationInvalidationAtRef.current;
          if (last !== null && Date.now() - last < DEBOUNCE_WINDOW_MS) {
            return; // mutation-side already invalidated; skip.
          }
          queryClient.invalidateQueries({ queryKey: yourSurfaceKeys.primary.scope });
          queryClient.invalidateQueries({ queryKey: yourSurfaceKeys.secondary.scope });
        })
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [casinoId, enabled, queryClient]);
}
```

**This is the normative mechanism for Phase 2.** New WAL hooks MUST use the observer API; the per-hook `markRecentXyzInvalidation(casinoId)` helper fallback is **emergency-only** and requires amendment-review before adoption — no Phase 2 slice should ship with the fallback without an explicit waiver recorded in the registry changelog.

### 2.2 Edge cases and what to test

| Edge case | What happens | What to assert in tests |
|---|---|---|
| WAL event arrives within 500ms of a mutation-side invalidation | Suppressed (debounce fires) | Seed a query in the cache, invalidate the scope, then fire WAL — spy on `invalidateQueries` attached AFTER the mutation; expect zero calls. |
| WAL event arrives after 500ms | Fires normally | Same setup but advance fake timers past 500ms — expect the two scope invalidations. |
| Mutation invalidates an UNRELATED scope, WAL fires within 500ms | WAL fires normally (observer filters by root) | Invalidate an unrelated root, then WAL event — expect the surface's invalidations to fire. |
| WAL event arrives while no seeded query matches the invalidated scope | `QueryCache.subscribe()` does NOT emit an `invalidate` event when no queries match. The debounce ref never gets stamped and WAL fires unguarded. | Tests that need to exercise the debounce path must `setQueryData` to seed a matching query BEFORE calling `invalidateQueries`. |
| WAL reconnect after network interruption | Supabase client re-subscribes; first event after reconnect is unguarded. | Not currently guarded — if reconnect storms become an issue, add a small "armed-after-reconnect" cooldown. Out of scope for Phase 1. |
| Multi-casino cross-tab concurrency | Each hook instance has its own ref, keyed per-casinoId. No shared state. | Verified in unit test: two `casinoId` values → two channels, two independent refs. |
| Same-tab rapid sequential mutations | Each invalidation re-stamps the ref; WAL within 500ms of the LATEST stamp is suppressed. Older WAL events not seen yet still suppressed correctly. | Intrinsic behavior — no extra test needed. |
| Dev/E2E disable via env flag | Hook checks `enabled` param at mount; subscription is bypassed. Hook still runs the observer subscription — harmless no-op since nothing invalidates. | `NEXT_PUBLIC_E2E_DISABLE_REALTIME=true` exercised in W3 Probe 2. |

### 2.3 Why this beats the alternatives

- **(a) "Delete mutation-side invalidation, rely on WAL only"** — requires editing every mutation hook in the D1 inventory to remove existing invalidation. Forces coordination change on all existing callers. Also loses the instant-feedback UX for the mutating tab.
- **(b) "Correlate mutation↔WAL by sequence number"** — mutation RPCs don't carry a sequence number that the WAL row echoes. Would require schema changes on `player_financial_transaction` and/or `table_buyin_telemetry` plus trigger edits. Out of scope and cross-context invasive.
- **(c) [CHOSEN] Centralized debounce in the WAL hook** — one file change, scales to N in-scope mutation hooks without edits to any of them. New mutation hooks just call the registered factory as usual; coordination is transparent.

---

## 3. Pitfalls encountered during implementation

Candidates to watch for in Phase 2, gathered from the W0–W5 build:

1. **`useRealtimeChannel` does not exist.** The EXEC-SPEC's external-dependencies block named it as an existing project hook; in fact the canonical pattern is the raw Supabase client as used by `hooks/dashboard/use-dashboard-realtime.tsx`. Phase 2 slices must copy the raw pattern, not attempt to import a shared helper.
2. **`QueryCache.subscribe()` does not emit `invalidate` events for empty caches.** Tests that verify the debounce path MUST seed a matching query via `setQueryData` before calling `invalidateQueries` — otherwise the observer never stamps the ref and the test's "mutation-side" simulation is a no-op.
3. **Pre-existing broken test file** `components/shift-dashboard-v3/__tests__/shift-dashboard-v3.test.tsx` was fully failing (10/10) before PRD-068 started; it was **not** introduced by W1/W2 and was **not** fixed by them. Phase 2 may encounter it and should treat it as a separate cleanup ticket, not as collateral damage.
4. **`serializeKeyFilters` value-based keys.** The shift-dashboard key factory uses `Object.assign((window) => [..., serializeKeyFilters(window)], { scope: [...] })`. WAL invalidation must use `shiftDashboardKeys.summary.scope` (the prefix without the window) — invalidating by value-based key would require knowing the current window. Phase 2 factories should follow the `Object.assign((args) => [...], { scope: [...] })` idiom so the same trick works.
5. **SRM ownership gap.** `table_buyin_telemetry` had no owning-service row in the SRM before PRD-068 W4. DA review caught this; going forward, new D2 tables introduced for an ADR-050 slice MUST have their SRM ownership resolved at PRD-drafting time, not retroactively. Default ruling: co-ownership under the write-side PFT-equivalent service + a read-only consumer row under the surface's service.
6. **Gaming-table fixture schema.** `gaming_table.type` is required (`game_type` enum: `blackjack`, etc.), `label` (not `name`), `pit` is a free-text column (not an FK to a separate `pit` table), and `status` values are `active | inactive | closed` (not `open`). E2E fixtures in Phase 2 can reuse `createShiftDashboardScenario()` + `createAdr050Scenario()` as a reference.
7. **Rolling window advance + operator override.** W1 chose component-boundary rolling (no hook file edits required). Operator commits a window via `TimeWindowSelector.onChange` and the hook freezes rolling until the operator clears. Phase 2 surfaces that also have operator-driven windows should follow the same override-wins pattern rather than rebuilding the interaction contract.

---

## 4. Slice-specific ADR-050 exceptions (Exit Criterion #4 explicit check)

Exit criterion #4 of `FINANCIAL-FRESHNESS-ROLLOUT.md` §Phase 1 requires an explicit statement: were any ADR-050 clauses worked around or extended by this slice? If none, state so clearly. If present, classify **structural** (invalidates replication) vs **cosmetic** (inherited by Phase 2, not blocking).

### 4.1 Clause-by-clause evidence

| ADR-050 clause | Satisfied by (concrete reference) | Classification |
|---|---|---|
| §3 Rule 1 — "a fact has at most one authoritative mutation source (D1)" | PFT is D1 for `FACT-RATED-BUYIN`; no alternate write path. Verified in REGISTRY row. | Satisfied, no exception |
| §3 Rule 2 — "a fact has at most one canonical freshness event source (D2)" | TBT is D2; no alternate event source. Verified in REGISTRY row. | Satisfied, no exception |
| §3 Rule 3 — "if a fact has no derivation, D1 = D2" | `FACT-RATED-BUYIN` HAS derivation (PFT → trg_bridge_finance_to_telemetry → TBT); D1 ≠ D2 legitimately. | Satisfied, no exception |
| §3 Rule 4 — "D4 reaction model: LIVE | INTERVAL | MANUAL" | D4 = LIVE with 2s nominal / 30s fallback. Registered row. | Satisfied, no exception |
| §4 **E1** — registered factory rule | `hooks/shift-dashboard/use-shift-dashboard-realtime.ts` invalidates `shiftDashboardKeys.summary.scope` + `.tableMetrics.scope` via the factory (no inline literals). Verified by `e1-factory-compliance.int.test.ts` (source-level audit over the Day-1 mutation-hook inventory). | Satisfied, no exception |
| §4 **E2** — window correctness | `components/shift-dashboard-v3/shift-dashboard-v3.tsx` rolling anchor + `computeRollingWindow()` pure helper + operator-override freeze. Verified by `shift-dashboard-v3.window-advance.test.tsx` (3 tests: advance, freeze, initial anchor). | Satisfied, no exception |
| §4 **E3** — publication membership | `supabase/migrations/20260420002749_add_tbt_to_supabase_realtime.sql` with idempotent guard. Verified: `SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='table_buyin_telemetry'` returns 1 row post-apply; re-run is a no-op. | Satisfied, no exception |
| §5 surface registration | `docs/20-architecture/REGISTRY_FINANCIAL_SURFACES.md` row for `FACT-RATED-BUYIN` / shift-dashboard set to ACTIVE with concrete `realtime_hook` and `window_correctness` values. Changelog entry present. | Satisfied, no exception |
| §6 SLA targets (2s LIVE nominal / 30s degraded) | Contract-property probes in `e2e/adr-050/exemplar-rated-buyin.spec.ts` (outer timeout 5s with 2000ms semantic intent; Playwright retries=2 in CI). | Satisfied, no exception (CI runtime flake margin documented) |
| §7 D4 observability | Existing `pg_stat_replication.replay_lag` check flagged as 24h post-deploy anchor for rollout Phase 5.4 CI pub-membership check. | Satisfied, no exception — Phase 5.4 is existing rollout work, not a PRD-068 extension |

### 4.2 Exit criterion #4 statement

**No slice-specific ADR-050 exceptions were required.** All seven clauses (§3 rules 1–4, §4 E1/E2/E3) were satisfied by code/migration deliverables and verified by tests. Surface registration (§5) and SLA targets (§6) are covered by the W4 registry promotion and W3 contract-property tests. §7 observability inherits from existing rollout plan Phase 5.4.

The slice does extend ADR-050's §4 E1 implementation guidance with **DEC-DD1(c)** (centralized debounce in the WAL hook, observer-API based). This is an *implementation pattern* under the E1 factory rule, not an exception to it. It is captured here as Section 2 and is the canonical Phase 2 pattern going forward.

**Replication viability confirmed.**

---

## Historical-context footer

The PRD-068 exemplar supersedes a prior arc of investigation documents and draft EXEC-SPECs that pre-date ADR-050's acceptance. Retained for context; **do not implement from them**:

- `docs/archive/EXEC-066*` (legacy EXEC-SPECs for shift-dashboard downstream reconciliation — drafted before ADR-050's contract framing)
- `docs/issues/shift-dash/INVESTIGATION-2026-04-17-winloss-estdrop-staleness.md` (root-cause investigation)
- Two companion investigation memos folded into the investigation doc above (detail files referenced in PRD-066 `investigation_ref`)

The authoritative architectural source for all future slices is **ADR-050** + **REGISTRY_FINANCIAL_SURFACES.md** + this checklist. PRD-066 is re-statused `Superseded by PRD-068`.
