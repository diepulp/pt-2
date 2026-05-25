## PATCH DELTA — RFC-006 Hardening Corrections

### DEF-1 — Canonical Ordering Authority Split-Brain

Replace all relay/replay ordering references based on `created_at` with UUIDv7 ordering authority.

Add invariant:

> Relay ordering authority = `event_id` UUIDv7 monotonic ordering.  
> `created_at` is observational metadata only and MUST NOT be treated as replay ordering authority.

Update relay poll query:

```sql
ORDER BY event_id
Update replay index:

CREATE INDEX idx_finance_outbox_entity_order
  ON finance_outbox (table_id, event_id);

Update relay poll index:

CREATE INDEX idx_finance_outbox_relay
  ON finance_outbox (event_id)
  WHERE processed_at IS NULL;
```

Clarify:

per-entity ordering derives from (table_id, event_id)
created_at remains useful for diagnostics/audit visibility only
DEF-2 — Clarify processed_at Semantics

Replace all wording similar to:

"sets processed_at on confirmed delivery"

with:

processed_at records successful relay dispatch acknowledgment.
Consumer-side projection durability and side-effect completion are governed independently via processed_messages.

Clarify:

relay dispatch success ≠ projection durability
at-least-once semantics still permit duplicate delivery
DEF-3 — Correct processed_messages Ownership

Replace:

Owned by PlayerFinancialService

with:

Infrastructure-owned relay/consumer deduplication store.

or:

Owned by the outbox consumer infrastructure layer.

Rationale:

processed_messages is transport/idempotency infrastructure
not financial-domain state
not projection-domain state
DEF-4 — Remove Consumer Framework Drift

Replace phrases such as:

registered consumer

with:

configured internal projection consumer

or:

internal projection consumer module

Clarify:

Wave 2 assumes a bounded single-consumer topology
no subscriber registry
no dynamic consumer orchestration
no consumer plugin framework
DEF-5 — Resolve Append-Only vs Mutable Lifecycle Semantics

Add clarification under finance_outbox invariants:

The event envelope is immutable after insert (event_id, fact_class,
origin_label, payload, aggregate_id, etc.).

Relay lifecycle metadata (processed_at, delivery_attempts,
last_attempted_at, last_error) is mutable operational state and is
excluded from append-only semantics.

DEF-6 — Prevent Event Catalog Governance Inflation

Add clarification under Wave 2 event catalog section:

The Wave 2 event catalog is a static bounded registry of allowed
event_type values for pilot transport discipline.

It is not:

a dynamic event registry
a runtime discovery mechanism
an orchestration framework
a governance subsystem

The catalog exists solely to prevent ad-hoc semantic drift in producer and
consumer implementations.
