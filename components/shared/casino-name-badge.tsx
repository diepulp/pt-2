'use client';

import { useQuery } from '@tanstack/react-query';
import { Building2, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { getCasinos } from '@/services/casino/http';
import { casinoKeys } from '@/services/casino/keys';

export function CasinoNameBadge() {
  const { data, isLoading } = useQuery({
    queryKey: casinoKeys.list({}),
    queryFn: () => getCasinos(),
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <Badge variant="outline" className="gap-1.5 font-mono text-xs">
        <Loader2 className="h-3 w-3 animate-spin" />
      </Badge>
    );
  }

  const name = data?.items[0]?.name;
  if (!name) return null;

  return (
    <Badge
      variant="outline"
      className="gap-1.5 font-mono text-xs border-accent/40 text-accent"
      title={`Casino: ${name}`}
    >
      <Building2 className="h-3 w-3" />
      <span>{name}</span>
    </Badge>
  );
}
