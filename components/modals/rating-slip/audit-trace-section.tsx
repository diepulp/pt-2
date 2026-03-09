'use client';

/**
 * AuditTraceSection — Collapsible audit event chain for rating slip modal.
 *
 * Displays the slip → PFT → MTL → loyalty chain for closed slips.
 * Collapsed by default; lazy-fetches on expand.
 *
 * Isolation Guarantees:
 * - NO form state — does not touch Zustand store
 * - NO useTransition — read-only, no mutations
 * - NO dirty tracking interaction
 * - CSS-only collapsible animation — no layout shift when collapsed
 *
 * Surface Classification (ADR-041):
 * - Rendering: Client Shell (modal is fully client-rendered)
 * - Data Aggregation: Simple Query (single view filtered by rating_slip_id)
 * - Metric Provenance: MEAS-002 (Compliance-Interpreted, Request-time freshness)
 *
 * @see PRD-049 WS2 — Slip Detail Audit Trace Panel
 */

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditEventCorrelation } from '@/hooks/measurement/use-audit-event-correlation';
import { cn } from '@/lib/utils';
import type { Database } from '@/types/database.types';

type AuditCorrelationRow =
  Database['public']['Views']['measurement_audit_event_correlation_v']['Row'];

// === Types ===

interface AuditTraceSectionProps {
  slipId: string;
  casinoId: string;
  slipStatus: string;
}

type EventType = 'slip' | 'pft' | 'mtl' | 'loyalty';

interface ChainNode {
  type: EventType;
  label: string;
  timestamp: string | null;
  detail: string;
  present: boolean;
}

// === Event type config ===

const EVENT_CONFIG: Record<EventType, { color: string; dotColor: string }> = {
  slip: { color: 'text-foreground', dotColor: 'bg-foreground' },
  pft: { color: 'text-blue-400', dotColor: 'bg-blue-400' },
  mtl: { color: 'text-amber-400', dotColor: 'bg-amber-400' },
  loyalty: { color: 'text-emerald-400', dotColor: 'bg-emerald-400' },
};

// === Chain builder ===

function buildChainNodes(rows: AuditCorrelationRow[]): ChainNode[] {
  if (rows.length === 0) return [];

  // Use first row for slip-level data (all rows share same slip)
  const first = rows[0];

  // Deduplicate PFTs, MTLs, Loyalty entries by their IDs
  const pftIds = new Set<string>();
  const mtlIds = new Set<string>();
  const loyaltyIds = new Set<string>();

  for (const row of rows) {
    if (row.pft_id) pftIds.add(row.pft_id);
    if (row.mtl_entry_id) mtlIds.add(row.mtl_entry_id);
    if (row.loyalty_ledger_id) loyaltyIds.add(row.loyalty_ledger_id);
  }

  // Find representative rows for detail display
  const firstPft = rows.find((r) => r.pft_id !== null);
  const firstMtl = rows.find((r) => r.mtl_entry_id !== null);
  const firstLoyalty = rows.find((r) => r.loyalty_ledger_id !== null);

  const nodes: ChainNode[] = [
    {
      type: 'slip',
      label: 'Slip Closed',
      timestamp: first.end_time,
      detail: first.slip_status ?? 'closed',
      present: true,
    },
    {
      type: 'pft',
      label:
        pftIds.size > 0
          ? `Financial Transaction${pftIds.size > 1 ? `s (${pftIds.size})` : ''}`
          : 'Financial Transaction',
      timestamp: firstPft?.pft_created_at ?? null,
      detail: firstPft
        ? `${firstPft.pft_direction ?? ''} ${firstPft.pft_txn_kind ?? ''}`.trim()
        : '',
      present: pftIds.size > 0,
    },
    {
      type: 'mtl',
      label:
        mtlIds.size > 0
          ? `MTL Entr${mtlIds.size > 1 ? `ies (${mtlIds.size})` : 'y'}`
          : 'MTL Entry',
      timestamp: firstMtl?.mtl_occurred_at ?? null,
      detail: firstMtl
        ? `${firstMtl.mtl_txn_type ?? ''} ${firstMtl.mtl_direction ?? ''}`.trim()
        : '',
      present: mtlIds.size > 0,
    },
    {
      type: 'loyalty',
      label:
        loyaltyIds.size > 0
          ? `Loyalty Ledger${loyaltyIds.size > 1 ? ` (${loyaltyIds.size})` : ''}`
          : 'Loyalty Ledger',
      timestamp: firstLoyalty?.loyalty_created_at ?? null,
      detail:
        firstLoyalty?.loyalty_points_delta != null
          ? `${firstLoyalty.loyalty_points_delta > 0 ? '+' : ''}${firstLoyalty.loyalty_points_delta} pts`
          : '',
      present: loyaltyIds.size > 0,
    },
  ];

  return nodes;
}

// === Timestamp formatter ===

function formatTimestamp(iso: string | null): string {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

// === Skeleton ===

function TraceSkeleton() {
  return (
    <div className="space-y-3 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-3 w-3 shrink-0 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

// === Timeline Node ===

function TimelineNode({ node, isLast }: { node: ChainNode; isLast: boolean }) {
  const config = EVENT_CONFIG[node.type];

  return (
    <div className="relative flex items-start gap-3 pb-3">
      {/* Connector line */}
      {!isLast && (
        <div className="absolute left-[5px] top-[14px] h-full w-px border-l-2 border-dashed border-border/50" />
      )}

      {/* Dot */}
      <div
        className={cn(
          'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
          node.present ? config.dotColor : 'bg-muted-foreground/30',
        )}
      />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              'font-mono text-xs font-medium',
              node.present ? config.color : 'text-muted-foreground/50',
            )}
          >
            {node.label}
          </span>
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
            {node.present ? formatTimestamp(node.timestamp) : '--:--:--'}
          </span>
        </div>
        {node.present && node.detail && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {node.detail}
          </span>
        )}
        {!node.present && (
          <span className="font-mono text-[10px] italic text-muted-foreground/40">
            not recorded
          </span>
        )}
      </div>
    </div>
  );
}

// === Main Component ===

export function AuditTraceSection({
  slipId,
  casinoId,
}: AuditTraceSectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data, isLoading, isError } = useAuditEventCorrelation(
    slipId,
    casinoId,
    isOpen, // lazy: only fetch when expanded
  );

  const rows = data?.rows ?? [];
  const chainNodes = isOpen && !isLoading ? buildChainNodes(rows) : [];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/50">
        <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Audit Trace
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
            isOpen && 'rotate-180',
          )}
        />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-3 pb-2">
          {isLoading ? (
            <TraceSkeleton />
          ) : isError ? (
            <p className="py-2 font-mono text-xs text-destructive">
              Failed to load audit trace
            </p>
          ) : rows.length === 0 ? (
            <p className="py-3 text-center font-mono text-xs text-muted-foreground">
              No downstream financial events
            </p>
          ) : (
            <>
              {/* Timeline chain */}
              <div className="py-2">
                {chainNodes.map((node, i) => (
                  <TimelineNode
                    key={node.type}
                    node={node}
                    isLast={i === chainNodes.length - 1}
                  />
                ))}
              </div>

              {/* Audit enrichment note */}
              <p className="border-t border-border/30 pt-2 font-mono text-[10px] italic text-muted-foreground/50">
                Audit trail enrichment pending
              </p>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
