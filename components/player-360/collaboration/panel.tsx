/**
 * Player 360 Collaboration Panel (WS-UX-E)
 *
 * Right rail collaboration panel with notes, tags, and share functionality.
 * Per UX baseline: "Right rail: Collaboration (notes/tags/tasks) + share to shift report"
 *
 * @see player-360-crm-dashboard-ux-ui-baselines.md §2, §5
 * @see EXEC-SPEC-029.md WS-UX-E
 */

"use client";

import { MessageSquare, Share2, Tag, Users } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { NotesEmpty, TagsEmpty } from "../empty-states";
import { Panel, PanelContent, PanelHeader } from "../layout";
import { CollaborationRailSkeleton, NoteSkeleton } from "../skeletons";

import { NoteComposer } from "./note-composer";
import { TagChips, type PlayerTag } from "./tag-chips";

// === Types ===

/**
 * Note visibility levels per ADR-029.
 */
export type NoteVisibility = "private" | "team" | "all";

/**
 * Player note for display in collaboration panel.
 */
export interface PlayerNote {
  id: string;
  content: string;
  visibility: NoteVisibility;
  createdAt: string;
  createdBy: {
    id: string;
    name: string;
  };
}

/**
 * Snapshot payload for "Share to Shift Report" feature.
 * Per UX baseline §8: shareable player snapshot component.
 */
export interface PlayerSnapshot {
  playerId: string;
  playerName: string;
  engagementBand: "active" | "cooling" | "dormant";
  lastSeen: string;
  todayCashIn: number;
  todayCashOut: number;
  tags: string[];
  note?: string;
}

// === Panel Props ===

interface CollaborationPanelProps {
  /** Player ID */
  playerId: string;
  /** Player name for display */
  playerName: string;
  /** Player notes (fetched externally) */
  notes: PlayerNote[];
  /** Player tags (fetched externally) */
  tags: PlayerTag[];
  /** Loading state */
  isLoading?: boolean;
  /** Error state */
  error?: Error | null;
  /** Callback when note is submitted */
  onSubmitNote?: (content: string, visibility: NoteVisibility) => Promise<void>;
  /** Callback when tag is applied */
  onApplyTag?: (tagName: string) => Promise<void>;
  /** Callback when tag is removed */
  onRemoveTag?: (tagId: string) => Promise<void>;
  /** Callback when share to shift report is clicked */
  onShareToShift?: (snapshot: PlayerSnapshot) => void;
  /** Available tags for suggestions */
  availableTags?: string[];
  /** Whether note submission is in progress */
  isSubmittingNote?: boolean;
  className?: string;
}

/**
 * Collaboration panel with notes, tags, and share functionality.
 */
export function CollaborationPanel({
  playerId,
  playerName,
  notes,
  tags,
  isLoading = false,
  error,
  onSubmitNote,
  onApplyTag,
  onRemoveTag,
  onShareToShift,
  availableTags = [],
  isSubmittingNote = false,
  className,
}: CollaborationPanelProps) {
  const [activeTab, setActiveTab] = React.useState<"notes" | "tags">("notes");

  // Loading state
  if (isLoading) {
    return <CollaborationRailSkeleton className={className} />;
  }

  // Error state - still show panel but with limited functionality
  if (error) {
    return (
      <Panel className={cn("h-full flex flex-col", className)}>
        <PanelHeader
          icon={<Users className="h-4 w-4 text-accent" />}
          title="Collaboration"
        />
        <PanelContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-sm text-muted-foreground">
            <p>Unable to load collaboration data</p>
            <p className="text-xs mt-1">{error.message}</p>
          </div>
        </PanelContent>
      </Panel>
    );
  }

  const handleShareToShift = () => {
    if (!onShareToShift) return;

    // Build snapshot from current state
    const snapshot: PlayerSnapshot = {
      playerId,
      playerName,
      engagementBand: "active", // TODO: derive from metrics
      lastSeen: new Date().toISOString(),
      todayCashIn: 0, // TODO: derive from financial data
      todayCashOut: 0,
      tags: tags.map((t) => t.name),
    };

    onShareToShift(snapshot);
  };

  return (
    <Panel className={cn("h-full flex flex-col", className)}>
      <PanelHeader
        icon={<Users className="h-4 w-4 text-accent" />}
        title="Collaboration"
        actions={
          onShareToShift && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShareToShift}
              className="h-7 px-2 text-xs gap-1.5"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          )
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "notes" | "tags")}
        className="flex-1 flex flex-col min-h-0"
      >
        <TabsList className="w-full justify-start px-4 py-0 h-10 bg-transparent border-b border-border/40 rounded-none">
          <TabsTrigger
            value="notes"
            className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Notes
            {notes.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({notes.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="tags"
            className="gap-1.5 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-accent rounded-none"
          >
            <Tag className="h-3.5 w-3.5" />
            Tags
            {tags.length > 0 && (
              <span className="ml-1 text-xs text-muted-foreground">
                ({tags.length})
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="notes"
          className="flex-1 flex flex-col min-h-0 mt-0 p-4 space-y-4"
        >
          {/* Note composer */}
          {onSubmitNote && (
            <NoteComposer
              onSubmit={onSubmitNote}
              isSubmitting={isSubmittingNote}
            />
          )}

          {/* Notes list */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {notes.length === 0 ? (
              <NotesEmpty
                onAddNote={() => {
                  // Focus composer
                }}
              />
            ) : (
              notes.map((note) => <NoteCard key={note.id} note={note} />)
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="tags"
          className="flex-1 flex flex-col min-h-0 mt-0 p-4 space-y-4"
        >
          {/* Tag chips */}
          {tags.length === 0 && !onApplyTag ? (
            <TagsEmpty />
          ) : (
            <TagChips
              tags={tags}
              onRemove={onRemoveTag}
              onApply={onApplyTag}
              availableTags={availableTags}
            />
          )}
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

// === Note Card ===

interface NoteCardProps {
  note: PlayerNote;
  className?: string;
}

/**
 * Individual note card in the notes list.
 */
function NoteCard({ note, className }: NoteCardProps) {
  const visibilityLabels: Record<NoteVisibility, string> = {
    private: "Private",
    team: "Team",
    all: "All Staff",
  };

  const visibilityColors: Record<NoteVisibility, string> = {
    private: "bg-slate-500/10 text-slate-400",
    team: "bg-blue-500/10 text-blue-400",
    all: "bg-green-500/10 text-green-400",
  };

  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg",
        "border border-border/40 bg-card/50",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">
            {note.createdBy.name}
          </span>
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              visibilityColors[note.visibility],
            )}
          >
            {visibilityLabels[note.visibility]}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatTimestamp(note.createdAt)}
        </span>
      </div>

      {/* Content */}
      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
        {note.content}
      </p>
    </div>
  );
}

// === Loading Note Card ===

export function NoteCardLoading() {
  return <NoteSkeleton />;
}
