---
id: ADR-057
title: Class A Table Anchoring and Outbox Idempotency Clarification
status: Accepted
date: 2026-05-10
owner: Vladimir Ivanov
decision_scope: Class A outbox emission scope, table anchoring rule for non-table-scoped PFT rows, processed_messages key shape, and downstream artifact synchronization chain
triggered_by: docs/issues/gaps/financial-data-distribution-standard/wave-2/ADR-057-DIRECTION-NOTE.md
related:
  - ADR-052
  - ADR-053
  - ADR-054
  - ADR-055
  - ADR-056
  - docs/02-design/RFC-006-transactional-outbox.md
  - docs/10-prd/PRD-081-transactional-outbox-gap-f1-closure-v0.md
  - docs/30-security/SEC-NOTE-TRANSACTIONAL-OUTBOX.md
  - docs/30-security/SEC-NOTE-OUTBOX-PATCH-DELTA.md
---

# ADR-057: Class A Table Anchoring and Outbox Idempotency Clarification

## 1. Context

A genuine architecture-level ambiguity was surfaced during PRD-081 and RFC-006 audit:

- `finance_outbox.table_id` is canonically mandatory per ADR-052 and ADR-054 D2.
- Class A (`player_financial_transaction`) currently has no guaranteed table anchor.
  `p_rating_slip_id` is an optional parameter in `rpc_create_financial_txn` (DEFAULT NULL);
  `rpc_create_financial_adjustment` carries no `rating_slip_id` parameter and inherits it
  only when a `p_original_txn_id` links to a rated original.
- Wave 2 replay and ordering semantics depend on the deterministic `(table_id, event_id)` key.
- ADR-054 D1 ("every authored financial event MUST produce a corresponding row in
  `finance_outbox`") and ADR-055 P4 (parity before feature rollout) assert universal outbox
  emission, creating an apparent obligation to emit for non-table-scoped Class A rows.
- The ADR set (052–055) is frozen and cannot be silently patched in downstream artifacts.

This ADR is a narrow amendment. It answers exactly five questions (§3 D1–D6) and reopens
nothing else (§7).

---

## 2. Investigation Findings

Three domains were audited before this decision was frozen.

### 2.1 Producer Path Audit

`rpc_create_financial_txn` (migration `20260307135439_adr040_financial_txn_identity_derivation.sql`)
accepts `p_rating_slip_id uuid DEFAULT NULL` — optional, never enforced as NOT NULL.
`rpc_create_financial_adjustment` (migration `20260306224345_prd044_cleanup_adjustment_compat.sql`)
has no `p_rating_slip_id` parameter; it reads `v_rating_slip_id := v_original_txn.rating_slip_id`
only when `p_original_txn_id` is supplied and resolves.

Neither RPC currently writes to `finance_outbox` — GAP-F1 remains open. The schema gap
confirms the exclusion rule must be encoded before any producer wiring begins.

**Per-path findings:**

- **Rated pit buy-ins (FACT-PFT-TXN-IN-PIT-CASH, FACT-PFT-TXN-IN-PIT-CHIPS):** Rating slip
  modal call sites pass `p_rating_slip_id`; derivation path to `rating_slip.table_id` is
  structurally available.

- **Unrated pit buy-ins:** The base transaction schema keeps `rating_slip_id` optional. A pit
  buy-in without `rating_slip_id` has no deterministic table anchor for Wave 2 outbox replay,
  even though it remains a valid PFT row when accepted by the write path.

- **Cage cashout (FACT-PFT-TXN-OUT-CAGE):** Cashout is a cage operation (`direction='out',
  source='cage'`). No table context exists by business semantics; `rating_slip_id` is NULL
  on every cashout.

- **Cage marker (FACT-PFT-TXN-IN-CAGE-MARKER):** Marker issuance is a cage credit operation
  (`source='cage', tender='marker'`). Not tied to a gaming table or rating slip.

- **Linked adjustment (FACT-PFT-ADJUSTMENT with p_original_txn_id):** Inherits
  `rating_slip_id` from the original transaction. Anchor is deterministic when the original
  was a rated pit transaction.

- **Unlinked adjustment (FACT-PFT-ADJUSTMENT without p_original_txn_id):** `rating_slip_id`
  remains NULL. No table anchor exists for compliance or casino-wide reconciliation adjustments.

### 2.2 ADR-054/055 Wording Audit

- **ADR-054 D1** (line 41 of canonical file): "Every authored financial event — Ledger **or**
  Operational — MUST produce a corresponding row in `finance_outbox`..." — universal claim,
  not conditioned on table-anchor resolution.
- **ADR-054 §10 mapping table**: "`table_id` mandatory on every event" — correct as a
  row-level constraint but ambiguous when read as an emission trigger condition.
- **ADR-055 lines 27–31** re-cite "D1 — every authored event emits an outbox row" without
  scoping to table-resolved rows.
- **ADR-055 P4** governs timing asymmetry between classes; it does not distinguish between
  implementation-timing deferrals and architecture-driven scope boundaries.
- **RFC-006 §1.2 intro (lines 65–67)**: overstated universal claim; detailed design
  (lines 108–112) already carries the correct scoped wording.
- **PRD-081 overview (lines 30–34)**: overstated universal claim; Non-Goals (line 89–91),
  Actors (lines 111–112), and Requirement F1 already carry the correct scoped wording.

### 2.3 Wave 2 Projection Goals and Surface Completeness Audit

- Wave 2 projections are table-scoped: ordering is `(table_id, event_id)`, not visit-scoped
  or casino-wide.
- PRD-081 Non-Goals (line 89–91) explicitly defer non-table-scoped Class A propagation.
- No existing surface claims `completeness: 'complete'` from outbox-emitted Class A rows;
  all surfaces emit `completeness: 'unknown'` (PRD-080 §F-4).
- The Surface Rendering Contract explicitly permits `completeness: 'partial'` for sessions
  where inputs are missing — this is the correct label for visits with cage activity excluded
  from outbox scope.
- No spec promises visit-level completeness becomes `'complete'` from Wave 2 outbox.
  Lifecycle-aware completeness is deferred to downstream consumer slices (FIB-H §H adjacent
  ideas; PRD-081 Non-Goals line 92–93).

---

## 3. Decisions

### D1 — `finance_outbox.table_id` remains NOT NULL

`finance_outbox.table_id` remains `NOT NULL` in the Wave 2 outbox contract. The repository
currently contains a legacy `finance_outbox` shape that predates the ADR-054 envelope; Wave 2
implementation must migrate that legacy shape to the ADR-054/ADR-055 contract rather than treating
the current table as already compliant. Making the Wave 2 `table_id` nullable would break:
- Deterministic `(table_id, event_id)` replay ordering
- ADR-052 table-first anchoring
- Replay semantics, projection topology, and transport invariants

Nullable `table_id` is rejected. The blast radius of that change is too large for the
present ambiguity. `CREATE TABLE IF NOT EXISTS finance_outbox (...)` is not sufficient for Wave 2
because it would silently preserve the incompatible legacy shape.

### D2 — Class A outbox emission rule

Wave 2 Class A outbox emission requires both eligible Class A semantics and deterministic table
anchoring. The canonical rule:

```
For Class A (player_financial_transaction):

  IF transaction is Wave-2-eligible Class A
  AND rating_slip_id IS NOT NULL
  AND rating_slip_id resolves to a same-casino rating_slip
  THEN derive finance_outbox.table_id from rating_slip.table_id
       and emit the outbox row in the same transaction as the PFT insert

  IF transaction is not Wave-2-eligible
  OR rating_slip_id IS NULL
  THEN author the PFT row normally
       emit NO Wave 2 finance_outbox row
       do NOT fabricate a table_id
       do NOT reject the financial write

  IF rating_slip_id IS NOT NULL
  AND rating_slip_id does not resolve to a same-casino rating_slip
  THEN reject the financial write
       emit NO Wave 2 finance_outbox row
```

Wave-2-eligible Class A means:

- rated pit buy-ins: `source = 'pit'`, `direction = 'in'`, `tender_type IN ('cash', 'chips')`,
  and `rating_slip_id` resolves to a same-casino rating slip. `rating_slip.table_id` is required
  by schema and is the derived `finance_outbox.table_id`.
- linked adjustments whose `p_original_txn_id` resolves to an original transaction that itself
  is Wave-2-eligible and whose inherited `rating_slip_id` resolves to a same-casino rating slip.
  `rating_slip.table_id` is required by schema and is the derived `finance_outbox.table_id`.

For linked adjustments, original PFT semantics are the source of truth. Eligibility is recomputed
from the original PFT row (`source`, `direction`, `tender_type`, `txn_kind`, `rating_slip_id`, and
same-casino rating slip resolution) under this ADR. The existence of a prior `finance_outbox` row
for the original may be used as a consistency check after Wave 2 cutover, but it is not the
authority for deciding whether the adjustment is eligible. This prevents pre-cutover gaps,
backfill order, or failed producer attempts from changing adjustment eligibility.

Class A event type mapping:

| PFT semantics | Wave 2 `event_type` | Emits? |
|---|---|---|
| `source = 'pit'`, `direction = 'in'`, `tender_type = 'cash'`, same-casino `rating_slip.table_id` resolved | `buyin.recorded` | YES |
| `source = 'pit'`, `direction = 'in'`, `tender_type = 'chips'`, same-casino `rating_slip.table_id` resolved | `buyin.recorded` | YES |
| `txn_kind = 'adjustment'` linked to an original PFT row that recomputes as Wave-2-eligible under this ADR | `adjustment.recorded` | YES |
| `direction = 'out'` or `source = 'cage'` or `tender_type = 'marker'` | N/A | NO |
| `txn_kind = 'adjustment'` without an eligible original | N/A | NO |

Non-table-scoped Class A rows (cage cashouts, cage markers, standalone adjustments) remain
valid `player_financial_transaction` rows. They are outside current Wave 2 replay/projection
scope because that scope is table-scoped. A future ADR must define their anchoring model
before they may emit to `finance_outbox`.

Cage cashouts, cage markers, admin/casino-wide adjustments, and pit buy-ins without
`rating_slip_id` are excluded from Wave 2 Class A outbox emission even if a caller supplies an
unrelated or opportunistic `rating_slip_id`. The source/type semantics must match the eligibility
rule; `rating_slip_id` resolution alone is not sufficient authority to emit.

If a caller supplies `rating_slip_id` and it does not resolve to a same-casino rating slip, the
producer must reject the financial write and emit no Wave 2 outbox row. Only `rating_slip_id IS NULL`
is a valid "no table anchor, skip outbox" state. Cross-casino, nonexistent, or otherwise invalid
`rating_slip_id` is not a valid non-table-scoped Class A event.

### D3 — `processed_messages` key shape

`processed_messages` retains a global `message_id` primary key:

```sql
CREATE TABLE processed_messages (
  message_id   UUID PRIMARY KEY,
  casino_id    UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

`event_id` is globally unique UUIDv7. A composite `(casino_id, message_id)` uniqueness
constraint adds no correctness benefit and couples idempotency semantics to tenant scoping
without architectural justification. Global keying remains simpler and semantically honest.

UUIDv7 generation is a blocking implementation prerequisite for the Wave 2 outbox contract. The
EXEC-SPEC must either reuse an approved UUIDv7 generator or add one before any producer emits
`finance_outbox.event_id`. `gen_random_uuid()` UUIDv4 is not acceptable for `event_id` because
relay and replay ordering depend on UUIDv7 monotonic ordering.

A diagnostic index is permitted as an optional enhancement:

```sql
CREATE INDEX idx_processed_messages_casino
  ON processed_messages (casino_id, processed_at);
```

This improves tenant-level replay visibility without altering the idempotency contract.

### D4 — Producer idempotency invariant

`processed_messages` governs consumer-side idempotency only. Producer-side outbox idempotency is a
separate invariant:

> Repeating a producer RPC with the same `(casino_id, idempotency_key)` MUST NOT create a second
> `finance_outbox` row for the same logical Class A event.

The retry must also be non-erroring for the logical event. If the PFT authoring path returns an
existing PFT row because `(casino_id, idempotency_key)` already exists, the producer must not then
fail on a duplicate outbox insert. It must reuse the already-authored logical event or no-op the
duplicate outbox insert and return the existing successful authoring result.

The implementation must enforce this at the database boundary. Acceptable patterns include:

- a unique constraint/index on the logical producer event key, such as `(aggregate_id, event_type)`,
  paired with `INSERT ... ON CONFLICT DO NOTHING` and a fetch of the existing `event_id`
- an equivalent constraint that proves one outbox row per authored PFT event while preserving
  successful replay of the same producer idempotency key

Application-only checks are insufficient because retry and conflict paths execute inside RPCs.

### D5 — ADR-054 D1 amendment interpretation

ADR-054 D1 ("Every authored financial event MUST produce a corresponding row in
`finance_outbox`") is amended as follows:

> The emission obligation applies only to events that can satisfy
> `finance_outbox.table_id NOT NULL` and the class-specific eligibility rule. For Class A, the
> obligation activates only for Wave-2-eligible Class A rows whose `rating_slip_id` resolves to a
> same-casino `rating_slip.table_id`. Non-table-scoped or ineligible Class A rows are outside the
> obligation — they are not a violation of D1.

ADR-054 D2 "`table_id` mandatory on every event" governs rows that enter `finance_outbox`;
it is a row-level constraint, not an emission trigger condition. This reading preserves the
NOT NULL invariant without fabricating an anchor.

ADR-054 is not re-opened. This ADR amends the interpretation of D1 via the narrowest
possible scope. All other ADR-054 decisions remain unchanged.

### D6 — ADR-055 P4 scope

ADR-055 P4 (Parity Before Feature Rollout) governs asymmetry introduced by *implementation
timing*: if a feature can only be built for one class now, defer it until both are ready.

The Class A table-anchoring scope restriction is not a timing asymmetry. Cage operations and
unlinked adjustments structurally lack a table anchor — this is geometry, not a rollout
decision. P4 does not prohibit architecture-driven scope asymmetry. ADR-055 is not re-opened;
this ADR clarifies that P4 does not apply to the table-anchoring and eligibility boundary
established by D2.

---

## 4. Impact Inventory

Every Class A producer path audited against the D2 rule, with accepted product impact:

| Producer Path | Has deterministic `rating_slip.table_id`? | Emits Wave 2 `finance_outbox`? | Excluded? | Why | Product impact accepted? |
|---|---|---|---|---|---|
| **FACT-PFT-TXN-IN-PIT-CASH (rated)** — pit cash buy-in via `rpc_create_financial_txn` | ✅ YES — rating slip modal caller supplies `rating_slip_id`; `rating_slip.table_id` derivation is deterministic | ✅ YES — when transaction semantics are eligible and `rating_slip_id` resolves | NO | — | N/A (included) |
| **FACT-PFT-TXN-IN-PIT-CHIPS (rated)** — pit chips buy-in via `rpc_create_financial_txn` | ✅ YES — same derivation path as rated pit cash | ✅ YES — when transaction semantics are eligible and `rating_slip_id` resolves | NO | — | N/A (included) |
| **FACT-PFT-TXN-IN-PIT-CASH/CHIPS (unrated)** — pit buy-in without `rating_slip_id` | ❌ NO — accepted schemas keep `rating_slip_id` optional | ❌ NO | YES | No rating slip anchor exists. | YES — remains a valid PFT row if accepted by the authoring path, but outside Wave 2 table-scoped replay/projection. |
| **FACT-PFT-TXN-OUT-CAGE** — cage cashout via `rpc_create_financial_txn` | ❌ NO — cage cashout has no table context; `rating_slip_id` is structurally absent by business semantics | ❌ NO | YES | Cage cashout is not a table event. No `rating_slip_id` derivation path exists. | YES — Wave 2 projections are table-scoped `(table_id, event_id)`; cage cashouts do not participate in table-session projection. Visit-level surfaces render `completeness: 'partial'` for visits with cage activity. Future ADR required to define cage anchoring model. |
| **FACT-PFT-TXN-IN-CAGE-MARKER** — cage marker issuance via `rpc_create_financial_txn` | ❌ NO — marker issuance is cage-level credit; no table context or rating slip | ❌ NO | YES | Cage marker is not a table event. Same structural gap as cashout. | YES — same rationale as cage cashout; outside table-session projection scope for Wave 2. |
| **FACT-PFT-ADJUSTMENT (linked to included original)** — via `rpc_create_financial_adjustment` with `p_original_txn_id` resolving to a Wave-2-eligible rated pit transaction | ✅ YES — inherits `rating_slip_id` from an included original; derivation is deterministic | ✅ YES — when inherited `rating_slip_id` resolves | NO | — | N/A (included) |
| **FACT-PFT-ADJUSTMENT (linked to excluded original)** — via `rpc_create_financial_adjustment` with `p_original_txn_id` resolving to a cage, marker, unrated, or otherwise excluded original | ❌ NO for Wave 2 eligibility — inherited anchor is absent or original semantics are outside Wave 2 | ❌ NO | YES | Linked adjustment inherits source context from an original that is not Wave-2-eligible. | YES — follows original event's Wave 2 inclusion status. |
| **FACT-PFT-ADJUSTMENT (unlinked)** — via `rpc_create_financial_adjustment` without `p_original_txn_id` | ❌ NO — no original to inherit from; `rating_slip_id` remains NULL | ❌ NO | YES | Standalone adjustments (compliance corrections, casino-wide reconciliations) have no table anchor. | YES — unlinked adjustments are outside rated-session scope by construction. Future ADR or adjustment sub-classification required before they may enter the outbox. |
| **FACT-PIT-CASH-OBS chips-taken** — operational chips-taken recording via `rpc_create_pit_cash_observation`, triggered from rating slip close flow (`hooks/rating-slip-modal/use-close-with-financial.ts`) | N/A — not a Class A (PFT) write. This path writes to `pit_cash_observation` (Class B Observed, `source='walk_with'`, `amountKind='estimate'`). `rating_slip_id` is supplied and carries a deterministic table anchor, but `pit_cash_observation` is outside Class A outbox scope by implementation decision (PRD-OPS-CASH-OBS-001). | ❌ NO | OUT OF SCOPE (not Class A) | `finance_outbox` is wired to `player_financial_transaction` rows. Chips-taken records operational cash-out telemetry, not an authoritative ledger event. A future ADR defining an outbox path for `pit_cash_observation` rows is required before this path can emit. Reclassifying chips-taken as Class A PFT would require superseding PRD-OPS-CASH-OBS-001 and constitutes a separate architecture decision. | YES — chips-taken participates in session context as operational telemetry. Surfaces render `completeness: 'partial'` for visits where it is the only exit record. Its exclusion from Wave 2 `finance_outbox` does not break any current surface commitment. |

---

## 5. Downstream Synchronization Required

The following artifacts contain overstated universal emission claims. Apply in the governance
order defined in §6.

| Artifact | Overstated location | Overstated language | Required correction |
|---|---|---|---|
| **ADR-054** | Line 41 (D1) | "Every authored financial event... MUST produce a corresponding row in `finance_outbox`" | "Every table-anchored authored financial event MUST produce a corresponding row in `finance_outbox`. For Class A: only Wave-2-eligible Class A rows whose `rating_slip_id` resolves to same-casino `rating_slip.table_id`. Non-table-scoped or ineligible Class A rows are authored as valid PFT rows but excluded from Wave 2 outbox emission. (Amended by ADR-057 D5.)" |
| **ADR-054** | §10 mapping table | "`table_id` mandatory on every event" | "`table_id` mandatory on every `finance_outbox` row. Class A events without deterministic table resolution or Class A eligibility are excluded from Wave 2 emission and do not enter `finance_outbox`. (Amended by ADR-057 D5.)" |
| **ADR-055** | Lines 27–31 (Context citation) | "D1 — every authored event emits an outbox row" | "D1 (as amended by ADR-057) — every table-anchored authored event emits an outbox row. Class A emission is scoped to Wave-2-eligible `rating_slip_id`-resolved rows; Class B has no table-anchor precondition. (See ADR-057 D5, D6.)" |
| **ADR-055** | Lines 111–121 (P4) | P4 governs all scope asymmetry without exception | Add footnote: "P4 governs implementation timing asymmetry. Architecture-driven scope boundaries (e.g., Class A table-anchoring and eligibility per ADR-057 D2) are not subject to P4 deferral." |
| **RFC-006** | §1.2 lines 65–67 | "Every Class A authoring write and every Class B authoring write atomically produce a `finance_outbox` row..." | "Every Wave-2-eligible table-scoped Class A authoring write (where semantics are eligible and `rating_slip_id` resolves to same-casino `rating_slip.table_id`) and every Class B authoring write atomically produce a `finance_outbox` row..." |
| **PRD-081** | Overview lines 30–34 | "Every financial fact authored by PT-2 RPCs... must durably emit a `finance_outbox` row..." | "Every table-scoped financial fact authored by PT-2 RPCs — Wave-2-eligible Class A transactions where `rating_slip_id` resolves to same-casino `rating_slip.table_id`, Class B operational telemetry, and fill/credit Dependency Events — must durably emit a `finance_outbox` row. Non-table-scoped or ineligible Class A transactions are authored as valid PFT rows but excluded from Wave 2 outbox emission." |

**Artifacts that do NOT require amendment** (already carry correct scoped language):
- RFC-006 detailed design (lines 108–112, 296–320)
- PRD-081 Non-Goals (lines 89–91), Actors (lines 111–112), Requirements F1/F13/F14
- Surface Rendering Contract — `completeness: 'partial'` is already a valid status

---

## 6. Governance Chain

Apply in this order:

```
ADR-057 (this document — freeze first)
→ ADR-054 D1 amendment (line 41) + §10 mapping table patch
→ ADR-055 Context citation (lines 27–31) + P4 footnote (lines 111–121)
→ RFC-006 §1.2 introductory language patch (lines 65–67)
→ SEC-NOTE-TRANSACTIONAL-OUTBOX patch (if wording changes)
→ PRD-081 Overview patch (lines 30–34)
→ EXEC-SPEC regeneration or patch
```

Do NOT:
- Patch PRD-081 before ADR-057 is frozen
- Reinterpret frozen ADRs (052–055) downstream without this document as the stated authority
- Let EXEC-SPEC drift ahead of this amendment

---

## 7. What This ADR Does Not Reopen

This ADR answers only:
- What is the canonical Class A eligibility and table anchor derivation rule? (D2)
- What happens when no deterministic table anchor exists? (D2)
- Does `processed_messages` remain globally keyed? (D3)
- What producer-side idempotency invariant is required? (D4)
- Which downstream artifacts require synchronization? (§5)

It does not reopen and must not be used to expand:
- Transactional outbox semantics (relay, consumer, idempotency mechanics)
- Relay runtime decision (ADR-056)
- Replay philosophy or UUIDv7 ordering
- Event taxonomy or ubiquitous language (Wave 2 UL)
- Consumer topology
- Authority semantics or `origin_label` immutability
- RPC-coupled insertion rules

---

## 8. Implementation Follow-Ups

These are execution-level items, not ADR-057 decisions. Track in PRD/EXEC-SPEC remediation.

**Legacy `finance_outbox` schema migration gate:** Existing migrations created a legacy
`finance_outbox` shape before ADR-054/ADR-055 (`id`, `ledger_id`, `attempt_count`, and no Wave 2
envelope columns). The Wave 2 implementation must include explicit pre-state checks and migrate the
table to the required envelope columns (`event_id`, `event_type`, `fact_class`, `origin_label`,
`casino_id`, `table_id`, `player_id`, `aggregate_id`, `payload`, `created_at`, relay lifecycle
metadata). The migration must fail loudly if the expected legacy shape is absent or already
partially migrated.

**Legacy `finance_outbox` RLS policy cleanup gate:** Existing migrations created authenticated-role
`SELECT/INSERT` policies on `finance_outbox` before Wave 2 re-scoped the table as internal
transport infrastructure. The Wave 2 implementation must drop or replace these policies,
revoke direct authenticated access, and prove via SQL posture tests that authenticated users
cannot directly `SELECT`, `INSERT`, `UPDATE`, or `DELETE` `finance_outbox`.

**Producer outbox idempotency enforcement:** Implement a database-level uniqueness guard proving
that retrying a producer RPC with the same `(casino_id, idempotency_key)` does not error and does
not create a second `finance_outbox` row for the same logical Class A event. A unique
`(aggregate_id, event_type)` index or equivalent is acceptable only when paired with conflict
handling that preserves producer retry success.

**Class A anchoring acceptance tests:** Add SQL integration tests proving:
- rated pit cash/chips buy-ins emit `buyin.recorded` with `table_id` derived from same-casino
  `rating_slip.table_id`
- pit buy-ins without `rating_slip_id`, cage cashouts, cage markers, linked adjustments to excluded
  originals, and unlinked adjustments emit no Wave 2 outbox row and do not fail solely because they
  lack a table anchor
- supplied cross-casino or nonexistent `rating_slip_id` rejects the financial write and never emits
  an outbox row
- linked adjustments emit `adjustment.recorded` only when the original PFT recomputes as
  Wave-2-eligible under this ADR; presence or absence of an original outbox row is diagnostic, not
  eligibility authority

**UUIDv7 generator gate:** Identify or add the approved UUIDv7 generator before producer wiring.
Tests must prove `event_id` is UUIDv7-compatible and relay/replay ordering uses `event_id`, not
`created_at`.

**Event envelope immutability enforcement:** ADR-054 requires the outbox event envelope to be
immutable after insert. The implementation must enforce this with a trigger or database-level
guard so only relay lifecycle metadata (`processed_at`, `delivery_attempts`,
`last_attempted_at`, `last_error`) can change.

**Downstream artifact synchronization:** Execute the §6 governance chain in order.
