# SEC Note: Shift Dashboard Provenance Alignment (Hardening Slice 2)

**Feature:** hardening-slice-2-shift-provenance
**Date:** 2026-03-09
**Author:** System Architect
**Status:** Draft

---

## Scope Disclaimer

This is a **governance certification slice** — zero code changes, zero new tables, zero new RPCs, zero migrations. The security surface is minimal by design: the slice produces documentation artifacts only.

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Metric Provenance Matrix content | Operational | Incorrect provenance declarations could mislead operators about truth semantics of displayed values |
| Surface Classification Declaration | Operational | Incorrect classification could lead to wrong rendering/aggregation pattern choices in future surfaces |
| Consistency audit findings | Operational | Premature or incorrect "no duplication" findings could mask real derivation path conflicts |

**Note:** No PII, financial data, or compliance-sensitive data is created, modified, or exposed by this slice. All audited metrics are read-only observations of existing production data flows.

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Incorrect provenance declaration | Medium | Medium | P2 |
| T2: Governance artifact staleness | Low | Medium | P3 |
| T3: False-negative consistency audit | Medium | Low | P2 |

### Threat Details

**T1: Incorrect provenance declaration**
- **Description:** A MEAS row declares the wrong source table, freshness category, or reconciliation path for a shift metric
- **Attack vector:** Not adversarial — error in audit trace from UI to database
- **Impact:** Future implementation work trusts incorrect provenance; wrong caching, wrong freshness assumptions, wrong reconciliation checks

**T2: Governance artifact staleness**
- **Description:** Provenance matrix rows become stale if shift dashboard code changes without updating the matrix
- **Attack vector:** Normal development drift — no enforcement mechanism for document-time governance
- **Impact:** Matrix becomes unreliable; operators make decisions based on outdated truth semantics

**T3: False-negative consistency audit**
- **Description:** Audit concludes "no duplicated derivation paths" when duplication actually exists in components or hooks not inspected
- **Attack vector:** Incomplete component tree traversal during audit
- **Impact:** Undetected divergent computations of the same business fact across UI surfaces

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | Trace validation | Each MEAS row's source tables verified by reading service code, RPC definitions, and SQL views |
| T1 | SRM cross-reference | All source tables validated against SRM §TableContextService and §Measurement Layer ownership |
| T2 | Expansion protocol | §5.1 of METRIC_PROVENANCE_MATRIX.md requires governed amendment via PR for any changes |
| T2 | SRM cross-reference update | Governance Cross-References subsection links matrix to owning services |
| T3 | Defined audit scope | Component tree fully enumerated in RFC §4.1; every truth-bearing component inspected |
| T3 | Auditable duplication definition | "Duplicated derivation path" explicitly defined in scaffold (not left to interpretation) |

### Control Details

**C1: Trace validation**
- **Type:** Detective
- **Location:** Documentation review process
- **Enforcement:** PR review of provenance matrix amendments
- **Tested by:** Reviewer verifies source table → service → hook → component chain for each row

**C2: Auditable duplication definition**
- **Type:** Preventive
- **Location:** Scaffold + RFC
- **Enforcement:** Definition applied during consistency audit
- **Tested by:** Each business fact checked against definition before "no duplication" conclusion

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| No runtime enforcement of provenance declarations | Document-time governance only; runtime enforcement is out of Slice 2 scope | If audit reveals critical derivation path conflicts that require code-level enforcement |
| No automated staleness detection for matrix rows | No tooling infrastructure for governance artifact monitoring | If multiple surfaces consume the matrix and drift becomes a measurable problem |

---

## Data Storage Justification

N/A — this slice creates no new data storage. All artifacts are markdown documentation files.

---

## RLS Summary

N/A — this slice creates no new tables, views, or RPCs. No RLS changes.

---

## Validation Gate

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] Sensitive fields have storage justification (N/A — no data storage)
- [x] RLS covers all CRUD operations (N/A — no tables)
- [x] No plaintext storage of secrets (N/A — no secrets)
