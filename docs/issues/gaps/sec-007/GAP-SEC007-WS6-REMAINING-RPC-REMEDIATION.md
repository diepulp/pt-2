# GAP-SEC007-WS6: Remaining p_casino_id RPC Remediation

**Priority**: P2 (compliance debt, not exploitable)
**Discovered**: 2026-03-04
**Status**: Open — CI blocking (SEC-003 hard-fail enforced via PR #14)
**Affects**: ADR-024, SEC-003, SEC-007
**Source**: WS6 enforcement flip (PR #14) exposed 14 RPCs still carrying `p_casino_id`
**Predecessor**: PRD-041 P2-1 (PR #12) remediated 12 RPCs in RatingSlip, TableContext, Player, FloorLayout

---

## Summary

After the WS6 enforcement flip (PR #14), SEC-003 hard-fails on 14 RPCs that still accept `p_casino_id` as a parameter. All 14 use the validate pattern (caller supplies, function checks against session context, rejects on mismatch) — **not exploitable**, but non-compliant with ADR-024's derive-only mandate.

The security-gates CI workflow blocks merges on any PR touching `supabase/migrations/**` or `supabase/tests/security/**` until these are remediated.

---

## Remaining RPCs (14)

### Tier 1 — Loyalty (6 RPCs)

Bounded context: Loyalty. Separate callsite graph from PRD-041 scope.

| # | Function | Params to Remove | Notes |
|---|----------|-----------------|-------|
| 1 | `rpc_accrue_on_close` | `p_casino_id` | |
| 2 | `rpc_apply_promotion` | `p_casino_id` | |
| 3 | `rpc_get_player_ledger` | `p_casino_id` | Read-only |
| 4 | `rpc_manual_credit` | `p_casino_id`, `p_awarded_by_staff_id` | Delegation param — see OQ-2 |
| 5 | `rpc_reconcile_loyalty_balance` | `p_casino_id` | |
| 6 | `rpc_redeem` | `p_casino_id`, `p_issued_by_staff_id` | Delegation param — see OQ-2 |

### Tier 2 — Financial (2 RPCs)

Bounded context: Financial. Blocked on business decision (OQ-1).

| # | Function | Params to Remove | Notes |
|---|----------|-----------------|-------|
| 7 | `rpc_create_financial_txn` | `p_casino_id`, `p_created_by_staff_id` | Delegation param — see OQ-1 |
| 8 | `rpc_create_financial_adjustment` | `p_casino_id` | |

### Tier 3 — Cross-Context Reads (4 RPCs)

Mixed bounded contexts. Read-only paths, low risk.

| # | Function | Params to Remove | Notes |
|---|----------|-----------------|-------|
| 9 | `rpc_get_dashboard_tables_with_counts` | `p_casino_id` | Dashboard |
| 10 | `rpc_get_player_last_session_context` | `p_casino_id` | Player (read) |
| 11 | `rpc_get_player_recent_sessions` | `p_casino_id` | Player (read) |
| 12 | `rpc_get_rating_slip_modal_data` | `p_casino_id` | RatingSlip (read) |

### Tier 4 — Already in PRD-041 scope but still present (2 RPCs)

These were in the PRD-041 P2-1 list but still appear in catalog. Investigate whether the migration landed correctly.

| # | Function | Params to Remove | Notes |
|---|----------|-----------------|-------|
| 13 | `rpc_start_rating_slip` | `p_casino_id` | Was in Phase A — verify migration |
| 14 | `rpc_issue_mid_session_reward` | `p_casino_id` | Was in EXEC-041 allowlist |

---

## Open Questions

| ID | Question | Owner | Deadline |
|----|----------|-------|----------|
| **OQ-1** | Is delegated attribution ("supervisor records on behalf of staff") legitimate for `rpc_create_financial_txn`? If yes, document ADR-024 exception. If no, remove `p_created_by_staff_id` and derive from `app.actor_id`. | Priya Shah (Product) | 2026-03-24 |
| **OQ-2** | Do `rpc_manual_credit` (`p_awarded_by_staff_id`) and `rpc_redeem` (`p_issued_by_staff_id`) follow the same delegation pattern as OQ-1? Should they be resolved together? | Product / Engineering | 2026-03-24 |

---

## Remediation Pattern

Same as PRD-041 P2-1 (FR-1, FR-2):

1. **DROP** old function signature
2. **CREATE** new function without `p_casino_id` — derive from `current_setting('app.casino_id')` (already set by `set_rls_context_from_staff()`)
3. Remove validate-block (`IF p_casino_id IS DISTINCT FROM ... THEN RAISE EXCEPTION`)
4. `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated, service_role; NOTIFY pgrst, 'reload schema';`
5. Update TypeScript callsites to stop passing `p_casino_id`
6. Regenerate types (`npm run db:types-local`)
7. For delegation params (`p_created_by_staff_id`, `p_awarded_by_staff_id`, `p_issued_by_staff_id`): awaiting OQ-1/OQ-2 resolution

---

## Suggested PR Sequencing

| PR | Scope | Blocked By |
|----|-------|------------|
| PR D1 | Tier 3 (4 read RPCs) + Tier 4 investigation | Nothing — can ship immediately |
| PR D2 | Tier 1 loyalty RPCs (4 without delegation params) | Nothing — can ship immediately |
| PR D3 | Tier 1 delegation RPCs (`rpc_manual_credit`, `rpc_redeem`) | OQ-2 |
| PR D4 | Tier 2 financial RPCs | OQ-1 |

After all 4 PRs merge, SEC-003 allowlist should be emptied and the gate passes clean (8/8).

---

## Done Criteria

- [ ] `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%' AND 'p_casino_id' = ANY(proargnames);` returns 0 rows
- [ ] SEC-003 gate passes (no allowlisted violations)
- [ ] All 8 security gates pass (8/8)
- [ ] SEC-003 allowlist reduced to empty array
- [ ] OQ-1 and OQ-2 resolved (delegation params addressed or exception documented)
- [ ] TypeScript callsites updated, `npm run type-check` and `npm run build` pass

---

## References

| Document | Relevance |
|----------|-----------|
| PRD-041 (`docs/10-prd/PRD-041-adr024-p2-validate-to-derive-remediation-v0.md`) | P2-1 pattern and out-of-scope rationale |
| GAP-SEC007-P2-BACKLOG (`docs/issues/gaps/sec-007/GAP-SEC007-P2-BACKLOG-ADR024-COMPLIANCE.md`) | Original P2 deferral and delegation question |
| WS6-ROLLOUT-PLAN (`docs/issues/gaps/sec-007/WS6-ROLLOUT-PLAN.md`) | Enforcement flip plan |
| ADR-024 (`docs/80-adrs/ADR-024_DECISIONS.md`) | Authoritative context derivation mandate |
| PR #14 | WS6 enforcement flip (SEC-003 hard-fail) |
| PR #12 | PRD-041 P2-1 remediation (12 RPCs) |
