"use client";

import {
  AlertCircle,
  Edit2,
  FileText,
  Flag,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Mock notes data - will be replaced with service layer
const MOCK_NOTES = [
  {
    id: "n1",
    title: "Prefers corner seat",
    content: "Player consistently requests seat 1 or 7 at blackjack tables.",
    category: "preference",
    priority: "normal",
    isFlagged: false,
    createdAt: "2024-01-15T10:30:00Z",
    createdBy: "J. Smith",
  },
  {
    id: "n2",
    title: "VIP drink preference",
    content: "Prefers Macallan 18 on the rocks. Comp approved.",
    category: "vip",
    priority: "high",
    isFlagged: true,
    createdAt: "2024-01-14T14:20:00Z",
    createdBy: "M. Johnson",
  },
  {
    id: "n3",
    title: "Session limit reminder",
    content: "Player requested time limit reminders at 2 hours.",
    category: "behavioral",
    priority: "normal",
    isFlagged: false,
    createdAt: "2024-01-10T09:15:00Z",
    createdBy: "S. Williams",
  },
];

const CATEGORY_CONFIG = {
  preference: { color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  behavioral: {
    color: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
  incident: { color: "bg-red-500/20 text-red-400 border-red-500/30" },
  vip: { color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  general: { color: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
};

interface NotesPanelProps {
  playerId: string | null;
  className?: string;
}

export function NotesPanel({ playerId, className }: NotesPanelProps) {
  const [notes, setNotes] = React.useState(MOCK_NOTES);
  const [isAddingNote, setIsAddingNote] = React.useState(false);
  const [newNote, setNewNote] = React.useState({ title: "", content: "" });

  if (!playerId) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm h-full",
          className,
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/30 to-transparent" />
        <div className="flex flex-col items-center justify-center h-full p-6">
          <div className="w-12 h-12 rounded-full bg-muted/50 border border-border/50 flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Notes unavailable
          </p>
        </div>
      </div>
    );
  }

  const handleAddNote = () => {
    if (!newNote.title.trim() || !newNote.content.trim()) return;

    const note = {
      id: `n${Date.now()}`,
      title: newNote.title,
      content: newNote.content,
      category: "general" as const,
      priority: "normal" as const,
      isFlagged: false,
      createdAt: new Date().toISOString(),
      createdBy: "Current User",
    };

    setNotes([note, ...notes]);
    setNewNote({ title: "", content: "" });
    setIsAddingNote(false);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border/40 bg-card/50 backdrop-blur-sm flex flex-col",
        className,
      )}
    >
      {/* LED accent strip */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent/10 border border-accent/20">
            <FileText className="h-4 w-4 text-accent" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight">Player Notes</h3>
          {notes.length > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 ml-1">
              {notes.length}
            </Badge>
          )}
        </div>

        {!isAddingNote && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAddingNote(true)}
            className="h-7 px-2 text-xs hover:bg-accent/10 hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {/* Add Note Form */}
        {isAddingNote && (
          <div className="p-3 rounded-lg border border-accent/30 bg-accent/5 space-y-2">
            <input
              type="text"
              placeholder="Note title..."
              value={newNote.title}
              onChange={(e) =>
                setNewNote((prev) => ({ ...prev, title: e.target.value }))
              }
              className="w-full px-2 py-1.5 text-sm bg-background/50 border border-border/50 rounded focus:outline-none focus:border-accent/50"
            />
            <textarea
              placeholder="Note content..."
              value={newNote.content}
              onChange={(e) =>
                setNewNote((prev) => ({ ...prev, content: e.target.value }))
              }
              rows={2}
              className="w-full px-2 py-1.5 text-sm bg-background/50 border border-border/50 rounded resize-none focus:outline-none focus:border-accent/50"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAddingNote(false);
                  setNewNote({ title: "", content: "" });
                }}
                className="h-7 px-2 text-xs"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAddNote}
                disabled={!newNote.title.trim() || !newNote.content.trim()}
                className="h-7 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Notes List */}
        {notes.length > 0 ? (
          notes.map((note) => <NoteCard key={note.id} note={note} />)
        ) : (
          <div className="flex flex-col items-center justify-center py-8">
            <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No notes yet</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCard({ note }: { note: (typeof MOCK_NOTES)[0] }) {
  const categoryConfig =
    CATEGORY_CONFIG[note.category as keyof typeof CATEGORY_CONFIG] ||
    CATEGORY_CONFIG.general;

  return (
    <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30 hover:border-border/50 transition-colors group">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {note.isFlagged && (
            <Flag className="h-3 w-3 text-amber-400 shrink-0" />
          )}
          <h4 className="text-sm font-medium truncate">{note.title}</h4>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[9px] h-4 px-1 shrink-0 capitalize",
            categoryConfig.color,
          )}
        >
          {note.category}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
        {note.content}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50">
          {new Date(note.createdAt).toLocaleDateString()} • {note.createdBy}
        </span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
            <Edit2 className="h-3 w-3 text-muted-foreground hover:text-accent" />
          </Button>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0">
            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-red-400" />
          </Button>
        </div>
      </div>
    </div>
  );
}
