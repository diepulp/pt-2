'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { getCasino } from '@/services/casino/http';
import { casinoKeys } from '@/services/casino/keys';

export function CasinoNameBadge() {
  const { casinoId, isLoading: authLoading } = useAuth();
  const { data: casino, isLoading: casinoLoading } = useQuery({
    queryKey: casinoKeys.detail(casinoId ?? ''),
    queryFn: () => getCasino(casinoId!),
    enabled: !!casinoId,
    staleTime: Infinity,
  });

  if (authLoading || casinoLoading) {
    return (
      <Badge variant="outline" className="gap-1.5 font-mono text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
      </Badge>
    );
  }

  if (!casino?.name) return null;

  return (
    <Badge
      variant="outline"
      className="gap-1.5 font-mono text-xs border-accent/40 text-accent"
      title={`Casino: ${casino.name}`}
    >
      <Building2 className="h-3 w-3" />
      <span>{casino.name}</span>
    </Badge>
  );
}
