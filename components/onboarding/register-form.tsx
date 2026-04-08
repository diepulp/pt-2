'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';

import { registerCompanyAction } from '@/app/(onboarding)/register/_actions';
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
import type { ServiceResult } from '@/lib/http/service-response';
import type { RegisterCompanyResult } from '@/services/company/dtos';

type RegisterState = ServiceResult<RegisterCompanyResult> | null;

async function handleRegister(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  return registerCompanyAction(formData);
}

export function RegisterForm() {
  const [state, formAction, isPending] = useActionState(handleRegister, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.code === 'OK') {
      router.push('/bootstrap');
    }
  }, [state, router]);

  if (state?.code === 'OK') {
    return (
      <Card className="border-2 border-accent/50 bg-accent/5">
        <CardHeader>
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Company Registered
          </CardTitle>
          <CardDescription>Redirecting to casino setup...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-border/50">
      <CardHeader>
        <CardTitle
          className="text-sm font-bold uppercase tracking-widest"
          style={{ fontFamily: 'monospace' }}
        >
          Company Details
        </CardTitle>
        <CardDescription>
          Enter your company information to get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-5">
          <div className="space-y-2">
            <Label
              htmlFor="company_name"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Company Name
            </Label>
            <Input
              id="company_name"
              name="company_name"
              placeholder="e.g. Acme Gaming Corp"
              required
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="legal_name"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Legal Company Name (optional)
            </Label>
            <Input
              id="legal_name"
              name="legal_name"
              placeholder="e.g. Acme Gaming Corporation LLC"
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              The full legal name of your company, if different from the display
              name above.
            </p>
          </div>

          {state && state.code !== 'OK' && (
            <div className="rounded-md border-2 border-destructive/50 bg-destructive/5 p-3">
              <p
                className="text-xs font-bold uppercase tracking-widest text-destructive"
                style={{ fontFamily: 'monospace' }}
              >
                {state.code === 'REGISTRATION_CONFLICT'
                  ? 'You already have a pending registration.'
                  : (state.error ?? 'Something went wrong. Please try again.')}
              </p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full h-10 text-xs font-semibold uppercase tracking-wider"
            disabled={isPending}
          >
            {isPending ? 'Registering...' : 'Register Company'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
