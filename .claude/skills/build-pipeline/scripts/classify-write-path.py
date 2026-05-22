#!/usr/bin/env python3
"""
Classify write-path signals in a PRD + assembled EXEC-SPEC.

Fires at SKILL.md Stage 3 step 4 (Write-Path Classification / E2E Mandate).
Replaces the prose keyword scan with a deterministic emission so the
orchestrator's decision becomes mechanical: detected && !has_e2e_workstream
=> inject WS_E2E.

Output (stdout):
  {
    "detected": bool,
    "signals":  [{"file": "...", "line": N, "pattern": "...", "excerpt": "..."}, ...],
    "has_e2e_workstream": bool
  }

Exit codes:
  0  scan completed (regardless of verdict)
  2  input file missing / read error
"""

import json
import re
import sys
from pathlib import Path

# Anchored, case-sensitive patterns — avoid false positives on prose words
# like "update the schema" or "delete this comment". We match operational
# surface area, not commentary.
WRITE_PATTERNS = [
    ("sql.insert",      re.compile(r"\bINSERT\s+INTO\b")),
    ("sql.update",      re.compile(r"\bUPDATE\s+\w+\s+SET\b")),
    ("sql.delete",      re.compile(r"\bDELETE\s+FROM\b")),
    ("server-action",   re.compile(r"\bwithServerAction\s*\(")),
    ("route-mutating",  re.compile(r"\bexport\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b")),
    ("form.element",    re.compile(r"<form\b")),
    ("form.onsubmit",   re.compile(r"\bonSubmit\s*=")),
    ("http.method",     re.compile(r"""method\s*[:=]\s*['"](?:POST|PUT|PATCH|DELETE)['"]""")),
]

# Detects an e2e-testing workstream inside an assembled EXEC-SPEC. Matches the
# auto-inject shape `executor: e2e-testing` documented in SKILL.md Stage 3.
E2E_EXECUTOR_PATTERN = re.compile(r"^\s*executor:\s*e2e-testing\b", re.MULTILINE)


def scan(path: Path) -> list[dict]:
    signals = []
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        print(f"error reading {path}: {e}", file=sys.stderr)
        sys.exit(2)
    for lineno, line in enumerate(text.splitlines(), start=1):
        for pattern_id, regex in WRITE_PATTERNS:
            if regex.search(line):
                signals.append({
                    "file":    str(path),
                    "line":    lineno,
                    "pattern": pattern_id,
                    "excerpt": line.strip()[:200],
                })
    return signals


def has_e2e_workstream(exec_spec_path: Path) -> bool:
    try:
        text = exec_spec_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    return bool(E2E_EXECUTOR_PATTERN.search(text))


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: classify-write-path.py <prd-path> [<exec-spec-path>]", file=sys.stderr)
        return 2

    prd_path = Path(sys.argv[1])
    if not prd_path.is_file():
        print(f"PRD not found: {prd_path}", file=sys.stderr)
        return 2

    signals = scan(prd_path)

    exec_spec_path = Path(sys.argv[2]) if len(sys.argv) >= 3 else None
    if exec_spec_path:
        if not exec_spec_path.is_file():
            print(f"EXEC-SPEC not found: {exec_spec_path}", file=sys.stderr)
            return 2
        signals.extend(scan(exec_spec_path))

    result = {
        "detected":           bool(signals),
        "signals":            signals,
        "has_e2e_workstream": has_e2e_workstream(exec_spec_path) if exec_spec_path else False,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
