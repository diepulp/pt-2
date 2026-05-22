---
description: End the current context session and trigger memory extraction
---

End the current context management session and trigger the memory generation pipeline.

## What This Does

1. **Ends the session** - Marks the session as ended in `context.sessions`
2. **Triggers memory pipeline** - Extracts candidate memories from session events
3. **Consolidates memories** - Creates/updates entries in `memori.memories`
4. **Cleans up state** - Removes the session state file

## When to Use

- At the end of a work session
- Before switching to a different chatmode
- After completing a major workflow phase
- When you want to persist learnings to long-term memory

## Execution

Run the context session end hook:

```bash
"$CLAUDE_PROJECT_DIR"/.claude/hooks/context-end-session.sh
```

## Output

- Session end confirmation
- Number of memories extracted (if any)
- Any consolidation actions (CREATE/UPDATE/SKIP)

## Notes

- Safe to run if no session is active (graceful no-op)
- Memory extraction runs asynchronously
- Session state file is cleaned up on success
