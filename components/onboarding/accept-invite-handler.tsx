'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { refreshAndVerifyClaims } from '@/lib/supabase/refresh-claims';
import { fetchAcceptInvite } from '@/services/casino/http';

interface AcceptInviteHandlerProps {
  token: string;
}

export function AcceptInviteHandler({ token }: AcceptInviteHandlerProps) {
  const router = useRouter();
  const triggered = useRef(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [isRetrying, startRetryTransition] = useTransition();

  const mutation = useMutation({
    mutationFn: fetchAcceptInvite,
    onSuccess: async () => {
      const result = await refreshAndVerifyClaims();
      if (result.ok) {
        router.push('/start');
      } else {
        setRefreshError(result.error ?? 'Claims verification failed');
      }
    },
  });

  useEffect(() => {
    if (!triggered.current) {
      triggered.current = true;
      mutation.mutate({ token });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (mutation.isPending) {
    return (
      <Card className="border-2 border-border/50">
        <CardContent className="py-12 text-center">
          <div className="space-y-3">
            <div className="mx-auto h-6 w-6 rounded-full border-2 border-accent/50 border-t-accent animate-spin" />
            <p
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Accepting invite...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (mutation.isError) {
    const error = mutation.error as Error & { code?: string };

    if (error.code === 'STAFF_ALREADY_BOUND') {
      return (
        <Card className="border-2 border-accent/50 bg-accent/5">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Already a Member
            </CardTitle>
            <CardDescription>You already belong to a casino.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push('/start')}
              className="w-full h-10 text-xs font-semibold uppercase tracking-wider"
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (error.code === 'INVITE_EXPIRED') {
      return (
        <Card className="border-2 border-destructive/50 bg-destructive/5">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest text-destructive"
              style={{ fontFamily: 'monospace' }}
            >
              Invite Expired
            </CardTitle>
            <CardDescription>
              This invite has expired. Please ask your admin for a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <Card className="border-2 border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest text-destructive"
            style={{ fontFamily: 'monospace' }}
          >
            Invalid Invite
          </CardTitle>
          <CardDescription>
            This invite link is invalid. Please request a new one from your
            admin.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (mutation.isSuccess) {
    if (refreshError) {
      const handleRetry = () => {
        startRetryTransition(async () => {
          const result = await refreshAndVerifyClaims();
          if (result.ok) {
            router.push('/start');
          } else {
            setRefreshError(result.error ?? 'Claims verification failed');
          }
        });
      };

      return (
        <Card className="border-2 border-accent/50 bg-accent/5">
          <CardHeader>
            <CardTitle
              className="text-sm font-bold uppercase tracking-widest"
              style={{ fontFamily: 'monospace' }}
            >
              Invite Accepted
            </CardTitle>
            <CardDescription>Finalizing your session...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-3 rounded-md border-2 border-destructive/50 bg-destructive/5 p-3">
              <p
                className="text-xs font-bold uppercase tracking-widest text-destructive"
                style={{ fontFamily: 'monospace' }}
              >
                {refreshError}
              </p>
            </div>
            <Button
              onClick={handleRetry}
              className="w-full h-10 text-xs font-semibold uppercase tracking-wider"
              disabled={isRetrying}
            >
              {isRetrying ? 'Retrying...' : 'Go to Dashboard'}
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card className="border-2 border-accent/50 bg-accent/5">
        <CardContent className="py-12 text-center">
          <div className="space-y-3">
            <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] mx-auto" />
            <p
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
              style={{ fontFamily: 'monospace' }}
            >
              Welcome! Redirecting to your dashboard...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
