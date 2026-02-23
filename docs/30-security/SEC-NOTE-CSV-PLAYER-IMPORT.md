# SEC Note: CSV Player Import

**Feature:** csv-player-import
**Date:** 2026-02-23
**Author:** Lead Architect
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Player PII (names, DOB, email, phone) | PII | Vendor CSVs contain personal identity data; breach exposes patron identities |
| Player enrollment records (`player_casino`) | Operational | Incorrect enrollment corrupts the casino's player pool |
| Import staging data (`import_row.normalized_payload`) | PII (transient) | Contains the same PII as above in staging form |
| Raw CSV data (`import_row.raw_row`) | PII (transient) | May contain additional vendor fields beyond what we map |
| Casino-scoped tenant boundaries | Compliance | Cross-tenant leakage violates multi-tenancy invariants |
| Actor attribution (`created_by_staff_id`) | Audit | Non-repudiation for who performed the import |
| Idempotency keys | Integrity | Replay protection for import operations |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino data leakage | High | Medium | P1 |
| T2: Unauthorized import (wrong role) | High | Medium | P1 |
| T3: Actor attribution spoofing | Medium | Low | P2 |
| T4: CSV injection in export | Medium | Medium | P1 |
| T5: Staging data lingering indefinitely | Low | High | P3 |
| T6: Batch hijacking (execute someone else's batch) | High | Low | P1 |
| T7: Denial of service via oversized imports | Medium | Medium | P2 |
| T8: Idempotency key collision (accidental or malicious) | Medium | Low | P2 |
| T9: Loyalty data bypass via import | High | Medium | P1 |

### Threat Details

**T1: Cross-casino data leakage**
- **Description:** Staff from Casino A imports or views player data belonging to Casino B
- **Attack vector:** Manipulate `casino_id` in request payload; access batches from another casino
- **Impact:** Privacy violation, regulatory breach, multi-tenancy failure

**T2: Unauthorized import (wrong role)**
- **Description:** Dealer or cashier role creates or executes an import batch
- **Attack vector:** Direct API call bypassing UI role checks
- **Impact:** Unauthorized data modification

**T4: CSV injection in export**
- **Description:** Malicious data in CSV fields (e.g., `=CMD()`) executes when opened in Excel
- **Attack vector:** Attacker seeds malicious strings in vendor CSV; these flow through to results export
- **Impact:** Remote code execution on operator's machine when opening results CSV

**T6: Batch hijacking**
- **Description:** Staff member executes a batch created by another staff member at a different casino
- **Attack vector:** Guess or enumerate batch IDs; call execute endpoint
- **Impact:** Unauthorized data writes to production tables

**T9: Loyalty data bypass via import**
- **Description:** Import directly writes loyalty tier/points to `loyalty_ledger`, bypassing LoyaltyService
- **Attack vector:** Include tier/points fields in CSV; import logic writes them as production data
- **Impact:** Corrupts loyalty source of truth; violates bounded context rules

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | RLS casino_id binding | `casino_id = current_setting('app.casino_id')` on all policies |
| T1 | Session-var-only writes | INSERT/UPDATE policies use session vars, no JWT fallback (ADR-030) |
| T2 | Role-gated RLS policies | INSERT/UPDATE restricted to `app.staff_role IN ('admin','pit_boss')` |
| T3 | Actor binding | `created_by_staff_id = app.actor_id` enforced in INSERT WITH CHECK |
| T4 | CSV sanitization | Export prefixes `=`, `+`, `-`, `@` with single quote in all cells |
| T5 | Deferred: cleanup policy | Post-MVP: scheduled job to redact/purge old staging data |
| T6 | RLS batch ownership | Execute RPC validates `batch.casino_id` matches `app.casino_id` |
| T7 | Size limits | Client: 10MB file / 10,000 rows; Server: 2,000 rows per stage request |
| T8 | Unique constraint | `UNIQUE(casino_id, idempotency_key)` prevents duplicate batches |
| T9 | Design exclusion | Import schema has NO loyalty fields; tier/points in CSV are metadata-only in `raw_row` |

### Control Details

**C1: RLS Casino Binding (T1)**
- **Type:** Preventive
- **Location:** Database (RLS policies)
- **Enforcement:** Database
- **Tested by:** RLS integration tests; `set_rls_context_from_staff()` test suite

**C2: Role-Gated INSERT/UPDATE (T2)**
- **Type:** Preventive
- **Location:** Database (RLS policies)
- **Enforcement:** Database
- **Tested by:** Role-based RLS tests (dealer/cashier denied)

**C3: Actor Binding (T3)**
- **Type:** Preventive
- **Location:** Database (RLS WITH CHECK)
- **Enforcement:** Database
- **Tested by:** Actor binding test (mismatched staff_id rejected)

**C4: CSV Sanitization (T4)**
- **Type:** Preventive
- **Location:** Application (export function)
- **Enforcement:** Application
- **Tested by:** Unit test for formula prefix sanitization

**C5: Loyalty Exclusion by Design (T9)**
- **Type:** Preventive
- **Location:** Schema design + Zod validation
- **Enforcement:** Both (schema has no loyalty columns; `ImportPlayerV1` contract excludes loyalty fields)
- **Tested by:** Schema validation rejects unknown fields; code review

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Staging data lingering (T5) | No cleanup infra yet; staging data is casino-scoped and access-controlled | Before production at scale (>100 imports) |
| Raw row PII retention | `raw_row` may contain extra vendor fields (tier, addresses, notes); redaction not implemented day 1 | **Defined deadline required before GA** — redaction policy must be specified before general availability |
| External ID matching bypass | Not matching on `external_id` via `player_identity` table | When `player_identity` is implemented (ADR-022) |
| Import batch audit log entries | Not writing to `audit_log` table during import | Before compliance requirement; actor_id tracking provides partial coverage |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| Email | Plaintext (lowercase) | Required for identifier matching and display; not highly sensitive |
| Phone | Plaintext (stripped) | Required for identifier matching; not highly sensitive |
| Names (first/last) | Plaintext | Required for player record creation; not highly sensitive |
| DOB | Plaintext (YYYY-MM-DD) | Required for player profile; date format only |
| raw_row | JSONB (nullable) | Original CSV data for debugging; redactable post-MVP |
| normalized_payload | JSONB | Canonical contract form; required for execute RPC |
| Loyalty tier/points | Not stored (in import schema) | Explicitly excluded; only present in `raw_row` if vendor includes them |

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `import_batch` | admin, pit_boss (same casino) | admin, pit_boss (actor-bound) | admin, pit_boss (same casino) | Denied |
| `import_row` | admin, pit_boss (via batch join) | admin, pit_boss (via batch join) | admin, pit_boss (via batch join) | Denied |

---

## Validation Gate

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] Sensitive fields have storage justification
- [x] RLS covers all CRUD operations
- [x] No plaintext storage of secrets
- [x] Loyalty data explicitly excluded from import schema (T9)
- [x] CSV injection protection on exports (T4)
