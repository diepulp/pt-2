---
id: PRD-065
title: ADR-049 Operator Atomicity — Save-with-Buy-In Server-Side Command Contract
owner: Lead Architect
status: Draft
affects: [ADR-049, ADR-015, ADR-018, ADR-024, ADR-030, ADR-031, ADR-040, ARCH-SRM-v4.11.0, PRD-064]
supersedes_direction_of: PRD-064
created: 2026-04-16
last_review: 2026-04-16
phase: Implementation — ADR-049 Durable Successor to PRD-064 Containment
pattern: B
http_boundary: true
slice: architectural-implementation
scope_surface: rating-slip save-with-buy-in only
related_adr: docs/80-adrs/ADR-049-operator-action-atomicity-boundary.md
succeeds: docs/10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md
---

# PRD-065 — ADR-049 Operator Atomicity: Save-with-Buy-In Server-Side Command Contract

> **Slice type — ARCHITECTURAL IMPLEMENTATION.** This PRD implements the direction-of-travel affirmed by ADR-049: composite operator actions of this class move behind a single server-side command contract. Scope is deliberately narrowed to the **save-with-buy-in** surface (the surface where the production glitch was observed). The sister surfaces `handleMovePlayer` and `handleCloseSession` are in the same smell family but are **out of scope for this PRD** and remain governed by ADR-049 revisit triggers R2/R4. PRD-064 remains the in-flight containment patch; this PRD is its durable successor.

---

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Summary:** ADR-049 affirmed the direction: the composite-client-mutation smell on `useSaveWithBuyIn` is a server-side atomicity problem and must be resolved by a single server-side command contract, with exact packaging deferred to this PRD. This PRD operationalizes the packaging decision through a Phase 0 gate, lands the SRM amendment, writes the migration, wires the route handler, refactors the hook to a thin wrapper, retires the PATCH `/average-bet` call from the save-with-buyin flow, and updates the integration and E2E test surfaces. On delivery, the save-with-buy-in operator action is one Postgres transaction, the threshold projection is derived from server-returned durable state rather than a client projection, and the MTL bridge contract becomes assertable at a named response shape.

> **What this PRD does not do:** it does not revisit ADR-049's direction; that is standing policy. It does not extend the pattern to move-player or close-session; those are governed by ADR-049 R2/R4. It does not touch chips-taken ledger destination or MTL semantic-bridge; that is ADR-050 territory.

---

## 2. Problem & Goals

### 2.1 Problem

PRD-064 closed the operator-visible window by (a) deferring `notifyThreshold` until after the POST 201, (b) installing a commit-barrier modal, (c) adding bridge integration tests, and (d) interlocking close-session against unsaved buy-ins. Those fixes **contain** smell 2 (pre-durability feedback), smell 3 (dismissible commit surface), and smell 4 (no named HTTP contract for the compliance side-effect on a per-surface basis) — but they do **not** eliminate smell 1: the save-with-buy-in operator action still crosses two independent DB transactions under the client's orchestration. Cross-transaction atomicity is enforced only by UI discipline; any future refactor that reintroduces a dismissible surface, an abortable mutation, or a new composite path re-opens the partial-commit window.

The disease is that **operator-side atomicity does not match server-side atomicity** (ADR-049 §Context). The save-with-buy-in action orchestrates at least two DB transactions from the client:

1. `PATCH /api/v1/rating-slips/:id/average-bet` → DB transaction A
2. `POST /api/v1/financial-transactions` → DB transaction B (internally atomic with MTL bridge)

If (A) commits and (B) aborts, the database keeps the average-bet update and loses the buy-in. No compensating transaction, no server-side rollback. The operator's signal is detached from durable state.

ADR-049 Option 1 moves the composite action behind a single server-side command contract. This PRD defines the packaging decision process through a Phase 0 gate and ships the selected implementation path.

### 2.2 Goals

| Goal | Observable Signal | Traces To |
|------|-------------------|-----------|
| **G1** Save-with-buy-in is one Postgres transaction | One network call from `useSaveWithBuyIn`; one transaction on the server; partial-commit window is structurally impossible | ADR-049 Decision, smell 1 |
| **G2** Threshold projection derives from server-returned durable state | `notifyThreshold` input is read from the command response, not from a client-side cumulative calculation | ADR-049 smell 2 fix |
| **G3** The MTL bridge contract is assertable at a named response shape | The command response includes the rating-slip row, the financial-transaction row, and the threshold projection; a named integration test asserts the shape; any future bridge refactor must preserve it | ADR-049 smell 4 fix |
| **G4** Command ownership is a documented SRM concept | SRM v4.12.0 documents "command ownership" as distinct from "table ownership"; the save-with-buy-in command is assigned to a named context; no table-ownership boundary is violated | ADR-049 Consequences, SRM amendment requirement |
| **G5** The composite-client-mutation pattern is retired on this surface | `useSaveWithBuyIn` becomes a thin wrapper over one endpoint; the PATCH `/average-bet` call is removed from the save-with-buyin path; the containment barrier remains in place but no longer carries the atomicity argument | ADR-049 Migration Path §3–5 |
| **G6** ADR-018, ADR-024, ADR-030, ADR-040 posture is preserved | The new SECURITY DEFINER RPC (if packaging (a)) registers in the inventory with `SET search_path = ''`; calls `set_rls_context_from_staff()`; staff identity derives from JWT, not from parameter; all writes share one `SET LOCAL` scope | ADR-049 §Option 1 RLS implications |

### 2.3 Non-Goals (Deliberately Out of Scope)

- **Move-player and close-session refactors.** Same smell family, governed by ADR-049 R2/R4. Their inclusion is conditional on a trigger firing; this PRD ships with exactly one surface consolidated.
- **Chips-taken ledger destination or MTL semantic-bridge semantics.** Belongs to prospective ADR-050. This PRD takes no position.
- **Removing or merging the existing `rpc_create_financial_txn` primitive.** That primitive remains the authoritative PFT+MTL atomic writer. The new composite command wraps it or composes alongside it; it does not replace it.
- **Deprecating the PATCH `/api/v1/rating-slips/:id/average-bet` endpoint entirely.** The endpoint remains for other callers (e.g., non-buy-in average-bet adjustments). Only its use inside `useSaveWithBuyIn` is retired.
- **Async bridge, outbox patterns, or deferred MTL derivation.** Explicitly rejected in ADR-049 §Alternatives.
- **UI surface redesign.** Modal ergonomics and copy are unchanged. PRD-008a's single-modal direction is preserved.
- **Retiring PRD-064's commit-barrier modal or unsaved-buy-in interlock.** They remain in place as defense-in-depth; their architectural argument is replaced, but the UI code is not.

**Containment-control status note.** PRD-064 controls (commit-barrier modal, unsaved-buy-in interlock, post-durability notification discipline) remain in force for this slice as **defense-in-depth**, but they are no longer the primary carrier of the atomicity argument once the server-side command lands. Any future proposal to simplify or retire those controls must be treated as a separate hardening review, not as an implicit consequence of PRD-065.

---

## 3. Users & Use Cases

- **Primary users:** Pit boss, floor supervisor (operators who enter buy-ins on the rating-slip modal).
- **Secondary users:** Compliance officer (reads `/compliance` — now guaranteed consistent with operator's success toast because the toast derives from the same transaction that wrote the rows).
- **Downstream consumers:** RatingSlipService, PlayerFinancialService, MTLService (inter-service contract changes as per §4.1 and §6).

**Top Jobs:**

- As a **pit boss**, when I click Save with a buy-in, I get a single atomic outcome — either everything committed or nothing did. No partial-commit window, no UI discipline that could regress. *(G1, G3)*
- As a **pit boss**, the threshold notification reflects what the server actually recorded, not what my browser predicted. *(G2)*
- As a **compliance officer**, the MTL ledger is guaranteed to be synchronous with and atomic to the financial-transaction write, at a named HTTP contract I can cite. *(G3)*
- As a **platform engineer**, when I later refactor the MTL bridge (async, outbox, fail-open), the command response shape tells me what contract I must preserve. *(G3, G6)*
- As a **PT-2 architect**, command ownership is a first-class SRM concept; future composite operator surfaces have a documented pattern to follow. *(G4)*

---

## 4. Scope & Feature List

### 4.1 In Scope

#### 4.1.1 WS1 — Packaging Decision and SRM Amendment (Phase 0 Gate)

**Packaging decision is a real gate and must close before implementation begins.** ADR-049 deliberately deferred packaging among:

- **(a) RatingSlipService-owned composite RPC**
- **(b) Thin coordinator-service command surface**
- **(c) Another server-side command boundary consistent with SRM**

This PRD enters the gate with a **working preference for (a)** because it appears closest to current precedent and introduces the least conceptual surface area, but that preference is **not yet the implementation decision of record**. WS2–WS6 are therefore conditional on the Phase 0 gate outcome.

The Phase 0 gate must produce:
- one packaging choice of record: **(a)**, **(b)**, or **(c)**
- a written rationale for the choice
- SRM v4.12.0 amendment draft documenting the **command-ownership** concept distinct from **table-ownership**. The amendment must explicitly state:
  - table ownership is unchanged — `rating_slip` remains owned by RatingSlipService, `player_financial_transaction` remains owned by PlayerFinancialService, and `mtl_entry` remains owned by MTLService
  - the save-with-buy-in command is assigned to a named command-owning context selected at the packaging gate
  - this amendment grants **command ownership only** and does **not** reassign table ownership
  - this amendment does **not** convert MTL derivation into a directly authored cross-context write; `mtl_entry` remains DB-trigger-derived unless a future ADR explicitly changes that rule
  - the distinction is traced back to ADR-049
- ADR-018 inventory confirmation for any new `SECURITY DEFINER` surface introduced by the chosen packaging

If the gate confirms **(a)**, the implementation proceeds via the RPC-oriented path described in WS2–WS6. If the gate selects **(b)** or **(c)**, WS2–WS6 are interpreted according to the same architectural goals but executed through the selected server-side command boundary.

#### 4.1.2 WS2 — Migration and RPC Contract (if packaging (a) or (b))

- **Migration file:** `supabase/migrations/YYYYMMDDHHMMSS_add_rpc_save_rating_slip_buyin.sql` (timestamp generated at write time; see CLAUDE.md Migrations rule).
- **Function contract sketch (illustrative only; not implementation-binding):**
  - accepts `rating_slip_id`, `average_bet_cents`, `buy_in_amount_cents`, and `idempotency_key`
  - establishes authoritative staff / tenant context via `set_rls_context_from_staff()`
  - executes the save-with-buy-in operator action inside one server-side transaction
  - updates `rating_slip.average_bet`
  - records the financial transaction through the authoritative financial-write path selected at the packaging gate
  - preserves DB-level MTL derivation semantics rather than re-defining them at the HTTP layer
  - returns a shaped response containing:
    - updated rating-slip payload
    - financial transaction payload
    - derived `mtl_entry_id` when present
    - threshold projection derived from durable server state

**Important boundary note:** this section is intentionally non-prescriptive about whether the new command wraps `rpc_create_financial_txn`, composes alongside it, or inlines equivalent semantics. That choice belongs to the implementation package selected at Phase 0 gate and must not be inferred from illustrative pseudocode in this PRD.
- The migration must:
  - Pass the `search_path = ''` pre-commit hook.
  - Register in ADR-018 inventory (`docs/30-security/SEC-004-security-definer-inventory.md` or equivalent — Phase 0 gate confirms location).
  - Preserve ADR-024 context derivation (no spoofable parameters; staff identity via JWT).
  - Preserve ADR-030 write-path session-var enforcement (all writes share one `SET LOCAL` scope).
  - Preserve ADR-031 cents convention for `average_bet` and `buy_in_amount`.
  - Preserve ADR-040 identity attribution (Category A via JWT claim).
  - NOT overload an existing function signature (CLAUDE.md Migrations rule).

**If packaging (c) is chosen** and does not introduce a new RPC, WS2 is replaced by the selected packaging migration plan of record; the ADR-018 entry and inventory step do not apply.

#### 4.1.3 WS3 — Route Handler and DTO

- **New route:** `POST /api/v1/rating-slips/:id/save-with-buyin` (exact path finalized in Phase 0 gate; may also be `PATCH /save` variant).
- **Request DTO:** `SaveRatingSlipBuyinRequest` (derived via Pick/Omit from `Database` types per CLAUDE.md).
- **Response DTO:** `SaveRatingSlipBuyinResponse` exposing the rating-slip, financial-txn, MTL entry id, and threshold projection. This is the **named contract** that makes smell 4 assertable.
- **Handler pattern:** Route Handler with `ServiceHttpResult` wrapper, per `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` and the API-builder standard.
- **OpenAPI:** `docs/25-api-data/OPENAPI.yaml` (or equivalent) updated with the new path, request, and response schemas.

#### 4.1.4 WS4 — Hook Refactor

- `hooks/rating-slip-modal/use-save-with-buyin.ts` is refactored to:
  - Call the new endpoint once.
  - Derive `notifyThreshold`'s input from the server-returned `threshold_projection` (no client-side cumulative calculation).
  - Retain PRD-064's commit-barrier discipline in the consuming modal (defense-in-depth).
  - Remove the `PATCH /average-bet` call from the save-with-buyin path (the endpoint remains for non-buy-in callers).
- `useSaveWithBuyIn` becomes thin: one mutation, one response, one `onSuccess` branch.
- Related query invalidation (`ratingSlipKeys`, `financialTxnKeys`, `mtlKeys`) is consolidated to the single mutation's `onSuccess`.

#### 4.1.5 WS5 — Integration & E2E Tests

- **Integration test (happy path):** new endpoint writes `rating_slip.average_bet`, `player_financial_transaction`, and derived `mtl_entry` in one transaction; response shape matches `SaveRatingSlipBuyinResponse`.
- **Integration test (sub-threshold):** `mtl_entry` is still written (bridge remains ungated at write-time, per PRD-064 rationale).
- **Integration test (context-guard):** ADR-024 G1–G3 guard violations (MISSING_CONTEXT, tenant mismatch, actor mismatch) produce zero `rating_slip.average_bet` update, zero `player_financial_transaction`, zero `mtl_entry` — full rollback.
- **Integration test (bridge contract):** the response's `threshold_projection` matches a fresh read of the server-side projection function; any drift fails the test.
- **E2E test:** `e2e/repro-mtl-glitch.spec.ts` is updated to assert the single-network-call shape; dismissal attempts during pending state remain inert (PRD-064 barrier still holds).
- **Deprecation test:** an `expect(networkRequests).not.toInclude('/average-bet')` assertion on the save-with-buyin E2E path.
- **Regression guard:** PRD-064's full integration/E2E suite passes unchanged on the new path.

#### 4.1.6 WS6 — Observability and Rollback

- Structured log at route-handler entry and exit (`save-with-buyin.enter`, `save-with-buyin.success`, `save-with-buyin.error`) with `rating_slip_id`, `fin_txn_id`, `mtl_entry_id`.
- Rollback plan: revert the client to the PRD-064 two-call shape while leaving the new endpoint deployed but dark. This is operationally a **client-dominant rollback**, not a guaranteed client-only rollback in every circumstance. It remains safe and low-friction **provided the new endpoint is introduced behind a feature flag or otherwise remains single-caller during rollout**. If additional callers adopt the endpoint before stabilization, rollback scope must be re-evaluated accordingly.

### 4.2 Out of Scope

- All items in §2.3 Non-Goals.
- Applying the pattern to move-player or close-session (ADR-049 R2/R4).
- Chips-taken ledger destination (ADR-050).
- Any change to `rpc_create_financial_txn`'s signature (preserved as authoritative PFT+MTL atomic writer; the new RPC either wraps it or composes its semantics inline).
- Retiring the PATCH `/average-bet` endpoint for non-buy-in callers.

---

## 5. Requirements

### 5.1 Functional Requirements

- **FR-1** `useSaveWithBuyIn` MUST issue exactly one write network call per save invocation. Verified by Playwright network-trace assertion.
- **FR-2** The single write call MUST land all of {`rating_slip.average_bet` update, `player_financial_transaction` insert, derived `mtl_entry` insert} in one Postgres transaction, or none of them.
- **FR-3** The response payload MUST include the threshold projection derived from durable server-side state, and `notifyThreshold` MUST consume that projection rather than a client-side cumulative.
- **FR-4** On 2xx, both the threshold toast (if applicable) and the success toast MUST fire. On non-2xx, only the error toast fires (PRD-064 invariant preserved).
- **FR-5** ADR-024 G1–G3 guard violations MUST roll back the whole transaction and return a structured error (no partial writes, no success-class signal).
- **FR-6** The response MUST include `mtl_entry_id` when an MTL entry is derived, and `null` (or omit the field) when the bridge chose not to derive one. The presence of the field is the smell-4-fix named contract.
- **FR-7** The hook MUST NOT issue a `PATCH /api/v1/rating-slips/:id/average-bet` call inside the save-with-buyin path. A Playwright/unit test enforces this.
- **FR-8** PRD-064's commit-barrier and close-session interlock remain in force. This PRD does not alter their behavior, only their justification.

### 5.2 Non-Functional Requirements

- **NFR-1** Performance target: end-to-end save latency on the consolidated path should be no worse than the PRD-064 baseline by more than a modest margin under staging load. The implementation must capture before/after measurements during validation. If the consolidated command materially exceeds the prior path, the PRD owner must document the delta and justify the trade against the atomicity gain before release.
- **NFR-2** The new RPC (if packaging (a)) MUST pass `SET search_path = ''` pre-commit hook and register in the ADR-018 inventory before merge.
- **NFR-3** No regressions against ADR-015 (connection pooling, session-var pattern), ADR-024 (context derivation), ADR-030 (write-path enforcement), ADR-031 (cents convention), ADR-040 (identity provenance). The bridge integration tests serve as regression guards.
- **NFR-4** Idempotency: the RPC MUST accept and honor the client-provided `idempotency_key` (same shape as `rpc_create_financial_txn`). Repeated calls with the same key return the same result; no duplicate rows.
- **NFR-5** Type safety: all DTOs derive from `types/database.types.ts`. `npm run db:types-local` is run post-migration. No `as any`, no raw error details (INV-ERR-DETAILS).
- **NFR-6** Over-engineering guardrail (`docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md`): no abstractions beyond the named contract. No speculative coordinator classes, no anticipatory generic composite-command framework. If packaging (b) is chosen, the rationale must explicitly justify the coordinator context against the guardrail.

### 5.3 Referenced Standards and Contracts

- ADR-015 — Connection pooling / session-variable pattern (preserved).
- ADR-018 — SECURITY DEFINER governance (new RPC registers).
- ADR-024 — Authoritative context derivation via `set_rls_context_from_staff()`.
- ADR-030 — Auth pipeline hardening, write-path session-var enforcement.
- ADR-031 — Financial amount convention (cents).
- ADR-040 — Identity Provenance Rule (Category A JWT-derived).
- ADR-049 — This PRD's direction-of-record.
- PRD-064 — Containment; remains in force as defense-in-depth.
- SRM v4.11.0 → v4.12.0 amendment — command-ownership concept.
- `types/database.types.ts` — DTO derivation source.
- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` — scope discipline.

---

## 6. Packaging Decision (PRD-Specific Section)

This section makes the ADR-049-deferred packaging decision legible.

**Boundary hygiene note:** until the Phase 0 gate closes, references to packaging (a) in this PRD are preference signals, not implementation commitments.

### 6.1 Options

| Option | Packaging | SRM surface | Primary cost | Primary benefit |
|---|---|---|---|---|
| (a) | Composite SECURITY DEFINER RPC owned by RatingSlipService | Extend RatingSlipService command ownership | One new RPC, ADR-018 inventory entry | Closest precedent; minimum new conceptual surface |
| (b) | Thin `RatingSlipCommandService` coordinator over primitive RPCs | New coordinator context | New service + its governance; still needs an RPC or composes existing primitives in an outer TX | Scales if 3+ composite surfaces land; clean layering |
| (c) | Other (e.g., Edge Function, server action, other) | Gate-defined | Gate-defined | Gate-defined |

### 6.2 PRD Recommendation

**Working preference: packaging (a).** Rationale in §4.1.1 (WS1). This is a preference signal only; the Phase 0 gate confirms or overrides before WS2 begins.

### 6.3 Revisit

- If ADR-049 R2 fires (move-player or close-session exhibits the same smell), re-evaluate (b) vs per-surface (a) at the point three surfaces are in scope. ADR-049 §R2 explicitly notes three surfaces under one boundary may favor (b).
- If ADR-049 R4 fires (fourth composite surface emerges), (b) becomes load-bearing rather than optional.

---

## 7. UX / Flow Overview

**Happy path (post-implementation):**
1. Pit boss enters buy-in → clicks **Save Changes**.
2. Modal enters "saving" state (PRD-064 barrier: dismissal inert, Save disabled, spinner shown).
3. Single POST `/api/v1/rating-slips/:id/save-with-buyin` fires.
4. Server executes one transaction: updates `rating_slip.average_bet`, inserts `player_financial_transaction`, derives `mtl_entry` via trigger, projects threshold.
5. On 201: threshold toast (if applicable, fed from server projection) + success toast fire; modal returns to normal.
6. Client invalidates `ratingSlipKeys`, `financialTxnKeys`, `mtlKeys` in one `onSuccess` branch.
7. Navigating to `/compliance` shows the new entry.

**Error path:**
1. Server returns 4xx/5xx or request fails.
2. Full transaction rollback on the server — no rows written anywhere.
3. Error toast only. Modal returns to normal for retry.

**Close-session path:** unchanged from PRD-064 (interlock remains in force).

**Move-player path:** unchanged from today (governed by ADR-049 R2; not in PRD-065 scope).

---

## 8. Dependencies & Risks

### 8.1 Dependencies

- **PRD-064 landed in production** (or on staging with the commit-barrier and bridge tests green). This PRD is its successor; its fixes must remain in force during the rollout window. If PRD-064 is rolled back, PRD-065 remains safe to ship but loses its defense-in-depth.
- **SRM v4.12.0 amendment authored** by Phase 0 gate close. Without the command-ownership documentation, WS2 is blocked.
- **ADR-018 inventory location confirmed** (Phase 0 gate) before the new RPC merges.
- **Type regeneration pipeline:** `npm run db:types-local` must succeed against the new migration.
- **No blocking dependency on ADR-050.** Chips-taken is out of scope; this PRD does not carry chips-taken.
- **No blocking dependency on move-player or close-session refactors.** ADR-049 R2/R4 are conditional triggers, not prerequisites.

### 8.2 Risks

- **R-1 (Medium): Packaging decision slips.** If Phase 0 gate cannot converge on (a) vs (b) vs (c), WS2–WS6 are blocked. Mitigation: the PRD recommends (a) with written rationale; Phase 0 gate is time-boxed (propose: 3 engineering days). Escalation path: if the gate fails to converge in the box, the PRD author escalates to the Lead Architect for a forcing-function decision.
- **R-2 (Medium): SRM amendment language requires broader review.** Command-ownership-vs-table-ownership is a new documented concept; other context owners (PlayerFinancialService, MTLService) may push back on the phrasing. Mitigation: amendment draft is circulated at Phase 0 gate, not at merge; objections surface early.
- **R-3 (Low): RPC signature drift between migration author and route handler.** Mitigation: `npm run db:types-local` runs immediately post-migration; the DTO derives from generated types; the route handler typechecks against the DTO. A CI gate catches drift before merge.
- **R-4 (Low): Idempotency-key contract divergence from `rpc_create_financial_txn`.** Mitigation: reuse the exact idempotency-key shape (`fin:*`) and document the reuse in the RPC comment.
- **R-5 (Low): E2E flake.** Single-network-call assertions are tighter than two-call; any racey test fixture may false-fail. Mitigation: run E2E three times in CI before merge; investigate any flake before it becomes endemic.
- **R-6 (Medium): Over-engineering creep.** Packaging (b)'s coordinator-service temptation may accumulate speculative interfaces. Mitigation: over-engineering guardrail explicitly cited in §5.2 NFR-6; Phase 0 gate requires written justification for any coordinator context introduction against guardrail text.
- **R-7 (Low): PATCH `/average-bet` regression.** Retiring the PATCH call from the save-with-buyin path could accidentally retire it elsewhere if the refactor is too aggressive. Mitigation: surgical edit to `use-save-with-buyin.ts` only; the PATCH endpoint and other callers remain untouched; the deprecation E2E test targets only the save-with-buyin path.
- **R-8 (Low): Rollback window.** If the new endpoint ships behind a client-side feature flag or a branch with no flag, rollback is either flag-flip (fast) or revert-and-redeploy (slow). Mitigation: choose flag-flip; the RPC and route are additive, so the server side can stay live during a client-side revert.

---

## 9. Definition of Done (DoD)

Binary checkboxes. This PRD is considered **Done** when every one is true.

**Functionality**
- [ ] `useSaveWithBuyIn` issues exactly one write network call per save invocation (verified by Playwright network-trace assertion).
- [ ] The single call lands `rating_slip.average_bet`, `player_financial_transaction`, and derived `mtl_entry` atomically, or lands none of them.
- [ ] Threshold projection is consumed from the server response, not from a client-side cumulative.
- [ ] The PATCH `/average-bet` call is no longer present in the save-with-buyin code path (grep + E2E network-absence test).

**Data & Integrity**
- [ ] Idempotency-key repeats (`fin:*`) return the same result without duplicate rows in any of the three tables.
- [ ] ADR-024 G1–G3 guard violations produce full rollback across all three tables.
- [ ] No orphaned `rating_slip.average_bet` updates without a corresponding `player_financial_transaction` (the pre-refactor failure mode is structurally impossible).

**Security & Access**
- [ ] New RPC (if packaging (a)) registers in ADR-018 inventory with `SET search_path = ''`.
- [ ] `set_rls_context_from_staff()` is called at RPC entry; no spoofable parameters are introduced.
- [ ] ADR-030 write-path session-var enforcement preserved (all writes share one `SET LOCAL` scope).
- [ ] ADR-040 identity attribution preserved (Category A JWT-derived; no user-supplied actor).

**Testing**
- [ ] WS5 integration tests (happy, sub-threshold, context-guard, bridge-contract) pass in CI.
- [ ] WS5 E2E tests (single-call assertion, PATCH-absence, PRD-064 commit-barrier still green) pass in CI.
- [ ] PRD-064's integration/E2E suite passes unchanged on the new path (regression guard).
- [ ] `e2e/repro-mtl-glitch.spec.ts` is updated and remains green.

**Operational Readiness**
- [ ] Rollback path documented and validated in staging, including the condition under which rollback remains client-dominant (endpoint remains feature-flagged or single-caller during rollout).
- [ ] Structured logs at route-handler enter/success/error with `rating_slip_id`, `fin_txn_id`, `mtl_entry_id`.
- [ ] `npm run db:types-local` executed post-migration; types regenerated and committed.
- [ ] CI `search_path = ''` pre-commit hook green on the new migration.

**Documentation & Governance**
- [ ] SRM v4.12.0 amendment landed documenting command-ownership-vs-table-ownership, citing ADR-049.
- [ ] ADR-018 inventory updated with the new RPC's entry.
- [ ] OpenAPI spec updated with the new path and DTOs.
- [ ] Over-engineering guardrail compliance note filed at merge — no abstraction beyond the named contract.
- [ ] INV-MTL-BRIDGE-ATOMICITY (PRD-064 §6) re-cited and its route-handler binding updated to the new endpoint.
- [ ] This PRD linked from `docs/issues/mtl-rating-slip-glitch/` index and from ADR-049 §Related Documents.

**Surface Governance** (this PRD does not introduce a new UI surface; the modal is reused.)
- [ ] N/A — no new UI surface. Confirmed by review.

**Explicit non-DoD (for the record)**
- [ ] Move-player refactor, close-session refactor, chips-taken destination, and PATCH `/average-bet` removal for non-buy-in callers are **not** prerequisites for closing this PRD. Each remains governed by its own artifact (ADR-049 R2/R4, ADR-050).

---

## 10. Related Documents

### 10.1 Architectural Decisions

- **ADR-049** (`../80-adrs/ADR-049-operator-action-atomicity-boundary.md`) — Direction-of-record. This PRD implements Option 1 for the save-with-buyin surface; packaging decision §6.
- **ADR-015** — Connection pooling / session-variable pattern. Preserved.
- **ADR-018** — SECURITY DEFINER governance. New RPC registers.
- **ADR-024** — Authoritative context derivation. Preserved.
- **ADR-030** — Auth pipeline hardening. Write-path session-var enforcement preserved.
- **ADR-031** — Cents convention. RPC accepts cents.
- **ADR-040** — Identity Provenance Rule. Category A JWT-derived preserved.

### 10.2 Parallel and Predecessor PRDs

- **PRD-064** (`PRD-064-mtl-buyin-glitch-containment-v0.md`) — Predecessor containment slice. Remains in force as defense-in-depth during and after PRD-065 rollout. PRD-065 is its durable architectural successor, per ADR-049 Decision.

### 10.3 Architecture and SRM

- **SRM v4.11.0 → v4.12.0 amendment** — `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — command-ownership concept documented at Phase 0 gate.
- **SLAD** — `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md` — Route Handler + `ServiceHttpResult` pattern.

### 10.4 API / Data

- `types/database.types.ts` — DTO derivation source.
- OpenAPI spec (`docs/25-api-data/` path of record) — updated with `POST /api/v1/rating-slips/:id/save-with-buyin`.

### 10.5 Security

- `docs/30-security/SEC-001-rls-policy-matrix.md` — RLS posture unchanged.
- `docs/30-security/SEC-002-casino-scoped-security-model.md` — Casino-scoped write preserved.
- ADR-018 inventory path of record — new RPC entry.

### 10.6 Quality

- `docs/40-quality/` — integration and E2E gates.
- `e2e/repro-mtl-glitch.spec.ts` — updated to assert single-call shape.

### 10.7 Governance

- `docs/70-governance/OVER_ENGINEERING_GUARDRAIL.md` — explicitly cited in §5.2 NFR-6 and §8.2 R-6.
- PRD-STD-001 — This PRD's shape.

### 10.8 SDLC Taxonomy Cross-References

| Taxonomy Category | Where Read | Purpose |
|---|---|---|
| **V&S** | `docs/00-vision/` compliance-posture threads | Why the durable fix matters beyond containment. |
| **ARCH** | SRM v4.12.0 amendment, ADR-049, SLAD | Command-ownership concept, packaging record, handler pattern. |
| **API/DATA** | `types/database.types.ts`, OpenAPI spec | New endpoint and DTO shape. |
| **SEC/RBAC** | ADR-018/024/030/040 | Governance preserved. |
| **DEL/QA** | WS5 integration + E2E | Bridge contract assertable. |
| **OPS/SRE** | WS6 logs + rollback | Observability and safe revert. |
| **ADR** | ADR-049 | Direction and packaging gate. |
| **GOV** | Over-engineering guardrail | Scope discipline. |

### 10.9 Incident Lineage

- `docs/issues/mtl-rating-slip-glitch/RATING-MTL-ISSUE.md` — Phase 1 investigation.
- `docs/issues/mtl-rating-slip-glitch/hardening-direction-audit.md` — P0/P1 classification.
- `docs/issues/mtl-rating-slip-glitch/arch-flaw.md` — Five architectural smells; inputs to ADR-049.
- `e2e/repro-mtl-glitch.spec.ts` — Playwright repro; becomes a single-call regression guard post-PRD-065.

### 10.10 Non-Blocking Related Artifacts

- Prospective **ADR-050** — Chips-taken ledger destination and MTL semantic bridge. Cited; not a dependency.
- ADR-049 revisit triggers **R2** (move-player / close-session) and **R4** (fourth composite surface) — conditional future PRDs that may extend or re-package PRD-065's outcome.

---

## 11. Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v0 | 2026-04-16 | Lead Architect | Initial draft — durable architectural successor to PRD-064, implementing ADR-049 Option 1 for the save-with-buyin surface. Phase 0 packaging gate, SRM v4.12.0 amendment, new RPC + route + hook refactor, integration and E2E coverage, PATCH `/average-bet` removal from save-with-buyin path. Move-player and close-session deferred to ADR-049 R2/R4. Chips-taken deferred to ADR-050. |
