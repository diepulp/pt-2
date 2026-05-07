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

**Pre-wired answer the review cannot override without a new ADR:** If the proposal is "expand PFT with an `is_table_only` flag or nullable `player_id`," that is the rejected pattern from ADR-052 §4. The review must produce a superseding ADR or accept the two-store model.

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

If the review cannot commit to all five, the recommendation is separate tables. Separate tables make the boundary legible to every engineer who touches the codebase without needing to know the governance rules. The shared parent requires knowing the rules; separate tables enforce them structurally.

**Outbox envelope is unaffected by this decision:** ADR-055 P1 envelope parity means the `finance_outbox` column set is identical regardless of where Class B is stored. Q2 affects the authoring RPC, not the event schema. If anyone argues Q2 affects the outbox envelope, that is a misunderstanding to correct in the review.

**`table_id` anchoring must survive:** Both the grind partition and any shared parent must enforce `table_id NOT NULL` at the DB level (ADR-052 D2). Confirm this constraint is present in any proposed DDL.

**No dual-write path:** ADR-052 R3 forbids dual-write from PFT to the grind authoring store. A shared parent must not create a join path that could be read as a dual-write. The FK structure of any proposed schema must be reviewed against R3.

### Q4 — Outbox emission: trigger-based, shared RPC, or both?

**What the ADR set permits:** Both forms satisfy the literal same-transaction rule (ADR-054 D2), but under different conditions. A `BEFORE`/`AFTER INSERT` trigger that writes **only** to `finance_outbox` within the same transaction is permitted. A single RPC that inserts both the authoring row and the outbox row before `COMMIT` is permitted. A post-commit trigger, a background job, or two RPCs described as "atomic" are all forbidden — ADR-054 D2 is literal.

**Why the design review cannot fully answer Q4:** The resolution path requires performance testing under actual write load (ADR-PROP D2 constraint). Under concurrent buy-in recording — multiple tables simultaneously — a synchronous trigger adds latency inside every PFT write on the critical path. A modified RPC moves that cost to the application layer where it is measurable and rollback-safe. The KB correctly defers Q4; the review cannot substitute a preference for data.

**What the review can and must do now:**

**1. Pre-reject the "both" option on parity grounds.**

"Trigger for Class A, RPC for Class B" (or vice versa) is not a third option — it is an ADR-055 P3 violation. P3 requires ingestion strictness to be symmetric across classes: required-field validation, type constraints, and timestamp discipline must be identical. A trigger validates at DB level; an RPC validates at application level. These are not the same mechanism. If one class enforces outbox field presence via a trigger CHECK and the other enforces it via Zod, the two classes have divergent failure modes, divergent error surfaces, and divergent rollback behaviors. That asymmetry compounds over time.

The "both" option also violates P4 (parity before feature rollout): if trigger-coupling is deployed for Class A while Class B's RPC coupling is still in progress, Class A is live with outbox and Class B is not — exactly the "Class A first, Class B catches up" pattern the ADR forbids.

**The review's pre-rejection is a valid deliverable even without test data.** It reduces the decision space from three options to two.

**2. Define the test protocol for trigger vs. RPC.**

The review must specify what "performance testing under literal-same-txn constraint" means before it can be executed. Minimum protocol definition:

| Dimension | What to specify |
|---|---|
| Write volume | Sustained concurrent buy-in rate (transactions/sec) representing peak pit activity |
| Concurrency | Number of simultaneous table sessions; simulates floor-wide simultaneous action |
| Latency budget | Acceptable p99 PFT write latency with and without outbox insert — the delta is the cost of coupling |
| Failure path | What happens when the outbox insert fails: does the authoring write roll back? Both forms must roll back identically. |
| Measurement boundary | Wall-clock time at the RPC call site (application layer), not just DB execution time |

Without this protocol, the performance test produces a number but not a decision. The review must output the protocol even if it cannot run the test.

**3. Confirm the `rpc_create_financial_txn` modification scope.**

Regardless of which form is chosen, the existing RPC (migration `20251109214028`) has no outbox insert. The review must confirm:
- For the **RPC form**: `rpc_create_financial_txn` is modified to insert into `finance_outbox` in the same `BEGIN…COMMIT`. `event_id` is generated at the RPC boundary using UUID v7 (not `gen_random_uuid()`). Same modification applies to `rpc_create_financial_adjustment` and the Class B grind authoring RPC simultaneously (ADR-055 P4).
- For the **trigger form**: the trigger fires on `INSERT` into `player_financial_transaction` and writes only to `finance_outbox`. It must be classified as infrastructure-only (no business logic, no cross-domain propagation per ADR-054 D6). A corresponding trigger on the Class B grind authoring table must ship in the same migration (P4).

**4. Establish the latency budget before testing starts.**

A latency budget must be agreed before running the test or neither result is interpretable. If the trigger form adds 2ms p99 to every PFT insert and the latency budget is 5ms, that's acceptable. If the budget is 1ms, it is not. The review must produce the budget number from product/operator requirements, not from the test output.

**What Q4 resolution looks like:** A documented decision — trigger or RPC — supported by test data showing the chosen form stays within the latency budget, with a confirmation that the same form is deployed for both Class A and Class B in the same migration.

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

**Sharpened recommendations:**

| Decision | Recommendation | Rationale |
|---|---|---|
| **Q1** | Reject PFT expansion unless ADR-052 is formally superseded | The proposal is materially equivalent to the §4 rejected pattern; without a superseding ADR the review has no authority to permit it |
| **Q2** | Permit shared parent **only if** physically partitioned + DB-enforced discriminator + service isolation mandatory | The ADR does not forbid it, but the risk is behavioral convergence, not schema ambiguity — structural separation is safer; shared parent requires five simultaneous enforcement commitments |

**The underlying principle for the review to hold:** Schema-level correctness is necessary but insufficient. The question is not "can this schema be used correctly?" but "will this schema be used correctly under time pressure, by engineers who haven't read the ADR set, six months from now?" Separate stores answer that question structurally. A shared parent answers it institutionally. The former is cheaper to maintain.

**Must resolve (blocks Wave 2 entry):**
1. **Q1** — Is the PFT expansion proposal materially distinct from the ADR-052 §4 rejected pattern? If yes, produce a superseding ADR before any code. If no, confirm two-store model as final.
2. **Q2** — If shared parent: confirm all five enforcement commitments can be made and documented. If not, default to separate tables. Update ADR-052 D3 commentary with the decision either way.
3. **DDL migration plan** for `finance_outbox` — the table must be rebuilt before GAP-F1 work begins. Zero-data migration (table is empty). This is Wave 2 Day 1.

**Resolved by explicit deferral (no longer blocking Wave 2):**
- Q3 (reconciliation consumer contract) — deferred outside pilot scope 2026-05-06. Wave 2 defines internal propagation guarantees only. No external consumer contract, reconciliation interface, or third-party event semantics are frozen in this phase. Outbox remains internal infrastructure. Future externalization requires a separate ADR + stakeholder discovery. ADR-053 D4 already defines the integration point (consumers read from `finance_outbox` with authority labels intact) — that is sufficient for Wave 2.

**Must not be resolved in the design review** (requires separate work):
- Q4 (outbox emission strategy) — requires performance test data first; the review can define the test protocol but cannot answer Q4 without it

**Pre-review documentation fix to make:**
- Correct `aggregate_id: string // table_id` comment in `wave-2-tranactional-outbox-guidance.md §6` — it is wrong and will mislead teams