"use server";

/**
 * Server Action: Create Player
 * Following PT-2 vertical slice architecture with server action wrapper
 *
 * Integration pattern demonstrates:
 * - Service layer usage (createPlayerService)
 * - Error mapping (FK violations, unique constraints, validation)
 * - Audit logging (production only)
 * - Standardized result handling (ServiceResult<T>)
 */

import { withServerAction } from "@/lib/server-actions/with-server-action-wrapper";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createPlayerService } from "@/services/player";
import type { ServiceError } from "@/services/shared/types";

export interface CreatePlayerInput {
  email: string;
  firstName: string;
  lastName: string;
}

export interface CreatePlayerResult {
  data: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  error: ServiceError | null;
  success: boolean;
  status: number;
  timestamp: string;
  requestId: string;
}

export async function createPlayerAction(
  input: CreatePlayerInput,
): Promise<CreatePlayerResult> {
  const supabase = await createServerClient();

  // Get session for audit logging (if available)
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Use wrapper for error mapping, audit logging, and standardized handling
  return withServerAction(
    async () => {
      const playerService = createPlayerService(supabase);
      return playerService.create({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
      });
    },
    supabase,
    {
      action: "create_player",
      userId: session?.user?.id,
      entity: "player",
      metadata: { email: input.email },
    },
  );
}
