import type { FinancialValue } from '@/types/financial';

/**
 * Convert a dollar amount to canonical cents for a FinancialValue envelope.
 *
 * Semantics are pinned as `Math.round(dollars * 100)` per PRD-070 G6. The
 * behavior (including IEEE-754 boundary effects such as `1.005 * 100 ===
 * 100.49999999999999`) is the Wave-2 replication spec — downstream systems
 * that migrate to cents storage must produce byte-identical results.
 *
 * Use at every Phase 1.1 mapper boundary where dollar-valued rows still feed
 * a {@link FinancialValue} envelope. Do not re-implement per-service.
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}
