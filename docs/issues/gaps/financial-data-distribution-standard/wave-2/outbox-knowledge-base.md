# Transactional Outbox Knowledge Base — PT-2 Wave 2

status: KNOWLEDGE-BASE
date: 2026-05-06
scope: Expert reference for transactional-outbox-expert skill
authority: ADR-052, ADR-053, ADR-054, ADR-055 (frozen 2026-04-23)
external-patterns: AWS Prescriptive Guidance, microservices.io, SoftwareMill, dev.to/actor-dev, birjob.com

---

## Purpose

This document is the authoritative knowledge base for the `transactional-outbox-expert` skill.
It captures pattern content from upstream references (cited below) filtered through PT-2 system
constraints. The skill reads this document — it does **not** follow live links during implementation.

---

## 1. Core Problem: Dual Write

**Source:** AWS Prescriptive Guidance — Transactional Outbox Pattern

A dual write occurs when a microservice must:
1. Persist data to the database
2. Emit a notification/event to other systems

If these are separate operations, a crash between them causes data inconsistency:
- DB write succeeds, event never emitted → downstream systems miss the fact
- Event emitted, DB write fails → downstream systems act on a non-existent fact

**The outbox pattern resolves this by making both operations part of the same database transaction.**

### Mechanism (PostgreSQL variant, applies to PT-2)

```sql
BEGIN;
  INSERT INTO domain_table (...) VALUES (...);   -- primary write
  INSERT INTO outbox (aggregate_id, type, payload, status)
    VALUES (..., 'pending');                       -- outbox insert
COMMIT;
-- if either fails, entire transaction rolls back
```

A relay worker reads only committed rows (PostgreSQL visibility guarantees this naturally).

### What Does NOT Satisfy the Atomic Write Rule (ADR-054 D2)

"Same transaction" is literal — one `BEGIN…COMMIT`, one `pg_current_xact_id()`. These patterns look atomic but are not:

| Pattern | Why It Fails |
|---------|-------------|
| Two separate RPCs coordinated by retry logic | Each RPC is its own transaction; a crash between them loses the outbox insert |
| Authoring row committed; outbox row written by a background job ("eventual outbox") | Not atomic — authoring fact exists without a guaranteed event |
| Authoring row committed; outbox row written by a post-commit trigger | Post-commit fires outside the transaction boundary |
| Any pattern described as "logically atomic", "atomic in spirit", or "best-effort consistent" | These are not the rule |

**Acceptable forms:**
- Single RPC that inserts both the authoring row and the outbox row before `COMMIT`
- `BEFORE INSERT` or `AFTER INSERT` trigger that inserts **only** the outbox row — see trigger classification below

### Trigger Classification (ADR-054 D2 + D6)

ADR-054 D2 permits certain triggers and D6 forbids others. These are not contradictory — the line is the trigger's purpose and scope:

| Property | Acceptable trigger | Forbidden trigger |
|----------|-------------------|-------------------|
| **What it writes** | Only `finance_outbox` | Any other table — projections, caches, domain stores, bounded context stores |
| **Transaction boundary** | Fires inside the same transaction as the authoring write (`BEFORE`/`AFTER INSERT` — not post-commit) | Fires post-commit, or calls a separate transaction |
| **Logic it contains** | Deterministic row mapping — copies fields from the authoring row into the outbox envelope | Business logic, domain decisions, conditional routing, event classification |
| **Visibility** | Declared, named, infrastructure-only | Hidden, undocumented, or silently performing cross-domain propagation |
| **Cross-domain effect** | None — the outbox is the relay point, not the destination | Directly mutates projections, MTL, loyalty, or any bounded context outside the authoring table |

**The permitted pattern in one sentence:** a trigger may copy authoring row data into `finance_outbox` within the same transaction — that is infrastructure. It may not propagate meaning into another domain — that is hidden architecture.

The distinction matters because ADR-054 D2 carves out the trigger-insert form as a valid atomicity mechanism, while D6 bans triggers as a propagation mechanism. A trigger that "happens to also update the shift dashboard" reads the same way in SQL but violates D6. Future reviewers must be able to classify any trigger by asking: *does this write anything other than `finance_outbox`?* If yes, it is a D6 violation regardless of how it is described.

---

## 2. Delivery Semantics

**Source:** AWS Prescriptive Guidance, SoftwareMill

### At-Least-Once (the only practical guarantee)

The outbox + relay worker architecture guarantees **at-least-once delivery**:
- Worker reads pending rows → publishes → marks as sent
- If marking as sent fails after publishing, the row is re-processed on next poll
- Consumers **will** receive duplicates; this is by design and must be tolerated

### Exactly-Once Is Not a Real Guarantee

- "Exactly-once" messaging claims require tight coordination between messaging layer and application
- In practice: simulate with at-least-once delivery + idempotent consumers
- Do not design PT-2 consumers assuming exactly-once

### Ordering

- AWS uses timestamps + sequence numbers for ordering across the outbox
- PT-2 requirement: ordering **per entity** (`table_id`), not global
- Relay worker must process events per aggregate in insertion order

---

## 3. Relay Worker Design

**Source:** SoftwareMill

The relay worker is a background process that drives events from outbox to consumers.

### Polling Model (PT-2 default)

```
loop every N seconds:
  SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at LIMIT batch_size
  for each row:
    publish(row)          -- send to consumer/broker
    UPDATE outbox SET status = 'sent' WHERE id = row.id
```

### Failure Handling

- If `publish` fails → do not mark as sent → retry on next poll interval
- If `UPDATE status` fails after successful publish → row re-processed → duplicate delivered
- This is the source of at-least-once semantics; it cannot be eliminated at the worker level

### Outbox Table Maintenance

Two strategies to prevent table bloat:
1. **Separate cleanup process**: periodically `DELETE FROM outbox WHERE status = 'sent' AND sent_at < NOW() - INTERVAL '7 days'`
2. **Delete on acknowledgment**: delete row immediately after marking sent (simpler, loses audit trail)

For PT-2: prefer option 1 (retain sent rows for observability window, then purge).

### CDC Alternative (Optional, Post-Pilot)

Instead of polling, use PostgreSQL WAL (Write-Ahead Log) via Debezium or pg_logical replication:
- Reads the change stream directly; no polling interval lag
- Requires CDC tooling and infrastructure
- Not required for Wave 2 pilot; useful for scale

---

## 4. Idempotent Consumer Pattern

**Source:** microservices.io (Chris Richardson)

### Problem

At-least-once delivery from any relay/broker means the same event arrives multiple times.
A non-idempotent consumer produces incorrect results (duplicate credits, double-records, etc.).

### Solution

Each consumer must track which event IDs it has already processed and discard re-deliveries.

### Implementation Option A — `processed_messages` Table (Recommended for PT-2)

```sql
CREATE TABLE processed_messages (
  message_id   TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Consumer logic:
```sql
BEGIN;
  INSERT INTO processed_messages (message_id) VALUES ($1)
    ON CONFLICT DO NOTHING
    RETURNING message_id;
  -- if no row returned, this is a duplicate → rollback or skip business logic
  -- if row inserted, proceed with side effects
COMMIT;
```

### Implementation Option B — `message_ids` on Business Entity

Track processed IDs as an array/set attribute on the aggregate being updated.
Use a conditional update to reject duplicates:
```sql
UPDATE projections
SET value = $new_value,
    processed_ids = processed_ids || $message_id
WHERE aggregate_id = $agg_id
  AND NOT ($message_id = ANY(processed_ids));
```

For PT-2: Option A (separate table) is cleaner and avoids bloating aggregate rows.

---

## 5. Inbox Pattern

**Source:** dev.to/actor-dev — "Achieving Idempotency with the Inbox Pattern"

### What It Is

The inbox pattern is the consumer-side complement to the outbox:
- When an event arrives, the consumer writes a record to an `inbox` table **in the same DB transaction** as the business write
- Before processing, check if the `message_id` already exists in the inbox
- If duplicate → acknowledge and skip
- If new → process and commit together

### Why It Matters

| Problem | Inbox Solution |
|---------|---------------|
| Duplicate delivery | Inbox is idempotency filter: process each `message_id` once |
| Poison pills | Acknowledge bad message, fix root cause, replay; inbox skips already-processed IDs |
| Partition stall | Unblocks partition processing without losing already-processed state |

### Inbox Table

```sql
CREATE TABLE inbox (
  message_id   TEXT PRIMARY KEY,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed    BOOLEAN NOT NULL DEFAULT FALSE
);
```

### Relationship to `processed_messages`

The inbox pattern and `processed_messages` table (§4) solve the same problem from slightly different angles:
- `processed_messages`: simpler, single insert guard
- Inbox: richer, supports replay tracking and poison-pill handling

For PT-2 Wave 2: start with `processed_messages` (simpler). Inbox is the upgrade path if replay or poison-pill handling is needed.

---

## 6. Event Schema Standard

**Source:** ADR-054 §3 (Financial Event Propagation & Surface Contract) — canonical authority; ADR-052 D4 (discriminator fields); ADR-055 P1 (envelope parity)

### Canonical `finance_outbox` Row Schema

Every row in `finance_outbox` MUST contain all of the following fields. `fact_class` and `origin_label` are the load-bearing fields of ADR-054 — omitting either is a schema-level violation.

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `event_id` | UUID (v7) | NOT NULL | Unique; idempotency key for consumers |
| `event_type` | enum/string | NOT NULL | e.g. `buyin.recorded`, `grind.observed`, `cashout.recorded`, `adjustment.recorded` |
| `fact_class` | enum | NOT NULL | `'ledger'` (Class A) or `'operational'` (Class B) |
| `origin_label` | enum | NOT NULL | `'actual'` (Class A) or `'estimated'` (Class B) in pilot; `'observed'` and `'compliance'` reserved for taxonomy |
| `table_id` | UUID | NOT NULL | Table-first anchoring — mandatory on every row in both classes (ADR-052 D2) |
| `player_id` | UUID | NULL | Mandatory for Class A (full attribution); always NULL for Class B (attribution absent by construction) |
| `aggregate_id` | UUID | NOT NULL | Authoring row id — PFT row id for Class A, grind row id for Class B |
| `payload` | JSONB | NOT NULL | Event-specific domain fact — NOT FinancialEnvelope, NOT UI envelope |
| `created_at` | TIMESTAMPTZ | NOT NULL | Authored time |
| `processed_at` | TIMESTAMPTZ | NULL | Set by consumer; NULL = unprocessed |

### Class-to-Discriminator Mapping

| Class | Storage | `fact_class` | `origin_label` | `player_id` |
|-------|---------|-------------|---------------|------------|
| Class A — Ledger | `player_financial_transaction` (PFT) | `'ledger'` | `'actual'` | mandatory (NOT NULL) |
| Class B — Operational | `table_buyin_telemetry` (grind partition) | `'operational'` | `'estimated'` | always NULL |

Inference is forbidden. Consumers must read `fact_class` and `origin_label` directly — never guess from other fields or storage location.

### Critical Field Distinctions

- **`table_id` ≠ `aggregate_id`**: `table_id` is the scoping key for per-entity ordering; `aggregate_id` is the specific authoring row that emitted this event. They are distinct fields with distinct purposes.
- **`event_id` generation**: generated at the authoring boundary using UUID v7. Never generated at the consumer side. Never via database `DEFAULT` in Class B while Class A uses explicit generation (ADR-055 P2).
- **`player_id = NULL`** on every Class B row, always — never partially populated (ADR-052 R5). Partial attribution is a violation.

### Envelope Parity (ADR-055 P1)

Both authoring paths insert the **same column set**. No class-conditional envelope fields. Class-specific content belongs in `payload`, not in nullable envelope columns. If a field exists in the envelope, it is present in every insert from both paths — with explicit `NULL` where not applicable for a given class.

### Schema Evolution

- Adding optional fields to `payload`: backward-compatible, safe
- Changing `event_type` values: coordinate with all consumers before deploying
- Adding or renaming envelope columns: requires a migration; both authoring paths must update together per ADR-055 P4 (no asymmetric rollouts)
- Do not use a schema registry for Wave 2 pilot

---

## 6.1 `origin_label` Immutability and Authority Degradation

**Source:** ADR-054 D5

### Immutability Rule

A value's `origin_label` is set at the authoring boundary and travels **unchanged** through every consumer, projection, API response, and UI render. Consumers may not upgrade authority. A value emitted as `'estimated'` remains `'estimated'` in every downstream context — a projection-built value does not earn higher authority by virtue of being recalculated.

This is enforced as a schema constraint: `fact_class` and `origin_label` are set at insert and never updated (ADR-052 R4). Reclassification means a new row in the target class.

### Authority Hierarchy

When an aggregate mixes authorities, the surface authority is the **lowest** present:

```
Actual  >  Observed  >  Estimated
```

| Mix | Resulting authority |
|-----|-------------------|
| `Actual` + `Observed` | `Observed` |
| `Actual` + `Estimated` | `Estimated` |
| `Observed` + `Estimated` | `Estimated` |
| `Actual` + `Observed` + `Estimated` | `Estimated` |

Upgrading is never permitted. The surface must degrade to the lowest authority present.

### Compliance Is Parallel (Not on the Ladder)

`Compliance` values must NOT be merged with any other authority in a single aggregate. A surface showing Compliance alongside other classes must render them in **separate fields**. No single combined value may include Compliance alongside Actual, Estimated, or Observed.

### Pilot-Authored Values

In Wave 2 pilot scope, only `'actual'` (Class A) and `'estimated'` (Class B) are authored. `'observed'` and `'compliance'` exist in the taxonomy for labeling consistency but are not authored by PT-2 in pilot. Reserved values must not be emitted by new Wave 2 producers without a new ADR.

---

## 6.2 Surface Rendering Contract

**Source:** ADR-054 §4 (D6 enforcement) — every financial value at any system boundary must declare all three

### Required Declarations on Every Financial Surface

Every financial value at any system boundary — UI, API response, DTO, export, report — must carry:

**1. Source** — which fact class produced this value:
- `Ledger` — derived from Class A (PFT) only
- `Operational` — derived from Class B (grind) only
- `Mixed` — derived from both classes (must apply authority degradation from §6.1)

**2. Authority** — carried from `origin_label` unchanged:

| Authority | Meaning | Pilot source |
|-----------|---------|-------------|
| `Actual` | Auditable ledger event | PFT (Class A) |
| `Estimated` | Unattributed operational estimate | Grind / TBT (Class B) |
| `Observed` | Physical observation | `pit_cash_observation` (not authored in pilot) |
| `Compliance` | Regulatory record | `mtl_entry` (parallel domain) |

A surface value must carry exactly one authority. Authority cannot be omitted. If the authority cannot be determined, the surface must NOT render the value — there is no `'unknown'` authority.

**3. Completeness:**

```ts
completeness: {
  status:    'complete' | 'partial' | 'unknown'  // mandatory — never omitted
  coverage?: number                               // 0.0–1.0, optional refinement
}
```

- `'complete'` — all expected inputs for the aggregation window are present
- `'partial'` — inputs are pending, missing, or stale
- `'unknown'` — completeness cannot be determined; the surface must say so, never guess `'complete'`
- `coverage` is a completeness measure, not an authority measure; it never substitutes for `status`

### FinancialValue DTO Shape (Canonical)

```ts
{
  value:        number           // integer cents (canonical)
  type:         'actual' | 'estimated' | 'observed' | 'compliance'
  source:       string           // e.g. 'PFT', 'grind', 'pit_cash_observation', 'mtl_entry'
  completeness: {
    status:     'complete' | 'partial' | 'unknown'
    coverage?:  number
  }
}
```

> **Bridge DTO exception:** During the active PRD-072 migration slice, `RecentSessionDTO` and `VisitLiveViewDTO` fields use dollar-float (not integer cents) with `type: 'actual'`. Do not apply `financialValueSchema` or cents conversion to bridge fields. See TRANSITIONAL-GOVERNANCE-CAVEAT.md.

### Rendering Requirements

- Labels must be **visible to the user** — not buried in tooltips, collapsed, or API-metadata-only
- A surface claiming an authoritative total is non-conformant (ADR-053 D2)
- The UI must NOT recompute financial state against authoring stores to patch staleness — render the completeness label instead (ADR-054 D7)
- `Compliance` values rendered in a separate field, never co-aggregated

---

## 7. Failure Model and System Requirements

**Source:** PT-2 Wave 2 guidance doc §7

### Expected Failure Modes

| Failure | Handling |
|---------|---------|
| Duplicate delivery | Idempotent consumer / inbox deduplication |
| Delayed processing | Relay worker retry; outbox backlog metric |
| Out-of-order events | Per-entity ordering in relay; consumers tolerate within aggregate |
| Consumer crash mid-processing | Inbox/processed_messages ensures re-processing is safe |
| Backlog accumulation | Observability alert; relay worker tuning |

### System Guarantees Required

- **No data loss**: outbox row is the durable record; not deleted until confirmed sent
- **No duplicate side effects**: idempotent consumer + processed_messages table
- **Eventual consistency**: projections lag behind writes by relay poll interval
- **Projection rebuild**: projection layer must be rebuildable from outbox history

---

## 8. Observability Requirements

**Source:** birjob.com, PT-2 Wave 2 guidance doc §9

Track these metrics:

| Metric | What It Signals |
|--------|----------------|
| `outbox_backlog_size` | Relay worker falling behind; consumer pressure |
| `processing_lag_ms` | End-to-end event latency from insert to consumer ack |
| `retry_count` | Delivery reliability; upstream service health |
| `duplicate_rate` | Consumer idempotency health; relay correctness |
| `dlq_depth` | Poison pills or unresolvable consumer errors |

---

## 9. PT-2 Specific Constraints (Non-Negotiable)

These override generic outbox pattern guidance.

### 9.1 Dual Authoring Streams (ADR-052 + ADR-055)

The system has two distinct fact classes, each with a dedicated authoring path:

| Class | Name | Storage | `fact_class` | `origin_label` |
|-------|------|---------|-------------|----------------|
| Class A | Ledger | `player_financial_transaction` (PFT) | `'ledger'` | `'actual'` |
| Class B | Operational | `table_buyin_telemetry` (grind partition) | `'operational'` | `'estimated'` |

The two classes are not merged and not derived from one another. They coexist (ADR-052 D1).

Both paths write to the same `finance_outbox` table using identical discipline:
- same transaction boundary (one `BEGIN…COMMIT`)
- same envelope column set (ADR-055 P1 — no class-conditional fields)
- same `event_id` generation strategy at authoring boundary (UUID v7)
- same retry semantics: authoring write rolls back if outbox insert fails

**No "Class A first; Class B catches up" rollout.** If a feature cannot be implemented for both classes simultaneously, it is deferred until both are ready (ADR-055 P4).

Forbidden:
- Dual-write from PFT to the grind authoring store (ADR-052 R3)
- `player_id` populated on any Class B row — partial attribution is a violation (ADR-052 R5)
- Grind rows produced as a projection of PFT rows, or vice versa (ADR-052 R3)
- `fact_class` or `origin_label` changed after insert — reclassification means a new row (ADR-052 R4)

### 9.2 Envelope Separation (HARD BOUNDARY)

```
FinancialEnvelope  ≠  EventPayload
```

- `FinancialEnvelope` is a UI/API surface concern
- `EventPayload` / `DomainFact` is the outbox concern
- The envelope must NEVER be stored in the outbox or used as event payload
- Consumers derive their own representation from the domain fact

### 9.3 No AWS Service Implementations

Do NOT replicate these — they are AWS-specific, not pattern-defining:
- DynamoDB Streams
- EventBridge
- Lambda pipelines
- Amazon SQS (use PostgreSQL-native relay instead)

### 9.4 No Event Sourcing

Outbox ≠ event sourcing. PT-2 does NOT:
- Reconstruct system state from events
- Use the outbox as a general ledger
- Store projection state in the outbox

### 9.5 No Reconciliation Logic

Consumers must not perform reconciliation. PT-2 provides operational financial telemetry only — not accounting truth, not final totals.

---

## 10. Implementation Checklist (Wave 2)

> **Prerequisite:** GAP-F1 must be closed (§12) before consumer/projection layers can be wired end-to-end.

### Step 1 — Outbox Table (`finance_outbox`)

- [ ] Table named `finance_outbox` (canonical name per ADR-054)
- [ ] Columns: `event_id UUID NOT NULL`, `event_type TEXT NOT NULL`, `fact_class TEXT NOT NULL`, `origin_label TEXT NOT NULL`, `table_id UUID NOT NULL`, `player_id UUID NULL`, `aggregate_id UUID NOT NULL`, `payload JSONB NOT NULL`, `created_at TIMESTAMPTZ NOT NULL`, `processed_at TIMESTAMPTZ NULL`
- [ ] `fact_class` constrained to `'ledger' | 'operational'` (enum or CHECK constraint)
- [ ] `origin_label` constrained to `'actual' | 'estimated' | 'observed' | 'compliance'` (enum or CHECK constraint)
- [ ] `table_id NOT NULL` enforced at DB level (table-first anchoring, ADR-052 D2)
- [ ] Append-only — no in-place mutation of `payload`, `fact_class`, or `origin_label`
- [ ] Index on `(processed_at NULLS FIRST, created_at)` for relay worker poll
- [ ] Index on `(table_id, created_at)` for per-entity ordering

### Step 2 — Authoring Integration (GAP-F1 closure)

- [ ] Class A (PFT) write path: `finance_outbox` insert inside same `BEGIN…COMMIT` as PFT insert
- [ ] Class B (grind) write path: `finance_outbox` insert inside same `BEGIN…COMMIT` as grind insert
- [ ] `event_id` generated with UUID v7 at authoring boundary — not via DB `DEFAULT`, not at consumer
- [ ] `fact_class = 'ledger'` and `origin_label = 'actual'` hardcoded for Class A path
- [ ] `fact_class = 'operational'` and `origin_label = 'estimated'` hardcoded for Class B path
- [ ] `player_id = NULL` enforced on every Class B insert
- [ ] Both paths use identical column set (ADR-055 P1 envelope parity)

### Step 3 — Relay Worker

- [ ] Polls `WHERE processed_at IS NULL ORDER BY created_at` — uses `table_id` for per-entity ordering
- [ ] Sets `processed_at` only after confirmed delivery to consumer
- [ ] Retry on failure (exponential backoff); does not mark `processed_at` on unconfirmed delivery
- [ ] PostgreSQL-native — no external broker, no AWS SDK

### Step 4 — Consumer Layer

- [ ] Checks `processed_messages` (or inbox table) before acting on `event_id`
- [ ] Inserts `processed_messages` record in same transaction as side effects
- [ ] Reads `fact_class` and `origin_label` from event — never infers them from payload content
- [ ] Passes `origin_label` through unchanged to any downstream projection or surface
- [ ] No reconciliation logic
- [ ] No access to `FinancialEnvelope`
- [ ] Never writes to PFT or grind authoring store

### Step 5 — Projection Layer

- [ ] Every projected financial value carries `type` (mapped from `origin_label`), `source`, and `completeness`
- [ ] Mixed-class projections degrade authority to lowest present (§6.1)
- [ ] `Compliance` values rendered in separate fields — never co-aggregated
- [ ] Deterministic: same events → same projection state
- [ ] Rebuildable: can replay from `finance_outbox` history
- [ ] Isolated side effects: no cross-projection mutation

---

## 11. Anti-Patterns (DO NOT DO)

| Anti-Pattern | Why Forbidden |
|---|---|
| Use `FinancialEnvelope` as event payload | Envelope is UI surface, not domain contract (§9.2) |
| Relabel `origin_label` in a consumer | `origin_label` is immutable in transit (ADR-054 D5, §6.1) |
| Omit `fact_class` or `origin_label` from outbox row | Schema-level violation — these are load-bearing fields (ADR-054) |
| Merge Class A + Class B into a single unlabeled value | Must degrade to lowest authority and label the mix (§6.1) |
| Merge `Compliance` into any other authority aggregate | Compliance is parallel — must be rendered separately (§6.1) |
| Populate `player_id` on a Class B row | Attribution is absent by construction for Class B (ADR-052 R5) |
| Use `aggregate_id` as the ordering key (instead of `table_id`) | `table_id` scopes per-entity ordering; `aggregate_id` is the row id |
| Write authoring row and outbox row in separate transactions | Violates ADR-054 D2 literal atomicity rule |
| Emit from a projection or read model | Only the authoring write may emit (ADR-054 C1) |
| Consumer writing to PFT or grind authoring store | Consumers are projection-only (ADR-054 D4) |
| Assume exactly-once delivery | At-least-once is the only real guarantee |
| Introduce reconciliation logic | PT-2 is telemetry, not accounting authority (ADR-053) |
| Use AWS service implementations | Pattern-level concepts only; no DynamoDB, SQS, Lambda |
| Treat outbox as system backbone | Outbox is infrastructure; domain model is separate |
| Drift into event sourcing | PT-2 does not reconstruct state from events |
| UI recomputing financial state to fix staleness | Render completeness label instead (ADR-054 D7, §6.2) |
| DB trigger that writes anything other than `finance_outbox` | "ADR allows triggers" applies only to the outbox-insert form; any trigger that mutates a projection, cache, or bounded context store is a D6 violation regardless of transaction scope — see §1 trigger classification |

---

## 12. Implementation Dependencies (GAP-F1)

**Critical dependency — read before any Wave 2 implementation planning.**

### GAP-F1 — Outbox Producers Not Yet Wired

```
GAP-F1: finance_outbox has zero producers.
        The outbox pattern is not yet wired to the PFT or grind write paths.
        ADR-054 is decided but not yet enforced in code.
```

Any spec or implementation that assumes outbox producers exist must flag this dependency explicitly. Work that builds consumers, projections, or downstream surfaces ahead of GAP-F1 closure must either:

1. Stub the producer connection point and mark it with a `// GAP-F1: wire outbox insert here` comment, or
2. Explicitly state in the PRD/EXEC-SPEC that it is a consumer-side skeleton pending GAP-F1

Do not describe a consumer as complete while the producer does not exist.

### GAP-F1 Closure Requirements (from ADR-054 follow-up work)

1. Implement `finance_outbox` producer in the PFT write path — transaction-coupled
2. Implement `finance_outbox` producer in the grind authoring path — transaction-coupled (same session, ADR-055 parity)
3. Add `fact_class`, `origin_label`, `table_id`, `player_id`, `aggregate_id`, `event_type` as DDL columns
4. Build event consumer with idempotency and `origin_label` preservation
5. Audit existing DB triggers for cross-domain propagation; deprecate or route through outbox
6. Remove polling-based refresh logic that recomputes against authoring stores

---

## 13. Citation Index

This document is the canonical knowledge base — the skill reads it directly rather than following live links. External links are preserved here for attribution and verification only.

### System-Internal Authority (primary references)

| ADR | Title | What It Governs in This KB |
|-----|-------|---------------------------|
| ADR-052 | Financial Fact Model (Dual-Layer) | Two fact classes, `fact_class`/`origin_label` discriminators, table-first anchoring, TBT reclassification, row-level invariants |
| ADR-053 | Financial System Scope Boundary | No authoritative totals, no reconciliation, system is telemetry only |
| ADR-054 | Financial Event Propagation & Surface Contract | Atomic write rule, at-least-once, outbox event schema, `origin_label` immutability, authority degradation, surface rendering contract |
| ADR-055 | Cross-Class Authoring Parity | Envelope parity, same transaction discipline, UUID v7 at authoring boundary, no asymmetric rollouts |

Snapshot files: `docs/issues/gaps/financial-data-distribution-standard/decisions/`

### External Pattern Sources (secondary references)

| # | Source | Concepts Captured |
|---|--------|------------------|
| [1] | [AWS Prescriptive Guidance — Transactional Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html) | Atomic write, dual write problem, at-least-once, ordering |
| [2] | [microservices.io — Idempotent Consumer](https://microservices.io/post/microservices/patterns/2020/10/16/idempotent-consumer.html) | PROCESSED_MESSAGES table, conditional update, discard duplicates |
| [3] | [SoftwareMill — Microservices 101](https://softwaremill.com/microservices-101/) | Relay worker design, CDC/WAL, table bloat, marking-as-sent failure |
| [4] | [dev.to/actor-dev — Inbox Pattern](https://dev.to/actor-dev/inbox-pattern-51af) | Inbox table, idempotency filter, poison pill handling, replay safety |
| [5] | [birjob.com — Event-Driven Architecture](https://www.birjob.com/blog/event-driven-architecture) | Event schema fields, schema evolution, observability metrics |

**Precedence:** When external pattern sources conflict with ADR-052–055, the ADR set wins without exception.
