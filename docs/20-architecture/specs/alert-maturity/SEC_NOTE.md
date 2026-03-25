# SEC Note: Alert Maturity (C-2/C-3)

**Feature:** PRD-056
**Date:** 2026-03-24
**Author:** Lead Architect
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Alert state (shift_alert) | Operational | Business decision record — which anomalies detected and when |
| Acknowledgment audit trail | Audit | Non-repudiation — who dismissed an alert, when, with what rationale |
| Alert severity & deviation data | Operational | Operational intelligence — incorrect severity could cause under/over-reaction |
| Cooldown configuration | Operational | Misconfiguration could suppress real alerts or flood operators |
| Computation error state (last_error) | Operational | Exposes internal error details — should be staff-visible only |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: Cross-casino alert leakage | High | Medium | P1 |
| T2: Unauthorized alert acknowledgment | Medium | Medium | P1 |
| T3: Acknowledgment audit spoofing | Medium | Low | P2 |
| T4: Alert state manipulation (backward transition) | Medium | Low | P2 |
| T5: Cooldown bypass (persist with zero cooldown) | Low | Low | P3 |
| T6: Alert deletion (destroy audit trail) | High | Low | P1 |
| T7: Duplicate or racing acknowledgment | Low | Medium | P2 |

### Threat Details

**T1: Cross-casino alert leakage**
- **Description:** Staff from Casino A views or acknowledges alerts belonging to Casino B
- **Attack vector:** Manipulate casino_id in request or bypass RLS
- **Impact:** Operational intelligence leak across tenants

**T2: Unauthorized alert acknowledgment**
- **Description:** Dealer or cashier acknowledges an anomaly alert they shouldn't have authority over
- **Attack vector:** Direct RPC call bypassing UI role check
- **Impact:** Alerts dismissed without appropriate authority; operational risk

**T3: Acknowledgment audit spoofing**
- **Description:** Staff forges `acknowledged_by` to attribute acknowledgment to another employee
- **Attack vector:** Pass different staff_id in RPC payload
- **Impact:** Audit trail corruption, non-repudiation failure

**T4: Alert state manipulation**
- **Description:** Alert transitioned backward (acknowledged → open) to hide dismissal
- **Attack vector:** Direct UPDATE on shift_alert.status
- **Impact:** Audit trail integrity compromised

**T6: Alert deletion**
- **Description:** Alert rows deleted to remove evidence of detected anomalies
- **Attack vector:** Direct DELETE on shift_alert or alert_acknowledgment
- **Impact:** Operational audit trail destroyed

**T7: Duplicate or racing acknowledgment**
- **Description:** Two operators attempt to acknowledge the same alert concurrently
- **Attack vector:** Concurrent RPC calls against the same `shift_alert` row
- **Impact:** Duplicate acknowledgment records or inconsistent transition semantics

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | C1: Tenant isolation across tables and RPCs | Pattern C hybrid on direct-read tables **plus manual `casino_id` binding inside every SECURITY DEFINER RPC** |
| T2 | C2: Role gate in RPC | `set_rls_context_from_staff()` + `v_role IN ('pit_boss','admin')` check |
| T3 | C3: Actor binding | `acknowledged_by` derived from `app.actor_id`, not parameter |
| T4 | C4: RPC-enforced state machine | CHECK validates legal status values only; forward-only transitions enforced in RPC body |
| T5 | C5: Server-side cooldown | Cooldown evaluated in RPC, not client-supplied |
| T6 | C6: DELETE denial + no direct mutation grants | DELETE denied and direct table deletes unavailable to non-owner roles |
| T7 | C7: Grant posture for RPC-only mutations | Direct table writes revoked; approved RPCs only; `REVOKE EXECUTE FROM PUBLIC` on new RPCs |

### Control Details

**C1: Tenant Isolation**
- **Type:** Preventive
- **Location:** RLS policies on direct-read tables + `SECURITY DEFINER` RPC bodies
- **Enforcement:** Database
- **Implementation:**
  - Direct table read posture uses Pattern C hybrid scoping on `casino_id`
  - Every `SECURITY DEFINER` RPC derives `v_casino_id` from authoritative context
  - Every read/write in the RPC is explicitly bound to the derived tenant scope (for example `WHERE casino_id = v_casino_id`)
- **Note:** RLS alone is not sufficient inside DEFINER code paths; manual tenant binding is required there
- **Tested by:** Integration test — two-casino isolation across both direct read and RPC mutation paths

**C2: Role Gate**
- **Type:** Preventive
- **Location:** `rpc_acknowledge_alert` body
- **Enforcement:** Database (SECURITY DEFINER RPC)
- **Implementation:** `set_rls_context_from_staff()` returns role; RPC raises exception if role not in `('pit_boss','admin')`
- **Tested by:** Route handler test — role gate denial

**C3: Actor Binding (ADR-024 INV-8)**
- **Type:** Preventive
- **Location:** `rpc_acknowledge_alert` body
- **Enforcement:** Database
- **Implementation:** `acknowledged_by := current_setting('app.actor_id')::uuid` — no `p_staff_id` parameter
- **Tested by:** Integration test — actor attribution

**C4: State Machine Enforcement**
- **Type:** Preventive
- **Location:** `shift_alert.status` constraint + RPC transition logic
- **Enforcement:** Database
- **Implementation:**
  - CHECK/enum restricts `status` to legal values only
  - Forward-only transitions (`open -> acknowledged -> resolved`) are enforced inside approved RPCs
  - Direct table mutation is not available to ordinary application roles
- **Note:** CHECK does **not** enforce transition order; the RPC body does
- **Tested by:** Integration test — backward transition rejected; direct mutation attempt rejected

**C6: DELETE Denial + No Direct Mutation Grants**
- **Type:** Preventive
- **Location:** RLS DELETE policies + table grants
- **Enforcement:** Database
- **Implementation:** `CREATE POLICY deny_delete ON {table} FOR DELETE USING (false)`. Direct table deletes unavailable to non-owner roles.
- **Tested by:** Integration test — delete attempt rejected

**C7: Grant Posture / RPC-Only Mutation Surface**
- **Type:** Preventive
- **Location:** Table grants + function grants
- **Enforcement:** Database
- **Implementation:**
  - Revoke direct `INSERT`, `UPDATE`, and `DELETE` on `shift_alert` and `alert_acknowledgment` from non-owner roles
  - `REVOKE EXECUTE FROM PUBLIC` on `rpc_acknowledge_alert()` and `rpc_persist_anomaly_alerts()`
  - Grant execute only to intended roles
  - Expose mutations only through approved RPC entrypoints
- **Tested by:** Integration test — direct table write denied; unauthorized RPC execute denied

**C7-a: Atomic Acknowledgment (T7 mitigation)**
- **Type:** Preventive
- **Location:** `rpc_acknowledge_alert` body
- **Enforcement:** Database
- **Implementation:**
  - Acknowledge transition must be atomic: `UPDATE shift_alert SET status = 'acknowledged' WHERE id = p_alert_id AND status = 'open'`
  - Acknowledgment record is written only after a successful transition (zero rows updated = no-op, not error)
  - `alert_acknowledgment` remains append-only
- **Tested by:** Integration test — concurrent acknowledgment produces one transition + one audit record

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Alert data retention / archival | Volume is low at pilot scale (~6K rows/month) | When alert volume exceeds 100K rows or query performance degrades |
| `last_error` content sanitization | Error text may contain internal details; acceptable for staff-only visibility | Before any customer-facing error display |
| Resolve transition automation | Auto-resolve on next gaming day is a nice-to-have | When operators request bulk resolution workflow |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| alert severity/deviation | Plaintext numeric | Operational metric, not sensitive |
| acknowledgment notes | Plaintext text | Operator-authored, no PII expected |
| last_error | Plaintext text (truncated 500 chars) | Internal diagnostic, staff-visible only |
| acknowledged_by (staff UUID) | Plaintext FK | Required for audit attribution; staff_id is not PII |

### `last_error` Access Posture

- `last_error` is an internal operational diagnostic field on `table_metric_baseline`
- It is staff-visible only through approved operational/admin read paths
- It must not be exposed on any customer-facing or public surface
- If UI display is added, prefer operator-safe messaging or controlled truncation rather than raw stack-like internals
- Sanitization may remain deferred for pilot, but exposure scope must still be explicitly constrained now

---

## Access / Mutation Summary

| Surface | Read posture | Mutation posture | Delete posture |
|--------|--------------|------------------|----------------|
| `shift_alert` | Pattern C / casino-scoped read access for approved roles | No direct table mutation for ordinary roles; mutations only via approved DEFINER RPCs with derived actor/tenant context | Denied |
| `alert_acknowledgment` | Pattern C / casino-scoped read access for approved roles | Append-only via approved DEFINER RPCs only | Denied |
| `table_metric_baseline.last_error` | Staff-visible only through approved operational/admin read paths | Written only by baseline compute/update path | Denied or unchanged per baseline-table posture |

**Clarification:** "RPC only" is not an RLS property by itself. It is the combined effect of **grant posture**, **approved RPC surface**, and **manual tenant/actor binding inside DEFINER functions**.

---

## Validation Gate

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] Sensitive fields have storage justification
- [x] Table grants, RLS posture, and DEFINER-body checks collectively cover all read/mutation paths
- [x] No plaintext storage of secrets
- [x] Actor binding prevents audit spoofing (ADR-024 INV-8)
- [x] DELETE denied on both tables (audit immutability)
- [x] Role gate enforced in database, not just UI
- [x] Tenant scope is derived, not caller-supplied
- [x] Direct mutation surface is revoked in favor of approved RPC entrypoints
