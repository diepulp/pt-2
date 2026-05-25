# ADR-057 Direction Note — Class A Table Anchoring & Idempotency Clarification

## Purpose

A genuine architecture-level ambiguity was surfaced during PRD/RFC audit:

- `finance_outbox.table_id` is canonically mandatory.
- Class A (`player_financial_transaction`) currently has no guaranteed table anchor.
- Wave 2 replay/order semantics depend on deterministic table anchoring.
- The ADR set is frozen and cannot be silently patched in downstream artifacts.

This note defines the recommended reopen strategy with minimal blast radius.

---

# Recommended Path

## Do NOT Patch ADR-052–055 In Place

ADR-052–055 are frozen architectural commitments.

Do not:
- edit them retroactively
- silently reinterpret them in PRDs
- weaken invariants downstream
- introduce nullable `table_id` without explicit architectural amendment

Instead:

> Introduce a narrow amendment ADR.

Recommended title:

```md
ADR-057 — Class A Table Anchoring and Outbox Idempotency Clarification
```

---

# Preferred Decision — Class A Table Anchoring

## Keep `finance_outbox.table_id NOT NULL`

Do NOT weaken the table-first canon unless absolutely necessary.

Current architecture assumptions depend on:
- deterministic replay ordering
- table-scoped projection rebuilds
- `(table_id, event_id)` replay semantics
- ADR-052 table-first anchoring

Making `table_id` nullable would ripple through:
- replay semantics
- ordering assumptions
- projection topology
- transport invariants
- downstream consumer assumptions

This is too large a blast radius for the current ambiguity.

---

## Canonical Resolution

Wave-2-valid Class A outbox emission requires deterministic table anchoring.

### Rule

```md
For Class A:
- if `rating_slip_id` exists, derive `finance_outbox.table_id`
  from `rating_slip.table_id`
- if no deterministic table anchor exists,
  author the PFT row normally, but emit no Wave 2 `finance_outbox` row
```

### Consequence

Non-table-scoped cashier/cage financial events are:

```md
excluded from Wave 2 outbox emission
until a future ADR defines their anchoring model
```

They remain valid `player_financial_transaction` rows. They are outside the current
replay/projection scope because Wave 2 replay is table-scoped and depends on
`(table_id, event_id)` ordering. The transport slice must not fabricate a table anchor and must
not reject an otherwise valid financial write solely because it is outside Wave 2 replay scope.

This preserves:
- deterministic replay
- table-first canon
- relay ordering assumptions
- transport invariants
- projection rebuild semantics

without weakening the outbox contract.

---

# Explicitly Rejected Direction

## Reject Nullable `finance_outbox.table_id`

Do NOT introduce:

```sql
table_id UUID NULL
```

for Class A fallback behavior unless the architecture intentionally abandons:
- table-first replay semantics
- mandatory table anchoring
- deterministic table-scoped projections

This would require broader ADR reconsideration, not a tactical patch.

---

# Preferred Decision — `processed_messages` Key Shape

## Keep Global `message_id` Primary Key

Recommended schema remains:

```sql
CREATE TABLE processed_messages (
  message_id   UUID PRIMARY KEY,
  casino_id    UUID NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Rationale

`event_id` is globally unique UUIDv7.

Therefore:
- `(casino_id, message_id)` composite uniqueness is unnecessary for correctness
- idempotency semantics remain globally stable
- consumer logic remains simpler
- replay semantics remain transport-centric instead of tenant-coupled

---

## Optional Enhancement

If desired, add a diagnostic index only:

```sql
CREATE INDEX idx_processed_messages_casino
  ON processed_messages (casino_id, processed_at);
```

This improves:
- tenant diagnostics
- replay visibility
- operational introspection

without changing the idempotency contract.

---

# Implementation Follow-Ups That Do NOT Reopen Architecture

The PRD/RFC audit also surfaced implementation hardening work. These items should be tracked in
PRD/EXEC-SPEC remediation, not in ADR-057, unless a proposed fix changes schema ownership or
transport semantics.

## Legacy `finance_outbox` RLS Policy Cleanup

Existing migrations created authenticated-role `finance_outbox` SELECT/INSERT policies before
Wave 2 re-scoped the table as internal transport infrastructure. The Wave 2 implementation must:

- drop or replace legacy authenticated direct-access policies
- revoke direct authenticated table access where present
- prove via SQL posture tests that authenticated users cannot directly
  `SELECT`, `INSERT`, `UPDATE`, or `DELETE` `finance_outbox`

This is security implementation alignment with the SEC note and ADR intent, not a new
architecture decision.

## Event Envelope Immutability Enforcement

ADR-054 already requires the outbox event envelope to be immutable after insert. The
implementation must enforce that requirement with a trigger, restrictive update path, or
equivalent database-level guard so only relay lifecycle metadata can change.

This is enforcement of an existing invariant, not an ADR-057 decision.

## Downstream Synchronization

ADR-054, ADR-055, RFC-006, PRD-081, and the eventual EXEC-SPEC must be synchronized so they no
longer imply that every Class A PFT row emits a Wave 2 outbox event. The corrected rule is:

```md
Wave 2 Class A outbox emission applies only when `rating_slip_id` resolves to same-casino
`rating_slip.table_id`. Non-table-scoped Class A rows are valid PFT rows but outside current
Wave 2 replay/projection scope.
```

---

# Governance Chain (Required Order)

Apply changes in this sequence:

```text
ADR-057 amendment
→ RFC-006 patch
→ SEC note patch (if wording changes)
→ PRD-081 patch
→ EXEC-SPEC regeneration/patch
```

Do NOT:
- patch PRD first
- reinterpret frozen ADRs downstream
- let EXEC-SPEC drift ahead of architecture authority

The ADR amendment must remain the source of truth.

---

# Scope Containment

ADR-057 must remain narrow.

It should answer ONLY:

- What is the canonical Class A table anchor?
- What happens when no deterministic table anchor exists?
- Does `processed_messages` remain globally keyed?
- Which downstream artifacts require synchronization?

It must NOT reopen:
- transactional outbox semantics
- relay runtime decision
- replay philosophy
- event taxonomy
- consumer topology
- authority semantics
- UUIDv7 ordering
- RPC-coupled insertion

---

# Recommended Final Outcome

## ADR-057 freezes:

- `finance_outbox.table_id` remains NOT NULL
- Class A requires deterministic `rating_slip.table_id` anchor
- Non-table-scoped Class A rows are still authored as PFT rows but excluded from Wave 2 outbox
  emission and replay/projection scope
- `processed_messages` keeps global `message_id` primary key
- Downstream artifacts patch to conform

This preserves the current architecture with the smallest possible blast radius.
