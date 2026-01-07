#!/usr/bin/env python3
"""
RLS Expert Skill - Documentation Freshness Checker

Validates that skill primitives are in sync with source governance documents.
Run this before making changes to ensure the skill reflects current ADRs and SEC docs.

Usage:
    python .claude/skills/rls-expert/scripts/check_doc_freshness.py

Exit codes:
    0 - All documents match expected hashes
    1 - One or more documents have changed (skill may need updating)
"""

import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

SCRIPT_DIR = Path(__file__).parent
SKILL_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = SKILL_DIR.parent.parent.parent
MANIFEST_PATH = SKILL_DIR / 'generated' / 'freshness-manifest.json'


def sha256_file(filepath: Path) -> str:
    """Compute SHA256 hash of a file."""
    if not filepath.exists():
        return "FILE_NOT_FOUND"
    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def load_manifest() -> Dict:
    """Load the freshness manifest."""
    if not MANIFEST_PATH.exists():
        print("ERROR: Freshness manifest not found!")
        print(f"  Expected at: {MANIFEST_PATH}")
        sys.exit(1)

    with open(MANIFEST_PATH, 'r') as f:
        return json.load(f)


def check_document(doc_key: str, doc_info: Dict, stale_threshold: int) -> Tuple[str, List[str]]:
    """
    Check a single document for freshness.

    Returns:
        Tuple of (status, messages) where status is 'ok', 'warning', or 'error'
    """
    doc_path = PROJECT_ROOT / doc_info['path']
    expected_hash = doc_info['sha256']
    actual_hash = sha256_file(doc_path)
    messages = []

    if actual_hash == "FILE_NOT_FOUND":
        messages.append(f"File not found: {doc_info['path']}")
        return 'warning', messages

    if actual_hash != expected_hash:
        messages.append(f"Source document has changed!")
        messages.append(f"Path: {doc_info['path']}")
        messages.append(f"Expected: {expected_hash[:16]}...")
        messages.append(f"Actual:   {actual_hash[:16]}...")
        messages.append(f"Security impact: {doc_info.get('security_impact', 'unknown')}")
        messages.append("Affected skill sections:")
        for section in doc_info.get('skill_sections', []):
            messages.append(f"  - {section}")
        return 'error', messages

    # Check staleness
    last_verified = doc_info.get('last_verified')
    if last_verified:
        verified_date = datetime.strptime(last_verified, '%Y-%m-%d')
        age_days = (datetime.now() - verified_date).days
        if age_days > stale_threshold:
            messages.append(f"Last verified {age_days} days ago (threshold: {stale_threshold})")
            return 'stale', messages

    return 'ok', messages


def print_report(results: Dict[str, List[Tuple[str, str, List[str]]]]) -> int:
    """Print the freshness report and return exit code."""
    print("=" * 70)
    print("RLS Expert Skill - Documentation Freshness Check")
    print("=" * 70)
    print()

    # Group by category
    categories = {
        'Security-Critical ADRs': [],
        'Strategy ADRs': [],
        'Security Policies': []
    }

    for category, docs in results.items():
        for doc_key, status, messages in docs:
            if category == 'security_critical':
                categories['Security-Critical ADRs'].append((doc_key, status, messages))
            elif category == 'strategy':
                categories['Strategy ADRs'].append((doc_key, status, messages))
            else:
                categories['Security Policies'].append((doc_key, status, messages))

    errors = 0
    warnings = 0
    stale = 0

    for cat_name, docs in categories.items():
        if not docs:
            continue
        print(f"\n{cat_name}:")
        print("-" * 50)
        for doc_key, status, messages in docs:
            if status == 'error':
                print(f"  ERROR: {doc_key}")
                errors += 1
            elif status == 'warning':
                print(f"  WARNING: {doc_key}")
                warnings += 1
            elif status == 'stale':
                print(f"  STALE: {doc_key}")
                stale += 1
            else:
                print(f"  OK: {doc_key}")

            for msg in messages:
                print(f"       {msg}")

    print()
    print("=" * 70)
    print(f"Summary: {errors} errors, {warnings} warnings, {stale} stale")
    print("=" * 70)

    if errors > 0:
        print()
        print("ACTION REQUIRED:")
        print("  1. Review changes in source governance documents")
        print("  2. Update affected SKILL.md sections and references/")
        print("  3. Regenerate manifest with: python scripts/regenerate_manifest.py")
        print()
        print("  Security-critical changes (ADR-024, ADR-023) may affect:")
        print("    - Context injection patterns")
        print("    - RPC security templates")
        print("    - Multi-tenancy guardrails")
        return 1

    if stale > 0:
        print()
        print("RECOMMENDATION: Re-verify stale documents against skill content")

    return 0


def main() -> int:
    """Main entry point."""
    manifest = load_manifest()
    stale_threshold = manifest.get('validation_rules', {}).get('stale_threshold_days', 30)

    results = {
        'security_critical': [],
        'strategy': [],
        'security_policies': []
    }

    for doc_key, doc_info in manifest.get('source_documents', {}).items():
        category = doc_info.get('category', 'strategy')
        status, messages = check_document(doc_key, doc_info, stale_threshold)
        results[category].append((doc_key, status, messages))

    return print_report(results)


if __name__ == '__main__':
    sys.exit(main())
