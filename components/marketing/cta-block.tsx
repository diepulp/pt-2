import Link from 'next/link';

import { Button } from '@/components/ui/button';

interface CTABlockProps {
  primary?: { label: string; href: string };
  secondary?: { label: string; href: string };
  microcopy?: string;
}

export function CTABlock({
  primary = { label: 'Request a Demo', href: '/contact' },
  secondary,
  microcopy,
}: CTABlockProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" asChild>
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
        {secondary && (
          <Button variant="outline" size="lg" asChild>
            <Link href={secondary.href}>{secondary.label}</Link>
          </Button>
        )}
      </div>
      {microcopy && (
        <p className="text-sm text-muted-foreground">{microcopy}</p>
      )}
    </div>
  );
}
