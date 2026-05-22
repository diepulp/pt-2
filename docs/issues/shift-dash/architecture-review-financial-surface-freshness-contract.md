# Architecture Review Memo — Financial Surface Freshness Contract Gap

**Date:** 2026-04-19  
**Audience:** Architecture review  
**Subject:** Why a single buy-in edit feels unnecessarily convoluted, and what standard is missing

---

## 1. Executive Summary

The user concern is valid.

A single financially authoritative edit should not require surface-specific improvisation to make downstream views truthful. The current behavior feels convoluted because the system has a **write-path standard** but lacks a **read-plane freshness standard** for financially derived surfaces.

Today, the bridge guarantees that one committed financial mutation fans out into the correct downstream records. What it does **not** guarantee is that all financially responsible UI surfaces will update coherently, on time, from one shared freshness contract.

That missing contract is the actual architecture gap.

---

## 2. What Already Exists and Works

The server-side financial derivation path is already established:

```text
financial adjustment commits
  -> INSERT player_financial_transaction (authoritative write)
     -> trigger derives table_buyin_telemetry
     -> trigger derives mtl_entry
```

This is the correct shape for data derivation and atomicity.

The investigation confirms that:

- the server write-path is GREEN
- the bridge writes the downstream rows correctly
- `rpc_shift_table_metrics` already reads `table_buyin_telemetry`
- `RATED_ADJUSTMENT` is already included in the metric aggregation

So the system is **not** failing because the financial fact is missing in the database.

It is failing because downstream consumer freshness is not standardized.

---

## 3. Why the Current Behavior Feels Wrong

The intuitive expectation is:

```text
one financial edit
  -> one authoritative write path
  -> one bridge-derived downstream fact set
  -> all financially responsible surfaces update from the same event
```

That expectation is sound.

Instead, the current implementation behaves more like this:

```text
one financial edit
  -> authoritative write succeeds
  -> derived rows are created correctly
  -> one hook invalidates one dashboard
  -> another flow does not invalidate
  -> one surface polls
  -> another has partial realtime
  -> one query window is frozen and excludes the new row anyway
```

This is why the system feels ad hoc. The write-path is unified, but the read-plane is fragmented.

---

## 4. Core Distinction: Bridge vs Freshness Bus

This distinction is load-bearing.

### 4.1 What the bridge does

The bridge solves:

- authoritative derivation
- transactional fan-out
- atomic creation of downstream rows
- preservation of auditability and provenance

### 4.2 What the bridge does not do

The bridge does **not** solve:

- notifying already-open browser tabs
- advancing stale client query windows
- deciding which cached queries to invalidate
- ensuring every affected surface listens to the same event source
- enforcing a common freshness SLA across surfaces

In plain terms:

> The bridge is a database derivation mechanism, not a UI freshness bus.

Treating the bridge as if it should magically update all open views is the category error behind the confusion.

---

## 5. Actual Gap

The missing artifact is a **Financial Surface Freshness Contract**.

The system currently has no explicit standard defining:

1. the canonical mutation source  
2. the canonical downstream event source for UI freshness  
3. which financially responsible surfaces must respond  
4. how they respond (realtime, invalidation, polling fallback)  
5. what freshness class each surface promises

Without that standard, every surface is left to invent its own local behavior.

That is exactly what the current bug cluster demonstrates.

---

## 6. Evidence of Fragmentation

The current investigation shows multiple symptoms of local, non-standard handling:

- `useCreateFinancialAdjustment` invalidates shift-dashboard keys
- `useSaveWithBuyIn` does not
- the shift dashboard lacks its own realtime subscription
- the shift dashboard query window was frozen at mount, so even a valid invalidation refetched the wrong time slice
- cross-tab freshness is not guaranteed by a shared contract

This means the system currently relies on a patchwork of:

- hook-local invalidations
- surface-local polling
- uneven realtime adoption
- query freshness assumptions that are not centrally governed

That is not an architecture standard. It is survival behavior.

---

## 7. What the Standard Should Be

A minimal architecture standard for financially responsible surfaces should define the following:

## 7.1 Authoritative mutation source

One canonical write surface for the business event.

**Current reality:** `player_financial_transaction`

This remains the source of truth for the financial mutation itself.

## 7.2 Derived downstream facts

Triggers/materialization produce the read-facing financial facts.

**Current reality:**
- `table_buyin_telemetry`
- `mtl_entry`

This is already working.

## 7.3 Canonical freshness event

There must be one declared downstream event source that UI consumers use as the freshness trigger.

For the shift-dashboard Win/Loss + Est. Drop case, the better candidate appears to be:

**`table_buyin_telemetry`**

Reasoning:

- it is the table the metric actually reads
- it already encodes the relevant semantic events
- it appears to have cleaner casino-scoped access posture than `player_financial_transaction`
- it avoids subscribing one layer upstream and then invalidating on noisier events than the metric actually consumes

## 7.4 Consumer response contract

Every financially responsible surface must declare one of the following reaction models:

- realtime subscription to canonical event + targeted invalidation
- direct cache invalidation through a shared dispatcher
- polling fallback with explicit freshness ceiling

What should not be allowed as the default model:

- ad hoc hook-local invalidation with no registry of affected surfaces
- each surface inventing its own target table for freshness
- each surface silently relying on stale query windows

## 7.5 Freshness class

Each financially responsible surface should explicitly declare its intended freshness class, for example:

- **live** — realtime target with polling fallback
- **interval** — polling only, with defined upper bound
- **manual** — operator refresh required

If a surface is used for operational judgment, it should not ambiguously drift between those categories.

---

## 8. Recommended Principle

The architecture should adopt this principle:

> Financial derivation is centralized; financial freshness must be centralized too.

A mutation that changes a financially meaningful fact should not require every surface owner to remember:
- which query key to invalidate
- which table to subscribe to
- which flows were already patched
- whether their time window can even include the new record

That is exactly the sort of thing a standard exists to prevent.

---

## 9. Recommended Direction for the Current Slice

For the current shift-dashboard remediation, the cleaner direction is:

1. **Keep the rolling-window fix**
   - This is mandatory.
   - Without it, the dashboard can refetch and still exclude the new adjustment forever.

2. **Retarget realtime to the downstream table the metric reads**
   - Prefer `table_buyin_telemetry` as the freshness trigger for Win/Loss + Est. Drop.
   - This better reuses the existing bridge output instead of listening upstream on a broader table.

3. **Do not couple this slice to unrelated upstream RLS cleanup**
   - If `player_financial_transaction` has a separate access-policy issue, handle that as its own artifact.
   - Do not make the dashboard freshness slice pay that tax unless it truly must.

4. **Use this issue to establish the standard**
   - The immediate bug can be fixed narrowly.
   - But the real architecture correction is the downstream freshness contract.

---

## 10. Proposed Standard Skeleton

Suggested future artifact title:

**ADR — Financial Surface Freshness Contract**

Suggested sections:

1. Purpose  
2. Scope  
3. Canonical financial mutation sources  
4. Canonical downstream freshness event sources  
5. Surface registry: financially responsible consumers  
6. Allowed freshness mechanisms  
7. Freshness classes and SLAs  
8. Query-window correctness requirements  
9. Cross-tab / cross-session requirements  
10. Fallback behavior when realtime degrades  
11. Testing obligations  
12. Anti-patterns / prohibited local improvisations

---

## 11. Anti-Patterns to Ban

The architecture review should explicitly reject the following patterns as default behavior:

- Per-hook invalidation with no global consumer registry
- Realtime subscriptions chosen for convenience rather than semantic alignment
- Upstream-table subscriptions when a downstream derived table is the actual metric input
- Frozen query windows on operational dashboards
- Silent dependence on manual reload for operationally meaningful financial changes
- Bundling unrelated security remediation into a freshness fix unless strictly necessary

---

## 12. Architecture Conclusion

The problem is not that the bridge failed.

The problem is that the architecture never established what happens **after** the bridge writes the correct downstream facts.

That missing layer is the reason a simple business expectation —
“edit buy-in once, all financially responsible views update” —
has degraded into local invalidations, polling, mismatched subscriptions, and stale-window bugs.

The corrective move is twofold:

- patch the immediate shift-dashboard issue with the narrowest correct implementation
- establish a **Financial Surface Freshness Contract** so this class of issue stops recurring surface by surface

---

## 13. Review Questions

1. Should the architecture formally distinguish **authoritative mutation source** from **canonical freshness event source**?
2. For shift-dashboard metrics derived from `table_buyin_telemetry`, should TBT be the declared freshness trigger instead of `player_financial_transaction`?
3. Which surfaces qualify as **financially responsible surfaces** and therefore must participate in the contract?
4. Should ad hoc hook-level invalidation be treated as an exception path requiring explicit justification?
5. Should every financially responsible query be required to prove its windowing semantics can include post-mount mutations?

---

## 14. One-Line Summary

The system already has a financial derivation bridge. What it lacks is a downstream freshness contract. That is why a one-row financial edit still fails to update one surface coherently.
