# Feature Boundary Statement: Loyalty & Tier Reconciliation

> **Ownership Sentence:** This feature belongs to **LoyaltyService** and may only touch **player_loyalty, loyalty_reconciliation (new table)**; cross-context needs go through **PlayerImportService staging DTOs** for import data reads and **CasinoService audit_log** for audit trail writes.

---

## Feature Boundary Statement

- **Owner service(s):**
  - **LoyaltyService** — canonical tier posture, reconciliation state tracking, policy enforcement

- **Writes:**
  - `player_loyalty` (update canonical tier when reconciliation is applied/reverted)
  - `loyalty_reconciliation` (NEW — reconciliation state: pending/applied/reverted, policy snapshot, before/after values)
  - `audit_log` (via CasinoService contract — apply/revert audit entries)

- **Reads:**
  - `import_row` (via PlayerImportService DTOs — staged loyalty fields: imported_tier, imported_points_balance, imported_last_activity_at)
  - `import_batch` (via PlayerImportService DTOs — batch provenance: file name, import timestamp, actor)
  - `player_loyalty` (canonical tier/points posture)
  - `player` (via PlayerService DTOs — identity summary for diff view)
  - `player_casino` (via CasinoService DTOs — enrollment status)

- **Cross-context contracts:**
  - `ImportRowDTO` (PlayerImportService) — staged loyalty field access
  - `ImportBatchDTO` (PlayerImportService) — batch provenance metadata
  - `PlayerDTO` (PlayerService) — player identity for diff view
  - `CasinoService.audit_log` — audit entry write contract
  - `CasinoSettings.gaming_day_start_time` — temporal authority (if freshness calculations needed)

- **Non-goals (top 5):**
  1. Full loyalty ledger migration (every historical transaction/point event)
  2. Automatic reconciliation without admin review (MVP requires explicit apply)
  3. Imported points balance direct-write to loyalty_ledger (points are staged-only in MVP)
  4. Fuzzy identity matching (handled by PlayerImportService during CSV import)
  5. Entitlement/comp recalculation as a result of tier change (separate feature)

- **DoD gates:** Functional / Security / Integrity / Operability (see DOD-LTR)

---

## Goal

Enable casino admins to safely reconcile imported (legacy) tier attributes with PT-2's canonical loyalty model, preserving tier posture without silently altering entitlements.

## Primary Actor

**Admin / Ops Manager** (authorized to validate and apply tier reconciliation)

## Primary Scenario

Admin opens the "Reconcile Loyalty" queue post-import, reviews staged tier vs. canonical tier for each player, selects reconciliation policy (default: upgrade-only), applies reconciliation, and the system updates canonical tier with full audit trail and rollback capability.

## Success Metric

100% of imported loyalty attributes are reconciled (applied or explicitly skipped) with audit trail, zero silent tier changes, and all applied reconciliations are reversible.

---

## Document Structure

| Document | Purpose | Location |
|----------|---------|----------|
| **FEATURE_BOUNDARY** | Scope definition (this file) | `docs/20-architecture/specs/loyalty-tier-reconciliation/FEATURE_BOUNDARY.md` |
| **SCAFFOLD** | Options analysis with tradeoffs | `docs/01-scaffolds/SCAFFOLD-loyalty-tier-reconciliation.md` (Phase 1) |
| **RFC** | Design brief / architectural direction | `docs/02-design/RFC-loyalty-tier-reconciliation.md` (Phase 2) |
| **SEC_NOTE** | Security threat model | `docs/20-architecture/specs/loyalty-tier-reconciliation/SEC_NOTE.md` (Phase 3) |
| **ADR** | Durable architectural decisions (frozen) | `docs/80-adrs/ADR-XXX-loyalty-tier-reconciliation.md` (Phase 4) |
| **PRD** | Testable acceptance criteria | `docs/10-prd/PRD-XXX-loyalty-tier-reconciliation.md` (Phase 5) |

---

**Gate:** If you can't write the ownership sentence, you're not ready to design.
