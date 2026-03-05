'use client';

import { useState, useTransition } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCasinoSettings,
  useUpdateCasinoSettings,
} from '@/hooks/casino/use-casino-settings';
import { useUnsavedChangesPrompt } from '@/hooks/use-unsaved-changes-prompt';

// --- Timezone data ---

const TIMEZONE_GROUPS = [
  {
    label: 'United States',
    timezones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Phoenix',
      'America/Anchorage',
      'Pacific/Honolulu',
    ],
  },
  {
    label: 'Asia Pacific',
    timezones: [
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Manila',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Pacific/Auckland',
    ],
  },
  {
    label: 'Europe',
    timezones: [
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Madrid',
      'Europe/Rome',
      'Europe/Amsterdam',
    ],
  },
] as const;

// --- Helpers ---

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function computeEndTime(startTime: string): string {
  const [hours, minutes] = startTime.split(':').map(Number);
  const endHours = (hours + 24) % 24;
  return `${String(endHours).padStart(2, '0')}:${String(minutes ?? 0).padStart(2, '0')}`;
}

function useStaffRole(): string | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('[data-staff-role]');
  return el?.getAttribute('data-staff-role') ?? null;
}

// --- Component ---

export function ShiftSettingsForm() {
  const { data: settings, isLoading, error } = useCasinoSettings();
  const updateMutation = useUpdateCasinoSettings();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  const staffRole = useStaffRole();
  const isReadOnly = staffRole === 'pit_boss';

  // Local form state — null means untouched
  const [localStartTime, setLocalStartTime] = useState<string | null>(null);
  const [localTimezone, setLocalTimezone] = useState<string | null>(null);

  const currentStartTime =
    localStartTime ?? settings?.gaming_day_start_time ?? '06:00';
  const currentTimezone =
    localTimezone ?? settings?.timezone ?? 'America/Los_Angeles';

  // Derive dirty state from actual server values
  const isDirty =
    (localStartTime !== null &&
      localStartTime !== settings?.gaming_day_start_time) ||
    (localTimezone !== null && localTimezone !== settings?.timezone);

  useUnsavedChangesPrompt(isDirty);

  // Visual preview — derived state, no useEffect
  const displayStart = currentStartTime.slice(0, 5); // HH:MM
  const displayEnd = computeEndTime(displayStart);

  function handleSave() {
    startTransition(async () => {
      const payload: Record<string, string> = {};
      if (localStartTime !== null)
        payload.gaming_day_start_time = localStartTime;
      if (localTimezone !== null) payload.timezone = localTimezone;

      await updateMutation.mutateAsync(payload);
      setLocalStartTime(null);
      setLocalTimezone(null);
      setShowConfirm(false);
    });
  }

  // --- Loading state ---

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Failed to load settings. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Last saved */}
      {settings?.updated_at && (
        <p className="text-xs text-muted-foreground">
          Last saved: {formatTimestamp(settings.updated_at)}
        </p>
      )}

      {/* Read-only indicator for pit_boss */}
      {isReadOnly && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Only casino admins can change shift settings. Contact your
            administrator for changes.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Gaming Day Configuration</CardTitle>
          <p className="text-sm text-muted-foreground">
            Define when the gaming day starts and the operating timezone.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Start time */}
            <div className="space-y-2">
              <Label htmlFor="gaming-day-start">Gaming Day Start Time</Label>
              <Input
                id="gaming-day-start"
                type="time"
                value={displayStart}
                disabled={isReadOnly}
                onChange={(e) => setLocalStartTime(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                24-hour format. Typically 06:00 for most casinos.
              </p>
            </div>

            {/* Timezone */}
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={currentTimezone}
                onValueChange={setLocalTimezone}
                disabled={isReadOnly}
              >
                <SelectTrigger id="timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONE_GROUPS.map((group) => (
                    <div key={group.label}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        {group.label}
                      </div>
                      {group.timezones.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Visual preview */}
          <div className="rounded-md border bg-muted/50 p-4">
            <p className="text-sm font-medium">Preview</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Gaming day runs from{' '}
              <span className="font-mono font-semibold text-foreground">
                {displayStart}
              </span>{' '}
              to{' '}
              <span className="font-mono font-semibold text-foreground">
                {displayEnd}
              </span>{' '}
              (next day) in{' '}
              <span className="font-semibold text-foreground">
                {currentTimezone.replace(/_/g, ' ')}
              </span>
            </p>
          </div>

          {/* Warning banner when dirty */}
          {isDirty && (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Changing gaming day boundaries affects all active sessions and
                downstream reports. Proceed with caution.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save button — only visible when dirty and not read-only */}
      {isDirty && !isReadOnly && (
        <div className="flex justify-end">
          <Button onClick={() => setShowConfirm(true)} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Gaming Day Settings?</AlertDialogTitle>
            <AlertDialogDescription>
              This will affect all active sessions, gaming day computations, and
              downstream reports (Finance, MTL, Loyalty). Changes cannot be
              undone retroactively.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Confirm Changes'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
