# Producer Runtime Certification Slice — PRD-083 Follow-Up

**Document type:** Immediate validation follow-up  
**Applies to:** PRD-083 / EXEC-083 — Wave 2 Phase 2.1 Financial Adjustment Producer Expansion  
**Status:** Proposed immediate post-merge certification slice  
**Date:** 2026-05-18  
**Scope:** PT-2 Wave 2 transactional outbox — post-exemplar producer certification  

---

## 1. Purpose

PRD-083 concluded Wave 2 Phase 2.1 by wiring `rpc_create_financial_adjustment` to emit `adjustment.recorded` events through the established `finance_outbox` transport substrate.

This follow-up slice exists to certify that the new producer path works against a live database after implementation.

It is not a new architecture phase.

It is not a second PRD-082.

It is not a replay of the full exemplar proof.

Its purpose is narrower:

> Prove that the Phase 2.1 producer expansion works in a live Supabase database without destabilizing the already-proven Wave 2 transport substrate.

---

## 2. Why This Slice Exists

PRD-081/082 answered the existential question:

> Can the transactional outbox transport work at all?

PRD-083 answered the expansion question:

> Can the first post-exemplar producer be integrated without changing the transport architecture?

This slice answers the runtime certification question:

> Did the producer expansion actually hold under live database execution, RLS, grants, SECURITY DEFINER behavior, idempotency, and relay compatibility?

The answer must be proven, not assumed.

---

## 3. Certification Boundary

This slice certifies only:

- `rpc_create_financial_adjustment` live producer behavior
- `adjustment.recorded` emission eligibility
- Option A security hardening in a live database
- helper-backed producer insertion through `fn_finance_outbox_emit`
- duplicate and concurrent retry behavior
- minimal regression smoke for previously proven exemplar producers

This slice does not certify:

- new relay architecture
- new consumer behavior
- projection stores
- completeness projections
- event-bus semantics
- external consumer contracts
- observability strategy
- Phase 2.2 fills/credits
- Phase 2.3 lifecycle completeness

---

## 4. Relationship to PRD-082

PRD-082 was a runtime validation gate for the entire Wave 2 exemplar substrate.

This slice is smaller.

| Question | PRD-082 | Producer Runtime Certification |
|---|---|---|
| Prove transport exists | Yes | No |
| Prove I1–I5 globally | Yes | No |
| Prove relay/replay/idempotent receipt architecture | Yes | No |
| Prove new producer works live | No | Yes |
| Prove security hardening did not break producers | No | Yes |
| Prove helper-backed insertion under real RLS/grants | No | Yes |
| Prove existing exemplar producers still work after helper adaptation | No | Smoke only |

The correct posture is:

> Do not repeat PRD-082. Certify only the new producer and the surfaces PRD-083 actually changed.

---

## 5. Certification Invariant

The certification invariant is:

> An ADR-057-eligible financial adjustment emits exactly one `adjustment.recorded` outbox row atomically with its PFT row through the governed SECURITY DEFINER helper, while ineligible adjustments remain valid PFT writes with zero outbox emission, direct authenticated table insertion remains denied, and previously proven exemplar producers still emit successfully.

---

## 6. Required Live Proofs

### 6.1 Adjustment I1 Live Proof

Run against a live local Supabase database with seeded fixtures.

Required cases:

1. **Eligible success**
   - linked original PFT is `source='pit'`
   - original direction is `in`
   - tender type is `cash` or `chips`
   - original has same-casino `rating_slip_id`
   - expected result:
     - one adjustment PFT row
     - one `finance_outbox` row
     - `event_type='adjustment.recorded'`
     - `fact_class='ledger'`
     - `origin_label='actual'`
     - `aggregate_id = adjustment PFT id`
     - `table_id = original rating_slip.table_id`

2. **Rollback injection**
   - controlled failure after PFT insert and before outbox emission
   - expected result:
     - zero adjustment PFT rows
     - zero `finance_outbox` rows

3. **Unlinked adjustment**
   - `p_original_txn_id IS NULL`
   - expected result:
     - valid PFT row
     - zero outbox rows

4. **Excluded linked adjustment**
   - original transaction fails ADR-057 eligibility
   - examples:
     - `source != 'pit'`
     - `direction != 'in'`
     - tender type not `cash` or `chips`
     - `rating_slip_id IS NULL`
   - expected result:
     - valid PFT row
     - zero outbox rows

5. **Invalid inherited table anchor**
   - original has `rating_slip_id`
   - rating slip does not resolve to same-casino table
   - expected result:
     - exception
     - zero adjustment PFT rows
     - zero outbox rows

---

### 6.2 Option A Security Live Proof

Required cases:

1. **Direct authenticated insert denied**
   - authenticated user attempts direct table API insert into `finance_outbox`
   - expected result:
     - PostgreSQL permission failure
     - no row inserted

2. **Same-casino forged adjustment denied**
   - authenticated user with valid casino context attempts direct insert of `adjustment.recorded`
   - expected result:
     - denied

3. **Same-casino forged buyin denied**
   - authenticated user attempts direct insert of `buyin.recorded`
   - expected result:
     - denied

4. **Arbitrary payload forgery denied**
   - authenticated user attempts direct insert with arbitrary event type/payload
   - expected result:
     - denied

5. **Helper-backed producer succeeds**
   - same authenticated business flow calls producer RPC
   - producer calls `fn_finance_outbox_emit`
   - expected result:
     - producer succeeds when business rules are valid
     - outbox row inserted through helper only

---

### 6.3 Idempotency and Concurrency Live Proof

Required cases:

1. **Idempotent retry**
   - call `rpc_create_financial_adjustment` twice with same idempotency key
   - expected result:
     - one PFT row
     - at most one `adjustment.recorded` row

2. **Concurrent retry**
   - run two simultaneous eligible calls with same idempotency key
   - expected result:
     - one PFT row
     - at most one `finance_outbox` row
     - no duplicate `(aggregate_id, event_type)` violation escapes as an uncaught partial-write state

3. **Producer uniqueness guard**
   - verify `uq_finance_outbox_aggregate_event` exists
   - verify it protects producer duplication only
   - replay processing must not re-author rows or conflict with this constraint

---

### 6.4 Payload Contract Live Proof

Required cases:

1. **Positive adjustment**
   - `p_delta_amount > 0`
   - expected payload:
     - `amount > 0`
     - `pft_direction='in'`
     - `delta_direction='increase'`
     - `reason_code` present
     - `note` absent

2. **Negative adjustment**
   - `p_delta_amount < 0`
   - expected payload:
     - `amount < 0`
     - `pft_direction='in'`
     - `delta_direction='decrease'`
     - `reason_code` present
     - `note` absent

---

### 6.5 Exemplar Regression Smoke

Because PRD-083 adapted existing producers to route through `fn_finance_outbox_emit`, run a narrow live smoke check:

1. **Class A exemplar still emits**
   - call valid `rpc_create_financial_txn`
   - expected result:
     - valid PFT row
     - valid `buyin.recorded` outbox row

2. **Class B exemplar still emits**
   - call valid `rpc_record_grind_observation`
   - expected result:
     - valid telemetry row
     - valid `grind.observed` outbox row

This is not a full re-proof of PRD-082.

It is only a regression check that helper-backed insertion did not break previously certified producers.

---

### 6.6 Relay Compatibility Smoke

Required cases:

1. **Adjustment row can be claimed**
   - `rpc_claim_outbox_batch` returns an `adjustment.recorded` row
   - expected result:
     - row shape conforms to existing DTO
     - no DTO shape change required

2. **Adjustment row can be processed**
   - existing relay/consumer path processes the row
   - expected result:
     - `processed_at` set after commit
     - duplicate delivery returns duplicate or safe prior-commit result
     - no consumer branch introduced

3. **Failure leaves row retryable**
   - controlled consumer failure
   - expected result:
     - `processed_at IS NULL`
     - `delivery_attempts` increments
     - no DLQ, backoff, or observability expansion introduced

---

## 7. Non-Goals

This slice must not introduce:

- new PRD-scale architecture
- new projection store
- new consumer branch
- new event bus
- generic dispatcher
- envelope shape change
- new DTO fields
- relay rewrite
- retry backoff policy
- DLQ semantics
- observability dashboard
- Phase 2.2 producer work
- Phase 2.3 completeness projection
- TypeScript fallback producer path
- operator-visible UI changes

---

## 8. Suggested Artifact Form

This should be delivered as a small validation artifact, not a full PRD.

Recommended form:

```text
docs/issues/gaps/financial-data-distribution-standard/wave-2/phase-2-1-certification/
  PRODUCER-RUNTIME-CERTIFICATION-083.md
  scripts or test command references
  captured result log
```

Optional script shape:

```text
scripts/outbox-proof/phase-2-1-adjustment-certification.ts
```

The script may reuse PRD-082 proof helpers, but must not recreate PRD-082 harness infrastructure.

---

## 9. Pass / Fail Gate

Phase 2.1 may be treated as runtime-certified only when all of the following are true:

- eligible adjustment emits one `adjustment.recorded` outbox row
- ineligible adjustments remain valid PFT writes with zero outbox emission
- invalid inherited table anchor rejects the whole adjustment write
- rollback injection leaves no partial PFT/outbox state
- direct authenticated `finance_outbox` insert is denied
- helper-backed producer insertion succeeds
- idempotent retry produces no duplicate outbox row
- concurrent retry produces no duplicate outbox row
- payload contract matches FR-10
- `note` is absent from payload
- `buyin.recorded` still emits through adapted exemplar producer
- `grind.observed` still emits through adapted exemplar producer
- adjustment row is relay-compatible
- no new consumer branch, projection store, or envelope change is introduced

---

## 10. Certification Result Template

```md
# PRD-083 Producer Runtime Certification Result

**Date:** YYYY-MM-DD  
**Environment:** local Supabase / staging Supabase  
**Branch / commit:**  
**Migration state:**  

## Summary

- Adjustment I1 live proof:
- Option A security proof:
- Idempotency / concurrency proof:
- Payload contract proof:
- Exemplar regression smoke:
- Relay compatibility smoke:

## Decision

- [ ] Runtime certified
- [ ] Runtime certified with non-blocking notes
- [ ] Not certified — blocker found

## Blockers

| ID | Finding | Required fix |
|---|---|---|
|  |  |  |

## Evidence

- command:
- log path:
- relevant row ids:
- relevant event ids:
```

---

## 11. Operating Principle

After the exemplar, Wave 2 should not repeat existential transport proofs for every producer.

The new rule is:

> Each new producer receives narrow runtime certification against the frozen substrate.

That keeps validation serious without letting governance metastasize into another damn cathedral.
