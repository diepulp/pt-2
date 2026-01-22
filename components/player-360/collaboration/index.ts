/**
 * Player 360 Collaboration Components (WS-UX-E)
 *
 * Public exports for collaboration panel components.
 */

export { CollaborationPanel, NoteCardLoading } from "./panel";
export type { NoteVisibility, PlayerNote, PlayerSnapshot } from "./panel";

export { NoteComposer, QuickNoteButton, QuickNotesRow } from "./note-composer";

export {
  getAllPredefinedTags,
  getTagCategory,
  PREDEFINED_TAGS,
  TagChip,
  TagChips,
} from "./tag-chips";
export type { PlayerTag, TagCategory } from "./tag-chips";
