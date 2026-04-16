import { cn } from '@/lib/utils';

interface FeatureShowcaseProps {
  title: string;
  description: string;
  screenshotAlt: string;
  screenshotSrc?: string;
  reverse?: boolean;
}

export function FeatureShowcase({
  title,
  description,
  screenshotAlt,
  screenshotSrc,
  reverse,
}: FeatureShowcaseProps) {
  return (
    <div
      className={cn(
        'grid items-center gap-8 lg:grid-cols-2 lg:gap-12',
        reverse && 'lg:[&>:first-child]:order-2',
      )}
    >
      <div className="space-y-3">
        <h3 className="text-xl font-semibold tracking-tight md:text-2xl">
          {title}
        </h3>
        <p className="text-base text-muted-foreground md:text-lg">
          {description}
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-muted/50">
        {screenshotSrc ? (
          <img
            src={screenshotSrc}
            alt={screenshotAlt}
            className="w-full"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center">
            <span className="text-sm text-muted-foreground">
              {screenshotAlt}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
