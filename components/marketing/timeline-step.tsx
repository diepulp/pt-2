interface TimelineStepProps {
  step: number;
  title: string;
  description: string;
  isLast?: boolean;
}

export function TimelineStep({
  step,
  title,
  description,
  isLast,
}: TimelineStepProps) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background font-semibold text-primary">
          {step}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-2" />}
      </div>
      <div className="pb-8">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-muted-foreground text-base mt-1">{description}</p>
      </div>
    </div>
  );
}
