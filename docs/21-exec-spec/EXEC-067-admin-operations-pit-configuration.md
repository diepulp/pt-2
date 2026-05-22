---
# EXECUTION-SPEC: Admin Operations Pit Configuration
# Generated via /build PRD-067 (full pipeline, Tier 1 DA override)

prd: PRD-067
prd_title: "Admin Operations Pit Configuration"
service: FloorLayoutService
mvp_phase: 1

# Intake Authority Chain (FIB chain resolved at admission)
fib_h: docs/issues/gaps/pit-configuration/FIB-PIT-CONFIG-001-admin-operations-pit-configuration.md
fib_s: docs/issues/gaps/pit-configuration/FIB-S-PIT-CONFIG-001-admin-operations-pit-configuration.json

# GOV-010 Disposition (waiver accepted at pipeline admission)
gov010_disposition: waived
gov010_reason: "FIB-H + FIB-S supply scaffold-equivalent decomposition per PRD-067 frontmatter"

# Write-path classification (E2E mandate)
write_path_classification: detected
write_path_signals:
  - "SECURITY DEFINER RPCs mutating floor_table_slot (WS1)"
  - "Admin API routes invoking those RPCs (WS3)"
  - "Panel UI driving those APIs via TanStack Query mutations (WS4)"

# ─────────────────────────────────────────────────────────────────────────
# Workstream Definitions
# ─────────────────────────────────────────────────────────────────────────

workstreams:
  WS1:
    name: Database Migration — RPCs + RULE-3 Enforcement
    description: >-
      Add partial unique index on floor_table_slot to enforce RULE-3 at DB layer.
      Create two SECURITY DEFINER RPCs (rpc_assign_or_move_table_to_slot,
      rpc_clear_slot_assignment) that derive casino context from staff per ADR-024,
      validate admin role per RULE-2, enforce occupied-target rejection, emit
      audit_log events, and maintain gaming_table.pit compatibility mirror
      (DEC-001). Both RPCs execute in a single transaction with no SAVEPOINT
      and no EXCEPTION WHEN OTHERS. Active layout resolution is deterministic
      with FOR UPDATE row lock to contain DEC-003-R8 drift window. Grant EXECUTE
      to authenticated role; admin gate is the RPC body check, backed by
      COMMENT ON FUNCTION documentation. Regenerate types.
    executor: rls-expert
    executor_type: skill
    traces_to: [CAP:assign_table_to_slot, CAP:relocate_table_between_slots, CAP:clear_slot_assignment, RULE-1, RULE-2, RULE-3, RULE-4, RULE-5, OUT-3, STEP-4, STEP-5, STEP-6]
    depends_on: []
    outputs:
      - supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql
      - types/database.types.ts  # regenerated via npm run db:types-local
    gate: schema-validation
    estimated_complexity: medium

  WS2:
    name: FloorLayoutService Extension — Pit Assignment State + Mutations
    description: >-
      Extend FloorLayoutService with read aggregate (getPitAssignmentState) and
      two mutation functions (assignOrMoveTableToSlot, clearSlotAssignment)
      invoking the WS1 RPCs. Add PitAssignmentStateDTO with FLAT sibling-array
      shape matching existing FloorLayoutVersionWithSlotsDTO precedent:
      `{ layout_version_id, pits: FloorPitDTO[], slots: FloorTableSlotWithTableRefDTO[],
      unassigned_tables: AssignedTableRef[] }`. Client groups by pit_id. Extend
      keys.ts and http.ts. Mappers for aggregate shape. Service remains a
      functional factory with explicit interface — no ReturnType inference.
    executor: backend-service-builder
    executor_type: skill
    traces_to: [CAP:view_pit_assignment_state, CAP:assign_table_to_slot, CAP:relocate_table_between_slots, CAP:clear_slot_assignment, OUT-4, infrastructure]
    depends_on: [WS1]
    outputs:
      - services/floor-layout/dtos.ts
      - services/floor-layout/crud.ts
      - services/floor-layout/index.ts
      - services/floor-layout/keys.ts
      - services/floor-layout/http.ts
      - services/floor-layout/mappers.ts
      - services/floor-layout/schemas.ts
    gate: type-check
    estimated_complexity: medium

  WS3:
    name: Admin API Routes — Pit Assignment State + Mutations
    description: >-
      Three route handlers under app/api/v1/floor-layouts/, all gated admin-only.
      GET /pit-assignment-state returns aggregate. POST /slots/[slotId]/assign
      invokes assign-or-move. DELETE /slots/[slotId]/assign invokes clear. All
      routes use `withServerAction` middleware (per app/api/v1/casino/settings/route.ts
      precedent), ServiceHttpResult envelope, Zod request validation from WS2
      schemas. Admin gate is an inline role check INSIDE the withServerAction
      body: `if (mwCtx.rlsContext!.staffRole !== 'admin') throw new DomainError('FORBIDDEN_ADMIN_REQUIRED', ...)`.
      This is defense-in-depth — the RPC (WS1) is the authoritative gate;
      middleware + RPC both enforce. Route handlers never pass casino_id
      through to RPC (ADR-024 INV-8) — casino is derived inside the RPC via
      set_rls_context_from_staff().
    executor: api-builder
    executor_type: skill
    traces_to: [CAP:view_pit_assignment_state, CAP:assign_table_to_slot, CAP:relocate_table_between_slots, CAP:clear_slot_assignment, RULE-2, OUT-7]
    depends_on: [WS2]
    outputs:
      # Three handlers across two route files:
      #   GET    → pit-assignment-state/route.ts
      #   POST   → slots/[slotId]/assign/route.ts (assign or move)
      #   DELETE → slots/[slotId]/assign/route.ts (clear, co-located with POST)
      - app/api/v1/floor-layouts/pit-assignment-state/route.ts       # GET handler
      - app/api/v1/floor-layouts/slots/[slotId]/assign/route.ts       # POST + DELETE handlers co-located
    gate: lint
    estimated_complexity: medium

  WS4:
    name: Pit Configuration Panel — Client Component + Hooks
    description: >-
      Single `'use client'` component rendered inside /admin/settings/operations
      host — matches peer admin settings exemplar (shift-settings-form.tsx,
      valuation-settings-form.tsx, threshold-settings-form.tsx are all single-
      client per SURFACE_CLASSIFICATION_STANDARD §3.3 "Admin Settings" → Client
      Shell). No RSC prefetch, no hydration boundary. TanStack Query handles
      initial load with a skeleton. React 19 useTransition for mutation pending
      state. Shadcn/ui primitives (Card, Button, Select, Skeleton).
      Admin-only affordances (mutation UI hidden for non-admin; server rejection
      is still authoritative per RULE-2). No new top-level surface — sub-panel
      only per FIB-S constraint.
    executor: frontend-design-pt-2
    executor_type: skill
    traces_to: [CAP:view_pit_assignment_state, CAP:assign_table_to_slot, CAP:relocate_table_between_slots, CAP:clear_slot_assignment, OUT-4, OUT-6, STEP-1, STEP-2, STEP-3, STEP-4, STEP-5, STEP-6]
    depends_on: [WS3]
    outputs:
      - components/admin/pit-configuration-panel.tsx
      - hooks/floor-layout/use-pit-assignment-state.ts
      - hooks/floor-layout/use-pit-assignment-mutations.ts
      - hooks/floor-layout/index.ts
      - app/(dashboard)/admin/settings/operations/page.tsx  # modified — compose panel
    gate: type-check
    estimated_complexity: medium

  WS5:
    name: Integration Tests — RPC + Service + RLS Boundary
    description: >-
      RPC contract tests under services/floor-layout/__tests__/:
      (a) admin-role happy path (assign, move, clear);
      (b) non-admin rejection (pit_boss, dealer);
      (c) cross-casino rejection (table from casino A, slot from casino B) —
          MUST assert gaming_table.pit rows in casino B are byte-identical
          pre- and post-rejection (no mirror touch);
      (d) inactive slot rejection;
      (e) occupied-target rejection (slot already has different table);
      (f) idempotent clear (clearing empty slot);
      (g) atomic move (previous slot cleared when table reassigned);
      (h) partial unique index violation (direct insert bypass) — RULE-3
          defence-in-depth;
      (i) mirror verification — gaming_table.pit updated to floor_pit.label on
          assign, NULL on clear (DEC-001 verification);
      (j) audit_log emission — every successful mutation writes a row to
          audit_log with (casino_id, domain='floor_layout', actor_id, action,
          details_jsonb) (DoD "Operational Readiness" verification);
      (k) transactional rollback — simulate mid-RPC failure (e.g., constraint
          violation on final step) and assert preceding UPDATEs are rolled back
          including the gaming_table.pit mirror;
      (l) concurrent-move idempotency — two parallel admin moves targeting the
          same slot; second loses with unique-violation, no torn mirror state;
      (m) single-active drift containment (DEC-003-R8 test) — two
          floor_layout_activation rows both with deactivated_at IS NULL for
          the same casino; RPC picks deterministically and takes FOR UPDATE
          lock; no duplicate assignment written.
      Must hit real Supabase with RUN_INTEGRATION_TESTS=true gate.
    executor: backend-service-builder
    executor_type: skill
    traces_to: [RULE-1, RULE-2, RULE-3, RULE-4, RULE-5, OUT-3, DEC-001, DEC-003, infrastructure]
    depends_on: [WS2]
    outputs:
      - services/floor-layout/__tests__/rpc-pit-assignment.int.test.ts
      - services/floor-layout/__tests__/pit-assignment-service.int.test.ts
    gate: test-pass
    estimated_complexity: medium

  WS6:
    name: E2E Write-Path Spec (Test-per-PRD Mandate)
    description: >-
      Playwright spec at e2e/admin-operations/pit-configuration.spec.ts covering
      the full admin journey from FIB-S containment loop: open operations page
      (STEP-1, STEP-2), assign an unassigned table to a slot (STEP-3, STEP-4),
      relocate the same table to a different slot (STEP-5), clear the slot (STEP-6),
      verify downstream consumption — load a pit-scoped view (shift dashboard
      cash observations page) and assert pit membership reflects the updated
      mapping (STEP-7). Auth Mode A or B per QA-006 (authenticated admin).
      Includes one negative case: non-admin cannot see mutation affordances.
    executor: e2e-testing
    executor_type: skill
    traces_to: [OUT-1, OUT-2, OUT-3, OUT-4, OUT-5, OUT-7, STEP-1, STEP-2, STEP-3, STEP-4, STEP-5, STEP-6, STEP-7]
    depends_on: [WS4]
    outputs:
      - e2e/admin-operations/pit-configuration.spec.ts
    gate: e2e-write-path
    estimated_complexity: medium

# ─────────────────────────────────────────────────────────────────────────
# Execution Phases (topologically sorted, parallelized where possible)
# ─────────────────────────────────────────────────────────────────────────

execution_phases:
  - name: Phase 1 — Database Foundation
    parallel: [WS1]
    gates: [schema-validation]

  - name: Phase 2a — Service Layer
    parallel: [WS2]
    gates: [type-check]

  - name: Phase 2b — Integration Tests (WS5 depends on WS2 deliverables)
    parallel: [WS5]
    gates: [test-pass]

  - name: Phase 3 — API Routes
    parallel: [WS3]
    gates: [lint]

  - name: Phase 4 — Panel UI
    parallel: [WS4]
    gates: [type-check]

  - name: Phase 5 — E2E Spec
    parallel: [WS6]
    gates: [e2e-write-path]

# ─────────────────────────────────────────────────────────────────────────
# Validation Gates
# ─────────────────────────────────────────────────────────────────────────

gates:
  schema-validation:
    command: npm run db:types-local
    success_criteria: "Exit code 0; rpc_assign_or_move_table_to_slot and rpc_clear_slot_assignment present in generated types"

  type-check:
    command: npm run type-check
    success_criteria: "Exit code 0"

  lint:
    command: npm run lint -- services/floor-layout/ app/api/v1/floor-layouts/ components/admin/ hooks/floor-layout/
    success_criteria: "Exit code 0, 0 warnings (max-warnings=0)"

  test-pass:
    command: RUN_INTEGRATION_TESTS=true npm test -- services/floor-layout/
    success_criteria: "All tests pass including RULE-2/RULE-3/DEC-001 assertions"

  e2e-write-path:
    command: npx playwright test e2e/admin-operations/pit-configuration.spec.ts --reporter=list
    success_criteria: "Spec exists and all tests pass"

# ─────────────────────────────────────────────────────────────────────────
# External Dependencies
# ─────────────────────────────────────────────────────────────────────────

external_dependencies:
  - prd: PRD-030
    service: SetupWizard
    required_for: "Pilot casinos must have at least one active floor_layout_activation with ≥1 pit and ≥1 slot. Bootstrap coverage verified per FIB-H Risk R1."
  - prd: PRD-042
    service: AdminSettingsPages
    required_for: "/admin/settings/operations host surface exists (verified; renders ShiftSettingsForm)."

# ─────────────────────────────────────────────────────────────────────────
# Open-Question Decisions (FIB-S governance.open_questions_allowed_at_scaffold)
# ─────────────────────────────────────────────────────────────────────────

decisions:
  - decision_id: DEC-001
    resolves_open_question: "OQ-1 (gaming_table.pit mirror requirement)"
    decision_statement: >-
      gaming_table.pit compatibility mirroring is REQUIRED for pilot. When
      rpc_assign_or_move_table_to_slot succeeds, the RPC atomically updates
      gaming_table.pit = floor_pit.label of the target pit. When
      rpc_clear_slot_assignment succeeds, the RPC atomically sets
      gaming_table.pit = NULL for the previously assigned table. Canonical
      floor_table_slot.preferred_table_id mapping remains authoritative
      (RULE-1); gaming_table.pit is a compatibility shim secondary to
      canonical (RULE-5).
    rationale: >-
      Ground-truth audit of consumers shows ≥20 active consumption sites
      treat gaming_table.pit as the pit identifier for rollups, filters,
      and labels. Cited sites:
        - supabase/migrations/20260107015907_shift_cash_obs_rollup_rpcs.sql:70,105-149
          (pit-level rollups GROUP BY gt.pit; filter via p_pit)
        - supabase/migrations/20260325193307_filter_dashboard_rpc_active_tables.sql:40
          (dashboard projection 'pit': gt.pit)
        - supabase/migrations/20260320173126_enrich_dashboard_rpc_session_status.sql:43
        - supabase/migrations/20260302230026_fix_sec007_dashboard_rpc_context.sql:58
        - supabase/migrations/20260304172335_prd043_d1_remove_p_casino_id.sql:44
        - supabase/migrations/20260114004336_rpc_shift_table_metrics.sql:133
        - supabase/migrations/20260118151907_add_active_players_casino_wide_rpc.sql:66
        - supabase/migrations/20260219164631_prd036_shift_metrics_opening_baseline.sql:127
        - supabase/migrations/20260219235613_sec_h1_h2_h3_shift_metrics_service_role_gate.sql:154
        - supabase/migrations/20260226003422_merge_sec_gate_prd036_baseline_cascade.sql:157
        - supabase/migrations/20260403202628_fix_function_search_path_sec_s3.sql:671
        - services/table-context/crud.ts:80 (pit-scoped filter via .eq('pit', filters.pit))
        - components/shift-dashboard/cash-observations-panel.tsx:272 (UI label display)
        - lib/utils/group-tables-by-pit.ts:24 (client grouping by table.pit)
      Without mirror, OUT-5 (pit-scoped reporting uses updated canonical
      assignment) would silently fail for all these consumers. Mirror is
      exactly the compatibility path FIB-S RULE-5 anticipates.
    verification: cited
    impact_on_scope: none

  - decision_id: DEC-002
    resolves_open_question: "OQ-2 (pit_boss read-only visibility)"
    decision_statement: >-
      In this slice the Pit Configuration panel is admin-only for both read
      and write. pit_boss gets no panel visibility. Future expansion to
      pit_boss read-only requires a new PRD or FIB amendment per the
      expansion trigger rule.
    rationale: >-
      FIB-S `zachman.why.decision_notes[1]` and FIB-H §L explicitly set the
      pilot default to admin-only visibility. No operator-established need
      for pit_boss read visibility has been identified during pilot. Keeping
      read admin-only reduces auth-policy surface for this slice.
    verification: cited
    impact_on_scope: none

  - decision_id: DEC-003
    resolves_open_question: "(EXEC-stage mechanism choice — not a FIB open question)"
    decision_statement: >-
      RULE-3 (no duplicate active slot assignment) is addressed by two layers,
      both scoped to **operational containment of the PRD-067 mutation path**.
      Neither layer restores activation-lifecycle integrity — that remains
      PRD-030 territory.
      (1) Partial unique index: UNIQUE (layout_version_id, preferred_table_id)
          WHERE preferred_table_id IS NOT NULL — prevents duplicates within
          any single layout_version. Hard DB guarantee, as far as it goes.
      (2) Deterministic active-layout resolution inside each RPC, for
          operational containment under dirty-active-state conditions:
          `SELECT layout_version_id FROM floor_layout_activation
           WHERE casino_id = app.casino_id AND deactivated_at IS NULL
           ORDER BY activated_at DESC, id DESC LIMIT 1 FOR UPDATE`.
          This is a containment measure for the supported write path only —
          if two floor_layout_activation rows exist with deactivated_at IS NULL
          for the same casino (schema permits this — see R8), two concurrent
          RPC invocations converge on the same row deterministically and
          serialize via FOR UPDATE. It does **not** prevent writers going
          around the RPC path from observing dirty active state, nor does it
          fix the underlying activation-lifecycle schema gap.
      No BEFORE trigger, no trigger-based serialization. The RPC MUST reject
      any assignment targeting a slot whose layout_version_id does not match
      the resolved active layout.
    rationale: >-
      Over-Engineering Guardrail "Golden Path" prescribes database-level
      idempotency (UNIQUE constraint, not code). Partial unique index is
      race-proof within a single layout_version. The DA review correctly
      identified that per-version uniqueness is NOT equivalent to
      "active-mapping uniqueness" absent a schema-enforced single-active
      invariant on floor_layout_activation: the current schema allows two
      rows with deactivated_at IS NULL for one casino (the
      rpc_activate_floor_layout ON CONFLICT clause keys on
      (casino_id, activation_request_id), not on active-state). Rather than
      expand scope into floor_layout_activation lifecycle (owned by PRD-030),
      this DEC-003 contains the drift window operationally for the supported
      write path. R8 carries the true schema fix forward as PRD-030 work; do
      not mistake DEC-003 layer (2) for a lifecycle-integrity fix.
      Ground-truth citations supporting the DA finding: base migration
      `supabase/migrations/20251108223004_create_floor_layout_service.sql:66-75`
      (no single-active constraint); activation RPC
      `supabase/migrations/20260303195843_prd041_phase_d_floorlayout_derive.sql:138`
      (ON CONFLICT keyed on request_id, not active-state); service reader
      `services/floor-layout/crud.ts:190-209` (tolerates PGRST116, uses
      ORDER-BY-activated_at-LIMIT-1 pattern — a posture compatible with
      zero-or-more active rows).
    verification: cited
    impact_on_scope: none

  - decision_id: DEC-004
    resolves_open_question: "(EXEC-stage transport choice)"
    decision_statement: >-
      Transport is REST API routes + TanStack Query hooks. No server actions
      for this feature. Three routes: GET /api/v1/floor-layouts/pit-assignment-state,
      POST /api/v1/floor-layouts/slots/[slotId]/assign, DELETE /api/v1/floor-layouts/slots/[slotId]/assign.
    rationale: >-
      Existing admin settings surfaces (shift-settings, valuation-settings,
      threshold-settings) use TanStack Query hooks → fetch → /api/v1/* routes.
      Consistency outweighs server-action ergonomics. FloorLayoutService already
      publishes routes under app/api/v1/floor-layouts/ and app/api/v1/floor-layout-activations/
      — new routes slot in naturally. Server actions would fragment the pattern.
    verification: cited
    impact_on_scope: none

# ─────────────────────────────────────────────────────────────────────────
# Risks & Mitigations
# ─────────────────────────────────────────────────────────────────────────

risks:
  - risk_id: R1
    risk: "Pilot pit/slot bootstrap coverage may be insufficient (carried from PRD §7.2 R1)."
    mitigation: >-
      Before WS1 begins, verify pilot casinos have ≥1 active floor_layout_activation
      with ≥1 floor_pit and ≥1 floor_table_slot. If missing, halt and author
      the bootstrap-coverage antecedent slice per FIB-S `coherence.deferred_items[4]`.
      Command: SELECT COUNT(*) FROM floor_layout_activation WHERE deactivated_at IS NULL
      + INNER JOIN floor_pit / floor_table_slot per active layout_version_id.
    status: "pre-WS1 gate"

  - risk_id: R4
    risk: "Concurrent assignment saves could race."
    mitigation: "DEC-003 partial unique index enforces RULE-3 at DB layer; second write fails loudly."
    status: "resolved via DEC-003"

  - risk_id: R6
    risk: >-
      Pre-existing RLS on floor_table_slot (migration 20251212080915) allows
      pit_boss INSERT and UPDATE. This slice enforces admin-only access on the
      supported mutation path only (UI → API → SECURITY DEFINER RPC). Existing
      direct PostgREST writes to floor_table_slot remain a known pre-existing
      hardening gap and are **not** remediated by PRD-067. A pit_boss writing
      directly via supabase-js `.from('floor_table_slot').update({preferred_table_id: …})`
      bypasses the slice's supported path but still satisfies the existing RLS
      policy. Do not describe RULE-2 as "enforced" at the table layer — it is
      enforced *for this feature's mutation path*, not for all writers.
    mitigation: >-
      (In scope for this slice) RPC enforces admin-only on the supported path;
      UI and API gated admin-only; WS5 integration tests verify non-admin
      rejection through the slice's mutation path only.
      (Required hardening follow-up — not vague, not deferred indefinitely)
      Tightening the existing floor_table_slot UPDATE/INSERT RLS to admin-only
      (or introducing a column-level grant restricting preferred_table_id
      writes to SECURITY DEFINER contexts) is a **required follow-up** owned
      by a dedicated RLS-hardening slice. Ownership: assign to PRD-030 / layout
      lifecycle hardening track OR author a separate EXEC-SPEC before the next
      pilot expansion touching layout management. Status must be reviewed as
      part of this slice's release audit — not carried silently.
    status: "scope-boundary for THIS slice; required hardening follow-up flagged (R6-FU)"

  - risk_id: R7
    risk: >-
      Tests that populate gaming_table.pit directly (e.g., e2e/fixtures/test-data.ts,
      various integration test seed data) may become inconsistent with the canonical
      mapping if the RPC-driven mirror starts diverging from test seed data.
    mitigation: >-
      WS5 mirror-verification test (sub-step i) asserts RPC-driven updates to
      gaming_table.pit. Test fixtures that seed gaming_table.pit without a
      corresponding floor_table_slot.preferred_table_id assignment are left
      as-is — they represent legacy seed data and do not exercise the PRD-067
      surface. If WS5 (sub-step i or c) proves any divergence in practice,
      log a deferred follow-up slice "fixture cleanup for pit mirror
      consistency" under docs/issues/gaps/ for later remediation.
    status: "accepted with contingent follow-up"

  - risk_id: R8
    risk: >-
      Single-active floor_layout_activation is not schema-enforced. Two
      activations with deactivated_at IS NULL can exist for one casino (race
      in rpc_activate_floor_layout, manual DB intervention, or data bug).
      Partial unique index on floor_table_slot alone cannot prevent duplicate
      active assignment across two active layout_versions.
    mitigation: >-
      DEC-003 layer (2) — deterministic active-layout resolution with FOR
      UPDATE row lock inside each RPC — contains the drift window
      operationally. WS5 test (m) exercises the "two active rows" path.
      Schema-level enforcement (partial unique on floor_layout_activation
      WHERE deactivated_at IS NULL) is out of scope here because
      floor_layout_activation semantics are owned by PRD-030 (Setup Wizard /
      layout activation lifecycle). Flag as follow-up to PRD-030 or a
      dedicated activation-lifecycle hardening slice.
    status: "contained by DEC-003 layer (2); schema follow-up flagged for PRD-030"

# ─────────────────────────────────────────────────────────────────────────
# ADR Compliance Posture
# ─────────────────────────────────────────────────────────────────────────

adr_compliance:
  ADR-015:
    posture: "RPC self-injection via set_rls_context_from_staff() at function entry; no Pattern C COALESCE on write path."
    gate: "WS1 migration grep — RPCs must PERFORM set_rls_context_from_staff() before any mutation."
  ADR-018:
    posture: "SECURITY DEFINER RPCs with SET search_path = '' (pre-commit hook enforces)."
    gate: "pre-commit hook; reviewer checks function declaration."
  ADR-020:
    posture: "Track A — hybrid RLS unchanged; new code paths use self-injection pattern."
    gate: "No new policies authored; existing policies consume derived context."
  ADR-024:
    posture: "INV-8 — RPCs do NOT accept p_casino_id or p_actor_id parameters. Both RPCs accept only (p_table_id, p_slot_id) or (p_slot_id). casino_id, actor_id, staff_role derived via set_rls_context_from_staff()."
    gate: "WS1 migration grep — RPC signatures must contain no p_casino_id."
  ADR-030:
    posture: >-
      floor_table_slot is NOT a Category A (D4) table — Category A per
      ADR-030:136-142 is {staff, staff_pin_attempts, staff_invite, player_casino,
      player_exclusion}. The base floor_table_slot RLS (from
      `supabase/migrations/20251212080915_sec006_rls_hardening.sql` §1.4) is
      Pattern C hybrid and was never tightened to session-var-only. Writes
      through this PRD's RPCs use SECURITY DEFINER bypass of that RLS; the
      session-var context set via set_rls_context_from_staff() inside the
      RPC is authoritative for the write transaction. The pre-existing
      Pattern C RLS that permits pit_boss direct PostgREST writes outside
      the RPC path is acknowledged as R6 scope boundary — out of scope for
      PRD-067 but marked as a **required hardening follow-up (R6-FU)**, not
      an indefinite deferral. RPC bodies MUST NOT introduce `auth.jwt()`
      COALESCE fallback on any write statement.
    gate: "WS1 migration grep — no auth.jwt() fallback in RPC bodies; only current_setting('app.*')."

# ─────────────────────────────────────────────────────────────────────────
# Mirror Authority Rule (normative, post-PRD-067)
# ─────────────────────────────────────────────────────────────────────────

mirror_authority_rule:
  statement: >-
    After PRD-067 ships, `gaming_table.pit` is compatibility-derived state
    only. No feature may independently author, edit, or backfill
    `gaming_table.pit` except (a) the approved compatibility path inside
    FloorLayoutService's PRD-067 RPCs, or (b) an explicitly authored
    emergency data-repair procedure with documented rationale and audit
    trail.
  implications:
    - "Any new feature writing gaming_table.pit directly is a RULE-5 violation and must be routed through the canonical slot assignment path."
    - "gaming_table.pit is NOT a source of truth; canonical membership is floor_table_slot.preferred_table_id."
    - "Legacy consumers continuing to READ gaming_table.pit is permitted until their reads are migrated to canonical (separate deprecation track). Continuing to WRITE gaming_table.pit is not."
    - "Emergency data-repair scripts must be logged to audit_log with domain='floor_layout', action='manual_mirror_repair', and a human-authored rationale in details."
  scope: "Codebase-wide, effective on merge of PRD-067. Future pipeline lint should flag new writes to gaming_table.pit outside approved paths."

# ─────────────────────────────────────────────────────────────────────────
# ADR-041 Surface Classification (mandatory per SURFACE_CLASSIFICATION_STANDARD §5, §17)
# ─────────────────────────────────────────────────────────────────────────

surface_classification:
  surface: "Pit Configuration panel (sub-surface of /admin/settings/operations)"

  rendering_delivery:
    decision: "Client Shell"
    rationale: >-
      Matches peer admin-settings exemplar (§3.3 "Admin Settings" → Client Shell).
      ShiftSettingsForm, ValuationSettingsForm, ThresholdSettingsForm are all
      single 'use client' components with TanStack Query skeletons. Form-driven,
      admin-only, low traffic, no measured first-paint requirement.
    rejected_patterns:
      - pattern: "RSC Prefetch + Hydration"
        reason: "No measured first-paint requirement (§4 Q1 criterion); no ≥2 independent queries above the fold; single bounded-context read. Adopting would create a split divergent from peer admin forms."
      - pattern: "Hybrid"
        reason: "§2a.1 requires Hybrid to name which proven patterns are composed and identify the boundary — no such composition is justified for this panel."

  data_aggregation:
    decision: "Simple Query"
    rationale: >-
      Single-context read from FloorLayoutService (plus embedded
      TableContextService reference resolution). Panel queries one read
      aggregate (getPitAssignmentState) returning pits + slots + unassigned
      tables. Fits §4 Q2 Simple Query criteria: 1 bounded context, <100 reads/hour,
      admin-only, no cross-context aggregation.
    rejected_patterns:
      - pattern: "BFF RPC"
        reason: "Single context; the aggregate RPC (if any) lives inside FloorLayoutService's own surface, not a BFF layer. §4 Q2: BFF RPC is for cross-context aggregation with >1 bounded context."
      - pattern: "BFF Summary"
        reason: "Not a summary/rollup surface; this is a configuration surface."
      - pattern: "Client-side Fetch for Multi-Context Aggregation"
        reason: "N/A — single context."

  metric_provenance:
    decision: "N/A"
    rationale: >-
      Panel renders configuration state (pit assignments), not truth-bearing
      measurement metrics. PRD-067 §8 DoD "Surface Governance" explicitly states
      'No new truth-bearing metrics introduced by this feature.' No
      MEAS-* entry required; no Metric Provenance Matrix amendment.

# ─────────────────────────────────────────────────────────────────────────
# Anti-Invention Audit Summary (FIB-S gate — passes)
# ─────────────────────────────────────────────────────────────────────────

traceability_audit:
  workstream_coverage: "5/5 capabilities covered (CAP-1..CAP-5); CAP-5 is served by the WS1 mirror write + WS6 downstream-consumption verification"
  output_path_scan: >-
    Pass. Three app/api/ endpoints map to FIB-S `zachman.where.surfaces[kind=api]`
    ('Table/pit assignment API or server action'): POST /slots/[slotId]/assign
    serves CAP-2 + CAP-3, DELETE /slots/[slotId]/assign serves CAP-4,
    GET /pit-assignment-state serves CAP-1. FIB-S §note says "Exact transport
    is downstream design" — the 3-endpoint split is a capability-axis expansion
    of the single declared surface, permitted by that §note, not an invention.
  open_questions: "2/2 resolved via DEC-001, DEC-002; 2 additional EXEC-stage mechanism choices recorded as DEC-003, DEC-004"
  hard_rule_visibility: "5/5 rules cited in workstream acceptance criteria or RPC spec"
  new_surfaces: "None — panel is sub-component of existing /admin/settings/operations (permitted by FIB-S)"
  surface_classification_declared: true  # ADR-041 §5 compliance

---

# EXEC-067 — Admin Operations Pit Configuration

## Overview

This execution spec implements PRD-067 — a contained admin-only Pit
Configuration panel inside `/admin/settings/operations` that enables post-
bootstrap table-to-slot assignment, relocation, and clearing. The feature
does **not** introduce a new top-level surface, does **not** create tables
or pit definitions, and does **not** change the operator/pit-boss workflow.
It reuses the existing `FloorLayoutService` as mutation owner and adds two
new SECURITY DEFINER RPCs plus a secondary compatibility mirror to
`gaming_table.pit` for existing pit-scoped consumers.

## Scope

**In scope:**
- Partial unique index enforcing RULE-3 at the DB layer
- Two SECURITY DEFINER RPCs derivation-compliant with ADR-024 + ADR-030
- Secondary compatibility mirror to `gaming_table.pit` (DEC-001, cited)
- Service + API + UI for assign, move, clear
- RPC/service/E2E tests including the negative authorization path

**Out of scope (per PRD §2.3 / FIB-S exclusions):**
- Floor-layout designer, visual editor, table creation, pit-definition
  management, game variant / par / status / dealer rotation / session
  lifecycle changes, cross-property assignment, approval workflows,
  external notifications, dashboard redesign, pit_boss edit access.

## Architecture Context

- **Bounded contexts touched:** `FloorLayoutService` (mutation owner),
  `TableContextService` (read-only consultant for table identity — not
  written to by this slice).
- **SRM:** `FloorLayoutService` owns `floor_layout`, `floor_layout_version`,
  `floor_pit`, `floor_table_slot`, `floor_layout_activation`. This slice
  writes only to `floor_table_slot.preferred_table_id` (canonical) and
  `gaming_table.pit` (secondary mirror, DEC-001).
- **ADR references:** ADR-015, ADR-018, ADR-020, ADR-024 (INV-8 critical),
  ADR-030 (D4 critical).

## Workstream Details

### WS1 — Database Migration: RPCs + RULE-3 Enforcement

**Purpose.** Enforce RULE-3 at the DB layer and expose two mutation RPCs
that comply with ADR-024 (no client-supplied casino/actor context) and
ADR-030 (session-var-only writes on critical tables).

**Deliverables.**

1. `supabase/migrations/20260419171523_prd067_pit_assignment_rpcs.sql`
   containing:

   **Partial unique index (DEC-003 layer 1):**
   ```sql
   CREATE UNIQUE INDEX ux_floor_table_slot_preferred_table_active
     ON floor_table_slot (layout_version_id, preferred_table_id)
     WHERE preferred_table_id IS NOT NULL;
   ```

   **`rpc_assign_or_move_table_to_slot(p_table_id uuid, p_slot_id uuid) RETURNS jsonb`** —
   `SECURITY DEFINER`, `SET search_path = ''`.

   **Transactional atomicity clause (P0-2):** The entire function body executes
   in the implicit plpgsql transaction. No SAVEPOINT. No `EXCEPTION WHEN OTHERS`.
   Any failure at any step (context derivation, role check, casino mismatch,
   constraint violation, unique-index conflict) rolls back ALL preceding writes
   including the gaming_table.pit mirror.

   Steps:
      a. `PERFORM set_rls_context_from_staff();`
      b. Validate `app.staff_role = 'admin'` (RULE-2) — else
         `RAISE EXCEPTION 'FORBIDDEN_ADMIN_REQUIRED' USING ERRCODE = 'P0001';`
      c. **Resolve active layout deterministically with row lock (DEC-003 layer 2):**
         ```sql
         SELECT layout_version_id INTO v_active_layout_version_id
           FROM floor_layout_activation
           WHERE casino_id = v_casino_id AND deactivated_at IS NULL
           ORDER BY activated_at DESC, id DESC
           LIMIT 1
           FOR UPDATE;
         IF v_active_layout_version_id IS NULL THEN
           RAISE EXCEPTION 'NO_ACTIVE_LAYOUT' USING ERRCODE = 'P0002';
         END IF;
         ```
      d. Resolve slot: `SELECT pit_id, layout_version_id, preferred_table_id
         INTO v_pit_id, v_slot_layout_version_id, v_current_slot_table
         FROM floor_table_slot WHERE id = p_slot_id`. If NULL, raise
         `SLOT_NOT_FOUND` (P0002). If `v_slot_layout_version_id !=
         v_active_layout_version_id`, raise `SLOT_NOT_ACTIVE` (P0002, RULE-4).
      e. Resolve table: `SELECT casino_id INTO v_table_casino_id FROM gaming_table
         WHERE id = p_table_id`. If NULL, raise `TABLE_NOT_FOUND` (P0002).
         If `v_table_casino_id != v_casino_id`, raise `CROSS_CASINO_FORBIDDEN`
         (P0001).
      f. If `v_current_slot_table IS NOT NULL AND v_current_slot_table != p_table_id`
         → `RAISE EXCEPTION 'SLOT_OCCUPIED' USING ERRCODE = 'P0002';` (RULE-3
         occupied-target rejection, no implicit swap).
      g. Resolve pit label: `SELECT label INTO v_pit_label FROM floor_pit
         WHERE id = v_pit_id`.
      h. **Capture previous-slot state (for audit + return):**
         ```sql
         SELECT id INTO v_previous_slot_id
           FROM floor_table_slot
           WHERE layout_version_id = v_active_layout_version_id
             AND preferred_table_id = p_table_id
             AND id != p_slot_id;
         ```
      i. **Clear previous-slot assignment for this table:**
         ```sql
         UPDATE floor_table_slot
            SET preferred_table_id = NULL
          WHERE layout_version_id = v_active_layout_version_id
            AND preferred_table_id = p_table_id
            AND id != p_slot_id;
         ```
      j. **Write new assignment:**
         ```sql
         UPDATE floor_table_slot
            SET preferred_table_id = p_table_id
          WHERE id = p_slot_id;
         ```
      k. **Mirror (DEC-001) — with casino predicate (P0-1):**
         ```sql
         UPDATE gaming_table
            SET pit = v_pit_label
          WHERE id = p_table_id
            AND casino_id = v_casino_id;  -- explicit, not implicit
         ```
      l. **Audit log (P1 R1-1):**
         ```sql
         INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
         VALUES (v_casino_id, 'floor_layout', v_actor_id,
                 CASE WHEN v_previous_slot_id IS NULL THEN 'slot_assign' ELSE 'slot_move' END,
                 jsonb_build_object(
                   'pit_id',           v_pit_id,
                   'pit_label',        v_pit_label,
                   'slot_id',          p_slot_id,
                   'table_id',         p_table_id,
                   'previous_slot_id', v_previous_slot_id,
                   'previous_pit_label', NULL  -- resolved in move-case implementation
                 ));
         ```
      m. Return `jsonb_build_object('table_id', p_table_id, 'slot_id', p_slot_id,
         'pit_id', v_pit_id, 'pit_label', v_pit_label,
         'previous_slot_id', v_previous_slot_id);`

   **`rpc_clear_slot_assignment(p_slot_id uuid) RETURNS jsonb`** —
   `SECURITY DEFINER`, `SET search_path = ''`.

   **Transactional atomicity clause (same as assign):** single plpgsql
   transaction, no SAVEPOINT, no `EXCEPTION WHEN OTHERS`.

   Steps:
      a. `PERFORM set_rls_context_from_staff();`
      b. Validate `app.staff_role = 'admin'` (RULE-2) — else
         `RAISE EXCEPTION 'FORBIDDEN_ADMIN_REQUIRED' USING ERRCODE = 'P0001';`
      c. Resolve active layout with FOR UPDATE (same deterministic pattern as
         assign — DEC-003 layer 2).
      d. Resolve slot; verify `slot.layout_version_id = v_active_layout_version_id`.
      e. If `slot.preferred_table_id IS NULL` → return `jsonb_build_object(
         'cleared', false, 'slot_id', p_slot_id, 'previous_table_id', null,
         'idempotent', true);` (RULE-4 idempotent clear).
      f. Capture `v_prev_table_id := slot.preferred_table_id`.
      g. `UPDATE floor_table_slot SET preferred_table_id = NULL WHERE id = p_slot_id;`
      h. **Mirror (DEC-001) — with casino predicate (P0-1):**
         ```sql
         UPDATE gaming_table
            SET pit = NULL
          WHERE id = v_prev_table_id
            AND casino_id = v_casino_id;  -- explicit
         ```
      i. **Audit log (P1 R1-1):**
         ```sql
         INSERT INTO audit_log (casino_id, domain, actor_id, action, details)
         VALUES (v_casino_id, 'floor_layout', v_actor_id, 'slot_clear',
                 jsonb_build_object(
                   'slot_id',            p_slot_id,
                   'previous_table_id',  v_prev_table_id
                 ));
         ```
      j. Return `jsonb_build_object('cleared', true, 'slot_id', p_slot_id,
         'previous_table_id', v_prev_table_id);`

   **GRANTs + defensive documentation (P1 R1-5):**
   ```sql
   GRANT EXECUTE ON FUNCTION rpc_assign_or_move_table_to_slot(uuid, uuid) TO authenticated;
   GRANT EXECUTE ON FUNCTION rpc_clear_slot_assignment(uuid) TO authenticated;

   COMMENT ON FUNCTION rpc_assign_or_move_table_to_slot(uuid, uuid) IS
     'PRD-067: SECURITY DEFINER. RULE-2 admin-only gate enforced inside function body
      via app.staff_role check; do NOT grant to any non-authenticated role and do NOT
      remove the role check in future revisions. Drops DEC-003 layer (2) FOR UPDATE
      lock if modified. These RPCs (rpc_assign_or_move_table_to_slot + rpc_clear_slot_assignment)
      are the authoritative write path; all non-emergency writes to
      floor_table_slot.preferred_table_id MUST go through them.';

   COMMENT ON FUNCTION rpc_clear_slot_assignment(uuid) IS
     'PRD-067: SECURITY DEFINER. RULE-2 admin-only gate enforced inside function body
      via app.staff_role check; idempotent for empty slots (RULE-4). These RPCs
      (rpc_assign_or_move_table_to_slot + rpc_clear_slot_assignment) are the
      authoritative write path for floor_table_slot.preferred_table_id.';
   ```

   **End migration:** `NOTIFY pgrst, 'reload schema';`

2. Regenerate types: `npm run db:types-local`

**Acceptance criteria.**
- [ ] Migration applies cleanly; `npm run db:types-local` exits 0.
- [ ] RPC signatures contain NO `p_casino_id`, NO `p_actor_id` (ADR-024 INV-8).
- [ ] RPCs call `set_rls_context_from_staff()` as their first executable statement.
- [ ] RPCs `SET search_path = ''` (ADR-018 / pre-commit hook).
- [ ] Every `UPDATE gaming_table` statement has explicit `AND casino_id = v_casino_id` predicate (P0-1).
- [ ] Every `RAISE EXCEPTION` specifies `USING ERRCODE = 'P0001'` (auth/forbidden) or `'P0002'` (constraint/state) (P2-1).
- [ ] RPC bodies contain no `SAVEPOINT`, no `EXCEPTION WHEN OTHERS` (P0-2 transactional atomicity).
- [ ] Active-layout resolution uses `FOR UPDATE` and `ORDER BY activated_at DESC, id DESC` tie-breaker (DEC-003 layer 2, P0-3).
- [ ] RPC bodies contain no `auth.jwt()` fallback on any write statement (ADR-030).
- [ ] Partial unique index present; direct duplicate INSERT raises unique violation.
- [ ] RPCs raise `SLOT_OCCUPIED` when target is held by a different table.
- [ ] Clear is idempotent (empty slot returns success without error).
- [ ] `gaming_table.pit` is updated as described (DEC-001 mirror).
- [ ] Each RPC writes one row to `audit_log` per successful mutation (domain='floor_layout', action IN {'slot_assign','slot_move','slot_clear'}).
- [ ] `COMMENT ON FUNCTION` present on both RPCs documenting the RULE-2 gate.

**Patterns.** ADR-018 Template 5 (Context Injection Pattern) literally.
`governance.context.md` § "Template 5: Context Injection Pattern".

### WS2 — FloorLayoutService Extension

**Purpose.** Publish typed functions and DTOs that invoke the WS1 RPCs and
aggregate read state for the panel.

**Deliverables.**

1. `services/floor-layout/dtos.ts` — add (flat sibling-array shape matching
   existing `FloorLayoutVersionWithSlotsDTO` precedent at `services/floor-layout/dtos.ts:117-120`):
   ```ts
   export type AssignedTableRef = Pick<
     Database['public']['Tables']['gaming_table']['Row'],
     'id' | 'label' | 'type' | 'status'
   >;

   /** Slot row enriched with assigned-table ref (for panel rendering) */
   export type FloorTableSlotWithTableRefDTO = FloorTableSlotDTO & {
     assigned_table: AssignedTableRef | null;
   };

   /**
    * Aggregate shape returned by getPitAssignmentState.
    * Flat sibling arrays matching FloorLayoutVersionWithSlotsDTO precedent.
    * Client groups slots by pit_id for rendering.
    */
   // eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC aggregate: sibling arrays, not single table projection
   export type PitAssignmentStateDTO = {
     layout_version_id: string;
     pits: FloorPitDTO[];
     slots: FloorTableSlotWithTableRefDTO[];
     unassigned_tables: AssignedTableRef[];
   };

   export type AssignOrMoveResultDTO = {
     table_id: string;
     slot_id: string;
     pit_id: string;
     pit_label: string;
     previous_slot_id: string | null;
   };
   export type ClearResultDTO = {
     cleared: boolean;
     slot_id: string;
     previous_table_id: string | null;
     idempotent?: boolean;
   };
   ```
2. `services/floor-layout/crud.ts` — add three functions:
   - `getPitAssignmentState(supabase, casinoId): Promise<PitAssignmentStateDTO | null>`
   - `assignOrMoveTableToSlot(supabase, tableId, slotId): Promise<AssignOrMoveResultDTO>`
   - `clearSlotAssignment(supabase, slotId): Promise<ClearResultDTO>`
3. `services/floor-layout/index.ts` — extend `FloorLayoutServiceInterface`; do NOT use ReturnType inference.
4. `services/floor-layout/keys.ts` — add `floorLayoutKeys.pitAssignmentState(casinoId)`.
5. `services/floor-layout/http.ts` — add three fetcher functions using `ServiceHttpResult<T>`.
6. `services/floor-layout/schemas.ts` — Zod schemas for `AssignOrMoveRequest` (`{ table_id: string }`) and mutation responses.
7. `services/floor-layout/mappers.ts` — `toPitAssignmentStateDTO` from RPC jsonb.

**Acceptance criteria.**
- [ ] `npm run type-check` exits 0.
- [ ] No `as any`, no raw `Error` objects in `DomainError.details` (INV-ERR-DETAILS).
- [ ] Service factory remains functional; explicit `FloorLayoutServiceInterface` extended (no ReturnType).
- [ ] DTOs derive from `Database` types via Pick/Omit where applicable; aggregate shape documented with existing `// eslint-disable-next-line custom-rules/no-manual-dto-interfaces -- RPC response` pattern.

### WS3 — Admin API Routes

**Purpose.** Expose the two mutations and the read aggregate through
admin-gated REST endpoints.

**Deliverables.**

1. `app/api/v1/floor-layouts/pit-assignment-state/route.ts` — `GET`, returns
   `ServiceHttpResult<PitAssignmentStateDTO | null>`. Casino derived from
   `mwCtx.rlsContext!.casinoId`, never from query or headers.
2. `app/api/v1/floor-layouts/slots/[slotId]/assign/route.ts`:
   - `POST` — body `{ table_id: string }`, invokes `assignOrMoveTableToSlot`.
     Requires idempotency key per PT-2 mutation standard.
   - `DELETE` — clears the slot via `clearSlotAssignment` (idempotent at
     RPC layer). Requires idempotency key.

**Admin gate pattern (inline, matches `app/api/v1/casino/settings/route.ts` precedent):**

All three handlers wrap their body with `withServerAction(supabase, async (mwCtx) => {...}, {...})`.
The admin role check is INLINE inside that body, not a separate wrapper:

```ts
const result = await withServerAction(
  supabase,
  async (mwCtx) => {
    // RPC is the authoritative gate — middleware role check is defence-in-depth
    if (mwCtx.rlsContext!.staffRole !== 'admin') {
      throw new DomainError(
        'FORBIDDEN_ADMIN_REQUIRED',
        'Admin role required for pit assignment mutations',
      );
    }
    // ... invoke service function, return ServiceHttpResult
  },
  { domain: 'floor_layout', action: 'slot_assign' | 'slot_clear' | 'pit_assignment_state.get',
    requireIdempotency: true /* for mutations */, idempotencyKey, correlationId: ctx.requestId },
);
```

**Acceptance criteria.**
- [ ] All three handlers lint clean (0 warnings).
- [ ] No handler passes `casino_id` or `actor_id` to the RPC (ADR-024 INV-8).
- [ ] Admin-role rejection returns 403 with `ServiceHttpResult` error envelope
      `{ ok: false, code: 'FORBIDDEN_ADMIN_REQUIRED', ... }` — does not leak server detail.
- [ ] Mutation handlers require idempotency key; GET does not.
- [ ] OpenAPI or route-catalog entry added if the project publishes one.

### WS4 — Panel + Hooks + Host Integration

**Purpose.** Render the panel inside `/admin/settings/operations` with
admin-only affordances.

**Deliverables.**

1. `components/admin/pit-configuration-panel.tsx` — single `'use client'`
   component matching peer admin settings forms (ShiftSettingsForm,
   ValuationSettingsForm, ThresholdSettingsForm). No RSC wrapper. No
   hydration boundary.
   - Per pit: list of slots with current assignment (select to change, clear button)
   - Unassigned tables list (grouped client-side from flat `slots[]` by pit_id)
   - Read via `useQuery` on `floorLayoutKeys.pitAssignmentState(casinoId)`
     with skeleton fallback (matches peer admin pattern)
   - Mutations via `useMutation` with cache invalidation of
     `pitAssignmentState` key
   - `useTransition` for mutation pending state
   - Shadcn Card, Select, Button, Skeleton primitives
   - Tailwind v4 styling consistent with peer admin panels
2. `hooks/floor-layout/use-pit-assignment-state.ts` — TanStack Query hook
   using `floorLayoutKeys.pitAssignmentState(casinoId)`.
3. `hooks/floor-layout/use-pit-assignment-mutations.ts` — two mutation hooks
   (assignOrMove, clear) with cache invalidation of pitAssignmentState key.
4. `hooks/floor-layout/index.ts` — re-exports.
5. `app/(dashboard)/admin/settings/operations/page.tsx` — modified to render
   `ShiftSettingsForm` + `<PitConfigurationPanel />` inside separate
   `SettingsContentSection` wrappers (or a single composed section). **No
   new top-level route is introduced.**

**Acceptance criteria.**
- [ ] `npm run type-check` exits 0.
- [ ] `npm run lint` exits 0 for new + modified files.
- [ ] Admin-only UI affordance: mutation buttons/selects absent for non-admin.
      Server-side authorization still rejects regardless of UI state (defence-in-depth).
- [ ] No new top-level page / route introduced — panel is a sub-component (FIB-S constraint).
- [ ] React 19 patterns used (useTransition); no forbidden JS gaming-day computation (N/A here but asserted).

### WS5 — Integration Tests

**Purpose.** Prove RULE-2 (admin-only), RULE-3 (duplicate rejection), RULE-4
(only existing active slots), RULE-5 (mirror is secondary), DEC-001 (mirror
behavior), DEC-003 (partial unique index).

**Deliverables.**

1. `services/floor-layout/__tests__/rpc-pit-assignment.int.test.ts` — 13 test groups
   (a)–(m) listed in the workstream description. Must run against real Supabase
   via `RUN_INTEGRATION_TESTS=true`.
2. `services/floor-layout/__tests__/pit-assignment-service.int.test.ts` — service-layer
   wrapper tests for happy paths + error propagation.

**Acceptance criteria.**
- [ ] All 13 test groups pass (a-m).
- [ ] Coverage for new service code ≥ 90% (per governance; quality.context.md).
- [ ] Non-admin tests assert 403-equivalent RPC rejection, not silent no-op.
- [ ] Cross-casino test uses two distinct staff records with distinct casino_ids.
- [ ] Mirror test (group i) asserts both sides: `gaming_table.pit = floor_pit.label`
      after assign, `gaming_table.pit IS NULL` after clear.

### WS6 — E2E Write-Path Spec

**Purpose.** Cover the FIB-S containment loop end-to-end from the host surface.

**Deliverables.**

1. `e2e/admin-operations/pit-configuration.spec.ts` — Playwright spec:
   - **Happy path:** admin login → nav to /admin/settings/operations → assign
     unassigned table to slot → verify panel refresh → relocate to different
     slot → verify previous slot empty + new slot occupied → clear → verify
     slot empty + table back in unassigned list → navigate to pit-scoped
     shift dashboard → verify pit membership reflects last assignment.
   - **Negative auth:** non-admin staff login → nav to /admin/settings/operations
     → assert mutation affordances absent (or Access Denied rendered).

**Acceptance criteria.**
- [ ] `npx playwright test e2e/admin-operations/pit-configuration.spec.ts` passes.
- [ ] Auth Mode A or B per QA-006 (not Mode C direct DB).
- [ ] Uses `useGamingDay`/temporal patterns only if required by flow (none expected).

## Definition of Done

**Functionality**
- [ ] Admin can view pit assignment state inside `/admin/settings/operations` (CAP-1)
- [ ] Admin can assign an unassigned table to an active slot (CAP-2, OUT-1)
- [ ] Admin can relocate a table between slots with no duplicate committed (CAP-3, OUT-2, OUT-3)
- [ ] Admin can clear a slot assignment (CAP-4, OUT-4)
- [ ] Downstream pit-scoped views reflect the updated mapping (CAP-5, OUT-5)

**Data & Integrity**
- [ ] Partial unique index prevents duplicate active assignment at DB layer (RULE-3, DEC-003)
- [ ] Canonical floor_table_slot mapping is source of truth; gaming_table.pit is compatibility mirror only (RULE-1, RULE-5, DEC-001)
- [ ] No orphaned assignments after relocate or clear

**Security & Access**
- [ ] RPC signatures accept no p_casino_id, p_actor_id (ADR-024 INV-8)
- [ ] RPCs call set_rls_context_from_staff() as first statement (ADR-015, ADR-024)
- [ ] RPC admin-role check at function entry (RULE-2); API middleware admin check; UI gates admin affordances
- [ ] Supported mutation path derives context exclusively via `set_rls_context_from_staff()` inside SECURITY DEFINER RPCs; RPC signatures accept no `p_casino_id` / `p_actor_id` and RPC write statements contain no `auth.jwt()` fallback
- [ ] No cross-casino assignment possible via these RPCs

**Testing**
- [ ] RPC integration tests cover all 13 groups (a–m): admin, non-admin, cross-casino (+ mirror no-touch), inactive slot, occupied target, idempotent clear, atomic move, unique index defence, DEC-001 mirror, audit_log emission, transactional rollback, concurrent-move, single-active drift (DEC-003-R8)
- [ ] Service layer coverage ≥ 90%
- [ ] Playwright E2E covers assign → relocate → clear + downstream consumption + non-admin rejection
- [ ] Non-admin negative test verifies mutation is rejected server-side, not just UI-hidden

**Operational Readiness**
- [ ] RPCs emit structured log event (actor, casino, pit, slot, previous table, new table, timestamp) via existing audit infrastructure — no new audit subsystem
- [ ] Rollback doc: reverting this feature removes operator access and the code path; prior mutations persist (PRD §8 "Operational Readiness" language applies verbatim)

**Governance**
- [ ] FIB-S intake traceability audit passes (traces_to on every workstream; no invented surfaces)
- [ ] Anti-invention audit: all app/api/ output paths match FIB-S `zachman.where.surfaces[kind=api]`
- [ ] No new top-level UI surface introduced
- [ ] No new truth-bearing metrics introduced (panel renders state, does not publish measurements)
- [ ] OQ-1 and OQ-2 resolved via DEC-001 and DEC-002 with cited evidence
- [ ] Pre-WS1 bootstrap coverage check (R1) executed
- [ ] **Mirror Authority verification** — code review / grep confirms no new direct writes to `gaming_table.pit` outside the approved PRD-067 RPC path or explicitly documented emergency repair scripts. Per the Mirror Authority Rule, any such write is a RULE-5 violation and must be rejected.
- [ ] R6-FU (required hardening follow-up) logged to the appropriate tracker (PRD-030 track or dedicated RLS-hardening EXEC-SPEC); status reviewed at release audit, not carried silently

## Rollback Plan

Per PRD §8: reverting this feature removes operator access to the panel and
removes the code paths (UI, API, service extensions, RPCs, unique index).
It does **not** restore pre-release `floor_table_slot.preferred_table_id`
or `gaming_table.pit` values — those remain whatever state the RPCs wrote
them to. Any reversal of data state requires a separately authored
data-reversal procedure not included in this EXEC-SPEC.

## External References

- PRD-067: `docs/10-prd/PRD-067-admin-operations-pit-configuration-v0.md`
- FIB-H: `docs/issues/gaps/pit-configuration/FIB-PIT-CONFIG-001-admin-operations-pit-configuration.md`
- FIB-S: `docs/issues/gaps/pit-configuration/FIB-S-PIT-CONFIG-001-admin-operations-pit-configuration.json`
- SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (FloorLayoutService §1580-1719)
- ADR-015, ADR-018, ADR-020, ADR-024, ADR-030 (referenced in PRD-067 frontmatter)
- Existing service: `services/floor-layout/`
- Existing host: `app/(dashboard)/admin/settings/operations/page.tsx`
- Base migration: `supabase/migrations/20251108223004_create_floor_layout_service.sql`
- Existing RLS: `supabase/migrations/20251212080915_sec006_rls_hardening.sql` §1.4
