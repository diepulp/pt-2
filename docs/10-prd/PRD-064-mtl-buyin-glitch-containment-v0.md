---
id: PRD-064
title: MTL Buy-In Glitch Containment (Operator-Visible Atomicity)
owner: Lead Architect
status: Draft
affects: [ADR-024, ADR-030, ADR-040, ADR-049, ARCH-SRM-v4.11.0, PRD-063, PRD-057]
created: 2026-04-16
last_review: 2026-04-16
phase: Containment — MTL Compliance Write Path
pattern: B
http_boundary: true
slice: containment
related_incident: docs/issues/mtl-rating-slip-glitch/RATING-MTL-ISSUE.md
audit_ref: docs/issues/mtl-rating-slip-glitch/hardening-direction-audit.md
repro_ref: e2e/repro-mtl-glitch.spec.ts
---

# PRD-064 — MTL Buy-In Glitch Containment (Operator-Visible Atomicity)

> **Slice type — CONTAINMENT:** This PRD is the immediate ship-blocker fix for a production-observed compliance-write glitch. It does **not** resolve the architectural question of whether `useSaveWithBuyIn` should remain a composite client-side mutation or be collapsed to a server-side RPC — that decision is handled in a parallel ADR dispatched in the same sprint. It does **not** resolve the chips-taken / `pit_cash_observation` / MTL semantic-boundary question — also a parallel ADR. This document closes the wound. Architectural policy follows.

---

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** Yesterday a pit boss entered a $3,000 buy-in for a patron on the rating-slip modal, saw a threshold-acknowledgement toast, and dismissed the modal. The financial-transaction POST had not yet completed; dismissing the modal aborted the in-flight request; no `player_financial_transaction` row and no derived `mtl_entry` row were written; the `/compliance` surface correctly rendered nothing. The operator was led to believe a compliance-relevant write had landed when it had not. Playwright reproduction at `e2e/repro-mtl-glitch.spec.ts` confirmed this is a **race between POST latency (~1s) and operator dismissal speed**, not a transient anomaly. This PRD delivers the minimum set of changes to make the save flow atomic from the operator's perspective: confirmation UI moves to after 201, modal dismissal is blocked while the mutation is in flight, and integration tests directly exercise the `rpc_create_financial_txn` → `fn_derive_mtl_from_finance` → `mtl_entry` bridge that currently has zero direct coverage. A close-session interlock covers the same state-leak family on an adjacent operator path.

> **Scope governance:** This is the containment slice. Anything past "make the glitch impossible and prove the bridge works" is deliberately deferred — see Section 2.3.

---

## 2. Problem & Goals

### 2.1 Problem

The MTL compliance write path has correct server-side atomicity: `rpc_create_financial_txn` and the `fn_derive_mtl_from_finance` trigger commit both `player_financial_transaction` and `mtl_entry` inside a single Postgres transaction (per ADR-024 context derivation, ADR-030 write-path session-var enforcement, ADR-040 identity attribution). The flaw is **operator-side atomicity does not match**:

1. `useSaveWithBuyIn` (`hooks/rating-slip-modal/use-save-with-buyin.ts:101–106`) calls `notifyThreshold()` at step 1 of the mutation function, **before any network call**, based purely on a client-side projection of `playerDailyTotal + newBuyIn`.
2. The PATCH `/api/v1/rating-slips/:id/average-bet` returns in ~100ms.
3. The POST `/api/v1/financial-transactions` takes ~1s (RPC + trigger + derived insert).
4. The modal currently permits dismissal (Escape, X, overlay click) at any time — including inside that 1s window.
5. Dismissing aborts the in-flight POST. The server sees no transaction; no row commits; no `mtl_entry` derives. The operator has already seen a success-like toast.

Network-trace evidence (two Playwright runs, captured in `/tmp/mtl-repro.log`):

| Event | Run 1 (glitch reproduced) | Run 2 (with 8s wait) |
|---|---|---|
| Save click | 13298ms | 13352ms |
| PATCH avg-bet | 13450ms → 200 | 13460ms → 200 |
| POST fin-txn fired | 14458ms | 14422ms |
| POST response | aborted (no status) | 15384ms → 201 |
| Modal close (Escape) | 15389ms (~930ms after Save) | 22198ms |
| mtl/gaming-day-summary refetch | none | 15492ms |
| DB row written | **NO** | yes |
| /compliance renders entry | **NO** | yes |

This violates the operational invariant named in the hardening-direction audit: *the user must never receive a success-like confirmation for a write that has not durably completed.* Because the compliance side-effect is mandatory (CTR/SAR threshold surfacing), the consequences extend past UX trust into regulatory reporting integrity.

A second, adjacent failure mode exists on the close-session path: `handleCloseSession` at `components/pit-panels/pit-panels-client.tsx:347–355` does not carry `newBuyIn` into `closeWithFinancial.mutateAsync(...)`. An operator who types a buy-in and clicks **Close Session** without first clicking **Save** silently drops the buy-in and its derived `mtl_entry`. This is the same state-leak family — an invalid workflow transition that lets the operator escape a partially completed loop.

### 2.2 Goals

| Goal | Observable Signal | Traces To |
|------|-------------------|-----------|
| **G1**: Success-like UI never fires before the 201 | `notifyThreshold` is not called anywhere inside `mutationFn`; both threshold toast and success toast fire only from `onSuccess`; abort/failure produces error toast only | P0.1, INV-MTL-BRIDGE-ATOMICITY |
| **G2**: Modal cannot be dismissed while save is in flight | Escape key, close button, and overlay click are no-ops between Save click and POST response; Save button shows spinner and is disabled; no manual cancellation path is exposed during the pending interval | P0.2, audit §P0.2 deeper invariant |
| **G3**: The `rpc_create_financial_txn` → `mtl_entry` bridge has direct integration test coverage | Three integration tests pass: qualifying buy-in writes `mtl_entry`, sub-threshold buy-in also writes `mtl_entry`, context-guard violation rolls back both rows | P0.3 |
| **G4**: Operator cannot escape an unsaved buy-in via close-session | `handleCloseSession` refuses to close and surfaces a blocking prompt ("Unsaved buy-in detected. Save it before closing session.") when `newBuyIn > 0` and the buy-in has not been persisted; the only operator action is to return to the save flow | P1.4 |
| **G5**: The invariant is codified in writing | `INV-MTL-BRIDGE-ATOMICITY` added to the governance registry (or equivalent) and referenced by the financial-transactions route handler tests | Section 6 |

### 2.3 Non-Goals (Deliberately Out of Scope)

Each of these is legitimate work that does **not** belong in this containment slice. They are tracked separately and cited here only to make the boundary explicit.

- **`mtlKeys` invalidation on close-session** — read-freshness / observability concern; not write-path correctness. Next hardening pass.
- **Gaming-day default via casino-TZ API** — correct, but observability-class. Next hardening pass.
- **Realtime subscription on `mtl_entry`** — live-surface freshness; does not close the glitch. Deferred.
- **Mixed-unit test fixture cleanup for `gaming_day = 2026-04-09`** — fixture hygiene. Deferred.
- **Test-id (`data-testid`) restoration on the pit-panels surface** — test-harness hygiene. Deferred; separate QA ticket.
- **Chips-taken / `pit_cash_observation` / MTL semantic boundary** — bounded-context contract question (audit §H). Separate ADR, dispatched in parallel.
- **Composite-mutation architectural decision for `useSaveWithBuyIn`** — whether to collapse to a server-side RPC, split the UI, or retain the hybrid. Separate ADR, dispatched in parallel.
- **Removing the silent `modalData` guard in `handleSave`** — real defect, belongs to the next hardening pass per the audit. Not required to close this glitch.
- **Expanding threshold-message content or CTR workflow UX** — product direction, not containment.

If in doubt, the rule is: *does this item close the P0.1–P0.3 / P1.4 failure mode directly?* If no, it is out of scope for this PRD.

---

## 3. Users & Use Cases

- **Primary users:** Pit boss, floor supervisor (the operators who enter buy-ins on the rating-slip modal and close sessions on the pit-panels surface).
- **Secondary users:** Compliance officer (downstream reader of `/compliance`; depends on MTL entries being present when the operator believes they are).

**Top Jobs:**

- As a **pit boss**, when I enter a buy-in and click Save, I need to be certain that a green confirmation means the transaction actually committed — not that it is probably committing. *(G1, G2)*
- As a **pit boss**, if the save fails or is interrupted, I need explicit feedback that nothing was recorded, so I know to retry. *(G1, G2)*
- As a **pit boss**, when I close a session with a pending buy-in still in the form, I need the system to refuse silent data loss. *(G4)*
- As a **compliance officer**, I need assurance that every qualifying pit buy-in the operator sees a success toast for is present in the MTL ledger. *(G1, G3, G5)*

---

## 4. Scope & Feature List

### 4.1 In Scope

**P0.1 — Defer confirmation UI until after POST success**
- Remove the `notifyThreshold()` call from `mutationFn` step 1 in `hooks/rating-slip-modal/use-save-with-buyin.ts`.
- Thread the threshold projection through to the `onSuccess` callback.
- Fire both the threshold toast and the success toast only after the POST resolves 201.
- All supported branches of the save flow must withhold success-like UI until the POST resolves 2xx.

**P0.2 — Commit-barrier UX on rating-slip modal**
- Block Escape key, close button (X), and overlay click while `useSaveWithBuyIn` mutation is `isPending`.
- Save button displays a spinner and is disabled during pending state.
- No manual cancellation path is exposed during the pending interval in this containment slice.
- The deeper invariant (audit §P0.2): *once the operator initiates save, the workflow cannot transition into a dismissible or cancellable UI state until the save succeeds or fails.*

**P0.3 — Bridge integration tests (`rpc_create_financial_txn` → `fn_derive_mtl_from_finance` → `mtl_entry`)**
- Three minimum cases:
  - **(a) Qualifying buy-in writes `mtl_entry`** — row present with `idempotency_key LIKE 'fin:%'`.
  - **(b) Sub-threshold buy-in still writes `mtl_entry`** — the trigger/bridge is ungated; threshold gating is read-time at `services/mtl/crud.ts:444–450`, not write-time. Test must assert the row exists for a sub-threshold amount.
  - **(c) G1–G3 context-guard violation rolls back the whole transaction** — MISSING_CONTEXT, tenant mismatch (ADR-024 INV-2), and actor mismatch (ADR-024 INV-1 / ADR-040) each produce **zero `player_financial_transaction` rows AND zero `mtl_entry` rows**, confirming atomicity under guard failure.
- Closes the test-coverage hole the Phase-1 investigation named: *no test currently exercises the bridge directly.*

**P1.4 — Unsaved-buy-in interlock on `handleCloseSession`**
- In `components/pit-panels/pit-panels-client.tsx:347–355`, when `Number(formState.newBuyIn) > 0` and the buy-in has not been persisted, `handleCloseSession` must refuse to close the session and surface a blocking prompt: *"Unsaved buy-in detected. Save it before closing session."*
- The only operator action is to return to the save flow. No silent discard path exists in this slice.
- No silent drop of `newBuyIn` under any close-session path.

### 4.2 Out of Scope

See Section 2.3. Most notably: the architectural composite-mutation decision and the chips-taken semantic-boundary decision are parallel ADRs and do **not** block this containment slice.

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1**: The mutation function of `useSaveWithBuyIn` must perform no user-visible side effects (toasts, notifications, telemetry marked "success") before the financial-transactions POST resolves 2xx.
- **FR-2**: While the `useSaveWithBuyIn` mutation is pending, the rating-slip modal must not be dismissible by Escape, close button, or overlay click.
- **FR-3**: While the `useSaveWithBuyIn` mutation is pending, no explicit cancellation control is exposed in the UI. The save remains in progress until success or failure.
- **FR-4**: If the POST returns non-2xx or fails for any reason, the user must see an error-class toast and no success-class toast. The modal then returns to normal so the operator may retry or correct input.
- **FR-5**: Integration tests must directly invoke `rpc_create_financial_txn` (or its HTTP route) and assert the presence/absence of both `player_financial_transaction` and `mtl_entry` rows in the three cases listed in P0.3.
- **FR-6**: `handleCloseSession` on the pit-panels surface must not silently discard a pending buy-in. When `newBuyIn > 0` and unpersisted, it must refuse to close the session and surface the blocking prompt "Unsaved buy-in detected. Save it before closing session." The only operator action is to return to the save flow.

### 5.2 Non-Functional Requirements

- **NFR-1**: The commit barrier must not add perceptible latency beyond the existing POST round-trip (no artificial delay).
- **NFR-2**: The bridge integration tests must run in the existing Jest integration suite with the `RUN_INTEGRATION_TESTS` gate, within the current suite time budget.
- **NFR-3**: No additional spinners, progress indicators, or modals may be introduced on the happy path beyond what is necessary to satisfy FR-2 and FR-3.
- **NFR-4**: Changes must not regress ADR-024 authoritative context derivation, ADR-030 write-path session-var enforcement, or ADR-040 identity attribution. The bridge tests serve as the regression guard.

### 5.3 Referenced Standards and Contracts

- Schema: `types/database.types.ts` (`player_financial_transaction`, `mtl_entry`).
- Context derivation: ADR-024 (`set_rls_context_from_staff`).
- Write-path invariants: ADR-030 (session-var enforcement), ADR-040 (identity provenance).
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` v4.11.0 — `mtl` and `player_financial_transaction` ownership.
- Over-engineering guardrail: `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` (this PRD is a containment slice; we do **not** introduce an abstraction that anticipates the parallel-ADR outcome).

---

## 6. Invariant to Codify

### INV-MTL-BRIDGE-ATOMICITY

> **A qualifying pit buy-in succeeds if and only if a `player_financial_transaction` row AND its derived `mtl_entry` row both commit in the same Postgres transaction.**
>
> This containment slice codifies and test-backs the required route behavior for `POST /api/v1/financial-transactions`: a 201 response is treated as asserting that both rows landed; any non-2xx response is treated as asserting that neither landed.
>
> Corollary (operator-visible atomicity): client code **MUST NOT** present success-like UI before the 2xx response, and the UI must not transition into a dismissible state during the in-flight save interval.

This invariant governs the rating-slip modal save flow, the pit-panels close-session flow, and any future surface that writes financial transactions.

---

## 7. UX / Flow Overview

**Happy path (buy-in save):**
1. Pit boss enters buy-in → clicks **Save Changes**.
2. Modal enters "saving" state: Save button shows spinner and is disabled; Escape/X/overlay are inert.
3. PATCH avg-bet fires, then POST fin-txn fires.
4. On POST 201: threshold toast (if applicable) + success toast fire; modal returns to normal.
5. Navigating to `/compliance` shows the new entry.

**Error path (POST fails):**
1. Modal receives non-2xx or request failure.
2. Error toast only. No success-like signal.
3. Modal returns to normal; user may retry or fix input.

**Close-session path (P1.4):**
1. Pit boss has typed a buy-in but not saved. Clicks **Close Session**.
2. System detects `newBuyIn > 0` and unpersisted.
3. Blocking prompt appears: *"Unsaved buy-in detected. Save it before closing session."*
4. Operator is returned to the save flow. No silent drop and no discard branch exist in this containment slice.

---

## 8. Dependencies & Risks

### 8.1 Dependencies

- No migrations required. Server-side behaviour of `rpc_create_financial_txn` and `fn_derive_mtl_from_finance` is unchanged.
- Parallel ADR (composite-mutation architecture) and parallel ADR (chips-taken semantic boundary) are **not** blockers for this PRD. This PRD intentionally does not pre-empt either decision.
- Existing test infrastructure: `RUN_INTEGRATION_TESTS` gate, Playwright harness for the repro.

### 8.2 Risks

- **R-1 (Low):** Blocking modal dismissal may frustrate operators who habitually Escape. Mitigation: pending state is short (~1s) and the behavior is consistent — once save begins, the system finishes the attempt before returning control.
- **R-2 (Low):** The `onSuccess`-only toast pattern could regress for threshold notifications if the projection is not carried forward. Mitigation: explicit unit test for the threshold-post-success path.
- **R-3 (Medium):** The sub-threshold bridge test (P0.3 case b) asserts behaviour that some engineers may read as a bug (writing `mtl_entry` for sub-threshold amounts). The test must be accompanied by a comment pointing to `services/mtl/crud.ts:444–450` and noting that threshold gating is read-time, not write-time. This is the bridge contract; changing it is a separate ADR.
- **R-4 (Low):** Without the parallel architectural ADR, this PRD patches the *observable symptom*. If the architectural ADR later collapses `useSaveWithBuyIn` into a single server-side RPC, the commit barrier may be simplified but remains correct. This is acceptable containment behaviour.

---

## 9. Definition of Done (DoD)

Binary checkboxes. The glitch is considered **closed** when every one of these is true.

**Functionality (core glitch closure)**
- [ ] `notifyThreshold()` is not called anywhere inside the `mutationFn` of `useSaveWithBuyIn`. Verified by grep and by unit test asserting order of side-effects.
- [ ] Both threshold toast and success toast fire exclusively from the success path, guarded by a 2xx response.
- [ ] Rating-slip modal cannot be dismissed (Escape, X, overlay) while `useSaveWithBuyIn` is `isPending`.
- [ ] Save button shows spinner and is disabled during pending state.
- [ ] No explicit cancellation control is exposed during the in-flight save interval in this containment slice.
- [ ] If POST fails for any reason, no success-class toast appears.

**Data & Integrity**
- [ ] A Playwright test simulating rapid operator dismissal input confirms dismissal is impossible while the save is pending.
- [ ] All supported save, failure, and interruption branches in the rating-slip modal flow are covered by tests and preserve the confirmation invariant.

**Testing**
- [ ] Integration test (a): qualifying buy-in → `player_financial_transaction` row present → `mtl_entry` row present with `idempotency_key LIKE 'fin:%'`. Passes.
- [ ] Integration test (b): sub-threshold buy-in (below watchlist floor) → `player_financial_transaction` row present → `mtl_entry` row present. Passes. Accompanying comment cites `services/mtl/crud.ts:444–450`.
- [ ] Integration test (c): context-guard violation (MISSING_CONTEXT or tenant mismatch or actor mismatch per ADR-024 G1–G3) → zero `player_financial_transaction` rows AND zero `mtl_entry` rows. Passes for each of the three guard cases.
- [ ] Existing E2E `e2e/repro-mtl-glitch.spec.ts` becomes impossible to reproduce: dismissal attempts during the pending save interval are inert and the confirmation invariant holds across all supported branches.

**Operational Readiness**
- [ ] Rollback path: each change is behind a small, self-contained diff (hook refactor, modal dismissal guard, close-session guard). Each can be reverted independently without touching the other two.
- [ ] No database migrations; no RPC signature changes; no RLS policy changes. Confirmed.

**Close-session hardening (P1.4)**
- [ ] `handleCloseSession` in `components/pit-panels/pit-panels-client.tsx` cannot silently drop a pending `newBuyIn > 0`.
- [ ] A blocking prompt appears for the unsaved-buy-in case and returns the operator to the save flow.
- [ ] Test (unit or E2E) covers the close-session-with-pending-buy-in path.

**Documentation & Governance**
- [ ] `INV-MTL-BRIDGE-ATOMICITY` is added to the invariant registry (or cross-linked equivalent) and referenced from the financial-transactions route handler tests.
- [ ] This PRD is linked from `docs/issues/mtl-rating-slip-glitch/` index.
- [ ] Parallel ADRs (composite-mutation architecture; chips-taken semantic boundary) are cited as "related, non-blocking" — not as dependencies.

**Explicit non-DoD (for the record)**
- [ ] `mtlKeys` invalidation, gaming-day default fix, realtime subscription, fixture cleanup, testid restoration, silent `modalData` guard removal, and the two parallel ADRs are **not** prerequisites for closing this glitch. Each has its own artifact.

---

## 10. Related Documents

### 10.1 Incident and Investigation
- `docs/issues/mtl-rating-slip-glitch/RATING-MTL-ISSUE.md` — Phase 1 root-cause analysis (operator report + initial triage).
- `docs/issues/mtl-rating-slip-glitch/hardening-direction-audit.md` — Audit of the first proposal; classifies P0.1–P0.3 and P1.4 as the real containment slice and the rest as adjacent work.
- `docs/issues/mtl-rating-slip-glitch/arch-flaw.md` — Architectural reasoning, inputs to the parallel ADR.
- `docs/issues/mtl-rating-slip-glitch/PROPOSED-FIXES.md` — Source proposal audited by hardening-direction-audit.
- `docs/issues/mtl-rating-slip-glitch/7-findings.md` — Phase 1 agent findings.
- `e2e/repro-mtl-glitch.spec.ts` — Playwright headless reproduction; confirms race is not transient.

### 10.2 Architectural Decisions
- [ADR-049](../80-adrs/ADR-049-operator-action-atomicity-boundary.md) — Operator-action atomicity boundary (composite client mutation vs server-side RPC). **Parallel ADR, not a blocker for this containment slice.** PRD-064 applies a containment patch to the current hybrid implementation without deciding the long-term architectural direction. ADR-049 remains the decision record for the long-term boundary choice.
- ADR-024 — Authoritative context derivation (G1 MISSING_CONTEXT, G2 tenant mismatch, G3 actor mismatch). Bridge tests assert each guard path.
- ADR-030 — Auth pipeline hardening, write-path session-var enforcement. Containment must not regress.
- ADR-040 — Identity Provenance Rule (Category A/B attribution); amends ADR-024 INV-8. Containment must not regress.

### 10.3 Surfaces and Services
- SRM v4.11.0 — `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — `mtl` bounded context, `player_financial_transaction` ownership.
- `services/mtl/crud.ts:444–450` — threshold gating is read-time; bridge is ungated at write-time (sub-threshold case b rationale).
- `hooks/rating-slip-modal/use-save-with-buyin.ts:101–106` — `notifyThreshold()` call site to be relocated.
- `components/pit-panels/pit-panels-client.tsx:347–355` — `handleCloseSession` dropping `newBuyIn`.

### 10.4 Governance
- `docs/10-prd/PRD-STD-001_PRD_STANDARD.md` — PRD shape this document conforms to.
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` — explicitly invoked to justify the narrow slice.

### 10.5 SDLC Taxonomy Cross-References

| Taxonomy Category | Where Read | Purpose |
|---|---|---|
| **V&S** — Vision / Strategy | `docs/00-vision/` (compliance posture threads) | Why this glitch is ship-blocking (compliance integrity, not just UX). |
| **ARCH** — Architecture | `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`, ADR-024/030/040 | Invariants the bridge relies on. |
| **API/DATA** | `types/database.types.ts`, `POST /api/v1/financial-transactions` route | HTTP contract codified by INV-MTL-BRIDGE-ATOMICITY. |
| **SEC/RBAC** | ADR-024/030 guard set | Bridge test (c) exercises these directly. |
| **DEL/QA** | `docs/40-quality/` (E2E + integration gates) | P0.3 tests live here; repro E2E already lives at `e2e/repro-mtl-glitch.spec.ts`. |
| **OPS/SRE** | — | No new runbooks required; rollback is per-diff. |
| **GOV** | `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` | Justifies the narrow slice. |

### 10.6 Related, Non-Blocking Artifacts (Parallel Track)
- Parallel ADR (pending) — Composite-mutation architecture for `useSaveWithBuyIn` (collapse to server-side RPC vs split vs retain hybrid). Cited; not a dependency of this PRD.
- Parallel ADR (pending) — Chips-taken / `pit_cash_observation` / MTL semantic boundary. Cited; not a dependency of this PRD.

---

## 11. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-04-16 | Lead Architect | Initial draft — containment slice for the MTL buy-in glitch. P0.1, P0.2, P0.3, P1.4 in scope. Parallel ADRs cited as non-blocking. INV-MTL-BRIDGE-ATOMICITY codified. |
| v0 (amended) | 2026-04-16 | Lead Architect | Audit amendment folded in. Removed explicit "Cancel save" affordance from containment slice (modal is non-dismissible until success/failure; no manual cancellation path exposed). Removed wording that pre-decided ADR-049's architectural direction ("ships Option 3"). Tightened HTTP-contract language to codify route behavior this slice test-backs. Made close-session interlock deterministic (single blocking prompt; no alternative save-first routing). Replaced absolute DoD claims with scoped, testable language. Added ADR-049 to `affects`. Blocks A–H applied; Patch Summary items 1–5 swept across goals, scope, FRs, invariant, flows, risks, DoD, and §10.2 cross-reference. |
