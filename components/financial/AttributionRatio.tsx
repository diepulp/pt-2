import { cn } from '@/lib/utils';

export interface AttributionRatioProps {
  ratio: number | null;
  /** Constrained to this literal — never "Coverage" or "Coverage quality" */
  label?: 'Attribution Ratio';
  completenessStatus?: never;
  className?: string;
}

export function AttributionRatio({
  ratio,
  label = 'Attribution Ratio',
  className,
}: AttributionRatioProps) {
  const formattedRatio = ratio === null ? '—' : `${(ratio * 100).toFixed(1)}%`;

  return (
    <div
      className={cn('flex flex-col gap-0.5', className)}
      data-testid="attribution-ratio"
    >
      <div
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
        style={{ fontFamily: 'monospace' }}
      >
        {label}
      </div>
      <div
        className={cn(
          'font-mono tabular-nums font-semibold text-sm',
          ratio === null ? 'text-muted-foreground' : 'text-foreground',
        )}
        style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace' }}
        data-ratio={ratio}
      >
        {formattedRatio}
      </div>
    </div>
  );
}
