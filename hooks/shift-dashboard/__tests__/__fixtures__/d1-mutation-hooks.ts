/**
 * Day-1 Mutation-Hook Inventory — FACT-RATED-BUYIN × shift-dashboard
 *
 * Scope (per PRD-068 W3 / ADR-050 §4 E1 fact×surface compliance):
 *   The fact is FACT-RATED-BUYIN (rated buy-ins and their adjustments,
 *   authoritative table D1 = `player_financial_transaction`).
 *   The surface is the shift-dashboard (consumer hooks/shift-dashboard/*).
 *
 *   This fixture enumerates the mutation hooks that touch D1 or adjacent
 *   tables whose writes REACH this surface's cache — either directly
 *   (mutation hook invokes `shiftDashboardKeys.*` invalidation) or
 *   indirectly (mutation hook writes to a D1 path that ultimately arrives
 *   at the shift-dashboard via WAL on `table_buyin_telemetry` through
 *   `trg_bridge_finance_to_telemetry`).
 *
 * Discovery protocol (W3 P0-R3-2 guidance):
 *   Two-stage discovery:
 *     (1) grep `createFinancialTransaction|createFinancialAdjustment|
 *         rpc_create_financial_(txn|adjustment)` in hooks/ — catches direct
 *         RPC callers AND service-wrapper callers.
 *     (2) Include `hooks/mtl/use-mtl-mutations.ts:useCreateMtlEntry` as
 *         trigger-indirect via `trg_bridge_mtl_to_finance`.
 *
 * Phase-2 re-run guidance:
 *   Future slices in Phase 2 MUST re-run the discovery script and compare
 *   against this fixture. If the set grows beyond 3 hooks beyond what is
 *   listed here, escalate (escape-valve threshold: >3 new hooks triggers
 *   a contract-amendment review).
 *
 * @see PRD-068 / EXEC-068 W3
 * @see ADR-050 §4 E1 Registered Factory Rule
 * @see checkpoint PRD-068.json:ground_truth_findings.in_scope_mutation_hooks
 */

/**
 * Characterizes the path by which a mutation hook's write reaches the
 * shift-dashboard surface.
 */
export type D1WriteMechanism =
  /** Hook directly calls an RPC that writes to `player_financial_transaction`. */
  | 'direct_rpc'
  /** Hook wraps a service method which internally issues the D1 write. */
  | 'service_wrapper'
  /** Hook writes to a different table; a trigger forwards into D1. */
  | 'trigger_indirect';

export interface MutationHookEntry {
  /** Repo-relative path to the hook file. */
  hook_path: string;
  /** Exported React hook name. */
  hook_export_name: string;
  /** How this hook's write reaches `player_financial_transaction`. */
  d1_write_mechanism: D1WriteMechanism;
  /**
   * Whether this hook CURRENTLY issues `queryClient.invalidateQueries`
   * on any `shiftDashboardKeys.*` scope. If false, the shift-dashboard
   * learns about the write via WAL (per ADR-050 §4 E3), not via
   * mutation-side invalidation.
   */
  invalidates_shift_dashboard_keys_today: boolean;
  /** Why this hook is in-scope for the FACT-RATED-BUYIN × shift-dashboard pair. */
  rationale: string;
}

/**
 * Day-1 inventory. Verified against the repo as of PRD-068 build
 * (ref/adr-050 @ 2026-04-20). Phase-2 authors MUST re-verify.
 */
export const D1_MUTATION_HOOKS: ReadonlyArray<MutationHookEntry> = [
  {
    hook_path: 'hooks/player-financial/use-financial-mutations.ts',
    hook_export_name: 'useCreateFinancialAdjustment',
    d1_write_mechanism: 'direct_rpc',
    invalidates_shift_dashboard_keys_today: true,
    rationale:
      'Primary target. Invokes createFinancialAdjustment() which calls rpc_create_financial_adjustment; onSuccess explicitly invalidates shiftDashboardKeys.summary.scope + shiftDashboardKeys.allMetrics(). This is the canonical mutation-side invalidation that DEC-DD1 debounce coordinates with.',
  },
  {
    hook_path: 'hooks/player-financial/use-financial-mutations.ts',
    hook_export_name: 'useCreateFinancialTransaction',
    d1_write_mechanism: 'direct_rpc',
    invalidates_shift_dashboard_keys_today: false,
    rationale:
      'Creates base rated buy-in via rpc_create_financial_txn. Writes to D1, triggers trg_bridge_finance_to_telemetry which populates table_buyin_telemetry. Surface learns via WAL; no mutation-side shift-dashboard invalidation today. Included so E1 compliance test verifies the WAL path is the sole invalidation mechanism for this hook.',
  },
  {
    hook_path: 'hooks/rating-slip-modal/use-save-with-buyin.ts',
    hook_export_name: 'useSaveWithBuyin',
    d1_write_mechanism: 'service_wrapper',
    invalidates_shift_dashboard_keys_today: false,
    rationale:
      'Rating-slip-modal save flow; service wrapper invokes the PFT create-txn path when buy-in is present. Writes to D1 via the wrapped service; shift-dashboard learns via WAL only. Included so Phase-2 authors remember service-wrapper callers are in-scope even though they do not name the RPC directly.',
  },
  {
    hook_path: 'hooks/rating-slip-modal/use-close-with-financial.ts',
    hook_export_name: 'useCloseWithFinancial',
    d1_write_mechanism: 'service_wrapper',
    invalidates_shift_dashboard_keys_today: false,
    rationale:
      'Rating-slip close flow with optional cashout; same service-wrapper pattern as save-with-buyin. D1 write happens inside the service; WAL is the only shift-dashboard-reaching invalidation path today.',
  },
  {
    hook_path: 'hooks/cashier/use-patron-transactions.ts',
    hook_export_name: 'useCreatePatronTransaction',
    d1_write_mechanism: 'service_wrapper',
    invalidates_shift_dashboard_keys_today: false,
    rationale:
      'Cashier cage transaction; writes to D1 via PlayerFinancialService wrapper. Surface learns via WAL. Included for completeness — any D1-reaching path must be covered.',
  },
  {
    hook_path: 'hooks/mtl/use-mtl-mutations.ts',
    hook_export_name: 'useCreateMtlEntry',
    d1_write_mechanism: 'trigger_indirect',
    invalidates_shift_dashboard_keys_today: false,
    rationale:
      'MTL entry creation; writes to mtl_entry, not D1 directly. trg_bridge_mtl_to_finance forwards into PFT which in turn fires trg_bridge_finance_to_telemetry, reaching the shift-dashboard via WAL. Included to document the trigger-indirect path — Phase 2 authors must not assume only direct/wrapper paths exist.',
  },
] as const;

/**
 * Escape-valve: Phase-2 authors should escalate if rediscovery produces
 * more than this many entries absent from the Day-1 inventory. A larger
 * delta suggests the fact or its bridge triggers changed shape; simple
 * replication may no longer be safe.
 */
export const ESCAPE_VALVE_NEW_HOOK_THRESHOLD = 3;
