#!/usr/bin/env python3
"""
srl_intake_lint.py — SRL semantic ambiguity preflight scanner (v0.1.0)

Scans .md, .yaml, and .yml files for ambiguous domain shorthand that must
not appear in canonical SRL prose. Exits nonzero when hard_fail_count > 0.

Usage:
  python scripts/semantic/srl_intake_lint.py <file_or_glob> [--format yaml|json]

Examples:
  python scripts/semantic/srl_intake_lint.py docs/issues/table-inventory-accounting-canon/thesaurus/SRL-TIA-001-table-inventory-accounting.yaml
  python scripts/semantic/srl_intake_lint.py docs/issues/table-inventory-accounting-canon/thesaurus/*.yaml --format yaml
"""

import argparse
import glob
import json
import re
import sys
from pathlib import Path

SCANNER_VERSION = "srl_intake_lint.py@0.1.0"

# Phrases that unconditionally fail in canonical prose.
# Matches are case-insensitive unless otherwise noted.
HARD_FAIL_RULES = [
    {
        "id": "HF-01",
        "phrase": "drop telemetry",
        "reason": (
            "Unqualified 'drop telemetry' conflates physical drop with a "
            "telemetry-derived estimate. Use 'telemetry_derived_drop_estimate_cents' "
            "when referring to the canonical formula input."
        ),
        "suggested_replacement": "telemetry_derived_drop_estimate_cents",
    },
    {
        "id": "HF-02",
        "phrase": "telemetry drop",
        "reason": (
            "Unqualified 'telemetry drop' is ambiguous. Use "
            "'telemetry_derived_drop_estimate_cents' for the canonical input."
        ),
        "suggested_replacement": "telemetry_derived_drop_estimate_cents",
    },
    {
        "id": "HF-03",
        "phrase": "drop input",
        "reason": (
            "'drop input' is ambiguous shorthand. Use "
            "'telemetry_derived_drop_estimate_cents input' in canonical prose."
        ),
        "suggested_replacement": "telemetry_derived_drop_estimate_cents input",
    },
    {
        "id": "HF-04",
        "phrase": "drop source",
        "reason": (
            "'drop source' is ambiguous — it conflates telemetry-derived estimates "
            "with custody-authoritative soft-count sources. Use "
            "'source for telemetry_derived_drop_estimate_cents' in canonical prose."
        ),
        "suggested_replacement": "source for telemetry_derived_drop_estimate_cents",
    },
    {
        "id": "HF-05",
        "phrase": "drop absent",
        "reason": (
            "'drop absent' is ambiguous shorthand. Use "
            "'telemetry_derived_drop_estimate_cents absent' in canonical prose."
        ),
        "suggested_replacement": "telemetry_derived_drop_estimate_cents absent",
    },
    {
        "id": "HF-06",
        "phrase": "drop estimate source",
        "reason": (
            "'drop estimate source' is ambiguous. Use "
            "'source for telemetry_derived_drop_estimate_cents'."
        ),
        "suggested_replacement": "source for telemetry_derived_drop_estimate_cents",
    },
    {
        "id": "HF-07",
        "phrase": "estimated win/loss",
        "reason": (
            "'Estimated Win/Loss' is removed from the allowed label set per ADR-060 D4. "
            "Use 'Projected Win/Loss' (telemetry_drop_formula) or "
            "'Partial Table Result' (inventory_only)."
        ),
        "suggested_replacement": "Projected Win/Loss",
        "case_sensitive": True,
    },
    {
        "id": "HF-08",
        "phrase": "source_authority.inventory",
        "reason": (
            "'source_authority.inventory' is a superseded key shape per ADR-060 D3. "
            "Use 'source_authority.snapshots' for opener/closer."
        ),
        "suggested_replacement": "source_authority.snapshots",
    },
]

WARN_RULES = [
    {
        "id": "WN-01",
        "phrase": "drop estimate",
        "reason": (
            "'drop estimate' is shorthand that may be ambiguous. "
            "Prefer 'telemetry_derived_drop_estimate_cents' or "
            "'telemetry-derived drop estimate' in canonical prose."
        ),
        "suggested_replacement": "telemetry-derived drop estimate",
    },
    {
        "id": "WN-02",
        "phrase": "drop-like",
        "reason": (
            "'drop-like' is informal shorthand; use canonical terminology."
        ),
        "suggested_replacement": "telemetry_derived_drop_estimate_cents or custody-authoritative drop amount",
    },
    {
        "id": "WN-03",
        "phrase": "drop proxy",
        "reason": (
            "'drop proxy' is shorthand; use 'telemetry-derived, non-custody estimate input' "
            "in canonical prose."
        ),
        "suggested_replacement": "telemetry-derived, non-custody estimate input",
    },
    {
        "id": "WN-04",
        "phrase": "unqualified win/loss",
        "reason": (
            "Unqualified 'Win/Loss' is reserved for final_table_win_loss_cents. "
            "Use 'Projected Win/Loss' or 'Partial Table Result'."
        ),
        "suggested_replacement": "Projected Win/Loss or Partial Table Result",
    },
]

# Lines containing these markers are exempt from hard-fail checks
# (they indicate legacy alias disposition contexts, not canonical prose).
ALLOWED_CONTEXT_MARKERS = [
    "legacy_alias_disposition",
    "observed alias",
    "observed_name:",
    "reserved",
    "future",
    "out_of_scope",
    "outside_exemplar_boundary",
    "disposition:",
    "rationale:",
]

# Phrases that are canonical identifiers and must never be flagged.
CANONICAL_IDENTIFIERS = [
    "telemetry_derived_drop_estimate_cents",
    "drop_estimate_state",
    "telemetry_drop_formula",
    "source_authority.drop",
    "posted_drop_amount_cents",
    "counted_drop_amount_cents",
    "final_reconciled_drop_amount_cents",
    "aggregate_session_telemetry_derived_drop_estimate",
]


def _line_in_allowed_context(line: str) -> bool:
    lower = line.lower()
    return any(marker.lower() in lower for marker in ALLOWED_CONTEXT_MARKERS)


def _line_contains_canonical_identifier(line: str) -> bool:
    for ident in CANONICAL_IDENTIFIERS:
        if ident in line:
            return True
    return False


def _check_line(line: str, rule: dict) -> bool:
    """Return True if the rule phrase is found in the line."""
    phrase = rule["phrase"]
    case_sensitive = rule.get("case_sensitive", False)
    if case_sensitive:
        return phrase in line
    return phrase.lower() in line.lower()


def scan_file(path: Path) -> list:
    findings = []
    try:
        text = path.read_text(encoding="utf-8")
    except Exception as e:
        return [
            {
                "file": str(path),
                "line": 0,
                "phrase": "",
                "severity": "error",
                "rule": "IO",
                "reason": f"Could not read file: {e}",
                "suggested_replacement": None,
            }
        ]

    lines = text.splitlines()

    for lineno, raw_line in enumerate(lines, start=1):
        # Skip YAML comments
        stripped = raw_line.strip()
        if stripped.startswith("#"):
            continue

        # If the line is in an allowed legacy context, skip hard-fail checks.
        in_allowed_context = _line_in_allowed_context(raw_line)

        for rule in HARD_FAIL_RULES:
            if not _check_line(raw_line, rule):
                continue
            # If the line only mentions the phrase as part of a canonical identifier, skip.
            # e.g. "telemetry_derived_drop_estimate_cents" contains "drop" but is canonical.
            # We check: after removing canonical identifiers from the line, does the phrase still match?
            scrubbed = raw_line
            for ident in CANONICAL_IDENTIFIERS:
                scrubbed = scrubbed.replace(ident, "")
            if not _check_line(scrubbed, rule):
                continue
            severity = "warn" if in_allowed_context else "hard_fail"
            findings.append(
                {
                    "file": str(path),
                    "line": lineno,
                    "phrase": rule["phrase"],
                    "severity": severity,
                    "rule": rule["id"],
                    "reason": rule["reason"],
                    "suggested_replacement": rule.get("suggested_replacement"),
                    "context": raw_line.strip()[:120],
                }
            )

        for rule in WARN_RULES:
            if not _check_line(raw_line, rule):
                continue
            scrubbed = raw_line
            for ident in CANONICAL_IDENTIFIERS:
                scrubbed = scrubbed.replace(ident, "")
            if not _check_line(scrubbed, rule):
                continue
            findings.append(
                {
                    "file": str(path),
                    "line": lineno,
                    "phrase": rule["phrase"],
                    "severity": "warn",
                    "rule": rule["id"],
                    "reason": rule["reason"],
                    "suggested_replacement": rule.get("suggested_replacement"),
                    "context": raw_line.strip()[:120],
                }
            )

    return findings


def resolve_paths(patterns: list) -> list:
    paths = []
    for pattern in patterns:
        expanded = glob.glob(pattern, recursive=True)
        if expanded:
            paths.extend(Path(p) for p in expanded)
        else:
            p = Path(pattern)
            if p.exists():
                paths.append(p)
    return [p for p in paths if p.suffix in {".md", ".yaml", ".yml"}]


def main():
    parser = argparse.ArgumentParser(
        description="SRL semantic ambiguity preflight scanner"
    )
    parser.add_argument("files", nargs="+", help="Files or glob patterns to scan")
    parser.add_argument(
        "--format",
        choices=["yaml", "json", "text"],
        default="text",
        help="Output format (default: text)",
    )
    args = parser.parse_args()

    paths = resolve_paths(args.files)
    if not paths:
        print("ERROR: no matching .md/.yaml/.yml files found", file=sys.stderr)
        sys.exit(2)

    all_findings = []
    for path in paths:
        all_findings.extend(scan_file(path))

    hard_fail_count = sum(1 for f in all_findings if f["severity"] == "hard_fail")
    warn_count = sum(1 for f in all_findings if f["severity"] == "warn")
    result = "fail" if hard_fail_count > 0 else "pass"

    summary = {
        "scanner_version": SCANNER_VERSION,
        "scanned_files": len(paths),
        "findings_count": len(all_findings),
        "hard_fail_count": hard_fail_count,
        "warn_count": warn_count,
        "result": result,
    }

    if args.format == "json":
        output = {"findings": all_findings, "summary": summary}
        print(json.dumps(output, indent=2))
    elif args.format == "yaml":
        # Minimal YAML serialisation without external deps
        print("findings:")
        for f in all_findings:
            print(f"  - file: {f['file']}")
            print(f"    line: {f['line']}")
            print(f"    phrase: \"{f['phrase']}\"")
            print(f"    severity: {f['severity']}")
            print(f"    rule: {f['rule']}")
            print(f"    reason: \"{f['reason'][:100]}\"")
            repl = f.get("suggested_replacement") or "null"
            print(f"    suggested_replacement: \"{repl}\"")
            print(f"    context: \"{f.get('context', '')[:80]}\"")
        print("summary:")
        for k, v in summary.items():
            print(f"  {k}: {v}")
    else:
        # Human-readable text
        if all_findings:
            print(f"\nSRL Semantic Ambiguity Preflight — {SCANNER_VERSION}")
            print("=" * 60)
            for f in all_findings:
                tag = "HARD_FAIL" if f["severity"] == "hard_fail" else "WARN    "
                print(
                    f"[{tag}] {f['file']}:{f['line']} — rule {f['rule']}: \"{f['phrase']}\""
                )
                print(f"         {f['reason'][:100]}")
                if f.get("suggested_replacement"):
                    print(f"         → {f['suggested_replacement']}")
                print()
        print(f"\nSummary: {result.upper()}")
        print(f"  scanned_files  : {summary['scanned_files']}")
        print(f"  findings_count : {summary['findings_count']}")
        print(f"  hard_fail_count: {summary['hard_fail_count']}")
        print(f"  warn_count     : {summary['warn_count']}")

    sys.exit(0 if result == "pass" else 1)


if __name__ == "__main__":
    main()
