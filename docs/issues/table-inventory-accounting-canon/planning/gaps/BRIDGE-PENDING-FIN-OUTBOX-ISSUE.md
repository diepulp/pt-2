I have authoritative answers. Here are the findings.

---

## Financial Model Authority — Findings

### Q1: Does any Finance projection expose a session-scoped buy-in signal?

**No. And the schema confirms why.**

`shift_operational_projection` was delivered in Phase 2.4. Its primary key is `(casino_id, gaming_day, table_id)` — gaming-day scoped, not session-scoped. It tracks `grind_volume_cents`, `fill_total_cents`, `credit_total_cents`, `event_count`. No session-level granularity.

`visit_class_a_projection` (Phase 2.3) is visit-scoped, Class A only. No buy-in count per session.

No Finance projection can answer "did a qualifying buy-in occur for this `table_session_id`?" That signal does not exist in any published read model.

---

### Q2: Is `finance_outbox` queryable by `table_session_id`?

**No.** The outbox DDL envelope columns are:

```
event_id, event_type, fact_class, origin_label,
table_id (NOT NULL), player_id (NULL), aggregate_id,
payload (JSONB), created_at, processed_at, gaming_day
```

`table_session_id` is not an envelope column. If it exists at all, it is buried in `payload` JSONB — not indexed, not queryable by contract. Querying payload for a session ID would be an ad-hoc cross-boundary read against Finance infrastructure with no published DTO contract.

---

### Q3: Is `bridge_pending` detection a relay responsibility?

**Yes, definitively.**

ADR-054 R3 mandates atomic same-transaction outbox emission. The relay's at-least-once delivery guarantee means: if a qualifying buy-in was authored and emitted to `finance_outbox`, the relay **will** process it and the bridge trigger **will** eventually write the `table_buyin_telemetry` row. `bridge_pending` is always a transient relay-lag state — not a domain state that stabilises.

The relay observability concern is already scoped: Phase 2.3a (Operational Outbox Observability) covers poison candidate labeling and relay health inspection via an admin surface. That is where relay lag is surfaced — not in a projection DTO consumed by a pit operator.

TableInventoryAccounting querying Finance tables to detect relay lag would be: wrong boundary, wrong direction, and a concern that belongs to infrastructure observability, not domain projection.

---

### Q4: Current Wave 2 posture on Finance → TableContextService cross-context consumption?

**Not established, not authorized for this slice.**

Wave 2 principles state: "No multi-consumer fan-out registry — Wave 2 assumes a single internal consumer path." No published DTO contract exists between Finance projections and TableContextService subdomains. Creating one requires its own PRD.

---

## Verdict on the canon amendment

**`bridge_pending` must be removed from the exemplar `drop_estimate_state` enum.**

It is not detectable from within the TableInventoryAccounting service boundary, it is not a domain state that stabilises, and the relay's at-least-once guarantee already handles it operationally. Keeping it in the DTO shape would be specifying a state the service can never reliably populate — which is the same class of semantic honesty problem the canonization is trying to eliminate.

The exemplar enum should be:

```ts
drop_estimate_state:
  | 'present'          // SUM produced a value
  | 'none_for_session' // SUM over zero qualifying rows = null; no qualifying telemetry events
```

`source_unavailable` and `integrity_issue` carry the same problem — they require signals that are either not available or out of scope for this slice. I would defer both and extend the enum in a follow-on slice when their detection paths and surface disclosure patterns are defined.

**The user's amendment was valid at the core — `drop_estimate_state` as a discriminator is the right model. But the enum width was premature.** I should have surfaced this before committing the patch rather than accepting it wholesale.