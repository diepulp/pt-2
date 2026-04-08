---
id: PRD-063
title: Visit Lifecycle Operator Workflow
owner: Lead Architect
status: Draft
affects: [ARCH-SRM-v4.11.0, ADR-024, ADR-030, PRD-057, GAP-EXCL-ENFORCE-001]
created: 2026-04-07
last_review: 2026-04-07
phase: Phase 2 (Visit Management)
pattern: A
http_boundary: true
scaffold_ref: docs/issues/gaps/visit-lifecycle-gap/GAP-VISIT-LIFECYCLE-OPERATOR-WORKFLOW.md
adr_refs: [docs/80-adrs/ADR-024_DECISIONS.md, docs/80-adrs/ADR-030-auth-system-hardening.md]
intake_ref: docs/issues/gaps/visit-lifecycle-gap/FIB-VISIT-LIFECYCLE.md (v0.2)
structured_ref: docs/issues/gaps/visit-lifecycle-gap/FIB-VISIT-LIFECYCLE.structured.json (v1.0.0)
---

# PRD-063 — Visit Lifecycle Operator Workflow

## 1. Overview

- **Owner:** Lead Architect
- **Status:** Draft
- **Intake authority:** FIB-VISIT-LIFECYCLE v0.2 (frozen for downstream design)
- **Summary:** Pit bosses have no way to formally end a patron's visit during a gaming day. The only close paths today are gaming day rollover (automatic, next-day) and exclusion auto-close (safety mechanism) — neither is an intentional operator action. This PRD delivers three cohesive capabilities from the frozen intake: (1) **End Visit** — an operator-attested compound workflow that finalizes all open/paused rating slips through `rpc_close_rating_slip` then closes the visit, (2) **Start From Previous wiring** — connecting the already-built `StartFromPreviousModal` to the production Closed Slips panel so returning patrons can be seated from a closed visit, and (3) **Closed Slips terminology cleanup** — relabeling "Closed Sessions" to "Closed Slips" to reflect the actual slip-level granularity of the panel. The design center is operator-attested visit closure; the other two are adjacent repairs necessary so the closed state is not incoherent.

> **Scope governance:** This PRD does not introduce any capability, outcome, rule, or entity absent from the structured intake (FIB-VISIT-LIFECYCLE.structured.json). Any addition requires an intake amendment per Section K of the intake brief.

---

## 2. Problem & Goals

### 2.1 Problem

*Source: intake `intent.operator_problem`*

When a patron leaves the gaming floor, the pit boss has no way to formally check them out. The visit persists for the entire gaming day — inflating active-player counts, blocking the "Start From Previous" continuation flow (which needs a clean closed visit as its source), and leaving an open-ended compliance record with no operator-attested endpoint.

Separately, clicking a closed slip in the Closed Slips panel opens a read-only rating slip viewer instead of the continuation modal. The operator sees a dead-end where the system promised a workflow. The panel itself compounds confusion by labeling closed rating slips (table segments) as "sessions" (patron visits).

### 2.2 Goals

| Goal | Observable Signal | Traces To |
|------|-------------------|-----------|
| **G1**: Pit boss can formally end a patron's visit from the rating slip modal | End Visit button present and functional on active slip modal; visit transitions to closed state | OUT-1, CAP `end_visit_from_rating_slip_modal` |
| **G2**: Visit closure uses compliant slip-finalization (not raw mutation) | Every slip closed during End Visit goes through `rpc_close_rating_slip` with theo computed from `policy_snapshot` | OUT-2, RULE-1, CAP `finalize_open_slips_for_visit` |
| **G3**: Visit cannot close if slip finalization fails | Visit `ended_at` remains null when any required slip close fails; operator sees actionable error | OUT-3, RULE-2, CAP `close_visit_record` |
| **G4**: Clicking a closed rated slip opens continuation modal | `StartFromPreviousModal` opens with player's eligible recent visits instead of read-only viewer | OUT-6, CAP `open_start_from_previous_modal` |
| **G5**: Closed Slips panel uses slip/segment terminology | Panel title, empty state, row affordance, toasts, and modal copy refer to slips, not sessions | OUT-5, RULE-5, CAP `relabel_closed_slips_surface` |

### 2.3 Non-Goals

*Source: intake `intent.explicit_exclusions` and Section G*

- SeatContextMenu integration — component exists but is not rendered in production UI; separate scope
- Visit-level grouping in the Closed Slips panel — requires new API; relabeling is the pilot fix
- Dedicated table/seat picker for Start From Previous — reuses existing seat-click flow
- Changes to `rpc_close_rating_slip` behavior — called as-is
- Changes to gaming day rollover behavior — stale-slip auto-close unchanged
- Loyalty accrual logic changes beyond calling existing close RPC
- Additional role-based authorization for End Visit (pilot risk acceptance per intake Section G)

---

## 3. Users & Use Cases

- **Primary users:** Pit boss, floor supervisor
- *Source: intake `zachman.who`*

**Top Jobs:**

- As a **pit boss**, I need to formally end a patron's visit when they leave the floor so that the compliance record has an operator-attested endpoint and the seat frees up. *(OUT-1, END-1 through END-6)*
- As a **pit boss**, I need to start a returning patron from a previous closed visit so that their session history is linked and play can resume with a fresh compliance chain. *(OUT-6, OUT-7, SFP-1 through SFP-8)*
- As a **pit boss**, I need the Closed Slips panel to accurately reflect what it shows (individual slip segments, not patron visits) so that I do not confuse table-level records with visit-level records. *(OUT-5, SUP-1)*
- As a **pit boss**, I need confidence that ending a visit properly finalizes all rating slips so that theo computation and audit trails are preserved, not zeroed out by rollover. *(OUT-2, OUT-4)*

---

## 4. Scope & Feature List

### 4.1 In Scope

**End Visit (operator checkout):**
*Source: capabilities `end_visit_from_rating_slip_modal`, `finalize_open_slips_for_visit`, `close_visit_record`*

- FR-1: "End Visit" action in the active rating slip modal *(OUT-1, END-2)*
- FR-2: Confirmation dialog before executing close workflow *(OUT-1, END-3, RULE-7)*
- FR-3: Sequential `rpc_close_rating_slip` calls for all open/paused slips on the visit *(OUT-2, OUT-4, RULE-1, END-4)*
- FR-4: Visit close via `PATCH /api/v1/visits/[visitId]/close` only after all slip finalization succeeds *(OUT-3, RULE-2, END-5)*
- FR-5: Dashboard refresh — seat freed, closed slips appear, toast confirms outcome *(END-6)*
- FR-6: Failure messaging that distinguishes: (a) all slips finalized and visit closed (success), (b) one or more slip finalizations failed and visit remains open (blocked — operator must resolve), and (c) continuation unavailable because the source visit's close chain is incomplete. Note: per RULE-2 the visit **cannot** close when slip finalization fails, so "visit closed + slip failed" is not a valid state. *(RULE-2, `lifecycle_events.visit_close_blocked_due_to_slip_finalization_failure`)*

**Start From Previous (continuation wiring):**
*Source: capabilities `open_start_from_previous_modal`, `continue_visit_from_history`, `enforce_continuation_eligibility`*

- FR-7: Closed rated slip click in the Closed Slips panel opens `StartFromPreviousModal` (not read-only viewer) *(OUT-6, RULE-3, SFP-1 through SFP-3)*
- FR-8: Modal displays eligible recent closed visits with financial summary *(OUT-6, SFP-3, SFP-4)*
- FR-9: Operator selects visit → pending continuation context stored → toast prompts seat selection *(SFP-4, SFP-5, RULE-7)*
- FR-10: Empty seat click completes `POST /api/v1/visits/start-from-previous` → new visit + new slip created *(OUT-7, RULE-4, SFP-6, SFP-7)*
- FR-11: New slip has its own `policy_snapshot` from destination table — independent of source visit *(OUT-7, SFP-7)*
- FR-12: Exclusion defense-in-depth check in `startFromPrevious` service before visit creation *(OUT-8, `dependencies.required_existing[0]`)*
- FR-13: Explicit continuation eligibility rules applied to the visit list in the modal *(OUT-8, RULE-6, SFP-3, SFP-4)*

**Closed Slips terminology cleanup:**
*Source: capability `relabel_closed_slips_surface`*

- FR-14: Panel title renamed from "Closed Sessions" to "Closed Slips" *(OUT-5, RULE-5, SUP-1)*
- FR-15: All panel copy (empty state, row affordance text, toasts, modal copy) uses slip/segment language for rows and visit/session language for continuation candidates *(OUT-5, RULE-5)*

### 4.2 Out of Scope

*Source: intake Section G explicit exclusions + Section H rejected ideas*

- SeatContextMenu integration (separate scope; `SeatContextMenu` not rendered in production)
- Visit-level grouping in the Closed Slips panel (requires new API/RPC)
- Dedicated table/seat picker for Start From Previous
- Modifications to `rpc_close_rating_slip` behavior
- Gaming day rollover behavior changes
- Loyalty accrual logic changes
- Role-based authorization for End Visit beyond current modal-level posture

---

## 5. Requirements

### 5.1 Functional Requirements

**End Visit workflow** *(RULE-1, RULE-2)*

- REQ-1: End Visit must close all open/paused rating slips through `rpc_close_rating_slip` — not raw status mutation. Each closed slip must have `computed_theo_cents` derived from its `policy_snapshot`. *(RULE-1, OUT-2, invariant: "Theo for operator-closed slips is computed from policy_snapshot rather than forced to zero")*
- REQ-2: Visit `ended_at` must not be set if any required slip-finalization step fails. *(RULE-2, OUT-3, invariant: "No orphaned open slips remain after successful operator-initiated visit close")*
- REQ-3: The `chk_closed_slip_has_theo` database constraint must be satisfied for every slip closed during End Visit. *(intake Section F, bullet 4)*
- REQ-4: Operator-facing messaging must distinguish three states: (a) success — all slips finalized and visit closed, (b) blocked — slip finalization failed and visit remains open (operator must resolve before retrying), (c) continuation unavailable — source visit's close chain is incomplete. Per RULE-2 the visit cannot reach "closed" while any slip finalization is outstanding, so the messaging model has exactly two terminal outcomes (success or blocked) plus a downstream consequence (continuation unavailable). *(intake Section F, bullet 13; RULE-2)*

**Start From Previous wiring** *(RULE-3, RULE-4, RULE-6)*

- REQ-5: Closed slip rows in the panel are context entry points only — they must never be treated as the object being reopened or resumed. *(RULE-3)*
- REQ-6: Start From Previous creates a new visit and a new rating slip. It never reopens a closed slip or visit. *(RULE-4, invariant: "Closed slips remain immutable and are not reopened")*
- REQ-7: The clicked closed slip resolves player/context, then the system fetches eligible recent visits via `GET /api/v1/players/[playerId]/recent-sessions`. *(SFP-2, SFP-3)*
- REQ-8: Continuation eligibility rules must be explicit. *(RULE-6)*

**Terminology** *(RULE-5)*

- REQ-9: All user-facing copy must use slip/segment language for panel rows and visit/session language for continuation candidates and resumed history. *(RULE-5)*

### 5.2 Non-Functional Requirements

- NFR-1: End Visit workflow latency must be acceptable for mid-shift operator use (existing RPC performance baseline applies)
- NFR-2: No new UI surfaces or components introduced — existing modal, panel, and toast patterns reused *(RULE-7)*

> Architecture details: See SRM v4.11.0, SLAD. Schema: `types/database.types.ts`. Security: ADR-024 (context derivation), ADR-030 (auth hardening).

---

## 6. UX / Flow Overview

**Flow 1: End Visit (operator checkout)**
*Source: containment loop END-1 through END-6*

1. Pit boss clicks occupied seat → active rating slip modal opens *(END-1)*
2. Pit boss clicks "End Visit" button in modal *(END-2)*
3. System shows confirmation: "End [Player Name]'s visit? This will close their active slip and check them out." *(END-3)*
4. On confirm → system calls `rpc_close_rating_slip` for each open/paused slip on the visit *(END-4)*
5. If all slip closes succeed → system calls `PATCH /api/v1/visits/[visitId]/close` *(END-5)*
6. Seat frees, closed slips appear in Closed Slips panel, toast confirms checkout *(END-6)*
7. If any slip close fails → visit remains open, operator sees error toast with actionable message *(RULE-2)*

**Flow 2: Start From Previous (continuation)**
*Source: containment loop SFP-1 through SFP-8*

1. Pit boss opens Closed Slips panel, clicks a closed rated slip *(SFP-1)*
2. System resolves player context from the slip (does NOT open read-only viewer) *(SFP-2)*
3. System fetches recent visit-level sessions → `StartFromPreviousModal` opens *(SFP-3)*
4. Pit boss selects closed visit to continue → pending continuation context stored *(SFP-4)*
5. Toast: "Select an empty seat to place [Player Name]" *(SFP-5)*
6. Pit boss clicks empty seat on destination table *(SFP-6)*
7. System calls `POST /api/v1/visits/start-from-previous` → new visit + new slip *(SFP-7)*
8. Fresh rating slip modal opens — patron is back in play *(SFP-8)*

---

## 7. Dependencies & Risks

### 7.1 Dependencies

*Source: intake `dependencies.required_existing`*

| Dependency | Status | Notes |
|------------|--------|-------|
| GAP-EXCL-ENFORCE-001 Layer 1 (exclusion checks in `rpc_start_rating_slip`) | Delivered | Primary gate for continuation |
| `rpc_close_rating_slip` compliant close behavior | Exists | Called as-is; no modification |
| `PATCH /api/v1/visits/[visitId]/close` | Exists | Route functional |
| `POST /api/v1/visits/start-from-previous` | Exists | Route + service + schema functional |
| `GET /api/v1/players/[playerId]/recent-sessions` | Exists | Returns visit-level aggregates |
| `StartFromPreviousModal` + `StartFromPreviousPanel` | Exists | Built; wired to review page only |
| `useCloseVisit()` hook | Exists | Functional; unused in production |
| Occupied-seat click → rating slip modal | Exists | Production flow |

### 7.2 Risks & Open Questions

**Open questions preserved from intake** *(governance.open_questions_allowed_at_scaffold)*:

> **OQ-1:** Whether minimum rating inputs, including `average_bet` where applicable, must be present before End Visit may finalize a slip — MVP may not introduce a new bespoke component, but the downstream design must still resolve the rule explicitly using an existing modal/confirmation/error pattern ("use whatever value is already there" is not, by itself, a compliance rule).
>
> *Constraint: MVP must not add new UI components for this; resolution must use existing patterns (toast dismiss, escape key).*

> **OQ-2:** Whether the pending-continuation toast should expose cancel behavior or timeout — constraint: MVP must not add new UI components; resolution must use existing patterns.

> **OQ-3:** Whether continuation eligibility can remain within the current `RecentSessionsDTO` shape or requires a schema addition for closure reason or similar state (to distinguish operator-closed from rollover-closed from exclusion-closed visits).

**Risks:**

- **R1: Sequential slip close without bulk RPC** — The MVP orchestrates closure through sequential `rpc_close_rating_slip` calls without a bulk-close RPC. This is acceptable per intake assumption validation **only if** the implementation defines safe failure semantics and does not allow the visit to land in a partially finalized compliance state. *(intake `dependencies.assumptions[1]`)*
- **R2: `RecentSessionsDTO` shape may be insufficient** — If continuation eligibility requires distinguishing closure reasons, the route and/or underlying RPC will need a schema addition not yet delivered. *(intake `dependencies.missing_dependencies[0]`)*
- **R3: Slip close preconditions unknown** — If a required rating field is missing at close time, the workflow must define behavior using existing patterns. Tied to OQ-1. *(intake `dependencies.assumptions[0]`)*

---

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Pit boss can click "End Visit" in the active rating slip modal and close a visit with all its open/paused slips *(OUT-1, OUT-2)*
- [ ] Visit remains open if any slip finalization fails; operator sees distinguishing error message *(OUT-3, RULE-2)*
- [ ] No orphaned open slips remain after successful End Visit *(OUT-4, invariant)*
- [ ] Clicking a closed rated slip in the Closed Slips panel opens `StartFromPreviousModal` *(OUT-6)*
- [ ] Start From Previous creates a new visit + new slip at destination; never reopens closed objects *(OUT-7, RULE-4)*
- [ ] Continuation eligibility rules are explicit and applied to the modal visit list *(OUT-8, RULE-6)*
- [ ] Closed Slips panel title, empty state, row text, and toasts use slip/segment terminology *(OUT-5, RULE-5)*

**Data & Integrity**
- [ ] `computed_theo_cents` is populated from `policy_snapshot` for every operator-closed slip (not forced to 0) *(RULE-1)*
- [ ] `chk_closed_slip_has_theo` constraint satisfied for all End Visit slip closures *(REQ-3)*
- [ ] New slip from Start From Previous has independent `policy_snapshot` from destination table *(FR-11)*

**Security & Access**
- [ ] `startFromPrevious` service checks exclusion status before creating a visit *(OUT-8, FR-12)*
- [ ] Pilot risk acceptance: End Visit uses current modal-level authorization (no new role gate) *(RULE-7)*

**Testing**
- [ ] At least one integration test for End Visit happy path (multi-slip close → visit close)
- [ ] At least one integration test for End Visit failure path (slip close fails → visit stays open)
- [ ] At least one integration test for Start From Previous happy path
- [ ] At least one E2E test for End Visit flow from modal through dashboard refresh

**Operational Readiness**
- [ ] Audit log entries written per slip closed during End Visit (existing RPC behavior)
- [ ] Toast messages distinguish success (visit closed) and blocked (slip finalization failed, visit remains open)

**Documentation**
- [ ] Known limitations documented (sequential close without bulk RPC, OQ-1/2/3 resolutions)

---

## 9. Related Documents

- **Intake Brief:** `docs/issues/gaps/visit-lifecycle-gap/FIB-VISIT-LIFECYCLE.md` (v0.2, frozen)
- **Structured Intake:** `docs/issues/gaps/visit-lifecycle-gap/FIB-VISIT-LIFECYCLE.structured.json` (v1.0.0)
- **Architecture / SRM:** `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (v4.11.0)
- **Architecture / SLAD:** `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`
- **Security / RLS:** `docs/30-security/SEC-001-rls-policy-matrix.md`, ADR-024, ADR-030
- **Schema / Types:** `types/database.types.ts`
- **Prerequisite:** GAP-EXCL-ENFORCE-001 (exclusion enforcement), PRD-057 (session-gated guards)
- **Existing PRDs:** PRD-003 (player-visit-management, archived), PRD-017 (start-from-previous, archived)

---

## Appendix A: Traceability Matrix

> Every functional requirement and DoD item traces to the structured intake. This matrix is the compliance audit surface.

### A.1 Outcome Coverage

| Outcome ID | Statement | Covered By |
|------------|-----------|------------|
| OUT-1 | Operator can end a patron visit from the rating slip modal | G1, FR-1, FR-2, DoD-1 |
| OUT-2 | Operator-initiated close uses compliant slip-finalization | G2, FR-3, REQ-1, DoD-1, DoD-8 |
| OUT-3 | Visit close cannot succeed with incomplete required slip finalization | G3, FR-4, FR-6, REQ-2, DoD-2 |
| OUT-4 | No orphaned open slips remain after successful End Visit | FR-3, REQ-1, DoD-3 |
| OUT-5 | Closed-surface terminology reflects slips rather than sessions | G5, FR-14, FR-15, REQ-9, DoD-7 |
| OUT-6 | Closed rated slip click opens StartFromPreviousModal | G4, FR-7, FR-8, DoD-4 |
| OUT-7 | Continuation creates a new visit and a new rating slip | FR-10, FR-11, REQ-6, DoD-5 |
| OUT-8 | Continuation eligibility is explicit and compliance-safe | FR-12, FR-13, REQ-8, DoD-6 |

### A.2 Rule Coverage

| Rule ID | Statement | Covered By |
|---------|-----------|------------|
| RULE-1 | Close must use `rpc_close_rating_slip`, not raw mutation | G2, FR-3, REQ-1, DoD-8 |
| RULE-2 | Visit must not be marked closed if slip finalization fails | G3, FR-4, FR-6, REQ-2, DoD-2 |
| RULE-3 | Closed slip rows are context entry points only | FR-7, REQ-5, REQ-7 |
| RULE-4 | Start From Previous creates new objects, never reopens | FR-10, REQ-6, DoD-5 |
| RULE-5 | Copy uses slip/segment for rows, visit/session for continuation | G5, FR-14, FR-15, REQ-9, DoD-7 |
| RULE-6 | Continuation eligibility rules must be explicit | FR-13, REQ-8, DoD-6 |
| RULE-7 | Pilot does not add new UI surfaces or redesign auth posture | NFR-2, FR-2, FR-9, DoD-12 |

### A.3 Capability Coverage

| Capability | Covered By |
|------------|------------|
| `end_visit_from_rating_slip_modal` | FR-1, FR-2, FR-5, FR-6 |
| `finalize_open_slips_for_visit` | FR-3, REQ-1 |
| `close_visit_record` | FR-4, REQ-2 |
| `relabel_closed_slips_surface` | FR-14, FR-15, REQ-9 |
| `open_start_from_previous_modal` | FR-7, FR-8 |
| `continue_visit_from_history` | FR-10, FR-11 |
| `enforce_continuation_eligibility` | FR-12, FR-13, REQ-8 |

### A.4 Open Questions Status

| ID | Question (verbatim from intake) | PRD Status |
|----|-------------------------------|------------|
| OQ-1 | Whether minimum rating inputs must be present before End Visit may finalize a slip | **OPEN** — preserved in Section 7.2, linked to R3 |
| OQ-2 | Whether the pending-continuation toast should expose cancel behavior or timeout | **OPEN** — preserved in Section 7.2 |
| OQ-3 | Whether continuation eligibility can remain within current RecentSessionsDTO shape or requires schema addition | **OPEN** — preserved in Section 7.2, linked to R2 |

> **Governance note:** No open question has been resolved by this PRD. Resolution requires explicit decision documentation in the EXEC-SPEC or a subsequent amendment.

---

## Appendix B: Existing Plumbing Inventory

> Verified against current codebase state (2026-04-07). All items exist and are functional.

| Component | Path | Production Status |
|-----------|------|-------------------|
| `useCloseVisit()` hook | `hooks/visit/use-visit-mutations.ts` | Functional, unused in production UI |
| Visit close route | `app/api/v1/visits/[visitId]/close/route.ts` | Wired, functional |
| Start From Previous route | `app/api/v1/visits/start-from-previous/route.ts` | Wired, functional |
| Recent sessions route | `app/api/v1/players/[playerId]/recent-sessions/route.ts` | Wired, functional |
| `StartFromPreviousModal` | `components/player-sessions/start-from-previous-modal.tsx` | Built, review page only |
| `StartFromPreviousPanel` | `components/player-sessions/start-from-previous.tsx` | Built, review page only |
| `rpc_close_rating_slip` service call | `services/rating-slip/crud.ts` | Wired, production use |
| `ClosedSessionsPanel` | `components/pit-panels/closed-sessions-panel.tsx` | Active panel in pit dashboard |
| Rating slip modal | `components/modals/rating-slip/rating-slip-modal.tsx` | Active, opens on seat click |
| `useCloseWithFinancial` | `hooks/rating-slip-modal/use-close-with-financial.ts` | Active, wraps RPC close |

---

## Appendix C: Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-04-07 | Lead Architect | Initial draft from FIB-VISIT-LIFECYCLE v0.2 intake |
| 0.1.1 | 2026-04-07 | Lead Architect | Patch: FR-6/REQ-4 failure messaging aligned with RULE-2 — eliminated impossible "visit closed + slip failed" state from messaging model; clarified two terminal outcomes (success, blocked) plus downstream consequence (continuation unavailable) |
