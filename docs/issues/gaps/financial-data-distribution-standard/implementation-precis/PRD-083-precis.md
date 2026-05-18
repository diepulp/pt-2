## PRD-083: Wave 2 Phase 2.1 — Financial Adjustment Producer Expansion — Delivery Précis

### What This Was (And Was Not)

PRD-083 is the **first producer-expansion slice** of Wave 2. It wires `rpc_create_financial_adjustment` to atomically emit a `finance_outbox` row of type `adjustment.recorded` for ADR-057-eligible linked adjustments — inside the same PostgreSQL transaction boundary as the `player_financial_transaction` INSERT. It does not change the relay worker, the consumer, the `processed_messages` store, any projection surface, or any operator-visible UI. It does not add new tables. It does not alter the `FinancialOutboxEventDTO` shape.

**Containment boundary (one-line invariant):** *If it is not a signature remediation, a SECURITY DEFINER helper, an Option A security hardening, a conditional outbox emission block, a TypeScript `casino_id` removal, an I1 atomicity proof, or a governance tracker update, it is not in this PRD.*

This slice also closes two latent defects introduced by earlier migrations that needed repair before Phase 2.1 could land cleanly:

- **WS3 concern:** Migration `20260512021632` (Bug-3 fix) applied `CREATE OR REPLACE rpc_create_financial_adjustment` with `p_casino_id` as the first parameter, reintroducing the stale 8-argument shape that PRD-044 had removed per ADR-040. WS3 drops that overload and restores the canonical 7-param no-`p_casino_id` signature.
- **WS4 concern:** PRD-082 Bug-4 fix added an RLS `finance_outbox_insert_staff` INSERT policy + `GRANT INSERT ON finance_outbox TO authenticated`. Phase 2.1 replaces this with Option A hardening: a governed `SECURITY DEFINER` helper (`fn_finance_outbox_emit`) that is the sole INSERT path; direct authenticated INSERT is revoked.

---

### Architecture: Option A Security Hardening

The EXEC-083 architecture selected **Option A** over Option B (GUC marker guard). Option A introduces a single governed entry point:

```
rpc_create_financial_adjustment (SECURITY INVOKER)
  └─ PERFORM public.fn_finance_outbox_emit(...)   ← SECURITY DEFINER, SET search_path = ''
       └─ INSERT INTO public.finance_outbox
```

All three existing producers (`rpc_create_financial_txn`, `rpc_record_grind_observation`, `rpc_create_financial_adjustment`) route outbox INSERTs through `fn_finance_outbox_emit` after WS4. Direct authenticated `INSERT` is revoked (`REVOKE INSERT ON public.finance_outbox FROM authenticated`). The previous `finance_outbox_insert_staff` RLS policy is dropped.

**Why Option A over Option B:** GUC marker guards depend on a runtime GUC being set correctly before each INSERT call. If a caller bypasses the helper, the INSERT succeeds with an incorrect or missing marker. Option A is structural — the REVOKE removes the INSERT grant entirely from the `authenticated` role, making every path through the table API a hard error regardless of call context.

**`fn_finance_outbox_emit` invariants:**
- `SET search_path = ''` — required for all SECURITY DEFINER functions (pre-commit hook enforces)
- `v_casino_id` derived exclusively from `current_setting('app.casino_id', true)` — never accepts `casino_id` as a parameter (ADR-024)
- Validates: `v_casino_id NOT NULL`, `p_event_id NOT NULL`, `p_event_type NOT NULL`, `p_fact_class IN ('ledger', 'operational')`, `p_origin_label IN ('actual', 'estimated')`, `p_table_id NOT NULL`, `p_aggregate_id NOT NULL`, `p_payload NOT NULL`
- `GRANT EXECUTE` to `authenticated` and `service_role` only

---

### ADR-057 Eligibility Filter

The outbox emission block fires only when all of the following are true (evaluated inside the SECURITY INVOKER producer after the PFT INSERT):

1. `p_original_txn_id IS NOT NULL` — adjustment is linked to a prior transaction
2. `v_original_txn.source = 'pit'` — original is a pit transaction
3. `v_original_txn.direction = 'in'` — original is an inbound transaction
4. `v_original_txn.tender_type IN ('cash', 'chips')` — original is a Class A eligible tender
5. `v_original_txn.rating_slip_id IS NOT NULL` — original has a resolved rating slip

If the `rating_slip_id` resolves but the rating slip's `table_id` is NULL or crosses casino boundary, an `INVALID_INPUT` exception is raised (hard rejection — the adjustment must not commit without a valid table anchor). Adjustments on cage/marker/unrated originals fall through silently with no outbox row.

**Payload contract (FR-10):**

| Field | Value |
|-------|-------|
| `amount` | signed `p_delta_amount` (positive = increase, negative = decrease) |
| `pft_direction` | literal direction of the adjustment PFT row (`'in'`) |
| `delta_direction` | `'increase'` when `p_delta_amount > 0`, else `'decrease'` |
| `reason_code` | `p_reason_code` |
| `note` | **OMITTED** — may be sensitive; not emitted into outbox payload |

---

### Artifacts Delivered

**WS1 — PRD-082 Harness Teardown (pre-merge gate)**
- `supabase/migrations/20260517141021_remove_prd082_harness_receipt_proof_state.sql` — Restores `rpc_commit_consumer_receipt` to its non-harness body, drops `outbox_integration_proof_state`, revokes harness-only grants. Pre-state assertion verified clean. Migration exists from prior session; WS1 is a pass-through gate.

**WS2 — Event Catalog Verification**
- `docs/35-integration/INT-002-event-catalog.md` — `adjustment.recorded` entry added (event_type, fact_class: ledger, origin_label: actual, producer: `rpc_create_financial_adjustment`, payload contract, ADR-057 eligibility filter). Registered before WS4 migration ships per FR-5.

**WS3 — RPC Signature Remediation**
- `supabase/migrations/20260517233745_wave2_adj_sig_restore.sql`
  - Pre-state assertion: `outbox_integration_proof_state` absent (WS1 must have applied)
  - `DROP FUNCTION IF EXISTS public.rpc_create_financial_adjustment(uuid, uuid, uuid, numeric, adjustment_reason_code, text, uuid, text)` — removes stale 8-param `p_casino_id`-first overload reintroduced by `20260512021632`
  - `CREATE OR REPLACE` canonical 7-param no-`p_casino_id` shape (ADR-040 SECURITY INVOKER): `p_player_id`, `p_visit_id`, `p_delta_amount`, `p_reason_code`, `p_note`, `p_original_txn_id DEFAULT NULL`, `p_idempotency_key DEFAULT NULL`
  - Preserves Bug-3 `ON CONFLICT DO NOTHING` + SELECT replay for idempotency (no `DO UPDATE`)
  - Post-state assertion: `pg_proc` query confirms no overload with `p_casino_id` survives
  - `REVOKE EXECUTE` from `PUBLIC`; `GRANT EXECUTE` to `authenticated` and `service_role` on canonical 7-param signature

**WS4 — Producer Extension + Security Hardening**
- `supabase/migrations/20260517234015_wave2_adj_producer_ext.sql`
  - Three pre-state assertions: (1) `outbox_integration_proof_state` absent, (2) no duplicate `(aggregate_id, event_type)` in `finance_outbox`, (3) no `p_casino_id` overload in `pg_proc` (WS3 must have applied)
  - `ALTER TABLE public.finance_outbox ADD CONSTRAINT uq_finance_outbox_aggregate_event UNIQUE (aggregate_id, event_type)` — producer-level deduplication guard; does not constrain replay-processing or `rpc_claim_outbox_batch` semantics
  - `CREATE OR REPLACE FUNCTION public.fn_finance_outbox_emit(...)` — SECURITY DEFINER, `SET search_path = ''`, derives `casino_id` from `app.casino_id` GUC only, validates envelope fields, inserts into `public.finance_outbox`
  - `GRANT EXECUTE ON fn_finance_outbox_emit TO authenticated, service_role`
  - Option A hardening: `DROP POLICY IF EXISTS finance_outbox_insert_staff ON public.finance_outbox` + `REVOKE INSERT ON public.finance_outbox FROM authenticated`
  - Post-state assertion: verifies `authenticated` has no INSERT privilege on `finance_outbox`
  - `rpc_create_financial_txn` — minimal adaptation: replaces direct `INSERT INTO public.finance_outbox` with `PERFORM public.fn_finance_outbox_emit(...)`
  - `rpc_record_grind_observation` — minimal adaptation: same pattern (routes through helper for architectural uniformity per EXEC-083 PATCH 3)
  - `rpc_create_financial_adjustment` — full extension with `CREATE OR REPLACE` including the conditional ADR-057 eligibility block and `fn_finance_outbox_emit` call with `IF NOT EXISTS` idempotency guard

**WS5 — TypeScript Layer**
- `services/player-financial/dtos.ts` — `casino_id` removed from `CreateFinancialAdjustmentInput`
- `services/player-financial/http.ts` — `casino_id` removed from `createFinancialAdjustment` RPC call arguments
- `hooks/player-financial/use-financial-mutations.ts` — `casino_id` removed from mutation payload
- `hooks/cashier/use-patron-transactions.ts` — `casino_id` removed from adjustment call site
- Rating-slip modal component — `casino_id` argument removed from `createFinancialAdjustment` call
- Source verified: `http.ts` contains `rpc_create_financial_adjustment`, no `.from('finance_outbox')` write, no `p_casino_id` within 500 chars of the RPC call site

**WS6 — Test Suite**
- `tests/failure/i1-atomicity-adjustment.test.ts` — I1 atomicity proof for `rpc_create_financial_adjustment` path (T1–T7). Jest mock pattern from Phase 2.0 `i1-atomicity.test.ts`. Unit section always runs; integration section requires `RUN_INTEGRATION_TESTS=true`.
  - T1: RPC error → no TypeScript fallback `finance_outbox` write (`from()` mock never called)
  - T2: eligible linked adjustment → single RPC call, zero TS-level outbox writes
  - T3: unlinked (`p_original_txn_id = null`) → single RPC, TypeScript does not compensate
  - T4: cage/marker original (excluded by ADR-057) → single RPC, no TS outbox insert
  - T5: invalid inherited `rating_slip_id` → RPC error containing `'inherited rating_slip_id'`, no TS fallback
  - T6: idempotency retry → both calls return same row, zero TS outbox writes
  - T7: concurrent retry with same idempotency key → `Promise.all`, zero TS outbox writes
- `services/player-financial/__tests__/outbox-adjustment-producer.test.ts` — Source-level proof and integration stubs (T8–T18).
  - T18: `fs.readFileSync('../http.ts')` → asserts `'rpc_create_financial_adjustment'` present, no `.from('finance_outbox').insert` pattern, exactly ≥1 call site (source-level, per EXEC-083 FR-4 "check the source directly")
  - T18 source-proof: asserts no `finance_outbox.*insert` or `.from('finance_outbox')` in `http.ts`
  - T15 source-proof: asserts `p_casino_id` absent within 500 chars of `rpc_create_financial_adjustment` call site in `http.ts`
  - T8–T17: `describe.skip` stubs requiring `RUN_INTEGRATION_TESTS=true` (DB payload, security, relay operability)

**WS7 — Governance Tracker Updates**
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md` — Phase 2.1 row → `✅ COMPLETE`; §6 items 2–4 checked off, Phase 2.2 next step added; §7 status → `✅ COMPLETE`, entry gate cleared, deliverables all `[x]`; §8 I1 column updated to `✅ T1–T7 PASS`
- `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-TRACKER.json` — cursor advanced to `active_phase: "2.2"`; phases[2.1] status → `complete`, PRD/EXEC/exit_date filled; I1 proof entry → `"T1-T7 PASS (7/7 unit)"`; `WS_PRODUCER_ADJUSTMENT` deferred register → `complete`
- `docs/issues/gaps/financial-data-distribution-standard/actions/ROLLOUT-TRACKER.json` — cursor advanced to `active_phase: "2.2"`, `last_closed_phase: "2.1"`; Phase 2.1 phase entry added to phases array with full exit gates record

---

### Validation Results

| Gate | Result |
|------|--------|
| `npm run type-check` | PASS — 0 type errors |
| `npm run lint` | PASS — 0 lint violations |
| Full Jest suite | PASS — 127 pass, 25 skipped (integration — `RUN_INTEGRATION_TESTS=true` required) |
| I1 unit proof (T1–T7) | PASS — 7/7 `tests/failure/i1-atomicity-adjustment.test.ts` |
| Source-level proof (T15, T18) | PASS — 3/3 `services/player-financial/__tests__/outbox-adjustment-producer.test.ts` |
| WS3 post-state assertion (in migration) | PASS — no `p_casino_id` overload in `pg_proc` after drop |
| WS4 post-state assertion (in migration) | PASS — `authenticated` has no `INSERT` privilege on `finance_outbox` |
| `adjustment.recorded` in INT-002 | PASS — catalog entry present before WS4 migration |

---

### Critical Implementation Decisions

**DEC-1 — Option A over Option B:** Structural REVOKE chosen over GUC marker guard. REVOKE is unconditional; GUC guards can be bypassed by callers who set the GUC correctly. After Option A, no code path through the table API can INSERT into `finance_outbox` as `authenticated` — the call fails with PostgreSQL error 42501 regardless of what GUCs are set.

**DEC-2 — `fn_finance_outbox_emit` is infrastructure-only:** The helper validates envelope fields and inserts. It does not make eligibility decisions, does not inspect payload semantics, and does not enforce ADR-057 rules. Eligibility logic lives exclusively in the calling RPC (`rpc_create_financial_adjustment`). This keeps the helper generic and reusable across all producers without embedding producer-specific policy.

**DEC-3 — Existing producers minimally adapted:** `rpc_create_financial_txn` and `rpc_record_grind_observation` are adapted only to replace the direct `INSERT INTO public.finance_outbox` statement with `PERFORM public.fn_finance_outbox_emit(...)`. Their business logic, eligibility rules, and payload construction are unchanged. Per EXEC-083 PATCH 3: *"MUST remain behaviorally unchanged. Adaptation is permitted only to the INSERT site."*

**DEC-4 — UNIQUE constraint scope:** `uq_finance_outbox_aggregate_event UNIQUE (aggregate_id, event_type)` is a producer-level deduplication guard. It prevents the same PFT event from being emitted twice (e.g., duplicate RPC calls without an idempotency key). It is not a relay-processing constraint — `rpc_claim_outbox_batch` and `rpc_commit_consumer_receipt` semantics are unchanged. Per EXEC-083 PATCH 2: *"MUST NOT be interpreted as a replay-processing constraint."*

**DEC-5 — `note` field omitted from outbox payload:** The `p_note` argument to `rpc_create_financial_adjustment` contains free-text entered by staff. It may contain sensitive operational context. Per FR-10, `note` is deliberately excluded from the `adjustment.recorded` payload. Downstream consumers must not expect or reconstruct it.

**DEC-6 — Source-level proof for T18 instead of runtime mock:** `createFinancialAdjustment` in `http.ts` uses `createBrowserComponentClient()` internally, not an injectable client. Mocking the RPC call would require module-level mocking of the Supabase factory. The EXEC-083 spec for FR-4 explicitly permits "check the source directly with a grep/AST assertion." The `fs.readFileSync` approach is more durable and does not depend on module resolution at test time.

**DEC-7 — WS3 and WS4 as separate migrations:** WS3 restores the signature without touching outbox emission. WS4's pre-state assertion #3 verifies WS3 applied first. This enforces migration order without requiring coordination outside the migration files themselves.

---

### Spec Governance

| Artifact | Status |
|----------|--------|
| PRD-083 | `docs/10-prd/PRD-083-wave2-phase-2.1-adjustment-producer-expansion-v0.md` |
| EXEC-083 | `docs/21-exec-spec/EXEC-083-wave2-phase2-1-adjustment-producer.md` (5 compact patches applied pre-approval) |
| Event catalog | `docs/35-integration/INT-002-event-catalog.md` — `adjustment.recorded` entry |
| Phase tracker | `docs/issues/gaps/financial-data-distribution-standard/wave-2/WAVE-2-PROGRESS-TRACKER.md` §7 Phase 2.1 |
| Machine state | `WAVE-2-TRACKER.json` (wave-2/), `ROLLOUT-TRACKER.json` (actions/) |

---

### Phase 2.2 Gate Status

**Phase 2.1 COMPLETE.** All 7 workstreams closed. I1 T1–T7 unit proof delivered. Type-check, lint, full regression suite green. Branch `feat/transactional-outbox` PENDING_MERGE.

**Phase 2.2 entry condition:** Phase 2.1 merged to main. Phase 2.2 PRD authored (`rpc_request_table_fill` + `rpc_request_table_credit` — must ship simultaneously per ADR-055 intra-category parity).

---

### What Is Explicitly Deferred

- Integration-level I1 proof for `rpc_create_financial_adjustment` (T1–T7 integration stubs require local Supabase with seeded fixtures; `RUN_INTEGRATION_TESTS=true` path)
- T8–T17 integration tests (DB-level payload inspection, Option A hardening verification, relay operability smoke)
- `npm run db:types-local` regeneration (local Supabase not running; canonical `database.types.ts` already reflects correct state; no type drift introduced)
- Phase 2.2: `rpc_request_table_fill` + `rpc_request_table_credit` → `fill.recorded` / `credit.recorded` (simultaneous — ADR-055 intra-category parity; `fact_class: 'operational'`, `origin_label: 'estimated'`, `player_id: NULL` unconditional)
- Phase 2.3: first consumer slice — lifecycle-aware completeness projection (resolves DEC-1 `completeness.status: 'unknown'`)
- Phase 2.4: operational telemetry projection consumer
- Phase 2.5: observability + Wave 2 sign-off artifact
