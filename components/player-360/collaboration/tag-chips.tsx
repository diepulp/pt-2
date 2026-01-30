/**
 * Player 360 Tag Chips (WS-UX-E)
 *
 * Tag chip interactions for applying/removing player tags.
 * Per UX baseline §5: "Tag apply/remove as one-click chips"
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md §5
 * @see EXEC-SPEC-029.md WS-UX-E
 */

'use client';

import { Check, Loader2, Plus, X } from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// === Types ===

/**
 * Tag category per ADR-029.
 */
export type TagCategory = 'vip' | 'attention' | 'service' | 'custom';

/**
 * Player tag for display.
 */
export interface PlayerTag {
  id: string;
  name: string;
  category: TagCategory;
  appliedAt: string;
  appliedBy: {
    id: string;
    name: string;
  };
}

// === Category Styling ===

interface TagCategoryStyle {
  bg: string;
  text: string;
  border: string;
}

const TAG_CATEGORY_STYLES: Record<TagCategory, TagCategoryStyle> = {
  vip: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
  },
  attention: {
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/30',
  },
  service: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
  },
  custom: {
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
  },
};

// === Tag Chips Component ===

interface TagChipsProps {
  /** Currently applied tags */
  tags: PlayerTag[];
  /** Callback when tag is removed */
  onRemove?: (tagId: string) => Promise<void>;
  /** Callback when tag is applied */
  onApply?: (tagName: string) => Promise<void>;
  /** Available tags for suggestions */
  availableTags?: string[];
  /** Whether removal requires confirmation */
  confirmRemoval?: boolean;
  className?: string;
}

/**
 * Tag chips component with apply/remove functionality.
 */
export function TagChips({
  tags,
  onRemove,
  onApply,
  availableTags = [],
  confirmRemoval = true,
  className,
}: TagChipsProps) {
  const [removingTagId, setRemovingTagId] = React.useState<string | null>(null);
  const [tagToRemove, setTagToRemove] = React.useState<PlayerTag | null>(null);
  const [isApplying, setIsApplying] = React.useState(false);
  const [addPopoverOpen, setAddPopoverOpen] = React.useState(false);

  // Get tags not yet applied
  const appliedTagNames = new Set(tags.map((t) => t.name.toLowerCase()));
  const suggestedTags = availableTags.filter(
    (t) => !appliedTagNames.has(t.toLowerCase()),
  );

  // Handle tag removal
  const handleRemoveClick = (tag: PlayerTag) => {
    if (confirmRemoval) {
      setTagToRemove(tag);
    } else {
      executeRemove(tag.id);
    }
  };

  const executeRemove = async (tagId: string) => {
    if (!onRemove) return;

    setRemovingTagId(tagId);
    try {
      await onRemove(tagId);
    } finally {
      setRemovingTagId(null);
      setTagToRemove(null);
    }
  };

  // Handle tag application
  const handleApply = async (tagName: string) => {
    if (!onApply) return;

    setIsApplying(true);
    try {
      await onApply(tagName);
      setAddPopoverOpen(false);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className={cn('space-y-3', className)}>
      {/* Applied tags */}
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            onRemove={onRemove ? () => handleRemoveClick(tag) : undefined}
            isRemoving={removingTagId === tag.id}
          />
        ))}

        {/* Add tag button */}
        {onApply && (
          <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs gap-1 border-dashed"
                disabled={isApplying}
              >
                {isApplying ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
                Add tag
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search or create tag..." />
                <CommandList>
                  <CommandEmpty>
                    <div className="px-2 py-3 text-sm text-center">
                      <p className="text-muted-foreground mb-2">
                        No matching tags
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          // Create custom tag from search input
                          const input =
                            document.querySelector<HTMLInputElement>(
                              '[cmdk-input]',
                            );
                          if (input?.value) {
                            handleApply(input.value);
                          }
                        }}
                      >
                        Create custom tag
                      </Button>
                    </div>
                  </CommandEmpty>
                  {suggestedTags.length > 0 && (
                    <CommandGroup heading="Suggestions">
                      {suggestedTags.map((tagName) => (
                        <CommandItem
                          key={tagName}
                          value={tagName}
                          onSelect={() => handleApply(tagName)}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-3 w-3',
                              'opacity-0', // Always hidden since these are suggestions
                            )}
                          />
                          {tagName}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Tag count */}
      {tags.length > 0 && (
        <p className="text-[10px] text-muted-foreground/60">
          {tags.length} tag{tags.length !== 1 ? 's' : ''} applied
        </p>
      )}

      {/* Remove confirmation dialog using Dialog */}
      {tagToRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setTagToRemove(null)}
        >
          <div
            className="bg-card border border-border rounded-lg p-6 max-w-md mx-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-2">Remove tag?</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Are you sure you want to remove the tag &quot;{tagToRemove.name}
              &quot;? This action can be undone by re-applying the tag.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTagToRemove(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => executeRemove(tagToRemove.id)}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// === Individual Tag Chip ===

interface TagChipProps {
  tag: PlayerTag;
  onRemove?: () => void;
  isRemoving?: boolean;
  className?: string;
}

/**
 * Individual tag chip with optional remove button.
 */
export function TagChip({
  tag,
  onRemove,
  isRemoving = false,
  className,
}: TagChipProps) {
  const style = TAG_CATEGORY_STYLES[tag.category];

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-6 pl-2 pr-1 text-xs gap-1',
        style.bg,
        style.text,
        style.border,
        isRemoving && 'opacity-50',
        className,
      )}
    >
      {tag.name}
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={isRemoving}
          className={cn(
            'ml-0.5 p-0.5 rounded-sm hover:bg-black/10 dark:hover:bg-white/10',
            'transition-colors',
          )}
          aria-label={`Remove ${tag.name} tag`}
        >
          {isRemoving ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <X className="h-3 w-3" />
          )}
        </button>
      )}
    </Badge>
  );
}

// === Predefined Tags ===

/**
 * Common predefined tags organized by category.
 */
export const PREDEFINED_TAGS: Record<TagCategory, string[]> = {
  vip: ['VIP', 'High Roller', 'Gold Member', 'Platinum Member'],
  attention: ['Watch', 'Banned', 'Self-Excluded', 'Problem Gambler'],
  service: ['Comp Pending', 'Host Assigned', 'Birthday', 'Anniversary'],
  custom: [],
};

/**
 * Returns all predefined tags as a flat array.
 */
export function getAllPredefinedTags(): string[] {
  return Object.values(PREDEFINED_TAGS).flat();
}

/**
 * Returns the category for a predefined tag.
 */
export function getTagCategory(tagName: string): TagCategory {
  for (const [category, tags] of Object.entries(PREDEFINED_TAGS)) {
    if (tags.includes(tagName)) {
      return category as TagCategory;
    }
  }
  return 'custom';
}
