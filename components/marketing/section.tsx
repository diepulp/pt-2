import { cn } from '@/lib/utils';

interface SectionProps {
  id?: string;
  children: React.ReactNode;
  className?: string;
  muted?: boolean;
}

export function Section({ id, children, className, muted }: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'py-16 md:py-20 lg:py-24',
        muted && 'bg-muted/30',
        className,
      )}
    >
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </section>
  );
}
