# Archived Memori Scripts - Obsolete Approach

**Date Archived:** 2025-11-18
**Reason:** Incorrect architecture - tried to use Memori as documentation storage

## What These Scripts Did (Incorrectly)

These scripts attempted to ingest PT-2's static documentation (SRM, ADRs, etc.) directly into Memori's memory database as whole documents.

### Problems with This Approach

1. **Misunderstood Memori's purpose** - It's for agent session memory, not doc storage
2. **Massive memories** - 86KB documents stored as single memories
3. **Poor retrieval** - Queries returned whole documents instead of specific facts
4. **Token waste** - ~25,000 tokens per query vs ~300 with correct approach
5. **No semantic extraction** - Facts buried in noise

## Archived Files

### `memori-ingest.py`
Original ingestion script that stored whole documents from glob patterns.

### `memori-ingest-simple.py`
Simplified version, still with same fundamental issue.

### `memori-ingest-v2.py`
Attempted fix with chunking and LLM extraction, but still wrong approach - tried to extract documentation into memories instead of keeping docs in files.

### `IMPLEMENTATION_GUIDE_OBSOLETE.md`
Guide for the v2 chunking approach - technically better than whole docs, but still philosophically wrong.

## Correct Approach

See **`.memori/CORRECT_ARCHITECTURE.md`** for the proper way to use Memori:

- **Memori** = Agent session memory (learnings, preferences, context)
- **File system** = Documentation storage (SRM, ADRs, templates)
- **Metadata** = Doc references in Memori (pointers, not content)

## Current Scripts (Correct)

- `scripts/memori-reset-and-seed.py` - Reset DB and seed agent context
- `scripts/memori-init-db.py` - Initialize Memori schema
- `scripts/memori-test.py` - Test Memori queries

## What We Learned

**Don't try to make Memori a documentation database.**

Memori should store:
- "Created MTLService at src/services/mtl.service.ts"
- "User prefers functional factories"
- "CTR threshold is $10,000" (fact, not whole SRM)

NOT store:
- Entire SERVICE_RESPONSIBILITY_MATRIX.md (86KB)
- Whole ADR documents
- Complete anti-pattern catalogs

Keep documentation in git where it belongs. Use Memori for what it's designed for: remembering what agents learned across sessions.
