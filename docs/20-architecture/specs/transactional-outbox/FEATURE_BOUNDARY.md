# Feature Boundary: Transactional Outbox

> **Ownership Sentence:** This feature belongs to **PlayerFinancialService** (finance_outbox DDL, Class A producer wiring, relay worker, processed_messages) and **TableContextService** (table_buyin_telemetry DDL, Class B producer wiring); cross-context coordination goes through the shared `finance_outbox` table written by each service within its own RPC transaction boundary, and `FinancialOutboxEventDTO` consumed by the relay worker and projection consumers.

---

## Bounded Context

- **Owner services:**
  - **PlayerFinancialService** — owns `finance_outbox` table (sole DDL owner), Class A PFT write path producer wiring, relay worker, `processed_messages` idempotency table. Authority: ADR-054 (Event Propagation & Surface Contract), ADR-052 Class A.
  - **TableContextService** — owns `table_buyin_telemetry` (Class B grind authoring store, new Wave 2 table), Class B producer wiring into `finance_outbox` via new grind authoring RPC. Authority: ADR-052 Class B, ADR-055.

- **Writes (new tables, DDL required):**
  - `finance_outbox` — outbox event log, owned by PlayerFinancialService; written by BOTH services within their own respective RPC transactions
  - `table_buyin_telemetry` — Class B grind authoring store, owned by TableContextService; replaces current `table_session.drop_total_cents` as canonical grind authoring surface
  - `processed_messages` — consumer idempotency table, owned by PlayerFinancialService

- **Writes (existing tables, RPCs extended — no schema column changes):**
  - `player_financial_transaction` — Class A write path (PlayerFinancialService); `rpc_create_financial_txn` and `rpc_create_financial_adjustment` gain `finance_outbox` INSERT in same transaction
  - `table_fill`, `table_credit` — remain owned by TableContextService; Dependency Events for shift telemetry projections (not new facts — surfaced via `finance_outbox` for projection freshness)

- **Reads:**
  - `player_financial_transaction` — relay worker reads Class A outbox events
  - `table_buyin_telemetry` — relay worker reads Class B outbox events
  - `finance_outbox` — relay worker polls; consumers read for projection rebuild
  - `processed_messages` — consumer checks before processing event_id

- **Cross-context contracts:**
  - `FinancialOutboxEventDTO` — canonical event envelope `{event_id, event_type, fact_class, origin_label, table_id, player_id, aggregate_id, payload, created_at, processed_at}` consumed by relay worker and all projection consumers
  - `finance_outbox` table — shared write target; PlayerFinancialService owns DDL; TableContextService has INSERT-only access via its own SECURITY DEFINER RPCs
  - `OutboxRelayWorker` — background poller (PostgreSQL-native, no external broker); sets `processed_at` on confirmed delivery

---

## SRM Stale Flag (Action Required Before Phase 5)

The SRM (v4.23.0, 2026-03-25) carries a stale footnote:
> ¹ `finance_outbox` is **post-MVP** (ADR-016 planned for payment gateway integration).

ADR-016's intent was superseded by ADR-054 (frozen 2026-04-23), which re-scoped `finance_outbox` as internal Projection Input propagation, not external payment gateway integration. The SRM must be updated to:
1. Register `finance_outbox` under PlayerFinancialService Owns (Wave 2 — ADR-054)
2. Register `table_buyin_telemetry` under TableContextService Owns (Wave 2 — ADR-052 Class B)
3. Register `processed_messages` under PlayerFinancialService Owns (Wave 2)
4. Remove ADR-016 reference from footnote ¹; replace with ADR-054

SRM update is Phase 4/5 scope — not a Phase 0 blocker. Gate passes with flag recorded.

---

## Primary Implementation Authority

`docs/issues/gaps/financial-data-distribution-standard/wave-2/outbox-knowledge-base.md`

This document is the canonical reference for all Wave 2 outbox implementation detail: `finance_outbox` DDL, trigger classification (D2 vs D6), relay worker design, idempotent consumer pattern, `origin_label` immutability, surface rendering contract, and GAP-F1 closure checklist (§12). All Phase 2–5 artifacts must be consistent with it.

---

**Gate:** `srm-ownership` — PASS with SRM stale flag recorded above.
