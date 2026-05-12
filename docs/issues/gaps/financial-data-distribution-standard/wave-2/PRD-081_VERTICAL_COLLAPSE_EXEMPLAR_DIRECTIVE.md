# PRD-081 Vertical Collapse Directive

**Document type:** implementation containment directive  
**Applies to:** PRD-081 — Transactional Outbox / GAP-F1 Closure  
**Status:** Active directive for PRD-081 pivot  
**Purpose:** Collapse Wave 2 implementation vertically around a symmetric exemplar pair so the system gains a working transactional outbox without allowing the discovery loop to keep widening scope.

---

## 1. Directive

PRD-081 must pivot from a broad producer-rollout posture to an **exemplar-first transport proof slice**.

The immediate goal is not to wire every possible producer.

The immediate goal is to establish a functional transactional outbox in the system by proving the core transport invariants against the smallest representative pair:

- one Class A Authority Fact producer
- one Class B Telemetry Fact producer
- one relay path
- one idempotent consumer backbone
- one replay-validation path

This is the vertical collapse.

The slice should prove that the architecture works end-to-end before expanding horizontally into every producer surface.

---

## 2. Problem Being Corrected

PRD-081 currently carries the correct architectural intent but too much implementation breadth at once.

The current surface includes:

- Class A transaction producer wiring
- Class A adjustment producer wiring
- Class B grind producer wiring
- fill Dependency Event producer wiring
- credit Dependency Event producer wiring
- outbox DDL migration
- table-buyin telemetry migration
- processed message storage
- relay worker
- claim RPC
- event DTO
- event catalog
- cron configuration
- failure harness
- replay proof
- security posture tests
- concurrency tests
- migration compatibility checks

This is not conceptually wrong.

But as an implementation entry point, it creates too many places for new semantic findings to emerge before the system has any working transactional outbox at all.

The discovery loop is therefore stalling implementation.

The correction is to preserve the final architecture while narrowing the first executable slice.

---

## 3. Vertical Collapse Principle

The implementation must collapse vertically, not horizontally.

A horizontal rollout asks:

> How do we wire every producer category into the outbox?

A vertical rollout asks:

> What is the smallest end-to-end path that proves the transport invariant is real?

For PRD-081, the correct first slice is the smallest symmetric pair that exercises both fact classes and the full delivery chain.

This avoids the two bad alternatives:

1. **Over-broad rollout:** all producers wired before the transport mechanism is proven.
2. **Asymmetric shortcut:** Class A first, Class B later, violating cross-class parity discipline.

The exemplar must be smaller than the full rollout, but still symmetric.

---

## 4. Exemplar Pair

### 4.1 Class A exemplar

Use:

```text
rpc_create_financial_txn
```

This is the canonical Authority Fact path.

It proves:

- PFT authoring row + outbox row in the same database transaction
- `fact_class = 'ledger'`
- `origin_label = 'actual'`
- player attribution present
- table anchor resolution through same-casino `rating_slip.table_id`
- idempotency behavior for repeated producer calls
- no fabricated table anchor for non-table-scoped Class A writes

### 4.2 Class B exemplar

Use:

```text
rpc_record_grind_observation
```

This is the canonical Telemetry Fact path.

It proves:

- `table_buyin_telemetry` authoring row + outbox row in the same database transaction
- `fact_class = 'operational'`
- `origin_label = 'estimated'`
- `player_id = NULL`
- table anchoring without player attribution
- preservation of current required-field semantics such as `actor_id`, `gaming_day`, and `telemetry_kind`
- no secondary non-outbox grind write path

---

## 5. Required Scope for the Exemplar Slice

The exemplar slice must include only the work necessary to make the two selected producers functional through the complete transport loop.

### In scope

- `finance_outbox` migration to the Wave 2 contract
- required indexes and integrity constraints for the exemplar path
- envelope immutability guard
- bounded relay lifecycle columns
- `processed_messages` table for idempotent receipt
- Class A exemplar producer wiring: `rpc_create_financial_txn`
- Class B exemplar producer wiring: `rpc_record_grind_observation`
- backward-compatible handling or migration of existing grind call sites so no non-outbox grind path remains for the exemplar
- `FinancialOutboxEventDTO`
- static Wave 2 event catalog entries required by the exemplar pair
- relay endpoint and claim RPC
- cron-secret validation
- service-role relay access only after auth validation
- idempotent consumer backbone
- replay-validation harness for the exemplar events
- I1–I4 proof against the exemplar pair

### Explicitly deferred from the exemplar slice

- `rpc_create_financial_adjustment` producer wiring
- `rpc_request_table_fill` producer wiring
- `rpc_request_table_credit` producer wiring
- dependency-event rollout beyond catalog reservation
- projection consumer implementation beyond the minimal idempotent receipt/proof harness
- operator-visible completeness changes
- dashboard freshness behavior
- replay UI
- observability dashboard
- multi-consumer fan-out
- dynamic consumer registry
- external event contracts
- reconciliation logic

Deferred does not mean rejected.

Deferred means the work waits until the exemplar pair proves the transport invariant.

---

## 6. Parity Is Preserved

This directive does not relax ADR-055.

The exemplar slice is intentionally smaller, but it must still preserve cross-class authoring parity.

The Class A and Class B exemplar paths must share:

- one outbox envelope shape
- identical required event columns
- identical transaction discipline
- identical `event_id` generation strategy
- identical relay semantics
- identical idempotent-consumer semantics
- identical replay ordering expectations
- identical error posture where applicable

The forbidden pattern remains forbidden:

```text
Class A now, Class B later.
```

The permitted pattern is:

```text
One Class A exemplar + one Class B exemplar now; remaining producers later.
```

That distinction is load-bearing.

---

## 7. Success Criteria

The exemplar slice is successful when the system can demonstrate the following with real code, not just specification language.

### I1 — Atomicity

For both exemplar producers:

- the authoring row and `finance_outbox` row are born in the same transaction
- rollback injection proves both writes commit or both disappear
- row-count assertions alone are insufficient

### I2 — Durability

A committed outbox row survives relay failure and is redelivered on the next poll cycle.

### I3 — Idempotency

Processing the same `event_id` twice produces one consumer side effect.

`processed_messages` and the projection/test side effect commit atomically.

### I4 — Replayability

Truncating derived exemplar state and replaying from `finance_outbox` in deterministic order produces the same result as live processing.

---

## 8. PRD-081 Amendment Text

The following block should be folded into PRD-081 near the Overview, Scope, or Definition of Done section.

```md
## Vertical Collapse — Exemplar-First Transport Proof

PRD-081 will be implemented as an exemplar-first transport proof slice before full producer expansion.

The initial implementation scope is intentionally limited to a symmetric producer pair:

- Class A exemplar: `rpc_create_financial_txn`
- Class B exemplar: `rpc_record_grind_observation`

The purpose of this slice is to establish a functional transactional outbox in the system and prove I1–I4 under real execution conditions:

- I1 atomicity
- I2 durability
- I3 idempotency
- I4 replayability

This containment does not relax ADR-055 parity. The exemplar slice must still demonstrate one shared envelope shape, identical transaction discipline, identical relay semantics, identical idempotent-consumer semantics, and replayability across both fact classes.

The following producer expansions are deferred until the exemplar slice passes I1–I4:

- `rpc_create_financial_adjustment`
- `rpc_request_table_fill`
- `rpc_request_table_credit`

Dependency Events remain in the Wave 2 taxonomy and event catalog, but their producer wiring is not part of the exemplar proof unless explicitly pulled into a successor slice.

No projection surface, operator-visible completeness change, observability dashboard, replay UI, fan-out registry, or external consumer contract may be introduced under the exemplar slice.

After the exemplar slice passes, producer expansion proceeds as a bounded follow-on rollout, not as a reopening of the transport architecture.
```

---

## 9. Implementation Sequencing

Recommended execution order:

1. Migrate `finance_outbox` to the Wave 2 contract.
2. Add `processed_messages`.
3. Establish UUIDv7 event identity.
4. Wire `rpc_create_financial_txn` exemplar emission.
5. Wire `rpc_record_grind_observation` exemplar emission.
6. Add event DTO and exemplar catalog entries.
7. Build relay claim RPC and internal relay route.
8. Add idempotent consumer backbone.
9. Prove I1–I4 against the exemplar pair.
10. Freeze exemplar result.
11. Only then expand remaining producers.

This sequence prevents the implementation from discovering issues across five producers before one complete transport path exists.

---

## 10. Final Directive

Do not keep broadening PRD-081 to answer every downstream propagation question before implementation begins.

The outbox must now become real.

The correct move is to prove the transport mechanism with one symmetric pair, then expand.

Build the smallest real thing that exercises the whole chain:

```text
Authority Fact producer
+ Telemetry Fact producer
+ finance_outbox
+ relay
+ idempotent receipt
+ replay proof
```

That is enough to collapse the discovery loop.

That is enough to establish the transactional outbox as functioning infrastructure.

Everything else can queue behind the proof.
