# FIB-H — Real-Execution Proof Mandate (Pipeline Infrastructure)

**Status:** Delivered — implemented via EXEC-091 (2026-06-14); gate-zero preconditions resolved (see §I.1)
**Artifact type:** Feature Intake Brief — Human Scope Authority
**Feature ID:** FIB-H-RENDER-PROOF-001
**Date opened:** 2026-06-14
**Priority:** P1
**Target decision horizon:** Before the next derived-value read surface enters the `/build` pipeline
**Related implementation:** `.claude/skills/build-pipeline` (write-path E2E mandate), PRD-090, PRD-091, ADR-044 (Testing Governance Posture), FIB-H-TIA-EXEMPLAR-ACCEPTANCE-CLOSURE-001
**Owner:** Architecture / Developer Experience (pipeline)

---

## A. Feature identity

**Feature name:**
Real-Execution Proof Mandate — pipeline gates that (A) universally forbid coverage theatre and (B) force real-execution proof for derived-value surfaces.

**Feature ID / shorthand:**
FIB-H-RENDER-PROOF-001 (v3.1 — two-gate model, route tier pulled)

**Related wedge / phase / slice:**
Build-pipeline hardening; companion to the existing write-path E2E mandate.

**Requester / owner:**
Architecture / Developer Experience

**Priority:**
P1

**Target decision horizon:**
Pre-emptive. The gates should land before the next derived-value read surface is generated through `/build`, so proof is born with the slice rather than retrofitted (PRD-091 is the current retrofit instance).

---

## B. Engineering problem statement

The `/build` pipeline has one mechanism that forces tests to exercise reality: the **write-path E2E mandate**, triggered by `classify-write-path.py` on mutation signals (`INSERT INTO`, `POST|PUT|PATCH|DELETE`, `<form>`, `withServerAction(`). A **read path that renders a derived value** emits zero such signals → `write_path_classification: "none"` → the E2E gate is skipped → Phase-4 DoD runs bare `npm test`, which passes green on mock-only tests.

This produced two distinct failures that an earlier draft of this FIB conflated:

1. **Coverage theatre (honesty):** a test file *named* `*.int.test.ts` that secretly mocks the DB. Documented during Loyalty remediation ("4 of 7 'integration' files were fully mocked unit tests with zero DB access") and named in ADR-044 (Testing Governance Posture, Context item 5). This failure is **not** specific to any surface type — it is universal.
2. **Absence (sufficiency):** a slice that derives a value the operator acts on but ships with *no* real-execution test at all — the PRD-090 / TIA case. This failure is **risk-specific**: a silently-wrong computed value is dangerous; a missing test on a trivial slice is not.

**These are two concerns with two correct scopes.** Honesty must be universal; sufficiency must be proportional to risk. v3 splits them into two gates so that universalizing the honest one does not drag the heavy sufficiency obligation onto every slice (which would violate the Over-Engineering Guardrail and convert the mandate into a waiver mill).

---

## C. Pilot-fit / current-slice justification

Derived-value surfaces (TIA, shift-financials, MTL/CTR thresholds, exclusion/eligibility, tier computations) are actively produced, and each currently risks the same unproven-slice outcome. Adding the gates once converts "retrofit proof in a follow-up PRD" into "proof shipped with the slice." This is a pipeline enforcement change only — no new accounting behavior, no new test framework, no change to the write-path mandate.

---

## D. Primary actor and engineering moment

**Primary actor:** the `/build` orchestrator (EXEC-SPEC generation + Phase-4 DoD) and, at design time, `prd-writer` / `feature-pipeline`.
**When:** Stage-3 EXEC-SPEC assembly (classification + injection) and Phase-4 DoD; earlier, during PRD authoring (surface declaration).
**Primary surface:** `.claude/skills/build-pipeline` (classifier, gate logic, checkpoint schema) + `prd-writer` / `feature-pipeline` templates.
**Trigger event:** any slice (Gate A) and, for Gate B, a slice that declares a derived-value surface.

---

## E. Feature Containment Loop

1. Any slice enters the pipeline → **Gate A (universal fidelity)** is in force: every integration-claiming test file touched by the slice must construct a real client. Gate A is cheap and stack-free, so it is checked first and fast-fails before any stack spin-up.
2. The Gate-B classifier runs alongside the write-path classifier → emits whether the slice declares a **derived-value surface**.
3. If a derived-value surface is detected → the pipeline auto-injects the proof workstreams its tiers warrant: service DB-integration, route-boundary (for the surface's own projection route), and component render.
4. Execution proceeds; injected workstreams are authored by domain experts against the real stack.
5. Phase 4 enforces **Gate A honesty** (cheap, first), then **Gate B presence** (the warranted tiers exist and pass against the real DB/route).
6. Verdicts and any Gate-B waiver (human-gated, issue-tracked) are recorded in the checkpoint.
7. The write-path mandate and ordinary non-derived reads are unaffected by Gate B; Gate A applies to all.

---

## F. Required outcomes

### F.1 Two-gate model (the core of v3)

The mandate is **two gates with two scopes**, because it enforces two separable concerns:

| Gate | Concern | Scope | Stack cost |
|------|---------|-------|-----------|
| **A — Test Fidelity** | honesty: a test that *claims* integration must really hit the DB | **universal** (all slices) | inspection-only; ~none |
| **B — Real-Execution Proof Presence** | sufficiency: the required real-execution tiers *exist* and pass | **risk-triggered** (derived-value surfaces) | high (needs live stack) |

Splitting them is the whole point of v3: universalize honesty without forcing the heavy sufficiency obligation onto trivial slices.

### F.2 Gate A — Universal Test Fidelity

For **every** slice, the gate **fails** if a test file **touched by the slice** that claims integration (`*.int.test.ts` / `*.integration.test.ts`) mocks the **Supabase client constructor** (`jest.mock('@/lib/supabase/server' | '@/lib/supabase/client')` or equivalent) or constructs no real client — the coverage-theatre failure (ADR-044 Context item 5; `qa-specialist/references/test-patterns.md` Anti-Pattern 5).

- **Scope is the slice's touched files, not the whole repo.** "Touched" = an integration-named file **created by the slice, or whose test body the slice modifies** (a pure rename or comment-only edit does not count). Gate A is **not** retroactive — it does not fail on pre-existing legacy mocked-but-named-int files left untouched; those are handled by the documented reclassification-comment baseline (`qa-specialist/references/integration-remediation-ops.md` §1). Modifying a legacy mock file's test body brings it into scope (convert or annotate it).
- **Targeted, not substring.** The match is the client constructor specifically — a real integration test that mocks an unrelated supabase-adjacent module (e.g. a notification sender) must pass.
- **Override:** an explicit `// integration-fidelity:allow <reason>` comment clears a flagged line.
- **Stack-free.** Gate A only *inspects files*; it does not run the suite, so it adds no stack dependency and applies cheaply everywhere.

**Gate A's limits (stated explicitly).** Gate A enforces only the *honesty* of files that *claim* integration. It does **not** guarantee a real test exists — a slice can name its mock `foo.test.ts` and Gate A has nothing to inspect; closing the *absence* gap is Gate B's job, and only for risk surfaces. Its day-one yield is also **zero** (verified: no `*.int.test.ts` currently mocks the client), so Gate A is **preventive**, not remedial. A green Gate A is not evidence of real coverage.

### F.3 Gate B classifier (risk trigger)

A deterministic classifier (`classify-render-path.py`, companion to `classify-write-path.py`, same I/O contract) emits which Gate-B tiers a slice warrants. Detection is **declared, not inferred**:

- **Derived-value surface** → service DB-integration tier + route-boundary tier (for the surface's **own** projection route) + component render tier. Signals:
  - **Primary (authoritative):** PRD frontmatter `renders_derived_value_surface: true` (generalizes the existing `renders_financial_surface_values` flag; the financial flag remains a recognized alias for instance #1). `prd-writer` must set this for any PRD whose surface computes a value the operator acts on (financial, MTL/CTR, eligibility, tier).
  - **Secondary (governed naming):** a new `GET` route returning a `*Projection`-suffixed DTO. Enforceable only because the suffix is a governance rule (projection-return DTOs must carry `*Projection`).
  - **Detection hole (declared, not closed):** a derived value computed in a **server component or hook with no `*Projection` GET route** trips *neither* mechanical signal and depends solely on the human-set primary flag. For that class the trigger is honor-system; the `*Projection` backstop covers route-based surfaces only. Closing this hole (e.g. a render-time annotation) is deferred — see K.

> **Route-boundary proof here is scoped to the derived-value surface's *own* projection route** (role matrix + cross-casino isolation), **not** a standalone mandate on all routes. A broad "every casino-scoped route needs an RLS integration test" tier was considered and **pulled** — it fired on 92% of routes (120/131, verified) and is a tenancy/security concern, not a derived-value-correctness one. It is parked as a likely sibling mandate (K), not opened.

**"Mounted on an operator surface" is not a classification signal** — the component does not exist at Stage-3. Mount is a Phase-4 verification (F.4). A plain non-derived read with no derived-value declaration returns `none` for Gate B (Gate A still applies).

### F.4 Gate B — Real-Execution Proof Presence (Phase 4, blocking)

For a flagged slice the gate runs **cheap checks first, stack last** (PRD-090 failed by *absence* — its tests were `*.test.ts`, not `*.int.test.ts`, so an honesty grep alone finds nothing; presence existence is therefore the load-bearing cheap check):

1. **Gate A honesty (cheap, first).** Grep the injected/touched integration files; fail fast if any mocks the Supabase client constructor (F.2). Runs before any stack spin-up.
2. **Presence existence (cheap).** Block unless all three warranted tiers' files exist for the derived-value surface:
   - service derivation `*.int.test.ts`;
   - the surface's **own** projection-route `*.int.test.ts` (role matrix + cross-casino isolation);
   - component render test (rendered states).
   Absence of any tier is a gate failure, not a warning.
3. **Mount verification (cheap).** Confirm the component is imported and rendered on its declared operator surface (the code now exists).
4. **Execution (expensive, stack).** Run `jest.integration.config.js` with `RUN_INTEGRATION_TESTS=true`, scoped to the affected context glob **with `trees/` and `.claude/worktrees/` exclusion flags** (`integration-remediation-ops.md` §4), output redirected per Agent Shell Safety. The warranted tiers must pass.

Auto-injection of the warranted workstreams (`WS_*_DB_INT`, `WS_*_ROUTE_INT`, `WS_*_COMPONENT`) mirrors the existing `WS_E2E` injection, with a visible banner. `WS_*_ROUTE_INT` here proves the derived surface's own projection route only.

### F.5 Waiver discipline (Gate B only)

Gate A is not waivable (honesty is non-negotiable and free). A **Gate B** waiver (`skip-render-proof`) requires:

- explicit **human approval at the approval gate** — the orchestrator may not self-waive;
- a **tracked follow-up issue id** in the checkpoint (`render_proof_waiver: {reason, issue_id}`).

A waiver without an issue id is invalid. (The precedent E2E mandate is empirically a waiver lane — ≥7 distinct waivers across checkpoints, several deferring the test; the issue-id requirement makes a deferral a visible debt, not a closed checkpoint.)

### F.6 Checkpoint accounting

Record `gate_a_fidelity: "pass" | "fail:{N}"`, `gate_b_classification: "derived_value" | "none"`, and `gate_b_presence: "pass" | "fail:{tiers}" | "waived:{issue_id}" | "not_applicable"`. **A build may not reach `status: complete` while `gate_b_presence` is `fail:*` without a recorded waiver `issue_id`** — completion is bound to the gate, not merely to the checkpoint being written.

### F.7 Validation fixtures

- **Gate A (universal) — synthetic:** no real `*.int.test.ts` currently mocks the client (verified: zero today), so Gate A's day-one yield is zero and its value is **preventive**. Construct a fixture that mocks the client constructor → Gate A **fails**; a legitimate integration test that mocks only an unrelated module → **passes**.
- **Gate B detection (route-based):** PRD-090 *as-shipped* (no flag) → detected via the `*Projection` secondary signal (`accounting-projection` returns `TableInventoryAccountingProjection`); with the flag backfilled → via primary.
- **Gate B detection (non-route hole):** a synthetic derived surface computed in a server component with **no** `*Projection` route → detected **only** if the flag is set; with the flag omitted it escapes, proving the honor-system limit named in F.3.
- **Gate B presence:** PRD-090's original test state (no `*.int.test.ts`) → **blocks on presence**, not merely on fidelity.
- **Pass fixture:** PRD-091's delivered state (real DB + own-route integration + mounted component render) → **passes**. Browser smoke is permitted surplus, not gate-checked.

### F.8 Design-time declaration (FAST-FOLLOW — deferred from MVP)

`prd-writer` / `feature-pipeline` set `renders_derived_value_surface: true` for derived-value PRDs and bake the warranted proof obligations into the DoD. Not part of the first slice; the gates do not depend on it. PRD-091's frozen DoD is the template source.

### F.9 Preserved existing behavior

- The write-path E2E mandate, its classifier, and its gate are unchanged.
- Ordinary non-derived, non-casino-scoped reads are untouched by Gate B.
- Human approval gates remain the sole release authority.

---

## G. Explicit exclusions

This slice does not include:

- changes to the write-path E2E mandate;
- making **Gate B presence** universal (explicitly rejected — see B/H: it is risk-disproportionate and a waiver-mill driver);
- a **standalone route/RLS proof tier on all casino-scoped routes** (considered and pulled — fires on 92% of routes; a tenancy/security concern parked for a sibling FIB, see K). A derived-value surface's own projection route is still proven within its triad;
- a requirement that every render path ship a browser E2E test (browser smoke stays under surface/exemplar discipline);
- retroactive application of Gate A to pre-existing legacy test files (handled by reclassification baseline, not by blocking builds);
- a new test framework, generic fixture platform, or Playwright redesign;
- auto-running integration where the local stack is not up (must block explicitly, never silently pass);
- amendment of ADR-044, ADR-015/020/024, or any TIA/financial ADR;
- replacing human approval gates with autonomous execution.

---

## H. Adjacent ideas considered and rejected

| Idea | Why it came up | Why it is out now |
|---|---|---|
| Make the whole gate universal (proof presence on every slice) | The honesty failure is universal | Conflates two concerns: honesty *is* universal (Gate A), but forcing the real-execution triad on trivial slices is risk-disproportionate (PT-OE-01), multiplies the stack dependency across all builds, and becomes a waiver mill. v3 universalizes only Gate A |
| Keep the trigger "financial-only" | Financial is the first instance | Too narrow — a silently-wrong MTL threshold or eligibility result is the same risk class. Trigger is "derived-value surface," financial is instance #1 |
| One classifier matching `GET` like write-path matches `POST` | Symmetry | "Derived value" has no literal token; v3 uses a declared flag + governed `*Projection` naming instead of pretending to infer it |
| Per-feature closure PRDs (PRD-091 style) | They work | The redundant retrofit this FIB eliminates |
| Documentation rule only (ADR-044 exists) | The prohibition already exists | A rule without a gate is what let PRD-090 ship; enforcement is the gap |
| Standalone route/RLS proof on all casino-scoped routes | Tenant bleed is real; a mock route test never exercises RLS | Fires on 92% of routes (120/131, verified) — disproportionate, and a *security* concern, not derived-value correctness. Pulled to a likely sibling (K). A derived surface's own route is still proven within its triad |

---

## I. Dependencies and assumptions

- The write-path E2E mandate is the structural pattern to mirror.
- `renders_financial_surface_values` exists (GOV-010 SRL gate); **v3 depends on generalizing it to `renders_derived_value_surface`** (or adding the latter with the former as alias) — net-new governance, flagged.
- The `*Projection`-suffix naming for projection-return DTOs **must be a governance rule** for the F.3 secondary signal; if not already mandated, adoption depends on establishing it.
- ADR-044 (Testing Governance Posture) names coverage theatre (Context item 5); `qa-specialist` Anti-Pattern 5 is the operational rule. **There is no ADR-044 §9** — prior skill prose mis-cited it. ADR-044 is also a **duplicated number** (cross-property-recognition-entitlement vs testing-governance-posture) — pre-existing defect, see K.
- **Local Supabase/Postgres must be running where Gate B executes.** DoD today runs `jest.node.config.js` (no integration); the integration runner (`test:verify`, `test:integration:canary`) is separate.

**Delegation (resolve during design):** the Gate-B stack-availability contract is owned by `devops-pt2`; the fidelity/heuristic design and the legacy-baseline scoping by `qa-specialist`; confirming `renders_derived_value_surface` and the `*Projection`-suffix as canonical governance rules by `lead-architect` (both are net-new/unconfirmed and the Gate-B trigger depends on them).

---

## I.1 Gate-zero preconditions (resolved 2026-06-14)

The two delegated preconditions were resolved by `lead-architect` (governance) and `devops-pt2` (stack contract) before acceptance. Both returned **CONDITIONAL GO**: neither Gate-B signal is buildable as originally assumed without a governance/infra landing first. These are **blocking dependencies** for the Gate-B classifier and execution lane — Gate A is unaffected and may land independently.

### I.1.a Primary signal — `renders_derived_value_surface` flag — **net-new, blocking**
- Base flag `renders_financial_surface_values` exists (`docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml` ~L910; enforced at GOV-010 SRL gate, `build-pipeline/SKILL.md:147`) — but its defining schema doc is itself `status: proposed`, so the base is *proposed*-canonical.
- The generalized flag exists only inside this FIB. **Must land before the classifier's primary branch is real:**
  1. Add `renders_derived_value_surface: {type: boolean, required: true}` to the classification standard yaml; demote `renders_financial_surface_values` to `alias_of` (retained for instance #1).
  2. Broaden the GOV-010 trigger from the financial flag to `(renders_derived_value_surface OR financial alias)`.
  3. Update `prd-writer` frontmatter stub + DoD checklist to the generalized flag.
- Alias soundness: confirmed (financial is a strict subset; no behavioral regression, no ADR amendment).

### I.1.b Secondary signal — `*Projection`-suffix DTO rule — **net-new + reconciliation, blocking the backstop**
- Not canonical anywhere (`DTO_CANONICAL_STANDARD.md` has zero "Projection"; SRM/Wave-2 "Projection Artifact" is a DB/domain term, not a DTO suffix). The one live projection route returns `OperationalProjectionResponseDTO` (`services/player-financial/dtos.ts:437`, Pattern 3 `*ResponseDTO`); the FIB-cited `TableInventoryAccountingProjection` type does not exist in code.
- **DECISION (frozen): adopt token `*ProjectionResponseDTO`; classifier matches `/Projection(ResponseDTO)?$/`.** This is backward-compatible with the existing `OperationalProjectionResponseDTO` — **no rename / no migration**. Rejected alternative: bare `*Projection` suffix, which would have required renaming the live DTO and yielded zero true positives today.
  1. Add a canonical "Projection Response DTO" pattern to `DTO_CANONICAL_STANDARD.md` mandating the `*ProjectionResponseDTO` suffix for GET routes returning a read-time-derived projection artifact.
  2. `classify-render-path.py` secondary signal regex = `/Projection(ResponseDTO)?$/` on GET route return DTOs.
  3. One-line cross-reference from SLAD + Wave-2 ubiquitous-language doc binding the suffix to the "Projection Artifact" concept term.

### I.1.c Stack contract — Gate-B execution lane — **blocking Gate-B execution**
- Phase-4 DoD runs `jest.node.config.js`, which structurally excludes `*.int.test.ts` → **Gate B cannot execute at all today.** `jest.integration.config.js` has no env gating → with `RUN_INTEGRATION_TESTS` unset the suite goes green via `describe.skip` having run nothing (the §G silent-pass hole, == PRD-090 failure mode).
- **Contract (frozen):**
  1. **Probe:** `timeout 15 npx supabase status -o env > /tmp/gateb-stack.env` — runs **only** on `gate_b_classification == "derived_value"`, immediately before the expensive step (after the cheap honesty/presence/mount checks).
  2. **Three-state verdict, fail-closed:** `PASS` / `FAIL (fail:{tiers})` / **`BLOCK (blocked:stack_down)`**. BLOCK is distinct from FAIL and is **not** a `skip-render-proof` waiver (infra-down ≠ deliberate deferral); it halts with non-zero exit and an operator message, never a silent green.
  3. **Forced flag on flagged slices:** the classifier-flagged path sets `RUN_INTEGRATION_TESTS=true` so `describe.skip` cannot mask absence.
  4. **Execution invocation:** `RUN_INTEGRATION_TESTS=true npx jest --config jest.integration.config.js --testPathPatterns='services/{context}/__tests__/' --testPathIgnorePatterns='trees/' --testPathIgnorePatterns='\.claude/' --ci --runInBand > /tmp/gateb-integration.log 2>&1`, read selectively (Agent Shell Safety).
  5. **Additive + conditional:** the integration lane is added to Phase-4 for flagged slices only; non-derived builds stay stack-free (Over-Engineering Guardrail preserved).
  6. **Two-config caveat:** the component-render tier runs under jsdom (`jest.config.js`), not the node integration config → Gate-B execution is two invocations; do not collapse them.

### I.1.d Sequencing
1. `renders_derived_value_surface` flag generalization (I.1.a) — cheap, no code.
2. `*ProjectionResponseDTO` suffix rule (I.1.b) — DTO-standard amendment, no rename.
3. Phase-4 conditional integration lane + probe wiring (I.1.c).
Gate A (universal fidelity grep) has no precondition and may land first/in parallel. Per §F.3 the primary flag is load-bearing; the `*Projection` backstop covers route-based surfaces only (the non-route detection hole stays declared-open per §K.5).

All three landings remain inside §K.4 / §G — no amendment of ADR-044/015/020/024 or any TIA/financial ADR; the pulled route/RLS tier (§K.1) stays closed.

---

## J. Acceptance gates

```yaml
acceptance_gates:
  gate_a_fidelity_universal:
    - any_slice_int_test_mocking_client_constructor_fails
    - touched_files_only_not_retroactive_repo_scan
    - legacy_mocked_int_file_outside_slice_does_not_block
    - unrelated_module_mock_with_real_db_passes
    - allow_comment_overrides_flagged_line
    - gate_a_runs_without_live_stack            # inspection-only
    - gate_a_checked_before_gate_b_stack_spinup
    - gate_a_does_not_guarantee_real_test_exists  # preventive only

  gate_b_classifier:
    - derived_value_flag_triggers_service_route_and_component_tiers
    - projection_suffix_route_triggers_detection
    - prd_090_without_flag_detected_via_projection_suffix
    - non_route_derived_surface_detected_only_via_flag
    - plain_non_derived_read_returns_none
    - mounted_component_is_not_a_classification_signal

  gate_b_presence_risk_triggered:
    - warranted_tier_absent_blocks_phase4
    - derived_value_requires_service_int_own_route_int_and_component_render
    - mount_verified_at_phase4
    - integration_glob_excludes_trees_and_worktrees
    - missing_local_stack_blocks_not_silently_passes
    - complete_blocked_if_presence_fail_without_waiver_issue_id

  waiver:
    - gate_a_is_not_waivable
    - gate_b_waiver_requires_human_approval_and_issue_id

  validation_fixture:
    - gate_a_synthetic_fixture_fails_on_mocked_client_constructor
    - gate_b_blocks_prd_090_original_on_presence
    - gate_b_passes_prd_091_delivered_state
    - non_route_derived_surface_without_flag_escapes_detection
    - browser_smoke_not_required_to_clear_gate_b

  quality:
    - write_path_mandate_unchanged
    - classifier_unit_tests_pass
```

---

## K. Out-of-scope but likely next

1. **Route/tenancy proof mandate** — a standalone tier proving real RLS isolation on casino-scoped routes (the tier pulled from v3). It fires on ~92% of routes and is a *security* concern, so it warrants its own FIB with its own proportionality argument. **Not yet opened** (per scope decision).
2. **F.8 design-time declaration** in `prd-writer` / `feature-pipeline` (cut from MVP).
3. Resolve the **duplicate ADR-044 number** and fix dangling "§9" citations in skill prose.
4. Establish/confirm the `*Projection`-suffix and `renders_derived_value_surface` governance rules if not already canonical.
5. Close the **non-route derived-surface detection hole** (server-component/hook with no `*Projection` route) if that class proliferates.

---

## L. Expansion trigger rule

Amend if implementation proposes: changing the write-path mandate; making Gate B presence universal; opening the pulled route/tenancy tier inside this FIB instead of a sibling; a new required tier for all reads; a new test framework; enforcement scope beyond derived-value surfaces; retroactive Gate A; autonomous execution replacing human gates; or amendment of ADR-044 / TIA ADRs.

---

## M. Scope authority block

**Intake version:**
v3.1 — two-gate model, route tier pulled. Splits the v2 single gate into **Gate A (universal Test Fidelity)** and **Gate B (risk-triggered Real-Execution Proof Presence)**; generalizes the trigger from "financial" to "derived-value surface" (financial = instance #1). **Route-boundary proof is retained only for a derived-value surface's own projection route** — the standalone "all casino-scoped routes" tier was pulled per DA audit (fired on 92% of routes; a security concern parked in K). Also: defined Gate A "touched files" scope; reordered Gate A ahead of the stack; named the non-route detection hole; bound `status: complete` to a waiver issue_id; stated Gate A's preventive limits. Supersedes v2.

**Frozen for downstream design:**
Yes — accepted 2026-06-14; gate-zero preconditions resolved (§I.1), suffix token frozen to `*ProjectionResponseDTO`.

**Downstream expansion allowed without amendment:**
No

**Scope authority:**
Governs only the addition of the two proof gates to the build pipeline and their design-time declaration. Does not supersede or amend the write-path mandate, ADR-044, ADR-015/020/024, ADR-059/060/061, or PRD-090/091.

**Completion definition:**

> Complete when (A) every slice's integration-claiming touched files are mechanically barred from mocking the Supabase client (universal, stack-free), and (B) derived-value surfaces are blocked at Phase-4 unless their warranted real-execution tiers (service derivation, own projection route, component render) exist and pass against the real DB/route — proven by Gate A failing a mocked non-financial int test, Gate B blocking PRD-090's original absence, and Gate B passing PRD-091's delivered state. A documentation rule, a checklist item, or a per-feature closure PRD does not satisfy this mandate.

**Human approval / sign-off:**
Approved 2026-06-14 (human scope authority). Gate-zero preconditions resolved and frozen (§I.1); cleared for implementation.
