Here is the complete posture picture.

---

## BLOCKER-P0-2 — Fills/Credits Source Posture

### Schema timeline

| Migration                                              | Date       | What changed                                                                                                                                                                                                 |
| ------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `20260117153430_adr027_table_bank_mode_schema.sql`     | 2026-01-17 | Adds `table_session.fills_total_cents INTEGER NOT NULL DEFAULT 0` and `credits_total_cents`. RPCs **not yet updated** — column exists but is never incremented.                                              |
| `20260224123748_prd038_rundown_persistence_schema.sql` | 2026-02-24 | Adds nullable `table_fill.session_id UUID` and `table_credit.session_id UUID`. No backfill.                                                                                                                  |
| `20260224123752_prd038_modify_fill_credit_rpcs.sql`    | 2026-02-24 | Modifies `rpc_request_table_fill` and `rpc_request_table_credit` to: (1) set `table_fill.session_id` on insert, and (2) atomically increment `fills_total_cents` / `credits_total_cents` on `table_session`. |

### Coverage gap — both paths share it equally

The pre-PRD-038 gap (pre-2026-02-24) is identical for both candidate sources:

- **`WHERE session_id = :sessionId` on `table_fill`**: pre-PRD-038 rows have `session_id = NULL` → SUM returns NULL/0. Undercount.
- **`table_session.fills_total_cents`**: column existed since ADR-027 but was never incremented (RPC not patched until PRD-038) → field = 0 for all pre-PRD-038 activity. Same undercount.

Neither path rescues pre-PRD-038 data. The data is gone from both angles.

### Practical risk is closed

Table sessions in casino operations are shift-length (~8 hours). PRD-038 landed 2026-02-24 — over three months ago relative to today (2026-06-01). Any session active during the ADR-027→PRD-038 gap would have been force-closed long before now. **No live session in a PRD-090 query can be a pre-PRD-038 session.** The gap is historical only.

### The `fills_total_cents` authority problem

`table_session.fills_total_cents` is explicitly commented as **"Informational in MVP"** (ADR-027 migration line 54). It was not designated as a canonical formula input. Using it as the authoritative source for a formula field without an explicit SRM/ADR entry elevates a column from informational to canonical — a governance step the PRD cannot make silently.

The `table_session.fills_total_cents` also has a secondary concern: the `COALESCE(fills_total_cents, 0) + p_amount_cents` update in the RPC means a NULL in the column (which cannot actually occur given `NOT NULL DEFAULT 0`, but defensive nonetheless) would coalesce to 0. The arithmetic is sound but the governance posture is not.

### Recommendation

**Use `WHERE session_id = :sessionId` on `table_fill` / `table_credit` with explicit COALESCE to 0 for the zero-row SUM.** Reasoning:

1. It is the session-scope predicate pattern consistent with the telemetry SUM (ADR-061 D2 design language).
2. It preserves individual row auditability — fills can be enumerated, not just totalled.
3. It does not elevate an "Informational" column to a canonical formula input without an ADR amendment.
4. The pre-PRD-038 gap applies equally to both options, is historical only, and must be documented as a known coverage limit — not silently absorbed.
5. COALESCE to 0 for fills/credits is semantically correct and **distinct** from the telemetry null-preservation rule (zero fills is a valid count; null SUM ≠ missing data for fills).

### What the WS2 spec patch must say

```
Resolve fills: SUM(table_fill.amount_cents) WHERE session_id = :sessionId.
COALESCE(SUM, 0) — zero fills is a valid count; null SUM must not pass through.

Resolve credits: SUM(table_credit.amount_cents) WHERE session_id = :sessionId.
COALESCE(SUM, 0) — same rule.

Known coverage limit: table_fill.session_id and table_credit.session_id were added
in migration 20260224123748 (PRD-038, 2026-02-24). Rows written before that date
have session_id = NULL and are excluded from the session-scoped SUM. Any session
closed before 2026-02-24 will produce fills_cents = 0 and credits_cents = 0
regardless of actual fill/credit activity. This is a documented historical gap;
no live session opened after PRD-038 deployment is affected.
```

---

Ready to proceed with the patch. Confirm the `WHERE session_id = :sessionId` + COALESCE-to-0 approach, or redirect.