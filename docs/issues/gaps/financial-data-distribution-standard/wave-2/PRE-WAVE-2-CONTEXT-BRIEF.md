## Financial Model Authority — Phase 2 Context Brief

**Date:** 2026-05-06 | **Branch:** feat/transactional-outbox | **Session:** Post-Wave-1 design review prep + GAP-F1 live analysis

---

## Part 1 — Wave 1 Close State Assessment

### What shipped and what it means

Wave 1 delivered the **surface contract only** — the FinancialValue envelope on every production financial boundary (12 DTO fields across 4 DTOs, all Wave 1 phases), ESLint enforcement, truth-telling test suite (I5 subset), and BRIDGE-001 retirement (integer cents enforced). The production app at pt-2-weld.vercel.app is conformant with the surface rendering contract.

**Conformance posture at Wave 1 close:**

| Rule                                                                 | Status          | Notes                                                                                                        |
| -------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| Surface rendering contract (type/source/completeness on every field) | ✅ CONFORMANT   | All 4 DTOs wrapped. completeness.status `'unknown'` where lifecycle column absent (DEC-1) — correct behavior |
| No authoritative totals (ADR-053 D2)                                 | ✅ CONFORMANT   | No "Total Drop" rendered anywhere                                                                            |
| `FinancialEnvelope ≠ EventPayload` separation                        | ✅ CONFORMANT   | Envelope is surface-only; outbox not yet used                                                                |
| Attribution Ratio distinction from completeness                      | ✅ CONFORMANT   | Distinct rendering per Phase 1.3                                                                             |
| ADR-054 D1 — outbox as sole propagation path                         | ❌ NOT ENFORCED | GAP-F1: zero producers. ADR is aspirational, not implemented in code                                         |
| ADR-054 D6 — no hidden triggers                                      | ⚠️ UNKNOWN      | FPT-003/FPT-004 analysis debt not yet cleared                                                                |
| `completeness.status = 'unknown'` on visit/MTL aggregates            | ✅ CORRECT      | DEC-1 correctly defers 'complete'/'partial' to Wave 2 lifecycle infrastructure                               |

**What Wave 1 intentionally left open:**
- All 4 validation invariants I1–I4 (atomicity, durability, idempotency, replayability) are Wave 2 scope — none implemented
- `completeness.status` will remain `'unknown'` on all visit-level and MTL summary surfaces until Wave 2 introduces a gaming-day lifecycle column
- GAP-F1 (`finance_outbox` has zero producers) is the structural debt Wave 2 must close first

---

## Part 2 — Design Review: What Q1 and Q2 Need to Resolve

### Q1 — PFT schema expand for table-only events, or Class B stays in a separate authoring store?

**Why this is blocked:** ADR-052 §4 *explicitly rejected* "PFT absorbs grind via `is_rated`." The design review must determine whether the Q1 proposal (table-only rows in PFT where `player_id = NULL`) is materially different from that rejected pattern, or whether it is the same thing dressed differently.

**What the review must establish — four mandatory determinations:**

1. **Attribution invariant** — ADR-052 R5 says attribution is whole or absent; Class A requires `player_id NOT NULL`. If PFT is extended to carry `player_id = NULL` rows, what discriminator signals "this is a ledger row with attribution" vs "this is a ledger row without"? Without a formal discriminator this is a silent mixed-class table — the exact problem the ADR was written to prevent.

2. **Write boundary purity** — If Class B operational facts can enter PFT, what prevents a future consumer from treating them as auditable ledger truth? The ADR's rejected pattern failed on exactly this contamination risk. The review must name the enforcement mechanism that would prevent it.

3. **Outbox coupling symmetry** — ADR-055 P1 requires both authoring paths to insert the same outbox column set. If Class B is moved into PFT, the outbox coupling inside `rpc_create_financial_txn` would need to handle both `fact_class` values. The review should assess whether this is simpler or more complex than two dedicated RPCs.

4. **Production data signal** — The review needs actual production write patterns: are there real events that are currently falling through the cracks (unattributed observations that should be PFT rows)? Without that data, Q1 is a theoretical architecture debate.

**Decision (2026-05-06):** Two-store model confirmed for Wave 2. PFT expansion rejected — the proposal is materially equivalent to the ADR-052 §4 rejected pattern. Any future reconsideration requires a superseding ADR before any code is written.

### Q2 — Grind normalized under shared parent with discriminator, or fully separate?

**Why this is adjacent to Q1 but distinct:** Q1 asks whether Class B and Class A share a store. Q2 asks, given Class B stays separate from Class A, whether the grind partition inside `table_buyin_telemetry` should be normalized under a shared parent.

**What the ADR set says — and what it does not say:**

ADR-052 D3 mandates grind and rated rows must be *distinguishable per row* and defaults to split. A shared parent with a DB-enforced discriminator formally satisfies "distinguishable per row." The ADR does not categorically forbid a shared parent for Class B's internal structure. This nuance matters — the review should not misread the ADR as prohibiting it.

**But the architectural risk is not schema ambiguity. It is behavioral convergence.**

A table shaped like:

```sql
CREATE TABLE financial_events (
  fact_class TEXT NOT NULL CHECK (fact_class IN ('ledger', 'operational')),
  ...
);
```

creates immediate gravitational pressure toward:

- **Unified query surfaces** — engineers reach for `SELECT * FROM financial_events` instead of `SELECT * FROM player_financial_transaction`
- **Shared projection assumptions** — a single query fan-out that implicitly blends Class A and Class B unless the WHERE clause is disciplined
- **Generalized aggregates** — a `SUM(amount)` that crosses the `fact_class` boundary silently, violating ADR-054 D5 authority degradation
- **Reconciliation creep** — a future engineer compares `fact_class = 'ledger'` rows against `fact_class = 'operational'` rows inside the same query and calls the result "variance analysis" — the exact pattern ADR-053 D3 forbids

The discriminator column does not prevent this. It creates the *appearance* of a boundary. Whether the boundary holds depends entirely on enforcement mechanisms that are not architectural — they are behavioral and institutional. The system's history is instructive: the TBT shadow system itself was the product of exactly this kind of gravitational convergence in a table that was "designed with separation in mind."

**The discriminator becomes ceremonial over time unless all five of these hold simultaneously:**

1. DB CHECK constraint enforces the discriminator is present and typed (not free-string)
2. DTO layer keeps separate DTO types per class — no shared parent DTO
3. Service boundaries: no single service reads across both `fact_class` values in one query
4. Query discipline: projections query by `fact_class` first, never treat the shared parent as a unified ledger
5. Review gates: PRDs and EXEC-SPECs explicitly flag any new query crossing the `fact_class` boundary as requiring authority degradation

Without all five, the shared parent is an invitation to drift.

**What the review must establish if the shared parent option is kept on the table:**

1. **Physical partitioning** — not just a discriminator column. Each class has a physically separate data segment that cannot be accidentally cross-scanned.
2. **DB-enforced discriminator** — `CHECK` constraint or native enum, `NOT NULL`, covering all valid values. Not nullable, not free-text.
3. **Mandatory service isolation** — the SRM must be updated to declare that no service may issue a query spanning both `fact_class` values without an explicit authority degradation step. This is a governance update, not just a code review note.
4. **Separate DTOs** — `LedgerFactDTO` and `OperationalFactDTO` are not derived from a shared parent DTO. The shared table does not produce a shared DTO.
5. **Projection rebuild isolation** — a projection rebuildable from `fact_class = 'ledger'` rows alone must never depend on `fact_class = 'operational'` rows, and vice versa.

**Decision (2026-05-06):** Separate tables confirmed for Wave 2. The shared parent is conditionally permitted by the ADR set (the five-commitment checklist above is not voided) but behavioral convergence risk favors structural separation as the default. This decision is revisable in a future phase only with explicit five-commitment sign-off documented before any DDL is written.

**Outbox envelope is unaffected by this decision:** ADR-055 P1 envelope parity means the `finance_outbox` column set is identical regardless of where Class B is stored. Q2 affects the authoring RPC, not the event schema. If anyone argues Q2 affects the outbox envelope, that is a misunderstanding to correct in the review.

**`table_id` anchoring must survive:** Both the grind partition and any shared parent must enforce `table_id NOT NULL` at the DB level (ADR-052 D2). Confirm this constraint is present in any proposed DDL.

**No dual-write path:** ADR-052 R3 forbids dual-write from PFT to the grind authoring store. A shared parent must not create a join path that could be read as a dual-write. The FK structure of any proposed schema must be reviewed against R3.

### Q4 — Outbox emission: trigger-based, shared RPC, or both?

**What the ADR set permits:** Both forms satisfy the literal same-transaction rule (ADR-054 D2), but under different conditions. A `BEFORE`/`AFTER INSERT` trigger that writes **only** to `finance_outbox` within the same transaction is permitted. A single RPC that inserts both the authoring row and the outbox row before `COMMIT` is permitted. A post-commit trigger, a background job, or two RPCs described as "atomic" are all forbidden — ADR-054 D2 is literal.

**Decision (2026-05-06): Shared RPC-coupled outbox insertion adopted.**

Each authoring RPC inserts the authoring row and the corresponding `finance_outbox` row within the same literal database transaction (ADR-054 D2). This applies to both Class A (`rpc_create_financial_txn`, `rpc_create_financial_adjustment`) and Class B (grind authoring RPC) simultaneously — ADR-055 P4, no asymmetric rollout.

Trigger-based outbox insertion is **rejected for the pilot phase**.

**Rationale:**
- Preserves explicit transaction ownership at the RPC boundary
- Avoids hidden propagation behavior (ADR-054 D6 risk eliminated by design)
- Rollback and debug visibility is at the application layer, not buried in DB trigger firing order
- Aligns with the existing RPC-centric architecture — no new DB-side mechanism class introduced
- Simplifies parity enforcement under ADR-055: one validation mechanism (application-layer Zod + SQL) for both classes
- Reduces trigger-creep risk — triggers permitted by ADR-054 D2 are now an explicit non-starter for this system

**Hard constraint on RPC scope:** The RPC performs deterministic outbox construction only. Permitted: insert authoring row, insert `finance_outbox` row, return authoring row `id`. Forbidden inside the RPC: projection writes, fan-out, notifications, reconciliation steps, or any business-side propagation logic. The RPC boundary is the propagation firewall.

**Pre-rejected option (recorded for completeness):** "Both" (trigger for one class, RPC for the other) is an ADR-055 P3 violation (asymmetric validation mechanisms) and P4 violation (asymmetric rollout). It was eliminated before the trigger vs. RPC decision was made.

**Implementation scope for Wave 2 Day 1 (alongside DDL migration):**
- `rpc_create_financial_txn` modified to insert into `finance_outbox` in same `BEGIN…COMMIT`; `event_id` generated at RPC boundary with UUID v7
- `rpc_create_financial_adjustment` same modification
- Class B grind authoring RPC same modification — ships in same migration as Class A (P4)

---

## Part 3 — Outbox KB Gaps and Contradictions to Resolve Before Wave 2 Planning

### Critical finding: `finance_outbox` DDL is non-conformant with ADR-054

The existing table (migration `20251109214028_finance_loyalty_idempotency_outbox.sql`) is structurally incompatible with the ADR-054 schema that the outbox knowledge base documents. **This is a DDL migration that must precede any producer wiring.**

**Field-by-field gap:**

| ADR-054 Required Field                              | Current DDL                                                       | Gap                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id UUID NOT NULL` (idempotency key, UUID v7) | `id UUID DEFAULT gen_random_uuid()`                               | Wrong name; UUID v4 not v7; `gen_random_uuid()` violates ADR-055 P2 (must generate at authoring boundary explicitly)                                      |
| `fact_class TEXT/ENUM NOT NULL`                     | **MISSING**                                                       | Schema-level violation — load-bearing discriminator absent                                                                                                |
| `origin_label TEXT/ENUM NOT NULL`                   | **MISSING**                                                       | Schema-level violation — load-bearing discriminator absent                                                                                                |
| `table_id UUID NOT NULL`                            | **MISSING**                                                       | ADR-052 D2 violation — table-first anchoring not enforced                                                                                                 |
| `player_id UUID NULL`                               | **MISSING**                                                       | NULL for Class B is a requirement, not an option                                                                                                          |
| `aggregate_id UUID NOT NULL`                        | `ledger_id UUID NOT NULL REFERENCES player_financial_transaction` | FK to PFT makes Class B inserts impossible — structural Class A-only bias that violates ADR-055 P1 (envelope parity) and P4 (no class-conditional fields) |

**Additional structural issues in current DDL:**
- `attempt_count INT NOT NULL DEFAULT 0` — relay worker retry state does not belong in an append-only outbox table. The KB specifies the relay worker manages retry logic externally; the outbox row is immutable infrastructure.
- `ix_finance_outbox_unprocessed` uses `(casino_id, created_at DESC)` — the KB requires `(processed_at NULLS FIRST, created_at)` for relay worker polling and a separate `(table_id, created_at)` index for per-entity ordering. The current index does not support per-entity FIFO.

**Impact:** Since GAP-F1 confirms zero producers (table is always empty), this is a clean DDL-only migration — no data migration required. But it is **Wave 2 Day 1 work** and must be completed before any RPC or trigger coupling is designed. The GAP-F1 closure checklist in KB §12 should be updated to add this as Step 0.

### Documentation error in wave-2-tranactional-outbox-guidance.md §6

```ts
// Current (wrong):
Event {
  event_id: string
  aggregate_id: string   // table_id   ← THIS IS WRONG
  ...
}
```

The comment conflates `aggregate_id` (the specific authoring row's PK) with `table_id` (the per-entity ordering key). The KB §6 correctly states these are distinct fields with distinct purposes. The older guidance doc is wrong; the KB is authoritative. This should be corrected before the design review to avoid teams building the wrong mental model.

### Open design question: relay worker authentication against RLS-protected outbox

The current `finance_outbox` has RLS policies requiring `auth.uid() IS NOT NULL` for SELECT and INSERT. A server-side relay worker polling the table does not carry a Supabase JWT. Neither the KB nor the ADR addresses how the relay worker authenticates. Options:
- Service role key (bypasses RLS entirely — works but requires careful scoping)
- SECURITY DEFINER RPC for relay worker reads

This must be resolved during Wave 2 DDL design, not left to implementation. It is not a contradiction in the KB — it is a gap the KB does not cover.

### Q4 design constraint the KB does underspecify

Q4 asks: outbox emission via trigger-based insert, shared RPC, or both? The KB (§1 trigger classification) says both are permitted, but does not address the performance tradeoff under concurrent writes to PFT. Under high-throughput buy-in recording, a trigger adds synchronous latency inside the transaction. The design review's performance testing (unblocking step 3) must measure this before Q4 can be answered. The KB correctly defers this — it is not a gap but the design review team should know the KB has no performance guidance on trigger vs. RPC form.

---

## Summary for the Design Review Agenda

**Decisions recorded (2026-05-06):**

| Question | Decision | Status |
|---|---|---|
| **Q1** — PFT expansion vs. separate store | Two-store model confirmed. PFT expansion rejected — ADR-052 §4 pattern. Future reconsideration requires superseding ADR. | ✅ Resolved |
| **Q2** — Shared parent vs. separate tables | Separate tables confirmed. Shared parent conditionally permitted by ADR set but behavioral convergence risk favors structural separation. Revisable with explicit five-commitment sign-off. | ✅ Resolved |
| **Q3** — External reconciliation consumer contract | Deferred outside pilot scope. Wave 2 = internal propagation only. ADR-053 D4 defines the integration point. Future externalization requires separate ADR + stakeholder discovery. | ✅ Resolved (deferred) |
| **Q4** — Outbox emission: trigger vs. RPC | Shared RPC-coupled insertion adopted for both classes. Triggers rejected for pilot. RPC performs deterministic outbox construction only — no projection writes, fan-out, or business logic. | ✅ Resolved |

**All four questions resolved. Wave 2 planning is unblocked.**

**Remaining Wave 2 prerequisites before `/prd-writer`:**
1. **DDL migration** for `finance_outbox` — table must be rebuilt before GAP-F1 work begins (zero-data migration). Wave 2 Day 1.
2. **Failure harness stub run** — `FAILURE-SIMULATION-HARNESS.md` is EXEC-READY but not yet verified against a stub implementation (I1–I4).

**Resolved by explicit deferral (no longer blocking Wave 2):**
- Q3 (reconciliation consumer contract) — deferred outside pilot scope 2026-05-06. Wave 2 defines internal propagation guarantees only. No external consumer contract, reconciliation interface, or third-party event semantics are frozen in this phase. Outbox remains internal infrastructure. Future externalization requires a separate ADR + stakeholder discovery. ADR-053 D4 already defines the integration point (consumers read from `finance_outbox` with authority labels intact) — that is sufficient for Wave 2.

**Must not be resolved in the design review** (requires separate work):
- Q4 (outbox emission strategy) — requires performance test data first; the review can define the test protocol but cannot answer Q4 without it

**Pre-review documentation fix to make:**
- Correct `aggregate_id: string // table_id` comment in `wave-2-tranactional-outbox-guidance.md §6` — it is wrong and will mislead teams