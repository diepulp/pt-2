#!/usr/bin/env python3
"""
Validation script for compressed memory files.

This script checks that compressed memory files maintain structural integrity:
- All markdown links are intact
- Headings are preserved
- Code blocks are complete
- File paths are valid

Usage:
    python scripts/validate_compressed_memory.py [path_to_compressed_file]
"""

import argparse
import re
import sys
from pathlib import Path
from typing import List, Tuple


def validate_markdown_links(content: str) -> Tuple[bool, List[str]]:
    """
    Validate that all markdown links have complete syntax [text](url).

    Returns:
        (is_valid, issues)
    """
    issues = []

    # Check for broken link patterns
    # Pattern: ]( should always be paired with [ before and ) after
    link_pattern = r'\[([^\]]*)\]\(([^\)]*)\)'
    links = re.findall(link_pattern, content)

    # Check for orphaned brackets
    orphaned_open = content.count('[') - content.count(']')
    orphaned_close = content.count('(') - content.count(')')

    if orphaned_open != 0:
        issues.append(f"Unmatched square brackets: {orphaned_open} extra '['")

    if orphaned_close != 0:
        issues.append(f"Unmatched parentheses: {orphaned_close} extra '('")

    # Check for incomplete links
    incomplete_pattern = r'\]\([^\)]*$'
    if re.search(incomplete_pattern, content):
        issues.append("Found incomplete link syntax (missing closing ')')")

    is_valid = len(issues) == 0
    return is_valid, issues


def validate_headings(content: str) -> Tuple[bool, List[str]]:
    """
    Validate that heading markers are preserved.

    Returns:
        (is_valid, issues)
    """
    issues = []

    # Check for headings
    heading_pattern = r'^#{1,6}\s+.+'
    headings = re.findall(heading_pattern, content, re.MULTILINE)

    if len(headings) == 0:
        issues.append("Warning: No headings found in file")

    # Check for broken heading syntax (# without space)
    broken_heading_pattern = r'^#{1,6}[^\s#]'
    broken_headings = re.findall(broken_heading_pattern, content, re.MULTILINE)

    if broken_headings:
        issues.append(f"Found {len(broken_headings)} malformed headings (# without space)")

    is_valid = len(issues) == 0
    return is_valid, issues


def validate_code_blocks(content: str) -> Tuple[bool, List[str]]:
    """
    Validate that code blocks have matching opening/closing markers.

    Returns:
        (is_valid, issues)
    """
    issues = []

    # Count triple backticks
    backtick_count = content.count('```')

    if backtick_count % 2 != 0:
        issues.append(f"Unmatched code blocks: {backtick_count} '```' markers (should be even)")

    is_valid = len(issues) == 0
    return is_valid, issues


def validate_file_paths(content: str) -> Tuple[bool, List[str]]:
    """
    Validate that file path references appear complete.

    Returns:
        (is_valid, issues)
    """
    issues = []

    # Pattern for file paths (e.g., docs/adr/FILE.md)
    path_pattern = r'[\w\-]+/[\w\-]+/[\w\-]+\.[\w]+'
    paths = re.findall(path_pattern, content)

    # Check for broken paths (missing extensions)
    broken_path_pattern = r'[\w\-]+/[\w\-]+/[\w\-]+[^.\s]$'
    broken_paths = re.findall(broken_path_pattern, content, re.MULTILINE)

    if broken_paths:
        issues.append(f"Warning: Found {len(broken_paths)} potentially incomplete file paths")

    is_valid = len(issues) == 0
    return is_valid, issues


def validate_file(file_path: Path) -> Tuple[bool, dict]:
    """
    Run all validation checks on a file.

    Returns:
        (is_valid, results_dict)
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return False, {'error': f"Failed to read file: {e}"}

    results = {}

    # Run all checks
    checks = [
        ('markdown_links', validate_markdown_links),
        ('headings', validate_headings),
        ('code_blocks', validate_code_blocks),
        ('file_paths', validate_file_paths),
    ]

    all_valid = True
    for check_name, check_func in checks:
        is_valid, issues = check_func(content)
        results[check_name] = {
            'valid': is_valid,
            'issues': issues
        }
        if not is_valid:
            all_valid = False

    # Add statistics
    results['stats'] = {
        'total_lines': content.count('\n') + 1,
        'total_chars': len(content),
        'total_words': len(content.split()),
        'markdown_links': len(re.findall(r'\[([^\]]*)\]\(([^\)]*)\)', content)),
        'headings': len(re.findall(r'^#{1,6}\s+.+', content, re.MULTILINE)),
        'code_blocks': content.count('```') // 2,
    }

    return all_valid, results


def print_results(file_path: Path, is_valid: bool, results: dict) -> None:
    """Pretty print validation results."""
    print(f"\n{'='*60}")
    print(f"VALIDATION REPORT: {file_path.name}")
    print(f"{'='*60}\n")

    if 'error' in results:
        print(f"❌ ERROR: {results['error']}")
        return

    # Print statistics
    print("📊 Statistics:")
    stats = results['stats']
    print(f"  Lines: {stats['total_lines']:,}")
    print(f"  Words: {stats['total_words']:,}")
    print(f"  Links: {stats['markdown_links']}")
    print(f"  Headings: {stats['headings']}")
    print(f"  Code blocks: {stats['code_blocks']}")
    print()

    # Print check results
    print("🔍 Validation Checks:")
    for check_name, check_result in results.items():
        if check_name == 'stats':
            continue

        valid = check_result['valid']
        issues = check_result['issues']

        status = "✅ PASS" if valid else "❌ FAIL"
        print(f"  {status}: {check_name.replace('_', ' ').title()}")

        if issues:
            for issue in issues:
                print(f"    - {issue}")

    print()
    print(f"{'='*60}")
    print(f"Overall: {'✅ VALID' if is_valid else '❌ INVALID'}")
    print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Validate compressed memory files for structural integrity"
    )
    parser.add_argument(
        "file",
        type=Path,
        nargs='?',
        help="Path to compressed memory file to validate"
    )
    parser.add_argument(
        "--dir",
        type=Path,
        default=Path(".claude/memory/compressed"),
        help="Directory to validate all files in (default: .claude/memory/compressed)"
    )

    args = parser.parse_args()

    # Determine files to validate
    if args.file:
        files_to_validate = [args.file]
    else:
        if not args.dir.exists():
            print(f"Error: Directory not found: {args.dir}")
            sys.exit(1)
        files_to_validate = list(args.dir.glob("*.memory.md"))

    if not files_to_validate:
        print("No files to validate")
        sys.exit(1)

    # Validate each file
    all_files_valid = True
    for file_path in files_to_validate:
        if not file_path.exists():
            print(f"Error: File not found: {file_path}")
            all_files_valid = False
            continue

        is_valid, results = validate_file(file_path)
        print_results(file_path, is_valid, results)

        if not is_valid:
            all_files_valid = False

    # Exit with appropriate code
    if all_files_valid:
        print("✅ All files passed validation!")
        sys.exit(0)
    else:
        print("❌ Some files failed validation")
        sys.exit(1)


if __name__ == "__main__":
    main()
