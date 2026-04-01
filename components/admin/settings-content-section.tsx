import { Separator } from '@/components/ui/separator';

interface SettingsContentSectionProps {
  title: string;
  desc: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

export function SettingsContentSection({
  title,
  desc,
  icon: Icon,
  children,
}: SettingsContentSectionProps) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-none">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="h-6 w-6 text-accent" />}
          <h3
            className="text-xl font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            {title}
          </h3>
        </div>
        <p
          className={`mt-1 text-base text-muted-foreground${Icon ? ' pl-[30px]' : ''}`}
        >
          {desc}
        </p>
      </div>
      <Separator className="my-4 flex-none" />
      <div className="w-full overflow-y-auto pe-4 pb-4">{children}</div>
    </div>
  );
}
