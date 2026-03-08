# SEC Note: Hardening Slice 0 — Standards Foundation

**Feature:** hardening-slice-0-standards-foundation
**Date:** 2026-03-07
**Author:** architect
**Status:** Draft

---

## Classification: Documentation-Only Slice

This feature produces two governance Markdown documents. It introduces **zero** database migrations, RPCs, service layer code, API routes, or UI components. The security surface is therefore minimal — the primary risks are governance-level, not runtime.

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Surface Classification Standard | Operational / Governance | Incorrect or permissive standard could allow insecure surface patterns to pass review |
| Metric Provenance Matrix | Operational / Governance | Incorrect provenance declarations could lead Slice 1 to build against wrong source tables or freshness assumptions |
| MEAS-002 provenance declaration | Compliance | Audit event correlation view spans 4 bounded contexts; incorrect provenance could misguide compliance surface implementation |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Standard permits insecure aggregation pattern | Medium | Low | P2 |
| T2: Provenance matrix misattributes source tables | Medium | Low | P2 |
| T3: Standard omits security considerations for pattern selection | Medium | Low | P2 |

### Threat Details

**T1: Standard permits insecure aggregation pattern**
- **Description:** Surface Classification Standard's selection criteria could steer an engineer toward a data aggregation pattern that bypasses RLS (e.g., SECURITY DEFINER where SECURITY INVOKER is required)
- **Attack vector:** Engineer follows the standard's recommendation without checking RLS implications
- **Impact:** Cross-tenant data leakage in a future surface built against the standard

**T2: Provenance matrix misattributes source tables**
- **Description:** A provenance row lists the wrong source view or table, causing Slice 1 to build against an unprotected data path
- **Attack vector:** Implementation follows provenance declaration to a view or table that lacks RLS coverage
- **Impact:** Incorrect data exposure or missing audit trail

**T3: Standard omits security context for pattern selection**
- **Description:** The pattern catalogue describes rendering/aggregation tradeoffs without noting that BFF RPC and BFF Summary patterns have different security invoker semantics
- **Attack vector:** Omission — engineer selects pattern for performance reasons without considering RLS mode
- **Impact:** Privilege escalation if SECURITY DEFINER is used where INVOKER is needed

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | Security annotation in pattern catalogue | Each pattern entry notes its RLS mode (INVOKER vs DEFINER) and when each is appropriate |
| T2 | Source table validation against SRM | Every provenance row's Source Tables column must reference objects registered in SRM §Measurement Layer |
| T3 | Security column in selection criteria | Decision matrix includes "Security Mode" as a consideration alongside context count and call frequency |
| All | PR review gate | Both governance documents require PR review before merge; security-relevant content flagged for lead review |

### Control Details

**C1: Security annotation in pattern catalogue**
- **Type:** Preventive
- **Location:** Documentation (Surface Classification Standard §Pattern Catalogue)
- **Enforcement:** Document structure — each pattern entry includes a "Security Mode" field
- **Tested by:** PR review checklist

**C2: Source table validation against SRM**
- **Type:** Preventive
- **Location:** Documentation (Metric Provenance Matrix §Source Tables column)
- **Enforcement:** Each source table/view must appear in SRM §Measurement Layer with registered provenance
- **Tested by:** Cross-reference check during PR review

---

## Deferred Risks (Explicitly Accepted for Slice 0)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| No automated enforcement of standard compliance | Documentation-only slice; automated linting is out of scope | If manual review fails to catch non-compliant EXEC-SPECs in Slices 1-3 |
| Compliance-class metrics may need wider column set | Only 1 of 4 metrics is Compliance-Interpreted; 12-column subset sufficient for current scope | If Slice 1 reveals compliance review needs around MEAS-002 (interpretation basis, late data handling, consumer tolerance) — governed matrix expansion, not local improvisation |

---

## Data Storage Justification

N/A — this slice writes zero database fields.

---

## RLS Summary

N/A — this slice creates zero tables and modifies zero RLS policies.

---

## Validation Gate

- [x] All assets classified (3 governance assets)
- [x] All threats have controls (T1→C1, T2→C2, T3→C1+C3) or explicit deferral
- [x] Sensitive fields have storage justification (N/A — no data storage)
- [x] RLS covers all CRUD operations (N/A — no tables)
- [x] No plaintext storage of secrets (N/A)
- [x] Deferred risks have explicit triggers

---

## Note on Slice 1 Implications

While Slice 0 itself has minimal security surface, the governance artifacts it produces will **constrain security-relevant decisions in Slice 1**. Specifically:

- The Surface Classification Standard's pattern catalogue must annotate security invoker mode per pattern, because Slice 1 will use it to choose aggregation approaches for `measurement_audit_event_correlation_v` (SECURITY INVOKER) and `rpc_snapshot_loyalty_liability` (SECURITY DEFINER). Getting this annotation wrong here propagates to implementation.
- The Provenance Matrix's source table references must be accurate against the SRM, because Slice 1 service modules will be built to consume exactly the objects declared here.

These are design-time risks with implementation-time consequences. The controls above (C1, C2) address them at authoring time.
