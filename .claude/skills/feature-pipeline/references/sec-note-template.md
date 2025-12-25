# SEC Note Template (Tiny Threat Model)

> Copy this template to `docs/30-security/SEC-NOTE-{FEATURE-ID}.md`

---

## Purpose

Prevent "security later" from becoming "security never." A SEC note is small and explicit — broad and vague beats nothing, but small and explicit beats broad and vague.

---

## Template

```markdown
# SEC Note: {Feature Name}

**Feature:** {FEATURE-ID}
**Date:** YYYY-MM-DD
**Author:** {name}
**Status:** Draft | Reviewed | Accepted

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| {asset_1} | PII / Financial / Compliance / Operational | {why it matters} |
| {asset_2} | ... | ... |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| {threat_1} | High/Med/Low | High/Med/Low | P1/P2/P3 |
| {threat_2} | ... | ... | ... |

### Threat Details

**T1: {Threat Name}**
- **Description:** {What the attacker does}
- **Attack vector:** {How they do it}
- **Impact:** {What happens if successful}

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | {control_1} | {where/how implemented} |
| T2 | {control_2} | ... |

### Control Details

**C1: {Control Name}**
- **Type:** Preventive / Detective / Corrective
- **Location:** RLS / Trigger / Application / Middleware
- **Enforcement:** Database / Application / Both
- **Tested by:** {test file or gate}

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| {risk_1} | {why acceptable for now} | {when must address} |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| {field_1} | Plaintext / Hash / Encrypted / Not stored | {why this form} |

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| {table} | {roles} | {roles} | {roles} | Denied |

---

## Validation Gate

- [ ] All assets classified
- [ ] All threats have controls or explicit deferral
- [ ] Sensitive fields have storage justification
- [ ] RLS covers all CRUD operations
- [ ] No plaintext storage of secrets
```

---

## Example: Player Identity Enrollment

```markdown
# SEC Note: Player Identity Enrollment

**Feature:** ADR-022
**Date:** 2025-12-24
**Author:** Lead Architect
**Status:** Accepted

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Government ID document numbers | PII | Breach would expose identity documents |
| Player names + DOB | PII | Identity theft risk |
| Enrollment records | Operational | Audit trail integrity |
| Actor attribution (created_by, enrolled_by) | Audit | Non-repudiation |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino data leakage | High | Medium | P1 |
| T2: Dealer accessing PII | High | Medium | P1 |
| T3: Audit column spoofing | Medium | Low | P2 |
| T4: Identity record swapping | High | Low | P1 |
| T5: Plaintext document number breach | High | Medium | P1 |

### Threat Details

**T1: Cross-casino data leakage**
- **Description:** Staff from Casino A views players from Casino B
- **Attack vector:** Manipulate casino_id in request
- **Impact:** Privacy violation, regulatory breach

**T3: Audit column spoofing**
- **Description:** Staff forges `created_by` to blame another employee
- **Attack vector:** Pass different staff_id in INSERT payload
- **Impact:** Audit trail corruption, non-repudiation failure

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | RLS casino_id binding | `casino_id = (select current_setting('app.casino_id'))` |
| T2 | Role-based RLS | dealer excluded from player_identity policies |
| T3 | Actor binding (INV-9) | RLS WITH CHECK binds to app.actor_id |
| T4 | Immutability trigger (INV-10) | BEFORE UPDATE prevents casino_id/player_id mutation |
| T5 | Hash + last4 storage | document_number_hash + document_number_last4 only |

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Full document encryption | No Vault infrastructure yet | Before tax identity feature |
| Identity write audit log | Audit infra not ready | Before compliance requirement |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| document_number | Hash + Last4 | Deduplication needs hash; display needs last4; no plaintext needed |
| SSN/TIN | Not stored (MVP) | Tax identity deferred |
| Names, DOB | Plaintext | Required for search/display; not highly sensitive |
| Address | Plaintext (JSONB) | Display requirement; not highly sensitive |

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| player_identity | pit_boss, admin, cashier | pit_boss, admin | pit_boss, admin | Denied |
| player | pit_boss, admin, cashier (enrolled) | pit_boss, admin | pit_boss, admin | Denied |
| player_casino | all staff (same casino) | pit_boss, admin | pit_boss, admin | Denied |
```

---

## Gate: sec-approved

The SEC note passes review when:

- [ ] All PII fields identified and classified
- [ ] Each threat has a control or explicit deferral
- [ ] Sensitive fields have storage form justification
- [ ] "Hash + last4" pattern used for document numbers (no plaintext)
- [ ] RLS denies dealer access to identity data
- [ ] Actor binding prevents audit spoofing
