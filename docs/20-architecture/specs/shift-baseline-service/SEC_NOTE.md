# SEC Note: Shift Baseline Service (Rolling Median+MAD)

**Feature:** shift-baseline-service
**Date:** 2026-03-23
**Author:** RLS Expert (rls-expert skill)
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Table drop/hold/cash obs aggregates | Operational | Revenue-sensitive per-table performance data; competitive intelligence if leaked cross-casino |
| Baseline statistical parameters (median, MAD) | Operational | Derived from revenue data; reveals typical performance ranges per table |
| `computed_by` actor attribution | Audit | Non-repudiation: who triggered baseline computation |
| Threshold configuration (`casino_settings.alert_thresholds`) | Operational | Casino-specific detection sensitivity; manipulation could suppress legitimate alerts |
| Anomaly alert results | Operational | Ephemeral but actionable — false suppression could mask theft/fraud indicators |

**Note:** No PII stored. No financial ledger data written. `table_metric_baseline` contains only derived statistical aggregates. Data classification is **Operational** — breach would expose casino performance patterns but not player identity or financial transactions.

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino baseline leakage | High | Low | P1 |
| T2: SECURITY DEFINER privilege escalation | High | Low | P1 |
| T3: Baseline computation spoofing (actor attribution) | Medium | Low | P2 |
| T4: Alert suppression via baseline manipulation | High | Low | P1 |
| T5: Cross-context over-read in compute RPC | Medium | Medium | P2 |
| T6: Unauthorized baseline recomputation (DoS) | Low | Medium | P3 |
| T7: Alert suppression via stale-baseline silent substitution | High | Medium | P1 |

### Threat Details

**T1: Cross-casino baseline leakage**
- **Description:** Staff from Casino A reads `table_metric_baseline` rows belonging to Casino B, revealing performance patterns
- **Attack vector:** Missing or misconfigured RLS policy on `table_metric_baseline`; COALESCE fallback returning wrong casino_id
- **Impact:** Competitive intelligence leak; operational data exposure

**T2: SECURITY DEFINER privilege escalation**
- **Description:** `rpc_compute_rolling_baseline()` runs as `OWNER` with elevated privileges. If casino scope validation is missing, an attacker could trigger computation that reads or writes data for another casino.
- **Attack vector:** Calling `rpc_compute_rolling_baseline()` with a manipulated JWT or before `set_rls_context_from_staff()` establishes context
- **Impact:** Cross-tenant data read (via the cross-context table reads inside the RPC) or write (baseline rows scoped to wrong casino)

**T3: Baseline computation spoofing (actor attribution)**
- **Description:** Attacker forges `computed_by` to attribute a malicious baseline recomputation to another staff member
- **Attack vector:** Passing a `p_actor_id` parameter to the compute RPC (ADR-024 INV-8 violation)
- **Impact:** Audit trail corruption; non-repudiation failure for baseline manipulation

**T4: Alert suppression via baseline manipulation**
- **Description:** Attacker with `pit_boss` role triggers recomputation with artificially inflated historical data, causing the baseline to normalize anomalous values and suppress future alerts
- **Attack vector:** The compute RPC reads historical shift data — if the underlying data has been manipulated (e.g., fake drop events), the baseline absorbs the manipulation. Alternatively, repeated recomputation with different gaming day windows.
- **Impact:** Anomaly alerts fail to fire for genuine operational anomalies (theft, fraud, compliance violations)

**T5: Cross-context over-read in compute RPC**
- **Description:** The SECURITY DEFINER compute RPC reads from `table_drop_event`, `pit_cash_observation`, `rating_slip`, `table_session` — tables owned by TableContextService and RatingSlipService. If the RPC's internal queries are not properly scoped, it could read data beyond the caller's casino.
- **Attack vector:** SQL query inside the SECURITY DEFINER RPC uses `SELECT ... FROM table_drop_event` without explicit `WHERE casino_id = v_casino_id` — definer privileges bypass RLS
- **Impact:** Cross-tenant operational data exposure within the RPC execution context

**T6: Unauthorized baseline recomputation (DoS)**
- **Description:** A `pit_boss` role user repeatedly triggers `rpc_compute_rolling_baseline()`, consuming database resources (7-day aggregation across ~50 tables per call)
- **Attack vector:** Rapid sequential calls to the POST endpoint
- **Impact:** Database performance degradation; dashboard latency spike for all users in the casino

**T7: Alert suppression via stale-baseline silent substitution**
- **Description:** If the read path silently substitutes an older gaming day's baseline when the current-day baseline is missing, operators see anomaly alerts that appear healthy but are evaluated against outdated data. This masks degradation in anomaly coverage.
- **Attack vector:** Admin neglects or is prevented from running recomputation. Silent fallback to stale baseline gives operators false confidence that anomaly detection is active and current.
- **Impact:** Anomaly alerts fail to detect genuine deviations because the baseline does not reflect recent table behavior. Operators believe coverage is active when it is degraded.

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | Pattern C hybrid RLS on `table_metric_baseline` | `casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)` |
| T2 | `set_rls_context_from_staff()` as first statement in SECURITY DEFINER RPC | ADR-024 INV-7 compliance; fail-closed if context missing |
| T3 | `computed_by` derived from `app.actor_id` session var (not parameter) | ADR-024 INV-8: no `p_actor_id` parameter accepted |
| T4 | Baseline reads from immutable shift aggregates + `window_days` audit column | Source data (shift RPCs) is derived from append-only operational records |
| T5 | Explicit `WHERE casino_id = v_casino_id` on ALL cross-context reads inside DEFINER | No reliance on RLS inside SECURITY DEFINER — manual scope enforcement |
| T6 | RBAC gate (`pit_boss` or `admin`) + UPSERT idempotency | Same gaming day recomputation is an UPSERT (no row duplication); role gate limits access |
| T7 | Fail-closed read semantics (ADR-046 §9) + `readiness_state` enum | No silent substitution of stale baselines. Read path returns `readiness_state: 'stale'` or `'missing'` — anomaly evaluation does not run. Dashboard surfaces degraded-coverage indicator. |

### Control Details

**C1: Pattern C Hybrid RLS (T1)**
- **Type:** Preventive
- **Location:** RLS policy on `table_metric_baseline`
- **Enforcement:** Database
- **Template:** SEC-001 Template 1 (standard casino-scoped) for SELECT. Template 1 for INSERT (SECURITY DEFINER writes, but RLS still applies as defense-in-depth)
- **Tested by:** Integration test: two-casino isolation assertion

**C2: SECURITY DEFINER Context Injection (T2)**
- **Type:** Preventive
- **Location:** `rpc_compute_rolling_baseline()` function body
- **Enforcement:** Database (function-level)
- **Pattern:**
  ```sql
  PERFORM set_rls_context_from_staff();
  v_casino_id := NULLIF(current_setting('app.casino_id', true), '')::uuid;
  IF v_casino_id IS NULL THEN
    RAISE EXCEPTION 'RLS context not set: app.casino_id is required';
  END IF;
  ```
- **ADR-018 compliance:** SECURITY DEFINER + `set_rls_context_from_staff()` + REVOKE PUBLIC + explicit scope validation
- **Tested by:** Security gate CI assertion

**C3: Actor Attribution from Session Context (T3)**
- **Type:** Preventive
- **Location:** INSERT/UPSERT in `rpc_compute_rolling_baseline()`
- **Enforcement:** Database
- **Pattern:**
  ```sql
  v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  -- Used in INSERT: computed_by = v_actor_id
  ```
- **ADR-024 INV-8:** No `p_actor_id` or `p_staff_id` parameter accepted. Actor derived exclusively from session context.
- **Tested by:** Integration test: verify `computed_by` matches authenticated staff

**C4: Manual Casino Scope in DEFINER Reads (T5)**
- **Type:** Preventive
- **Location:** All SELECT queries inside `rpc_compute_rolling_baseline()`
- **Enforcement:** Database (SQL query structure)
- **Rule:** Every cross-context read MUST include `WHERE casino_id = v_casino_id` or join through a casino-scoped CTE. RLS is bypassed inside SECURITY DEFINER — manual scope enforcement is the ONLY isolation mechanism.
- **Tested by:** Code review gate; security gate CI (grep for unscoped SELECTs inside DEFINER functions)

**C5: REVOKE PUBLIC + Role Gate (T6)**
- **Type:** Preventive
- **Location:** Function privileges
- **Enforcement:** Database
- **Pattern:**
  ```sql
  REVOKE ALL ON FUNCTION rpc_compute_rolling_baseline() FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION rpc_compute_rolling_baseline() TO authenticated, service_role;
  ```
- **RBAC:** Route handler validates `staff_role IN ('pit_boss', 'admin')` before calling RPC
- **Tested by:** Security gates CI (REVOKE PUBLIC assertion)

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Rate limiting on compute endpoint | UPSERT idempotency + RBAC gate is sufficient for MVP. Repeated calls waste compute but don't create data issues | If operational abuse observed; Phase C-3 |
| Baseline tampering via source data manipulation | Source shift data is derived from operational records with separate audit trails. Baseline itself is a derived metric | If audit reveals source data integrity concerns |
| `audit_log` entry for baseline computation | `computed_by` + `computed_at` columns provide sufficient attribution. Full audit_log entry deferred | If compliance requires formal audit trail for derived metrics |
| UPDATE/DELETE denial policies on `table_metric_baseline` | Table is write-via-UPSERT-only (no business reason to UPDATE individual fields or DELETE). Denial policies add defense-in-depth | Before production deployment if risk assessment changes |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| `median_value` | Plaintext numeric | Derived statistical aggregate. Not sensitive on its own. |
| `mad_value` | Plaintext numeric (pre-scaled) | Derived statistical aggregate. Pre-scaled by 1.4826 for consumer convenience. |
| `casino_id` | UUID reference | Tenant isolation key. Required for RLS. |
| `table_id` | UUID reference | Table identification. Not PII. |
| `computed_by` | UUID FK to `staff(id)` | Actor attribution. Derived from session context, not user input. |
| `gaming_day` | Date | Temporal key. Not sensitive. |
| `metric_type` | Text | Enum-like discriminator. Not sensitive. |

**No PII. No financial ledger data. No secrets. No encryption required.**

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `table_metric_baseline` | pit_boss, admin (casino-scoped Pattern C) | SECURITY DEFINER RPC only (compute RPC) | SECURITY DEFINER RPC only (UPSERT in compute RPC) | Denied (no business reason) |

**RLS Policy Templates:**

| Policy Name | Operation | Template | Expression |
|-------------|-----------|----------|------------|
| `baseline_select_casino` | SELECT | Template 1 | `auth.uid() IS NOT NULL AND casino_id = COALESCE(NULLIF(current_setting('app.casino_id', true), '')::uuid, (auth.jwt() -> 'app_metadata' ->> 'casino_id')::uuid)` |
| `baseline_insert_definer` | INSERT | Template 1 | Same as SELECT (defense-in-depth; actual inserts via SECURITY DEFINER) |
| `baseline_update_definer` | UPDATE | Template 1 | Same as SELECT (defense-in-depth; actual updates via SECURITY DEFINER UPSERT) |
| `baseline_no_delete` | DELETE | Template 3 | `auth.uid() IS NOT NULL AND false` (denial policy) |

**RBAC Note:** `cashier` and `dealer` roles have no business need for baseline data. The SELECT policy's `auth.uid() IS NOT NULL` combined with the route handler's role check (`pit_boss`/`admin`) provides defense-in-depth. If tighter DB-level role restriction is needed, add `AND COALESCE(NULLIF(current_setting('app.staff_role', true), ''), (auth.jwt() -> 'app_metadata' ->> 'staff_role')) IN ('pit_boss', 'admin')` to the SELECT policy.

---

## RPC Security Summary

| RPC | Security Mode | Context Injection | Scope Validation | REVOKE PUBLIC | Role Gate |
|-----|--------------|-------------------|------------------|---------------|-----------|
| `rpc_compute_rolling_baseline` | SECURITY DEFINER | `set_rls_context_from_staff()` | Manual `WHERE casino_id = v_casino_id` on all queries | Yes | pit_boss, admin |
| `rpc_get_anomaly_alerts` | SECURITY INVOKER | `set_rls_context_from_staff()` | Caller's RLS (Pattern C) | Yes | pit_boss, admin |

---

## Validation Gate

- [x] All assets classified (5 assets, all Operational/Audit)
- [x] All threats have controls or explicit deferral (7 threats, 6 controls, 4 deferred risks)
- [x] Sensitive fields have storage justification (all plaintext — no PII, no secrets)
- [x] RLS covers all CRUD operations (SELECT: Pattern C, INSERT/UPDATE: DEFINER + Pattern C defense-in-depth, DELETE: denied)
- [x] No plaintext storage of secrets (no secrets involved)
- [x] ADR-024 INV-8 enforced (no spoofable actor/casino parameters)
- [x] ADR-018 governance satisfied (SECURITY DEFINER + context injection + REVOKE PUBLIC)
- [x] Cross-context reads manually scoped inside DEFINER (T5 control)
