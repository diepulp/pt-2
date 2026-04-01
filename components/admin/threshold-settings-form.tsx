'use client';

import { useState, useTransition } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCasinoSettings,
  useUpdateCasinoSettings,
} from '@/hooks/casino/use-casino-settings';
import { useUnsavedChangesPrompt } from '@/hooks/use-unsaved-changes-prompt';
import type { AlertThresholdsDTO } from '@/services/casino/dtos';
import { alertThresholdsSchema } from '@/services/casino/schemas';

import {
  ThresholdCategoryCard,
  type ThresholdField,
} from './threshold-category-card';

// --- Category configuration ---

interface CategoryConfig {
  key: string;
  label: string;
  description: string;
  fields: ThresholdField[];
}

// Categories organized by domain taxonomy with section grouping
interface CategoryGroup {
  label: string;
  description: string;
  categories: CategoryConfig[];
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: 'Financial Anomalies',
    description: 'Detect unusual financial patterns in drop and hold metrics.',
    categories: [
      {
        key: 'drop_anomaly',
        label: 'Drop Anomaly',
        description: 'Detect unusual drop amounts using MAD analysis.',
        fields: [
          { key: 'mad_multiplier', label: 'MAD Multiplier', type: 'float' },
          { key: 'fallback_percent', label: 'Fallback (%)', type: 'percent' },
        ],
      },
      {
        key: 'hold_deviation',
        label: 'Hold Deviation',
        description:
          'Alert on hold percentage deviations. Disabled until trusted.',
        fields: [
          { key: 'deviation_pp', label: 'Deviation (pp)', type: 'float' },
          { key: 'extreme_low', label: 'Extreme Low', type: 'float' },
          { key: 'extreme_high', label: 'Extreme High', type: 'float' },
        ],
      },
    ],
  },
  {
    label: 'Operational Alerts',
    description:
      'Monitor table activity, session duration, and pause thresholds.',
    categories: [
      {
        key: 'table_idle',
        label: 'Table Idle',
        description: 'Alert when a table is open but has no activity.',
        fields: [
          { key: 'warn_minutes', label: 'Warning (minutes)', type: 'int' },
          {
            key: 'critical_minutes',
            label: 'Critical (minutes)',
            type: 'int',
          },
        ],
      },
      {
        key: 'slip_duration',
        label: 'Slip Duration',
        description: 'Alert for long-running rating slips.',
        fields: [
          { key: 'warn_hours', label: 'Warning (hours)', type: 'int' },
          { key: 'critical_hours', label: 'Critical (hours)', type: 'int' },
        ],
      },
      {
        key: 'pause_duration',
        label: 'Pause Duration',
        description: 'Alert when a paused session exceeds threshold.',
        fields: [
          { key: 'warn_minutes', label: 'Warning (minutes)', type: 'int' },
        ],
      },
    ],
  },
  {
    label: 'Promotional Anomalies',
    description:
      'Track promotional issuance patterns, void rates, and outstanding aging.',
    categories: [
      {
        key: 'promo_issuance_spike',
        label: 'Promo Issuance Spike',
        description: 'Detect unusual spikes in promotional issuance.',
        fields: [
          { key: 'mad_multiplier', label: 'MAD Multiplier', type: 'float' },
          { key: 'fallback_percent', label: 'Fallback (%)', type: 'percent' },
        ],
      },
      {
        key: 'promo_void_rate',
        label: 'Promo Void Rate',
        description: 'Alert when promo void rate exceeds threshold.',
        fields: [
          { key: 'warn_percent', label: 'Warning (%)', type: 'percent' },
        ],
      },
      {
        key: 'outstanding_aging',
        label: 'Outstanding Aging',
        description: 'Alert on uncleared promotional items exceeding limits.',
        fields: [
          { key: 'max_age_hours', label: 'Max Age (hours)', type: 'int' },
          { key: 'max_value_dollars', label: 'Max Value ($)', type: 'float' },
          { key: 'max_coupon_count', label: 'Max Coupon Count', type: 'int' },
        ],
      },
    ],
  },
];

// --- Helpers ---

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// --- Component ---

export function ThresholdSettingsForm() {
  const { data: settings, isLoading, error } = useCasinoSettings();
  const updateMutation = useUpdateCasinoSettings();
  const [isPending, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);

  // Server value: the raw alert_thresholds from DB (may be null)
  const serverThresholds = settings?.alert_thresholds ?? null;

  // Display value: parsed with defaults for UI rendering
  const displayDefaults = alertThresholdsSchema.parse(
    serverThresholds ?? {},
  ) as AlertThresholdsDTO;

  // Local form state — initialized from display defaults
  const [formState, setFormState] = useState<AlertThresholdsDTO | null>(null);

  // Active form state: use local edits if user has touched the form, otherwise display defaults
  const currentValues = formState ?? displayDefaults;

  // NIT-006: isDirty compares against server value, not display defaults.
  // If server is null and form is untouched, not dirty.
  // If server is null and form has been touched, dirty.
  // If server has data and form differs, dirty.
  const isDirty = formState !== null && !deepEqual(formState, serverThresholds);

  useUnsavedChangesPrompt(isDirty);

  // --- Handlers ---

  function handleFieldChange(
    categoryKey: string,
    fieldKey: string,
    value: number,
  ) {
    setFormState((prev) => {
      const base = prev ?? { ...displayDefaults };
      const category =
        (base as unknown as Record<string, Record<string, unknown>>)[
          categoryKey
        ] ?? {};
      return {
        ...base,
        [categoryKey]: { ...category, [fieldKey]: value },
      } as AlertThresholdsDTO;
    });
  }

  function handleToggle(categoryKey: string, enabled: boolean) {
    setFormState((prev) => {
      const base = prev ?? { ...displayDefaults };
      const category =
        (base as unknown as Record<string, Record<string, unknown>>)[
          categoryKey
        ] ?? {};
      return {
        ...base,
        [categoryKey]: { ...category, enabled },
      } as AlertThresholdsDTO;
    });
  }

  function handleBaselineChange(field: string, value: string | number) {
    setFormState((prev) => {
      const base = prev ?? { ...displayDefaults };
      return {
        ...base,
        baseline: { ...base.baseline, [field]: value },
      } as AlertThresholdsDTO;
    });
  }

  function handleSave() {
    if (!formState) return;

    // Merge: preserve unknown keys from server, overlay user changes
    const merged = {
      ...(typeof serverThresholds === 'object' && serverThresholds !== null
        ? serverThresholds
        : {}),
      ...formState,
    };

    startTransition(async () => {
      await updateMutation.mutateAsync({
        alert_thresholds: merged as AlertThresholdsDTO,
      });
      setFormState(null);
      setShowConfirm(false);
    });
  }

  // --- Loading state ---

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <p className="text-sm text-destructive">
          Failed to load settings. Please try again.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Last saved */}
      {settings?.updated_at && (
        <p className="text-xs text-muted-foreground">
          Last saved: {formatTimestamp(settings.updated_at)}
        </p>
      )}

      {/* Baseline configuration */}
      <div>
        <h4 className="text-sm font-semibold text-foreground">
          Baseline Engine Configuration
        </h4>
        <p className="text-sm text-muted-foreground mb-4">
          Statistical parameters for anomaly detection algorithms.
        </p>
      </div>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Baseline Configuration</CardTitle>
          <p className="text-sm text-muted-foreground">
            Window size, method, and minimum history for baseline computation.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="baseline-window-days">Window (days)</Label>
              <Input
                id="baseline-window-days"
                type="number"
                min={1}
                step={1}
                value={currentValues.baseline.window_days}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) handleBaselineChange('window_days', val);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseline-method">Method</Label>
              <Select
                value={currentValues.baseline.method}
                onValueChange={(val) => handleBaselineChange('method', val)}
              >
                <SelectTrigger id="baseline-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="median_mad">Median MAD</SelectItem>
                  <SelectItem value="mean_stddev">Mean StdDev</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="baseline-min-history">Min History (days)</Label>
              <Input
                id="baseline-min-history"
                type="number"
                min={1}
                step={1}
                value={currentValues.baseline.min_history_days}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val))
                    handleBaselineChange('min_history_days', val);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category cards grouped by domain taxonomy */}
      {CATEGORY_GROUPS.map((group) => (
        <div key={group.label} className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {group.label}
            </h4>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
          <div className="grid gap-4">
            {group.categories.map((cat) => {
              const catValues =
                (
                  currentValues as unknown as Record<
                    string,
                    Record<string, unknown>
                  >
                )[cat.key] ?? {};

              return (
                <ThresholdCategoryCard
                  key={cat.key}
                  categoryKey={cat.key}
                  categoryLabel={cat.label}
                  description={cat.description}
                  fields={cat.fields}
                  value={catValues}
                  enabled={catValues.enabled !== false}
                  onChange={handleFieldChange}
                  onToggle={handleToggle}
                />
              );
            })}
          </div>
        </div>
      ))}

      {/* Save button — only visible when dirty */}
      {isDirty && (
        <div className="flex justify-end">
          <Button onClick={() => setShowConfirm(true)} disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      )}

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Threshold Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Changes take effect on the next alert evaluation cycle. Existing
              alerts in progress will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={isPending}>
              {isPending ? 'Saving...' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
