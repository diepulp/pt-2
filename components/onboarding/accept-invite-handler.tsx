'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { fetchAcceptInvite } from '@/services/casino/http';

interface AcceptInviteHandlerProps {
  token: string;
}

export function AcceptInviteHandler({ token }: AcceptInviteHandlerProps) {
  const router = useRouter();
  const triggered = useRef(false);

  const mutation = useMutation({
    mutationFn: fetchAcceptInvite,
    onSuccess: () => {
      router.push('/start');
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
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Accepting invite...</p>
        </CardContent>
      </Card>
    );
  }

  if (mutation.isError) {
    const error = mutation.error as Error & { code?: string };

    if (error.code === 'STAFF_ALREADY_BOUND') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Already a Member</CardTitle>
            <CardDescription>You already belong to a casino.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push('/start')} className="w-full">
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (error.code === 'INVITE_EXPIRED') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Invite Expired</CardTitle>
            <CardDescription>
              This invite has expired. Please ask your admin for a new link.
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Invalid Invite</CardTitle>
          <CardDescription>
            This invite link is invalid. Please request a new one from your
            admin.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (mutation.isSuccess) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">
            Welcome! Redirecting to your dashboard...
          </p>
        </CardContent>
      </Card>
    );
  }

  return null;
}
