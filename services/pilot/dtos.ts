import type { Database } from '@/types/database.types';

type PilotAccessRequestRow =
  Database['public']['Tables']['pilot_access_requests']['Row'];

// Full request record — used by admin review surface (WS7/WS8).
export type PilotAccessRequestDTO = Pick<
  PilotAccessRequestRow,
  | 'id'
  | 'email'
  | 'name'
  | 'casino_name'
  | 'role'
  | 'estimated_table_count'
  | 'message'
  | 'status'
  | 'reviewed_by'
  | 'reviewed_at'
  | 'created_at'
>;

export interface CreatePilotAccessRequestInput {
  email: string;
  name: string;
  casino_name: string;
  role: string;
  estimated_table_count?: number;
  message?: string;
}

// Binary gate result — non-revealing per RULE-7 (no enumeration, no technical detail).
export type AllowlistGateResult = 'approved' | 'not_approved';

export type PilotRequestFilters = {
  status?: string;
  limit?: number;
  cursor?: string;
};
