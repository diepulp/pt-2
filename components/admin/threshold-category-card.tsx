'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface ThresholdField {
  key: string;
  label: string;
  type: 'int' | 'float' | 'percent';
}

interface ThresholdCategoryCardProps {
  categoryKey: string;
  categoryLabel: string;
  description: string;
  fields: ThresholdField[];
  value: Record<string, unknown>;
  enabled: boolean;
  onChange: (categoryKey: string, fieldKey: string, fieldValue: number) => void;
  onToggle: (categoryKey: string, enabled: boolean) => void;
}

export function ThresholdCategoryCard({
  categoryKey,
  categoryLabel,
  description,
  fields,
  value,
  enabled,
  onChange,
  onToggle,
}: ThresholdCategoryCardProps) {
  return (
    <Card
      className={
        enabled
          ? 'border-2 border-accent/20 transition-all duration-200 hover:border-accent/40'
          : 'border-2 border-border/30 opacity-50 transition-all duration-200'
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              {enabled && (
                <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]" />
              )}
              <CardTitle
                className="text-sm font-bold uppercase tracking-widest"
                style={{ fontFamily: 'monospace' }}
              >
                {categoryLabel}
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => onToggle(categoryKey, checked)}
            aria-label={`Enable ${categoryLabel}`}
          />
        </div>
      </CardHeader>
      {enabled && (
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => {
              const fieldValue = value[field.key];
              const numValue = typeof fieldValue === 'number' ? fieldValue : 0;

              return (
                <div key={field.key} className="space-y-1.5">
                  <Label
                    htmlFor={`${categoryKey}-${field.key}`}
                    className="text-xs text-muted-foreground"
                  >
                    {field.label}
                  </Label>
                  <Input
                    id={`${categoryKey}-${field.key}`}
                    type="number"
                    step={field.type === 'int' ? '1' : '0.1'}
                    min={field.type === 'percent' ? '0' : undefined}
                    max={field.type === 'percent' ? '100' : undefined}
                    value={numValue}
                    className="font-mono tabular-nums"
                    onChange={(e) => {
                      const parsed =
                        field.type === 'int'
                          ? parseInt(e.target.value, 10)
                          : parseFloat(e.target.value);
                      if (!isNaN(parsed)) {
                        onChange(categoryKey, field.key, parsed);
                      }
                    }}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
