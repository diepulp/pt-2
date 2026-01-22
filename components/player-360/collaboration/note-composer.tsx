/**
 * Player 360 Note Composer (WS-UX-E)
 *
 * Inline note composer with visibility selection.
 * Per UX baseline §5: "Inline note composer (right rail)"
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md §5
 * @see EXEC-SPEC-029.md WS-UX-E
 */

"use client";

import { Eye, EyeOff, Loader2, Send, Users } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { NoteVisibility } from "./panel";

// === Visibility Config ===

interface VisibilityOption {
  value: NoteVisibility;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: "private",
    label: "Private",
    description: "Only you can see this",
    icon: <EyeOff className="h-3.5 w-3.5" />,
  },
  {
    value: "team",
    label: "Team",
    description: "Your shift team can see this",
    icon: <Users className="h-3.5 w-3.5" />,
  },
  {
    value: "all",
    label: "All Staff",
    description: "All staff can see this",
    icon: <Eye className="h-3.5 w-3.5" />,
  },
];

// === Note Composer ===

interface NoteComposerProps {
  /** Callback when note is submitted */
  onSubmit: (content: string, visibility: NoteVisibility) => Promise<void>;
  /** Whether submission is in progress */
  isSubmitting?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Maximum character count */
  maxLength?: number;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  className?: string;
}

/**
 * Inline note composer with visibility selection.
 */
export function NoteComposer({
  onSubmit,
  isSubmitting = false,
  placeholder = "Add a note about this player...",
  maxLength = 1000,
  autoFocus = false,
  className,
}: NoteComposerProps) {
  const [content, setContent] = React.useState("");
  const [visibility, setVisibility] = React.useState<NoteVisibility>("team");
  const [isFocused, setIsFocused] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const charCount = content.length;
  const isOverLimit = charCount > maxLength;
  const canSubmit = content.trim().length > 0 && !isOverLimit && !isSubmitting;

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      await onSubmit(content.trim(), visibility);
      setContent("");
      // Keep visibility for next note
    } catch {
      // Error handling is done in parent
    }
  };

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to submit
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Expand textarea when focused or has content
  const isExpanded = isFocused || content.length > 0;

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "rounded-lg border border-border/40 bg-card/50",
        "transition-all duration-200",
        isExpanded && "border-accent/30",
        className,
      )}
    >
      {/* Textarea */}
      <Textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isSubmitting}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        className={cn(
          "resize-none border-0 bg-transparent",
          "focus-visible:ring-0 focus-visible:ring-offset-0",
          "placeholder:text-muted-foreground/50",
          "transition-all duration-200",
          isExpanded ? "min-h-[80px]" : "min-h-[44px]",
        )}
        maxLength={maxLength + 100} // Allow typing over to show warning
      />

      {/* Footer (shown when expanded) */}
      {isExpanded && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/30">
          {/* Left: Visibility selector */}
          <div className="flex items-center gap-2">
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as NoteVisibility)}
              disabled={isSubmitting}
            >
              <SelectTrigger className="h-7 w-[110px] text-xs border-border/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VISIBILITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      {option.icon}
                      <span>{option.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Character count */}
            <span
              className={cn(
                "text-[10px]",
                isOverLimit ? "text-red-400" : "text-muted-foreground/60",
              )}
            >
              {charCount}/{maxLength}
            </span>
          </div>

          {/* Right: Submit button */}
          <Button
            type="submit"
            size="sm"
            disabled={!canSubmit}
            className="h-7 px-3 text-xs gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Add Note
              </>
            )}
          </Button>
        </div>
      )}

      {/* Keyboard hint (shown when focused) */}
      {isFocused && content.length > 0 && (
        <div className="px-3 pb-2">
          <p className="text-[10px] text-muted-foreground/50">
            Press{" "}
            <kbd className="px-1 py-0.5 rounded bg-muted/50 font-mono text-[9px]">
              ⌘ Enter
            </kbd>{" "}
            to submit
          </p>
        </div>
      )}
    </form>
  );
}

// === Quick Note Button ===

interface QuickNoteButtonProps {
  /** Predefined note content */
  content: string;
  /** Button label */
  label: string;
  /** Callback when clicked */
  onClick: (content: string) => void;
  /** Icon (optional) */
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Quick action button for common note types.
 */
export function QuickNoteButton({
  content,
  label,
  onClick,
  icon,
  className,
}: QuickNoteButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => onClick(content)}
      className={cn("h-7 px-2 text-xs gap-1.5", className)}
    >
      {icon}
      {label}
    </Button>
  );
}

// === Quick Notes Row ===

interface QuickNotesRowProps {
  /** Callback when quick note is selected */
  onSelectNote: (content: string) => void;
  className?: string;
}

/**
 * Row of quick note action buttons.
 */
export function QuickNotesRow({ onSelectNote, className }: QuickNotesRowProps) {
  const quickNotes = [
    { label: "VIP treatment", content: "Provided VIP treatment per request." },
    { label: "Comp issued", content: "Issued complimentary as approved." },
    { label: "ID verified", content: "Identity verified at table." },
    { label: "Follow-up", content: "Follow-up required: " },
  ];

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {quickNotes.map((note) => (
        <QuickNoteButton
          key={note.label}
          label={note.label}
          content={note.content}
          onClick={onSelectNote}
        />
      ))}
    </div>
  );
}
