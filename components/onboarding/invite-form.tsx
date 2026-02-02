'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

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
import { fetchCreateInvite } from '@/services/casino/http';
import { casinoKeys } from '@/services/casino/keys';

export function InviteForm() {
  const queryClient = useQueryClient();
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: fetchCreateInvite,
    onSuccess: (data) => {
      const link = `${window.location.origin}/invite/accept?token=${data.raw_token}`;
      setInviteLink(link);
      toast.success('Invite created');
      queryClient.invalidateQueries({
        queryKey: casinoKeys.staffInvites.scope,
      });
    },
    onError: (error: Error & { code?: string }) => {
      if (error.code === 'INVITE_ALREADY_EXISTS') {
        toast.error('An active invite already exists for this email.');
      } else if (error.code === 'FORBIDDEN') {
        toast.error('Admin access required.');
      } else {
        toast.error('Failed to create invite.');
      }
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setInviteLink(null);
    const formData = new FormData(e.currentTarget);
    mutation.mutate({
      email: formData.get('email') as string,
      role: formData.get('role') as 'dealer' | 'pit_boss' | 'cashier' | 'admin',
    });
  }

  async function copyToClipboard() {
    if (inviteLink) {
      await navigator.clipboard.writeText(inviteLink);
      toast.success('Link copied to clipboard');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Invite</CardTitle>
        <CardDescription>
          Send an invite link to a new team member.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="staff@casino.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select name="role" defaultValue="dealer">
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dealer">Dealer</SelectItem>
                <SelectItem value="pit_boss">Pit Boss</SelectItem>
                <SelectItem value="cashier">Cashier</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Creating...' : 'Create Invite'}
          </Button>
        </form>

        {inviteLink && (
          <div className="mt-4 space-y-2">
            <Label>Invite Link</Label>
            <div className="flex gap-2">
              <Input
                value={inviteLink}
                readOnly
                className="font-mono text-xs"
              />
              <Button variant="outline" onClick={copyToClipboard}>
                Copy
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
