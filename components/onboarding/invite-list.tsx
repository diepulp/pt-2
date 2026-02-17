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
    return { label: 'Accepted', variant: 'default' as const };
  }
  if (new Date(invite.expires_at) < new Date()) {
    return { label: 'Expired', variant: 'destructive' as const };
  }
  return { label: 'Pending', variant: 'outline' as const };
}

export function InviteList() {
  const { data: invites, isLoading } = useQuery({
    queryKey: casinoKeys.staffInvites(),
    queryFn: () => fetchJSON<StaffInviteDTO[]>('/api/v1/onboarding/invites'),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          Loading invites...
        </CardContent>
      </Card>
    );
  }

  if (!invites?.length) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground">
          No invites yet. Create one above.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sent Invites</CardTitle>
        <CardDescription>Track the status of your invitations.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {invites.map((invite) => {
            const status = getInviteStatus(invite);
            return (
              <div
                key={invite.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{invite.email}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {invite.staff_role.replace('_', ' ')}
                  </p>
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
