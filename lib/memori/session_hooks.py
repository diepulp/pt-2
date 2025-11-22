#!/usr/bin/env python3
"""
Session hooks for Memori integration with PT-2 agentic workflows.

These hooks are called at session start and end to enable cross-session continuity.
"""

import os
import sys
from pathlib import Path
from datetime import datetime
from loguru import logger

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from lib.memori.client import create_memori_client, get_chatmode_from_context
from lib.memori.workflow_state import WorkflowStateManager
from lib.memori.chatmode_context import ChatmodeContext


def on_session_start(chatmode: str = None) -> dict:
    """
    Initialize Memori at session start.

    This hook:
    1. Creates Memori client for current chatmode
    2. Enables automatic conversation recording
    3. Loads recent session context
    4. Records session start

    Args:
        chatmode: Optional chatmode name (auto-detected if not provided)

    Returns:
        dict with status and context information
    """
    try:
        # Detect chatmode
        if not chatmode:
            chatmode = get_chatmode_from_context()

        logger.info(f"🚀 Starting Memori session for chatmode: {chatmode}")

        # Create and enable Memori client
        memori = create_memori_client(chatmode)
        success = memori.enable()

        if not success:
            logger.warning("Memori not available, continuing without memory")
            return {
                "status": "disabled",
                "chatmode": chatmode,
                "message": "Memori not available (SDK not installed or DB not accessible)"
            }

        # Create context manager
        context = ChatmodeContext(memori)

        # Load recent session context
        recent_memories = context.get_recent_context(limit=5)

        # Record session start
        session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        context.record_session_summary(
            summary=f"Started new {chatmode} session",
            tasks_completed=[],
            files_modified=[],
            next_steps=None
        )

        logger.success(f"✅ Memori enabled for {chatmode} (session_id: {session_id})")
        logger.info(f"Loaded {len(recent_memories)} recent memories")

        return {
            "status": "enabled",
            "chatmode": chatmode,
            "session_id": session_id,
            "recent_memories_count": len(recent_memories),
            "message": f"Memori ready with Combined Mode (conscious + auto)"
        }

    except Exception as e:
        logger.error(f"Error in on_session_start: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


def on_session_end(
    chatmode: str = None,
    tasks_completed: list = None,
    files_modified: list = None,
    next_steps: list = None
) -> dict:
    """
    Finalize Memori at session end.

    This hook:
    1. Records session summary
    2. Triggers conscious analysis
    3. Disables Memori

    Args:
        chatmode: Optional chatmode name
        tasks_completed: List of completed tasks
        files_modified: List of modified files
        next_steps: Optional next steps

    Returns:
        dict with status information
    """
    try:
        # Detect chatmode
        if not chatmode:
            chatmode = get_chatmode_from_context()

        logger.info(f"👋 Ending Memori session for chatmode: {chatmode}")

        # Create Memori client
        memori = create_memori_client(chatmode)

        if not memori.enabled:
            logger.warning("Memori not enabled, nothing to finalize")
            return {
                "status": "disabled",
                "chatmode": chatmode
            }

        # Create context manager
        context = ChatmodeContext(memori)

        # Record session summary
        summary = f"Completed {chatmode} session"
        if tasks_completed:
            summary += f" - {len(tasks_completed)} tasks completed"

        context.record_session_summary(
            summary=summary,
            tasks_completed=tasks_completed or [],
            files_modified=files_modified or [],
            next_steps=next_steps
        )

        # Trigger conscious analysis (promote important memories)
        memori.trigger_conscious_analysis()

        # Disable Memori
        memori.disable()

        logger.success(f"✅ Memori session ended for {chatmode}")

        return {
            "status": "finalized",
            "chatmode": chatmode,
            "tasks_completed": len(tasks_completed) if tasks_completed else 0,
            "files_modified": len(files_modified) if files_modified else 0
        }

    except Exception as e:
        logger.error(f"Error in on_session_end: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


def get_workflow_context(workflow: str, entity_name: str) -> dict:
    """
    Get workflow context for cross-session recovery.

    Args:
        workflow: Workflow name (create-service, create-adr, etc.)
        entity_name: Entity name

    Returns:
        dict with workflow state or empty dict
    """
    try:
        chatmode = get_chatmode_from_context()
        memori = create_memori_client(chatmode)

        if not memori.enabled:
            return {}

        workflow_manager = WorkflowStateManager(memori)
        state = workflow_manager.load_workflow_state(workflow, entity_name)

        if not state:
            return {}

        return {
            "workflow": state.workflow,
            "entity_name": state.entity_name,
            "current_phase": state.current_phase,
            "phases_completed": state.phases_completed,
            "next_action": state.next_action,
            "spec_file": state.spec_file
        }

    except Exception as e:
        logger.error(f"Error getting workflow context: {e}")
        return {}


if __name__ == "__main__":
    """
    CLI interface for testing hooks.
    """
    import argparse

    parser = argparse.ArgumentParser(description="Memori session hooks")
    parser.add_argument("action", choices=["start", "end", "workflow"],
                       help="Hook action to execute")
    parser.add_argument("--chatmode", type=str, default=None,
                       help="Chatmode name")
    parser.add_argument("--workflow", type=str, default=None,
                       help="Workflow name (for workflow action)")
    parser.add_argument("--entity", type=str, default=None,
                       help="Entity name (for workflow action)")

    args = parser.parse_args()

    if args.action == "start":
        result = on_session_start(args.chatmode)
        print(f"\nSession Start Result:")
        for key, value in result.items():
            print(f"  {key}: {value}")

    elif args.action == "end":
        result = on_session_end(args.chatmode)
        print(f"\nSession End Result:")
        for key, value in result.items():
            print(f"  {key}: {value}")

    elif args.action == "workflow":
        if not args.workflow or not args.entity:
            print("Error: --workflow and --entity required for workflow action")
            sys.exit(1)

        result = get_workflow_context(args.workflow, args.entity)
        print(f"\nWorkflow Context:")
        for key, value in result.items():
            print(f"  {key}: {value}")
