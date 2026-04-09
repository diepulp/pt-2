# Feature Intake Brief

## A. Feature identity
- **Feature name:** Pilot-bounded Sentry Error Tracking
- **Feature ID / shorthand:** FIB-H-SENTRY-001
- **Related wedge / phase / slice:** Pilot hardening slice
- **Requester / owner:** Vladimir Ivanov
- **Date opened:** 2026-04-08
- **Priority:** P1
- **Target decision horizon:** Pilot
- **Supporting arifact:** `trees/sentry-integration/docs/issues/production-readiness/sentry-integration/FIB-S-SENTRY-001-pilot-bounded-sentry-error-tracking.json`

## B. Operator problem statement
When the application fails in production, the operator and builder lack a reliable way to see what broke, where it broke, and whether the failure is recurring. This slows triage, increases blind debugging, and creates a risk that pilot-blocking errors remain invisible until users report them manually.

## C. Pilot-fit / current-slice justification
This belongs in the current pilot hardening slice because the pilot needs minimal production error visibility to keep the core operator journey supportable. Without it, failures in server routes, rendering boundaries, and runtime execution can escape notice, making the pilot brittle and forcing reactive support through guesswork instead of actionable stack traces.

## D. Primary actor and operator moment
- **Primary actor:** Builder / operator-support owner
- **When does this happen?** During live pilot usage and during post-failure triage
- **Primary surface:** Existing application runtime and existing error boundaries
- **Trigger event:** A production exception or crash occurs and needs to be captured, grouped, and reviewed

## E. Feature Containment Loop
1. Operator uses the application during pilot operation → system runs the existing product flow normally.
2. A production exception occurs in a supported server/runtime or UI error boundary path → system captures the failure event automatically.
3. System sends the error event to the approved tracking sink with sensitive fields scrubbed or excluded → operator data is not dumped raw into the vendor payload.
4. Builder opens the tracking console for the captured event → system shows actionable stack trace, environment, release, and occurrence context.
5. Builder determines whether the event is pilot-blocking, recurring, or ignorable noise → system supports grouping and triage.
6. Builder uses the captured trace to identify the failing route, component, or server path → issue investigation becomes concrete instead of speculative.
7. Builder confirms alerting on high-signal failures through one approved route → urgent breakage is visible without building a broader notification matrix.

## F. Required outcomes
- Unhandled production errors in approved surfaces are captured automatically.
- Captured events contain enough stack and release context to support debugging.
- Sensitive casino and player data is redacted, filtered, or excluded from payloads.
- Noise is kept low enough that captured issues remain actionable during pilot.
- One alert path exists for high-signal production failures.
- The feature adds no new user-facing workflow or top-level application surface.

## G. Explicit exclusions
- Distributed tracing.
- Full observability platform design.
- Structured logging redesign.
- Product analytics or behavior telemetry.
- Session replay.
- Custom incident dashboard or new admin console.
- Multi-channel alert routing matrix.
- Broad instrumentation of every component and user action.
- Cross-property or tenant-level operational reporting.
- Vendor abstraction layer for future error tracking providers.

## H. Adjacent ideas considered and rejected
| Idea | Why it came up | Why it is out now |
|---|---|---|
| Distributed tracing | It often gets bundled with error monitoring | Too large for pilot; not required to capture actionable failures now |
| Session replay | Helpful for reproducing UI failures | Higher privacy risk and broader scope than needed for pilot hardening |
| Logging overhaul | Error tracking discussions invite broader logging cleanup | Separate concern; would expand infra scope beyond the containment loop |
| Slack/email/on-call matrix | Alerts naturally raise routing questions | Pilot only needs one approved alert path, not a full escalation design |
| Vendor-neutral abstraction | Sounds architecturally tidy | Premature; adds ceremony without solving the pilot problem |

## I. Dependencies and assumptions
- The application has deployable production environments where runtime errors can occur and be captured.
- Environment variable management exists for secure DSN provisioning.
- Existing Next.js error boundary surfaces can be used rather than inventing new UI.
- Release metadata or deployment identity can be attached during build or deploy.
- A minimal redaction policy can be defined for casino-, player-, and transaction-adjacent fields.
- One approved destination for alerts exists or can be created without broader workflow design.

## J. Out-of-scope but likely next
- Broader instrumentation coverage for additional non-fatal errors once pilot noise is understood.
- Structured logging standardization tied to infrastructure and server actions.
- Tracing or performance monitoring only if pilot evidence shows error capture alone is insufficient.

## K. Expansion trigger rule
Amend this brief if any downstream artifact proposes a new observability surface, a new end-user workflow, a second notification channel, session replay, tracing, logging redesign, or instrumentation that does not directly serve the containment loop above.

## L. Scope authority block
- **Intake version:** v0
- **Frozen for downstream design:** Yes
- **Downstream expansion allowed without amendment:** No
- **Open questions allowed to remain unresolved at scaffold stage:** Exact SDK package choice, exact alert sink, exact sourcemap upload wiring, exact PII denylist fields
- **Human approval / sign-off:** Vladimir Ivanov / 2026-04-08
