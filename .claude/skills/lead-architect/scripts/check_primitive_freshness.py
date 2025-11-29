#!/usr/bin/env python3
"""
Primitive Freshness Checker for Lead Architect Skill

Validates that skill primitives are in sync with source governance documents.
Run before using the lead-architect skill to catch stale context.

Usage:
    python check_primitive_freshness.py [--fix]

Options:
    --fix    Update the manifest with current hashes (after reviewing changes)
"""

import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

# ANSI colors
RED = '\033[91m'
GREEN = '\033[92m'
YELLOW = '\033[93m'
CYAN = '\033[96m'
RESET = '\033[0m'
BOLD = '\033[1m'

# Paths relative to project root
SCRIPT_DIR = Path(__file__).parent
SKILL_DIR = SCRIPT_DIR.parent
PROJECT_ROOT = SKILL_DIR.parent.parent.parent
MANIFEST_PATH = SKILL_DIR / 'generated' / 'freshness-manifest.json'


def sha256_file(filepath: Path) -> str:
    """Calculate SHA256 hash of a file."""
    if not filepath.exists():
        return "FILE_NOT_FOUND"

    sha256_hash = hashlib.sha256()
    with open(filepath, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def load_manifest() -> dict:
    """Load the freshness manifest."""
    if not MANIFEST_PATH.exists():
        print(f"{RED}ERROR: Manifest not found at {MANIFEST_PATH}{RESET}")
        sys.exit(1)

    with open(MANIFEST_PATH, 'r') as f:
        return json.load(f)


def check_freshness(fix_mode: bool = False) -> tuple[int, int, int]:
    """
    Check all source documents for freshness.

    Returns:
        Tuple of (errors, warnings, ok_count)
    """
    manifest = load_manifest()
    errors = 0
    warnings = 0
    ok_count = 0
    updates = {}

    print(f"\n{BOLD}Lead Architect Primitive Freshness Check{RESET}")
    print(f"{'=' * 50}\n")

    stale_threshold = manifest.get('validation_rules', {}).get('stale_threshold_days', 30)
    stale_date = datetime.now() - timedelta(days=stale_threshold)

    for doc_key, doc_info in manifest.get('source_documents', {}).items():
        doc_path = PROJECT_ROOT / doc_info['path']
        expected_hash = doc_info['sha256']
        actual_hash = sha256_file(doc_path)
        last_verified = datetime.fromisoformat(doc_info['last_verified'])

        print(f"{CYAN}{doc_key}{RESET} ({doc_info['version']})")
        print(f"  Path: {doc_info['path']}")

        # Check hash match
        if actual_hash == "FILE_NOT_FOUND":
            print(f"  {RED}✗ FILE NOT FOUND{RESET}")
            errors += 1
        elif actual_hash != expected_hash:
            print(f"  {RED}✗ HASH MISMATCH - Source document has changed!{RESET}")
            print(f"    Expected: {expected_hash[:16]}...")
            print(f"    Actual:   {actual_hash[:16]}...")
            print(f"    {YELLOW}Primitives may be stale:{RESET}")
            for prim in doc_info.get('derived_primitives', []):
                print(f"      - {prim}")
            errors += 1
            updates[doc_key] = actual_hash
        else:
            # Check staleness
            if last_verified < stale_date:
                print(f"  {YELLOW}⚠ STALE - Last verified {doc_info['last_verified']}{RESET}")
                warnings += 1
            else:
                print(f"  {GREEN}✓ OK{RESET} (verified {doc_info['last_verified']})")
                ok_count += 1

        print()

    # Summary
    print(f"{'=' * 50}")
    print(f"{BOLD}Summary:{RESET}")
    print(f"  {GREEN}OK:{RESET} {ok_count}")
    print(f"  {YELLOW}Warnings:{RESET} {warnings}")
    print(f"  {RED}Errors:{RESET} {errors}")

    if errors > 0:
        print(f"\n{RED}{BOLD}ACTION REQUIRED:{RESET}")
        print("  Source documents have changed. Primitives may need updates.")
        print("  1. Review changes in source documents")
        print("  2. Update derived primitives if needed")
        print("  3. Run with --fix to update manifest hashes")

        if fix_mode and updates:
            print(f"\n{YELLOW}Updating manifest with new hashes...{RESET}")
            update_manifest(manifest, updates)
            print(f"{GREEN}Manifest updated. Re-run to verify.{RESET}")

    if warnings > 0:
        print(f"\n{YELLOW}RECOMMENDATION:{RESET}")
        print(f"  Some documents haven't been verified in {stale_threshold}+ days.")
        print("  Consider reviewing primitives for drift.")

    return errors, warnings, ok_count


def update_manifest(manifest: dict, updates: dict[str, str]) -> None:
    """Update manifest with new hashes."""
    today = datetime.now().strftime('%Y-%m-%d')

    for doc_key, new_hash in updates.items():
        if doc_key in manifest['source_documents']:
            manifest['source_documents'][doc_key]['sha256'] = new_hash
            manifest['source_documents'][doc_key]['last_verified'] = today

    manifest['generated_at'] = datetime.now().isoformat() + 'Z'

    with open(MANIFEST_PATH, 'w') as f:
        json.dump(manifest, f, indent=2)


def main():
    fix_mode = '--fix' in sys.argv

    errors, warnings, ok_count = check_freshness(fix_mode)

    # Exit code: 1 if errors, 0 otherwise
    sys.exit(1 if errors > 0 else 0)


if __name__ == '__main__':
    main()
