'use client';

import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { fetchJSON } from '@/lib/http/fetch-json';
import type { StaffInviteDTO } from '@/services/casino/dtos';
import { casinoKeys } from '@/services/casino/keys';

function getInviteStatus(invite: StaffInviteDTO) {
  if (invite.accepted_at) {
    return {
      label: 'Accepted',
      className: 'bg-green-500/10 text-green-400 border-green-500/30',
    };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return {
      label: 'Expired',
      className: 'bg-red-500/10 text-red-400 border-red-500/30',
    };
  }
  return {
    label: 'Pending',
    className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  };
}

export function InviteList() {
  const { data: invites, isLoading } = useQuery({
    queryKey: casinoKeys.staffInvites(),
    queryFn: () => fetchJSON<StaffInviteDTO[]>('/api/v1/onboarding/invites'),
  });

  if (isLoading) {
    return (
      <Card className="border-2 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Sent Invites
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg bg-muted/50"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!invites?.length) {
    return (
      <Card className="border-2 border-dashed border-border/50 bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            No invites yet
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create one above to get started.
          </p>
        </CardContent>
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
          Sent Invites ({invites.length})
        </CardTitle>
        <CardDescription>Track the status of your invitations.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {invites.map((invite) => {
            const status = getInviteStatus(invite);
            return (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-lg border-2 border-border/30 bg-card/30 p-3 transition-all hover:border-accent/30"
              >
                <div className="space-y-1">
                  <p
                    className="text-sm font-medium"
                    style={{ fontFamily: 'monospace' }}
                  >
                    {invite.email}
                  </p>
                  <p
                    className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
                    style={{ fontFamily: 'monospace' }}
                  >
                    {invite.staff_role.replace('_', ' ')}
                  </p>
                </div>
                <Badge variant="outline" className={status.className}>
                  {status.label}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
