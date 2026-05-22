---
id: ADR-049
title: Operator-Action Atomicity Boundary — Composite Client Mutation vs Single Server-Side Contract
status: Proposed
date: 2026-04-16
owner: RatingSlipService / PlayerFinancialService / MTLService
deciders: Lead Architect, Platform, Compliance
amends: none
supersedes: none
related: ADR-015, ADR-018, ADR-020, ADR-024, ADR-025, ADR-030, ADR-040, ADR-031
triggered_by: docs/issues/mtl-rating-slip-glitch/ (production-observed buy-in → MTL dashboard glitch, 2026-04-15)
---

# ADR-049: Operator-Action Atomicity Boundary — Composite Client Mutation vs Single Server-Side Contract

## Status

**Proposed** — Decision-only ADR. Scope is the durable architectural question exposed by a production glitch; the immediate ship-blocker fixes are contained in a parallel containment PRD (see _Related Documents_). This ADR deliberately does NOT specify migrations, route-handler rewrites, or hook rewrites. It names the architectural flaw, picks a direction, and defines revisit triggers.

## Amendment Notice (2026-04-16)

Following reviewer feedback on the initial draft — diagnosis and direction validated, implementation specificity judged "a bit ahead of the evidence" — the Decision line and Option 1 packaging language have been softened to reflect **direction affirmed, packaging deferred**. The architectural question, the generalization argument (same smell across `handleSave`, `handleMovePlayer`, `handleCloseSession`), the rejection of Option 2, and the relegation of Option 3 to the immediate containment path are all unchanged. Only the commitment to a specific packaging of Option 1 (e.g., a RatingSlipService-owned composite RPC with a named signature) is deferred to the follow-up implementation PRD / SRM amendment. Status remains **Proposed**.

## Amendment Notice 2 (2026-04-16) — Final reviewer nits

Final approval pass: four boundary-hygiene nits applied. (1) Option 1 label held packaging-neutral — the heading no longer hardcodes "composite RPC"; RPC is named only as one candidate packaging among several. (2) Illustrative scope no longer casually pulls in `pit_cash_observation` — the chips-taken ledger-destination / MTL semantic-bridge question belongs exclusively to prospective ADR-050. (3) Urgency phrasing toughened: Option 1 rollout is a **committed near-term workstream**, not a contingent intention; only packaging exploration waits on design time. (4) Derivation-precedent vs command-ownership distinction made load-bearing: the existing MTL-bridge trigger precedent does **not** on its own carry the argument for a command-level cross-context write — that is a new architectural step requiring explicit SRM accompaniment. Status remains **Proposed**.

## Context

### The glitch, briefly

A pit boss entered a $3,000 buy-in, clicked **Save**, saw a threshold-acknowledgement toast, dismissed the modal, and the MTL compliance dashboard did not render the entry. Playwright headless reproduction (`e2e/repro-mtl-glitch.spec.ts`) established the root cause: `POST /api/v1/financial-transactions` takes ~1 second to complete; if the operator dismisses the modal inside that window, the browser aborts the POST and no row is written. The operator had already seen a success toast because `notifyThreshold()` fires at step 1 of the mutation, **before any network call**.

### Why the glitch is a symptom, not the disease

Server-side atomicity inside `rpc_create_financial_txn` is correct. When the MTL bridge trigger `fn_derive_mtl_from_finance` raises (G1 missing context, G2 tenant mismatch, G3 actor mismatch per ADR-024), the whole Postgres transaction rolls back. The `financial_transaction` row and the `mtl_entry` row are atomic on the server.

The disease is that **operator-side atomicity does not match server-side atomicity**. The "save rating-slip changes with buy-in" operator action is implemented as a composite client mutation (`useSaveWithBuyIn` at `hooks/rating-slip-modal/use-save-with-buyin.ts`) that orchestrates:

1. `notifyThreshold()` — client-side projection, shows toast
2. `PATCH /api/v1/rating-slips/:id/average-bet` — DB transaction A
3. `POST /api/v1/financial-transactions` — DB transaction B (which internally is atomic with the MTL bridge)
4. Optionally a follow-on network call for associated post-save secondary effects — DB transaction C. Routing and destination ledger are out of scope for this ADR; the chips-taken / `pit_cash_observation` / MTL semantic-bridge question belongs exclusively to prospective ADR-050.

Cross-transaction atomicity across steps 2, 3, and 3b is **not** enforced by any server boundary. If step 2 commits and step 3 aborts (cancellation, timeout, network failure, user dismissal, refresh), the database keeps the average-bet update and loses the buy-in. There is no compensating transaction and no server-side rollback. The operator sees a success signal that only covers intent, not durable state.

### Architectural smells this glitch exposes

The glitch is a single symptom of a family of smells visible on the same surface:

1. **Composite client mutation crosses separate DB transactions.** The client orchestrates; the backend treats the steps as independent.
2. **Pre-durability feedback ritual.** `notifyThreshold` fires before either network call. The success signal is detached from write completion.
3. **Generic Dialog is the commit surface.** The modal is dismissible orthogonally to mutation state. No "commit-barrier" concept exists in the UI kit.
4. **No HTTP contract for the compliance side-effect.** `POST /api/v1/financial-transactions` returns the txn row; nothing asserts "MTL entry derived OK." Today safe because the trigger raises → POST 500s. Any future drift (async bridge, fail-open trigger, outbox pattern) would silently break the compliance guarantee.
5. **Pit-cash semantic fragmentation.** Chips-taken follows a different ledger path than the buy-in flow, and the MTL bridge today covers only the buy-in (PFT) side. The exact destination for chips-taken and whether it should bridge to MTL is a bounded-context / compliance-semantics question, not a client-mutation question. Tracked under prospective ADR-050; ADR-049 takes no position on the destination table or on whether the chips-taken side should derive an MTL entry.

### Why the question is architectural, not a hardening bullet

The containment PRD (in flight) addresses smells 2 and 3 directly — reorder the notification, install a commit barrier on the modal, add the bridge integration test, wire the close-session interlock. Those fixes do not resolve smell 1. As long as the save-with-buy-in action is a composite client mutation, the partial-commit window remains, and the pattern propagates: `handleMovePlayer` at `components/pit-panels/pit-panels-client.tsx:393` and `handleCloseSession` at `components/pit-panels/pit-panels-client.tsx:347` exhibit the same composite shape (move + accrue loyalty; close rating-slip + record associated secondary effects such as chips-taken). Every new composite operator action inherits the same split-brain risk unless the boundary is resolved. Where chips-taken lands on the server — and whether that landing bridges to MTL — is a separate domain-responsibility question; this ADR names only the composite-mutation smell, not the chips-taken ledger destination (see prospective ADR-050).

This ADR names the boundary question and picks a direction.

## Decision Question

**Should the "save rating-slip changes with buy-in" operator action remain a composite client mutation, or should it be represented by a single server-side contract?**

## Options Considered

### Option 1 — Move the composite action behind a single server-side command contract

Introduce `rpc_save_rating_slip_buyin(rating_slip_id, average_bet, buy_in_amount, chips_taken, ...)` (illustrative packaging only — exact shape deferred) that atomically:
- Updates `rating_slip.average_bet`
- Inserts `player_financial_transaction` (firing the MTL bridge)
- Optionally records associated secondary effects such as chips-taken (destination ledger deferred to prospective ADR-050)
- Returns the updated slip, the financial transaction, and the threshold projection in one response payload

**Smells addressed:**
- (1) **Fixed.** Operator action = one Postgres transaction. Partial-state window collapses to zero.
- (2) **Fixed.** Threshold notification is derived from durable state returned by the RPC, not from the client projection.
- (3) **Partially fixed.** A single mutation makes "commit barrier" trivially correct (one pending boolean, one settle). The Dialog still needs discipline, but the surface no longer has to choreograph a cross-step atomicity story.
- (4) **Fixed.** The RPC response is the contract. Threshold projection, MTL entry ID, financial transaction ID are returned in one payload. Any future bridge refactor (async, outbox) has a named contract to preserve.
- (5) **Not addressed.** Pit-cash fragmentation is a domain-contract question belonging to a separate ADR (see _Out of Scope_).

**RLS / ADR-024 / ADR-030 / ADR-040 implications (apply to any packaging that terminates in a SECURITY DEFINER server-side write):**
- The server-side command must call `set_rls_context_from_staff()` per ADR-024 — same pattern as `rpc_create_financial_txn`. No new context-derivation surface is introduced.
- Staff identity derivation (ADR-040) is unchanged — the command attributes writes to the authenticated staff via the JWT claim, not via a parameter.
- ADR-030 write-path enforcement is preserved: all writes share one transaction and one `SET LOCAL` scope regardless of whether the packaging is a single composite RPC or a coordinator-service that calls primitive RPCs in sequence inside an outer transaction.
- ADR-018 governance applies to any new SECURITY DEFINER RPC the follow-up PRD introduces: `SET search_path = ''` and inventory registration are mandatory.

**SRM / bounded-context impact (material):**
- `rating_slip` (owned by RatingSlipService) and `player_financial_transaction` (owned by PlayerFinancialService) would be written inside a single server-side command boundary. This is the principal friction and the reason the follow-up PRD must include an SRM amendment.
- **Derivation precedent, not command-level precedent.** `rpc_create_financial_txn` already writes `player_financial_transaction` and, via trigger `fn_derive_mtl_from_finance`, derives an `mtl_entry` row (owned by MTLService) in the same transaction. SRM accepts this cross-context atomicity because the MTL row is **derived** from a PFT write by a DB-level trigger with server-enforced invariants (G1–G3). That is a trigger-level precedent. It is **not** a precedent for a command-level cross-context write in which a single external command directly owns inserts into rows from two independently-owned contexts — which is what Option 1 would introduce. The follow-up PRD and accompanying SRM amendment must therefore establish command-ownership (distinct from table ownership) as a new documented concept, not rely on the MTL-bridge derivation precedent to carry the argument.
- A server-side composite command is a **coordinator** over two independently-owned contexts, not a derivation. The follow-up PRD / SRM amendment will need to choose among at least these packaging shapes:
  - (a) Assign command ownership to RatingSlipService (the rating-slip-modal surface is the operator entry point), treating the PFT insert as an orchestrated side-effect — closest to the existing `rpc_create_financial_txn` → MTL derivation precedent.
  - (b) Model a thin `RatingSlipCommandService` (or equivalent) coordinator that owns operator-facing composite commands, calls the primitive RPCs of each bounded context, and assembles the response.
  - (c) Another server-side command boundary consistent with SRM that the follow-up PRD identifies as preferable after closer analysis.
- This ADR deliberately does **not** pre-select among (a), (b), or (c). Option (a) has the strongest precedent today; option (b) introduces a coordinator context which may or may not be justified depending on how many composite surfaces consolidate. The choice is a packaging decision for the follow-up PRD, not an architectural-direction decision for this ADR. What this ADR commits to is: **the composite operator action is represented by a single server-side command contract, and bounded-context data ownership at the table level remains unchanged**.

**Testing implications:**
- Integration tests move from two independent assertions (PATCH succeeded + POST succeeded + MTL derived) to one assertion (the server-side command returns success → all three rows present) plus the existing G1–G3 negative path tests.
- E2E tests simplify: one network call to observe instead of two.
- The existing bridge integration test (containment PRD P0.3) is reused; the composite-command test is a superset.

**Migration path (illustrative — exact sequencing belongs to the follow-up PRD):**
1. Add a single server-side command contract (candidate packaging: composite SECURITY DEFINER RPC such as `rpc_save_rating_slip_buyin` or equivalent; exact packaging TBD). If an RPC is chosen, it inherits ADR-018 governance (`search_path = ''`, inventory entry).
2. Add a route handler wrapping that command (candidate: `POST /api/v1/rating-slips/:id/save-with-buyin` or equivalent; exact shape TBD with the follow-up PRD).
3. Refactor `useSaveWithBuyIn` to call the new endpoint and derive threshold notification from the server-returned response.
4. Deprecate the PATCH `/average-bet` call path from the save-with-buyin flow (the endpoint remains for other callers).
5. Refactor `notifyThreshold` so that its input is the server-returned projection, not the client-side cumulative calculation.
6. (Follow-up, not this ADR) Apply the same pattern to `handleMovePlayer` and `handleCloseSession` if Revisit Trigger R2 fires.

**Cons:**
- If the packaging is an RPC, it adds governance surface (ADR-018 inventory, migration, types regen, E2E sweep). A coordinator-service packaging would shift the governance weight to the service layer instead; either way the follow-up PRD absorbs the cost.
- Response payload grows; the threshold projection must be derivable from the server-returned response (acceptable — whatever component executes the writes knows the gaming-day cumulative after insert).
- SRM boundary ambiguity: the composite command writes rows owned by two services. This is a **new command-level cross-context write**. SRM does not yet document *command ownership* as a concept distinct from *table ownership*, and the existing MTL-bridge derivation precedent does **not** carry the argument on its own — derivation via a DB-level trigger is architecturally different from a command that directly owns inserts into rows from two bounded contexts. Mitigation therefore requires an explicit SRM amendment accompanying the follow-up PRD. Which packaging is chosen affects how the amendment is phrased, but not whether one is needed.

---

### Option 2 — Split the UI into independently-atomic actions

Decompose the modal into two surfaces:
- "Update average bet" — its own mutation, its own feedback, one endpoint.
- "Record buy-in" — its own mutation, its own feedback, one endpoint.

Chips-taken follows the same pattern on close-session.

**Smells addressed:**
- (1) **Fixed by elimination.** There is no composite mutation.
- (2) **Fixed.** Each mutation is one-call-one-action, threshold fires on the response.
- (3) **Fixed.** Each surface has exactly one pending mutation to gate on.
- (4) **Partially fixed.** Individual contracts are clean; the MTL-bridge contract still wants a named assertion but the surface no longer has to bundle it.
- (5) **Not addressed.**

**RLS / ADR-024 / ADR-030 / ADR-040 implications:**
- No new RPC. Uses existing endpoints. No ADR friction.

**SRM / bounded-context impact:**
- Cleanest: each bounded context's command is called independently. No coordinator question.

**Testing implications:**
- Unit/integration tests stay per-endpoint. E2E tests change (two clicks per operator action). Fixtures and selectors need re-scaffolding.

**Migration path:**
- UI-only: split the modal into two forms, update E2E tests, retire the composite hook.
- No migration, no RPC, no SRM update.

**Cons (material):**
- **Operator ergonomics regress.** The single modal was the explicit direction of PRD-008a (Rating Slip Modal Dashboard Integration). Two clicks for one mental action is user-facing friction on a high-frequency loop.
- **Does not generalize.** Close-session is inherently composite (close rating-slip plus associated post-close operator actions such as chips-taken); forcing the operator to do several separate actions on close is worse, not better. (The ledger destination and MTL semantics for chips-taken are the subject of prospective ADR-050; this ADR takes no position on them.)
- **Threshold UX.** The threshold-acknowledgement toast is most useful at the moment the buy-in is recorded. Splitting the surface changes the ritual but does not simplify it.

---

### Option 3 — Keep hybrid; enforce `INV-MTL-BRIDGE-ATOMICITY` at the client

This is the **containment direction** in flight in the parallel PRD. The client continues to orchestrate two transactions but presents atomicity via:
- `notifyThreshold` reordered to fire after POST 201
- Commit-barrier modal (non-dismissible while save is pending)
- Bridge integration test covering the full chain
- Close-session interlock to prevent unsaved buy-in loss

**Smells addressed:**
- (1) **Not addressed.** The composite mutation still spans two DB transactions. The partial-commit window (PATCH commits, POST aborts before it reaches the server) is closed by the UI barrier only as long as the client discipline holds.
- (2) **Fixed.**
- (3) **Fixed for this surface.** Must be reimplemented on every future composite surface.
- (4) **Not addressed.**
- (5) **Not addressed.**

**Cons (material):**
- **Atomicity depends on UI discipline.** Every composite surface has to reimplement the commit barrier, the post-durability notification, and the close interlock. Any future component author who reaches for a generic Dialog reintroduces the split-brain.
- **The partial-state window is contained, not eliminated.** Cancellation during the brief window between the PATCH response and the POST response can still leave the DB in an inconsistent state. The operator does not see a success toast in that case, but the data is inconsistent nonetheless.
- **Invites drift.** The same invariant (`INV-MTL-BRIDGE-ATOMICITY`) has to be copy-pasted and re-tested on `handleMovePlayer`, `handleCloseSession`, and every future composite operator action.

## Decision

**Adopt Option 1 in principle: composite operator actions of this class should move behind a single server-side command contract as the long-term direction.**

**The exact packaging of that contract — whether as a RatingSlip-owned composite RPC, a thin coordinator command surface, or another server-side command boundary consistent with SRM — will be finalized in the follow-up implementation PRD / SRM amendment.**

**The immediate containment PRD remains the short-term release path.**

In short: direction affirmed, packaging deferred. Option 2 is rejected. Option 3 ships now as the containment posture; Option 1 (in whatever packaging the follow-up PRD settles on) is the durable successor.

### Reasoning

- **A backend boundary problem requires a backend boundary fix.** Smells 2–4 can be patched in the UI, but smell 1 — cross-transaction operator split-brain — is a server-side atomicity question. Client discipline can only narrow the window; it cannot enforce atomicity across two DB transactions. This is the non-negotiable part of Option 1, independent of packaging.
- **The direction-of-travel is committed policy, not a contingent intention.** Option 1's direction is not contingent on whether the follow-up PRD happens — it is the standing policy for this class of composite operator action. The follow-up PRD exists only to fix the packaging (RPC vs coordinator-service vs other) and to land the accompanying SRM amendment; it does not re-open whether to pursue the direction at all.
- **Option 2 is rejected.** The single-modal direction is a deliberate product choice (PRD-008a) on a high-frequency operator loop. Splitting surfaces trades a correctness problem for a UX regression without solving the generalization problem (close-session cannot be reduced to one atomic primitive from the UI side).
- **Option 3 alone is insufficient.** The containment patch is correct for shipping today — it closes the visible window and restores compliance confidence — but it does not address the underlying pattern. Shipping Option 3 without an Option 1 follow-up queued means the same class of bug will recur on the next composite surface.
- **Distinguish derivation precedent from command-level cross-context write.** Derivation across bounded contexts already exists: `fn_derive_mtl_from_finance` derives the `mtl_entry` row from a `player_financial_transaction` insert within the same transaction. That is a **trigger-level precedent** for cross-context atomicity — SRM accepts it because the MTL row is DERIVED from a PFT write by a DB-level trigger, not directly written by an external command. What does **not** yet exist in PT-2 is a **command-level cross-context write** — a single operator-facing command that directly owns inserts into rows from two bounded contexts. Option 1's direction introduces one. The existing derivation precedent does **not**, on its own, establish that a command-level composite is self-evidently acceptable; that is a separate packaging and SRM question. The follow-up PRD's packaging must decide (a) which service owns the command surface and (b) whether the extended write boundary requires an SRM amendment documenting a command-ownership concept distinct from table ownership. This ADR commits only to the direction; the command-level precedent is a new architectural step that the follow-up PRD establishes with explicit SRM accompaniment.
- **The pattern generalizes.** Smell 1 appears in at least three surfaces today — `handleSave` (buy-in), `handleMovePlayer` (move + loyalty accrual), `handleCloseSession` (close rating-slip + associated post-close operator actions such as chips-taken). A single server-side composite-command pattern, applied three times, is cheaper and more durable than three copies of UI-side atomicity discipline. This is the core reason to pick a direction now rather than waiting for the third occurrence. The chips-taken ledger destination and its MTL semantic bridge are out of scope for this ADR (see prospective ADR-050); ADR-049 names only the composite-mutation smell on the close-session surface, not the domain contract for what the close-session secondary effects write to.

### Urgency classification

- **P0 patch (URGENT, this week):** Option 3 via the containment PRD. Block release without it. The production glitch is reproducible and the operator-visible symptom is a false success toast on a compliance-relevant write.
- **Option 1 rollout (committed near-term workstream; packaging is the only portion that waits on design time):** Option 3 shipping this week closes the visible window but **does not retire the architectural debt** — it temporarily contains the smell via UI discipline that every future composite surface would otherwise have to reimplement. The direction-of-travel to a single server-side command contract is committed policy, not an intention contingent on budget. The follow-up PRD exists only to settle packaging (RPC vs coordinator-service vs other) and the accompanying SRM amendment; it does **not** re-open whether to move. Every additional composite operator surface that regresses on the UI discipline raises the priority of the follow-up PRD. Exact scheduling is owned by the follow-up PRD; whether the policy itself applies is not.

### Scope of this ADR

- This ADR accepts Option 1 **as the direction of travel**. It deliberately does NOT fix the packaging: the RPC signature, the response payload schema, the SRM placement (RatingSlipService-owned composite vs thin coordinator command surface vs other), the migration timestamp, the route handler contract, and the hook refactor are all implementation concerns for the follow-up PRD and any accompanying SRM amendment.
- This ADR accepts Option 3 **as the immediate containment posture** and cross-links the containment PRD for the operator-visible fix.

## Consequences

### Positive

- The composite-client-mutation smell is named as an architectural pattern, not a one-off bug. Future composite operator surfaces will be evaluated against this ADR before they ship.
- The MTL bridge contract becomes assertable. Once the single server-side command contract lands (exact packaging TBD — candidate: `rpc_save_rating_slip_buyin` or equivalent), its response becomes the named contract, and any future bridge refactor (async, outbox, fail-open) must preserve the response shape or explicitly amend this ADR.
- The containment PRD ships with a named successor direction, so the patch is not load-bearing architecture. The commit-barrier discipline in the UI is temporary; a server-side command boundary is the durable home.
- The bounded-context ownership distinction between **data ownership** (who owns the table) and **command ownership** (who owns the operator action) is made explicit. This unlocks future coordinator patterns without promoting every cross-context write to a new bounded context — and the follow-up PRD/SRM amendment will settle exactly which service owns the command.

### Negative

- The direction implies at least one new SECURITY DEFINER surface — exact packaging TBD (candidate: a composite RPC such as `rpc_save_rating_slip_buyin` or equivalent coordinator command). Whatever ships, it enters the ADR-018 inventory and takes on `search_path` discipline, advisor sweep, and governance review.
- The direction implies a migration (if the packaging is an RPC), a route handler, a hook refactor, and E2E test updates. Non-trivial effort budget; exact sizing belongs to the follow-up PRD.
- SRM requires an explicit amendment documenting the command/data ownership split. Without the amendment, a composite command that writes rows from two bounded contexts looks like a cross-context violation. This amendment is scoped to the follow-up PRD.
- The containment PRD ships first, which means the codebase carries the commit-barrier discipline for at least one quarter before the server-side command lands. During that window, any new composite operator surface could ship with the same smell.

### Neutral

- Threshold projection moves from client-side cumulative calculation to server-returned projection. This is a minor semantic change; UX is unchanged.
- `useSaveWithBuyIn` loses its orchestration responsibility once the server-side command lands, and becomes a thin wrapper over one endpoint. This simplifies the hook surface but does not change the public API of the modal.

## Alternatives Considered

- **Option 2 (split the UI).** Rejected on operator ergonomics and non-generalization to close-session. Documented above.
- **Option 3 alone (containment-only).** Rejected as a long-term solution. Adopted as the immediate patch and explicitly named as insufficient for the underlying smell. Documented above.
- **Wrap the two client requests in a single outer transaction via a distributed-transaction protocol.** Rejected without detailed analysis. PT-2 has no distributed-transaction infrastructure; introducing one to paper over a composite mutation is a textbook over-engineering move (see `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`).
- **Server-side outbox pattern for deferred MTL derivation.** Rejected as scope creep. The bridge is synchronous today and that is the correct choice for compliance-synchronous writes. An outbox would move the atomicity question from "client composite" to "server eventual consistency," which is a net worse trade for AML/CTR obligations.

## When to Revisit

The direction-of-travel in this ADR is a standing policy and is **not** subject to "re-open whether to do it at all." The triggers below are conditions that **accelerate the follow-up PRD's schedule** (and, in R4, widen the follow-up PRD's scope). They are not off-ramps for Option 1.

- **R1 — Second production glitch with the same shape.** If a second composite-mutation partial-commit is observed in production (on any surface, not just save-with-buyin), promote the Option 1 follow-up PRD from "next quarter" to "this quarter" immediately.
- **R2 — `handleMovePlayer` or `handleCloseSession` exhibits the same smell.** If the move-player flow or the close-session flow (cross-referenced at `components/pit-panels/pit-panels-client.tsx:347` and `:393`) experiences a similar split-brain — any partial-commit escape during one of those composite actions — treat this as the signal that the pattern is generalizing faster than the follow-up rollout. Accelerate the follow-up PRD to cover all three surfaces in one workstream; this also increases pressure on the packaging question, since three surfaces under one boundary may favor a coordinator-command packaging over a per-surface composite RPC.
- **R3 — MTL bridge evolves to async or fail-open.** If the MTL bridge trigger is refactored to an async derivation (outbox, queue, deferred) or a fail-open model, the client's "POST 500 = nothing landed" invariant breaks silently. The server-side command's named response contract becomes load-bearing, not optional, and the follow-up PRD must fix the packaging that preserves it. Promote to this quarter.
- **R4 — A fourth composite operator surface emerges.** If a new feature ships a fourth composite mutation (e.g., a unified shift-close, a rundown-persistence composite, a rewards-redemption composite), escalate the follow-up PRD: the policy direction does not change, but the follow-up PRD's scope widens to cover all composite operator surfaces in one workstream, and consideration of a coordinator-command packaging (vs per-surface composite RPC) becomes load-bearing rather than optional.
- **R5 — Containment PRD's commit-barrier discipline is observed to regress.** If a later frontend refactor reintroduces a dismissible Dialog on a composite mutation surface, that is the signal that UI discipline does not hold over time. Promote the follow-up PRD.

If none of the triggers fire in 6 months, this ADR is still valid and the containment PRD has held. That does **not** make the Option 1 rollout optional: the direction is standing policy and the follow-up PRD is a **committed near-term workstream**, not a contingent wish. Only the packaging exploration (RPC vs coordinator-service vs other) waits on design time; the decision to move to a single server-side command contract is not itself on the backlog. Exact scheduling is a PRD-level call owned by the follow-up PRD; whether to pursue the direction at all is not on the table.

## Scope Boundaries (Out of Scope)

- **Chips-taken ledger destination and MTL semantic-bridge question.** Tracked in a separate, yet-to-be-drafted prospective ADR-050 (see audit H in `docs/issues/mtl-rating-slip-glitch/hardening-direction-audit.md`). That is a bounded-context / domain-responsibility and compliance-semantics question — which table chips-taken writes to, whether it bridges to MTL, and who owns those invariants — not a client-mutation question. **ADR-049 takes no position on any of it.** Any reference in this ADR to chips-taken or to close-session secondary effects is illustrative of the composite-mutation smell only; the architectural decision about the chips-taken destination belongs exclusively to prospective ADR-050.
- **Gaming-day default correction**, `mtlKeys` invalidation timing, realtime subscription on `mtl_entry`, mixed-unit fixture cleanup. Observability and hygiene; handled outside this ADR.
- **`INV-MTL-BRIDGE-ATOMICITY` codification.** That invariant is named in the containment PRD; this ADR preserves it as a durable contract that the follow-up PRD's server-side command response (whatever packaging is chosen) must assert.
- **Detailed RPC signature, migration timestamp, route handler schema, hook refactor plan, SRM amendment wording, and the choice between composite-RPC vs coordinator-service packaging.** All implementation and packaging artifacts belong to the follow-up PRD / SRM amendment.

## Related Documents

### Investigation artifacts

- `docs/issues/mtl-rating-slip-glitch/RATING-MTL-ISSUE.md` — Phase 1 root-cause investigation
- `docs/issues/mtl-rating-slip-glitch/hardening-direction-audit.md` — Audit of proposed fixes; classifies P0/P1/P2 and identifies the composite-mutation architectural question
- `docs/issues/mtl-rating-slip-glitch/arch-flaw.md` — Names the five architectural smells and the operator-side atomicity gap
- `docs/issues/mtl-rating-slip-glitch/PROPOSED-FIXES.md` — Source proposal that the audit responds to
- `docs/issues/mtl-rating-slip-glitch/7-findings.md` — Additional findings
- `e2e/repro-mtl-glitch.spec.ts` — Playwright headless reproduction

### Parallel containment PRD (short-term release path)

- **`docs/10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md`** — the immediate P0/P1 fixes (reorder `notifyThreshold`, commit-barrier modal, bridge integration test, close-session interlock). The containment PRD owns the tactical patch and is the short-term release path. This ADR owns the architectural direction — direction affirmed, packaging deferred to the follow-up implementation PRD / SRM amendment that succeeds PRD-064.

### Related ADRs

- **ADR-015** (`ADR-015-rls-connection-pooling-strategy.md`) — Session-variable pattern; whatever packaging the follow-up PRD chooses must preserve the `SET LOCAL` discipline across all writes in the transaction.
- **ADR-018** (`ADR-018-security-definer-governance.md`) — SECURITY DEFINER governance; if the packaging is a new SECURITY DEFINER RPC, it must register in the inventory.
- **ADR-020** (`ADR-020-rls-track-a-mvp-strategy.md`) — Track A hybrid; the direction is compatible with Track A without change.
- **ADR-024** (`ADR-024_DECISIONS.md`) — Authoritative context derivation; the server-side command must call `set_rls_context_from_staff()` with no new spoofable parameters, regardless of packaging.
- **ADR-025** (`ADR-025-mtl-authorization-model.md`) — MTL authorization; the direction preserves the authorization surface (MTL entry remains derived by the trigger, not inserted by the composite command directly).
- **ADR-030** (`ADR-030-auth-system-hardening.md`) — Auth pipeline hardening; write-path session-variable enforcement is preserved because all writes share one transaction.
- **ADR-031** (`ADR-031-financial-amount-convention.md`) — Cents convention; the server-side command accepts amounts in cents matching the existing financial-transaction contract.
- **ADR-040** (`ADR-040-identity-provenance-rule.md`) — Identity provenance; staff-identity attribution is unchanged (Category A derived from JWT, not from parameter).

### Implementation surfaces (referenced, not modified by this ADR)

- `hooks/rating-slip-modal/use-save-with-buyin.ts` — current composite client mutation
- `components/pit-panels/pit-panels-client.tsx:291` — `handleSave`
- `components/pit-panels/pit-panels-client.tsx:347` — `handleCloseSession` (same smell family)
- `components/pit-panels/pit-panels-client.tsx:373` — `handleMovePlayer` (same smell family)
- `app/api/v1/financial-transactions/route.ts` — current POST endpoint
- `app/api/v1/rating-slips/[id]/average-bet/route.ts` — current PATCH endpoint
- `supabase/migrations/*rpc_create_financial_txn*` — existing atomic primitive that the follow-up PRD's server-side command will either wrap, compose, or compose alongside (exact packaging TBD).
