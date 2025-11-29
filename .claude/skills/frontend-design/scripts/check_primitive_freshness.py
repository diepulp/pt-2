#!/usr/bin/env python3
"""
Primitive Freshness Checker for Frontend Design Skill

Validates that skill primitives are in sync with source governance documents.
Run this before making changes to ensure primitives are current.

Usage:
    python .claude/skills/frontend-design/scripts/check_primitive_freshness.py
"""

import hashlib
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

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


def check_freshness() -> int:
    """Check all source documents against manifest hashes."""
    if not MANIFEST_PATH.exists():
        print("ERROR: Freshness manifest not found!")
        print(f"  Expected at: {MANIFEST_PATH}")
        return 1

    with open(MANIFEST_PATH, 'r') as f:
        manifest = json.load(f)

    errors = 0
    warnings = 0
    stale_threshold = manifest.get('validation_rules', {}).get('stale_threshold_days', 30)

    print("=" * 60)
    print("Frontend Design Skill - Primitive Freshness Check")
    print("=" * 60)
    print()

    for doc_key, doc_info in manifest.get('source_documents', {}).items():
        doc_path = PROJECT_ROOT / doc_info['path']
        expected_hash = doc_info['sha256']
        actual_hash = sha256_file(doc_path)

        # Check hash match
        if actual_hash == "FILE_NOT_FOUND":
            print(f"⚠️  WARNING: {doc_key}")
            print(f"   File not found: {doc_info['path']}")
            warnings += 1
        elif actual_hash != expected_hash:
            print(f"❌ ERROR: {doc_key}")
            print(f"   Source document has changed!")
            print(f"   Path: {doc_info['path']}")
            print(f"   Expected: {expected_hash[:16]}...")
            print(f"   Actual:   {actual_hash[:16]}...")
            print(f"   Affected primitives:")
            for prim in doc_info.get('derived_primitives', []):
                print(f"     - {prim}")
            errors += 1
        else:
            # Check staleness
            last_verified = doc_info.get('last_verified')
            if last_verified:
                verified_date = datetime.strptime(last_verified, '%Y-%m-%d')
                age_days = (datetime.now() - verified_date).days
                if age_days > stale_threshold:
                    print(f"⚠️  STALE: {doc_key}")
                    print(f"   Last verified {age_days} days ago (threshold: {stale_threshold})")
                    warnings += 1
                else:
                    print(f"✅ OK: {doc_key}")
            else:
                print(f"✅ OK: {doc_key}")

    print()
    print("=" * 60)
    print(f"Summary: {errors} errors, {warnings} warnings")
    print("=" * 60)

    if errors > 0:
        print()
        print("To fix hash mismatches:")
        print("1. Review changes in source governance documents")
        print("2. Update affected primitives if needed")
        print("3. Regenerate manifest with new hashes:")
        print("   sha256sum docs/{path-to-doc}")
        print("4. Update freshness-manifest.json with new hash")

    return 1 if errors > 0 else 0


if __name__ == '__main__':
    sys.exit(check_freshness())
