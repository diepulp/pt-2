'use server';

import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

type PlayerRow = Database['public']['Tables']['player']['Row'];
type PlayerInsert = Database['public']['Tables']['player']['Insert'];
type PlayerUpdate = Database['public']['Tables']['player']['Update'];
type PlayerCasinoRow = Database['public']['Tables']['player_casino']['Row'];

export type PlayerDTO = Pick<
  PlayerRow,
  'id' | 'first_name' | 'last_name' | 'birth_date' | 'created_at'
>;
export type EnrollPlayerDTO = Pick<
  PlayerInsert,
  'first_name' | 'last_name' | 'birth_date'
> & { casinoId: string };
export type PlayerCasinoDTO = Pick<
  PlayerCasinoRow,
  'player_id' | 'casino_id' | 'status' | 'enrolled_at'
>;
export type PlayerUpdateDTO = Pick<
  PlayerUpdate,
  'first_name' | 'last_name' | 'birth_date'
>;

export async function enrollPlayer(data: EnrollPlayerDTO): Promise<PlayerDTO> {
  const supabase = await createClient();

  const { data: player, error: playerError } = await supabase
    .from('player')
    .insert({
      first_name: data.first_name,
      last_name: data.last_name,
      birth_date: data.birth_date,
    })
    .select('id, first_name, last_name, birth_date, created_at')
    .single();

  if (playerError)
    throw new Error(`Failed to create player: ${playerError.message}`);

  const { error: enrollError } = await supabase.from('player_casino').insert({
    player_id: player.id,
    casino_id: data.casinoId,
    status: 'active',
  });

  if (enrollError)
    throw new Error(`Failed to enroll player: ${enrollError.message}`);

  return player;
}

export async function getPlayer(playerId: string): Promise<PlayerDTO | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('player')
    .select('id, first_name, last_name, birth_date, created_at')
    .eq('id', playerId)
    .single();

  if (error && error.code !== 'PGRST116')
    throw new Error(`Failed to fetch player: ${error.message}`);
  return data;
}

export async function getPlayerByCasino(
  casinoId: string,
  playerId: string,
): Promise<PlayerDTO | null> {
  const supabase = await createClient();

  const { data: enrollment } = await supabase
    .from('player_casino')
    .select('player_id')
    .eq('casino_id', casinoId)
    .eq('player_id', playerId)
    .single();

  if (!enrollment) return null;
  return getPlayer(playerId);
}

export async function isPlayerEnrolled(
  casinoId: string,
  playerId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('player_casino')
    .select('player_id')
    .eq('casino_id', casinoId)
    .eq('player_id', playerId)
    .eq('status', 'active')
    .single();

  return !!data;
}

export async function getPlayersByCasino(
  casinoId: string,
  options?: { limit?: number; cursor?: string },
): Promise<{ players: PlayerDTO[]; nextCursor?: string }> {
  const supabase = await createClient();
  const limit = options?.limit ?? 50;

  let query = supabase
    .from('player_casino')
    .select(
      'enrolled_at, player:player_id (id, first_name, last_name, birth_date, created_at)',
    )
    .eq('casino_id', casinoId)
    .eq('status', 'active')
    .order('enrolled_at', { ascending: false })
    .limit(limit + 1);

  if (options?.cursor) {
    query = query.lt('enrolled_at', options.cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch players: ${error.message}`);

  const players = (data ?? [])
    .slice(0, limit)
    .map((row) => row.player as unknown as PlayerDTO);
  const hasMore = (data?.length ?? 0) > limit;
  const lastItem = hasMore && data ? data[limit - 1] : null;

  return {
    players,
    nextCursor: lastItem?.enrolled_at ?? undefined,
  };
}

export async function updatePlayer(
  playerId: string,
  data: PlayerUpdateDTO,
): Promise<PlayerDTO> {
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from('player')
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
      birth_date: data.birth_date,
    })
    .eq('id', playerId)
    .select('id, first_name, last_name, birth_date, created_at')
    .single();

  if (error) throw new Error(`Failed to update player: ${error.message}`);
  return updated;
}

export async function deletePlayer(playerId: string): Promise<void> {
  const supabase = await createClient();

  // First, delete player_casino relationships
  const { error: casinoError } = await supabase
    .from('player_casino')
    .delete()
    .eq('player_id', playerId);

  if (casinoError)
    throw new Error(
      `Failed to delete player casino relationships: ${casinoError.message}`,
    );

  // Then delete the player
  const { error: playerError } = await supabase
    .from('player')
    .delete()
    .eq('id', playerId);

  if (playerError)
    throw new Error(`Failed to delete player: ${playerError.message}`);
}

export async function searchPlayers(
  query: string,
  casinoId?: string,
): Promise<PlayerDTO[]> {
  const supabase = await createClient();

  if (casinoId) {
    // Search players enrolled in a specific casino
    const { data, error } = await supabase
      .from('player_casino')
      .select(
        'player:player_id (id, first_name, last_name, birth_date, created_at)',
      )
      .eq('casino_id', casinoId)
      .eq('status', 'active')
      .or(
        `player.first_name.ilike.%${query}%,player.last_name.ilike.%${query}%`,
      );

    if (error) throw new Error(`Failed to search players: ${error.message}`);
    return (data ?? []).map((row) => row.player as unknown as PlayerDTO);
  } else {
    // Search all players
    const { data, error } = await supabase
      .from('player')
      .select('id, first_name, last_name, birth_date, created_at')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
      .limit(50);

    if (error) throw new Error(`Failed to search players: ${error.message}`);
    return data ?? [];
  }
}
