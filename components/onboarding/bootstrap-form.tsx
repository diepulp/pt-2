'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';

import { bootstrapAction } from '@/app/(onboarding)/bootstrap/_actions';
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
import type { ServiceResult } from '@/lib/http/service-response';
import type { BootstrapCasinoResult } from '@/services/casino/dtos';

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Anchorage',
  'Pacific/Honolulu',
];

type BootstrapState = ServiceResult<BootstrapCasinoResult> | null;

async function handleBootstrap(
  _prev: BootstrapState,
  formData: FormData,
): Promise<BootstrapState> {
  return bootstrapAction(formData);
}

export function BootstrapForm() {
  const [state, formAction, isPending] = useActionState(handleBootstrap, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.code === 'OK') {
      // Give a moment for claims to propagate, then redirect
      const timer = setTimeout(() => router.push('/start'), 1500);
      return () => clearTimeout(timer);
    }
  }, [state, router]);

  if (state?.code === 'OK') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Casino Created</CardTitle>
          <CardDescription>
            Your workspace is ready. Redirecting...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => router.push('/start')} className="w-full">
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Casino Details</CardTitle>
        <CardDescription>
          Enter your casino information to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="casino_name">Casino Name</Label>
            <Input
              id="casino_name"
              name="casino_name"
              placeholder="e.g. Golden Palace Casino"
              required
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timezone">Timezone</Label>
            <Select name="timezone" defaultValue="America/Los_Angeles">
              <SelectTrigger>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz
                      .replace('_', ' ')
                      .replace('America/', '')
                      .replace('Pacific/', '')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gaming_day_start">Gaming Day Start</Label>
            <Input
              id="gaming_day_start"
              name="gaming_day_start"
              type="time"
              defaultValue="06:00"
            />
          </div>

          {state && state.code !== 'OK' && (
            <p className="text-sm text-destructive">
              {state.code === 'STAFF_ALREADY_BOUND'
                ? 'You already have an active casino.'
                : 'Something went wrong. Please try again.'}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Casino'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
