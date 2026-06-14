# Implementation Precis — EXEC-091 (Real-Execution Proof Mandate)

**Source FIB:** [FIB-H-RENDER-PROOF-001](./FIB-H-RENDER-PROOF-001-render-path-proof-mandate.md) (v3.1, Delivered)
**EXEC-SPEC:** `docs/21-exec-spec/EXEC-091-render-path-proof-mandate.md`
**Delivered:** 2026-06-14 — working tree on `main`, via `/build` pipeline
**Checkpoint:** `.claude/skills/build-pipeline/checkpoints/FIB-H-RENDER-PROOF-001.json` (`status: complete`)

---

## 1. What shipped

Two enforcement gates added to the `/build` pipeline, mirroring the existing write-path E2E mandate:

- **Gate A — Universal Test Fidelity** (stack-free, all slices). A touched `*.int.test.ts` / `*.integration.test.ts` file may not mock the Supabase **client constructor**. Preventive, not remedial — day-one yield verified **zero** across 65 repo int files. Not waivable.
- **Gate B — Real-Execution Proof Presence** (risk-triggered, derived-value surfaces only). The warranted real-execution tiers — service derivation, the surface's **own** projection route, component render — must exist and pass against the real DB/route at Phase 4.

No new accounting behavior, no new test framework, no change to the write-path mandate. Governance + pipeline infrastructure only.

---

## 2. Workstreams (all complete; consolidated by file-ownership to 4)

| WS | Executor | Deliverable |
|----|----------|-------------|
| WS1 | lead-architect | Governance landings: generalized PRD flag `renders_derived_value_surface` (financial flag retained as alias #1); `*ProjectionResponseDTO` suffix rule (DTO standard Pattern 5 + SLAD xref); prd-writer stub/DoD updated. |
| WS2 | devops-pt2 | `check-test-fidelity.py` (Gate A) + `classify-render-path.py` (Gate B classifier). Pure-stdlib, mirror `classify-write-path.py` I/O contract. |
| WS3 | devops-pt2 | Pipeline wiring in `SKILL.md` + `checkpoint-format.md`: GOV-010 trigger broadened, Stage-3 Gate-B classification, Phase-4 cheap-checks-first enforcement, auto-injection, waiver discipline, checkpoint schema. |
| WS4 | qa-specialist | Validation fixtures + classifier/fidelity unit suites (34 tests). |

**Dormant (deferred, FIB §F.8/§K.2):** design-time declaration in prd-writer/feature-pipeline. Reactivation requires a spec amendment.

---

## 3. Files changed

**New:**
- `.claude/skills/build-pipeline/scripts/check-test-fidelity.py`
- `.claude/skills/build-pipeline/scripts/classify-render-path.py`
- `.claude/skills/build-pipeline/scripts/__tests__/test_check_test_fidelity.py`
- `.claude/skills/build-pipeline/scripts/__tests__/test_classify_render_path.py`
- `.claude/skills/build-pipeline/__tests__/fixtures/render-proof/*` (Jest-invisible fixtures)
- `.claude/skills/build-pipeline/checkpoints/FIB-H-RENDER-PROOF-001.json`
- `docs/21-exec-spec/EXEC-091-render-path-proof-mandate.md`
- `docs/issues/gaps/render-path-proof-mandate/FIB-H-RENDER-PROOF-001-render-path-proof-mandate.md`
- `docs/issues/gaps/render-path-proof-mandate/IMPL-PRECIS-EXEC-091.md` (this file)

**Modified:**
- `.claude/skills/build-pipeline/SKILL.md`
- `.claude/skills/build-pipeline/references/checkpoint-format.md`
- `.claude/skills/prd-writer/SKILL.md`
- `.claude/skills/prd-writer/references/validation-checklist.md`
- `docs/70-governance/feature-intake/FEATURE-CLASSIFICATION-AND-TRANSPORT-SELECTION-STANDARD.yaml`
- `docs/25-api-data/DTO_CANONICAL_STANDARD.md`
- `docs/20-architecture/SERVICE_LAYER_ARCHITECTURE_DIAGRAM.md`

---

## 4. Key decisions

- **DEC-001 (frozen):** projection-return DTO suffix = `*ProjectionResponseDTO`; classifier regex `/Projection(ResponseDTO)?$/`. Chosen because the live `OperationalProjectionResponseDTO` (`services/player-financial/dtos.ts:437`) already conforms — **no rename, no migration**. The bare `*Projection` form was rejected (would have required a rename and yielded zero true positives today). The FIB-cited `TableInventoryAccountingProjection` type does not exist in code.
- **Flag generalization:** `renders_financial_surface_values` demoted to `alias_of: renders_derived_value_surface`, preserving every current GOV-010/SRL trigger (financial = strict subset; no behavioral regression).
- **Stack contract (FIB §I.1.c):** Gate B probes `npx supabase status -o env`, three-state **BLOCK / FAIL / PASS**, fail-closed. `blocked:stack_down` is distinct from a test failure and is **not** a `skip-render-proof` waiver. Flagged slices force `RUN_INTEGRATION_TESTS=true`; the integration lane is additive + conditional (non-derived builds stay stack-free). Component render tier runs under jsdom (separate invocation from the node integration lane).

---

## 5. Gate semantics (Phase-4 ordering, cheap-first)

1. **Gate A honesty** (stack-free grep) — all slices, before any stack spin-up. Override: `// integration-fidelity:allow <reason>`. Not waivable.
2. **Presence existence** — derived-value slices: all three warranted tier files must exist (absence = failure).
3. **Mount verification** — component imported + rendered on its declared operator surface.
4. **Stack probe** — three-state; BLOCK if local Supabase is down (never silent-pass).
5. **Execution** — `jest.integration.config.js` with `RUN_INTEGRATION_TESTS=true`, scoped glob, `trees/` + `.claude/` exclusions, output redirected.

Checkpoint fields: `gate_a_fidelity`, `gate_b_classification`, `gate_b_presence`. `status: complete` is blocked while `gate_b_presence ∈ {fail:*, blocked:*}` without a recorded waiver `issue_id`.

---

## 6. Validation

- **Unit tests:** 34 passed (pytest + unittest; Jest collects zero fixtures).
- **Gate A day-one yield:** zero (preventive) — no current int file mocks the client constructor.
- **Write-path mandate:** unchanged (verified byte-for-byte).
- **Type-check:** the slice introduces **zero** TS errors (all code under `.claude/**` or md/yaml). One **pre-existing, unrelated** failure exists in `app/api/dev/otp/route.ts:64` (TS2345, commit `596e387f`) — out of scope for this work.
- **Lint:** unaffected (`.claude/**` is eslint-ignored; remaining changes are markdown/yaml).

---

## 7. Scope boundaries & known limits

- **Self-modification:** the gates edit the build-pipeline skill that orchestrated this build. They take effect on the **next** `/build` — they did not gate their own delivery.
- **Declared-open detection hole (FIB §F.3/§K.5):** a derived value computed in a server component/hook with **no** `*Projection` GET route trips neither mechanical signal and relies solely on the honor-system flag. Intentionally not closed.
- **Out of scope (FIB §G):** write-path mandate changes; universal Gate B; a standalone all-casino-scoped-routes RLS tier (parked, FIB §K.1); retroactive Gate A; ADR amendments.
- **Pre-existing doc quirk:** `DTO_CANONICAL_STANDARD.md` now has two section-scoped `Pattern 5` headings (Canonical Patterns vs Semantics Enforcement) — pre-existing dual numbering; renumbering deferred (FIB §K.3).
