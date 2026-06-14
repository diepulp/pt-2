#!/usr/bin/env python3
"""
Gate A — Universal Test Fidelity (FIB-H-RENDER-PROOF-001 §F.2).

Stack-free grep that bars a slice's TOUCHED integration-named test files from
mocking the Supabase CLIENT CONSTRUCTOR. Companion to classify-write-path.py;
same I/O contract shape (JSON to stdout, exit 0 = scan completed regardless of
verdict, exit 2 = read error).

Scope is enforced by the CALLER: the orchestrator supplies the slice's touched
file set as argv; this script does NOT compute a git diff. It inspects exactly
the files passed, so "touched-files-only / non-retroactive" is the caller's
contract. Non-int-named files in the list are ignored (no signals emitted).

Detection is TARGETED (the client-constructor module), NOT a broad substring:
a `jest.mock('../mappers')` or `jest.mock('@/services/notifications/sender')`
must NOT flag — the terminal (server|client|service) capture is load-bearing.

Override: a flagged line is CLEARED if a `// integration-fidelity:allow <reason>`
comment (with a NON-EMPTY reason) sits on the SAME line or the IMMEDIATELY
PRECEDING line. A bare `// integration-fidelity:allow` does NOT clear.

Output (stdout):
  {
    "detected":   bool,                       # true if any UNCLEARED client mock found
    "violations": [{"file", "line", "pattern", "excerpt"}, ...],
    "cleared":    [{"file", "line", "reason"}, ...]   # audit trail of overrides
  }

Exit codes:
  0  scan completed (regardless of verdict)
  2  input file missing / read error
"""

import json
import re
import sys
from pathlib import Path

# Files in scope: integration-named test files only. Everything else is ignored.
INT_FILE_SUFFIXES = (".int.test.ts", ".integration.test.ts")

# PATTERN_A — jest.mock() of the Supabase client-constructor module. The path
# may be absolute (`@/...`) or relative (`./`, `../`, `../../`, ...), with an
# optional `lib/` segment, but it MUST terminate on `supabase/(server|client|
# service)`. The terminal capture is the specificity that keeps this targeted.
PATTERN_A = re.compile(
    r"""jest\.mock\(\s*['"]"""
    r"""(?:@/|\.{1,2}/(?:\.\./)*)?"""        # @/ OR ./ ../ ../../ ...
    r"""(?:lib/)?"""                          # optional lib/ segment
    r"""supabase/(server|client|service)"""   # load-bearing terminal capture
    r"""['"]"""
)

# PATTERN_B — jest.mock() of the upstream client package itself.
PATTERN_B = re.compile(r"""jest\.mock\(\s*['"]@supabase/supabase-js['"]""")

# Override directive. `<reason>` must be NON-EMPTY after the token.
ALLOW_DIRECTIVE = re.compile(
    r"//\s*integration-fidelity:allow\b[ \t]*(?P<reason>\S.*)?"
)


def is_int_file(path: Path) -> bool:
    """True if the path is an integration-named test file (in scope for Gate A)."""
    name = path.name
    return any(name.endswith(suffix) for suffix in INT_FILE_SUFFIXES)


def find_mock(line: str):
    """Return (pattern_id, ...) if the line mocks the client constructor, else None."""
    if PATTERN_A.search(line):
        return "supabase-client-constructor"
    if PATTERN_B.search(line):
        return "supabase-supabase-js"
    return None


def allow_reason(line: str):
    """Return a non-empty override reason on this line, or None if not cleared."""
    m = ALLOW_DIRECTIVE.search(line)
    if not m:
        return None
    reason = (m.group("reason") or "").strip()
    return reason if reason else None


def scan(path: Path) -> dict:
    """
    Scan a single in-scope int file. Returns {"violations": [...], "cleared": [...]}.
    Raises OSError on read failure (caller maps to exit 2).
    """
    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()
    violations: list[dict] = []
    cleared: list[dict] = []

    for idx, line in enumerate(lines):
        lineno = idx + 1
        pattern_id = find_mock(line)
        if pattern_id is None:
            continue

        # Override may be on this line or the immediately preceding line.
        reason = allow_reason(line)
        if reason is None and idx > 0:
            reason = allow_reason(lines[idx - 1])

        if reason is not None:
            cleared.append({
                "file":   str(path),
                "line":   lineno,
                "reason": reason,
            })
        else:
            violations.append({
                "file":    str(path),
                "line":    lineno,
                "pattern": pattern_id,
                "excerpt": line.strip()[:200],
            })

    return {"violations": violations, "cleared": cleared}


def check_files(paths: list[Path]) -> dict:
    """
    Inspect the passed candidate files, filtering to int-named files internally.
    Returns the full result dict. Raises OSError on read failure.
    """
    violations: list[dict] = []
    cleared: list[dict] = []

    for path in paths:
        if not is_int_file(path):
            continue  # non-int files produce no signals
        result = scan(path)
        violations.extend(result["violations"])
        cleared.extend(result["cleared"])

    return {
        "detected":   bool(violations),
        "violations": violations,
        "cleared":    cleared,
    }


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(
            "usage: check-test-fidelity.py <file1> [<file2> ...]",
            file=sys.stderr,
        )
        return 2

    paths = [Path(a) for a in argv[1:]]

    # Only int-named files must exist/read; non-int paths are ignored entirely
    # so the caller can pass a slice's whole touched set without pre-filtering.
    try:
        result = check_files(paths)
    except OSError as e:
        print(f"error reading input: {e}", file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
