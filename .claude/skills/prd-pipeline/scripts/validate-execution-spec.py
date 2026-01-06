#!/usr/bin/env python3
"""
Validate EXECUTION-SPEC YAML before pipeline execution.

This script catches common errors that cause pipeline failures:
- Invalid executor names (skill vs task-agent mismatch)
- Invalid dependencies (referencing non-existent workstreams)
- Circular dependencies
- Missing required fields
- Malformed YAML frontmatter

Usage:
    python validate-execution-spec.py <path-to-execution-spec.md>

Exit codes:
    0 - Validation passed
    1 - Validation failed (errors found)
    2 - File not found or parse error
"""

import sys
import re
from pathlib import Path
from typing import Any

# Valid executor configurations
# DEPRECATED: Task agents should not be used in pipeline execution
# They remain valid only for backwards compatibility warnings
DEPRECATED_TASK_AGENTS = {
    "typescript-pro",
    "general-purpose",
    "Explore",
    "Plan",
}

VALID_SKILLS = {
    "backend-service-builder",
    "api-builder",
    "frontend-design-pt-2",
    "frontend-design:frontend-design-pt-2",  # Plugin skill for PT-2 React components
    "e2e-testing",
    "rls-expert",
    "qa-specialist",
    "performance-engineer",
    "lead-architect",
}

VALID_GATES = {
    "schema-validation",
    "type-check",
    "lint",
    "test-pass",
    "build",
}

REQUIRED_WORKSTREAM_FIELDS = {"name", "executor", "executor_type", "depends_on", "outputs", "gate"}
REQUIRED_TOP_LEVEL_FIELDS = {"prd", "workstreams", "execution_phases"}


def parse_yaml_frontmatter(content: str) -> tuple[dict[str, Any] | None, str]:
    """Extract YAML frontmatter from markdown content.

    Returns tuple of (parsed_yaml, error_message).
    """
    if not content.startswith("---"):
        return None, "Missing YAML frontmatter (file must start with '---')"

    # Find closing ---
    yaml_end = content.find("\n---", 3)
    if yaml_end == -1:
        return None, "Unclosed YAML frontmatter (missing closing '---')"

    yaml_content = content[4:yaml_end]

    # Simple YAML parser for our specific format
    # (avoids PyYAML dependency)
    try:
        return parse_simple_yaml(yaml_content), ""
    except Exception as e:
        return None, f"YAML parse error: {e}"


def parse_simple_yaml(content: str) -> dict[str, Any]:
    """Parse simple YAML without external dependencies.

    Handles the specific EXECUTION-SPEC format with nested workstreams.
    """
    result: dict[str, Any] = {}
    current_section = None
    current_ws = None
    current_ws_data: dict[str, Any] = {}
    current_phase = None
    current_phase_data: dict[str, Any] = {}
    indent_stack: list[tuple[int, str]] = []

    lines = content.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Skip empty lines and comments
        if not stripped or stripped.startswith("#"):
            i += 1
            continue

        # Calculate indentation
        indent = len(line) - len(line.lstrip())

        # Top-level key
        if indent == 0 and ":" in stripped:
            # Save any pending workstream
            if current_ws and current_ws_data:
                if "workstreams" not in result:
                    result["workstreams"] = {}
                result["workstreams"][current_ws] = current_ws_data
                current_ws = None
                current_ws_data = {}

            key, value = stripped.split(":", 1)
            key = key.strip()
            value = value.strip()

            if value:
                # Simple key-value
                result[key] = parse_value(value)
            else:
                # Section header
                current_section = key
                if key == "workstreams":
                    result["workstreams"] = {}
                elif key == "execution_phases":
                    result["execution_phases"] = []
                elif key == "gates":
                    result["gates"] = {}

        # Workstream definition (WS1:, WS2:, etc.)
        elif current_section == "workstreams" and indent == 2:
            # Save previous workstream
            if current_ws and current_ws_data:
                result["workstreams"][current_ws] = current_ws_data

            ws_match = re.match(r"^(\w+):\s*$", stripped)
            if ws_match:
                current_ws = ws_match.group(1)
                current_ws_data = {}

        # Workstream fields
        elif current_section == "workstreams" and current_ws and indent == 4:
            if ":" in stripped:
                key, value = stripped.split(":", 1)
                key = key.strip()
                value = value.strip()

                # Strip comments before checking for array
                clean_value = strip_inline_comment(value)
                if clean_value.startswith("[") and clean_value.endswith("]"):
                    # Inline array
                    current_ws_data[key] = parse_array(value)
                elif value:
                    current_ws_data[key] = parse_value(value)
                else:
                    # Multi-line array follows
                    current_ws_data[key] = []

        # Array items for workstream fields
        elif current_section == "workstreams" and current_ws and indent == 6:
            if stripped.startswith("- "):
                item = stripped[2:].strip()
                # Find the last array field
                for key in reversed(list(current_ws_data.keys())):
                    if isinstance(current_ws_data[key], list):
                        current_ws_data[key].append(parse_value(item))
                        break

        # Execution phases
        elif current_section == "execution_phases" and stripped.startswith("- "):
            # Save previous phase
            if current_phase_data:
                result["execution_phases"].append(current_phase_data)
            current_phase_data = {}

            # Check for inline name
            rest = stripped[2:].strip()
            if rest.startswith("name:"):
                current_phase_data["name"] = rest.split(":", 1)[1].strip()

        elif current_section == "execution_phases" and indent >= 4 and ":" in stripped:
            key, value = stripped.split(":", 1)
            key = key.strip()
            value = value.strip()

            # Strip comments before checking for array
            clean_value = strip_inline_comment(value)
            if clean_value.startswith("[") and clean_value.endswith("]"):
                current_phase_data[key] = parse_array(value)
            elif value:
                current_phase_data[key] = parse_value(value)

        i += 1

    # Save final workstream/phase
    if current_ws and current_ws_data:
        result["workstreams"][current_ws] = current_ws_data
    if current_phase_data:
        result["execution_phases"].append(current_phase_data)

    return result


def strip_inline_comment(value: str) -> str:
    """Strip inline YAML comments (# ...) from a value."""
    # Handle quoted strings - don't strip # inside quotes
    if value.startswith('"') or value.startswith("'"):
        quote_char = value[0]
        end_quote = value.find(quote_char, 1)
        if end_quote != -1:
            return value[:end_quote + 1]

    # Handle arrays - find # after closing bracket
    if value.startswith("["):
        bracket_end = value.find("]")
        if bracket_end != -1:
            return value[:bracket_end + 1]

    # General case - strip everything after #
    comment_idx = value.find("#")
    if comment_idx != -1:
        return value[:comment_idx].strip()

    return value


def parse_value(value: str) -> Any:
    """Parse a YAML value."""
    value = strip_inline_comment(value.strip())

    # Remove quotes
    if (value.startswith('"') and value.endswith('"')) or \
       (value.startswith("'") and value.endswith("'")):
        return value[1:-1]

    # Boolean
    if value.lower() == "true":
        return True
    if value.lower() == "false":
        return False

    # Number
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        pass

    return value


def parse_array(value: str) -> list[Any]:
    """Parse inline YAML array like [WS1, WS2]."""
    # Strip inline comments first
    value = strip_inline_comment(value.strip())

    if not value.startswith("[") or not value.endswith("]"):
        return []

    value = value[1:-1]  # Remove brackets
    if not value:
        return []

    items = []
    for item in value.split(","):
        items.append(parse_value(item.strip()))
    return items


def validate_spec(spec_path: str) -> tuple[list[str], list[str]]:
    """Validate EXECUTION-SPEC and return tuple of (errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []

    path = Path(spec_path)
    if not path.exists():
        return [f"File not found: {spec_path}"], []

    content = path.read_text()

    # Parse YAML frontmatter
    spec, parse_error = parse_yaml_frontmatter(content)
    if parse_error:
        return [parse_error], []

    if spec is None:
        return ["Failed to parse YAML frontmatter"], []

    # Check required top-level fields
    for field in REQUIRED_TOP_LEVEL_FIELDS:
        if field not in spec:
            errors.append(f"Missing required field: {field}")

    if errors:
        return errors, warnings  # Can't continue without required fields

    # Validate PRD format
    prd = spec.get("prd", "")
    if not re.match(r"^(PRD-\d+|[A-Z]+-[A-Z0-9-]+)$", str(prd)):
        errors.append(f"Invalid PRD format: '{prd}' (expected PRD-XXX or FEATURE-ID)")

    # Validate workstreams
    workstreams = spec.get("workstreams", {})
    ws_ids = set(workstreams.keys())

    if not ws_ids:
        errors.append("No workstreams defined")
        return errors, warnings

    for ws_id, ws in workstreams.items():
        # Check required fields
        missing_fields = REQUIRED_WORKSTREAM_FIELDS - set(ws.keys())
        if missing_fields:
            errors.append(f"{ws_id}: Missing fields: {missing_fields}")
            continue

        executor = ws.get("executor")
        executor_type = ws.get("executor_type")

        # Validate executor type
        if executor_type == "task-agent":
            # Task agents are DEPRECATED - emit warning but still validate
            warnings.append(
                f"{ws_id}: DEPRECATED executor_type 'task-agent'. "
                f"Migrate to skill. See executor-registry.md for migration guide."
            )
            if executor not in DEPRECATED_TASK_AGENTS:
                errors.append(
                    f"{ws_id}: Invalid task-agent '{executor}'. "
                    f"Valid (deprecated) options: {sorted(DEPRECATED_TASK_AGENTS)}"
                )
        elif executor_type == "skill":
            if executor not in VALID_SKILLS:
                errors.append(
                    f"{ws_id}: Invalid skill '{executor}'. "
                    f"Valid options: {sorted(VALID_SKILLS)}"
                )
        else:
            errors.append(
                f"{ws_id}: Invalid executor_type '{executor_type}'. "
                f"Must be 'skill' (task-agent is deprecated)"
            )

        # Validate dependencies exist
        depends_on = ws.get("depends_on", [])
        for dep in depends_on:
            if dep not in ws_ids:
                errors.append(f"{ws_id}: Invalid dependency '{dep}' (workstream not found)")

        # Validate gate
        gate = ws.get("gate")
        if gate and gate not in VALID_GATES:
            errors.append(
                f"{ws_id}: Invalid gate '{gate}'. "
                f"Valid options: {sorted(VALID_GATES)}"
            )

        # Check outputs is a list
        outputs = ws.get("outputs", [])
        if not isinstance(outputs, list):
            errors.append(f"{ws_id}: 'outputs' must be a list")

    # Check for circular dependencies
    circular = find_circular_dependencies(workstreams)
    if circular:
        errors.append(f"Circular dependency detected: {' -> '.join(circular)}")

    # Validate execution_phases reference valid workstreams
    phases = spec.get("execution_phases", [])
    referenced_ws = set()

    for i, phase in enumerate(phases):
        phase_name = phase.get("name", f"Phase {i+1}")
        parallel = phase.get("parallel", [])

        if not parallel:
            errors.append(f"{phase_name}: No workstreams in 'parallel' list")
            continue

        for ws_id in parallel:
            if ws_id not in ws_ids:
                errors.append(f"{phase_name}: References unknown workstream '{ws_id}'")
            referenced_ws.add(ws_id)

    # Check all workstreams are referenced in execution_phases
    unreferenced = ws_ids - referenced_ws
    if unreferenced:
        errors.append(f"Workstreams not in any execution phase: {sorted(unreferenced)}")

    return errors, warnings


def find_circular_dependencies(workstreams: dict[str, Any]) -> list[str]:
    """Detect circular dependencies using DFS."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {ws: WHITE for ws in workstreams}
    path: list[str] = []

    def dfs(ws: str) -> list[str]:
        if color[ws] == GRAY:
            # Found cycle
            cycle_start = path.index(ws)
            return path[cycle_start:] + [ws]
        if color[ws] == BLACK:
            return []

        color[ws] = GRAY
        path.append(ws)

        for dep in workstreams[ws].get("depends_on", []):
            if dep in workstreams:
                result = dfs(dep)
                if result:
                    return result

        path.pop()
        color[ws] = BLACK
        return []

    for ws in workstreams:
        if color[ws] == WHITE:
            result = dfs(ws)
            if result:
                return result

    return []


def main() -> int:
    """Main entry point."""
    if len(sys.argv) != 2:
        print("Usage: python validate-execution-spec.py <path-to-execution-spec.md>")
        return 2

    spec_path = sys.argv[1]
    errors, warnings = validate_spec(spec_path)

    # Print warnings first
    if warnings:
        print("=" * 60)
        print("⚠️  DEPRECATION WARNINGS")
        print("=" * 60)
        print()
        for i, warning in enumerate(warnings, 1):
            print(f"  {i}. {warning}")
        print()

    if errors:
        print("=" * 60)
        print("❌ EXECUTION-SPEC Validation FAILED")
        print("=" * 60)
        print()
        for i, error in enumerate(errors, 1):
            print(f"  {i}. {error}")
        print()
        print(f"Total: {len(errors)} error(s), {len(warnings)} warning(s)")
        print()
        print("Fix these issues before proceeding with pipeline execution.")
        return 1

    print("=" * 60)
    if warnings:
        print("✅ EXECUTION-SPEC Validation PASSED (with warnings)")
    else:
        print("✅ EXECUTION-SPEC Validation PASSED")
    print("=" * 60)
    if warnings:
        print()
        print(f"Note: {len(warnings)} deprecation warning(s). Migrate to skills.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
