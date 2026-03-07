import { FileTextIcon } from 'lucide-react';

export default function AdminReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="rounded-full bg-muted/50 p-5 mb-5">
        <FileTextIcon className="h-10 w-10 text-muted-foreground/50" />
      </div>
      <h1 className="text-lg font-semibold">Reports</h1>
      <p className="text-sm text-muted-foreground mt-1 max-w-[280px]">
        Shift reports and analytics are coming soon.
      </p>
    </div>
  );
}
