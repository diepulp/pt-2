# ADR-025: MTL Authorization Model (staff_role over service-claim)

**Status:** Accepted
**Date:** 2026-01-02
**Owner:** Security/Platform
**Decision Scope:** MTL (Monetary Transaction Log) read/write authorization
**Amends:** SEC-003-rbac-matrix.md (MTL rows only)
**Related:** ADR-024, SEC-003, PRD-005

---

## Context

SEC-003 v1.2.0 specifies MTL access via a `compliance` **service claim**:

| Domain | admin | compliance (claim) |
|--------|-------|-------------------|
| MTL Read | ✅ | ✅ |
| MTL Audit Notes | ◻️ | ✅ |

This creates a **dual-axis authorization problem**:

1. **JWT issuance complexity**: Service claims must be minted by auth gateway with explicit scoping
2. **UI gating confusion**: Does the UI check `staff_role` or JWT `scope`?
3. **RLS policy fragmentation**: Some policies check `staff_role`, others check claims
4. **Code path divergence**: Half your code forgets which axis matters
5. **Audit ambiguity**: Is the actor a "staff member" or a "service account"?

For a single-casino pilot where compliance officers are real people with casino assignments, this is over-engineering.

---

## Decision

### Use staff_role + casino_id for MTL Authorization

MTL authorization follows the same pattern as other PT-2 services: `staff_role` enum scoped by `casino_id`, with admin override.

### MTL Access Matrix (Replacing SEC-003 MTL Rows)

| Capability | dealer | pit_boss | cashier | admin |
|------------|--------|----------|---------|-------|
| mtl_entry SELECT | ◻️ | ✅ | ✅ | ✅ |
| mtl_entry INSERT | ◻️ | ✅ | ✅ | ✅ |
| mtl_entry UPDATE | ◻️ | ◻️ | ◻️ | ◻️ |
| mtl_entry DELETE | ◻️ | ◻️ | ◻️ | ◻️ |
| mtl_audit_note SELECT | ◻️ | ✅ | ◻️ | ✅ |
| mtl_audit_note INSERT | ◻️ | ✅ | ◻️ | ✅ |
| mtl_audit_note UPDATE | ◻️ | ◻️ | ◻️ | ◻️ |
| mtl_audit_note DELETE | ◻️ | ◻️ | ◻️ | ◻️ |
| Gaming Day Summary (UI) | ◻️ | ✅ | ◻️ | ✅ |

**Rationale for assignments:**

- **cashier writes entries**: Cashiers record cash-out transactions at the cage
- **pit_boss writes entries**: Pit bosses record buy-ins at tables
- **cashier reads entries**: Form UX requires seeing the running list when adding entries
- **pit_boss/admin read entries**: Compliance review is an operational function
- **pit_boss/admin write audit notes**: Annotations are operational, not enterprise compliance
- **Gaming Day Summary UI-gated**: Compliance dashboard restricted to pit_boss/admin at route level

### Drop service-claim Requirement

For MTL MVP:
- Remove `compliance` service claim as an authorization gate
- Use ADR-024 `set_rls_context_from_staff()` for context derivation
- All MTL access is via `staff_role` + `casino_id` scoping

### Future compliance_officer Role (Post-MVP)

If separation-of-duties is required later:

1. Add `compliance_officer` to `staff_role` enum
2. Assign to SEC-003 matrix like any other role
3. No service claims needed

---

## Security Invariants

**INV-1:** MTL tables are append-only (no UPDATE/DELETE via RLS + REVOKE + triggers)

**INV-2:** All MTL writes require `casino_id` match via ADR-024 context

**INV-3:** All MTL reads are casino-scoped (no cross-casino visibility)

**INV-4:** Actor attribution uses `app.actor_id` from `set_rls_context_from_staff()`

**INV-5:** Admin has full read/write within their casino (no override for other casinos)

---

## Migration Plan

### SEC-003 Amendment

Add explicit carve-out to SEC-003:

```markdown
### MTL Authorization (ADR-025)

MTL uses `staff_role` for MVP authorization. The `compliance` service claim is
reserved for future cross-casino or separation-of-duties requirements.

See ADR-025 for the authoritative MTL access matrix.
```

### PRD-005 EXECUTION-SPEC Update

Update RLS Policy Matrix and Role Enforcement sections to match this ADR.

### RLS Policy Implementation

```sql
-- mtl_entry SELECT: pit_boss, cashier, admin (cashier needs form UX)
CREATE POLICY mtl_entry_select ON mtl_entry FOR SELECT TO authenticated
USING (
  casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  AND current_setting('app.staff_role', true) IN ('pit_boss', 'cashier', 'admin')
);

-- mtl_entry INSERT: pit_boss, cashier, admin
CREATE POLICY mtl_entry_insert ON mtl_entry FOR INSERT TO authenticated
WITH CHECK (
  casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  AND current_setting('app.staff_role', true) IN ('pit_boss', 'cashier', 'admin')
);

-- mtl_audit_note INSERT: pit_boss, admin
CREATE POLICY mtl_audit_note_insert ON mtl_audit_note FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM mtl_entry e
    WHERE e.id = mtl_audit_note.mtl_entry_id
    AND e.casino_id = NULLIF(current_setting('app.casino_id', true), '')::uuid
  )
  AND current_setting('app.staff_role', true) IN ('pit_boss', 'admin')
);
```

---

## Consequences

### Positive

- **Simplicity:** Single authorization axis (`staff_role`) across all services
- **Consistency:** MTL follows same pattern as PlayerService, VisitService, etc.
- **Faster development:** No dual-axis auth threading through JWT/UI/RLS
- **Clearer auditing:** Actor is always a staff member with known role

### Negative

- **No SoD by default:** Separation-of-duties between operations and compliance is deferred
- **Future migration:** Adding `compliance_officer` role later requires schema change

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SoD audit requirement | Add `compliance_officer` to `staff_role` enum post-MVP |
| Cross-casino corporate compliance | Revisit service claims when multi-casino is in scope |
| Cashier accessing compliance dashboard | Gaming Day Summary UI-gated to pit_boss/admin at route level |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-02 | Initial proposal - staff_role over service-claim for MTL |
| 1.1.0 | 2026-01-03 | **Amended**: Cashier can SELECT mtl_entry (form UX requires visibility). Gaming Day Summary remains UI-gated to pit_boss/admin at route level. |
