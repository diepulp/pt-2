#!/usr/bin/env python3
"""
RLS Expert Skill - Manifest Regeneration Script

Regenerates freshness-manifest.json with current SHA256 hashes.
Run this after updating skill primitives to reflect governance document changes.

Usage:
    python .claude/skills/rls-expert/scripts/regenerate_manifest.py
"""

import hashlib
import json
import sys
from datetime import datetime
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


def regenerate_manifest() -> int:
    """Regenerate manifest with current hashes."""
    if not MANIFEST_PATH.exists():
        print("ERROR: Manifest not found. Cannot regenerate.")
        return 1

    with open(MANIFEST_PATH, 'r') as f:
        manifest = json.load(f)

    today = datetime.now().strftime('%Y-%m-%d')
    updated_count = 0

    print("=" * 60)
    print("RLS Expert Skill - Manifest Regeneration")
    print("=" * 60)
    print()

    for doc_key, doc_info in manifest.get('source_documents', {}).items():
        doc_path = PROJECT_ROOT / doc_info['path']
        old_hash = doc_info['sha256']
        new_hash = sha256_file(doc_path)

        if new_hash == "FILE_NOT_FOUND":
            print(f"  SKIP: {doc_key} (file not found)")
            continue

        if new_hash != old_hash:
            print(f"  UPDATE: {doc_key}")
            print(f"    Old: {old_hash[:16]}...")
            print(f"    New: {new_hash[:16]}...")
            doc_info['sha256'] = new_hash
            doc_info['last_verified'] = today
            updated_count += 1
        else:
            # Update last_verified date even if hash unchanged
            doc_info['last_verified'] = today
            print(f"  OK: {doc_key} (verified)")

    manifest['generated_at'] = today

    with open(MANIFEST_PATH, 'w') as f:
        json.dump(manifest, f, indent=2)

    print()
    print("=" * 60)
    print(f"Manifest updated: {updated_count} hash(es) changed")
    print(f"All documents verified as of {today}")
    print("=" * 60)

    return 0


if __name__ == '__main__':
    sys.exit(regenerate_manifest())
