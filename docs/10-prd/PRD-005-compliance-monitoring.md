# PRD-005 — Compliance Monitoring (MTL Read-Only)

## 1. Overview
- **Owner:** Product
- **Status:** Draft
- **Summary:** Provide compliance staff with real-time visibility into cash transaction thresholds (CTR $10k, Watchlist $3k) and transaction history. This is read-only monitoring for MVP—no automated filings or watchlist writes. Enables proactive compliance awareness without blocking casino operations.

## 2. Problem & Goals

### 2.1 Problem
Compliance officers lack real-time visibility into player cash transactions relative to regulatory thresholds. They discover threshold breaches after the fact, scrambling to reconstruct context for CTR filings. The 15-day FinCEN filing deadline creates pressure that reactive monitoring can't address.

### 2.2 Goals
- Compliance staff can view MTL entries for their casino
- Threshold proximity badges show distance to $3k watchlist and $10k CTR
- Gaming day aggregates visible per player (sum of transactions)
- Transaction context preserved (staff, direction, timestamp, amount)
- Audit notes can be appended to entries for compliance review

### 2.3 Non-Goals
- Automated CTR filing or FinCEN export generation
- Automated watchlist writes or SAR triggers
- Real-time alerts or push notifications
- Financial transaction entry (see Finance PRD)
- Player blocking or transaction holds

## 3. Users & Use Cases
- **Primary users:** Compliance Analyst (read-only role)

**Top Jobs:**
- As a Compliance Analyst, I need to see today's MTL entries so I can monitor threshold proximity.
- As a Compliance Analyst, I need to see a player's gaming day aggregate so I know if they're approaching CTR.
- As a Compliance Analyst, I need to add audit notes so my review is documented.
- As a Compliance Analyst, I need to filter by threshold status so I can prioritize reviews.

## 4. Scope & Feature List

**MTL Entry Display:**
- List MTL entries filtered by casino and date range
- Show: player name, amount, direction (in/out), staff, timestamp, gaming day
- Show threshold proximity badge per entry

**Threshold Monitoring:**
- Watchlist floor: $3,000 (single transaction monitoring)
- CTR threshold: $10,000 (gaming day aggregate)
- Visual badges: "Clear", "Approaching $3k", "Watchlist Exceeded", "Approaching $10k", "CTR Required"
- Gaming day aggregate calculation per player

**Audit Notes:**
- Append notes to MTL entries (compliance review documentation)
- Notes are append-only (no edit/delete)
- Show note history with author and timestamp

**Filtering:**
- By date range (gaming day)
- By threshold status (clear, watchlist, CTR)
- By player name

## 5. Requirements

### 5.1 Functional Requirements
- MTL entries created by Finance transactions (not this PRD's scope)
- Gaming day derived via `compute_gaming_day` trigger (same as Finance)
- Aggregate calculation: `SUM(amount) WHERE gaming_day = X AND player_id = Y`
- Audit notes linked to `mtl_entry` via `mtl_audit_note` table
- Thresholds read from `casino_settings` (configurable per casino)

### 5.2 Non-Functional Requirements
- MTL list loads within 2s for 1000 entries
- Aggregate calculation cached or materialized for performance
- Threshold values from VIS-001: $3k watchlist, $10k CTR (per 31 USC 5313)

> Architecture details: see `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md` (MTLService section)

## 6. UX / Flow Overview
1. Compliance Analyst opens MTL dashboard → sees today's entries
2. Entries show color-coded threshold badges
3. Analyst filters to "Approaching CTR" → sees prioritized list
4. Selects entry → sees full context and gaming day aggregate for player
5. Adds audit note documenting review → note saved with timestamp

## 7. Dependencies & Risks

### 7.1 Dependencies
- PlayerFinancialService: Creates MTL entries from financial transactions
- CasinoService: `casino_settings` for threshold values and gaming day calc
- PlayerService: Player identity for display
- Schema: `mtl_entry`, `mtl_audit_note` tables exist

### 7.2 Risks & Open Questions
- **Risk:** Performance on aggregate queries — Mitigate with materialized view or denormalized field
- **Risk:** Threshold config drift between casinos — All casinos use federal defaults for MVP
- **Open:** Should approaching threshold trigger in-app notification? — Recommend: Defer to Phase 2

## 8. Definition of Done (DoD)

The release is considered **Done** when:

**Functionality**
- [ ] Compliance staff can view MTL entries for their casino
- [ ] Threshold proximity badges display correctly
- [ ] Gaming day aggregates calculate correctly
- [ ] Audit notes can be appended and viewed

**Data & Integrity**
- [ ] MTL entries are immutable (no updates to amount/direction)
- [ ] Audit notes are append-only
- [ ] Gaming day derivation matches Finance (same trigger)

**Security & Access**
- [ ] RLS: Compliance role can only read own casino's MTL data
- [ ] RLS: Only compliance/admin can append audit notes
- [ ] No write access to MTL entries (Finance creates them)

**Testing**
- [ ] Unit test: threshold badge logic for all states
- [ ] Unit test: gaming day aggregate calculation
- [ ] Integration test: audit note append with RLS
- [ ] One E2E test: filter by threshold → view entry → add note

**Operational Readiness**
- [ ] Structured logs for audit note creation
- [ ] Query performance acceptable for 1000+ entries

**Documentation**
- [ ] Threshold values and regulatory basis documented
- [ ] Audit note workflow documented

## 9. Related Documents
- Vision / Strategy: `docs/00-vision/VIS-001-VISION-AND-SCOPE.md`
- Architecture / SRM: `docs/20-architecture/SERVICE_RESPONSIBILITY_MATRIX.md`
- Schema / Types: `types/database.types.ts`
- QA Standards: `docs/40-quality/QA-001-service-testing-strategy.md`
- Service README: `services/mtl/README.md`
- Regulatory: 31 USC 5313 (CTR requirements)
- Depends on: Finance PRD (creates MTL entries)
