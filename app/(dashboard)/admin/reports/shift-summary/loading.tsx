/**
 * Shift Summary Loading Skeleton
 *
 * Matches the document structure with animate-pulse patterns.
 *
 * @see EXEC-065 WS2
 */

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function ShiftSummaryLoading() {
  return (
    <div className="space-y-6 p-6">
      {/* Selection controls skeleton */}
      <Card className="border-2">
        <CardHeader>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <Skeleton className="h-9 w-[180px]" />
            <Skeleton className="h-9 w-[160px]" />
            <Skeleton className="h-9 w-[140px]" />
          </div>
        </CardContent>
      </Card>

      {/* Document skeleton */}
      <div className="max-w-4xl mx-auto p-8 space-y-8">
        {/* Header skeleton */}
        <div className="border-b-2 border-border pb-6">
          <div className="flex justify-between mb-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="h-3 w-20 mb-1" />
                <Skeleton className="h-5 w-full" />
              </div>
            ))}
          </div>
        </div>

        {/* Executive summary skeleton */}
        <div>
          <Skeleton className="h-4 w-48 mb-4" />
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="border-2 border-border p-3">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        </div>

        {/* Financial summary table skeleton */}
        <div>
          <Skeleton className="h-4 w-48 mb-4" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>

        {/* Additional section skeletons */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-4 w-48 mb-4" />
            <div className="grid grid-cols-2 gap-4">
              <div className="border-2 border-border p-4">
                <Skeleton className="h-3 w-24 mb-3" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
              <div className="border-2 border-border p-4">
                <Skeleton className="h-3 w-24 mb-3" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
