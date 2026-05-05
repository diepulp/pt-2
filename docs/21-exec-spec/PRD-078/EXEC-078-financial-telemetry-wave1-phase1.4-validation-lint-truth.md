---
prd: PRD-078
id: EXEC-078
title: "Financial Telemetry Wave 1 Phase 1.4 — Validation: Lint Enforcement + Truth-Telling Tests"
fib_h_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-4/FIB-H-FINANCIAL-TELEMETRY-PHASE-1-4-VALIDATION-LINT-TRUTH.md
fib_s_ref: docs/issues/gaps/financial-data-distribution-standard/actions/fibs/phase-1-4/FIB-S-FINANCIAL-TELEMETRY-PHASE-1-4-VALIDATION-LINT-TRUTH.json
fib_s_loaded: true
status: draft
phase: "Wave 1 Phase 1.4"
slug: financial-telemetry-wave1-phase1.4-validation-lint-truth
created: 2026-05-05
precondition_gate: "EXEC-077 closed 2026-05-04 — all 13 surface families migrated, FinancialValue.tsx props contract frozen, sentinel grep CLEAN, npm run type-check + lint + build exit 0"

complexity_prescreen: streamlined
write_path_classification: none
gov010_check: "waived:enforcement-only PRD; no scaffold artifact required; ADRs frozen at ADR-052/053/054/055 per FIB-S governance"

open_question_decisions:
  DTO_ALLOWLIST:
    resolution: explicit-list
    source: "Scan of services/**/dtos.ts 2026-05-05 — all fields currently typed as FinancialValue after Phase 1.3 migration"
    allowlist:
      "services/visit/dtos.ts":
        - session_total_buy_in
        - session_total_cash_out
        - session_net
        - total_buy_in
        - total_cash_out
        - net
      "services/player-financial/dtos.ts":
        - original_total
        - adjustment_total
        - net_total
      "services/rating-slip/dtos.ts":
        - amount
      "services/loyalty/dtos.ts":
        - theo
      "services/shift-intelligence/dtos.ts":
        - observedValue
        - baselineMedian
        - baselineMad
        - thresholdValue
    implementation_note: |
      The rule file must declare the allowlist as a hardcoded object keyed by
      file-path suffix (e.g., 'visit/dtos.ts') → field name set. This prevents
      the rule from firing on same-named fields in unrelated service files.
      Rule must check: (1) current file path contains the keyed suffix AND
      (2) the field name is in the corresponding set AND (3) the type is
      `number` or `number | null` (not FinancialValue).

  API_TEST_EXECUTION_MODE:
    resolution: jest-node-mocked-supabase
    rationale: |
      Route handlers use the Supabase client; mocking with a typed factory that
      returns well-shaped FinancialValue response bodies validates the envelope
      shape contract at the handler boundary without CI cost of a live instance.
      Pattern matches existing test:slice:* conventions (jest.node.config.js,
      testEnvironment: node). The test proves shape contract, not data fidelity;
      mocked mode is sufficient per FIB-S §decision_notes.
    representative_routes:
      - "GET /api/v1/players/[playerId]/recent-sessions — asserts session_total_buy_in, session_total_cash_out, session_net fields"
      - "GET /api/v1/mtl/gaming-day-summary — asserts fills/credits/win-loss fields (those already FinancialValue-shaped post-Phase-1.2B)"
    envelope_assertions: "value is Number.isInteger, type is non-null string, source is non-null string, completeness.status is non-null string"

  SEED_DATA_GAP:
    resolution: no-ws0-required
    evidence: |
      seed.sql Players 1, 3, 4 have open rating slips (status: 'open', no end_time) —
      these produce partial completeness state on the start-from-previous panel (I5 Scenario 1).
      Open slips without computed_theo_cents yield Theo-unknown state on player-360
      summary-band (I5 Scenario 2). No WS0 seed patch needed.
    ws4_validation_note: "WS4 must verify these player states exist in local seed during Playwright scaffold; if a gap is found, WS4 adds a minimal seed fixture inline without a separate workstream."

  TEST_SURFACE_PATTERN:
    resolution: explicit-pattern
    command: >
      jest --config jest.node.config.js
      --testPathPatterns='(components/financial/__tests__|components/player-sessions/__tests__|components/modals/rating-slip/__tests__|__tests__/financial-surface/)'
    script_entry: '"test:surface": "jest --testPathPatterns=''(components/financial/__tests__|components/player-sessions/__tests__|components/modals/rating-slip/__tests__|__tests__/financial-surface/)''\"'
    implementation_note: |
      components/financial/__tests__ contains component tests (FinancialValue.test.tsx,
      AttributionRatio.test.tsx, CompletenessBadge.test.tsx) that may need jsdom env.
      WS3 must verify: if jest.node.config.js excludes jsdom-required component tests,
      use default jest config (no --config flag) for the test:surface script instead.
      The goal is that test:surface runs all four target sets; config selection is an
      implementation detail for WS3 to resolve.

workstreams:
  WS1:
    name: Forbidden Label ESLint Rule
    executor: qa-specialist
    executor_type: skill
    depends_on: []
    bounded_context: cross-cutting enforcement
    estimated_complexity: medium
    outputs:
      - .eslint-rules/no-forbidden-financial-label.js
    gate: lint
    traces_to: [CAP-1, CAP-3, RULE-1]

  WS2:
    name: Unlabeled Financial Value ESLint Rule + Config Wiring
    executor: qa-specialist
    executor_type: skill
    depends_on: []
    bounded_context: cross-cutting enforcement
    estimated_complexity: medium
    outputs:
      - .eslint-rules/no-unlabeled-financial-value.js
      - eslint.config.mjs
    gate: lint
    traces_to: [CAP-2, CAP-3, RULE-2, RULE-3]

  WS3:
    name: Jest Surface Gate
    executor: qa-specialist
    executor_type: skill
    depends_on: [WS1, WS2]
    bounded_context: financial-display
    estimated_complexity: medium
    outputs:
      - __tests__/financial-surface/financial-api-envelope.test.ts
      - package.json
    gate: test-pass
    traces_to: [CAP-4, CAP-5, RULE-4, RULE-5]

  WS4:
    name: Playwright Truth-Telling Gate
    executor: e2e-testing
    executor_type: skill
    depends_on: [WS1, WS2]
    bounded_context: financial-display
    estimated_complexity: medium
    outputs:
      - e2e/financial-enforcement.spec.ts
    gate: e2e-write-path
    traces_to: [CAP-6, RULE-6, RULE-7]

  WS5:
    name: Validation and Tracker Closure
    executor: qa-specialist
    executor_type: skill
    depends_on: [WS1, WS2, WS3, WS4]
    bounded_context: cross-cutting enforcement
    estimated_complexity: low
    outputs:
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json
      - docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md
    gate: build
    traces_to: [CAP-7, RULE-8]

execution_phases:
  - name: "Phase 1 — ESLint Rule Authoring"
    parallel: [WS1, WS2]
    gate: gate-lint-rules-authored
  - name: "Phase 2 — Test Gate Authoring"
    parallel: [WS3, WS4]
    gate: gate-test-gates-authored
  - name: "Phase 3 — Validation and Tracker Closure"
    parallel: [WS5]
    gate: gate-phase14-dod
---

# EXEC-078 — Financial Telemetry Wave 1 Phase 1.4: Validation, Lint Enforcement, and Truth-Telling Tests

## Overview

Phase 1.4 adds the enforcement gate that protects the Wave 1 financial telemetry contract after Phase 1.3 migrated all 13 in-scope production UI surface families. This slice authors two custom ESLint rules, wires them into the flat config, births a `test:surface` Jest runner, adds representative API boundary envelope tests, and adds Playwright assertions for authority-label visibility and I5 truth-telling.

**Scope boundary (hard):** This EXEC-SPEC may not author service, API, DTO shape, UI component, or OpenAPI changes. All upstream contracts are frozen inputs. If implementation requires touching any frozen contract, execution halts and requires a FIB amendment before continuing.

**Precondition gate:** EXEC-077 closed 2026-05-04. All 13 surface families migrated. `FinancialValue.tsx` props contract frozen. Sentinel grep CLEAN. `npm run type-check`, `npm run lint`, `npm run build` all exit 0.

---

## Intake Traceability

**FIB-S:** `FIB-S-FIN-PHASE-1-4` (loaded at pipeline intake)

| Workstream | Traces To | Capabilities |
|-----------|-----------|-------------|
| WS1 | RULE-1 | CAP-1, CAP-3 |
| WS2 | RULE-2, RULE-3 | CAP-2, CAP-3 |
| WS3 | RULE-4, RULE-5 | CAP-4, CAP-5 |
| WS4 | RULE-6, RULE-7 | CAP-6 |
| WS5 | RULE-8 | CAP-7 |

All 7 FIB-S capabilities covered. All 8 hard rules traced. Anti-invention boundary: no new operator-visible surfaces, public API routes, DTO shapes, or UI component births.

---

## Resolved Open Questions

### DEC-1: DTO Allowlist for `no-unlabeled-financial-value`

**Decision:** Explicit hardcoded allowlist keyed by service file path suffix → field name set. Sourced from scan of `services/**/dtos.ts` on 2026-05-05 — all fields currently typed as `FinancialValue` post-Phase-1.3.

**Allowlist (must be declared verbatim in the rule file):**

```js
const FINANCIAL_VALUE_FIELD_ALLOWLIST = {
  'visit/dtos.ts': new Set([
    'session_total_buy_in',
    'session_total_cash_out',
    'session_net',
    'total_buy_in',
    'total_cash_out',
    'net',
  ]),
  'player-financial/dtos.ts': new Set([
    'original_total',
    'adjustment_total',
    'net_total',
  ]),
  'rating-slip/dtos.ts': new Set([
    'amount',
  ]),
  'loyalty/dtos.ts': new Set([
    'theo',
  ]),
  'shift-intelligence/dtos.ts': new Set([
    'observedValue',
    'baselineMedian',
    'baselineMad',
    'thresholdValue',
  ]),
};
```

**Verification:** `hold_percent`, `average_bet`, `min_bet`, `max_bet`, `watchlistFloor`, `ctrThreshold`, `current_segment_average_bet`, and loyalty points are absent from this list — the rule must not flag them per RULE-3 and FIB-S DEF-NEVER invariant.

**Verification: `inference: assumed`** — Scan confirms these fields are `FinancialValue` post-Phase-1.3. Test: introduce `session_total_buy_in: number` in visit/dtos.ts → `npm run lint` exits non-zero.

### DEC-2: API Test Execution Mode

**Decision:** Jest/node with mocked Supabase client (`jest.node.config.js`, `testEnvironment: node`).

**Rationale:** Validates envelope shape contract at the handler boundary without CI cost of a live Supabase instance. Shape validation is the goal — mocked mode is sufficient per FIB-S §decision_notes. Pattern matches existing `test:slice:*` conventions.

**Representative routes:**
1. `GET /api/v1/players/[playerId]/recent-sessions` — assert `session_total_buy_in`, `session_total_cash_out`, `session_net` carry FinancialValue envelope
2. `GET /api/v1/mtl/gaming-day-summary` — assert win/loss inventory fields carry FinancialValue envelope

**Verification: `inference: assumption`** — Route handlers must be directly importable and testable with a mocked Supabase client. If a route handler has a Next.js-specific import that blocks node-env testing, WS3 falls back to testing the service function directly (not the route handler) for the envelope shape.

### DEC-3: Seed Data Gap

**Decision:** No WS0 seed patch required.

**Evidence:** `supabase/seed.sql` Players 1, 3, 4 have open rating slips (`status: 'open'`) — these produce partial completeness on the start-from-previous panel (I5 Scenario 1). Open slips without `computed_theo_cents` yield Theo-unknown state on player-360 (I5 Scenario 2). WS4 must validate these states exist before authoring Playwright scenarios; if a gap is found, WS4 adds a minimal seed fixture inline.

**Verification: `inference: assumption`** — Playwright must navigate to an actual open-visit session and a Theo-unknown player; seed must provide accessible records for local dev. WS4 is the verification gate.

### DEC-4: `test:surface` Jest Pattern

**Decision:** Single `--testPathPatterns` covering all four target directories.

```json
"test:surface": "jest --testPathPatterns='(components/financial/__tests__|components/player-sessions/__tests__|components/modals/rating-slip/__tests__|__tests__/financial-surface/)'"
```

**Implementation note for WS3:** Component tests in `components/financial/__tests__` (FinancialValue, AttributionRatio, CompletenessBadge) may require jsdom environment. If `jest.node.config.js` excludes jsdom tests, WS3 uses the default Jest config (no `--config` flag) for `test:surface` so all four directories run. The goal is a single stable command; config selection is WS3's implementation decision.

---

## Workstream Specifications

### WS1: Forbidden Label ESLint Rule

**Executor:** `qa-specialist`
**Phase:** 1 (parallel with WS2)
**Depends on:** none

**Objective:** Author `.eslint-rules/no-forbidden-financial-label.js` and wire it into `eslint.config.mjs`. `npm run lint` must exit non-zero when forbidden labels from `WAVE-1-FORBIDDEN-LABELS.md` §4.1–4.5 appear in production UI or DTO files. Must exit 0 on the clean post-Phase-1.3 codebase.

**Implementation spec:**

```
File: .eslint-rules/no-forbidden-financial-label.js
Pattern: CJS module — module.exports = { meta: { type, docs, messages, schema }, create }
AST visitors: Literal (string values), JSXText, JSXAttribute (value strings), Identifier (DTO property names)
```

Sub-rules (implement verbatim from `WAVE-1-FORBIDDEN-LABELS.md` §4):

**§4.1 — Handle (SRC §L3, §F3)**
- Pattern: `/\bHandle\b/` in JSX text, string literals, and JSX attribute values
- Exception: String containing `Handle (Estimated Drop)` or `Handle(Estimated Drop)` — do not flag
- Files: `components/**/*.tsx`, `app/**/*.tsx`
- Error message: `"Forbidden label 'Handle' (WAVE-1-FORBIDDEN-LABELS §4.1, SRC §L3). Use 'Estimated Drop'. Exception: 'Handle (Estimated Drop)' is allowed as a transition label."`

**§4.2 — Win qualifier whitelist (SRC §L3)**
- Pattern: Standalone `/\bWin\b/` not preceded or followed by: `Inventory`, `Estimated`, `Table`, `Pit`, `Actual`
- Check: `/(Inventory|Estimated|Table|Pit|Actual)\s+Win\b/` or `/\bWin\s+(Inventory|Estimated|Table|Pit|Actual)/` — these are allowed
- Files: `components/**/*.tsx`, `app/**/*.tsx`
- Error message: `"Forbidden label 'Win' without qualifier (WAVE-1-FORBIDDEN-LABELS §4.2, SRC §L3). Use 'Inventory Win', 'Estimated Win', 'Table Win', 'Pit Win', or 'Actual Win'."`

**§4.3 — Coverage KPI-context scoped (SRC §K1)**
- Pattern: `/\bCoverage(\s+quality)?\b/i` in KPI display file contexts
- KPI file heuristic: file path matches `floor-oversight`, `shift-dashboard`, `analytics-panel`, `kpi`, `metric`, or JSX element name matches `KPICard`, `MetricCard`, `StatCard`, `CoverageDisplay`
- Files: `components/**/*.tsx`, `app/**/*.tsx`
- Error message: `"Forbidden label 'Coverage' or 'Coverage quality' in KPI display context (WAVE-1-FORBIDDEN-LABELS §4.3, SRC §K1). Use 'Attribution Ratio'."`

**§4.4 — Theo placeholder zero (SRC §F4)**
- Pattern: `/Theo\s*:\s*\$?0(\.00)?\b/` in string literals and JSX text
- Files: `components/**/*.tsx`, `app/**/*.tsx`
- Error message: `"Forbidden pattern 'Theo: 0' or 'Theo: $0' (WAVE-1-FORBIDDEN-LABELS §4.4, SRC §F4). Render <FinancialValue> with completeness.status: 'unknown' and explicit 'Not computed' badge instead."`

**§4.5 — DTO chip identifiers (SRC §L3)**
- Pattern: Identifier nodes `totalChipsOut` or `totalChipsIn` in property signatures and declarations
- Files: `services/**/dtos.ts`
- Error message: `"Forbidden DTO field identifier 'totalChipsOut'/'totalChipsIn' (WAVE-1-FORBIDDEN-LABELS §4.5, SRC §L3). Rename to 'totalCashOut'/'totalCashIn'."`

**eslint.config.mjs:** WS1 does NOT modify `eslint.config.mjs`. WS2 is the sole owner of all `eslint.config.mjs` changes and will import and wire both rules in a single unified `financial-enforcement` plugin block. WS1 delivers the rule file only.

**Acceptance criteria:**
- [ ] Rule file exists at `.eslint-rules/no-forbidden-financial-label.js`
- [ ] Rule exports `module.exports = { meta, create }` — no partial plugin block
- [ ] Rule passes manual verification: introducing `label: 'Handle'` in a test harness → rule fires; `'Handle (Estimated Drop)'` → rule does not fire
- [ ] Introducing `label: 'Win'` (standalone) → rule fires; `'Inventory Win'` → does not fire
- [ ] Introducing `label: 'Coverage quality'` in analytics-panel.tsx → rule fires
- [ ] Introducing `totalChipsOut: string` in services/visit/dtos.ts → rule fires
- [ ] Test files are excluded (no false-positives on test fixtures)

**Outputs:**
- `.eslint-rules/no-forbidden-financial-label.js` (rule file only — no eslint.config.mjs changes)

---

### WS2: Unlabeled Financial Value ESLint Rule

**Executor:** `qa-specialist`
**Phase:** 1 (parallel with WS1)
**Depends on:** none

**Objective:** Author `.eslint-rules/no-unlabeled-financial-value.js` and wire it into `eslint.config.mjs`. Two sub-rules with explicit, non-heuristic scope:
1. **DTO sub-rule:** Flag allowlisted financial DTO fields in `services/**/dtos.ts` typed as `number` or `number | null`
2. **Render sub-rule:** Flag `formatDollars(x.value)` where `.value` is a member access on a `FinancialValue`-typed object in UI/app files

**Implementation spec:**

```
File: .eslint-rules/no-unlabeled-financial-value.js
Pattern: CJS module — module.exports = { meta: { type, docs, messages, schema }, create }
AST visitors:
  - TSPropertySignature (DTO sub-rule: detect field name + type)
  - CallExpression (render sub-rule: detect formatDollars(x.value) pattern)
```

**DTO sub-rule — full allowlist (from DEC-1):**

The allowlist object in the rule file must exactly match DEC-1. The rule:
1. Checks `context.getFilename()` — if file path does not end with a key in the allowlist map, skip
2. On `TSPropertySignature` node: if property name is in the file's set AND annotation is `TSNumberKeyword` or `TSUnionType` containing `TSNumberKeyword` and `TSNullKeyword` only → report violation
3. Never fire on property names not in the allowlist — `hold_percent`, `average_bet`, `min_bet`, `max_bet`, `watchlistFloor`, `ctrThreshold`, `current_segment_average_bet`, loyalty points are implicitly safe

**Render sub-rule:**

Scope: Flag all `formatDollars(something.value)` call expressions in production component/app files where `something.value` is a MemberExpression with `.property.name === 'value'`. No type inference required. Rationale: in this codebase `.value` is reserved for `FinancialValue` payloads; pattern-based detection is reliable and avoids fragile AST type resolution.

**Assumption (must appear in rule's `meta.docs.description`):** `.value` member access in component/app code is reserved for `FinancialValue` payloads within this codebase. If additional `.value`-bearing types are introduced (e.g., form field value accessors), this rule must be revisited to narrow scope or add explicit allowlist entries.

Error message: `"Direct formatDollars(x.value) call on a FinancialValue field (no-unlabeled-financial-value, SRC §L2). Use <FinancialValue> component or formatCents(x.value) for internal rendering."`

**eslint.config.mjs — WS2 is the sole owner of all financial-enforcement plugin wiring:**

WS2 must produce the complete, final `eslint.config.mjs` additions containing exactly one `financial-enforcement` plugin declaration with both rules. WS1 must not write any plugin blocks. The merged config block:

```js
// Add to top-level imports (WS2 adds both — WS1 rule file is already on disk):
import noForbiddenFinancialLabel from './.eslint-rules/no-forbidden-financial-label.js';
import noUnlabeledFinancialValue from './.eslint-rules/no-unlabeled-financial-value.js';

// Single unified plugin — component and app files (both rules):
{
  files: ['components/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
  ignores: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
  plugins: {
    'financial-enforcement': {
      rules: {
        'no-forbidden-financial-label': noForbiddenFinancialLabel,
        'no-unlabeled-financial-value': noUnlabeledFinancialValue,
      },
    },
  },
  rules: {
    'financial-enforcement/no-forbidden-financial-label': 'error',
    'financial-enforcement/no-unlabeled-financial-value': ['error', { mode: 'render' }],
  },
},
// Single unified plugin — services/**/dtos.ts (both applicable rules):
{
  files: ['services/**/dtos.ts'],
  plugins: {
    'financial-enforcement': {
      rules: {
        'no-forbidden-financial-label': noForbiddenFinancialLabel,
        'no-unlabeled-financial-value': noUnlabeledFinancialValue,
      },
    },
  },
  rules: {
    'financial-enforcement/no-forbidden-financial-label': ['error', { dtoChipIdentifiersOnly: true }],
    'financial-enforcement/no-unlabeled-financial-value': ['error', { mode: 'dto' }],
  },
},
```

The final `eslint.config.mjs` must contain exactly one `financial-enforcement` plugin declaration per config block. No partial blocks, no duplicate plugin keys.

**Acceptance criteria:**
- [ ] Rule file exists at `.eslint-rules/no-unlabeled-financial-value.js`
- [ ] `eslint.config.mjs` contains exactly one `financial-enforcement` plugin declaration per config block (both WS1 and WS2 rules in each block)
- [ ] `npm run lint` exits 0 on clean post-Phase-1.3 codebase
- [ ] Introducing `session_total_buy_in: number` in `services/visit/dtos.ts` → exits non-zero
- [ ] `hold_percent: number` is not flagged — exits 0
- [ ] `average_bet: number` is not flagged — exits 0
- [ ] Any field not in the DEC-1 allowlist is not flagged — exits 0
- [ ] Introducing `formatDollars(session.session_total_buy_in.value)` in a component → exits non-zero
- [ ] `formatDollars(amount)` (no `.value` member access) is not flagged — exits 0
- [ ] Test files excluded

**Outputs:**
- `.eslint-rules/no-unlabeled-financial-value.js`
- `eslint.config.mjs` (2 import lines + 2 unified config blocks — sole owner; WS1 rule wired here)

---

### WS3: Jest Surface Gate

**Executor:** `qa-specialist`
**Phase:** 2 (parallel with WS4)
**Depends on:** WS1, WS2 (lint must be clean before test gate runs)

**Objective:** Add `test:surface` to `package.json` and birth one API boundary envelope test file. The script is the single Phase 1.4 enforcement gate runner for the Jest test set.

**`test:surface` script:**

```json
"test:surface": "jest --testPathPatterns='(components/financial/__tests__|components/player-sessions/__tests__|components/modals/rating-slip/__tests__|__tests__/financial-surface/)'"
```

**Implementation note:** Verify the jest config handles both component (jsdom) and node tests in this pattern. If `jest.node.config.js` excludes component tests, use default jest config (drop `--config jest.node.config.js`) so all four directories run. Run `npm run test:surface` manually to confirm all targets are reached.

**API boundary envelope test file:**

```
File: __tests__/financial-surface/financial-api-envelope.test.ts
Config: jest.node.config.js (testEnvironment: node)
Mode: Route handler (primary) — mock Supabase client injected via jest.mock
      Service function (fallback) — ONLY if route handler cannot be imported in node env
Routes: 2 representative routes
```

**Fallback rule:** Route-level testing is the default and must be attempted first. If and only if a route handler has a Next.js-specific import that blocks node-env instantiation, the test may fall back to calling the underlying service function directly. When falling back:
1. The test file must include a `// FALLBACK: route handler not importable in node env — testing service boundary` comment
2. The same envelope shape assertions (value integer, type non-null, source non-null, completeness.status non-null) must be applied at the service output boundary
3. The acceptance criterion below must explicitly verify which boundary was tested

**Test structure:**

```typescript
// __tests__/financial-surface/financial-api-envelope.test.ts
// Tests representative financial API routes for FinancialValue envelope shape
// at explicitly enumerated field paths. Shape validation only — not data fidelity.

describe('Financial API Envelope Shape', () => {
  describe('GET /api/v1/players/[playerId]/recent-sessions', () => {
    it('returns session_total_buy_in as FinancialValue envelope', async () => {
      // Mock Supabase to return well-shaped response
      // Call route handler or service function directly
      // Assert: response.session_total_buy_in.value — Number.isInteger()
      // Assert: response.session_total_buy_in.type — non-null string
      // Assert: response.session_total_buy_in.source — non-null string
      // Assert: response.session_total_buy_in.completeness.status — non-null string
    });
    it('returns session_total_cash_out as FinancialValue envelope', async () => { ... });
    it('returns session_net as FinancialValue envelope', async () => { ... });
  });

  describe('GET /api/v1/mtl/gaming-day-summary (or equivalent)', () => {
    it('returns financial summary field as FinancialValue envelope', async () => {
      // Assert enumerated financial field path carries envelope shape
    });
  });
});
```

**Field path enumeration requirement (RULE-5):** The test file must declare an explicit list of financial field paths being tested (not inferred by scanning the response). Example:

```typescript
const FINANCIAL_FIELD_PATHS = [
  'session_total_buy_in',
  'session_total_cash_out',
  'session_net',
] as const;
```

**Acceptance criteria:**
- [ ] `test:surface` script exists in `package.json`
- [ ] `npm run test:surface` exits 0
- [ ] `__tests__/financial-surface/financial-api-envelope.test.ts` exists and passes
- [ ] Each tested route asserts `value` is integer, `type` is non-null, `source` is non-null, `completeness.status` is non-null at explicitly named field paths
- [ ] `npm run test:surface` does not sweep unrelated test directories

**Outputs:**
- `__tests__/financial-surface/financial-api-envelope.test.ts`
- `package.json` (1 new `test:surface` script entry)

---

### WS4: Playwright Truth-Telling Gate

**Executor:** `e2e-testing`
**Phase:** 2 (parallel with WS3)
**Depends on:** WS1, WS2 (clean lint baseline confirmed before E2E work begins)

**Objective:** Birth `e2e/financial-enforcement.spec.ts` combining DOM authority-label presence assertions on representative surfaces and I5 truth-telling invariant checks for partial and unknown completeness.

**Pre-implementation seed verification:**

Before writing Playwright scenarios, verify in local dev:
1. A player with an open visit exists (seed.sql Players 1, 3, or 4) — navigate to their session and confirm the start-from-previous panel shows `Partial` or equivalent completeness badge
2. A player with Theo-unknown state exists (open slip without `computed_theo_cents`) — navigate to their player-360 and confirm the Theo row shows `"Not computed"` or `"Unknown"`

If either state is missing from local seed, add a minimal seed fixture at the top of the spec file using Playwright's `test.beforeAll` with direct Supabase client calls (not a separate WS0).

**Test file structure:**

```typescript
// e2e/financial-enforcement.spec.ts
// Phase 1.4 enforcement gate: DOM authority assertions + I5 truth-telling

import { test, expect } from '@playwright/test';

// ─── DOM Authority Label Assertions ─────────────────────────────────────────

test.describe('Authority label visibility — representative surfaces', () => {
  test('shift-dashboard financial display shows authority-labeled values', async ({ page }) => {
    // Navigate to shift dashboard
    // Locate primary financial display region using stable selector:
    //   page.getByTestId('shift-dashboard-metrics') OR
    //   page.locator('[data-testid="shift-metrics-container"]') OR
    //   semantic: page.locator('.shift-dashboard').first()
    // Selectors must NOT rely on positional/visual heuristics (nth-child, coordinates)
    // Assert: at least one element with authority label text is visible within the region
    // (e.g., container.getByText(/Rated|Estimated|Observed|Actual|Compliance/i).first())
  });

  test('player-360 financial summary shows authority-labeled values', async ({ page }) => {
    // Navigate to player-360 for a player with session data
    // Locate summary-band using stable selector:
    //   page.getByTestId('player360-summary-band') OR
    //   page.locator('[data-testid="summary-band"]') OR
    //   semantic: page.locator('[role="region"][aria-label*="financial"]')
    // Selectors must NOT rely on positional/visual heuristics
    // Assert: at least one visible authority-labeled financial value within the region
  });

  // Optional third surface if accessible and stable:
  test('start-from-previous panel shows authority-labeled values', async ({ page }) => {
    // Locate panel using stable selector (data-testid preferred)
    // Assert authority label visible within panel container — not loose page-level assertion
  });
});

// ─── I5 Scenario 1: Partial Completeness ────────────────────────────────────

test.describe('I5 Scenario 1 — partial completeness rendering', () => {
  test('start-from-previous panel shows Partial badge for open visit', async ({ page }) => {
    // Navigate to a session with an open visit (seed Players 1/3/4)
    // Open start-from-previous panel using stable selector:
    //   page.getByTestId('start-from-previous-panel') OR equivalent data-testid
    // Assert: partial completeness badge is visible within panel container (not loose page)
    const panel = page.getByTestId('start-from-previous-panel'); // adjust to actual testid
    await expect(panel.getByText(/partial/i)).toBeVisible();
    // Assert: financial field cells within panel do not contain '$0.00' or blank
    // Locate cells by data-testid or label proximity — not positional index
    //   e.g., panel.getByTestId('field-total-buy-in').not.toHaveText('$0.00')
  });
});

// ─── I5 Scenario 2: Unknown Completeness (Theo) ─────────────────────────────

test.describe('I5 Scenario 2 — unknown completeness rendering', () => {
  test('player-360 Theo row shows Not computed for unknown state', async ({ page }) => {
    // Navigate to player-360 for a player with Theo-unknown state
    // Locate Theo row using stable selector within summary-band container:
    //   page.getByTestId('player360-summary-band').getByTestId('theo-row') OR
    //   page.getByTestId('summary-band').locator('[data-field="theo"]')
    // Selectors must not rely on text position or row index
    // Assert: 'Not computed' or 'Unknown' visible within the Theo row container
    const theoRow = page.getByTestId('summary-band').getByTestId('theo-row'); // adjust to actual testids
    await expect(theoRow.getByText(/not computed|unknown/i)).toBeVisible();
    // Assert: Theo row does not contain '$0.00' or bare zero currency value
    await expect(theoRow).not.toContainText('$0.00');
  });
});
```

**Assertion scope discipline (RULE-6, RULE-7):** 
- DOM authority assertions: assert PRESENCE of at least one authority-labeled value — do not assert every rendered currency value
- I5 completeness assertions: assert the specific badge text and absence of `$0.00` / blank / bare zero for the enumerated fields only (`total_buy_in`, `total_cash_out`, `net` for Scenario 1; Theo row for Scenario 2)

**Acceptance criteria:**
- [ ] `e2e/financial-enforcement.spec.ts` exists
- [ ] DOM authority assertions pass on shift-dashboard and player-360
- [ ] I5 Scenario 1: `Partial` badge visible; `$0.00` absent for `total_buy_in`, `total_cash_out`, `net`
- [ ] I5 Scenario 2: `Not computed` or `Unknown` visible near Theo row; `$0.00` and bare zero absent
- [ ] `npx playwright test e2e/financial-enforcement.spec.ts` exits 0

**Outputs:**
- `e2e/financial-enforcement.spec.ts`

---

### WS5: Validation and Tracker Closure

**Executor:** `qa-specialist`
**Phase:** 3 (sequential, depends on all)
**Depends on:** WS1, WS2, WS3, WS4

**Objective:** Run the full Phase 1.4 exit gate validation sequence and update rollout artifacts to record Phase 1.4 closure.

**Validation sequence (run in order, redirect output per agent shell safety rules):**

```bash
# Step 1: Lint gate
npm run lint > /tmp/exec-078-lint.log 2>&1
# Then read /tmp/exec-078-lint.log — must exit 0

# Step 2: Surface test gate
npm run test:surface > /tmp/exec-078-test-surface.log 2>&1
# Then read /tmp/exec-078-test-surface.log — must exit 0

# Step 3: E2E gate
npx playwright test e2e/financial-enforcement.spec.ts --reporter=list > /tmp/exec-078-e2e.log 2>&1
# Then read /tmp/exec-078-e2e.log — must exit 0
```

**ROLLOUT-TRACKER.json update:**

Update cursor block:
```json
{
  "cursor": {
    "wave": 1,
    "active_phase": "1.5",
    "phase_status": "not_started",
    "phase_label": "Phase 1.4 complete. Phase 1.5 (Rollout & Sign-off) pending.",
    "blocker": null,
    "last_closed_phase": "1.4",
    "last_closed_date": "<actual exit date YYYY-MM-DD>",
    "last_closed_exec": "EXEC-078"
  }
}
```

Add Phase 1.4 entry to `phases` array:
```json
{
  "phase": "1.4",
  "label": "Validation: Lint Enforcement + Truth-Telling Tests",
  "status": "complete",
  "exit_date": "<actual YYYY-MM-DD>",
  "exec_ref": "EXEC-078",
  "commit_sha": "<actual SHA from git log --oneline -1>",
  "exit_criteria_met": [
    "Criterion 2: Lint rule red on violations, active in CI",
    "Criterion 3: Truth-telling test suite passes, harness I5 subset"
  ]
}
```

**ROLLOUT-PROGRESS.md update:**
Sync Phase 1.4 row to `complete` status with exit date, EXEC-078 reference, and commit SHA.

**Acceptance criteria:**
- [ ] `npm run lint` exits 0 (confirmed in step 1)
- [ ] `npm run test:surface` exits 0 (confirmed in step 2)
- [ ] `npx playwright test e2e/financial-enforcement.spec.ts` exits 0 (confirmed in step 3)
- [ ] `ROLLOUT-TRACKER.json` cursor at `active_phase: "1.5"` with exit date, EXEC-078 ref, commit SHA
- [ ] `ROLLOUT-PROGRESS.md` Phase 1.4 row shows `complete` with matching metadata

**Outputs:**
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` (cursor + phases update)
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-PROGRESS.md` (Phase 1.4 closure sync)

---

## Anti-Invention Boundary

The following are explicitly prohibited in this EXEC-SPEC. If any workstream executor proposes these, halt and require FIB amendment:

| Prohibited | Why |
|-----------|-----|
| Service layer changes | Frozen — Phase 1.2B complete |
| API contract / OpenAPI changes | Frozen — Phase 1.2B-C complete (EXEC-076) |
| DTO shape changes | Frozen — Phase 1.3 complete (EXEC-077) |
| `FinancialValue.tsx` props changes | Frozen — Phase 1.3 frozen contract |
| `lib/format.ts` exported helper removal | Phase 1.5 or named follow-on |
| Full I1-I4 failure harness | Wave 2 — `finance_outbox` not present |
| `hold_percent` flagged by lint rule | DEF-NEVER invariant |
| `average_bet`, policy thresholds flagged | WAVE-1-CLASSIFICATION-RULES §6 |
| SQL migrations | Wave 2 |
| OpenAPI YAML lint tooling | Separate toolchain decision |

---

## Known Limitations

Documented per DoD §Documentation requirement:
1. **Representative runtime coverage:** API envelope tests cover 2 routes; Playwright covers 2-3 surfaces. Not exhaustive.
2. **No OpenAPI YAML lint:** Spectral/redocly deferred — not part of ESLint flat-config pattern.
3. **No full I1-I4 harness:** FailureFlags injection, crash simulation, outbox interaction are Wave 2.
4. **No `lib/format.ts` helper removal:** Formatters consolidated post-lint-guard in Phase 1.5 or later.
5. **DTO lint is allowlist-only:** Fields not in the explicit allowlist are not protected by `no-unlabeled-financial-value`; heuristic inference was rejected as unreliable.

---

## Phase 1.5 Entry Criteria (unlocked by this EXEC)

After WS5 completes with all gates passing:
- Wave 1 exit criterion 2 (**Lint rule red on violations, active in CI**) — met
- Wave 1 exit criterion 3 (**Truth-telling test suite passes, harness I5 subset**) — met
- Phase 1.5 Rollout & Sign-off entry unblocked
- ROLLOUT-TRACKER.json cursor at `active_phase: "1.5"`
