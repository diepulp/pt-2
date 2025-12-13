-- ═══════════════════════════════════════════════════════════════════════════
-- PRD-004: Expand loyalty_reason enum with canonical reason codes
--
-- Reference: ADR-019 v2 (Loyalty Points Policy)
-- Reference: docs/20-architecture/specs/PRD-004/RPC-RLS-ROLE-ENFORCEMENT-PRD-004.md
-- Strategy: Additive (keep legacy values, add new values, prohibit legacy writes via RPC)
-- Status: Proposed
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SUMMARY:
-- ADR-019 v2 defines canonical reason codes for loyalty ledger entries with
-- clear semantic separation:
-- - base_accrual: Deterministic theo-based credit on slip close
-- - redeem: Comp issuance (debit)
-- - manual_reward: Service recovery / goodwill credit
-- - promotion: Campaign overlay credit
-- - adjustment: Admin correction (+/-)
-- - reversal: Reversal of prior entry
--
-- Legacy values ('mid_session', 'session_end', 'manual_adjustment', 'correction')
-- are KEPT for historical data but WRITE-PROHIBITED via RPC validation.
--
-- MIGRATION STRATEGY (ADR-019 P1: Strategy B - Additive):
-- - Keep existing enum values (no data migration needed)
-- - Add new enum values with IF NOT EXISTS (idempotent)
-- - RPC code validates new writes use canonical reasons only
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1: Add canonical enum values
-- ═══════════════════════════════════════════════════════════════════════════

-- NOTE: ALTER TYPE ... ADD VALUE is NOT transaction-safe in PostgreSQL.
-- Each ADD VALUE must commit before the next can run.
-- Use IF NOT EXISTS for idempotency.

DO $$
BEGIN
  -- Add 'base_accrual' (replaces 'session_end' for deterministic minting)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'base_accrual' AND enumtypid = 'loyalty_reason'::regtype) THEN
    ALTER TYPE loyalty_reason ADD VALUE 'base_accrual';
    RAISE NOTICE 'Added loyalty_reason value: base_accrual';
  ELSE
    RAISE NOTICE 'loyalty_reason value already exists: base_accrual';
  END IF;
END $$;

DO $$
BEGIN
  -- Add 'redeem' (comp issuance debit)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'redeem' AND enumtypid = 'loyalty_reason'::regtype) THEN
    ALTER TYPE loyalty_reason ADD VALUE 'redeem';
    RAISE NOTICE 'Added loyalty_reason value: redeem';
  ELSE
    RAISE NOTICE 'loyalty_reason value already exists: redeem';
  END IF;
END $$;

DO $$
BEGIN
  -- Add 'manual_reward' (service recovery credit - replaces 'manual_adjustment' for credits)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'manual_reward' AND enumtypid = 'loyalty_reason'::regtype) THEN
    ALTER TYPE loyalty_reason ADD VALUE 'manual_reward';
    RAISE NOTICE 'Added loyalty_reason value: manual_reward';
  ELSE
    RAISE NOTICE 'loyalty_reason value already exists: manual_reward';
  END IF;
END $$;

DO $$
BEGIN
  -- Add 'adjustment' (admin correction +/-; 'manual_adjustment' still exists for legacy)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'adjustment' AND enumtypid = 'loyalty_reason'::regtype) THEN
    ALTER TYPE loyalty_reason ADD VALUE 'adjustment';
    RAISE NOTICE 'Added loyalty_reason value: adjustment';
  ELSE
    RAISE NOTICE 'loyalty_reason value already exists: adjustment';
  END IF;
END $$;

DO $$
BEGIN
  -- Add 'reversal' (reversal of prior entry)
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'reversal' AND enumtypid = 'loyalty_reason'::regtype) THEN
    ALTER TYPE loyalty_reason ADD VALUE 'reversal';
    RAISE NOTICE 'Added loyalty_reason value: reversal';
  ELSE
    RAISE NOTICE 'loyalty_reason value already exists: reversal';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2: Documentation comments
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TYPE loyalty_reason IS
  'Loyalty ledger transaction reasons. Canonical values (ADR-019 v2): base_accrual, redeem, manual_reward, promotion, adjustment, reversal. Legacy values (write-prohibited): mid_session, session_end, manual_adjustment, correction.';

COMMENT ON COLUMN loyalty_ledger.reason IS
  'Transaction reason code. RPCs enforce canonical values only: base_accrual (slip close credit), redeem (comp debit), manual_reward (service recovery credit), promotion (campaign overlay), adjustment (admin correction), reversal (entry reversal). Legacy values readable but not writable.';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERIES (Run manually after migration)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. List all loyalty_reason enum values:
-- SELECT enum_range(NULL::loyalty_reason);
--
-- Expected output (in some order):
-- {mid_session, session_end, manual_adjustment, promotion, correction, base_accrual, redeem, manual_reward, adjustment, reversal}
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Count ledger entries by reason (check legacy vs canonical usage):
-- SELECT reason, count(*) as entry_count
-- FROM loyalty_ledger
-- GROUP BY reason
-- ORDER BY entry_count DESC;
--
-- Expected: Legacy values have counts; canonical values start at 0 (new writes only)
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Test enum constraint works:
-- SELECT 'base_accrual'::loyalty_reason;  -- Should succeed
-- SELECT 'invalid_value'::loyalty_reason; -- Should fail
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- APPENDIX: Reason Code Semantic Mapping
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Canonical Reason Codes (ADR-019 v2):
-- ┌─────────────────┬──────────┬────────────────────────────────────────────┐
-- │ Reason Code     │ Type     │ Description                                │
-- ├─────────────────┼──────────┼────────────────────────────────────────────┤
-- │ base_accrual    │ Credit   │ Deterministic theo-based credit on slip   │
-- │                 │ (+)      │ close. Formula: theo * conversion_rate.    │
-- │                 │          │ Triggered automatically, idempotent.       │
-- ├─────────────────┼──────────┼────────────────────────────────────────────┤
-- │ redeem          │ Debit    │ Comp issuance (meal, show, etc.).         │
-- │                 │ (-)      │ Requires staff_id, note. Overdraw gated.  │
-- ├─────────────────┼──────────┼────────────────────────────────────────────┤
-- │ manual_reward   │ Credit   │ Service recovery / goodwill credit.       │
-- │                 │ (+)      │ Requires staff_id, note. Pit boss/admin.  │
-- ├─────────────────┼──────────┼────────────────────────────────────────────┤
-- │ promotion       │ Credit   │ Campaign overlay (bonus points, etc.).    │
-- │                 │ (+)      │ Separate from base accrual. Post-MVP UI.  │
-- ├─────────────────┼──────────┼────────────────────────────────────────────┤
-- │ adjustment      │ +/-      │ Admin correction (fix errors).            │
-- │                 │          │ Requires admin role, note. Audit trail.   │
-- ├─────────────────┼──────────┼────────────────────────────────────────────┤
-- │ reversal        │ +/-      │ Reversal of prior entry. References       │
-- │                 │          │ original ledger_id in metadata.           │
-- └─────────────────┴──────────┴────────────────────────────────────────────┘
--
-- Legacy Reason Codes (DEPRECATED - Read-Only):
-- ┌──────────────────┬──────────┬───────────────────────────────────────────┐
-- │ Reason Code      │ Type     │ Notes                                     │
-- ├──────────────────┼──────────┼───────────────────────────────────────────┤
-- │ mid_session      │ Mixed    │ DEPRECATED. Conflated credits/debits.     │
-- │                  │          │ Replaced by: base_accrual or redeem.      │
-- ├──────────────────┼──────────┼───────────────────────────────────────────┤
-- │ session_end      │ Credit   │ DEPRECATED. Replaced by: base_accrual.    │
-- │                  │          │ Lacked deterministic policy enforcement.  │
-- ├──────────────────┼──────────┼───────────────────────────────────────────┤
-- │ manual_adjustment│ +/-      │ DEPRECATED. Replaced by:                  │
-- │                  │          │ - manual_reward (for credits)             │
-- │                  │          │ - adjustment (for corrections)            │
-- ├──────────────────┼──────────┼───────────────────────────────────────────┤
-- │ correction       │ +/-      │ DEPRECATED. Replaced by: adjustment or    │
-- │                  │          │ reversal (depending on use case).         │
-- └──────────────────┴──────────┴───────────────────────────────────────────┘
--
-- RPC Enforcement Pattern:
-- All new loyalty RPCs validate reason codes before INSERT:
--
-- -- Example from mint_base_accrual:
-- IF v_reason != 'base_accrual' THEN
--   RAISE EXCEPTION 'LOYALTY_INVALID_REASON: Base accrual must use reason=base_accrual (got %)', v_reason;
-- END IF;
--
-- -- Example from redeem_points:
-- v_reason := 'redeem';  -- Hardcoded (no parameter)
--
-- -- Example from manual_credit:
-- v_reason := 'manual_reward';  -- Hardcoded (no parameter)
--
-- ═══════════════════════════════════════════════════════════════════════════
