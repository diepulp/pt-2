'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Database } from '@/types/database.types';

import { BankModeSelector } from '../components/bank-mode-selector';

type CasinoSettingsRow = Database['public']['Tables']['casino_settings']['Row'];
type TableBankMode = Database['public']['Enums']['table_bank_mode'];

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Phoenix',
  'America/Detroit',
  'America/Indiana/Indianapolis',
  'America/Boise',
] as const;

interface StepCasinoBasicsProps {
  settings: CasinoSettingsRow | null;
  isPending: boolean;
  onSave: (formData: FormData) => void;
}

export function StepCasinoBasics({
  settings,
  isPending,
  onSave,
}: StepCasinoBasicsProps) {
  const [timezone, setTimezone] = useState(
    settings?.timezone ?? 'America/Los_Angeles',
  );
  const [gamingDayStart, setGamingDayStart] = useState(
    settings?.gaming_day_start_time?.slice(0, 5) ?? '06:00',
  );
  const [bankMode, setBankMode] = useState<TableBankMode | null>(
    settings?.table_bank_mode ?? null,
  );

  function handleNext() {
    if (!bankMode) return;
    const formData = new FormData();
    formData.set('timezone', timezone);
    formData.set('gaming_day_start_time', gamingDayStart);
    formData.set('table_bank_mode', bankMode);
    onSave(formData);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Casino Basics</CardTitle>
        <CardDescription>
          Set your timezone, gaming day schedule, and bankroll policy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id="timezone">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz
                      .replace(/_/g, ' ')
                      .replace(/America\//, '')
                      .replace(/Pacific\//, '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gaming_day_start">Gaming Day Start</Label>
            <Input
              id="gaming_day_start"
              type="time"
              value={gamingDayStart}
              onChange={(e) => setGamingDayStart(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              When the gaming day begins (e.g. 06:00 AM)
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Table Bank Mode</Label>
          <BankModeSelector value={bankMode} onChange={setBankMode} />
          {!bankMode && (
            <p className="text-xs text-destructive">
              Please select a bank mode to continue.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleNext} disabled={isPending || !bankMode}>
            {isPending ? 'Saving...' : 'Next'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
