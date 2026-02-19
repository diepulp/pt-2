# ADR-035 Expert Review Synthesis

**Date:** 2026-02-18
**Verdict:** Unanimous APPROVE WITH CHANGES (4/4 experts)

---

## Panel Composition

| Expert | Focus | Verdict |
|--------|-------|---------|
| Lead Architect | ADR format, cross-references, invariants, architectural completeness | APPROVE WITH CHANGES |
| Security / Auth | Cross-session leakage, multi-tenancy, race conditions, auth path coverage | APPROVE WITH CHANGES |
| Frontend State | Zustand patterns, INITIAL_STATE drift, App Router edge cases, orchestrator design | APPROVE WITH CHANGES |
| QA / Testing | Contract test design, regression prevention, coverage gaps, E2E recommendations | APPROVE WITH CHANGES |

---

## Consensus Items (independently identified by 2+ experts)

### 1. Assign ADR-035 (all 4)
Next available number after ADR-034. All `ADR-0XX` references updated.

### 2. Add formal INV-035-N invariants (Architect + Security)
The project convention (ADR-030, ADR-032) requires numbered security invariants. Five invariants defined: INV-035-1 through INV-035-5.

### 3. Store registration enforcement as D5 (Architect + QA)
Both independently identified this as the single most important structural gap. Without it, the contract decays silently. Added as Decision D5 with a contract test store-inventory completeness assertion.

### 4. Handle `onAuthStateChange` SIGNED_OUT (Security + Frontend)
Both independently flagged that `use-auth.ts` handles server-side session invalidation (token expiry, admin revocation) but does NOT trigger Zustand reset. Added to D2 and INV-035-2 as a required invocation path.

### 5. `uiStore.modal.data` defensive close (Architect + Security)
The `modal.data` field is typed `unknown` and can hold session-specific payloads. The orchestrator now calls `closeModal()` defensively, even though `uiStore` is app-scoped.

### 6. Type-safe INITIAL_STATE (Frontend + QA)
A developer could add a field to the interface without adding it to INITIAL_STATE. TypeScript wouldn't catch it due to the spread. Solution: type INITIAL_STATE with a helper type that extracts data-only fields. Compile error on omission. Added to INV-035-1.

### 7. Export INITIAL_STATE for test consumption (Frontend + QA)
Tests should assert against the canonical INITIAL_STATE constant, not hand-coded values. Prevents test staleness and makes tests self-maintaining.

### 8. Snapshot-compare in contract tests (Frontend + QA)
Compare full state snapshot (minus action functions) against INITIAL_STATE, not field-by-field enumeration. Self-maintaining when new fields are added.

---

## Individual Expert Contributions (unique findings)

### Lead Architect
- **Required:** References section, Changelog section, Neutral consequences subsection, expanded Alternatives Considered with rejection rationale
- **Recommended:** Forward reference from ADR-003 Section 8 to ADR-035

### Security / Auth
- **Required:** Multi-tenancy boundary concern documented (stale casino_id-scoped UUIDs)
- **Recommended:** Race condition analysis between sign-out steps documented

### Frontend State
- **Required:** `onAuthStateChange` wiring implementation pattern provided
- **Recommended:** `@session-scoped` JSDoc tag convention; devtools action naming; sessionStorage cleanup for lock store
- **Analysis:** Confirmed no blocking App Router edge cases (React 19 compiler, Suspense, parallel routes, streaming SSR)
- **Analysis:** Confirmed orchestrator design (plain sync function > hook > event bus > middleware)

### QA / Testing
- **Required:** `use-sign-out.ts` integration test (currently zero test coverage for the hook)
- **Required:** Store-inventory completeness assertion pattern provided
- **Recommended:** Idempotency test; `lockStore.hasHydrated` preservation assertion; `ratingSlipModalStore.originalState` dirtying scenario; `resetSession` vs `resetNavigation` distinction test
- **Recommended:** E2E test outline for `e2e/workflows/session-reset.spec.ts` (follow-up PR)

---

## Changes Incorporated into Formalized ADR-035

| # | Change | Source | Type |
|---|--------|--------|------|
| 1 | Assign ADR-035 | All | Required |
| 2 | Cross-reference ADR-003, ADR-030, ADR-032 | Architect | Required |
| 3 | Add INV-035-1 through INV-035-5 | Architect + Security | Required |
| 4 | Add References section | Architect | Required |
| 5 | Add Changelog section | Architect | Required |
| 6 | Add Neutral consequences | Architect | Required |
| 7 | Expand Alternatives (4 with rejection rationale) | Architect | Required |
| 8 | Add D5 store registration enforcement | Architect + QA | Required |
| 9 | Handle `onAuthStateChange` SIGNED_OUT | Security + Frontend | Required |
| 10 | `uiStore.modal.data` defensive close | Architect + Security | Required |
| 11 | Type-safe INITIAL_STATE pattern | Frontend + QA | Required |
| 12 | Multi-tenancy scoping in Problem section | Security | Required |
| 13 | Expanded verification with test shapes | QA + Frontend | Required |
| 14 | `use-sign-out.ts` integration test requirement | QA | Required |
| 15 | Export INITIAL_STATE for tests | Frontend + QA | Recommended (adopted) |
| 16 | Snapshot-compare in contract tests | Frontend + QA | Recommended (adopted) |
| 17 | `@session-scoped` JSDoc convention | Frontend | Recommended (adopted) |
| 18 | DevTools action naming convention | Frontend | Recommended (adopted) |
| 19 | E2E test outline (follow-up PR) | QA | Recommended (adopted) |

---

## Items Deferred

| Item | Reason |
|------|--------|
| ADR-003 Section 8 amendment | Out of scope for this ADR; tracked as follow-up |
| sessionStorage cleanup for lock store | `unlock()` writes clean state; cleanup is defensive, not required |
| Full E2E test implementation | Outlined in verification section; implementation in follow-up PR |

---

## Implementation Plan Update

The ZUSTAND-SESSION-RESET-PLAN.md should be updated to reflect these additions:
1. Wire `resetSessionState()` into `onAuthStateChange` SIGNED_OUT handler
2. Add `closeModal()` to orchestrator
3. Use typed `INITIAL_STATE` constants with helper types
4. Export `INITIAL_STATE` constants from store files
5. Add store-inventory completeness assertion to contract test
6. Add `use-sign-out.ts` integration test
7. Add `@session-scoped` JSDoc tags to session-scoped stores
