/**
 * Print Outcome Badge (PRD-092 WS7)
 *
 * Bounded, truthful rendering of a controlled-print terminal outcome. The
 * vocabulary is deliberately restricted to `submitted | failed | unknown`
 * (TERMINOLOGY §7a) — there is intentionally NO "printed"/"completed"/
 * "acknowledged"/"device" copy. "submitted" means the job was sent to the
 * printer, NOT that paper came out: this phase is one-way (ADR-062), so the
 * system cannot observe physical completion.
 *
 * Presentational only — it reads outcome state, it never drives a print.
 *
 * @see PRD-092 / EXEC-092 WS7
 * @see services/loyalty/printing/contract.ts — PrintResultStatus / PrintFailure
 */

'use client';

import { AlertTriangle, HelpCircle, Send } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  PrintFailure,
  PrintResultStatus,
} from '@/services/loyalty/printing/contract';

// === Props ===

export interface PrintOutcomeBadgeProps {
  /** Terminal-or-current outcome from the controlled print action. */
  status: PrintResultStatus;
  /** Failure descriptor when the outcome carries one (`failed`). */
  failure?: PrintFailure | null;
  className?: string;
}

// === Copy ===

/** Operator-friendly label for a bounded transport/render failure code. */
function describeFailure(failure: PrintFailure | null | undefined): string {
  if (!failure) return 'The print could not be sent.';
  switch (failure.code) {
    case 'agent_unreachable':
      return 'The print station could not be reached.';
    case 'spooler_rejected':
      return 'The print station rejected the job.';
    case 'malformed_agent_response':
      return 'The print station returned an unreadable response.';
    default:
      return failure.domain === 'render_validation'
        ? 'The slip failed validation before sending.'
        : 'The print could not be sent.';
  }
}

// === Component ===

/**
 * Renders the bounded outcome of a controlled loyalty-instrument print.
 *
 * - `submitted` — sent to the printer; NOT confirmed printed (§7a).
 * - `failed`    — terminal failure (render/transport); show the bounded reason.
 * - `unknown`   — ambiguous: the slip MAY or may not have printed.
 * - `requested` — transient pre-terminal state; rendered as "Sending…".
 */
export function PrintOutcomeBadge({
  status,
  failure,
  className,
}: PrintOutcomeBadgeProps) {
  if (status === 'submitted') {
    return (
      <div className={cn('space-y-1', className)}>
        <Badge
          variant="outline"
          className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 uppercase tracking-wider dark:text-emerald-400"
          style={{ fontFamily: 'monospace' }}
        >
          <Send className="h-3 w-3" />
          Sent to printer
        </Badge>
        <p className="text-xs text-muted-foreground">
          Sent to the printer — not yet confirmed printed.
        </p>
      </div>
    );
  }

  if (status === 'unknown') {
    return (
      <div className={cn('space-y-1', className)}>
        <Badge
          variant="outline"
          className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-600 uppercase tracking-wider dark:text-amber-400"
          style={{ fontFamily: 'monospace' }}
        >
          <HelpCircle className="h-3 w-3" />
          Status unknown
        </Badge>
        <p className="text-xs text-muted-foreground">
          The slip may or may not have printed. Reprint only if needed.
        </p>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={cn('space-y-1', className)}>
        <Badge
          variant="outline"
          className="gap-1.5 border-destructive/30 bg-destructive/10 text-destructive uppercase tracking-wider"
          style={{ fontFamily: 'monospace' }}
        >
          <AlertTriangle className="h-3 w-3" />
          Not sent
        </Badge>
        <p className="text-xs text-muted-foreground">
          {describeFailure(failure)}
        </p>
      </div>
    );
  }

  // `requested` — transient pre-terminal state.
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5 border-border/50 bg-muted/30 text-muted-foreground uppercase tracking-wider',
        className,
      )}
      style={{ fontFamily: 'monospace' }}
    >
      <Send className="h-3 w-3 animate-pulse" />
      Sending…
    </Badge>
  );
}
