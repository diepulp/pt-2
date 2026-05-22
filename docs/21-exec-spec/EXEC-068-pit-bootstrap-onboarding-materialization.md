---
prd: PRD-068
prd_title: "Pit Bootstrap — Onboarding Materialization (Pilot Slice)"
service: FloorLayoutService
mvp_phase: 1
created: 2026-04-22
status: draft

# Intake Authority Chain
fib_h: docs/issues/gaps/pit-bootstrap/FIB-PIT-BOOTSTRAP-001.md
fib_s: docs/issues/gaps/pit-bootstrap/FIB-S-PIT-BOOTSTRAP-001.json
adr_refs: [ADR-015, ADR-018, ADR-020, ADR-024, ADR-030]

# GOV-010 posture
gov010_status: waived
gov010_waiver_reason: "FIB-H + FIB-S supply scaffold-equivalent decomposition (intake_ref + structured_ref both present)."

# Write-path classification (Test-per-PRD mandate)
write_path_classification: detected
write_path_signals:
  - "RPC workstream WS1 creates SECURITY DEFINER function with multi-table INSERT (floor_layout, floor_layout_version, floor_layout_activation, floor_pit, floor_table_slot)"
  - "Service workstream WS2 exposes a mutation method (bootstrapCasinoPitLayout)"
  - "Action workstream WS3 invokes mutation from completeSetupAction"

workstreams:

  WS1:
    name: Bootstrap RPC migration + structural invariants
    description: >
      Create rpc_bootstrap_casino_pit_layout() as SECURITY DEFINER per
      PRD-067 RPC pattern (SET search_path='', REVOKE/GRANT, admin guard).
      RPC body realizes STEP-1..STEP-5 atomically. Regenerates
      types/database.types.ts via db:types-local. Adds TWO partial unique
      indexes as RULE-2 and RULE-7 database teeth:
      (1) UNIQUE ux_floor_layout_activation_active_one_per_casino
          ON floor_layout_activation(casino_id) WHERE deactivated_at IS NULL
          (RULE-7 race fence for concurrent first-time bootstraps).
      (2) UNIQUE ux_floor_pit_layout_version_label_lower
          ON floor_pit(layout_version_id, lower(label))
          (RULE-2 duplicate-pit defense in depth).
      Both created UNCONDITIONALLY with IF NOT EXISTS (idempotent DDL),
      NOT "conditional on current state" — the base schema omits both.
    executor: backend-service-builder
    executor_type: skill
    depends_on: []
    traces_to: [CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, RULE-2, RULE-3, RULE-4, RULE-5, RULE-6, RULE-7, RULE-8, RULE-9, STEP-1, STEP-2, STEP-3, STEP-4, STEP-5, OQ-1, OQ-2, OQ-3]
    outputs:
      - supabase/migrations/20260422183640_prd068_bootstrap_casino_pit_layout_rpc.sql
      - types/database.types.ts   # regenerated via npm run db:types-local
    gate: schema-validation
    estimated_complexity: medium

  WS2:
    name: FloorLayoutService.bootstrapCasinoPitLayout + DTOs
    description: >
      Thin service wrapper around the WS1 RPC. No casino_id parameter on
      the published interface (ADR-024 INV-8 — context authoritative).
      Adds BootstrapResult DTO to dtos.ts. No Zod schema (no user input).
      Exposed via createFloorLayoutService factory.
    executor: backend-service-builder
    executor_type: skill
    depends_on: [WS1]
    traces_to: [CAP-2, CAP-3, CAP-4, CAP-5, RULE-9, STEP-2, STEP-3, STEP-4, STEP-5]
    outputs:
      - services/floor-layout/dtos.ts           # add BootstrapResult DTO
      - services/floor-layout/crud.ts           # add bootstrapCasinoPitLayout fn
      - services/floor-layout/index.ts          # export method + interface
      - services/floor-layout/README.md         # document new method
    gate: type-check
    estimated_complexity: low

  WS3:
    name: Onboarding completion wiring
    description: >
      Extend app/(onboarding)/setup/_actions.ts completeSetupAction to
      invoke FloorLayoutService.bootstrapCasinoPitLayout() after
      rpc_complete_casino_setup succeeds. OnboardingService remains a
      TRIGGER HOST only — does not touch floor_layout_* directly. Emits
      one structured log event per invocation via the existing log helper
      used elsewhere in _actions.ts. Short-circuits on already_bootstrapped.
      Admin-role guard retained. CompleteSetupResult return type is
      UNCHANGED — bootstrap outcome is observable only via the structured
      log, NOT via the action response payload (preserves DEC-004 literally).
    executor: api-builder
    executor_type: skill
    depends_on: [WS2]
    traces_to: [CAP-1, CAP-7, RULE-1, RULE-6, RULE-7, RULE-8, STEP-1, STEP-6, OQ-4]
    outputs:
      - app/(onboarding)/setup/_actions.ts      # extend completeSetupAction
    gate: test-pass
    estimated_complexity: low

  WS4:
    name: Integration tests (RPC + service + onboarding action)
    description: >
      Mode C JWT auth per PRD-067 pattern. 9 test groups mirroring PRD
      §8 DoD. Verifies RULE-2..RULE-8 at database, service, and action
      layers. Gates on RUN_INTEGRATION_TESTS=true.
    executor: qa-specialist
    executor_type: skill
    depends_on: [WS3]
    traces_to: [RULE-2, RULE-3, RULE-4, RULE-5, RULE-6, RULE-7, RULE-8, CAP-5, CAP-6, DEC-001, DEC-002, DEC-003, DEC-004, infrastructure, FINDING-1, FINDING-2, FINDING-4, FINDING-5, FINDING-6]
    outputs:
      - services/floor-layout/__tests__/rpc-bootstrap-casino-pit-layout.int.test.ts
    gate: test-pass
    estimated_complexity: medium

  WS5:
    name: E2E write-path test (Appendix A success test)
    description: >
      Playwright spec realizing PRD §Appendix A verbatim. Mandated by
      write-path detection. Depends on WS3 only (does not require WS4).
    executor: e2e-testing
    executor_type: skill
    depends_on: [WS3]
    traces_to: [CAP-7, OUT-5, OUT-6, STEP-6, infrastructure]
    outputs:
      - e2e/admin/pit-bootstrap-onboarding.spec.ts
    gate: e2e-write-path
    estimated_complexity: medium

  WS6:
    name: Governance docs + EXEC-SPEC decisions block
    description: >
      SRM update for FloorLayoutService (adds bootstrapCasinoPitLayout to
      published interface; notes OnboardingService remains trigger host
      only — no new bounded context). Decisions block in this EXEC-SPEC
      records OQ-1..OQ-4 resolutions with verification evidence.
    executor: lead-architect
    executor_type: skill
    depends_on: [WS1, WS2]
    traces_to: [RULE-9, OQ-1, OQ-2, OQ-3, OQ-4, infrastructure]
    outputs:
      - docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md   # FloorLayoutService section
      - docs/21-exec-spec/EXEC-068-pit-bootstrap-onboarding-materialization.md   # decisions block (this file)
    gate: lint
    estimated_complexity: low

# Execution topology
execution_phases:
  - name: Phase 1 — RPC + schema
    parallel: [WS1]
    gates: [schema-validation]
  - name: Phase 2 — Service wrapper
    parallel: [WS2]
    gates: [type-check]
  - name: Phase 3 — Wiring + governance
    parallel: [WS3, WS6]
    gates: [test-pass, lint]
  - name: Phase 4 — Tests
    parallel: [WS4, WS5]
    gates: [test-pass, e2e-write-path]

# Gate definitions (canonical names from build-pipeline taxonomy; commands tailored to PRD-068)
gates:
  schema-validation:
    command: npx supabase migration up --local && npm run db:types-local && npm run type-check
    success_criteria: "Migration applies cleanly, types regenerate, tsc passes"
  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0"
  test-pass:
    command: RUN_INTEGRATION_TESTS=true npm test -- services/floor-layout/__tests__/rpc-bootstrap-casino-pit-layout.int.test.ts > /tmp/exec068-int.log 2>&1
    success_criteria: "All 11 test groups (a)-(k) pass"
  e2e-write-path:
    command: npx playwright test e2e/admin/pit-bootstrap-onboarding.spec.ts --reporter=list > /tmp/exec068-e2e.log 2>&1
    success_criteria: "At least 1 spec exists, all tests pass"
  lint:
    command: npm run lint -- "app/(onboarding)/setup/_actions.ts" "services/floor-layout/" && grep -q "bootstrapCasinoPitLayout" docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md
    success_criteria: "Lint clean on touched files; SRM mentions the new method"

# Decisions (open-question resolutions per FIB-S governance)
decisions:
  - decision_id: DEC-001
    resolves_open_question: "OQ-1"
    decision_statement: >
      Pit-name equivalence is computed as lower(btrim(pit)). Canonical
      stored label on floor_pit.label is the first observed btrim(pit)
      within each normalized group, chosen deterministically by
      (ORDER BY lower(btrim(pit)) ASC, gaming_table.created_at ASC, gaming_table.id ASC LIMIT 1).
    rationale: >
      PRD §2.3, §11.1, and §14 forbid elevating this rule into a
      normalization standard, naming-governance doc, or operator-facing
      reconciliation UX. The entire rule lives as one SQL expression
      inline in the RPC. The tiebreaker on (created_at, id) is
      deterministic across any two backfilled databases with identical
      input rows.
    impact_on_scope: none
    verification: assumption
    verification_evidence: "Assumption pending WS1 implementation. The SQL expression lower(btrim(pit)) is trivial; the tiebreaker (created_at ASC, id ASC) is the novel part. Verification tests: (1) WS4 group (c) — 'Main' / 'main ' / 'MAIN' collapse to ONE floor_pit with label='Main' (first by created_at); (2) Finding-5 unique index ux_floor_pit_layout_version_label_lower provides independent database enforcement."
    verification_test: "WS4 group (c)"

  - decision_id: DEC-002
    resolves_open_question: "OQ-2"
    decision_statement: >
      gaming_table.type → floor_table_slot.game_type is an identity map.
      Both columns reference Database['public']['Enums']['game_type']
      (same PostgreSQL enum). No translation table is required. A NULL
      input is defensively treated as fail-closed (raise exception,
      rollback transaction, no partial commit), but in practice
      gaming_table.type is NOT NULL in schema.
    rationale: >
      types/database.types.ts line 613 (floor_table_slot.game_type) and
      line 809 (gaming_table.type) both resolve to the same enum type.
      A mapping table would be over-engineering (violates
      OVER_ENGINEERING_GUARDRAIL). The defensive NULL check is retained
      because the RPC runs with SECURITY DEFINER and should not assume
      schema invariants hold at all times.
    impact_on_scope: none
    verification: cited
    verification_evidence: "types/database.types.ts:613, 809 — both columns reference Database['public']['Enums']['game_type']."

  - decision_id: DEC-003
    resolves_open_question: "OQ-3"
    decision_statement: >
      Bootstrap transport is a SECURITY DEFINER RPC
      (rpc_bootstrap_casino_pit_layout). FloorLayoutService exposes a
      thin method wrapper (bootstrapCasinoPitLayout) that invokes the
      RPC. OnboardingService remains a trigger host only.
    rationale: >
      RULE-6 requires atomic commit of the 5-table bootstrap write set
      (floor_layout + floor_layout_version + floor_layout_activation +
      floor_pit + floor_table_slot). A JS-composed multi-insert in the
      service layer cannot satisfy this without a server-side
      transactional boundary. The RPC body IS the transaction boundary.
      ADR-018 governance (SET search_path='', REVOKE ALL FROM PUBLIC,
      GRANT EXECUTE TO authenticated, admin-role guard via
      set_rls_context_from_staff) is the established canonical pattern
      (supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql
      is the template).
    impact_on_scope: none
    verification: pattern_reference
    verification_evidence: "supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql lines 38-342 is the canonical SECURITY DEFINER pattern being followed (ADR-018 + ADR-024 + ADR-030 compliant). This citation verifies the PATTERN exists, not THIS RPC's behavior. Transactional atomicity of the 5-table write set is verified by WS4 group (e) — forced mid-transaction failure rolls back all canonical rows."
    verification_test: "WS4 group (e)"

  - decision_id: DEC-004
    resolves_open_question: "OQ-4"
    decision_statement: >
      Wizard completion UI is not modified. Bootstrap outcome is
      observable ONLY via the structured log event emitted by the RPC
      and the server action. The CompleteSetupResult response payload is
      UNCHANGED — no bootstrap field is added. Admins discover bootstrap
      success by opening /admin/settings/operations, which is the
      intended hand-off point per PRD §5.1 CAP-7 and FIB-S STEP-6.
      On bootstrap failure, the action returns an INTERNAL_ERROR with
      stable code BOOTSTRAP_FAILED; the wizard surfaces this as a
      retryable error. Admin retry path: re-click Complete on wizard
      step 5 — rpc_complete_casino_setup returns already_ready
      (idempotent), then bootstrap re-attempts (RULE-7 idempotent).
    rationale: >
      PRD §6, §11.1, and §14 hold this as the pilot default and flag any
      wizard UI change as amendment-required. The existing wizard
      completion success path already signals success — bootstrap
      outcome piggybacks on that without a new surface.
    impact_on_scope: none
    verification: assumption
    verification_evidence: >
      Verification test injected into WS4 test group (j):
      "CompleteSetupResult is byte-identical pre-/post-WS3 on success paths
      (TypeScript type diff shows zero additions/removals; no bootstrap
      field on the response envelope). Only a failed bootstrap escalates
      to an action-level INTERNAL_ERROR response with stable code
      BOOTSTRAP_FAILED — the error branch's payload shape is also
      pre-existing (existing ServiceResult error envelope)."
    verification_test: "WS4 group (j)"

# Risks (carried forward from PRD §7.2)
risks:
  - risk: "R1 — Pit-name equivalence rule (resolved by DEC-001)"
    mitigation: "See DEC-001. Verified in WS4 test group (c)."
  - risk: "R2 — gaming_table.type → game_type mapping (resolved by DEC-002)"
    mitigation: "See DEC-002. Identity map. Defensive NULL fail-closed retained."
  - risk: "R3 — Transport choice (resolved by DEC-003)"
    mitigation: "See DEC-003. SECURITY DEFINER RPC selected due to RULE-6 atomicity."
  - risk: "R4 — Wizard UX (resolved by DEC-004)"
    mitigation: "See DEC-004. No UI change. Verification test in WS4 group (j)."
  - risk: "R5 — Partial failure during bootstrap (carried forward; tested in WS4 group (e))"
    mitigation: "RPC body is a single transaction; any exception rolls back all 5-table writes. Admin sees action-level error and can retry (idempotent per RULE-7)."
  - risk: "R6 — Concurrent completion race (tested in WS4 group (k))"
    mitigation: "Two database-level guards applied unconditionally in WS1 migration: (1) ux_floor_layout_activation_active_one_per_casino partial unique index on (casino_id) WHERE deactivated_at IS NULL (primary race fence — Finding 1); (2) pre-existing UNIQUE (casino_id, activation_request_id) constraint combined with the fixed string 'prd068_pit_bootstrap_v1' (secondary guard — Finding 6). Second concurrent call either short-circuits via EXISTS or errors with unique violation and rolls back entirely."
  - risk: "R7 — Backfill for pre-existing casinos (EXPLICITLY DEFERRED — §11.2)"
    mitigation: "OUT OF SCOPE. Any backfill requires a separate PRD with its own safety design. EXEC-SPEC must not introduce a backfill helper, CLI, or migration."
  - risk: "R8 — gaming_table.pit drift post-bootstrap (OUT OF SCOPE — belongs to PRD-067 OQ-1)"
    mitigation: "Not addressed by this slice. RULE-5 holds: bootstrap is read-only on gaming_table."

# Containment note (FIB-S governance.amendment_required_for)
containment_enforcement:
  frozen_boundaries:
    - "No rewriting or deleting gaming_table.pit during bootstrap"
    - "No UI surface for manual pit selection during onboarding"
    - "No admin UI to re-run or reset bootstrap"
    - "No bidirectional sync between gaming_table.pit and canonical mapping"
    - "No layout versioning or designer UX as part of this slice"
    - "No version-lifecycle mechanic (promotion workflow, draft/published states, layout_payload authoring, multi-version branching)"
    - "No backfill for casinos onboarded before this slice ships"
    - "No CI rule, lint rule, or governance gate added as part of this slice"
    - "No change to PRD-067's panel behavior driven by this slice"
    - "No new bounded context or service (OnboardingService is a trigger host; FloorLayoutService is extended, not split)"
  enforcement_mechanism: >
    Any workstream output that introduces a new operator-visible
    surface, public API endpoint, new CI rule, or new bounded context
    BLOCKS the pipeline via intake-traceability audit (see
    references/intake-traceability-protocol.md §Anti-invention scan).
---

# EXEC-068: Pit Bootstrap — Onboarding Materialization (Pilot Slice)

## Overview

PRD-068 materializes the free-text pit names collected during the onboarding setup wizard (`gaming_table.pit`) into the canonical floor layout mapping (`floor_layout` → `floor_layout_version` → `floor_layout_activation` + `floor_pit` + `floor_table_slot`) that PRD-067's admin pit configuration panel reads. It ships as a **one-shot SECURITY DEFINER RPC** invoked from the existing onboarding completion server action. **No new UI, no canonicalization, no version lifecycle, no backfill.** The deliverable is the minimum row-set that lets PRD-067's existing read path resolve a populated mapping on first open.

This is a **backend-only, pattern-A, hard-atomic** slice. It adds no new services, no new bounded contexts, no new public APIs, and no new operator surfaces. The execution plan is 6 workstreams across 4 phases.

## Scope

### In scope
- One new SECURITY DEFINER RPC (`rpc_bootstrap_casino_pit_layout`) with ADR-018 + ADR-024 compliance.
- One new FloorLayoutService method (`bootstrapCasinoPitLayout`) as a thin wrapper.
- One edit to `app/(onboarding)/setup/_actions.ts completeSetupAction` to invoke the service method post-`rpc_complete_casino_setup`.
- Integration tests covering all 9 DoD cases.
- One Playwright E2E spec covering PRD §Appendix A.
- SRM update for the new published method.

### Out of scope (non-negotiable)
- Everything listed in PRD §2.3 and §11.1 and mirrored in `containment_enforcement.frozen_boundaries` above.

## Architecture Context

**Primary service:** FloorLayoutService (`services/floor-layout/`) — mutation owner per SRM.

**Trigger host:** `app/(onboarding)/setup/_actions.ts` server action module (not a service; onboarding is surface-layer wiring).

**Cross-context reads:** `gaming_table` (owned by TableContextService) read-only inside the RPC body.

**Relevant ADRs:**
- **ADR-015**: Connection pooling + RLS strategy. The RPC uses `SET LOCAL` session vars via `set_rls_context_from_staff()`.
- **ADR-018**: SECURITY DEFINER governance. RPC sets `search_path = ''`, revokes from PUBLIC, grants EXECUTE to authenticated only.
- **ADR-020**: Track A hybrid RLS (pilot).
- **ADR-024 INV-8**: Authoritative context derivation — NO `casino_id` parameter on the RPC. Context comes from `app.casino_id` session var set by `set_rls_context_from_staff()` from the JWT `staff_id` claim + active-staff lookup.
- **ADR-030 D4**: Write-path session-var enforcement on `floor_layout_*` tables — writes use `current_setting('app.casino_id')` without JWT COALESCE fallback.

**Canonical RPC pattern reference:** `supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql` (PRD-067 pit assignment RPCs).

## Workstream Details

### WS1 — Bootstrap RPC migration + structural invariants

**Purpose.** Create the SECURITY DEFINER RPC that realizes STEP-1..STEP-5 atomically. Regenerate TypeScript types.

**Deliverables.**
1. Migration `supabase/migrations/20260422183640_prd068_bootstrap_casino_pit_layout_rpc.sql` with:
   - `CREATE FUNCTION public.rpc_bootstrap_casino_pit_layout() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';`
   - Function body:
     1. `PERFORM public.set_rls_context_from_staff();`
     2. Admin-role guard: `IF current_setting('app.staff_role', true) <> 'admin' THEN RAISE EXCEPTION 'forbidden'; END IF;` — must be the **FIRST** conditional after context derivation.
     3. Derive `v_casino_id uuid := current_setting('app.casino_id')::uuid; v_actor_id uuid := current_setting('app.actor_id')::uuid;`
     4. Short-circuit: `IF EXISTS (SELECT 1 FROM public.floor_layout_activation WHERE casino_id = v_casino_id AND deactivated_at IS NULL) THEN RETURN jsonb_build_object('ok', true, 'outcome', 'already_bootstrapped', 'casino_id', v_casino_id, ...); END IF;`
     5. `INSERT INTO public.floor_layout (casino_id, name, description, created_by) VALUES (v_casino_id, 'Default', '', v_actor_id) RETURNING id INTO v_layout_id;`
     6. `INSERT INTO public.floor_layout_version (layout_id, version_no, status, created_by) VALUES (v_layout_id, 1, 'active', v_actor_id) RETURNING id INTO v_version_id;` — **explicit `status = 'active'`**; do NOT supply `layout_payload` (schema default `'{}'::jsonb` applies; FIB-S §K "no payload authoring" satisfied).
     7. `INSERT INTO public.floor_layout_activation (casino_id, layout_version_id, activated_by, activation_request_id) VALUES (v_casino_id, v_version_id, v_actor_id, 'prd068_pit_bootstrap_v1');` — **fixed `activation_request_id` string literal** (see Acceptance note 3 below).
     8. `INSERT INTO public.floor_pit (layout_version_id, label, sequence) SELECT DISTINCT ON (lower(btrim(pit))) v_version_id, btrim(pit), row_number() OVER (ORDER BY lower(btrim(pit))) FROM public.gaming_table WHERE casino_id = v_casino_id AND pit IS NOT NULL AND btrim(pit) <> '' ORDER BY lower(btrim(pit)), created_at ASC, id ASC;`
     9. `INSERT INTO public.floor_table_slot (layout_version_id, pit_id, slot_label, game_type, preferred_table_id) SELECT v_version_id, fp.id, gt.label, gt.type, gt.id FROM public.gaming_table gt JOIN public.floor_pit fp ON fp.layout_version_id = v_version_id AND lower(fp.label) = lower(btrim(gt.pit)) WHERE gt.casino_id = v_casino_id AND gt.pit IS NOT NULL AND btrim(gt.pit) <> '';`
     10. `RAISE LOG 'PRD-068 bootstrap: casino=% version=% pits=% slots=% unassigned=%', v_casino_id, v_version_id, v_pits_created, v_slots_created, v_tables_without_pit;`
     11. Return `jsonb_build_object('ok', true, 'outcome', 'success', ...)`.
   - `REVOKE ALL ON FUNCTION public.rpc_bootstrap_casino_pit_layout() FROM PUBLIC;`
   - `GRANT EXECUTE ON FUNCTION public.rpc_bootstrap_casino_pit_layout() TO authenticated;`
   - `COMMENT ON FUNCTION ...` with PRD-068 ref and DEC-001/DEC-002/DEC-003 citations.
   - **Two UNCONDITIONAL partial unique indexes** (idempotent via `IF NOT EXISTS`; the base schema omits BOTH — verified):
     - `CREATE UNIQUE INDEX IF NOT EXISTS ux_floor_layout_activation_active_one_per_casino ON public.floor_layout_activation(casino_id) WHERE deactivated_at IS NULL;` (Finding 1 — RULE-7 race fence)
     - `CREATE UNIQUE INDEX IF NOT EXISTS ux_floor_pit_layout_version_label_lower ON public.floor_pit(layout_version_id, lower(label));` (Finding 5 — RULE-2 duplicate defense)
2. Regenerated `types/database.types.ts` via `npm run db:types-local`.

**Hard constraints.**
- **No UPDATE or DELETE against `public.gaming_table`** (RULE-5). Migration must include an explanatory comment asserting this.
- **No `casino_id` parameter** on the function signature (ADR-024 INV-8).
- **No new table**, no new enum, no new audit subsystem.
- **No mapping table** for game_type (DEC-002 — identity map inline; `gt.type` assigned directly to `floor_table_slot.game_type`).
- **MUST NOT call** `public.rpc_create_floor_layout` or `public.rpc_activate_floor_layout` (Finding 3). Both pre-existing RPCs accept spoofable `p_casino_id` / `p_created_by` parameters and use `SET search_path = public` — they pre-date ADR-024 and ADR-030. Refactoring them is out of scope per PRD §11.1. This RPC inlines operations with modern compliance instead.
- **`floor_layout_version.status` = `'active'`** (NOT the column default `'draft'`); otherwise PRD-067's read path may treat the version as non-active.
- **`floor_layout_version.layout_payload`** NOT supplied; schema default applies (FIB-S §K "no payload authoring").
- **`floor_layout_activation.activation_request_id`** = fixed string literal `'prd068_pit_bootstrap_v1'` — the pre-existing `UNIQUE (casino_id, activation_request_id)` constraint then becomes a secondary idempotency guard alongside the new partial unique index (Finding 6 defense in depth).

**Acceptance criteria.**
- [ ] `npx supabase migration up --local` applies cleanly.
- [ ] `npm run db:types-local` generates types without error; `rpc_bootstrap_casino_pit_layout` appears in `Database['public']['Functions']`.
- [ ] `npm run type-check` exits 0.
- [ ] Migration diff shows zero statements touching `gaming_table` (read-only) — verifiable by `grep -E "UPDATE|DELETE.*gaming_table" supabase/migrations/20260422183640_*.sql` returning zero matches.
- [ ] Function signature has zero parameters.
- [ ] Function body references only fully-qualified `public.*` names (ADR-018 `SET search_path = ''` compliance) — verifiable by `grep -En "^\s*(INSERT|SELECT|UPDATE|DELETE)\s+(INTO\s+)?(?!public\.)" supabase/migrations/20260422183640_*.sql` returning zero matches.
- [ ] Static review: admin-role guard is the FIRST conditional statement after `set_rls_context_from_staff()`.
- [ ] **Static guard (Finding 3)**: `grep -E "rpc_create_floor_layout|rpc_activate_floor_layout" supabase/migrations/20260422183640_*.sql` returns zero matches.
- [ ] **Structural check (Finding 1)**: `psql -c "\d+ public.floor_layout_activation"` after migration shows `ux_floor_layout_activation_active_one_per_casino` with `WHERE (deactivated_at IS NULL)` predicate.
- [ ] **Structural check (Finding 5)**: `psql -c "\d+ public.floor_pit"` shows `ux_floor_pit_layout_version_label_lower` on `(layout_version_id, lower(label))`.
- [ ] **Version status (Finding 2)**: WS4 group (a) asserts `floor_layout_version.status = 'active'` for the bootstrapped version.
- [ ] **activation_request_id (Finding 6)**: WS4 group (d) asserts the bootstrapped activation row has `activation_request_id = 'prd068_pit_bootstrap_v1'`.

### WS2 — FloorLayoutService.bootstrapCasinoPitLayout + DTOs

**Purpose.** Expose the RPC through the service layer as the canonical mutation seam (RULE-9).

**Deliverables.**
1. `services/floor-layout/dtos.ts` — add:
   ```ts
   export type BootstrapOutcome = 'success' | 'already_bootstrapped' | 'failed';

   export interface BootstrapResult {
     ok: boolean;
     outcome: BootstrapOutcome;
     casino_id: string;
     layout_version_id: string | null;
     pits_created: number;
     slots_created: number;
     tables_without_pit: number;
   }
   ```
2. `services/floor-layout/crud.ts` — add `bootstrapCasinoPitLayout(supabase)` that calls `supabase.rpc('rpc_bootstrap_casino_pit_layout')` and maps the jsonb envelope to `BootstrapResult`. Uses `safeErrorDetails` for error envelopes (INV-ERR-DETAILS).
3. `services/floor-layout/index.ts` — add to `FloorLayoutServiceInterface` and to `createFloorLayoutService` factory output.
4. `services/floor-layout/README.md` — document the method under "Pit Bootstrap (PRD-068)" section.

**Hard constraints.**
- No `casino_id` parameter on the method (ADR-024 INV-8).
- No Zod schema (no user input).
- No `as any`, no `ReturnType<>` inference.
- DTO derivation: `BootstrapResult` is a manual interface because it aggregates RPC-returned counts; this is acceptable under Pattern B rules for computed/aggregated responses (see `dtos.ts` header comment at `services/floor-layout/dtos.ts:6`).

**Acceptance criteria.**
- [ ] `npm run type-check` exits 0.
- [ ] `FloorLayoutServiceInterface` in `services/floor-layout/index.ts` declares `bootstrapCasinoPitLayout: () => Promise<ServiceResult<BootstrapResult>>`.
- [ ] `crud.ts` function uses no `as any`; the jsonb envelope is parsed through explicit field extraction.

### WS3 — Onboarding completion wiring

**Purpose.** Invoke bootstrap at the moment onboarding completes.

**Deliverables.**
1. Edit `app/(onboarding)/setup/_actions.ts completeSetupAction`:
   - After `rpc_complete_casino_setup` returns `ok`, call `createFloorLayoutService(supabase).bootstrapCasinoPitLayout()`.
   - If bootstrap returns `outcome === 'already_bootstrapped'` → emit a structured log event with `outcome: 'already_bootstrapped'`; return the **original** `CompleteSetupResult` unchanged (RULE-7 idempotent no-op).
   - If bootstrap returns `outcome === 'success'` → emit one structured log event with `{ casino_id, layout_version_id, pits_created, slots_created, tables_without_pit }`; return the **original** `CompleteSetupResult` unchanged. Bootstrap counts are observable ONLY via the log.
   - If bootstrap throws or returns `ok: false` → surface an `INTERNAL_ERROR` to the admin with stable `code: 'BOOTSTRAP_FAILED'`; log the error envelope via `safeErrorDetails`. Admin retry path: re-click "Complete" on wizard step 5 — `rpc_complete_casino_setup` is already idempotent (returns `already_ready`); bootstrap re-attempts (RULE-7 idempotent).
2. `CompleteSetupResult` type is **NOT** modified. No `bootstrap` field is added. (Finding 4 — preserves DEC-004 literally.)
3. Document the admin recovery path in `services/floor-layout/README.md` under a "Pit Bootstrap Recovery (PRD-068)" subsection (Finding 7).

**Hard constraints.**
- **No direct `.from('floor_layout_*').insert(...)` anywhere in `_actions.ts`** (RULE-9). All canonical writes flow through the service method added in WS2.
- **No new server action** — extend the existing `completeSetupAction`. No side-path.
- **No wizard UI change** (DEC-004).
- **Admin-role guard preserved** — the existing `if (ctx.rlsContext?.staffRole !== 'admin') return forbidden(...)` stays in place. Bootstrap call sits after that guard.
- **`CompleteSetupResult` return type must not be modified.** No `bootstrap` field added. Bootstrap counts surface only in the log. (Finding 4.)
- **Stable error code `BOOTSTRAP_FAILED`** on bootstrap-failed branch; do not collapse into a generic `INTERNAL_ERROR` message.

**Acceptance criteria.**
- [ ] `npm run type-check` exits 0.
- [ ] `npm run lint -- "app/(onboarding)/setup/_actions.ts"` exits 0.
- [ ] Grep check (RULE-9): `grep -E "\.from\('floor_(layout|pit|table_slot)" "app/(onboarding)/setup/_actions.ts"` returns zero matches.
- [ ] Grep check (Finding 4): `grep -nE "\bbootstrap\b" "app/(onboarding)/setup/_actions.ts"` may only match internal local variables and log payloads — no mention in the `CompleteSetupResult` type or its export.
- [ ] `CompleteSetupResult` interface definition is byte-identical pre-/post-WS3 (verified by diff).
- [ ] Integration-level smoke test (subset of WS4 group (j)) verifies the action wires the service call and the response envelope is unchanged on success paths.
- [ ] `BOOTSTRAP_FAILED` error code appears in the action's error-path branch (grep verifiable).

### WS4 — Integration tests (RPC + service + action)

**Purpose.** Prove all hard rules (RULE-2..RULE-8) and capability coverage hold end-to-end.

**Deliverables.**
1. `services/floor-layout/__tests__/rpc-bootstrap-casino-pit-layout.int.test.ts` — 11 test groups, following the PRD-067 RPC int-test pattern (Mode C JWT auth, per-role clients, `RUN_INTEGRATION_TESTS=true` gate):

   | Group | Scenario | Covers |
   |-------|----------|--------|
   | **(a)** | Admin completes onboarding for casino A with 3 tables across 2 distinct pits. Assert: 1 activation, 2 floor_pits, 3 slots, all bindings correct. **Also assert `floor_layout_version.status = 'active'`** (Finding 2) and **`floor_layout_activation.activation_request_id = 'prd068_pit_bootstrap_v1'`** (Finding 6). | G1, G2, G3, CAP-1..CAP-4, STEP-1..STEP-4, Finding 2, Finding 6 |
   | **(b)** | Onboarding with 2 pit-bearing tables + 1 empty-pit table + 1 null-pit table. Assert: 2 slots created, 2 tables absent from slot table. | G3, G4, CAP-5, RULE-4, STEP-5 |
   | **(c)** | Pit-name equivalence — 3 tables with pit `"Main"`, `"main "`, `"MAIN"` inserted in that created_at order. Assert: exactly 1 floor_pit, label = `"Main"` (first-observed trimmed form, chosen deterministically by `ORDER BY lower(btrim(pit)), created_at ASC, id ASC`), 3 slots bound to it. Also assert the `ux_floor_pit_layout_version_label_lower` partial unique index exists (Finding 5). | RULE-2, DEC-001, STEP-3, Finding 5 |
   | **(d)** | Re-invocation on an already-bootstrapped casino. Assert: zero new rows inserted, outcome = `"already_bootstrapped"`, returned envelope reports the first call's row counts. Verify both idempotency guards are in play: (i) the EXISTS short-circuit returned early (no second `floor_layout_activation` attempted), (ii) even if short-circuit were removed, the existing `UNIQUE (casino_id, activation_request_id)` constraint on the fixed string `'prd068_pit_bootstrap_v1'` would catch the second insert (Finding 6 — verify via a manual SQL INSERT attempt that violates the constraint). | G7, RULE-7, STEP-2, Finding 6 |
   | **(e)** | Forced failure mid-transaction (inject a pre-existing conflicting slot via setup client before invoking bootstrap — the new `ux_floor_table_slot_preferred_table_active` constraint triggers a unique violation on the slot INSERT). Assert: after rollback, zero `floor_layout_*` rows for the casino (layout, version, activation, pits, slots all rolled back together). | RULE-6, G7, DEC-003 verification |
   | **(f)** | Byte-equal `gaming_table.pit` pre/post. Assert via strict string equality: `SELECT id, pit, updated_at FROM gaming_table` before bootstrap and again after; for every row, `expect(after.pit).toBe(before.pit)` AND `expect(after.updated_at).toBe(before.updated_at)` (proves no UPDATE occurred). | G6, RULE-5, CAP-6 |
   | **(g)** | Downstream hand-off — after bootstrap, call `FloorLayoutService.getPitAssignmentState(casino_id)`. Assert: returned state contains the bootstrapped pits, slots, and tables; unassigned list contains only the pit-empty tables. | G5, CAP-7, STEP-6 |
   | **(h)** | Non-admin rejection (pit_boss and dealer clients). Assert: RPC raises `forbidden`, no rows written. | RULE-8, ADR-024 INV-8 |
   | **(i)** | Cross-casino scoping — invoke for casino A while casino B has pending onboarded tables. Assert: casino B has zero `floor_layout_*` rows after the call. | RULE-8, G7 |
   | **(j)** | DEC-004 verification — on success and already-bootstrapped paths, `completeSetupAction` return payload is byte-identical to its pre-WS3 shape (no `bootstrap` field). On failure path, action returns `INTERNAL_ERROR` with `code: 'BOOTSTRAP_FAILED'`. Verified by TypeScript type diff (snapshot) PLUS runtime `JSON.stringify(result)` field-set comparison against a reference success payload. | DEC-004 (assumption-class), Finding 4 |
   | **(k)** | **Concurrent-bootstrap race (Finding 1)** — spawn two parallel `supabase.rpc('rpc_bootstrap_casino_pit_layout')` calls for the same casino from two admin clients with identical JWT context. Assert: exactly ONE call returns `outcome: 'success'` with non-zero counts; the OTHER call either (i) returns `outcome: 'already_bootstrapped'` (if its EXISTS check observed the first call's commit) or (ii) returns a unique-violation error from the partial unique index on `floor_layout_activation(casino_id) WHERE deactivated_at IS NULL`. Assert the database state has EXACTLY ONE active activation for the casino. | RULE-7, Finding 1 |

**Hard constraints.**
- Uses the PRD-067 int-test harness structure: setup/admin/pit_boss/dealer clients per casino, per-test isolation via transaction reset or unique test-data tagging.
- Gated on `RUN_INTEGRATION_TESTS=true`; skipped otherwise.
- No mocks against the database (integration tests must hit real Supabase per user memory `feedback_integration-tests-hit-real-db`).
- Group (k) requires genuine parallelism (`Promise.all([adminA_rpc_call, adminA2_rpc_call])`) with two independent client sessions so the RPCs actually race on the database, not serialize in the test harness.

**Acceptance criteria.**
- [ ] All 11 test groups pass under `RUN_INTEGRATION_TESTS=true npm test`.
- [ ] Test output includes explicit assertion messages mapping each group to its PRD §8 DoD line or Finding ID.
- [ ] Group (f) uses strict `.toBe()` string equality (byte-equal for strings); NO `.toEqual()` deep-equality fallback.
- [ ] Group (k) produces deterministic pass/fail — the race outcome is non-deterministic but the invariant (exactly one active activation) is deterministic.

### WS5 — E2E write-path test (Appendix A success test)

**Purpose.** Prove Appendix A verbatim: fresh casino → wizard → see `"Main"` with tables → assign succeeds.

**Deliverables.**
1. `e2e/admin/pit-bootstrap-onboarding.spec.ts` — single spec, 1 scenario, with these steps:
   - Programmatic fresh-casino setup via E2E fixture (create company → create admin staff → log in as admin → start onboarding wizard).
   - Step through the setup wizard: casino basics → game selection → create one gaming table with label `"BJ-1"` and pit `"Main"`.
   - Click "Complete Setup".
   - Navigate to `/admin/settings/operations`.
   - Assert: panel shows `"Main"` pit with `"BJ-1"` underneath.
   - Invoke the existing PRD-067 assign command (click assign button in row `"BJ-1"`) — assert success toast, state updates without page reload.

**Hard constraints.**
- Uses existing Playwright fixtures (`e2e/fixtures/`) for auth and database setup. No new fixture needed.
- No new E2E helper utility. No cross-test shared state.
- Must run under `npm run e2e:playwright -- e2e/admin/pit-bootstrap-onboarding.spec.ts`.

**Acceptance criteria.**
- [ ] Spec passes locally.
- [ ] Spec does not require manual seed data — it creates its own casino.
- [ ] Spec has exactly one `test()` block (Appendix A is one scenario).

### WS6 — Governance docs + EXEC-SPEC decisions block

**Purpose.** Update SRM; lock decisions block (already present in this file's frontmatter).

**Deliverables.**
1. Edit `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` — FloorLayoutService section:
   - Add `bootstrapCasinoPitLayout` to the published method list.
   - Add a "Bootstrap (PRD-068)" subsection noting the method is called from `app/(onboarding)/setup/_actions.ts completeSetupAction`; flag that OnboardingService remains a trigger host, NOT a bounded context.
2. This EXEC-SPEC file's `decisions:` block (already authored above) with DEC-001..DEC-004 is the canonical resolution record.

**Hard constraints.**
- No new ADR. No new section in OVER_ENGINEERING_GUARDRAIL.
- Do NOT invent an "OnboardingService" SRM section — PRD §7.1 and FIB-S `zachman.where.bounded_contexts` both label it as a trigger host. Introducing an SRM service entry for onboarding wiring would violate PRD §2.3 "no new bounded context".

**Acceptance criteria.**
- [ ] `grep -q "bootstrapCasinoPitLayout" docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` returns 0.
- [ ] `grep -qE "OnboardingService.*trigger host|trigger host.*OnboardingService" docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` returns 0 (containment note present).
- [ ] No file under `services/onboarding/` is created (PRD §2.3 enforcement).

## Definition of Done (mirrors PRD §8)

- [ ] All 6 workstreams complete.
- [ ] All 6 gates pass.
- [ ] E2E spec passes (e2e-write-path mandate).
- [ ] `gaming_table.pit` byte-equal before and after (WS4 group (f) verified).
- [ ] No direct `floor_layout_*` writes outside WS1 RPC or WS2 service method (RULE-9 static guard).
- [ ] SRM reflects the new published method.
- [ ] No new bounded context, service, UI surface, or architectural layer introduced.
- [ ] `structured_ref` + `intake_ref` preserved in PRD-068 frontmatter.

## Intake Traceability Audit Summary

| FIB-S Element | Workstream Coverage | Status |
|---------------|---------------------|--------|
| CAP-1 derive_distinct_pits | WS1 (RPC SELECT DISTINCT), WS3 (trigger), WS4 | ✓ |
| CAP-2 materialize_active_layout_scaffold | WS1, WS2, WS4 | ✓ |
| CAP-3 materialize_pits_from_onboarding | WS1, WS2, WS4 | ✓ |
| CAP-4 materialize_slot_assignments | WS1, WS2, WS4 | ✓ |
| CAP-5 preserve_unassigned_tables | WS1 (conditional), WS4 group (b) | ✓ |
| CAP-6 preserve_free_text_pit_column | WS1 (no UPDATE), WS4 group (f) | ✓ |
| CAP-7 hand_off_to_admin_panel | WS3, WS4 group (g), WS5 | ✓ |
| RULE-1..RULE-9 | All 9 hard rules visible in at least one workstream's acceptance criteria | ✓ |
| STEP-1..STEP-6 | All 6 loop steps realized; STEP-6 tested via WS4 (g) and WS5 | ✓ |
| OQ-1..OQ-4 | All resolved in `decisions` block (DEC-001..DEC-004) | ✓ |
| Anti-invention (description) | No new surfaces/APIs/side-paths introduced in any WS description | ✓ |
| Anti-invention (output paths) | All `outputs` paths trace to existing surfaces per FIB-S `zachman.where.surfaces` | ✓ |
| Write-path classification | Detected — WS5 E2E workstream injected (mandatory) | ✓ |
