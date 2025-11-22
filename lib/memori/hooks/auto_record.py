#!/usr/bin/env python3
"""
Automatic work recording for Memori PostToolUse hooks.

This script is called automatically by .claude/hooks/memori-record-work.sh
after Write, Edit, MultiEdit, or Bash tool executions.

Purpose:
- Record file modifications to Memori
- Record command executions to Memori
- Build comprehensive work history

Usage:
    python3 auto_record.py --tool Write --chatmode architect --stdin < tool_data.json
"""

import sys
import json
import argparse
from pathlib import Path
from datetime import datetime

# Add project root to path
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

# Import Memori modules (graceful failure if unavailable)
try:
    from lib.memori.client import create_memori_client
    from lib.memori.chatmode_context import ChatmodeContext
    MEMORI_AVAILABLE = True
except Exception as e:
    MEMORI_AVAILABLE = False


def record_file_modification(chatmode: str, tool_name: str, tool_data: dict):
    """
    Record file modification work to Memori.

    Args:
        chatmode: Current chatmode (e.g., 'architect', 'service-engineer')
        tool_name: Tool that was used (Write, Edit, MultiEdit)
        tool_data: Tool execution data (file_path, content, etc.)
    """
    if not MEMORI_AVAILABLE:
        return

    try:
        # Create Memori client
        memori = create_memori_client(chatmode)
        if not memori or not memori.enabled:
            return

        context = ChatmodeContext(memori)

        # Extract file path
        file_path = tool_data.get('file_path', 'unknown')

        # Determine entity name from file path
        entity_name = Path(file_path).stem if file_path != 'unknown' else 'file_modification'

        # Record as implementation work
        context.record_implementation(
            entity_name=entity_name,
            entity_type="file_modification",
            files_created=[file_path],
            pattern="auto_recorded",
            test_coverage=None  # Unknown at this point
        )

    except Exception:
        # Non-blocking - silently fail if recording fails
        pass


def record_command_execution(chatmode: str, tool_data: dict):
    """
    Record Bash command execution to Memori.

    Args:
        chatmode: Current chatmode
        tool_data: Command execution data
    """
    if not MEMORI_AVAILABLE:
        return

    try:
        # Create Memori client
        memori = create_memori_client(chatmode)
        if not memori or not memori.enabled:
            return

        # Extract command
        command = tool_data.get('command', 'unknown')

        # Record command execution as a memory
        memori.record_memory(
            content=f"Executed command: {command}",
            category="context",
            metadata={
                "chatmode": chatmode,
                "command": command,
                "timestamp": datetime.now().isoformat(),
                "auto_recorded": True
            },
            importance=0.5  # Medium importance
        )

    except Exception:
        # Non-blocking - silently fail
        pass


def main():
    """Main entry point for auto-recording."""
    parser = argparse.ArgumentParser(description="Automatic work recording for Memori")
    parser.add_argument("--tool", required=True, help="Tool name (Write, Edit, Bash, etc.)")
    parser.add_argument("--chatmode", required=True, help="Current chatmode")
    parser.add_argument("--stdin", action="store_true", help="Read tool data from stdin")

    args = parser.parse_args()

    # Read tool data from stdin if available
    tool_data = {}
    if args.stdin:
        try:
            raw_input = sys.stdin.read()
            if raw_input.strip():
                tool_data = json.loads(raw_input)
        except (json.JSONDecodeError, ValueError):
            # Invalid JSON - continue with empty tool_data
            pass

    # Record based on tool type
    if args.tool in ['Write', 'Edit', 'MultiEdit']:
        record_file_modification(args.chatmode, args.tool, tool_data)
    elif args.tool == 'Bash':
        record_command_execution(args.chatmode, tool_data)

    # Exit successfully (non-blocking)
    sys.exit(0)


if __name__ == "__main__":
    main()
