After examining PHASE_6_IMPLEMENTATION_PLAN_v3.md, PHASE_6_DEVELOPER_CHECKLIST.md, and WAVE_2_EVENT_API_WORKFLOW.md, here’s a direct, technical verdict on whether your Wave 2 implementation plan has drifted into over-engineering or lost alignment with project goals.

| Dimension                           | Finding                                                                                                                                                                                   | Verdict                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Architectural Alignment**         | Wave 2 still honors the core separation: *RatingSlip emits telemetry; Loyalty mutates points.*                                                                                            | ✅ On Track                           |
| **Event Infrastructure Complexity** | The “HYBRID dispatcher” + optional `event_log` layer adds two abstractions for what is, today, an in-process call between services in the same repo.                                      | ⚠️ Over-engineered for current scale |
| **Operational Burden**              | Too many artifacts (dispatcher factory, handlers, rate-limiter, replay tests) relative to a single producer–consumer use-case. Adds cognitive load and maintenance without immediate ROI. | ⚠️ Over-engineered                   |
| **Business Flow Clarity**           | The actual value path—*close rating slip → award points → update tier*—is buried under orchestration paperwork. Developers may lose sight of the simple contract.                         | ⚠️ Needs simplification              |
| **Extensibility Readiness**         | The structure would be valuable once multiple domains (Marketing, Analytics, etc.) consume the same events. For Phase 6 scope (RatingSlip ↔ Loyalty only), it’s premature.                | ⚠️ Premature optimization            |
| **Risk / Reward**                   | Complexity raises test surface and synchronization risk while giving minimal functional benefit over a direct service call plus queued audit.                                             | ⚠️ High cost / low gain              |

**Root Cause**

Phase 6 Wave 2 imported “enterprise-grade” event-bus patterns (emit/subscribe, replay, Redis rate-limit) into a context where both producer and consumer already live in the same Next.js + Supabase runtime.
This yields paperwork for passing points.

Recommended Simplification
1. Collapse the Dispatcher Layer → Direct Service Invocation

Instead of a general event bus:

```ts
await loyaltyService.calculateAndAssignPoints(telemetry);
```
Keep a thin emitTelemetryEvent() wrapper that logs and calls Loyalty synchronously.
Later, you can replace its body with a queue publish when multiple consumers exist.

2. Defer the event_log Table

Until you have true async replay requirements, skip persistent event storage; rely on loyalty_ledger for auditability.

3. Keep Idempotency in the Ledger Only

The composite index already guarantees single application; don’t duplicate idempotency in an event store.

4. Move Rate Limiting to the Action Boundary Only

Implement it in the manualReward action (Redis optional), not at dispatcher level.

5. Document a “Future Mode”

Add one short section in docs:

When >1 consumer subscribes to telemetry events, replace direct call with queue worker (SQS/Edge Function) without changing domain APIs.

This preserves the design intent without locking you into heavy infra now.

Lean Path for Wave 2 Execution

Keep

calculateAndAssignPoints

manualReward

Idempotent ledger + RPC

Tier updates and audit logs

Simplify / Drop

Generic emitEvent / onEvent bus

Separate dispatcher factory & tests

Redis rate-limit persistence (use in-memory for now)

event_log SQL table

Outcome

40-60 % reduction in Wave 2 complexity

Still future-proof (function signature remains identical)

Direct, testable data flow:
```sql
RatingSlip → LoyaltyService.calculateAndAssignPoints() 
→ ledger + player_loyalty update → return result
```

Verdict

Yes, Wave 2 became over-engineered for the current scope.
Simplify to a direct service call + audit ledger, postpone full event-bus infrastructure until you have multiple downstream consumers.

You’ll keep architectural purity and regain delivery momentum