import { AlertTriangle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';

export function ReconciliationBadge() {
  return (
    <Badge
      variant="outline"
      className="gap-1 border-red-500/30 bg-red-500/10 text-red-400"
    >
      <AlertTriangle className="h-3 w-3" />
      Reconciliation Required
    </Badge>
  );
}
