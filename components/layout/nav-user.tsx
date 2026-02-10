'use client';

import { BadgeCheck, Lock, LogOut } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useSignOut } from '@/hooks/auth/use-sign-out';
import { useLockScreen } from '@/hooks/ui/use-lock-screen';
import { useAuth } from '@/hooks/use-auth';

/** Format staff role for display (e.g., pit_boss → Pit Boss) */
function formatRole(role: string | null): string {
  if (!role) return '';
  return role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Get initials from email (e.g., pitboss@casino.com → PI) */
function getInitials(email: string | null | undefined): string {
  if (!email) return '??';
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

export function NavUser() {
  const { user, staffRole, isLoading } = useAuth();
  const { signOut, isPending, errorState, retrySignOut, performLocalCleanup } =
    useSignOut();
  const { lock } = useLockScreen();

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 px-2 py-2 w-full">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <div className="grid flex-1 gap-1">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="h-3 w-14" />
        </div>
      </div>
    );
  }

  const email = user?.email ?? null;
  const displayRole = formatRole(staffRole);
  const initials = getInitials(email);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-sidebar-accent/50 w-full">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-sidebar-accent border border-sidebar-border text-muted-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium text-sidebar-foreground">
                {email ?? 'Unknown'}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {displayRole}
              </span>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-56 rounded-lg"
          side="right"
          align="end"
          sideOffset={4}
        >
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {email ?? 'Unknown'}
                </span>
                <span className="truncate text-xs">{displayRole}</span>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <BadgeCheck className="mr-2 h-4 w-4" />
              Account
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => lock('manual')}>
            <Lock className="mr-2 h-4 w-4" />
            Lock screen
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={signOut} disabled={isPending}>
            <LogOut className="mr-2 h-4 w-4" />
            {isPending ? 'Signing out...' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Error dialog for hard-fail on client signOut */}
      <Dialog
        open={errorState.show}
        onOpenChange={(open) => {
          if (!open) retrySignOut();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign-out failed</DialogTitle>
            <DialogDescription>
              Could not reach the authentication server. Your local session will
              remain active server-side until it expires.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={retrySignOut}>
              Retry
            </Button>
            <Button variant="destructive" onClick={performLocalCleanup}>
              Clear local session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
