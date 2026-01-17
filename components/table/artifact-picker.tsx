"use client";

import { Plus, Check, Loader2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface ArtifactPickerProps<T extends { id: string }> {
  /** Label for the picker */
  label: string;
  /** Whether the picker is enabled/checked */
  enabled: boolean;
  /** Toggle enabled state */
  onEnabledChange: (enabled: boolean) => void;
  /** Available items to select from */
  items: T[];
  /** Loading state for items */
  isLoading: boolean;
  /** Currently selected item ID */
  selectedId: string | null;
  /** Selection change handler */
  onSelect: (id: string | null) => void;
  /** Handler for creating a new item */
  onCreate: () => void;
  /** Label for the create button */
  createLabel: string;
  /** Render function for item display in dropdown */
  renderItem: (item: T) => { label: string; description?: string };
  /** Optional icon */
  icon?: React.ReactNode;
  /** Empty state message */
  emptyMessage?: string;
}

/**
 * ArtifactPicker
 *
 * Generic picker component for selecting or creating artifacts.
 * Used in CloseSessionDialog for drop events and inventory snapshots.
 *
 * @see GAP-TABLE-ROLLOVER-UI WS2
 */
export function ArtifactPicker<T extends { id: string }>({
  label,
  enabled,
  onEnabledChange,
  items,
  isLoading,
  selectedId,
  onSelect,
  onCreate,
  createLabel,
  renderItem,
  icon,
  emptyMessage = "No items available",
}: ArtifactPickerProps<T>) {
  const selectedItem = items.find((item) => item.id === selectedId);
  const hasItems = items.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        enabled ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        {/* Enable Checkbox */}
        <button
          type="button"
          role="checkbox"
          aria-checked={enabled}
          onClick={() => {
            onEnabledChange(!enabled);
            if (enabled) {
              onSelect(null);
            }
          }}
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            enabled
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/30",
          )}
        >
          {enabled && <Check className="size-3" />}
        </button>

        <div className="flex-1 space-y-3">
          {/* Label with icon */}
          <Label
            className={cn(
              "flex cursor-pointer items-center gap-2",
              !enabled && "text-muted-foreground",
            )}
            onClick={() => onEnabledChange(!enabled)}
          >
            {icon}
            {label}
          </Label>

          {/* Selection Controls (only shown when enabled) */}
          {enabled && (
            <div className="space-y-2">
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading...
                </div>
              ) : hasItems ? (
                <Select
                  value={selectedId ?? ""}
                  onValueChange={(v) => onSelect(v || null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select an existing item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => {
                      const { label: itemLabel, description } =
                        renderItem(item);
                      return (
                        <SelectItem key={item.id} value={item.id}>
                          <div className="flex flex-col">
                            <span>{itemLabel}</span>
                            {description && (
                              <span className="text-xs text-muted-foreground">
                                {description}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">{emptyMessage}</p>
              )}

              {/* Create New Button */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={onCreate}
              >
                <Plus className="mr-2 size-4" />
                {createLabel}
              </Button>

              {/* Selected Item Preview */}
              {selectedItem && (
                <div className="rounded-md bg-muted/50 p-2 text-sm">
                  <div className="font-medium">
                    {renderItem(selectedItem).label}
                  </div>
                  {renderItem(selectedItem).description && (
                    <div className="text-muted-foreground">
                      {renderItem(selectedItem).description}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
