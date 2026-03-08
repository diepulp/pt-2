# SEC Note: ADR-039 Measurement UI

**Feature:** hardening-slice-1-measurement-ui
**Date:** 2026-03-08
**Author:** Architect
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Theo discrepancy data (MEAS-001) | Operational | Reveals per-slip gap between legacy and computed theo — operational sensitivity, competitive intelligence if leaked cross-casino |
| Audit event correlation (MEAS-002) | Compliance | End-to-end financial lineage (slip → PFT → MTL → loyalty). Compliance-interpreted truth class. Regulatory exposure if cross-tenant leakage occurs |
| Rating coverage ratios (MEAS-003) | Operational | Reveals staffing gaps and untracked table time — operational intelligence |
| Loyalty liability snapshot (MEAS-004) | Financial | Outstanding loyalty point balances and dollar valuations. Financial reporting data — cross-casino leakage exposes competitor liability positions |
| Casino-scoped filter parameters | Operational | `pit_id` and `table_id` could be used to enumerate organizational structure if not scoped |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino data leakage via BFF endpoint | High | Medium | P1 |
| T2: Unauthorized role access (dealer/cashier viewing measurement data) | Medium | Medium | P1 |
| T3: Direct API access bypassing page guard | Medium | Medium | P1 |
| T4: MEAS-004 staleness misrepresentation | Low | Low | P3 |
| T5: Filter parameter manipulation to access other casino's pits/tables | High | Low | P1 |

### Threat Details

**T1: Cross-casino data leakage**
- **Description:** Staff from Casino A views measurement metrics belonging to Casino B
- **Attack vector:** Manipulate request or session to inject different `casino_id`
- **Impact:** Exposes competitor's operational metrics, financial liability, and compliance posture

**T2: Unauthorized role access**
- **Description:** Dealer or cashier role accesses measurement reports intended for pit_boss/admin only
- **Attack vector:** Navigate to `/admin/reports` or call `/api/v1/measurement/summary` directly
- **Impact:** Operational data visible to unauthorized staff roles

**T3: Direct API access bypassing page guard**
- **Description:** User blocked at page level still reaches the BFF endpoint directly
- **Attack vector:** HTTP GET to `/api/v1/measurement/summary` from browser console or external tool
- **Impact:** Data exfiltration despite UI-level access control

**T4: MEAS-004 staleness misrepresentation**
- **Description:** MEAS-004 (daily snapshot) displayed without freshness context, user assumes it's live
- **Attack vector:** Not adversarial — design failure. Missing "As of" label
- **Impact:** Incorrect financial decisions based on stale liability data

**T5: Filter parameter manipulation**
- **Description:** User passes `pit_id` or `table_id` belonging to a different casino
- **Attack vector:** Modify query params in URL: `?pit_id={other_casino_pit_uuid}`
- **Impact:** Data leakage if query does not enforce casino scope on filter targets

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | RLS casino_id binding | All 4 queries inherit caller's `casino_id` from `set_rls_context_from_staff()` (ADR-024). MEAS-002/003 via SECURITY INVOKER views. MEAS-001/004 via RLS on source tables. |
| T2 | Dual-layer role guard (page + handler) | Page guard: layout-level `staffRole` check. Handler guard: `mwCtx.rlsContext.staffRole` allowlist check. Both enforce `pit_boss` / `admin` only. |
| T3 | Handler-level role guard | Route Handler independently enforces role restriction — does not trust page-level guard as sole control. Returns 403 for unauthorized roles. |
| T4 | Mandatory freshness labeling | MEAS-004 DTO includes `snapshot_date` field. UI displays "As of [date]" prominently. Acceptance criterion — not optional. |
| T5 | RLS-scoped filter queries | `pit_id` and `table_id` filters are applied within queries that are already casino-scoped via RLS. A pit/table UUID from another casino returns zero rows, not an error — no information leakage about existence. |

### Control Details

**C1: RLS Casino Scoping (all metrics)**
- **Type:** Preventive
- **Location:** Database (RLS policies + SECURITY INVOKER views)
- **Enforcement:** Database
- **Tested by:** RLS integration tests — verify zero rows returned for cross-casino queries

**C2: Dual-Layer Role Guard**
- **Type:** Preventive
- **Location:** Application (page layout + Route Handler)
- **Enforcement:** Application (both layers)
- **Tested by:** E2E test — dealer role navigates to `/admin/reports` → redirected. API test — dealer role calls `/api/v1/measurement/summary` → 403.

**C3: Handler-Independent Authorization**
- **Type:** Preventive
- **Location:** Route Handler middleware (`withServerAction`)
- **Enforcement:** Application
- **Tested by:** API test — unauthenticated request → 401. Wrong role → 403. Correct role → 200.

**C4: Freshness Labeling**
- **Type:** Detective (user-facing transparency)
- **Location:** UI (MEAS-004 widget)
- **Enforcement:** Contract (`snapshot_date` field in DTO is non-optional)
- **Tested by:** UI test — MEAS-004 widget displays "As of" with date value

**C5: RLS-Scoped Filter Queries**
- **Type:** Preventive
- **Location:** Database (RLS) + Service (query construction)
- **Enforcement:** Database
- **Tested by:** Integration test — pass `pit_id` from Casino B while authenticated as Casino A staff → zero rows, no error

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Rate limiting on BFF endpoint | Read-only dashboard, low abuse potential, operational staff only | If endpoint is exposed to higher-traffic consumers or abuse is detected |
| Audit logging of measurement reads | Read-only surface, no state mutation, low regulatory requirement for read audit | If compliance requires read-access audit trail for measurement data |
| IP allowlisting for measurement endpoint | Internal operational tool, already behind auth + RLS | If measurement data classification is elevated to regulated/restricted |

---

## Data Storage Justification

No new data storage. This feature is read-only against existing tables and views:

| Source | Storage Owner | Storage Form | This Feature's Access |
|--------|--------------|--------------|----------------------|
| `rating_slip` | RatingSlipService | Existing table (plaintext cents) | SELECT only |
| `measurement_audit_event_correlation_v` | Measurement Layer | Existing SECURITY INVOKER view | SELECT only |
| `measurement_rating_coverage_v` | Measurement Layer | Existing SECURITY INVOKER view | SELECT only |
| `loyalty_liability_snapshot` | LoyaltyService | Existing table | SELECT only |
| `loyalty_valuation_policy` | LoyaltyService | Existing table | SELECT only |

No PII is surfaced. Metrics are aggregated — no individual player data is displayed.

---

## RLS Summary

This feature creates no new tables and modifies no existing RLS policies. All access is through existing RLS-protected surfaces:

| Table / View | This Feature's Access | RLS Enforcement | Security Mode |
|-------------|----------------------|-----------------|---------------|
| `rating_slip` | SELECT (MEAS-001) | `casino_id` via Pattern C hybrid | RLS (caller context) |
| `measurement_audit_event_correlation_v` | SELECT (MEAS-002) | Caller's RLS propagated through view | SECURITY INVOKER |
| `measurement_rating_coverage_v` | SELECT (MEAS-003) | Caller's RLS propagated through view | SECURITY INVOKER |
| `loyalty_liability_snapshot` | SELECT (MEAS-004) | `casino_id` via RLS | RLS (caller context) |
| `loyalty_valuation_policy` | SELECT (MEAS-004) | `casino_id` via RLS | RLS (caller context) |

---

## Validation Gate

- [x] All assets classified (5 assets: 2 Operational, 1 Compliance, 1 Financial, 1 Operational)
- [x] All threats have controls (T1→C1, T2→C2, T3→C3, T4→C4, T5→C5)
- [x] No new data storage — read-only against existing tables
- [x] No PII surfaced — aggregated metrics only
- [x] RLS covers all read operations (existing policies, no modifications)
- [x] Dual-layer authorization documented (page guard + handler guard)
- [x] Deferred risks explicitly accepted with triggers
