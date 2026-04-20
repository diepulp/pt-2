Investigation complete. Here's the assessment.

## Findings

**Existing server-side bridge (all GREEN, atomic in one txn):**

```
adjustment commits
   └── INSERT player_financial_transaction (PFT)         [source of truth]
         ├── trg_bridge_rated_buyin_telemetry → INSERT table_buyin_telemetry (TBT)
         └── trg_derive_mtl_from_finance      → INSERT mtl_entry
```

`rpc_shift_table_metrics` reads from **`table_buyin_telemetry`**, aggregating `RATED_BUYIN + RATED_ADJUSTMENT`. The "bi-directional bridge" the user refers to is this fan-out; PFT writes spawn TBT and MTL rows carrying `rating_slip_id`. There's no UPDATE-back to rating_slip — it's referenced by foreign key only.

**Bridge cannot push to clients.** It's a database trigger; it writes rows. Client-side notification still needs Supabase Realtime on *some* table.

**RLS posture comparison (this is the kicker):**

| Table | SELECT policy | Casino-direct? | Realtime-safe? |
|---|---|---|---|
| `player_financial_transaction` | EXISTS via `player_casino + visit` indirect lookup (the WS0 BLOCK) | ❌ leaks shared-player | ❌ needs remediation |
| `table_buyin_telemetry` | direct `casino_id = COALESCE(session_var, jwt)` | ✅ canonical Pattern C | ✅ already safe |
| `mtl_entry` | casino-scoped per ADR-025 | ✅ | ✅ |

Neither PFT nor TBT is currently in the `supabase_realtime` publication (no migration adds them).

## Is EXEC-066 reinventing the wheel?

**Partially yes — wrong subscription target, right symptom.**

- The **rolling-window fix (WS1)** is necessary regardless of subscription target. The frozen `useState` window excludes any post-mount adjustment from the RPC's `< p_window_end` filter. Bridge or no bridge, the dashboard would still display stale numbers without WS1. Keep WS1.
- The **realtime subscription (WS2) on PFT** is the questionable choice. The investigation doc (§4.1 Patch B) recommended PFT, but did so before the WS0 RLS audit revealed PFT's broken SELECT policy. EXEC-066 inherited that recommendation uncritically.

**TBT is the better subscription target:**

1. **It's what the metric actually reads.** Direct semantic mapping. Subscribing one level upstream (PFT) is indirection without benefit.
2. **Its RLS is already correct.** The whole WS0 BLOCK + remediation migration goes away. No separate RLS-fix artifact to ship first.
3. **Less invalidation noise.** PFT INSERTs include cash-outs, markers, sub-threshold buy-ins — events that don't move Win/Loss. TBT only receives `RATED_BUYIN`/`RATED_ADJUSTMENT`, which is exactly the metric's input.
4. **Same publication-enable cost.** Both PFT and TBT would need the same env-level `alter publication supabase_realtime add table …` step. Difference: TBT doesn't need a precondition RLS migration.

The bridge IS reused in this design — by relying on its synchronous TBT write to be the realtime trigger, instead of subscribing one level too far upstream.

## Is the spec direction warranted?

**Mostly warranted, with one substitution:**

- WS0 (PFT preflight) — **delete or repurpose.** Not needed if we don't subscribe to PFT. Repurpose as a TBT realtime publication-enable verification (which is a much smaller gate).
- WS1 (rolling window) — **keep.** Independent of subscription target.
- WS2 (realtime hook) — **keep, retarget to `table_buyin_telemetry`** with `event: 'INSERT'`, `filter: casino_id=eq.<id>`. Same hook shape, different table.
- WS3 (Jest + Playwright) — **keep, adapt mocks to TBT.**
- WS4 (docs) — **keep, simpler.** No PFT realtime posture change to document.

## Recommendation

Don't ship the PFT remediation migration. Pivot WS0/WS2 to TBT, which:
- Reuses the existing bridge (you keep your read-pull through `rpc_shift_table_metrics`; you only add a TBT-write notification on top, which the bridge already produces).
- Eliminates the PFT RLS BLOCK as a side effect.
- Reduces the EXEC-SPEC's risk surface.

The PFT SELECT leak is still a real bug — file it as a separate follow-on (e.g., SEC-NNN), not a precondition for shipping shift-dashboard freshness.

**Suggested next move:** revise EXEC-066 to subscribe to `table_buyin_telemetry` and resume from a fresh 