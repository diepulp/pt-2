---
id: ADR-055
title: Cross-Class Authoring Parity
status: Accepted
date: 2026-04-23
owner: Architecture Review
decision_scope: Cross-class parity invariants for authoring, envelope shape, transaction discipline, and validation strictness
triggered_by: docs/issues/gaps/financial-data-distribution-standard/decisions/DECISION-CONSOLIDATION.md
amends: ADR-054
related:
  - ADR-052
  - ADR-053
  - docs/issues/gaps/financial-data-distribution-standard/actions/SURFACE-RENDERING-CONTRACT.md
canonicalized_from: docs/issues/gaps/financial-data-distribution-standard/decisions/ADR-FINANCIAL-AUTHORING-PARITY.md
frozen_snapshot_date: 2026-04-23
---

# ADR-055: Cross-Class Authoring Parity

# 1. Context

The frozen set establishes two authoring stores feeding a single outbox:

* Class A — PFT, origin=`actual`, player-attributed
* Class B — Grind, origin=`estimated`, table-only

`ADR-054`:

* D1 — every authored event emits an outbox row
* D2 — authoring write + outbox write are atomic
* D5 — `origin_label` is immutable in transit

These rules apply "symmetrically to both paths" — but symmetry is asserted, not enforced. The frozen set does not codify:

* whether both paths emit the **same envelope shape**
* whether both paths use the **same transactional primitive**
* whether both paths enforce the **same validation strictness**

This is a real gap. If Class B ingestion is lighter than Class A — laxer required-field checks, missing idempotency keys, weaker FK constraints, different ordering guarantees, fields present as implicit `null` instead of explicit `null` — then:

* consumers must branch on `fact_class` to handle shape differences
* the outbox becomes a heterogeneous stream disguised as a uniform one
* semantic drift re-enters through the back door the fact-model ADR tried to close

This ADR closes that gap.

---

# 2. Decision

Three parity invariants apply symmetrically to both authoring paths. Where ADR-EVENT-PROPAGATION said "both must emit atomically," this ADR says "both must emit with **identical discipline**."

---

## P1 — Envelope Parity

Every event in `finance_outbox` carries an identical field set, with identical required/optional shape, regardless of `fact_class`.

### Rules

* **Same schema, one schema.** The outbox table has one DDL; both authoring paths insert into it with the same column set.
* **No class-conditional fields.** Any field present for Class A is present for Class B, and vice versa.
* **Explicit null, not absent.** Fields that don't apply to a class (e.g., `player_id` for Class B) are present with `NULL`, never omitted from the insert statement.
* **No class-conditional types.** A field's data type is fixed across classes. A timestamp field is a timestamp in both.
* **Mandatory is mandatory.** Required fields (per ADR-EVENT-PROPAGATION §3: `event_id`, `event_type`, `fact_class`, `origin_label`, `table_id`, `aggregate_id`, `payload`, `created_at`) are required in both paths. Class B cannot "opt out" of a required field because the value "doesn't make sense" for grind — either the field is meaningful for both, or it belongs in `payload`.

### Rejected pattern

> "Class B events have a smaller envelope because grind has less metadata."

Rejected. If a field is in the envelope, it is in the envelope for every class. Class-specific content lives in `payload`, which is already opaque to the envelope contract.

---

## P2 — Outbox Discipline Parity

Both authoring paths use the **same outbox discipline** — not just atomic emission, but identical mechanics.

### Rules

* **Same transactional primitive.** Both paths wrap authoring + outbox insert in a single DB transaction using the same SQL construct (one RPC, one shared helper, or an enforced pattern — not "atomic in spirit" via two RPCs). The transaction boundary is **literal**: one `BEGIN…COMMIT`, one `pg_current_xact_id()` — see ADR-054 D2 for acceptable and rejected forms. A path using a "logically atomic" pattern while the other uses a real transaction is a parity violation even if both claim atomicity.
* **Same idempotency key placement.** `event_id` is generated at the authoring boundary in both paths, using the same generation strategy (UUID v7 or equivalent). Consumers rely on it uniformly.
* **Same ordering guarantee.** Within an `aggregate_id`, emission order matches authoring order. Both paths provide this guarantee. Cross-aggregate ordering is not promised by either.
* **Same retry semantics.** If the outbox insert fails, the authoring write rolls back in both paths — not retried, not queued, not deferred.
* **Same consumer visibility.** Processed/unprocessed state is tracked the same way for both (`processed_at`). Consumer cursors do not branch by class.

### Shared primitive expectation

Implementations SHOULD share a single write-path primitive (e.g., `rpc_emit_financial_event(fact_class, envelope_fields...)`). Divergent primitives per class are allowed **only** if all rules above still hold verifiably.

---

## P3 — Ingestion Strictness Parity

Validation rigor matches across classes. Neither path is "lighter" in production.

### Rules

* **Required-field validation is symmetric.** If Class A rejects a write missing `table_id`, Class B does too.
* **Referential integrity is symmetric where applicable.** If Class A enforces `table_id` FK, Class B enforces the same FK. (Where a FK doesn't apply to Class B — e.g., `player_id` — the column is nullable for that class, but the strictness of *whatever constraint applies* is symmetric.)
* **Timestamp discipline is symmetric.** `created_at` generation, monotonicity guarantees, and timezone normalization are identical.
* **Type constraints are symmetric.** No silent coercion in one path that the other rejects.
* **Authoring errors surface the same way.** Both paths return the same error shape to callers.

### Review gate

Any change to one authoring path's validation MUST be evaluated against the other. A PR that tightens Class A validation without tightening Class B (or explicitly justifying the asymmetry with a superseding ADR) is non-conformant.

---

## P4 — Parity Before Feature Rollout

If a feature (new field, new event_type, new consumer guarantee) can only be implemented for one class, the feature is **deferred** until it can be implemented for both, or the scope is narrowed to fit what both can do.

Explicitly:

* No "launch Class A first; Class B catches up."
* No "Class A has idempotency; Class B is best-effort."
* No "Class A has strong ordering; Class B is eventual."

A divergence here produces exactly the class of semantic drift the fact-model ADR rejected. The parity invariant exists to prevent that drift from being introduced by timing rather than by design.

---

# 3. Enforcement

Three enforcement layers, in order of strength:

## 3.1 Schema-level (strongest)

* One outbox table, one DDL, applied to both paths
* Required columns marked `NOT NULL` enforce P1 at insert time
* FK constraints on `table_id` enforce P3 for the one field that applies to both

## 3.2 Code-level

* Single shared write-path primitive for both classes (recommended)
* If per-class RPCs exist, they share an internal helper that performs the outbox insert — divergence is structurally difficult
* Type system (TypeScript DTO) defines one event shape; both call sites use it

## 3.3 Review / ADR gate

* Any PR that changes one path's envelope, discipline, or validation without a parallel change to the other is blocked at review
* Asymmetric changes require a superseding ADR naming the invariant being relaxed and why
* This ADR is a referenced invariant in the `backend-service-builder` and `api-builder` skills

---

# 4. Consequences

## Positive

* Consumers handle **one** outbox stream with **one** schema — no class-conditional branching required
* Cross-class drift cannot accumulate silently over time
* Class B is held to the same standard as Class A from day one
* Failure modes are symmetric and predictable
* Future consumers (external reconciliation, analytics, compliance overlays) get a uniform contract

## Trade-offs

* Class B may require more ingestion machinery than its simplicity would suggest (idempotency keys, transaction primitives, validation layer) — that cost is accepted here, not avoided
* Feature delivery timing is bounded by the slower of the two paths (P4)
* Shared primitives require careful design — a badly factored shared RPC can couple classes in the wrong places

These costs are accepted. The alternative — heterogeneous streams — is the failure mode the whole frozen set is built to prevent.

---

# 5. Out of Scope

* The specific shared-primitive API (RPC name, signature) — implementation detail
* Compliance domain parity — `mtl_entry` is a parallel ledger, not a co-class under this ADR
* Physical cash observation parity — out of pilot authoring
* Cross-region / cross-database parity — pilot is single-region, single-DB

---

# 6. Non-Conformant Patterns (exhaustive for authoring-layer asymmetry)

Each pattern violates one of the invariants above. The list is exhaustive by design — any new divergence not covered here requires a superseding ADR.

| Pattern | Invariant violated |
|---------|-------------------|
| Class B insert omits a column that Class A includes | P1 (envelope parity) |
| Class B uses `INSERT ... DEFAULT` where Class A passes explicit value | P1 |
| Class B has nullable `event_id` while Class A requires it | P1, P2 |
| Class B writes to outbox in a separate transaction from authoring row | P2 |
| Class B generates `event_id` at consumer side, Class A at author side | P2 |
| Class B validation is "trigger-based", Class A is "RPC-level" (or vice versa) | P3 |
| Class B allows backdated `created_at`, Class A rejects it | P3 |
| Class B rolls out a new event_type before Class A supports it | P4 |

---

# 7. Closing Statement

Two authoring paths. One discipline.

> If a rule applies to Class A, it applies to Class B — shape, timing, rigor, and all.
> If it can't, the rule waits.

The outbox is a single stream. This ADR makes that literal, not aspirational.
