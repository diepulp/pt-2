'use client';

import {
  Activity,
  AlertCircle,
  DollarSign,
  Gift,
  SlidersHorizontal,
} from 'lucide-react';
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
  icon: React.ComponentType<{ className?: string }>;
  categories: CategoryConfig[];
}

const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    label: 'Financial Anomalies',
    description: 'Detect unusual financial patterns in drop and hold metrics.',
    icon: DollarSign,
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
    icon: Activity,
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
    icon: Gift,
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
      <div className="space-y-6">
        {/* Baseline skeleton */}
        <Card className="border-2 border-border/50">
          <CardHeader className="pb-3">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-2 h-3 w-72" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-9 w-full rounded-md" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Category skeletons */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-4 w-40" />
            <Card className="border-2 border-border/50">
              <CardHeader className="pb-3">
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[1, 2].map((j) => (
                    <Skeleton key={j} className="h-9 w-full rounded-md" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-2 border-destructive/50 bg-destructive/5">
        <CardContent className="flex items-center gap-3 py-6">
          <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <div
              className="text-xs font-bold uppercase tracking-widest text-destructive"
              style={{ fontFamily: 'monospace' }}
            >
              Error Loading Settings
            </div>
            <p className="mt-1 text-sm text-destructive/80">
              Failed to load anomaly detection configuration. Please try again.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Last saved */}
      {settings?.updated_at && (
        <p
          className="text-xs text-muted-foreground"
          style={{ fontFamily: 'monospace' }}
        >
          Last saved: {formatTimestamp(settings.updated_at)}
        </p>
      )}

      {/* Baseline configuration */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-accent" />
          <h4
            className="text-sm font-bold uppercase tracking-widest text-foreground"
            style={{ fontFamily: 'monospace' }}
          >
            Baseline Engine
          </h4>
        </div>
        <p className="text-xs text-muted-foreground">
          Statistical parameters for anomaly detection algorithms.
        </p>
      </div>
      <Card className="border-2 border-accent/30 bg-accent/[0.03]">
        <CardHeader className="pb-3">
          <CardTitle
            className="text-sm font-bold uppercase tracking-widest"
            style={{ fontFamily: 'monospace' }}
          >
            Baseline Configuration
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Window size, method, and minimum history for baseline computation.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label
                htmlFor="baseline-window-days"
                className="text-xs text-muted-foreground"
              >
                Window (days)
              </Label>
              <Input
                id="baseline-window-days"
                type="number"
                min={1}
                step={1}
                value={currentValues.baseline.window_days}
                className="font-mono tabular-nums"
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) handleBaselineChange('window_days', val);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="baseline-method"
                className="text-xs text-muted-foreground"
              >
                Method
              </Label>
              <Select
                value={currentValues.baseline.method}
                onValueChange={(val) => handleBaselineChange('method', val)}
              >
                <SelectTrigger
                  id="baseline-method"
                  className="font-mono text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="median_mad">Median MAD</SelectItem>
                  <SelectItem value="mean_stddev">Mean StdDev</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="baseline-min-history"
                className="text-xs text-muted-foreground"
              >
                Min History (days)
              </Label>
              <Input
                id="baseline-min-history"
                type="number"
                min={1}
                step={1}
                value={currentValues.baseline.min_history_days}
                className="font-mono tabular-nums"
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
      {CATEGORY_GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <div key={group.label} className="space-y-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <h4
                  className="text-sm font-bold uppercase tracking-widest text-foreground"
                  style={{ fontFamily: 'monospace' }}
                >
                  {group.label}
                </h4>
              </div>
              <p className="text-xs text-muted-foreground pl-6">
                {group.description}
              </p>
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
        );
      })}

      {/* Save action bar — only visible when dirty */}
      {isDirty && (
        <div className="flex items-center justify-between rounded-lg border-2 border-accent/30 bg-accent/5 px-4 py-3">
          <p
            className="text-xs font-bold uppercase tracking-widest text-accent"
            style={{ fontFamily: 'monospace' }}
          >
            Unsaved Changes
          </p>
          <Button
            onClick={() => setShowConfirm(true)}
            disabled={isPending}
            size="sm"
            className="h-8 gap-1.5 text-xs font-semibold uppercase tracking-wider"
          >
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
