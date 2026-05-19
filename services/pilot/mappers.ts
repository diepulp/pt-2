import type { Database } from '@/types/database.types';

import type { PilotAccessRequestDTO } from './dtos';

type PilotAccessRequestRow =
  Database['public']['Tables']['pilot_access_requests']['Row'];

export function mapToPilotAccessRequestDTO(
  row: PilotAccessRequestRow,
): PilotAccessRequestDTO {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    casino_name: row.casino_name,
    role: row.role,
    estimated_table_count: row.estimated_table_count,
    message: row.message,
    status: row.status,
    reviewed_by: row.reviewed_by,
    reviewed_at: row.reviewed_at,
    created_at: row.created_at,
  };
}
