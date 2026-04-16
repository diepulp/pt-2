# FIB-H — Pilot-Bounded AI-Assisted Sentry Incident Oversight

## A. Feature Identity
- **Feature name:** AI-Assisted Sentry Incident Oversight
- **Feature type:** Pilot-bounded operational oversight feature
- **Bounded context:** Observability / Incident Triage / Developer Operations
- **Primary system touchpoints:** Sentry, n8n workflow, optional LangGraph orchestration, Slack/email/Jira notification targets
- **Scope authority:** This feature governs **post-capture incident oversight only**. It does **not** alter primary application runtime, error capture, or production request handling.

## B. Operator Problem
Pilot systems do not fail gracefully just because the code is “clean.” They fail messily, and the first wave of operational pain is usually not lack of logging but lack of **usable triage**.

The immediate problem is:
- errors are captured, but not consistently classified
- repeated incidents create noise faster than meaning
- alert streams become hard to interpret under pilot conditions
- developers and operators lack a concise, structured incident summary that separates signal from bullshit

The feature exists to create a **thin oversight layer** on top of Sentry so that error events become operationally legible without inserting AI into the critical path.

## C. Pilot Fit
This is pilot-manageable because it is:
- **post-event**, not inline
- **observational**, not autonomous
- **bounded to selected issue alerts**, not every event
- **human-reviewed**, not self-remediating

This feature is appropriate for pilot because it helps the team learn from production-like incidents without enlarging the runtime blast radius.

## D. Actor and Moment
### Primary actors
- developer on triage duty
- technical operator / founder
- pilot support owner

### Triggering moment
A qualifying Sentry issue alert fires for a pilot environment incident, and the system needs to decide whether to:
- notify directly
- enrich and route
- escalate for deeper AI-assisted reasoning

## E. Containment Loop
1. Application emits error / exception telemetry to Sentry.
2. Sentry captures the event and applies normal grouping / alert rules.
3. A **selected issue alert webhook** is sent to n8n.
4. n8n validates, deduplicates, enriches, and policy-checks the issue.
5. Routine incidents are routed directly to human channels.
6. Only ambiguous, repeated, or high-severity incidents are passed to LangGraph.
7. LangGraph produces a structured triage output.
8. Human receives the result and decides what action to take.
9. No autonomous production mutation is allowed in pilot.

## F. Required Outcomes
The feature must:

1. Preserve Sentry as the **source of truth** for error capture and issue state.
2. Keep n8n as the **deterministic routing and enrichment layer**.
3. Use LangGraph only as an **optional reasoning layer** for selected incidents.
4. Produce a concise structured incident summary for human review.
5. Reduce noisy alert spam by deduplication and severity policy checks.
6. Avoid introducing any new runtime dependency into the application request path.
7. Maintain tenant-safe handling of metadata and avoid leaking casino-sensitive information into downstream prompts or notifications.
8. Provide auditability of what was routed, enriched, escalated, and summarized.

## G. Explicit Exclusions
This pilot slice does **not** include:

- replacing Sentry alerting with a custom agent system
- sending every Sentry event into LangGraph
- automated code changes
- automated database changes
- automated rollback / deploy / remediation actions
- incident auto-resolution
- broad SOC/SIEM replacement ambitions
- multi-tool observability unification platform work
- deep historical incident analytics beyond immediate triage usefulness

## H. Adjacent Rejected Ideas
The following are adjacent but intentionally rejected for pilot:

- **AI in the primary error path:** bad idea; adds fragility where stability is needed
- **Full autonomous incident response:** theatrical and dangerous this early
- **Universal observability copilot:** too broad, low containment
- **Cross-system agent mesh over logs, traces, metrics, tickets, and codebase:** phase-2-at-best nonsense for current needs
- **Production self-healing loops:** unjustified risk for pilot

## I. Dependencies and Assumptions
### Dependencies
- Sentry project configured and capturing relevant app errors
- Sentry issue alert rules defined with a manageable threshold
- n8n instance available and reachable
- webhook ingestion endpoint secured
- downstream notification target available (Slack/email/Jira or equivalent)
- LangGraph service/runtime available for selective invocation
- PII/tenant-safe metadata policy defined before escalation prompts are composed

### Assumptions
- the first useful gain is triage quality, not autonomous action
- pilot incident volume is low enough for human review
- deterministic routing will solve most incidents without AI reasoning
- a structured JSON incident summary is more useful than verbose prose
- casino-sensitive context will be redacted or reduced before AI escalation

## J. Likely Next
If this pilot slice proves useful, likely next expansions are:

- issue class-specific playbooks
- incident clustering across releases
- structured ticket creation rules
- human feedback loop on triage quality
- limited retrieval against internal runbooks / ADRs / PRDs for enriched reasoning

These are **not** part of the present scope.

## K. Expansion Trigger Rule
Expansion is allowed only if all of the following are true:

1. Sentry capture and alerting are stable.
2. n8n triage flow shows useful noise reduction.
3. LangGraph summaries demonstrate repeated decision value.
4. Human operators still remain the decision authority.
5. Pilot evidence shows the workflow saves time rather than generating more ceremony.

If these are not true, expansion is blocked.

## L. Scope Authority Block
This FIB authorizes only a **pilot-bounded AI-assisted oversight layer for selected Sentry issue alerts**.

It does **not** authorize:
- runtime interception
- autonomous production actions
- broad observability platform redesign
- full agentic incident management

When ambiguity arises, default to the narrower reading:
**Sentry captures, n8n routes, LangGraph reasons only when warranted, humans decide.**
