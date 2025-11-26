"""
Hook Handlers for Context Management Layer.

Integrates with Claude Code hooks to:
- Log tool calls to session events
- Trigger memory generation on session end
- Create checkpoint summaries at validation gates

Reference: docs/context-engineering/CONTEXT_MANAGEMENT_EVOLUTION_PROPOSAL.md
"""

import os
import json
import sys
from datetime import datetime
from typing import Optional
from loguru import logger

# Configure logger for hook execution
logger.remove()
logger.add(
    sys.stderr,
    format="<level>{level: <8}</level> | <cyan>hooks</cyan> | {message}",
    level="INFO",
)


def get_db_url() -> str:
    """Get database URL from environment."""
    return os.getenv(
        "MEMORI_DATABASE_URL",
        "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
    )


def get_current_session_id() -> Optional[str]:
    """Get current session ID from environment or state file."""
    # Try environment variable first
    session_id = os.getenv("CONTEXT_SESSION_ID")
    if session_id:
        return session_id

    # Try state file
    state_file = os.path.expanduser("~/.claude/context_session_state.json")
    if os.path.exists(state_file):
        try:
            with open(state_file) as f:
                state = json.load(f)
                return state.get("session_id")
        except Exception:
            pass

    return None


def save_session_id(session_id: str):
    """Save session ID to state file."""
    state_file = os.path.expanduser("~/.claude/context_session_state.json")
    os.makedirs(os.path.dirname(state_file), exist_ok=True)

    state = {"session_id": session_id, "updated_at": datetime.now().isoformat()}

    with open(state_file, "w") as f:
        json.dump(state, f)


async def log_tool_call(
    tool_name: str,
    tool_input: dict,
    tool_output: Optional[str] = None,
    session_id: Optional[str] = None,
):
    """
    Log a tool call to the session event log.

    Called by post_tool_call hook.
    """
    try:
        import asyncpg
    except ImportError:
        logger.warning("asyncpg not available, skipping tool call logging")
        return

    session_id = session_id or get_current_session_id()
    if not session_id:
        logger.debug("No active session, skipping tool call log")
        return

    db_url = get_db_url()

    try:
        conn = await asyncpg.connect(db_url)

        # Get next sequence number
        seq_result = await conn.fetchval(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM context.session_events WHERE session_id = $1",
            session_id,
        )

        # Insert tool call event
        await conn.execute(
            """
            INSERT INTO context.session_events
                (session_id, sequence, type, role, content, parts)
            VALUES ($1, $2, 'tool_call', 'tool', $3, $4)
            """,
            session_id,
            seq_result,
            f"Tool: {tool_name}",
            json.dumps({
                "tool_name": tool_name,
                "tool_input": tool_input,
                "tool_output": tool_output[:1000] if tool_output else None,
            }),
        )

        await conn.close()
        logger.debug(f"Logged tool call: {tool_name}")

    except Exception as e:
        logger.error(f"Failed to log tool call: {e}")


async def on_session_start(
    chatmode: str,
    user_id: str = "pt2_agent",
    workflow: Optional[str] = None,
    skill: Optional[str] = None,
) -> Optional[str]:
    """
    Initialize a new session when Claude Code starts.

    Returns the new session ID.
    """
    try:
        import asyncpg
    except ImportError:
        logger.warning("asyncpg not available, session tracking disabled")
        return None

    db_url = get_db_url()

    try:
        conn = await asyncpg.connect(db_url)

        # Get git branch if available
        git_branch = None
        try:
            import subprocess
            result = subprocess.run(
                ["git", "branch", "--show-current"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                git_branch = result.stdout.strip()
        except Exception:
            pass

        # Create new session
        session_id = await conn.fetchval(
            """
            INSERT INTO context.sessions
                (user_id, chatmode, workflow, skill, git_branch)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id::text
            """,
            user_id,
            chatmode,
            workflow,
            skill,
            git_branch,
        )

        # Initialize session state
        await conn.execute(
            """
            INSERT INTO context.session_state (session_id, scratchpad)
            VALUES ($1, '{}'::jsonb)
            """,
            session_id,
        )

        await conn.close()

        # Save session ID for later use
        save_session_id(session_id)

        logger.info(f"Started session {session_id} for chatmode={chatmode}")
        return session_id

    except Exception as e:
        logger.error(f"Failed to start session: {e}")
        return None


async def on_session_end(session_id: Optional[str] = None):
    """
    End a session and trigger memory generation.

    Called when Claude Code session ends.
    """
    session_id = session_id or get_current_session_id()
    if not session_id:
        logger.debug("No active session to end")
        return

    try:
        import asyncpg
    except ImportError:
        logger.warning("asyncpg not available, skipping session end")
        return

    db_url = get_db_url()

    try:
        conn = await asyncpg.connect(db_url)

        # End the session
        await conn.execute(
            "UPDATE context.sessions SET ended_at = now() WHERE id = $1",
            session_id,
        )

        await conn.close()
        logger.info(f"Ended session {session_id}")

        # Trigger memory generation pipeline
        await trigger_memory_pipeline(session_id)

    except Exception as e:
        logger.error(f"Failed to end session: {e}")


async def on_validation_gate_passed(
    gate_number: int,
    description: str = "",
    session_id: Optional[str] = None,
):
    """
    Handle validation gate passage.

    Creates a checkpoint summary and logs the gate event.
    """
    session_id = session_id or get_current_session_id()
    if not session_id:
        logger.debug("No active session for validation gate")
        return

    try:
        import asyncpg
    except ImportError:
        logger.warning("asyncpg not available, skipping gate logging")
        return

    db_url = get_db_url()

    try:
        conn = await asyncpg.connect(db_url)

        # Get next sequence number
        seq_result = await conn.fetchval(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM context.session_events WHERE session_id = $1",
            session_id,
        )

        # Log validation gate event
        await conn.execute(
            """
            INSERT INTO context.session_events
                (session_id, sequence, type, role, content, parts)
            VALUES ($1, $2, 'validation_gate', 'system', $3, $4)
            """,
            session_id,
            seq_result,
            f"Validation Gate {gate_number}: {description}",
            json.dumps({"gate_number": gate_number, "passed": True}),
        )

        # Update session state with passed gate
        await conn.execute(
            """
            UPDATE context.session_state
            SET
                scratchpad = jsonb_set(
                    COALESCE(scratchpad, '{}'::jsonb),
                    '{validation_gates_passed}',
                    (COALESCE(scratchpad->'validation_gates_passed', '[]'::jsonb) || $2::jsonb)
                ),
                updated_at = now()
            WHERE session_id = $1
            """,
            session_id,
            json.dumps([gate_number]),
        )

        await conn.close()
        logger.info(f"Logged validation gate {gate_number} for session {session_id}")

        # Trigger memory extraction at checkpoints
        await trigger_memory_pipeline(session_id)

    except Exception as e:
        logger.error(f"Failed to log validation gate: {e}")


async def trigger_memory_pipeline(session_id: str):
    """Trigger memory generation pipeline for a session."""
    try:
        from lib.memori.pipeline import run_pipeline_for_session

        db_url = get_db_url()
        results = await run_pipeline_for_session(session_id, db_url)

        created = sum(1 for r in results if r.action == "created")
        updated = sum(1 for r in results if r.action == "updated")

        if created or updated:
            logger.info(f"Memory pipeline: {created} created, {updated} updated")

    except ImportError:
        logger.debug("Memory pipeline not available")
    except Exception as e:
        logger.error(f"Memory pipeline failed: {e}")


async def log_user_message(
    content: str,
    session_id: Optional[str] = None,
):
    """Log a user message to the session event log."""
    try:
        import asyncpg
    except ImportError:
        return

    session_id = session_id or get_current_session_id()
    if not session_id:
        return

    db_url = get_db_url()

    try:
        conn = await asyncpg.connect(db_url)

        seq_result = await conn.fetchval(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM context.session_events WHERE session_id = $1",
            session_id,
        )

        await conn.execute(
            """
            INSERT INTO context.session_events
                (session_id, sequence, type, role, content)
            VALUES ($1, $2, 'user_message', 'user', $3)
            """,
            session_id,
            seq_result,
            content,
        )

        await conn.close()

    except Exception as e:
        logger.error(f"Failed to log user message: {e}")


async def log_assistant_message(
    content: str,
    session_id: Optional[str] = None,
):
    """Log an assistant message to the session event log."""
    try:
        import asyncpg
    except ImportError:
        return

    session_id = session_id or get_current_session_id()
    if not session_id:
        return

    db_url = get_db_url()

    try:
        conn = await asyncpg.connect(db_url)

        seq_result = await conn.fetchval(
            "SELECT COALESCE(MAX(sequence), 0) + 1 FROM context.session_events WHERE session_id = $1",
            session_id,
        )

        await conn.execute(
            """
            INSERT INTO context.session_events
                (session_id, sequence, type, role, content)
            VALUES ($1, $2, 'model_message', 'assistant', $3)
            """,
            session_id,
            seq_result,
            content,
        )

        await conn.close()

    except Exception as e:
        logger.error(f"Failed to log assistant message: {e}")


# CLI entry points for hook commands
def main():
    """CLI entry point for hook commands."""
    import asyncio

    if len(sys.argv) < 2:
        print("Usage: python -m lib.context.hooks <command> [args...]")
        print("Commands: log_tool_call, session_start, session_end, validation_gate")
        sys.exit(1)

    command = sys.argv[1]

    if command == "log_tool_call":
        # Args: tool_name [tool_input_json]
        tool_name = sys.argv[2] if len(sys.argv) > 2 else "unknown"
        tool_input = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        asyncio.run(log_tool_call(tool_name, tool_input))

    elif command == "session_start":
        # Args: chatmode [user_id] [workflow]
        chatmode = sys.argv[2] if len(sys.argv) > 2 else "main"
        user_id = sys.argv[3] if len(sys.argv) > 3 else "pt2_agent"
        workflow = sys.argv[4] if len(sys.argv) > 4 else None
        session_id = asyncio.run(on_session_start(chatmode, user_id, workflow))
        if session_id:
            print(session_id)

    elif command == "session_end":
        asyncio.run(on_session_end())

    elif command == "validation_gate":
        # Args: gate_number [description]
        gate_number = int(sys.argv[2]) if len(sys.argv) > 2 else 1
        description = sys.argv[3] if len(sys.argv) > 3 else ""
        asyncio.run(on_validation_gate_passed(gate_number, description))

    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
