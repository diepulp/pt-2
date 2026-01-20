/**
 * MTL Transaction Type Codes
 *
 * Transaction type codes from the official Affinity Gaming MTL paper form.
 * Maps numeric codes (1-12) to direction, MTL transaction type, and label.
 *
 * @see EXECUTION-SPEC-PRD-MTL-UI-GAPS.md WS6
 * @see docs/00-vision/mtl-service-evolution/MTL-FORM.png
 */

import type { MtlTxnType, MtlDirection } from '@/services/mtl/dtos';

// ============================================================================
// Types
// ============================================================================

/**
 * Transaction type code definition
 */
export interface MtlTxnTypeCode {
  /** Numeric code from paper form (1-12) */
  code: number;
  /** Human-readable label */
  label: string;
  /** MTL direction: 'in' (cash-in) or 'out' (cash-out) */
  direction: MtlDirection;
  /** MTL transaction type for database */
  mtlType: MtlTxnType;
  /** Category group for display */
  category: 'cash_in' | 'cash_out';
}

// ============================================================================
// Transaction Type Codes
// ============================================================================

/**
 * MTL Transaction Type Codes per official form legend
 *
 * Cash-In Codes (1-5): Money coming in from patron
 * Cash-Out Codes (6-12): Money going out to patron
 */
export const MTL_TXN_TYPE_CODES: Record<number, MtlTxnTypeCode> = {
  // Cash-In (direction: 'in')
  1: {
    code: 1,
    label: 'Purchase of Chips/Tokens',
    direction: 'in',
    mtlType: 'buy_in',
    category: 'cash_in',
  },
  2: {
    code: 2,
    label: 'Front Money Deposit',
    direction: 'in',
    mtlType: 'front_money',
    category: 'cash_in',
  },
  3: {
    code: 3,
    label: 'Safekeeping Deposit',
    direction: 'in',
    mtlType: 'front_money',
    category: 'cash_in',
  },
  4: {
    code: 4,
    label: 'Marker Payment',
    direction: 'in',
    mtlType: 'marker',
    category: 'cash_in',
  },
  5: {
    code: 5,
    label: 'Currency Exchange',
    direction: 'in',
    mtlType: 'chip_fill',
    category: 'cash_in',
  },

  // Cash-Out (direction: 'out')
  6: {
    code: 6,
    label: 'Redemption of Chips/Tokens/Tickets',
    direction: 'out',
    mtlType: 'cash_out',
    category: 'cash_out',
  },
  7: {
    code: 7,
    label: 'Front Money Withdrawal',
    direction: 'out',
    mtlType: 'front_money',
    category: 'cash_out',
  },
  8: {
    code: 8,
    label: 'Safekeeping Withdrawal',
    direction: 'out',
    mtlType: 'front_money',
    category: 'cash_out',
  },
  9: {
    code: 9,
    label: 'Marker Issuance',
    direction: 'out',
    mtlType: 'marker',
    category: 'cash_out',
  },
  10: {
    code: 10,
    label: 'Cash from Wire Transfer',
    direction: 'out',
    mtlType: 'cash_out',
    category: 'cash_out',
  },
  11: {
    code: 11,
    label: 'Currency Exchange',
    direction: 'out',
    mtlType: 'chip_fill',
    category: 'cash_out',
  },
  12: {
    code: 12,
    label: 'Jackpot/Tournament Payout',
    direction: 'out',
    mtlType: 'cash_out',
    category: 'cash_out',
  },
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get all transaction type codes as an array
 */
export function getAllTxnTypeCodes(): MtlTxnTypeCode[] {
  return Object.values(MTL_TXN_TYPE_CODES);
}

/**
 * Get cash-in transaction type codes (1-5)
 */
export function getCashInCodes(): MtlTxnTypeCode[] {
  return getAllTxnTypeCodes().filter((c) => c.category === 'cash_in');
}

/**
 * Get cash-out transaction type codes (6-12)
 */
export function getCashOutCodes(): MtlTxnTypeCode[] {
  return getAllTxnTypeCodes().filter((c) => c.category === 'cash_out');
}

/**
 * Get transaction type code by numeric code
 */
export function getTxnTypeByCode(code: number): MtlTxnTypeCode | undefined {
  return MTL_TXN_TYPE_CODES[code];
}

/**
 * Format transaction type code for display
 * e.g., "1. Purchase of Chips/Tokens"
 */
export function formatTxnTypeCode(code: MtlTxnTypeCode): string {
  return `${code.code}. ${code.label}`;
}

// ============================================================================
// Simplified Transaction Types for UI
// ============================================================================

/**
 * Simplified transaction types for pit floor UX.
 * Maps to official codes: chip_purchase → code 1, chip_redemption → code 6.
 * All 12 official codes are retained above for future regulatory/audit needs.
 */
export const DISPLAYED_TRANSACTION_TYPES = [
  {
    value: 'chip_purchase' as const,
    label: 'Chip Purchase (Buy-In)',
    direction: 'in' as MtlDirection,
    mtlType: 'buy_in' as MtlTxnType,
    mappedCode: 1, // Maps to MTL paper form code 1
  },
  {
    value: 'chip_redemption' as const,
    label: 'Chip Redemption (Cash-Out)',
    direction: 'out' as MtlDirection,
    mtlType: 'cash_out' as MtlTxnType,
    mappedCode: 6, // Maps to MTL paper form code 6
  },
] as const;

export type DisplayedTransactionType =
  (typeof DISPLAYED_TRANSACTION_TYPES)[number]['value'];

/**
 * Get transaction types displayed in the UI (simplified 2-type UX).
 * All 12 official codes are retained in MTL_TXN_TYPE_CODES for future use.
 */
export function getDisplayedTypes() {
  return DISPLAYED_TRANSACTION_TYPES;
}
