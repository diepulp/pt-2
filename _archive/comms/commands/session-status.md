---
description: Show current session state and memory stats
---

Query and display the current context management session status:

## Information to Retrieve

1. **Session Metadata**
   - Current session ID (if available)
   - Session duration
   - Active chatmode
   - Associated workflow (if any)

2. **Event Statistics**
   - Total event count
   - Event breakdown by type (user_message, model_message, tool_call)
   - Approximate token usage

3. **State/Scratchpad**
   - Current scratchpad contents
   - Validation gates passed
   - Key artifacts created

4. **Memory Context**
   - Recently retrieved memories (last 5)
   - Proactively injected memories
   - Memory categories in use

5. **Compaction Status**
   - Current compaction strategy active
   - Turn count vs max_turns threshold
   - Token count vs budget
   - Last checkpoint summary (if any)

## Output Format

```
SESSION STATUS
==============
ID: {session_id}
Duration: {duration}
Chatmode: {chatmode}
Workflow: {workflow}

EVENTS
------
Total: {count}
  - user_message: {n}
  - model_message: {n}
  - tool_call: {n}
Tokens: ~{token_count} / {budget}

SCRATCHPAD
----------
{scratchpad_contents}

MEMORIES
--------
Proactive: {n} injected
Recent: {n} retrieved

COMPACTION
----------
Strategy: {strategy}
Turns: {turns} / {max_turns}
Status: {status}
```

## Implementation Notes

- Use `lib/context/session.py` SessionService for session data
- Use `lib/memori/retrieval.py` MemoryRetriever for memory stats
- Use `lib/context/compaction.py` for compaction status
- Fall back gracefully if no active session exists
