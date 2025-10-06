"use server";

/**
 * Server Action: Create Player
 * Following PT-2 vertical slice architecture
 */

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createPlayerService, type PlayerCreateDTO } from "@/services/player";
import type { ServiceResult, ServiceError } from "@/services/shared/types";

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
}

export async function createPlayerAction(
  input: CreatePlayerInput,
): Promise<CreatePlayerResult> {
  const supabase = await createServerClient();
  const playerService = createPlayerService(supabase);

  const result = await playerService.create({
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
  });

  return {
    data: result.data,
    error: result.error,
    success: result.success,
  };
}
