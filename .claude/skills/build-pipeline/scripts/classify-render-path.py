#!/usr/bin/env python3
"""
Gate B classifier — Render-Path / Derived-Value Surface (FIB-H-RENDER-PROOF-001 §F.3).

Deterministic classifier emitting whether a slice DECLARES a derived-value
surface and which Gate-B tiers it warrants. Companion to classify-write-path.py;
SAME I/O contract shape (JSON to stdout, exit 0 = scan completed regardless of
verdict, exit 2 = read error). Detection is DECLARED, not inferred.

Signals:
  PRIMARY (authoritative): PRD/spec frontmatter
      renders_derived_value_surface: true
    OR its recognized alias
      renders_financial_surface_values: true        (instance #1, §F.3 / §I.1.a)
    Either → derived_value, signal = "primary_flag".

  SECONDARY (governed naming, §I.1.b DEC frozen): a GET route returning a
    DTO whose type name matches the FROZEN suffix regex /Projection(ResponseDTO)?$/.
    `$`-anchored on the suffix, so `ProjectionConfigResponseDTO` mid-name does
    NOT match. GET-scoped only — POST/PUT/PATCH/DELETE returning such a DTO is
    NOT a secondary trigger (the write-path classifier owns mutations).
    signal = "secondary_projection_dto".

  Non-route detection hole (DECLARED-OPEN, §F.3 / §K.5): a derived value computed
    in a server component/hook with NO *Projection GET route trips NEITHER
    mechanical signal and depends solely on the primary flag. Absent the flag it
    correctly returns `none` — intended honor-system limit, NOT a bug.

  "Mounted component" is NOT a classification signal (mount is Phase-4
  verification, not a Stage-3 signal — §F.3).

Output (stdout):
  {
    "detected":        bool,                              # true iff classification == derived_value
    "classification":  "derived_value" | "none",
    "signal":          "primary_flag" | "secondary_projection_dto" | "none",
    "warranted_tiers": ["service_db_int", "route_int", "component_render"]
                       # populated only when derived_value;
                       # route_int = the surface's OWN projection route only
  }

Determinism: identical input → identical output. Malformed/missing frontmatter →
safe default `none` (must not crash).

Exit codes:
  0  scan completed (regardless of verdict)
  2  input file missing / read error
"""

import json
import re
import sys
from pathlib import Path

# Tiers warranted for a derived-value surface (§F.3). route_int is scoped to the
# surface's OWN projection route only — NOT a blanket all-routes mandate.
WARRANTED_TIERS = ["service_db_int", "route_int", "component_render"]

# --- PRIMARY signal: frontmatter flags ---------------------------------------
# Match a YAML-ish `key: true` line for either the generalized flag or its
# recognized financial alias. Anchored to the start of a line (optional indent),
# value `true` case-insensitive, optional trailing comment. Avoids matching a
# `false` value or a prose mention.
PRIMARY_FLAG_KEYS = (
    "renders_derived_value_surface",
    "renders_financial_surface_values",  # alias for instance #1
)
PRIMARY_FLAG_PATTERNS = [
    re.compile(
        rf"""^\s*{re.escape(key)}\s*:\s*true\b""",
        re.IGNORECASE | re.MULTILINE,
    )
    for key in PRIMARY_FLAG_KEYS
]

# --- SECONDARY signal: *ProjectionResponseDTO on a GET route ------------------
# FROZEN suffix regex (DEC-001 / §I.1.b). `$`-anchored on the DTO type-name
# suffix so the match terminates exactly at `Projection` or `ProjectionResponseDTO`
# — `ProjectionConfigResponseDTO` mid-name must NOT match.
#
# A DTO type name is a run of identifier chars; we require the suffix to end the
# identifier (followed by a non-identifier boundary), which the `(?![A-Za-z0-9_])`
# lookahead provides as the `$`-on-the-suffix anchor.
PROJECTION_DTO_SUFFIX = re.compile(
    r"\b[A-Za-z_][A-Za-z0-9_]*Projection(?:ResponseDTO)?(?![A-Za-z0-9_])"
)

# GET-scoping. The secondary signal only fires when a *Projection DTO is tied to
# a GET route. We recognize either an explicit Next.js GET handler export or an
# HTTP-method/verb annotation indicating GET, on a line that also references a
# *Projection(ResponseDTO) DTO, or where such a DTO appears within a small window
# of a GET marker. To stay deterministic and line-oriented (mirroring the
# write-path scanner), we detect a GET context and a projection-DTO reference and
# require co-occurrence within a bounded line window.
GET_HANDLER_PATTERN = re.compile(
    r"\bexport\s+(?:async\s+)?function\s+GET\b"
)
GET_METHOD_ANNOTATION = re.compile(
    r"""(?:method|verb|http_method|httpMethod)\s*[:=]\s*['"]GET['"]""",
    re.IGNORECASE,
)
# A frontmatter/spec table row or prose explicitly tagging a route as GET, e.g.
# "GET /api/v1/.../projection" — the leading GET token bounded by word edges.
GET_ROUTE_LINE = re.compile(r"\bGET\s+/")

# Co-occurrence window: a projection DTO reference is GET-scoped if a GET marker
# appears on the same line or within this many lines above it.
GET_WINDOW = 8


def has_primary_flag(text: str) -> bool:
    """True if the generalized flag or its financial alias is set to true."""
    return any(p.search(text) for p in PRIMARY_FLAG_PATTERNS)


def _is_get_marker(line: str) -> bool:
    return bool(
        GET_HANDLER_PATTERN.search(line)
        or GET_METHOD_ANNOTATION.search(line)
        or GET_ROUTE_LINE.search(line)
    )


def has_secondary_projection_dto(text: str) -> bool:
    """
    True if a *Projection(ResponseDTO)? DTO reference is GET-scoped: it appears
    on a line that is itself a GET marker, or within GET_WINDOW lines after the
    most recent GET marker. POST/PUT/PATCH/DELETE contexts do not count.
    """
    lines = text.splitlines()
    last_get_marker = None  # line index of most recent GET marker

    for idx, line in enumerate(lines):
        if _is_get_marker(line):
            last_get_marker = idx

        if PROJECTION_DTO_SUFFIX.search(line):
            # Same-line GET marker, or a recent GET marker within the window.
            if _is_get_marker(line):
                return True
            if last_get_marker is not None and (idx - last_get_marker) <= GET_WINDOW:
                return True

    return False


def classify(text: str) -> dict:
    """
    Classify already-read spec text. Pure function — no I/O, no crashes on
    malformed input. Returns the full result dict.
    """
    if has_primary_flag(text):
        signal = "primary_flag"
    elif has_secondary_projection_dto(text):
        signal = "secondary_projection_dto"
    else:
        signal = "none"

    if signal == "none":
        return {
            "detected":        False,
            "classification":  "none",
            "signal":          "none",
            "warranted_tiers": [],
        }

    return {
        "detected":        True,
        "classification":  "derived_value",
        "signal":          signal,
        "warranted_tiers": list(WARRANTED_TIERS),
    }


def classify_paths(prd_path: Path, exec_spec_path: Path | None) -> dict:
    """
    Read the PRD/FIB (and optional EXEC-SPEC) and classify their combined text.
    Raises OSError on read failure (caller maps to exit 2).
    """
    text = prd_path.read_text(encoding="utf-8", errors="replace")
    if exec_spec_path is not None:
        text = text + "\n" + exec_spec_path.read_text(encoding="utf-8", errors="replace")
    return classify(text)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(
            "usage: classify-render-path.py <prd-or-fib-path> [<exec-spec-path>]",
            file=sys.stderr,
        )
        return 2

    prd_path = Path(argv[1])
    if not prd_path.is_file():
        print(f"PRD/FIB not found: {prd_path}", file=sys.stderr)
        return 2

    exec_spec_path = None
    if len(argv) >= 3:
        exec_spec_path = Path(argv[2])
        if not exec_spec_path.is_file():
            print(f"EXEC-SPEC not found: {exec_spec_path}", file=sys.stderr)
            return 2

    try:
        result = classify_paths(prd_path, exec_spec_path)
    except OSError as e:
        print(f"error reading input: {e}", file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
