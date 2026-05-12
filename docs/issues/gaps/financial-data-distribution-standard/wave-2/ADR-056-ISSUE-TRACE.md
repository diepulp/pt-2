 Class A table-anchor ambiguity blocks ADR-056 relay readiness.

  Trace:

  1. ADR-056 assumes outbox mechanics are already frozen
     docs/80-adrs/ADR-056-relay-worker-execution-environment.md:26 says schema, insertion strategy, delivery semantics, consumer idempotency, and I1-I4 are frozen elsewhere; ADR-056 only chooses where the relay
     runs.
  2. ADR-056 relay depends on table-scoped outbox rows
     The relay polls finance_outbox WHERE processed_at IS NULL, delivers to consumers, and records processed_at at docs/80-adrs/ADR-056-relay-worker-execution-environment.md:22. Its replay invariant says
     projections rebuild from finance_outbox history at docs/80-adrs/ADR-056-relay-worker-execution-environment.md:111.
  3. PRD-081 makes the contradiction visible
     PRD-081 says every Class A, Class B, and Dependency Event authoring write is atomic with outbox emission at docs/10-prd/PRD-081-transactional-outbox-gap-f1-closure-v0.md:65, but also says non-table-scoped
     Class A propagation is out of scope at docs/10-prd/PRD-081-transactional-outbox-gap-f1-closure-v0.md:89.
  4. The producer paths cannot satisfy universal emission
     ADR-057 documents that rpc_create_financial_txn has optional p_rating_slip_id, and rpc_create_financial_adjustment only inherits rating_slip_id from a linked original at docs/80-adrs/ADR-057-class-a-table-
     anchoring-idempotency-clarification.md:49. Cage cashouts, cage markers, and unlinked adjustments can be valid PFT rows without a table anchor.
  5. Failure mode if unresolved
     ADR-056’s I1 atomicity would force one of three bad outcomes:
      - reject valid PFT writes because no finance_outbox.table_id exists
      - fabricate a table_id, corrupting replay topology
      - make finance_outbox.table_id nullable, breaking (table_id, event_id) replay semantics
  6. ADR-057 is the resolution layer
     ADR-057 keeps finance_outbox.table_id NOT NULL and declares that Wave 2 Class A emission requires eligible semantics plus same-casino rating slip anchoring at docs/80-adrs/ADR-057-class-a-table-anchoring-
     idempotency-clarification.md:130. Valid unanchored Class A rows are authored normally but emit no Wave 2 outbox row.
  7. What remains pending
     ADR-057 must synchronize downstream docs so ADR-056’s relay is built against the narrowed contract, not the older universal-emission wording. The highest-risk drift is PRD/RFC language that still implies
     cashouts emit in Wave 2 while ADR-057 excludes non-table-scoped cashouts.
