---
title: Architecture Review Note — PRD-082 Harness SQL Boundary
status: ACCEPTED_WITH_CONDITIONS
date: 2026-05-12
owner: Architecture Review
scope: PRD-082 / EXEC-082 Wave 2 Integration Proof
---

# Architecture Review Note — PRD-082 Harness SQL Boundary

## Decision Under Review

Should PRD-082 / EXEC-082 be allowed to amend `rpc_commit_consumer_receipt` with a
harness-only SQL side effect that writes `outbox_integration_proof_state` in the same
transaction as `processed_messages`?

This note evaluates whether that approach is acceptable architecture for the Wave 2
integration proof gate.

## Why This Decision Exists

PRD-081 shipped the transactional outbox exemplar structurally. The current consumer
boundary is intentionally minimal:

- `rpc_commit_consumer_receipt` inserts into `processed_messages`
- Wave 2 consumer side effect is currently a no-op placeholder
- The relay route marks `finance_outbox.processed_at` after a successful or duplicate receipt

EXEC-082 needs to prove:

- I3 Idempotency
- I4 Replayability

The original proof design was unsound because it allowed proof-state evidence to be
written outside the actual SQL receipt boundary. That would create false proof:
TypeScript could appear correct while the real consumer atomicity boundary remained
untested.

The harness-SQL proposal fixes that by moving proof-state evidence into the same
transaction as `processed_messages`.

## What The Harness SQL Actually Is

This is not just a “test table migration.”

The proposed harness migration entails:

1. Create `outbox_integration_proof_state`
2. Add uniqueness/guardrails for one logical proof-state row per `event_id`
3. Amend `rpc_commit_consumer_receipt` so the harness proof-state row is written in the
   same PostgreSQL transaction as `processed_messages`
4. Allow proof scripts to read and truncate proof-state in disposable local environments

That means the harness changes the real transport write path, even though the change is
declared validation-only.

## Architectural Merits

The harness-SQL approach has three strong properties:

- It proves the real atomic boundary rather than a simulated one.
- It keeps the evidence write in SQL, where the receipt transaction already lives.
- It avoids introducing a TypeScript “shadow consumer” that would be architecturally
  weaker than the production path.

If the goal is to prove I3/I4 against the actual transport contract, this is the smallest
technically coherent path.

## Architectural Risks

The concerns are not about correctness of the proof idea. They are about containment.

### 1. Temporary harness can become permanent architecture

Once `rpc_commit_consumer_receipt` gains a side effect, the line between “validation-only”
and “first internal consumer” becomes thin. If the harness is left in place, the proof
table effectively becomes a standing consumer artifact.

### 2. Harness proof-state resembles a projection

Even if the team avoids calling it a projection, the behavior is projection-like:

- durable consumer-side writes
- one row per consumed event
- replay comparison against persisted state

That is acceptable only if the artifact is explicitly ephemeral and forbidden from reuse.

### 3. Governance drift risk

If later contributors see a consumer-side proof-state table already present, they may treat
it as precedent for adding more consumer logic without the ADR or PRD discipline required
for a real projection slice.

### 4. Environment misuse risk

The proof flow truncates `processed_messages` and proof-state. That is safe only in a
disposable local environment. Any leakage of this workflow into shared preview/staging
would be operationally unsafe.

## Alternatives Considered

### Option A — Accept harness SQL with strict containment

Description:

- keep the harness SQL amendment
- keep proof-state writes inside `rpc_commit_consumer_receipt`
- enforce local-only execution
- require explicit teardown before Phase 2.1 merges

Pros:

- technically honest proof
- smallest change that closes the false-proof gap
- no TypeScript shadow consumer

Cons:

- temporary mutation of the real receipt boundary
- requires discipline to remove or disable later

### Option B — Reject harness SQL and redesign the proof

Description:

- do not modify `rpc_commit_consumer_receipt`
- prove only what the current no-op consumer can actually prove
- defer full I3/I4 stateful proof until a real projection consumer exists

Pros:

- zero mutation of transport SQL
- no risk of harness artifact ossifying

Cons:

- weaker proof
- does not actually validate consumer-side-effect atomicity
- likely pushes the unresolved risk into Phase 2.1

### Option C — Create a separate harness-only consumer RPC

Description:

- preserve `rpc_commit_consumer_receipt`
- add a parallel harness consumer RPC for proof runs only

Pros:

- avoids mutating the standing receipt function

Cons:

- proves a different code path than production
- reintroduces the same false-proof problem in another form
- more moving parts than Option A with less truthfulness

This option should be rejected.

## Recommendation

**Recommend Option A: accept the harness SQL amendment with strict containment gates.**

Reason:

It is the only option that preserves proof truthfulness without inventing a separate
shadow path. The architectural problem is not the SQL-side harness itself. The problem is
whether the team contains it aggressively enough that it cannot drift into permanent
runtime architecture.

## Required Conditions For Acceptance

Approval should be conditional on all of the following:

1. `EXEC-082` must classify the slice honestly as a harness SQL write-path change.
2. Proof-state writes must remain inside the real `rpc_commit_consumer_receipt` transaction.
3. The harness may run only in disposable local environments.
4. Shared preview, shared staging, and production are forbidden targets for any proof flow
   that truncates `processed_messages` or proof-state.
5. An explicit teardown artifact is required now, before any Phase 2.1 authorization is issued.
6. `outbox_integration_proof_state` must be explicitly forbidden from application reuse outside PRD-082.
7. Preview drift remains advisory only for this slice.
8. Signoff must fail if blocking drift classes are recorded.
9. The migration must be commented as validation-only infrastructure and include rollback/disable notes.

If any of these conditions are weakened, the architecture should reject the harness-SQL
approach and revert to a narrower, explicitly less-complete proof scope.

## Questions For Review

1. Do we accept a validation-only mutation of `rpc_commit_consumer_receipt` as the least-bad
   truthful proof mechanism?
2. What is the exact teardown artifact: separate disable migration, revert migration, or
   follow-on EXEC-SPEC deliverable that must be authored before Phase 2.1 authorization?
3. Should preview drift remain advisory, or does architecture want a later amendment to
   make preview execution part of the blocking gate?
4. Does the team want an ADR addendum documenting why this harness is not a projection
   precedent?

## Review Outcome

- Decision: `Accept with conditions`
- Accepted option: `Option A`
- Conditions:
- Keep proof-state writes inside the real `rpc_commit_consumer_receipt` transaction.
- Restrict execution to disposable local environments only.
- Require an explicit teardown artifact now, before any Phase 2.1 authorization.
- Forbid `outbox_integration_proof_state` reuse outside PRD-082.
- Keep preview drift advisory for this slice.
- Require migration comments to classify the harness as validation-only infrastructure.
- Follow-up owner: `Architecture + backend-service-builder`
- Follow-up artifact: `teardown/disable artifact for harness receipt amendment and proof-state table`
- Deadline before Phase 2.1: `required before authorization`

## Review Outcome Template

- Decision: `Accept` / `Accept with conditions` / `Reject`
- Conditions:
- Follow-up owner:
- Follow-up artifact:
- Deadline before Phase 2.1:
