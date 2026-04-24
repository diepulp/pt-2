export type FinancialAuthority =
  | 'actual'
  | 'estimated'
  | 'observed'
  | 'compliance';

export type CompletenessStatus = 'complete' | 'partial' | 'unknown';

export interface FinancialValue {
  readonly value: number;
  readonly type: FinancialAuthority;
  readonly source: string;
  readonly completeness: {
    readonly status: CompletenessStatus;
    readonly coverage?: number; // 0.0 – 1.0, present when computable
  };
}
