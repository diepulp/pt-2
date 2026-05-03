---
# EXECUTION-SPEC Frontmatter
id: EXEC-066a
title: "Silent-Guard Foundation (PRD-064 Phase H — Pilot Slice)"
prd: PRD-064
prd_title: "MTL Buy-In Glitch Containment (Operator-Visible Atomicity)"
parent_phase: "Phase H — Write-Path Hardening Pass 2 (Slice 1 of 2)"
owner: Lead Architect
status: Shelved (v0.3.1) — not the problem the user was trying to solve. Drift surfaced during 2026-04-17 reset. Reactivate only if a non-BDD7B21D silent-guard trip is reported in production.
created: 2026-04-17
last_review: 2026-04-17
invariant: INV-MTL-BRIDGE-ATOMICITY (Corollary: operator-visible atomicity)
seed_issue: ISSUE-BDD7B21D
pilot_bound: true
continuation: EXEC-066b
affects:
  - PRD-064
  - ADR-049

workstreams:
  WS1:
    name: "Canonical Guard Pattern + Lint Rule + Production Telemetry"
    description: >
      Introduce a single shared utility — `failSilentGuard()` — at
      `lib/errors/fail-silent-guard.ts`. Utility emits a toast
      (error-class, id-keyed), an inline non-dismissible banner where
      the surface supports one (PRD-064 pattern), a dev-only `logError`
      call via existing `ErrorContext` shape, AND a production-class
      Sentry breadcrumb so EXEC-066b's closure criteria can be evaluated
      from telemetry (the existing `logError` is dev-only per
      `lib/errors/error-utils.ts:188`; closure requires production
      observability).

      Add an ESLint rule to `.eslint-rules/` under plugin namespace
      `guard-rules` that forbids `if (!x) return;` / `return null;`
      inside handlers named `handle*` located under
      `components/**/*.tsx`, excluding test files per the
      `temporal-rules` precedent at `eslint.config.mjs:253-260`.
      Suppression uses native `// eslint-disable-next-line
      guard-rules/no-silent-handler-guard` comments. Rule ships at
      `error` severity from day one; the 6 sites deferred to EXEC-066b
      are individually annotated with the disable comment + a
      `// TODO(EXEC-066b): remediate` marker so CI stays green without
      weakening the rule.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    outputs:
      - lib/errors/fail-silent-guard.ts
      - lib/errors/__tests__/fail-silent-guard.test.ts
      - .eslint-rules/no-silent-handler-guard.js
      - .eslint-rules/__tests__/no-silent-handler-guard.test.js
      - eslint.config.mjs  # register plugin 'guard-rules' + rule
    gate: type-check
    estimated_complexity: medium

  WS2a:
    name: "P0.1 — pit-panels `handleSave` (BDD7B21D site only)"
    description: >
      Replace the silent early-return in `handleSave` at
      `components/pit-panels/pit-panels-client.tsx:308-315` with
      `failSilentGuard(severity='financial', onBanner=setSaveErrorBanner)`.
      Two distinct `reason` codes: `MISSING_SLIP_OR_MODAL_DATA` and
      `MISSING_STAFF_CONTEXT`. Wire `setSaveErrorBanner(null)` at the
      top of the mutation's `try` block (around L317, immediately before
      `.mutateAsync(...)`).

      `handleCloseSession` and `handleMovePlayer` on the same surface
      are NOT remediated in 066a — they carry the silent guard with
      `eslint-disable-next-line` + `TODO(EXEC-066b)` annotations until
      telemetry justifies remediation.

      Do NOT collapse or refactor handler shape (ADR-049 / PRD-065
      reserves architectural collapse).
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - components/pit-panels/pit-panels-client.tsx
      - components/pit-panels/__tests__/silent-guard-handlesave.test.tsx
    gate: test-pass
    estimated_complexity: low

  WS3a:
    name: "Deferred-site pragma annotations"
    description: >
      Apply `// eslint-disable-next-line guard-rules/no-silent-handler-guard`
      + `// TODO(EXEC-066b): remediate pending telemetry` pragma pair to
      each of the 6 deferred sites (see §2.2) AND to the 2 demoted
      unreachable-guard sites (reward-drawer, acknowledge-alert-dialog —
      reachability justification, not TODO). This is the only way
      WS1's `error`-severity rule can ship without CI regressions.
    executor: frontend-design-pt-2
    executor_type: skill
    depends_on: [WS1]
    outputs:
      - components/pit-panels/pit-panels-client.tsx  # 2 TODO sites
      - components/modals/rating-slip/rating-slip-modal.tsx  # 2 TODO sites
      - components/table/session-action-buttons.tsx  # 1 TODO site
      - components/admin/threshold-settings-form.tsx  # 1 TODO site
      - components/loyalty/issue-reward-drawer.tsx  # reachability pragma (not TODO)
      - components/admin-alerts/acknowledge-alert-dialog.tsx  # reachability pragma (not TODO)
    gate: lint
    estimated_complexity: low

execution_phases:
  - name: "Phase 1 — Foundation (Utility + Lint Rule + Telemetry)"
    parallel: [WS1]
    gates: [type-check]

  - name: "Phase 2 — BDD7B21D remediation + deferred-site pragmas (Parallel)"
    parallel: [WS2a, WS3a]
    gates: [type-check, test-pass, lint]

gates:
  type-check:
    command: "npm run type-check"
    success_criteria: "Exit code 0, no type errors"
  lint:
    command: "npm run lint"
    success_criteria: "Exit code 0, max-warnings=0. Rule `guard-rules/no-silent-handler-guard` at severity `error` with all deferred/demoted sites pragma-annotated."
  test-pass:
    command: "npm run test -- components/pit-panels/__tests__/silent-guard-handlesave.test.tsx lib/errors/__tests__/fail-silent-guard.test.ts .eslint-rules/__tests__/no-silent-handler-guard.test.js"
    success_criteria: "All three test files pass"

external_dependencies:
  - PRD-064 merged — verified at commit `3839ba9b` (2026-04-16).
  - PRD-065 sequencing — WS2a touches `pit-panels-client.tsx:handleSave`,
    the same function PRD-065 (ADR-049 execution) will restructure.
    EXEC-066a MUST ship before PRD-065 enters implementation, OR PRD-065
    MUST consume `failSilentGuard` at the new server-boundary handler
    site. Coordinate at PRD-065 status change from Draft.
  - Sentry wiring — `failSilentGuard`'s production breadcrumb path
    depends on the Sentry SDK already being initialized (per
    EXEC-063-sentry-error-tracking). If Sentry is not yet live at
    066a ship time, emit via `console.warn` in production as a stopgap
    and reconcile in 066b.

---

# EXEC-066a — Silent-Guard Foundation (Pilot Slice)

## 1. Executive Summary

PRD-064 Phase 1 closed the MTL buy-in glitch via commit-barrier UX and
bridge-integration tests, and §2.3 deferred "removing the silent
`modalData` guard in `handleSave`" to a later hardening pass.
ISSUE-BDD7B21D opened that pass. Investigation found 7 reachable
write-path handler guards plus 2 unreachable-guard annotations across
6 files exhibiting the same silent-guard pattern.

**This slice (066a) is pilot-bound.** It ships the foundation (shared
utility + lint regression gate + production telemetry) plus the one
demonstrated-failure site (BDD7B21D itself: `handleSave` in
`pit-panels-client.tsx`). The other 6 reachable sites receive pragma
annotations with `TODO(EXEC-066b)` markers, deferring remediation to
a telemetry-gated follow-on spec (EXEC-066b).

**Operational urgency:** low-medium. BDD7B21D is operator-recoverable
(operator clicks Save, nothing happens, operator clicks again; no
data corruption, no compliance lie). PRD-064 was the urgent slice;
this is the follow-on.

**Rationale for telemetry gating (not "post-pilot"):** if pilot
telemetry shows zero guard trips on the deferred sites,
`EXEC-066b` may be killed or reduced. "Post-pilot" is a timing label;
telemetry-gated closure is a decision rule. See EXEC-066b §12
Closure Criteria.

---

## 2. Problem Statement

### 2.1 Failure class

A handler named `handle*` attached to an operator-initiated write
action guards its inputs with `if (!x) return;` or `return null;` and
produces no operator-visible signal when the guard trips. Symptoms:

- No toast, no banner, no form-state change.
- The operator perceives the click as absorbed.
- No row is written to the backing table.
- Downstream surfaces render nothing, contradicting the operator's
  mental model of "I clicked Save and nothing complained."

Same *success-like silence* class PRD-064 named in its
hardening-direction audit. PRD-064 closed the in-flight-abort race;
066a closes the one demonstrated pre-call guard race (BDD7B21D).

### 2.2 Blast radius (for reference; 066a remediates only site #1)

Full inventory. 066a remediates site #1; sites #2–#7 are pragma-
annotated pending 066b closure review.

| # | File | Handler | Priority | 066a Treatment |
|---|---|---|---|---|
| 1 | `components/pit-panels/pit-panels-client.tsx:308-315` | `handleSave` | P0 — BDD7B21D | **Remediate (WS2a)** |
| 2 | `components/pit-panels/pit-panels-client.tsx:354-361` | `handleCloseSession` | P0 — sibling | Pragma + `TODO(EXEC-066b)` |
| 3 | `components/pit-panels/pit-panels-client.tsx:400-407` | `handleMovePlayer` | P0 — sibling | Pragma + `TODO(EXEC-066b)` |
| 4 | `components/modals/rating-slip/rating-slip-modal.tsx:443-458` | `handlePauseSession` | P1 | Pragma + `TODO(EXEC-066b)` |
| 5 | `components/modals/rating-slip/rating-slip-modal.tsx:461-476` | `handleResumeSession` | P1 | Pragma + `TODO(EXEC-066b)` |
| 6 | `components/table/session-action-buttons.tsx:81-82` | `handleStartRundown` | P1 | Pragma + `TODO(EXEC-066b)` |
| 7 | `components/admin/threshold-settings-form.tsx:268-269` | `handleSave` | P2 | Pragma + `TODO(EXEC-066b)` |

**Unreachable-guard annotations** (WS3a; no TODO, just reachability
justification — these never become 066b work):

- `components/loyalty/issue-reward-drawer.tsx:121-122` — `handleConfirm` only reachable via `handleSelectReward` which always sets `selectedReward`. Guard is defensive dead code.
- `components/admin-alerts/acknowledge-alert-dialog.tsx:41-52` — line 54 `if (!alert) return null;` unmounts the form when alert is falsy; submit button never renders with `!alert`.

---

## 3. Invariant to Codify

### INV-WRITE-PATH-OPERATOR-VISIBILITY

> **A write-path handler (any handler attached to an operator-initiated
> mutation action) MUST NOT early-return without producing at least one
> operator-visible signal: a toast, an inline error banner, a form-state
> error, or a non-dismissible prompt.**
>
> Silent early-return is permitted only when the UI control that invokes
> the handler is demonstrably disabled under the same precondition
> (belt-and-suspenders guard). "Demonstrably" means the disabled
> predicate is derivable from the same expression as the guard.

This invariant extends INV-MTL-BRIDGE-ATOMICITY's corollary from
"success signal before commit" to "failure signal on unreachable
commit." Both belong to the same family: *the operator's mental model
must match the DB's state after every click.*

Recorded in `.claude/CLAUDE.md` "Critical Guardrails" (owner: WS1).

---

## 4. Canonical Remediation Pattern

### 4.1 Utility signature (`lib/errors/fail-silent-guard.ts`)

Co-located with `error-utils.ts` and `safe-error-details.ts`.

```ts
import * as Sentry from '@sentry/nextjs';
import { toast } from 'sonner';
import { logError } from '@/lib/errors/error-utils';

type GuardSeverity = 'financial' | 'state' | 'config';

interface FailSilentGuardArgs {
  reason: string;
  userMessage: string;
  component: string;
  action: string;
  severity: GuardSeverity;
  onBanner?: (msg: string) => void;
}

export function failSilentGuard(args: FailSilentGuardArgs): void {
  const { reason, userMessage, component, action, severity, onBanner } = args;

  // 1. Dev-only structured log via existing logError.
  logError(new Error(`[${component}.${action}] guard trip: ${reason}`), {
    component,
    action,
    metadata: { reason, severity },
  });

  // 2. Production telemetry — Sentry breadcrumb so 066b closure
  //    criteria can query `(component, action, reason)` frequencies
  //    across distinct operators.
  Sentry.addBreadcrumb({
    category: 'silent-guard',
    level: 'warning',
    message: `${component}.${action}:${reason}`,
    data: { component, action, reason, severity },
  });

  // 3. Toast — id-keyed replacement (no stacking while visible).
  toast.error('Action blocked', {
    id: `guard:${component}:${action}:${reason}`,
    description: userMessage,
  });

  // 4. Financial severity → inline banner mandatory (PRD-064 mirror).
  if (severity === 'financial' && onBanner) {
    onBanner(userMessage);
  }
}
```

### 4.1a Banner lifecycle contract

- **Ownership:** one `saveErrorBanner` state per surface. Pit-panels
  declares a local
  `const [saveErrorBanner, setSaveErrorBanner] = useState<string | null>(null)`
  inside `PitPanelsClient`, used by the remediated `handleSave` in
  066a. When 066b remediates `handleCloseSession` and `handleMovePlayer`,
  they consume the same slot.
- **Clearing rules:**
  1. Cleared at the top of the mutation's `try` block immediately
     before `.mutateAsync(...)`. WS2a adds `setSaveErrorBanner(null)`
     to **one site** in 066a: `handleSave`'s try block (~L317).
     066b extends to two more sites.
  2. Cleared when the owning modal closes.
  3. NOT cleared on keystroke / form edit.
- **No TTL.** Operator-dismissed only.
- **Stomping (R-6):** Single handler in 066a → no stomping risk yet.
  Re-evaluate when 066b adds the two sibling handlers.

### 4.2 Call-site shape

Before (BDD7B21D):
```tsx
const handleSave = async (formState: FormState) => {
  if (!selectedSlipId || !modalData) {
    return;                                   // ← silent drop
  }
  // ... write ...
};
```

After (066a WS2a):
```tsx
const handleSave = async (formState: FormState) => {
  if (!selectedSlipId || !modalData) {
    failSilentGuard({
      reason: 'MISSING_SLIP_OR_MODAL_DATA',
      userMessage: 'Cannot save — session context is missing. Refresh and try again.',
      component: 'PitPanels',
      action: 'handleSave',
      severity: 'financial',
      onBanner: setSaveErrorBanner,
    });
    return;
  }
  // ... write ...
};
```

### 4.3 Severity matrix (full — 066b consumes state / config)

| Severity | Surfaces it applies to | UI pattern |
|---|---|---|
| `financial` | Buy-in, close-session, move-player | Toast + non-dismissible banner (PRD-064 mirror) |
| `state` | Pause, resume, rundown start | Toast only |
| `config` | Admin settings, threshold writes | Inline banner + toast |

In 066a only `financial` is exercised (`handleSave`).

### 4.4 Deferred-site pragma template

```tsx
// eslint-disable-next-line guard-rules/no-silent-handler-guard
// TODO(EXEC-066b): remediate pending telemetry review
if (!selectedSlipId || !modalData || !selectedTableId) {
  return;
}
```

Each TODO comment carries the EXEC-066b reference for grep-ability.
For the 2 unreachable-guard sites (WS3a), the second comment is a
reachability justification rather than a TODO — those sites never
become 066b work.

---

## 5. Remediation Mapping (Per Site)

### WS2a — `pit-panels-client.tsx:handleSave` only

| Handler | Current guard | Replacement |
|---|---|---|
| `handleSave` (L308-315) | `if (!selectedSlipId || !modalData) return;` + `if (!staffId) return;` | Two `failSilentGuard(severity='financial')` calls with distinct `reason` codes (`MISSING_SLIP_OR_MODAL_DATA`, `MISSING_STAFF_CONTEXT`), both wiring `onBanner=setSaveErrorBanner`. Add `setSaveErrorBanner(null)` at the top of the `try` block (~L317). |

Test (`components/pit-panels/__tests__/silent-guard-handlesave.test.tsx`):
- Mount `<PitPanelsClient>` inside a render helper providing `<Toaster />`.
- Force `!modalData` and `!staffId` via React Query cache seeding /
  test-mode props — cover **2 guard branches × 3 assertions (toast +
  banner + logError) = 6 expectations**.
- Verify Sentry breadcrumb emission (mock `Sentry.addBreadcrumb`).
- Use `findByText` / `waitFor` for sonner assertions.

### WS3a — Pragma annotations

Each of the 6 deferred sites + 2 demoted-unreachable sites receives
the pragma template per §4.4. No behaviour change; lint regression
only.

---

## 6. Functional Requirements

- **FR-1**: `handleSave` in `pit-panels-client.tsx` (BDD7B21D site) must call `failSilentGuard(...)` before early-returning on either of its two missing-context guards.
- **FR-2**: `failSilentGuard` must always (a) log via `logError` with `ErrorContext` shape (`component`, `action`, `metadata: { reason, severity }`), (b) emit a Sentry breadcrumb for production telemetry, (c) emit an error-class toast keyed by `guard:<component>:<action>:<reason>`, (d) render a non-dismissible banner when `severity === 'financial'` and `onBanner` is supplied.
- **FR-3**: The ESLint rule `guard-rules/no-silent-handler-guard` must emit a violation at severity `error` when any file under `components/**/*.tsx` contains a function named `handle*` whose body includes `if (!expr) { return; }` (or `return null;`) not preceded by one of: `setError(...)`, `toast.error(...)`, `logError(...)`, `failSilentGuard(...)` on the same branch.
- **FR-3a**: Rule scope is `components/**/*.tsx` ONLY. Test files (`**/*.test.tsx`, `**/*.spec.tsx`, `**/__tests__/**`, `**/__mocks__/**`) are excluded per `temporal-rules` precedent at `eslint.config.mjs:253-260`.
- **FR-4**: All 6 deferred sites + 2 unreachable-guard sites must be annotated with `// eslint-disable-next-line guard-rules/no-silent-handler-guard` + a second comment (`TODO(EXEC-066b): remediate pending telemetry review` for deferred; reachability justification for unreachable). No custom pragma syntax.
- **FR-5**: Banner lifecycle (§4.1a) applies for the single remediated handler.

## 7. Non-Functional Requirements

- **NFR-1**: `failSilentGuard` must not allocate a Supabase client, dispatch a query, or touch React state beyond the injected banner callback. Synchronous and side-effect-local.
- **NFR-2**: Sonner id-keyed replacement bounds visible toast noise while the prior toast is visible. Post-dismiss, a new toast appears. No custom debounce window.
- **NFR-3**: No new database migrations, no RPC signature changes, no RLS policy changes.
- **NFR-4**: ESLint rule ships with `RuleTester` fixtures under `.eslint-rules/__tests__/no-silent-handler-guard.test.js`. Parser: `@typescript-eslint/parser` + `ecmaFeatures.jsx: true` + `ecmaVersion: 2021`. Cover 7 behaviors × representative AST shapes (~15 fixtures) per the list in EXEC-066b §NFR-4 (inherited). RuleTester must assert known-violation fixtures actually report violations, not pass-by-parse-failure.
- **NFR-5**: Production telemetry (Sentry breadcrumb) must emit independently of `NODE_ENV` so 066b's closure criteria can evaluate pilot data. Fallback: `console.warn` with a structured JSON payload if Sentry is not initialized.

---

## 8. Definition of Done

All tests below are **Required** tier under ADR-044.

**Foundation (WS1)**
- [ ] `lib/errors/fail-silent-guard.ts` exported.
- [ ] `lib/errors/__tests__/fail-silent-guard.test.ts` passes — toast emission, Sentry breadcrumb emission, logError call shape, banner branch (financial only), no-banner branch (state / config).
- [ ] ESLint rule `.eslint-rules/no-silent-handler-guard.js` implemented.
- [ ] `.eslint-rules/__tests__/no-silent-handler-guard.test.js` passes — ~15 RuleTester fixtures per NFR-4.
- [ ] Rule wired into `eslint.config.mjs` under plugin namespace `guard-rules`, severity `error`.
- [ ] Sentry breadcrumb verified in local dev against the initialized SDK; fallback `console.warn` path verified when SDK is absent.

**Remediation (WS2a)**
- [ ] `handleSave` in `pit-panels-client.tsx` calls `failSilentGuard(...)` for both guard branches.
- [ ] `setSaveErrorBanner(null)` added at top of `handleSave`'s `try` block.
- [ ] Local `const [saveErrorBanner, setSaveErrorBanner] = useState<string | null>(null)` declared inside `PitPanelsClient`.
- [ ] `components/pit-panels/__tests__/silent-guard-handlesave.test.tsx` passes — **2 branches × 3 assertions = 6 expectations**.
- [ ] Existing bare `logError(...)` at `handleMovePlayer` guard site NOT touched in 066a (that belongs to 066b).

**Deferred-site annotations (WS3a)**
- [ ] 6 deferred sites carry `// eslint-disable-next-line guard-rules/no-silent-handler-guard` + `// TODO(EXEC-066b): remediate pending telemetry review`.
- [ ] 2 unreachable-guard sites carry the pragma + a reachability justification comment (no TODO).
- [ ] `npm run lint` passes with the rule active at `error` and all annotations in place.
- [ ] `grep -rn "TODO(EXEC-066b)" components/` returns exactly 6 hits.

**Governance**
- [ ] `INV-WRITE-PATH-OPERATOR-VISIBILITY` recorded in `.claude/CLAUDE.md` "Critical Guardrails" (owner: WS1).
- [ ] ISSUE-BDD7B21D resolved via `/issue-resolve` with root-cause pointer to EXEC-066a.
- [ ] PRD-064 §2.3 "silent `modalData` guard" non-goal footnoted with reference to EXEC-066a (remediation) + EXEC-066b (sweep).
- [ ] `.claude/CLAUDE.md` references EXEC-066b as the telemetry-gated continuation.

**Explicit non-DoD**
- [ ] This slice does NOT remediate `handleCloseSession`, `handleMovePlayer`, `handlePauseSession`, `handleResumeSession`, `handleStartRundown`, or `threshold-settings-form.handleSave`. Those are EXEC-066b work (and may be killed or reduced based on 066b closure criteria).
- [ ] This slice does NOT decide ADR-049 (composite-mutation architecture).

---

## 9. Risks

- **R-1 (Low):** Toast spam on broken surface. Mitigation: sonner id-keyed replacement.
- **R-2 (Low):** ESLint AST match scope is `handle*` named function declarations only. Accepted for v0.
- **R-3 (Medium):** PRD-065 collision on `handleSave`. Mitigation: sequencing declared in `external_dependencies`.
- **R-4 (Low):** Sentry SDK not yet initialized at 066a ship time. Mitigation: NFR-5 fallback to `console.warn` + 066b reconciles.
- **R-5 (Medium):** Pilot window too short to accumulate meaningful telemetry for 066b closure. Mitigation: EXEC-066b §12 specifies interim review at pilot week 4; if signal is insufficient, extend the gate window rather than auto-proceed.
- **R-6 (Low):** Banner stomping — only one remediated handler in 066a, so no stomp risk. Re-evaluate when 066b adds siblings.
- **R-7 (Low):** TODO comments rot. Mitigation: `grep -rn "TODO(EXEC-066b)"` lives in CI as a smoke check in 066b closure review; the marker is load-bearing, not decorative.

---

## 10. Related Documents

- **Parent PRD:** `docs/10-prd/PRD-064-mtl-buyin-glitch-containment-v0.md` (§2.3 deferred this work). Merged at `3839ba9b` (2026-04-16).
- **Continuation:** `docs/21-exec-spec/EXEC-066b-silent-guard-sweep.md` — telemetry-gated sweep of the 6 deferred sites.
- **Sequencing dependency:** `docs/10-prd/PRD-065-adr049-operator-atomicity-save-with-buyin-v0.md`. Status: Draft at 066a authoring.
- **Seed issue:** ISSUE-BDD7B21D.
- **Parallel ADR:** `docs/80-adrs/ADR-049-operator-action-atomicity-boundary.md`.
- **Invariants:** INV-MTL-BRIDGE-ATOMICITY (parent); INV-ERR-DETAILS; INV-WRITE-PATH-OPERATOR-VISIBILITY (introduced here).
- **Governance:** ADR-044 + `docs/70-governance/TESTING_GOVERNANCE_STANDARD.md` — all 066a tests are Required tier.
- **Telemetry prerequisite:** `docs/21-exec-spec/EXEC-063-sentry-error-tracking.md`.

---

## 11. Version History

| Version | Date | Author | Changes |
|---|---|---|---|
| v0.3 | 2026-04-17 | Lead Architect | Split from EXEC-066 v0.2 into 066a (this doc — pilot-bound foundation + BDD7B21D site) and EXEC-066b (telemetry-gated sweep). Scope reduction: WS2 reduced to handleSave only; WS3/WS4/WS5 moved to 066b. New WS3a adds pragma annotations to 6 deferred sites + 2 unreachable sites so lint rule ships at `error` from day one without CI regressions. New FR-2/NFR-5: `failSilentGuard` emits Sentry breadcrumb for production telemetry (existing `logError` is dev-only; breadcrumb enables 066b closure evaluation). New R-5/R-7 document pilot-window risk and TODO-rot mitigation. |
