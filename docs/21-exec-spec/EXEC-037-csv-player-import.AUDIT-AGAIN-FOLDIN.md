---
title: Audit Again — EXEC-037 CSV Player Import (Post-Fix Review)
target_doc: EXEC-037-csv-player-import.md
doc_type: audit_foldin
version: 1.0.0
date: 2026-02-23
status: ready_to_splice
---

# Audit Again: `EXEC-037-csv-player-import.md`

This addendum reflects a second-pass audit after prior fixes were applied. It focuses on remaining correctness risks and clarifications that should be made **before implementation**.

Source document: `EXEC-037-csv-player-import.md`. fileciteturn11file0

---

## Executive verdict

**Green-lightable.** Prior blockers are resolved:
- Endpoint count mismatch clarified (“6 endpoints across 4 route files”)
- Retry-safe staging semantics (`ON CONFLICT DO NOTHING`) stated
- Execute failure handling clarified using PL/pgSQL exception-block subtransactions

Remaining work is **tightening**, not redesign:
1) Concurrency/race condition in server-side row-limit enforcement  
2) Make execute lock behavior explicit  
3) Ensure indexes are specified precisely for the chosen identity resolution path

---

## Confirmed fixes (keep)

### 1) Execute failure handling pattern is now coherent
Your spec describes “rollback production writes but still mark batch failed” using an exception-handling block.
In PL/pgSQL, a block with an `EXCEPTION` clause forms a subtransaction that can be rolled back without affecting the outer transaction:
- PostgreSQL docs: “a block containing an EXCEPTION clause effectively forms a subtransaction that can be rolled back without affecting the outer transaction.”  
  https://www.postgresql.org/docs/current/plpgsql-structure.html

### 2) SECURITY DEFINER search_path hardening is correct
You require `SECURITY DEFINER` + `SET search_path = ''` + schema-qualified references:
- Supabase: “If you ever use security definer, you must set the search_path. If you use empty search_path, you must explicitly state the schema.”  
  https://supabase.com/docs/guides/database/functions

### 3) Papa Parse worker limitation is correctly captured
You explicitly note that with `worker: true`, you can always abort, but pause/resume only works without a worker:
- Papa Parse FAQ: https://www.papaparse.com/faq

### 4) OWASP CSV injection mitigation is correctly specified
You use the “Excel-resistant” mitigation: tab-prefix fields starting with `= + - @`:
- OWASP CSV Injection: https://owasp.org/www-community/attacks/CSV_Injection

---

## Remaining issues to fix

## 1) Race condition: server-side 10k row cap can be bypassed under concurrency

**Problem:** The stage RPC enforces the 10,000 row cap using `total_rows + new_rows <= 10000`. With concurrent staging requests, two calls can read the same `total_rows` and both pass the check, overshooting the cap.

**Fix (required):**
- In `rpc_import_stage_rows`, lock the batch row before checking/updating:
  - `SELECT total_rows FROM import_batch WHERE id = p_batch_id FOR UPDATE;`
- Then perform the cap check and update `total_rows` while holding the lock.

**Add to Acceptance Criteria (WS1):**
- “Stage rows RPC locks import_batch row with `FOR UPDATE` to enforce the 10,000 row cap deterministically.”

## 2) Make execute lock behavior explicit (avoid double-process ambiguity)

You already state `SELECT ... FOR UPDATE` to block concurrent execute calls and that completed/failed returns existing report. Add one sentence stating the *observable behavior*:

**Suggested sentence (WS1 execute RPC):**
> If a second execute call arrives while the batch is locked/executing, it waits on the lock and then returns the final status/report; it must not re-process rows.

This prevents implementers from “handling” concurrency via error returns or duplicate work.

## 3) Indexing: spell out exactly what supports “enrollment-first” identity resolution

Your exec spec currently lists:
- `player(lower(email))`
- `player(phone)`
- `player_casino(casino_id, player_id)`

This is close, but ensure it’s aligned with your identity resolution query shape:

**Required explicitness:**
- State that `player(lower(email))` is a **functional index**.
- If resolution is “enrollment-first” (join through `player_casino`), ensure the join/index direction is supported:
  - `player_casino(casino_id, player_id)` is correct (or also `(player_id, casino_id)` depending on query shape).
- If you later move to `player_identity`, update the index list to match that table (don’t leave it as vibes).

---

## Optional (nice-to-have) tightening

### A) `ON CONFLICT DO NOTHING` staging immutability rule
You chose immutability once staged. Good. Add one line clarifying the implication:
> To correct a staged row, the operator must create a new batch (or use a “reset batch” admin-only action, if later introduced).

### B) CSV sanitization triggers list
You already include `= + - @` and extend to `\t`/`\r`. If you keep `\t`/`\r`, define it as “conservative coverage across spreadsheet apps” to avoid bikeshedding.

---

## Minimal “before coding” checklist (final)

- [ ] Stage RPC locks `import_batch` row `FOR UPDATE` before enforcing 10k cap and updating `total_rows`
- [ ] Execute RPC states explicit concurrent-call behavior (wait → return final report; no reprocess)
- [ ] Functional index called out explicitly: `CREATE INDEX ... ON player (lower(email))`
- [ ] Index list matches identity resolution query shape and table naming

