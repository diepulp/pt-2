'use server';

import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

// DTOs using Pick/Omit from Database types (Pattern B requirement)
type StaffRow = Database['public']['Tables']['staff']['Row'];
type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];

export type StaffDTO = Pick<StaffRow, 'id' | 'employee_id' | 'first_name' | 'last_name' | 'email' | 'role' | 'status' | 'casino_id'>;
export type CasinoSettingsDTO = Pick<CasinoSettingsRow, 'id' | 'casino_id' | 'gaming_day_start_time' | 'timezone' | 'watchlist_floor' | 'ctr_threshold'>;

export async function getStaffByCasino(casinoId: string): Promise<StaffDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('staff')
    .select('id, employee_id, first_name, last_name, email, role, status, casino_id')
    .eq('casino_id', casinoId)
    .eq('status', 'active');

  if (error) throw new Error(`Failed to fetch staff: ${error.message}`);
  return data ?? [];
}

export async function getCasinoSettings(casinoId: string): Promise<CasinoSettingsDTO | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('casino_settings')
    .select('id, casino_id, gaming_day_start_time, timezone, watchlist_floor, ctr_threshold')
    .eq('casino_id', casinoId)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`Failed to fetch settings: ${error.message}`);
  return data;
}

export async function computeGamingDay(casinoId: string, timestamp?: Date): Promise<string> {
  const settings = await getCasinoSettings(casinoId);
  if (!settings) throw new Error(`Casino settings not found for casino ${casinoId}`);

  const targetTime = timestamp ?? new Date();
  const gamingDayStart = settings.gaming_day_start_time;
  const tz = settings.timezone;

  const localTime = new Date(targetTime.toLocaleString('en-US', { timeZone: tz }));
  const [hours, minutes] = gamingDayStart.split(':').map(Number);
  const gamingDayStartMinutes = hours * 60 + minutes;
  const currentMinutes = localTime.getHours() * 60 + localTime.getMinutes();

  let gamingDay = new Date(localTime);
  if (currentMinutes < gamingDayStartMinutes) {
    gamingDay.setDate(gamingDay.getDate() - 1);
  }

  return gamingDay.toISOString().split('T')[0];
}
