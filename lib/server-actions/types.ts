import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServiceResult } from '@/lib/http/service-response';
import type { Database } from '@/types/database.types';

export interface ServerActionContext {
  /** Authenticated Supabase client scoped to the current request */
  supabase: SupabaseClient<Database>;
  /** Domain-qualified label, e.g., `player.create` */
  action: string;
  /** Domain entity key used for audit grouping */
  entity?: string;
  /** Authenticated staff/user identifier */
  userId?: string;
  /** Optional casino scope for audit correlation */
  casinoId?: string;
  /** Idempotency key provided by the caller */
  idempotencyKey?: string;
  /** Request identifier propagated from HTTP or generated upstream */
  requestId?: string;
  /** Extra metadata to include in audit payloads */
  metadata?: Record<string, unknown>;
}

export type ServerActionHandler<T> = () => Promise<ServiceResult<T> | T>;
