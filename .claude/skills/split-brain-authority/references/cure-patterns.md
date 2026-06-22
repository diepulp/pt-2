# Cure Patterns — The Three Proven Remediations

This reference owns the **reusable cure templates**. Each was proven by an exemplar remediation. Match a fracture to a cure using the SKILL.md routing table, then read the relevant section here for the mechanics and the proof obligations.

A standing rule across all three: **select the weakest mechanism that preserves the invariant.** Adjacency is not dependency — not every value near a financial number needs an outbox or a canonical owner. Architecture becomes stronger when each mechanism has one job and stays in its lane, not when mechanisms are added.

## Table of Contents
1. Cure A — Transactional Outbox (dual-write / propagation fractures)
2. Cure B — Single-Formula-Owner (competing-derivation fractures)
3. Cure C — SRL Semantic Root (vocabulary / meaning fractures)
4. The Rollout Phasing Template (shared by all three)
5. Proof Obligations (I1–I4) and the Honesty Rule

---

## 1. Cure A — Transactional Outbox

**Cures:** dual-write split-brain — an authoring store and its downstream consumers desynchronize because persisting the fact and propagating it were two operations.

**Proven by:** Financial Outbox, Wave 2 (`financial-model-authority`). Route all financial-transport questions there.

**The five load-bearing mechanisms (transferable to any domain with dual-write + provenance collapse):**

1. **Same-transaction emission — literal, not "logically atomic."** The authoring write and the `finance_outbox` INSERT are one `BEGIN…COMMIT`, one `pg_current_xact_id()`. Not two coordinated RPCs, not a post-commit trigger, not a background job. A trigger is permitted **only if its sole target is the outbox table** — *"a trigger may copy authoring row data into the outbox within the same transaction — that is infrastructure. It may not propagate meaning into another domain — that is hidden architecture."* The distinction is the trigger's *target*, not its *timing*.

2. **Durable outbox row carrying immutable provenance.** Each row stamps `fact_class` and `origin_label` at the authoring boundary. These are hardcoded by the producer (e.g. Class A literally inserts `'ledger','actual'`; Class B `'operational','estimated'` with `player_id = NULL`) — a caller cannot spoof them.

3. **At-least-once relay.** "Exactly-once" is rejected as a fiction. The relay claims batches and tolerates redelivery.

4. **Idempotent, projection-only consumer.** Dedup via a `processed_messages` receipt (UNIQUE on `(event_id, casino_id)`), written atomically with the projection side effect. Consumers read `fact_class`/`origin_label` **directly** — never infer authority from payload shape or storage location — and may write **only** projection stores and receipts. Never PFT, never the grind store, never reconciliation.

5. **Immutable `origin_label` in transit.** A value's label travels unchanged through every consumer, projection, API response, and UI render. Consumers may not upgrade `'estimated'` to `'actual'`. Mixed-authority aggregates degrade to the lowest authority present; compliance values stay parallel, never merged.

**Why a symmetric pair proved it:** the exemplar wired exactly two producers — one per fact class — under cross-class authoring parity (ADR-055). Proving one class alone would leave the parity invariant unproven and invite the exact semantic collapse the cure exists to prevent (operational facts absorbed into the ledger class). The pair is the minimal proof that *propagation mechanics can be shared without collapsing authority semantics.* **No "Class A first; Class B catches up" rollout** — symmetric pairs land together.

**Quotes:**
- *"The outbox pattern resolves this by making both operations part of the same database transaction."* — `outbox-knowledge-base.md` §1
- *"A value's `origin_label` is set at the authoring boundary and travels unchanged through every consumer… Consumers may not upgrade authority."* — `outbox-knowledge-base.md` §6.1
- *"Inference is forbidden. Consumers must read `fact_class` and `origin_label` directly — never guess from other fields or storage location."* — `outbox-knowledge-base.md` §6

**Anti-pattern to forbid:** the outbox is **not** a generic event bus, a public event API, an event-sourcing ledger, a reconciliation system, or a multi-consumer platform. It propagates Projection Inputs required to keep operational surfaces current and honest — nothing more.

---

## 2. Cure B — Single-Formula-Owner

**Cures:** competing-derivation split-brain — the same value computed independently on multiple surfaces, producing divergent visible numbers.

**Proven by:** TIA canon (`tia-canon-authority`). Route all table win/loss, drop, and session-aggregation questions there.

**The pattern:**

1. **One owner computes; everyone renders.** Exactly one bounded context/subdomain owns *the* formula and the canonical DTO. Consumers may render the projection; they may not recompute a competing value from raw inputs. *"Consumers may render; they may not recompute. No surface, RPC, or component may derive its own win/loss-like value from raw inputs."*

2. **Competing formulas are deleted, not reconciled.** *"competing formulas must be deleted, not accommodated."* Reconciling two pipelines reproduces the split-brain in the wrong direction.

3. **Read-time derived authority (when no outbox is warranted).** If the derivation is algebraically idempotent from authoritative inputs, it needs no outbox/relay/receipt substrate — it is a read-time derivation that owns the *formula and DTO contract* while upstream stores remain authoritative for the *inputs*. (This is FCTSS's `canonical_derived_model` qualifier — it sits between Read Composition and Projection Consumer.)

4. **Suppression, not deprecation — the decisive move.** When the canonical owner ships, legacy competing fields must be **suppressed on all active operator-visible surfaces**, not merely marked deprecated. *"competing visible semantics are a split-brain violation regardless of consumer migration timeline"* — this is a **P0 gate**. Deprecation leaves the second brain rendering; suppression removes the competing visible number the moment the canonical one appears. A UI that simultaneously shows a legacy value on one surface and the canonical value on another *is* the split-brain state.

5. **Distinct null/zero semantics.** Never `COALESCE(estimate, 0)`. Zero means "source exists, summed to zero"; null means "no usable input." Conflating them silently activates the wrong result path and fabricates a value.

**Quotes:**
- *"Eliminates independent per-surface derivations that produced competing win/loss values; establishes one formula and one non-custody estimate authority."* — `SRL-TIA-001` (`projected_table_win_loss_cents` rationale)
- *"when the exemplar lands, legacy dashboard/metrics win-loss display must be suppressed — not merely deprecated."* — `FIB-H-TIA-CANON-001-classification.yaml`

---

## 3. Cure C — SRL Semantic Root

**Cures:** vocabulary-overload / meaning fractures — one term carrying multiple meanings, or competing artifacts assigning different canonical status to one term.

**Proven by:** the Semantic Responsibility Layer, anchored by SRL-TIA-001. The mechanism lives in `docs/20-architecture/SEMANTIC_RESPONSIBILITY_LAYER.md`; it is generalizable to any domain.

**The pattern:**

1. **Bind every canonical term to an SRM owner.** *"A term without an SRM owner is not canonical."* SRM owns *what a service may write*; SRL owns *what a service may mean and claim*.

2. **The 8-field admission rule.** A term is canonical only when its SRL record declares: owning context, semantic class, epistemic claim (what the system knows), source-of-knowledge rule (how it knows), authority posture, boundary contract, forbidden re-derivation paths, and enforcement hook. Missing any → candidate language only.

3. **Authority order.** ADR decisions → DTO contract → PRD acceptance tests → thesaurus. The thesaurus is an SRL-admitted accepted-language index, **not an independent legislature**.

4. **Closed vocabulary, enforced.** Approved / deprecated / forbidden term sets are explicit. Surface labels are a closed allow-list; inventing a new label that dodges forbidden words but is not on the allow-list is non-compliant.

5. **Automated preflight (the linter).** `scripts/semantic/srl_intake_lint.py` hard-fails (HF-01..08) ambiguous shorthand and superseded key shapes before an artifact may be called canonical. `hard_fail_count > 0` ⇒ not canonical; the script exits nonzero (CI-gateable). It is a deterministic guardrail catching known patterns — not the final semantic authority.

**Quote:** *"SRM = what does this service own and what may it write. SRL = what does this service mean, and what authority may it claim."* — `SEMANTIC_RESPONSIBILITY_LAYER.md`

---

## 4. The Rollout Phasing Template (shared)

Both exemplars followed the same sequence. It is itself a reusable remediation template — the model that prevents scope creep from re-opening the crack:

```
Diagnostic / UL      → name the semantic categories before any code
   ↓
Exemplar Proof Slice → smallest viable proof (symmetric pair / one owner);
                       prove invariants; close the structural gap
   ↓
Integration Proof    → runtime validation against real DB; signed decision
                       artifact authorizes expansion
   ↓
Producer / Owner     → expand one category at a time; intra-category parity
   Expansion           (symmetric pairs ship together); re-prove per addition
   ↓
Consumer / Surface   → projection-only consumers; suppress legacy surfaces;
   Migration           re-verify idempotency/replay per consumer
```

Governing rules: **transport before consumers**; gates are pass/fail (no partial advancement); freeze discipline (frozen ADRs are superseded, never silently patched); **no scope expansion without intake amendment** ("'Small addition' is not a category of governance. It is usually how the raccoon gets into the pantry.").

---

## 5. Proof Obligations (I1–I4) and the Honesty Rule

The outbox exemplar shipped a failure harness proving four invariants. Reuse this obligation set whenever Cure A is applied:

| Invariant | Proves | Scope |
|---|---|---|
| **I1 Atomicity** | authoring row + outbox row commit/roll back together | **Producer-specific — re-prove per new producer** |
| **I2 Durability** | committed row survives relay failure; reclaimable; attempts increment | transport baseline — prove once, inherit |
| **I3 Idempotency** | duplicate delivery → exactly one side effect | re-verify per consumer |
| **I4 Replayability** | replay from ordered history → equivalent state | re-verify per consumer/projection |

**The honesty rule — "Transport health does not imply producer coverage."** Distinguish three certification levels: (a) transport functions; (b) the producer RPC *can* emit given a valid anchor; (c) the real operator workflow *actually* provides that anchor. Relay health certifies only (a). Never report a remediation "complete" when only the transport substrate is proven — the honest phrasing names what is proven and what producer/workflow coverage remains. The same discipline applies to Cure B: a canonical owner shipped without legacy suppression is not complete; it is a live split-brain.
