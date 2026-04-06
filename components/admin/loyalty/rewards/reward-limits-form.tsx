'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUpdateReward } from '@/hooks/loyalty/use-reward-mutations';
import type {
  LimitScope,
  RewardDetailDTO,
} from '@/services/loyalty/reward/dtos';

// === Types ===

interface LimitRow {
  key: string;
  scope: LimitScope;
  maxIssues: number;
  cooldownMinutes: number | null;
  requiresNote: boolean;
}

const SCOPE_OPTIONS: { value: LimitScope; label: string }[] = [
  { value: 'per_visit', label: 'Per Visit' },
  { value: 'per_gaming_day', label: 'Per Gaming Day' },
  { value: 'per_week', label: 'Per Week' },
  { value: 'per_month', label: 'Per Month' },
];

// === Helpers ===

function buildInitialRows(reward: RewardDetailDTO): LimitRow[] {
  return reward.limits.map((l) => ({
    key: l.id,
    scope: l.scope,
    maxIssues: l.maxIssues,
    cooldownMinutes: l.cooldownMinutes,
    requiresNote: l.requiresNote,
  }));
}

// === Component Props ===

interface RewardLimitsFormProps {
  reward: RewardDetailDTO;
  /** When true, form is read-only (pit_boss view) */
  readOnly?: boolean;
}

/**
 * Form for managing reward frequency limits (PRD-061).
 *
 * Displays a table of limit rules with:
 * - Scope (per_visit, per_gaming_day, per_week, per_month)
 * - Max issues per scope window
 * - Cooldown minutes (optional)
 * - Requires note toggle
 *
 * Save calls useUpdateReward with replace-all limits payload.
 * Unique constraint: one rule per scope per reward (enforced client + server).
 *
 * @see PRD-061 §4.1 Admin Configuration
 */
export function RewardLimitsForm({
  reward,
  readOnly = false,
}: RewardLimitsFormProps) {
  const [rows, setRows] = useState<LimitRow[]>(() => buildInitialRows(reward));
  const [isPending, startTransition] = useTransition();
  const updateReward = useUpdateReward();

  function handleAddRow() {
    const usedScopes = new Set(rows.map((r) => r.scope));
    const nextScope =
      SCOPE_OPTIONS.find((s) => !usedScopes.has(s.value))?.value ??
      'per_gaming_day';

    setRows((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        scope: nextScope,
        maxIssues: 1,
        cooldownMinutes: null,
        requiresNote: false,
      },
    ]);
  }

  function handleRemoveRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function handleRowChange<K extends keyof LimitRow>(
    key: string,
    field: K,
    value: LimitRow[K],
  ) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  function handleSave() {
    // Validate no duplicate scopes
    const scopeSet = new Set<LimitScope>();
    for (const row of rows) {
      if (scopeSet.has(row.scope)) {
        toast.error(
          `Duplicate scope: ${row.scope}. Each scope can appear once per reward.`,
        );
        return;
      }
      scopeSet.add(row.scope);
    }

    // Validate max issues
    for (const row of rows) {
      if (row.maxIssues < 1 || !Number.isInteger(row.maxIssues)) {
        toast.error('Max issues must be a positive integer');
        return;
      }
    }

    // Validate cooldown
    for (const row of rows) {
      if (
        row.cooldownMinutes !== null &&
        (row.cooldownMinutes < 0 || !Number.isInteger(row.cooldownMinutes))
      ) {
        toast.error('Cooldown minutes must be a non-negative integer');
        return;
      }
    }

    const limits = rows.map((row) => ({
      scope: row.scope,
      maxIssues: row.maxIssues,
      cooldownMinutes: row.cooldownMinutes ?? undefined,
      requiresNote: row.requiresNote,
    }));

    startTransition(async () => {
      try {
        await updateReward.mutateAsync({
          id: reward.id,
          limits: limits.length > 0 ? limits : null,
          idempotencyKey: `update-reward-${reward.id}-limits-${Date.now()}`,
        });
        toast.success('Frequency rules saved');
      } catch {
        toast.error('Failed to save frequency rules');
      }
    });
  }

  function handleReset() {
    setRows(buildInitialRows(reward));
  }

  const canAddRow = rows.length < SCOPE_OPTIONS.length;

  return (
    <Card data-testid="reward-limits-form">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Frequency Rules</CardTitle>
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddRow}
              disabled={!canAddRow || isPending}
              data-testid="add-limit-row-button"
            >
              Add Rule
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p
            className="py-4 text-center text-sm text-muted-foreground"
            data-testid="no-limits-message"
          >
            No frequency rules configured.
            {!readOnly && ' Click "Add Rule" to add one.'}
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Max Issues</TableHead>
                  <TableHead>Cooldown (min)</TableHead>
                  <TableHead>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted">
                          Req. Note
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Require operator to provide a justification note when
                        issuing this reward.
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  {!readOnly && <TableHead className="w-[60px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.key}
                    data-testid={`limit-row-${row.scope}`}
                  >
                    {/* Scope Select */}
                    <TableCell>
                      {readOnly ? (
                        <span className="text-sm">
                          {
                            SCOPE_OPTIONS.find((s) => s.value === row.scope)
                              ?.label
                          }
                        </span>
                      ) : (
                        <Select
                          value={row.scope}
                          onValueChange={(v) =>
                            handleRowChange(row.key, 'scope', v as LimitScope)
                          }
                        >
                          <SelectTrigger
                            className="w-[160px]"
                            aria-label="Scope"
                            data-testid={`scope-select-${row.key}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SCOPE_OPTIONS.map((s) => (
                              <SelectItem key={s.value} value={s.value}>
                                {s.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>

                    {/* Max Issues */}
                    <TableCell>
                      {readOnly ? (
                        <span className="text-sm">{row.maxIssues}</span>
                      ) : (
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={row.maxIssues}
                          onChange={(e) =>
                            handleRowChange(
                              row.key,
                              'maxIssues',
                              parseInt(e.target.value, 10) || 1,
                            )
                          }
                          className="w-[80px]"
                          aria-label="Max issues"
                          data-testid={`max-issues-input-${row.key}`}
                        />
                      )}
                    </TableCell>

                    {/* Cooldown Minutes */}
                    <TableCell>
                      {readOnly ? (
                        <span className="text-sm">
                          {row.cooldownMinutes ?? '-'}
                        </span>
                      ) : (
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={row.cooldownMinutes ?? ''}
                          placeholder="-"
                          onChange={(e) =>
                            handleRowChange(
                              row.key,
                              'cooldownMinutes',
                              e.target.value
                                ? parseInt(e.target.value, 10)
                                : null,
                            )
                          }
                          className="w-[100px]"
                          aria-label="Cooldown minutes"
                          data-testid={`cooldown-input-${row.key}`}
                        />
                      )}
                    </TableCell>

                    {/* Requires Note */}
                    <TableCell>
                      <Switch
                        checked={row.requiresNote}
                        disabled={readOnly || isPending}
                        onCheckedChange={(checked) =>
                          handleRowChange(row.key, 'requiresNote', checked)
                        }
                        aria-label="Requires note"
                        data-testid={`requires-note-${row.key}`}
                      />
                    </TableCell>

                    {/* Remove Button */}
                    {!readOnly && (
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveRow(row.key)}
                          disabled={isPending}
                          aria-label={`Remove ${row.scope} rule`}
                          data-testid={`remove-limit-${row.key}`}
                        >
                          &times;
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Actions (admin only) */}
        {!readOnly && (
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isPending}
            >
              Reset
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending}
              data-testid="save-limits-button"
            >
              {isPending ? 'Saving...' : 'Save Rules'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
