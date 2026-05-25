---
title: Teardown Artifact — PRD-082 Harness Receipt Amendment
status: REQUIRED_PRE_AUTH
date: 2026-05-12
owner: Architecture + backend-service-builder
scope: PRD-082 / EXEC-082 Wave 2 Integration Proof
authority:
  - docs/21-exec-spec/EXEC-082-wave2-integration-proof.md
  - docs/issues/gaps/financial-data-distribution-standard/wave-2/w-2-integration-proof/ARCHITECTURE-REVIEW-NOTE-HARNESS-SQL.md
---

# Teardown Artifact — PRD-082 Harness Receipt Amendment

## Purpose

Define the required teardown path for the PRD-082 validation-only harness that:

- creates `outbox_integration_proof_state`
- amends `rpc_commit_consumer_receipt` to write proof-state inside the real receipt transaction

This artifact is mandatory before any Phase 2.1 authorization is issued.

## Teardown Target

The following PRD-082 harness elements must not survive into Phase 2.1 producer expansion as
standing runtime architecture:

1. The harness-only proof-state write inside `rpc_commit_consumer_receipt`
2. The `outbox_integration_proof_state` table
3. Any grants, constraints, comments, or helper logic introduced solely for PRD-082 proof execution

## Required End State Before Phase 2.1 Merge

Before any Phase 2.1 producer-expansion artifact merges:

- `rpc_commit_consumer_receipt` no longer writes `outbox_integration_proof_state`, or that code path is explicitly disabled and unreachable in all standing runtime environments
- `outbox_integration_proof_state` is removed, or retained only behind an explicit disabled-state migration that prevents reuse and runtime writes
- No application code, service layer, route, or surface depends on `outbox_integration_proof_state`
- No shared preview, shared staging, or production environment carries an active proof-state consumer side effect

## Accepted Teardown Mechanism

The default teardown mechanism is a **follow-up SQL migration** authored after proof completion and
before Phase 2.1 authorization.

That migration must do all of the following:

1. Restore `rpc_commit_consumer_receipt` to its non-harness behavior
2. Drop `outbox_integration_proof_state`, or disable it in a way that prevents runtime use
3. Remove harness-only grants if any were added
4. Preserve the non-harness semantics of `processed_messages` and receipt return values
5. Include comments explaining that the harness path was PRD-082 validation-only infrastructure

## Rejected Teardown Mechanisms

The following do **not** satisfy this artifact:

- “We will remember to remove it later”
- Leaving the proof-state write live but undocumented
- Treating `outbox_integration_proof_state` as an internal consumer substrate for future slices
- Deferring teardown definition until a later PRD or EXEC-SPEC
- Replacing teardown with a TypeScript-level ignore path while the SQL side effect still executes

## Authorization Gate

Phase 2.1 authorization is blocked unless all of the following are true:

1. PRD-082 proof execution has completed with signoff
2. This teardown artifact exists
3. A concrete teardown migration plan is named and scheduled
4. Architecture confirms the teardown path prevents the harness from becoming standing runtime architecture

## Required Follow-Up Artifact

The implementation phase must produce a concrete teardown migration artifact with a real path.

Required placeholder:

- `supabase/migrations/<timestamp>_remove_prd082_harness_receipt_proof_state.sql`

Minimum required contents of that migration:

- `CREATE OR REPLACE FUNCTION public.rpc_commit_consumer_receipt(...)` without harness proof-state write
- `DROP TABLE IF EXISTS public.outbox_integration_proof_state`
- revocation/removal of harness-only grants if applicable
- comments documenting teardown completion

## Verification Checklist

- [ ] Teardown migration path is named
- [ ] Teardown migration removes or disables the harness receipt side effect
- [ ] Teardown migration removes or disables `outbox_integration_proof_state`
- [ ] No standing runtime path reuses PRD-082 proof-state
- [ ] Architecture approves the teardown plan before Phase 2.1 authorization

## Ownership

- Authoring owner: `backend-service-builder`
- Approval owner: `Architecture`
- Merge gate owner: `Phase 2.1 authorization reviewer`
