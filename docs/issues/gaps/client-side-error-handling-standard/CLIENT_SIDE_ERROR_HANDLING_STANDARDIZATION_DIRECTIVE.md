# Client-Side Error Handling Standardization Directive

**Document type:** Governance / implementation-standard directive  
**Status:** Accepted  
**Date:** 2026-05-18  
**Applies to:** Client hooks, client components, React Query call sites, browser-side Supabase usage, toast/error UI, and any client-visible error boundary in the PT-2 / d3lt application  
**Related concern:** Production leakage of provider-originated diagnostic messages through client-side Supabase RPC failures  

---

## 1. Purpose

This directive standardizes client-side error handling so raw provider errors do not cross into user-visible UI, React error boundaries, toast messages, or client-thrown exceptions.

The immediate production issue was caused by client-side hooks calling Supabase RPCs directly from the browser. When those calls failed at the network/provider layer, the Supabase client produced diagnostic messages containing infrastructure-identifying details such as the Supabase project reference. Those messages were then re-thrown or rendered by client code.

The existing server-side sanitization stack was not broken. It simply was not in the execution path.

This directive closes that boundary gap.

---

## 2. Problem Statement

The application already contains a server-side error sanitization standard for API routes and domain error serialization. That standard protects server responses by ensuring raw implementation details are not returned through app-owned JSON boundaries.

However, client-side hooks can bypass that boundary when they call external providers directly from the browser.

In that path, the failure flow is:

1. Client hook calls Supabase directly.
2. Supabase/network failure occurs in the browser.
3. Provider-originated error message includes implementation details.
4. Client hook propagates that message.
5. React Query, React error boundaries, JSX props, or toast UI may expose the raw provider message.

This is a client-boundary failure, not a server-boundary failure.

---

## 3. Root Cause

The existing lint and sanitization rules targeted the wrong invariant.

The prior rule guarded against unsafe raw objects being placed into structured error detail fields. That protects against serialization hazards and server response leakage.

The production leak used a different shape: raw provider error strings were passed into thrown client errors or user-facing UI fields.

Therefore, the failure was invisible to the existing standard because the standard watched the `details` boundary, while the leak crossed the `message` boundary.

---

## 4. Governing Invariant

Raw provider-originated diagnostic messages must never cross a user-visible or client-thrown boundary.

Provider errors may be inspected for classification.

Provider errors may not be propagated as user-facing copy, thrown client errors, toast text, JSX content, or recoverable UI state.

The client is allowed to know enough to classify the failure. The user interface is allowed to say only what the user can safely act on.

---

## 5. Boundary Model

### 5.1 Server boundary

App-owned API routes and server handlers remain responsible for:

- private logging of full technical detail,
- request correlation,
- server-side classification,
- sanitized public error responses,
- stable error codes,
- generic user-safe messages.

The existing server-side sanitization mechanisms remain valid and should not be duplicated unnecessarily.

### 5.2 Client boundary

Client hooks and components are responsible for:

- classifying provider-originated failures,
- converting raw provider failures into client-safe application errors,
- rendering generic recovery messages,
- avoiding exposure of provider hostnames, project references, RPC names, table names, SQL details, stack traces, hints, and internal route topology.

Client-side code must not assume that browser-originated provider errors are safe because they occurred in the browser.

### 5.3 Browser network boundary

Browser developer tools may still show network requests made directly from the client. That cannot be fully hidden once browser-side provider calls exist.

This directive does not promise to conceal browser-visible request URLs from developer tools.

It requires that the application does not amplify those details into its own thrown errors, rendered UI, toast messages, or recoverable state.

---

## 6. Standardized Client Error Posture

Client code must normalize errors before propagation.

The normalized client error must carry:

- a stable application-level classification,
- a safe user-facing message,
- optional non-sensitive metadata for local handling,
- no raw provider diagnostic string.

Client-facing messages should be short, boring, and actionable.

Examples of acceptable message posture:

- “The service is temporarily unavailable. Please try again.”
- “Please sign in again.”
- “You do not have access to this resource.”
- “We could not load this section.”
- “Something went wrong. Please try again.”

Messages must not contain infrastructure-specific wording.

---

## 7. Forbidden Client Propagation Patterns

The following are forbidden in client-side hooks, components, and UI feedback paths:

- passing raw provider messages into thrown client errors,
- rendering raw provider messages in JSX,
- sending raw provider messages to toast or alert components,
- storing raw provider messages in user-visible component state,
- interpolating raw provider messages into UI strings,
- using provider details or hints as display copy,
- allowing React Query errors to carry raw provider diagnostic strings,
- relying on React error boundaries as the first sanitization layer.

This applies to provider fields commonly named:

- message,
- details,
- hint,
- description,
- stack,
- status text,
- provider error body.

The exact field name is not the invariant. The invariant is whether provider-originated diagnostic content can become visible or re-thrown.

---

## 8. Required Client Handling Pattern

Client code must follow this sequence:

1. Receive raw provider error.
2. Classify the error into an application-level category.
3. Convert it into a client-safe application error or safe error envelope.
4. Propagate only the safe application error or envelope.
5. Render only stable safe messages.
6. Preserve technical detail only in approved private diagnostics, never in user-facing UI.

The classification step may inspect raw provider content.

The propagation step must not carry raw provider content forward.

---

## 9. Direct Browser-to-Supabase Calls

Direct browser-to-Supabase calls are not automatically forbidden, but they carry a stricter obligation.

Any client hook that calls Supabase directly must own client-side sanitization locally or through a shared client error-normalization utility.

For runtime-sensitive or operationally sensitive workflows, the preferred pattern is:

- browser calls an app-owned API route,
- the server calls Supabase,
- the server returns a sanitized response,
- the client renders controlled state.

Direct browser provider calls should be treated as an exception requiring explicit boundary discipline, not as the default for operational runtime paths.

---

## 10. Error Boundary Role

React and Next.js error boundaries are last-resort containment mechanisms.

They are not the primary sanitization mechanism.

A correct client flow handles expected provider failures as recoverable UI state before they reach a global error boundary.

Error boundaries should display generic fallback UI and provide recovery actions. They should not render raw error messages.

---

## 11. Lint Enforcement Requirement

A new lint rule or equivalent static check should enforce this directive.

The rule should flag unsafe provider error propagation in client-facing files when raw error fields are used as:

- thrown error messages,
- JSX prop values,
- JSX children,
- toast or notification text,
- template-literal content,
- user-visible state values,
- React Query propagated errors,
- fallback title or description fields.

The rule should focus on boundary-crossing behavior, not only on one property name.

The existing rule that guards unsafe `details` fields remains useful, but it does not satisfy this directive by itself.

---

## 12. Review Gate

Any pull request touching client hooks, direct Supabase calls, React Query query functions, mutation functions, toast handling, or error UI must answer:

1. Can a raw provider error message reach UI?
2. Can a raw provider error message be thrown into React Query or an error boundary?
3. Can provider details, hints, hostnames, project references, RPC names, or SQL messages appear in rendered output?
4. Does the code classify the failure before propagation?
5. Does the user see a stable, safe, actionable message?

If the answer to any of the first three questions is yes, the PR is non-conformant.

---

## 13. Non-Goals

This directive does not require:

- replacing every browser-side Supabase call immediately,
- hiding all browser developer-tool network URLs,
- changing the server-side error serialization standard,
- adding a new global error framework,
- redesigning UI error components,
- expanding observability infrastructure,
- introducing external logging vendors.

This directive is about boundary discipline, not an observability platform.

---

## 14. Acceptance Criteria

This directive is satisfied when:

- client hooks no longer propagate raw provider messages,
- user-visible error UI contains only safe application messages,
- direct browser Supabase hooks normalize provider errors before throwing or returning them,
- React Query errors carry safe application-level messages,
- toast and inline error components never render provider diagnostic text,
- a lint/static guard prevents recurrence,
- server-side sanitization remains the canonical server boundary,
- client-side sanitization becomes the canonical client boundary.

---

## 15. Standard Statement

Server-side sanitization protects app-owned API responses.

Client-side normalization protects browser-originated provider failures.

Both are required.

A system standard is not complete until every boundary that can expose failure state is governed.
