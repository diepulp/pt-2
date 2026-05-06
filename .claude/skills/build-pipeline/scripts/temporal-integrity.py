#!/usr/bin/env python3
"""
Temporal integrity check — flag upstream artifacts modified after the
EXEC-SPEC was generated, so the approval gate can warn the human that the
spec they're about to greenlight may no longer reflect current PRD/ADR state.

Fires at SKILL.md Phase 2 Approval Gate. Advisory only — the human decides
at the gate prompt. Integrity check (file mtimes on disk), not format check.

Output (stdout):
  {
    "stale":            bool,
    "exec_spec":        {"path": "...", "mtime": "ISO8601"},
    "stale_refs":       [{"path": "...", "type": "prd" | "adr", "mtime": "ISO8601"}, ...],
    "unresolved_adrs":  ["ADR-XXX", ...]
  }

Exit codes:
  0  scan completed (regardless of verdict)
  2  input file missing / read error
"""

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ADR_SEARCH_ROOT = Path("docs/80-adrs")


def mtime_iso(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()


def extract_adr_refs(prd_text: str) -> list[str]:
    """Parse adr_refs line from PRD frontmatter. Supports [ADR-015, ADR-020]
    inline-array form, which is what prd-writer emits. Quoted-string variants
    are tolerated.
    """
    m = re.search(r"^adr_refs:\s*\[(.*?)\]\s*$", prd_text, re.MULTILINE)
    if not m:
        return []
    raw = m.group(1)
    # Strip quotes and whitespace, drop empties
    return [token.strip().strip("'").strip('"') for token in raw.split(",") if token.strip()]


def resolve_adr(adr_id: str) -> Path | None:
    """Canonical ADR location: docs/80-adrs/ADR-{N}-*.md. Returns the first
    match or None if unresolved (e.g., archived, renamed, never existed).
    """
    if not ADR_SEARCH_ROOT.is_dir():
        return None
    matches = sorted(ADR_SEARCH_ROOT.glob(f"{adr_id}*.md"))
    return matches[0] if matches else None


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: temporal-integrity.py <prd-path> <exec-spec-path>", file=sys.stderr)
        return 2

    prd_path = Path(sys.argv[1])
    exec_spec_path = Path(sys.argv[2])

    for p in (prd_path, exec_spec_path):
        if not p.is_file():
            print(f"file not found: {p}", file=sys.stderr)
            return 2

    exec_mtime_ts = exec_spec_path.stat().st_mtime
    stale_refs: list[dict] = []

    # PRD
    prd_mtime_ts = prd_path.stat().st_mtime
    if prd_mtime_ts > exec_mtime_ts:
        stale_refs.append({
            "path":  str(prd_path),
            "type":  "prd",
            "mtime": mtime_iso(prd_path),
        })

    # ADRs referenced in PRD frontmatter
    prd_text = prd_path.read_text(encoding="utf-8", errors="replace")
    unresolved: list[str] = []
    for adr_id in extract_adr_refs(prd_text):
        adr_path = resolve_adr(adr_id)
        if adr_path is None:
            unresolved.append(adr_id)
            continue
        if adr_path.stat().st_mtime > exec_mtime_ts:
            stale_refs.append({
                "path":  str(adr_path),
                "type":  "adr",
                "mtime": mtime_iso(adr_path),
            })

    result = {
        "stale":           bool(stale_refs),
        "exec_spec":       {"path": str(exec_spec_path), "mtime": mtime_iso(exec_spec_path)},
        "stale_refs":      stale_refs,
        "unresolved_adrs": unresolved,
    }
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
