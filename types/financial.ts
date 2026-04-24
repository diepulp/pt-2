export type FinancialAuthority =
  | 'actual'
  | 'estimated'
  | 'observed'
  | 'compliance';

export type CompletenessStatus = 'complete' | 'partial' | 'unknown';

export interface FinancialValue {
  value: number;
  type: FinancialAuthority;
  source: string;
  completeness: {
    status: CompletenessStatus;
    coverage?: number; // 0.0 – 1.0, present when computable
  };
}
