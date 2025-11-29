#!/usr/bin/env python3
"""
PRD Validation Script

Validates a PRD markdown file against PRD-STD-001 standard.
Checks for required sections, anti-patterns, and DoD quality.

Usage:
    python validate_prd.py <path-to-prd.md>

Example:
    python validate_prd.py docs/10-prd/PRD-001-mvp-pilot.md
"""

import sys
import re
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ValidationResult:
    """Holds validation results."""
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return len(self.errors) == 0

    def add_error(self, msg: str) -> None:
        self.errors.append(f"ERROR: {msg}")

    def add_warning(self, msg: str) -> None:
        self.warnings.append(f"WARNING: {msg}")

    def add_info(self, msg: str) -> None:
        self.info.append(f"INFO: {msg}")


# Required sections (heading text patterns)
REQUIRED_SECTIONS = [
    (r"overview", "Overview section"),
    (r"problem.*goals?", "Problem & Goals section"),
    (r"users?.*use\s*cases?", "Users & Use Cases section"),
    (r"scope.*feature", "Scope & Feature List section"),
    (r"requirements?", "Requirements section"),
    (r"(ux|flow)", "UX / Flow Overview section"),
    (r"dependenc|risks?", "Dependencies & Risks section"),
    (r"definition\s*of\s*done|dod", "Definition of Done section"),
    (r"related\s*doc", "Related Documents section"),
]

# Anti-pattern detection
ANTI_PATTERNS = [
    # Architecture cramming
    (r"service\s+(architecture|layout|diagram)", "Architecture detail detected - should be in separate ARCH doc"),
    (r"class\s+diagram", "Class diagram detected - should be in separate ARCH doc"),
    (r"sequence\s+diagram", "Sequence diagram detected - should be in separate ARCH doc"),
    (r"folder\s+structure", "Folder structure detail detected - should be in separate ARCH doc"),

    # QA cramming
    (r"\d+%\s*(test\s*)?coverage", "Coverage percentage detected - belongs in QA standards"),
    (r"jest|vitest|cypress\s+config", "Test tool configuration detected - belongs in QA standards"),
    (r"testing\s+pyramid", "Testing pyramid detail detected - belongs in QA standards"),

    # Traceability matrix
    (r"\|\s*story\s*\|\s*service\s*\|\s*table", "Manual traceability matrix detected - keep in separate doc"),
    (r"\|\s*user\s*story\s*\|\s*rpc", "Manual traceability matrix detected - keep in separate doc"),
]

# Vague goal indicators
VAGUE_INDICATORS = [
    r"improve\s+(the\s+)?(ux|experience|quality)",
    r"better\s+(ux|performance|quality)",
    r"more\s+(consistent|reliable|robust)",
    r"enhance\s+(the\s+)?(system|platform)",
]


def extract_headings(content: str) -> list[tuple[int, str]]:
    """Extract all markdown headings with their level."""
    headings = []
    for match in re.finditer(r"^(#{1,6})\s+(.+)$", content, re.MULTILINE):
        level = len(match.group(1))
        text = match.group(2).strip()
        headings.append((level, text))
    return headings


def check_required_sections(content: str, result: ValidationResult) -> None:
    """Check that all required sections exist."""
    headings = extract_headings(content)
    heading_texts = [h[1].lower() for h in headings]

    for pattern, section_name in REQUIRED_SECTIONS:
        found = any(re.search(pattern, h, re.IGNORECASE) for h in heading_texts)
        if not found:
            result.add_error(f"Missing required: {section_name}")
        else:
            result.add_info(f"Found: {section_name}")


def check_anti_patterns(content: str, result: ValidationResult) -> None:
    """Detect anti-patterns in PRD content."""
    for pattern, message in ANTI_PATTERNS:
        if re.search(pattern, content, re.IGNORECASE):
            result.add_warning(message)


def check_goals_quality(content: str, result: ValidationResult) -> None:
    """Check that goals are concrete and measurable."""
    # Find goals section
    goals_match = re.search(
        r"#+\s*(?:\d+\.?\d*\s*)?goals?\s*\n(.*?)(?=\n#+|\Z)",
        content,
        re.IGNORECASE | re.DOTALL
    )

    if not goals_match:
        return

    goals_section = goals_match.group(1)

    # Count bullet points
    bullets = re.findall(r"^[\s]*[-*]\s+.+", goals_section, re.MULTILINE)

    if len(bullets) < 3:
        result.add_warning(f"Goals section has only {len(bullets)} items (recommend 3-5)")
    elif len(bullets) > 5:
        result.add_warning(f"Goals section has {len(bullets)} items (recommend 3-5, consider splitting)")

    # Check for vague language
    for indicator in VAGUE_INDICATORS:
        if re.search(indicator, goals_section, re.IGNORECASE):
            result.add_warning(f"Vague goal language detected: '{indicator}' - make goals observable")


def check_non_goals(content: str, result: ValidationResult) -> None:
    """Check that non-goals section exists and has content."""
    non_goals_match = re.search(
        r"#+\s*(?:\d+\.?\d*\s*)?non[\s-]*goals?\s*\n(.*?)(?=\n#+|\Z)",
        content,
        re.IGNORECASE | re.DOTALL
    )

    if not non_goals_match:
        result.add_warning("No explicit Non-Goals section found")
        return

    non_goals_section = non_goals_match.group(1)
    bullets = re.findall(r"^[\s]*[-*]\s+.+", non_goals_section, re.MULTILINE)

    if len(bullets) == 0:
        result.add_warning("Non-Goals section is empty - explicitly list what's out of scope")


def check_dod_quality(content: str, result: ValidationResult) -> None:
    """Check Definition of Done quality."""
    dod_match = re.search(
        r"#+\s*(?:\d+\.?\d*\s*)?(?:definition\s*of\s*done|dod)\s*\n(.*?)(?=\n#[^#]|\Z)",
        content,
        re.IGNORECASE | re.DOTALL
    )

    if not dod_match:
        return

    dod_section = dod_match.group(1)

    # Count checkboxes ([ ] or [x])
    checkboxes = re.findall(r"\[[\sx]\]", dod_section, re.IGNORECASE)
    bullets = re.findall(r"^[\s]*[-*]\s+.+", dod_section, re.MULTILINE)

    items = max(len(checkboxes), len(bullets))

    if items < 5:
        result.add_warning(f"DoD has only {items} items (recommend 5-12)")
    elif items > 12:
        result.add_warning(f"DoD has {items} items (recommend 5-12, may be over-specified)")

    # Check for over-specification
    if re.search(r"90%|95%|100%.*coverage", dod_section, re.IGNORECASE):
        result.add_warning("DoD specifies high coverage targets - may be too strict for early phases")


def check_scope_indicators(content: str, result: ValidationResult) -> None:
    """Check for scope creep indicators."""
    # Count mentions of different bounded contexts
    bounded_contexts = [
        r"\bcasino\b", r"\btable\b", r"\bplayer\b", r"\brating\b",
        r"\bloyalty\b", r"\bfinance\b", r"\bmtl\b", r"\breward\b"
    ]

    found_contexts = []
    for bc in bounded_contexts:
        if re.search(bc, content, re.IGNORECASE):
            found_contexts.append(bc.replace(r"\b", ""))

    if len(found_contexts) > 4:
        result.add_warning(
            f"PRD mentions {len(found_contexts)} bounded contexts ({', '.join(found_contexts)}) - "
            "consider splitting into multiple PRDs"
        )


def check_prd_id(content: str, result: ValidationResult) -> None:
    """Check PRD follows ID convention."""
    # Look for PRD-XXX pattern in title
    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if title_match:
        title = title_match.group(1)
        if not re.search(r"PRD-\d{3}", title):
            result.add_warning("PRD title should follow 'PRD-XXX — Name' convention")


def validate_prd(filepath: Path) -> ValidationResult:
    """Main validation function."""
    result = ValidationResult()

    if not filepath.exists():
        result.add_error(f"File not found: {filepath}")
        return result

    content = filepath.read_text(encoding="utf-8")

    # Run all checks
    check_prd_id(content, result)
    check_required_sections(content, result)
    check_anti_patterns(content, result)
    check_goals_quality(content, result)
    check_non_goals(content, result)
    check_dod_quality(content, result)
    check_scope_indicators(content, result)

    return result


def main() -> int:
    """CLI entry point."""
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    filepath = Path(sys.argv[1])
    result = validate_prd(filepath)

    print(f"\n{'='*60}")
    print(f"PRD Validation: {filepath.name}")
    print(f"{'='*60}\n")

    # Print info
    if result.info:
        print("STRUCTURE CHECK:")
        for msg in result.info:
            print(f"  {msg}")
        print()

    # Print warnings
    if result.warnings:
        print("WARNINGS:")
        for msg in result.warnings:
            print(f"  {msg}")
        print()

    # Print errors
    if result.errors:
        print("ERRORS:")
        for msg in result.errors:
            print(f"  {msg}")
        print()

    # Summary
    print(f"{'='*60}")
    if result.passed:
        print("RESULT: PASSED (with warnings)" if result.warnings else "RESULT: PASSED")
        return 0
    else:
        print(f"RESULT: FAILED ({len(result.errors)} errors)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
