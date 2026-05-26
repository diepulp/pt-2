I have everything I need. Here's the complete triage.

---

## Stale CI Gate Triage — Wave 2 Transactional Outbox

### BLOCKING — Gates that will fail on PR open to `main`

---

**[FAIL-1] SEC-010 — `10_authenticated_grant_audit.sql`: empty exclusion list**

The gate asserts every `rpc_*` function has `GRANT EXECUTE TO authenticated`. Wave 2 introduced **11 service_role-only relay/infrastructure RPCs** — intentionally not callable by authenticated users. The exclusion list is `ARRAY[]::text[]` (hardcoded "no exclusions"). These RPCs will all appear as violations:

| RPC                                  | Auth design                                                  |
| ------------------------------------ | ------------------------------------------------------------ |
| `rpc_claim_outbox_batch`             | REVOKE FROM PUBLIC; service_role only                        |
| `rpc_commit_consumer_receipt`        | REVOKE FROM PUBLIC; service_role only                        |
| `rpc_acknowledge_outbox_delivery`    | REVOKE FROM PUBLIC; service_role only                        |
| `rpc_get_outbox_relay_health`        | REVOKE FROM PUBLIC + anon + authenticated; service_role only |
| `rpc_get_outbox_event_page`          | REVOKE FROM PUBLIC + anon + authenticated; service_role only |
| `rpc_claim_class_a_outbox_batch`     | REVOKE FROM PUBLIC; service_role only                        |
| `rpc_process_class_a_projection`     | REVOKE FROM PUBLIC; service_role only                        |
| `rpc_claim_operational_outbox_batch` | REVOKE FROM PUBLIC; service_role only                        |
| `rpc_process_operational_projection` | REVOKE FROM PUBLIC; service_role only                        |
| `rpc_cleanup_outbox_processed`       | REVOKE FROM PUBLIC + anon + authenticated; service_role only |
| `rpc_close_gaming_day`               | REVOKE FROM PUBLIC; GRANT TO service_role only               |

**Fix needed:** Add all 11 to `v_exclusions` with the rationale comment "service_role-only relay/lifecycle infrastructure — ADR-054 R3."

---

**[FAIL-2] SEC-006 — `06_context_first_line_check.sql`: allowlist missing all outbox RPCs**

The gate asserts every SECURITY DEFINER `rpc_*` function calls `set_rls_context_from_staff()` as its first `PERFORM`. All 11 service_role-only outbox RPCs are `SECURITY DEFINER` but correctly have **no** context injection — they're invoked by the relay worker with service_role credentials, not by a staff JWT. The existing `v_allowlist` has 6 entries, all pre-Wave-2. These 11 RPCs are absent.

For example, `rpc_claim_outbox_batch`'s body has zero `PERFORM` statements — it returns directly via `RETURN QUERY`. The check will find `v_first_perform IS NULL` and raise a violation.

**Fix needed:** Add all 11 RPCs above to `v_allowlist` with comment "service_role-only relay infrastructure — no staff JWT context available (ADR-054 R3, relay worker caller)."

---

### STRUCTURAL COVERAGE GAP

---

**[GAP-1] `outbox_transport_access.test.sql` not registered in `run_all_gates.sh`**

The file exists at `supabase/tests/security/outbox_transport_access.test.sql` (10 pgTAP assertions: SELECT/INSERT/UPDATE/DELETE denied to `authenticated` on `finance_outbox` and `processed_messages`, plus RLS-enabled structural checks). It is **not in the `GATES` array** in `run_all_gates.sh` — so it never runs in CI.

There's a secondary issue: the file uses pgTAP format (`SELECT plan(10); SELECT throws_ok(...)`). The runner detects pass/fail via psql exit code with `ON_ERROR_STOP=1`. pgTAP test failures do not produce a non-zero exit code — they emit TAP text. So even if the entry were added as-is, a failing pgTAP assertion would silently pass the runner.

**Fix needed:** Convert `outbox_transport_access.test.sql` to PL/pgSQL `RAISE EXCEPTION` / `RAISE NOTICE 'PASS: ...'` style (matching the other gates), then register it in `run_all_gates.sh` as `"sql|outbox_transport_access.test.sql|ADR-054 Outbox transport access control (SEC-011)"`.

---

### LINT HYGIENE — Affects future PRs

---

**[LINT-1] `migration-lint.yml` has no exemption for service_role-only `rpc_*` functions**

The migration lint (`rpc-self-injection-check` job) errors if any migration file defines an `rpc_*` function without a `set_rls_context_from_staff` or `set_rls_context_internal` call. Any future migration that amends or adds an outbox relay RPC will be blocked. The lint has no concept of "service_role-only exempt" RPCs.

**Fix needed:** Add an exemption pattern — either a hardcoded allowlist of known outbox RPCs, or a convention like `-- service_role-only` comment that the lint script respects as an explicit bypass marker.

---

### ADVISORY — No functional breakage

---

**[ADV-1] `ci.yml` test count comment stale**  
Line 53: `# Node suite: 2,627 tests, 0 failures (bounded-context rollout complete).` — Wave 2 added ~150+ tests across 15+ new suites. The comment is wrong. Low priority but worth updating pre-merge.

**[ADV-2] `ci.yml` test job `continue-on-error: true` not hardened**  
Marked "advisory while stabilizing." Wave 2 is done, but the tracker explicitly notes a blocking `.env` vs `.env.local` env issue (`dev_env_finding_flagged_for_followup`) that causes integration tests to hit the remote DB instead of local. This must be resolved before `continue-on-error: false` can safely be set. The two are linked.

---

### Recommended Fix Order

1. **FAIL-1 + FAIL-2** together (both are in `supabase/tests/security/`) — edit `10_authenticated_grant_audit.sql` and `06_context_first_line_check.sql` with the 11-RPC exclusion/allowlist additions
2. **GAP-1** — rewrite `outbox_transport_access.test.sql` in PL/pgSQL RAISE EXCEPTION style; register in `run_all_gates.sh`  
3. **LINT-1** — add exemption logic to `migration-lint.yml`
4. **ADV-1/ADV-2** — update test comment; resolve `.env` env issue and harden the test job

Want me to start applying the fixes, beginning with FAIL-1 + FAIL-2?