Empirical grounding confirmed: all six D2 tables have `REPLICA IDENTITY DEFAULT` with valid PKs. INSERT payloads are complete; UPDATE/DELETE emit `NEW`-full / `OLD`-PK-only — sufficient for every surface in the registry (none of them compute OLD-row deltas).

## Pilot-Containment Assessment — Phase 1 Exemplar Blast Radius

### Does the exemplar preserve the D1/D2 distinction?

**Yes, strongly.** The distinction is not just preserved — the ADR codifies it:

- §1 D1 definition: authoritative mutation source. PFT remains the single-writer for rated buy-ins.
- §1 D2 definition: canonical freshness event source. TBT is named, deliberately distinct from D1.
- §3 rule 1 (read-symmetric): subscribe where the read RPC aggregates. `rpc_shift_table_metrics` reads TBT → D2 is TBT. Not PFT.
- §3 rule 3 (bridge-terminal): when a derivation trigger exists, D2 is the derived table. PFT→TBT derivation via `trg_bridge_finance_to_telemetry` stays intact.

The PFT → TBT mental model is not being replaced — it is being **named**. The exemplar materializes §3 rule 1 + rule 3 simultaneously. Prior to the ADR, "why subscribe to TBT not PFT?" was an undocumented judgment call (see `docs/issues/shift-dash/ALTENATE-DIRECTION.md`). After the exemplar ships, it's a normative rule with a worked precedent.

### Does the exemplar keep non-standardized surfaces functioning?

**Yes, by construction.** The exemplar is purely additive at the database layer:

- W0 (`ALTER PUBLICATION ADD TABLE table_buyin_telemetry`) — additive. Existing writers, readers, triggers, and RLS are untouched. Surfaces that don't subscribe to TBT ignore the new WAL stream.
- W1 (rolling-window refactor) — scoped to `shift-dashboard-v3.tsx:87` only. The query hook's key composition must remain backward-compatible with any cache-sharing consumers; flag for the Replication Checklist.
- W2 (new `use-shift-dashboard-realtime.ts`) — a new file, mounted only from the shift-dashboard surface. No other consumer touches it.
- W3/W4 — tests + registry. No runtime surface impact.

The MTL, cash-obs, pit-approvals, session-custody, analytics, and rating-slip-modal surfaces all remain on their current polling + mutation-invalidation flows. Nothing deletes or replaces their existing behavior.

### Real risks worth naming (all containable)

| Risk                                                                                                                                                                                                                                                  | Severity                                                                                                                                                                                          | Status                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Duplicate-invalidation storm** — `useCreateFinancialAdjustment` already invalidates shift-dashboard keys. Post-W2, the same mutation will also trigger a TBT WAL event that invalidates the same keys. Two invalidations per write → two refetches. | **Medium**. Wasteful, not broken. Capture in Replication Checklist; resolve by removing the mutation-side invalidation of shift keys OR by making the realtime hook idempotent on recent WAL seq. | Must be in the exemplar slice's deliverables, not Phase 2.                                                                                                                                                |
| **Publication event volume** — every PFT write produces a TBT row → WAL event. At current scale negligible, but worth monitoring once W0 lands.                                                                                                       | Low                                                                                                                                                                                               | Post-W0 observability item, not a blocker.                                                                                                                                                                |
| **Shift-dashboard behavior change reveals latent bugs** — surfaces that were implicitly benefiting from staleness (e.g., hiding a race) may expose those races once freshness improves.                                                               | Low-Medium                                                                                                                                                                                        | Normal QA exposure; the Phase 1 exemplar's W3 probes catch the common cases.                                                                                                                              |
| **Asymmetric state post-exemplar, pre-2.B/2.C** — TBT subscription works; `useDashboardRealtime` subscriptions to `rating_slip`/`table_fill`/`table_credit` still silent (OVI #5). Shift-dashboard is mostly standardized; other surfaces aren't.     | Low                                                                                                                                                                                               | Already documented as OVI #5; Phase 2.B/2.C close it. Not a new risk introduced by the exemplar — the pre-exemplar state is actually worse (shift-dashboard has the same dead-subscription defect today). |

### What the exemplar does NOT do (and this is the containment line)

- It does **not** write directly to TBT. PFT remains the sole writer. If any future slice proposes direct-to-TBT writes, that would break D1/D2 and should be rejected at review.
- It does **not** change the bridge trigger, PFT RLS, TBT RLS, or `rpc_shift_table_metrics` semantics.
- It does **not** deprecate `useDashboardRealtime`. That hook keeps its current (non-functional) `postgres_changes` subscriptions; Phase 2.B/2.C will reconcile them via ADD-TABLE migrations (OVI #5 path).
- It does **not** impose a reaction model on any surface other than shift-dashboard rated-buyin.

### Guardrail verdict

**Standardize-later guardrail satisfied.** The ADR preserves D1/D2 distinction (§1 + §3 + Decisions Resolved #2). The PFT → TBT mental model is codified, not replaced. Non-standardized surfaces continue to function because the exemplar is purely additive.

### One recommendation to strengthen containment

Add an explicit item to **Phase 1 Exemplar Exit Criterion** #3 (Replication Checklist) requiring the reviewer to document how the slice handles mutation-side invalidation vs. new WAL-side invalidation for overlapping query keys. This is the one concrete behavioral change that future slices will repeat — without a captured pattern, each slice's author will re-invent (or miss) the coordination. This is a small edit to the rollout, not the ADR.

Want me to make that edit? If so, it's a one-line amendment to line 70 of `FINANCIAL-FRESHNESS-ROLLOUT.md`. After that, scaffolding the exemplar EXEC-SPEC is the clean next step.