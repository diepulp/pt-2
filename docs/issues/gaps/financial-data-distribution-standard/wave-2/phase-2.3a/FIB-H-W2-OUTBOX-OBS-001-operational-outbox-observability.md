# Feature Intake Brief

## A. Feature identity

- **Feature name:** Operational Outbox Observability
- **Feature ID / shorthand:** FIB-H-W2-OUTBOX-OBS-001
- **Related wedge / phase / slice:** Wave 2, Phase 2.3a — post Phase 2.2 producer rollout
- **Requester / owner:** Vladimir Ivanov / d3lt
- **Date opened:** 2026-05-19
- **Priority:** P1
- **Target decision horizon:** Pilot / pre-field-confidence validation

---

## B. Operator problem statement

The product owner and technical operator need a small internal way to confirm that transactional outbox events are flowing, processing, and failing visibly during real application workflows, instead of relying only on governance artifacts, migration proofs, and test harness confirmations.

---

## C. Pilot-fit / current-slice justification

This belongs immediately after Wave 2 Phase 2.2 because the producer paths will be rolled out and certified, but the runtime still lacks field-visible proof that events are moving through the relay correctly. Without this slice, the system can be architecturally proven yet operationally opaque: fills, credits, adjustments, buy-ins, cash-outs, and grind observations may emit correctly in tests, but developers and admins cannot quickly see stuck events, retry pressure, poison rows, or semantic label propagation in a live pilot environment.

---

## D. Primary actor and operator moment

- **Primary actor:** product owner / technical admin
- **When does this happen?** During pilot validation, demo runtime review, post-deployment smoke checks, and investigation of stale dashboard data
- **Primary surface:** internal admin/dev observability surface; may be embedded in an existing admin/oversight area
- **Trigger event:** A real workflow emits financial outbox events, a dashboard appears stale, relay processing is suspected, or a post-deploy validation requires runtime proof

---

## E. Feature Containment Loop

1. **Technical admin** opens the internal observability surface → system shows relay health summary: pending rows, oldest pending age, processed count, retry count, and last processed time.
2. **Technical admin** reviews the pending/failing queue → system shows stuck or repeatedly retried events with event type, aggregate id, table id, delivery attempts, last error, and created/processed timestamps.
3. **Technical admin** searches by `event_id`, `aggregate_id`, or `table_id` → system shows the event envelope, semantic labels, payload, processing status, and related consumer receipt when present.
4. **Technical admin** performs a real workflow action such as buy-in, adjustment, fill, credit, or grind observation → system shows the corresponding authored outbox event without requiring database console inspection.
5. **Technical admin** checks semantic propagation → system displays `event_type`, `fact_class`, `origin_label`, `table_id`, `player_id`, and `aggregate_id` exactly as authored, without inferred upgrades or synthetic reconstruction.
6. **Technical admin** checks relay liveness → system shows whether pending events are being claimed and processed, or whether retry/poison behavior is accumulating.
7. **Technical admin** records field validation outcome → system provides enough evidence to confirm “outbox is healthy,” “relay is stalled,” or “specific event failed and needs investigation.”

---

## F. Required outcomes

- A technical admin can determine whether the outbox relay is alive, stalled, or accumulating retry pressure.
- A technical admin can inspect an individual authored event and verify its semantic envelope without using raw SQL.
- Stuck or failing events are visible with enough context to support diagnosis.
- Phase 2.2 producer rollout can be field-validated through real workflow actions, not only tests.
- The surface does not create, mutate, replay, repair, or synthesize outbox events.
- The surface preserves the distinction between authored events and projections.
- The implementation remains internal/admin-only and pilot-bounded.

---

## G. Explicit exclusions

- No external event bus.
- No Kafka, CDC, WAL streaming, Debezium, or multi-consumer fan-out.
- No event sourcing console.
- No manual replay button.
- No dead-letter queue implementation in this slice.
- No projection rebuild workflow.
- No operator-facing casino floor dashboard changes.
- No public API contract for outbox events.
- No cross-property observability product.
- No automatic repair, reconciliation, or mutation of `finance_outbox`.
- No synthetic reconstruction of `fill.recorded`, `credit.recorded`, or any other event from projections or inferred state.
- No analytics platform, charts package, or generalized telemetry framework unless already available.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Dead-letter queue | Poison rows and repeated failures need visibility | This slice observes and reports poison candidates only; routing/dead-letter handling belongs in a later reliability slice |
| Manual replay button | Replay is useful for proving projection determinism | Manual replay can mutate state and expands operational authority; this slice is read-only |
| Full event admin console | Event inspection is useful during debugging | A general console would become platform work; this slice only supports minimal pilot validation |
| Projection drift repair | Stale dashboards may reveal projection issues | Repair/reconciliation is a separate consumer/projection concern |
| External monitoring integration | Alerts may eventually need email/Slack/log aggregation | Pilot validation first; no external channel integration in this slice |
| Business-facing dashboard proof | Stakeholders may want visual proof of correctness | This slice is internal; business/operator-facing proof can be derived later once runtime truth is visible |

---

## I. Dependencies and assumptions

- Wave 2 Phase 2.0 transport substrate exists: `finance_outbox`, relay path, `processed_messages`, claim/commit RPCs, and UUIDv7 ordering.
- Wave 2 Phase 2.1 adjustment producer is certified.
- Wave 2 Phase 2.2 fill/credit producer rollout is complete or near completion.
- Relay writes enough delivery state to expose pending, processed, retry, and last-error status.
- The observability surface can be scoped to internal/admin access only.
- This slice reads from existing outbox/receipt data and does not require a new authoring model.
- If existing relay status fields are insufficient, only minimal read-supporting fields or views may be proposed downstream; mutation semantics are out of scope.

---

## J. Out-of-scope but likely next

- Bounded retry / dead-letter handling for poison events.
- Projection drift sampling after Phase 2.3 and Phase 2.4 consumers exist.
- Minimal field certification checklist tying real workflow actions to observed outbox events.

---

## K. Expansion trigger rule

Amend this brief if any downstream artifact proposes:

- a write action against `finance_outbox`;
- a replay, repair, retry, or dead-letter mutation workflow;
- an external notification channel;
- a public event API;
- a new operator-facing casino workflow surface;
- a generalized observability platform;
- projection drift repair or reconciliation;
- new event semantics not already authored by governed producer RPCs.

Feature-specific rule: this slice may expose only authored event state and relay/receipt status. Any attempt to infer, synthesize, upgrade, or repair financial facts requires a new intake.

---

## L. Scope authority block

- **Intake version:** v0
- **Frozen for downstream design:** Yes
- **Downstream expansion allowed without amendment:** No
- **Open questions allowed to remain unresolved at scaffold stage:**
  - Exact placement of the internal surface: existing admin/oversight route vs temporary internal dev route.
  - Whether implementation should use a read-only SQL view or direct service query.
  - Whether poison-row visibility is represented as a label/query or a derived read-only status.
- **Human approval / sign-off:** Vladimir Ivanov / 2026-05-19
