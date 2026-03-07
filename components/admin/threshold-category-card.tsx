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
    <Card className={!enabled ? 'opacity-60' : undefined}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">{categoryLabel}</CardTitle>
            <p className="text-sm text-muted-foreground">{description}</p>
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
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={`${categoryKey}-${field.key}`}>
                    {field.label}
                  </Label>
                  <Input
                    id={`${categoryKey}-${field.key}`}
                    type="number"
                    step={field.type === 'int' ? '1' : '0.1'}
                    min={field.type === 'percent' ? '0' : undefined}
                    max={field.type === 'percent' ? '100' : undefined}
                    value={numValue}
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
