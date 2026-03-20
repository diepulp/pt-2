# SEC Note: Reward Instrument Fulfillment (Vector C)

**Feature:** Vector C — Pilot Print Standard
**Date:** 2026-03-19
**Author:** Agent
**Status:** Draft

---

## Assets (What Must Be Protected)

| Asset | Classification | Justification |
|-------|----------------|---------------|
| Player display name | PII | Printed on physical artifacts; name visible to custody recipients |
| Staff display name | Operational | "Issued by" attribution on printed artifacts |
| Reward face values (cents) | Financial | Monetary amounts printed on comp slips and coupons |
| Validation numbers (coupon) | Operational | Unique identifier for coupon redemption; printed prominently |
| Ledger reference IDs (comp slip) | Operational | Traceable reference for comp slip audit trail |
| Player tier information | Operational | Tier basis printed on entitlement coupons |

---

## Threats (What Could Go Wrong)

| Threat | Impact | Likelihood | Priority |
|--------|--------|------------|----------|
| T1: XSS via payload injection into print template | Med | Low | P2 |
| T2: Fraudulent artifact creation via browser dev tools | Med | Low | P3 |
| T3: Physical artifact left at printer / seen by unauthorized person | Low | Med | P3 |
| T4: Print history metadata tampering (future, GAP-C0) | Low | Low | P3 |

### Threat Details

**T1: XSS via payload injection into print template**
- **Description:** A malicious or corrupted payload string (e.g., `casino_name` containing `<script>`) is injected into the iframe HTML without escaping.
- **Attack vector:** Compromised server response or corrupted data in the database. The payload arrives from a trusted server RPC, but defense-in-depth requires escaping.
- **Impact:** Script execution in the iframe context. Limited blast radius (iframe is same-origin but isolated DOM). No credential access from print iframe.

**T2: Fraudulent artifact creation via browser dev tools**
- **Description:** Operator modifies payload values in browser dev tools to print a fraudulent comp slip or coupon with inflated amounts.
- **Attack vector:** Intercept `onFulfillmentReady` callback, modify payload, trigger print.
- **Impact:** Fraudulent physical artifact. Mitigated by: the artifact has no standalone authority — it must match the server-side issuance record (`loyalty_ledger` / `promo_coupon`). Custody recipients can verify against system records.

**T3: Physical artifact left at printer**
- **Description:** Printed artifact contains PII (player name) and financial data (face value). If left at a shared printer, unauthorized persons could see it.
- **Attack vector:** Operator prints and walks away. Standard operational risk for any printed document.
- **Impact:** Low — casino floor printers are in controlled areas. Standard operational procedure applies.

**T4: Print history metadata tampering (future)**
- **Description:** When GAP-C0 ships, `promo_coupon.metadata.print_history[]` could be tampered with to hide or forge print records.
- **Attack vector:** Direct metadata JSONB update bypassing application layer.
- **Impact:** Low for pilot. Print history is informational, not authoritative. The issuance record itself is the operational truth.

---

## Controls (How We Mitigate)

| Threat | Control | Implementation |
|--------|---------|----------------|
| T1 | HTML entity escaping | `escapeHtml()` utility applied to all payload strings before template injection |
| T1 | Iframe isolation | Print content rendered in hidden iframe — isolated DOM, no access to parent app state |
| T2 | Server-side record authority | Printed artifact is not authoritative — issuance records (`loyalty_ledger`, `promo_coupon`) are the source of truth |
| T2 | Existing issuance RBAC | Only authorized staff can trigger issuance RPCs (ADR-024 `set_rls_context_from_staff()`) |
| T3 | Operational procedure | Casino floor standard — no technical control needed for pilot |
| T4 | Append-only pattern (future) | `jsonb_set` append, not overwrite. SECURITY DEFINER RPC if metadata writes are elevated |

### Control Details

**C1: HTML Entity Escaping**
- **Type:** Preventive
- **Location:** Application (`lib/print/templates/`)
- **Enforcement:** Application — `escapeHtml()` utility encodes `<>&"'` in all string fields before HTML injection
- **Tested by:** Unit tests for template builders (escape coverage)

**C2: Iframe DOM Isolation**
- **Type:** Preventive
- **Location:** Application (`lib/print/iframe-print.ts`)
- **Enforcement:** Browser — iframe has isolated document context
- **Tested by:** Manual verification — iframe has no `<script>` tags, no event listeners to parent

---

## Deferred Risks (Explicitly Accepted for MVP)

| Risk | Reason for Deferral | Trigger to Address |
|------|---------------------|-------------------|
| Print history audit trail (GAP-C0/C3) | Core printing works without metadata column; audit is P2 | Before compliance audit of print records |
| Fraudulent artifact detection | Server records are authoritative; no automated reconciliation needed for pilot | If fraud reports increase post-launch |
| Print content encryption in transit | Iframe is same-origin, no network transit for print content | Never (same-origin, no transit) |

---

## Data Storage Justification

| Field | Storage Form | Justification |
|-------|--------------|---------------|
| Player name on print | Transient (iframe HTML, destroyed after print) | Not persisted by Vector C — exists only in iframe DOM during print dialog |
| Staff name on print | Transient | Same as above |
| Monetary amounts on print | Transient | Same as above |
| Validation number on print | Transient | Already persisted in `promo_coupon.validation_number` |
| Print history (future) | JSONB append in `promo_coupon.metadata` | Informational audit trail, not authoritative |

---

## RLS Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| N/A — no table reads or writes at print time | — | — | — | — |

**Note:** Vector C performs zero database operations for core printing. All data arrives pre-resolved in the `FulfillmentPayload`. Future print history logging (GAP-C0) will write to `promo_coupon.metadata` via existing SECURITY DEFINER patterns (ADR-024).

---

## Validation Gate

- [x] All assets classified
- [x] All threats have controls or explicit deferral
- [x] Sensitive fields have storage justification (all transient — no new persistence)
- [x] RLS covers all CRUD operations (N/A — no CRUD)
- [x] No plaintext storage of secrets (no secrets involved)
