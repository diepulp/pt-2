#!/usr/bin/env python3
"""
LLMLingua Repository Compression Tool
Compresses markdown documentation while respecting context window limits.
"""

from llmlingua import PromptCompressor
import os
import re
from pathlib import Path
from typing import List, Dict, Tuple
import json
from datetime import datetime

# ===========================
# Configuration
# ===========================
INPUT_DIR = "docs"
OUTPUT_DIR = "docs-compressed"
STATS_FILE = "compression_stats.json"
MAX_CHUNK_WORDS = 350  # Safe limit for 512 token context
COMPRESSION_RATE = 0.35  # Keep 35% of tokens
SKIP_FILES = ["llm-lingua-compressed.md", "llm-lingua-input.md", "decompressed.md"]

# ===========================
# Initialize Compressor
# ===========================
print("🔧 Initializing LLMLingua-2 compressor...")
compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
    use_llmlingua2=True
)
print("✓ Compressor ready\n")

# ===========================
# Helper Functions
# ===========================

def count_words(text: str) -> int:
    """Count words in text"""
    return len(text.split())

def chunk_by_sections(content: str, max_words: int) -> List[str]:
    """
    Split content by ## headers, further chunking if sections are too large.
    """
    # Split by level-2 headers
    sections = re.split(r'\n(?=##\s)', content)

    chunks = []
    for section in sections:
        word_count = count_words(section)

        if word_count <= max_words:
            chunks.append(section)
        else:
            # Section too large, chunk by paragraphs
            paragraphs = section.split('\n\n')
            current_chunk = []
            current_words = 0

            for para in paragraphs:
                para_words = count_words(para)

                if current_words + para_words > max_words and current_chunk:
                    # Flush current chunk
                    chunks.append('\n\n'.join(current_chunk))
                    current_chunk = [para]
                    current_words = para_words
                else:
                    current_chunk.append(para)
                    current_words += para_words

            # Flush remaining
            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))

    return chunks

def compress_chunk(chunk: str, chunk_num: int, total_chunks: int) -> Tuple[str, bool]:
    """
    Compress a single chunk with LLMLingua-2.
    Returns (compressed_text, success)
    """
    try:
        result = compressor.compress_prompt(
            [chunk],
            rate=COMPRESSION_RATE,
            use_context_level_filter=False,
            use_token_level_filter=True
        )
        return result['compressed_prompt'], True
    except Exception as e:
        error_msg = str(e)[:80]
        print(f"      ⚠️  Chunk {chunk_num}/{total_chunks} failed: {error_msg}")
        return chunk, False  # Return original on failure

def compress_file(file_path: Path, output_path: Path) -> Dict:
    """
    Compress a single markdown file.
    Returns compression statistics.
    """
    # Read source
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_words = count_words(content)

    # Skip empty files
    if original_words == 0:
        return {
            'status': 'skipped',
            'reason': 'empty file',
            'original_words': 0,
            'compressed_words': 0
        }

    # Chunk content
    chunks = chunk_by_sections(content, MAX_CHUNK_WORDS)
    total_chunks = len(chunks)

    print(f"   📄 {file_path.name} ({original_words} words, {total_chunks} chunks)")

    # Compress each chunk
    compressed_chunks = []
    success_count = 0

    for i, chunk in enumerate(chunks, 1):
        compressed, success = compress_chunk(chunk, i, total_chunks)
        compressed_chunks.append(compressed)
        if success:
            success_count += 1
        print(f"      {'✓' if success else '⚠'} Chunk {i}/{total_chunks}", end='\r')

    print()  # New line after progress

    # Reassemble
    compressed_content = '\n\n'.join(compressed_chunks)
    compressed_words = count_words(compressed_content)

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(compressed_content)

    # Calculate stats
    reduction = ((original_words - compressed_words) / original_words * 100) if original_words > 0 else 0

    print(f"      ✅ {original_words} → {compressed_words} words ({reduction:.1f}% reduction)")
    print()

    return {
        'status': 'success',
        'original_words': original_words,
        'compressed_words': compressed_words,
        'reduction_percent': round(reduction, 1),
        'total_chunks': total_chunks,
        'successful_chunks': success_count,
        'failed_chunks': total_chunks - success_count
    }

def compress_directory(input_dir: Path, output_dir: Path) -> Dict:
    """
    Recursively compress all markdown files in directory.
    Returns overall statistics.
    """
    stats = {
        'start_time': datetime.now().isoformat(),
        'files': {},
        'totals': {
            'total_files': 0,
            'successful_files': 0,
            'skipped_files': 0,
            'original_words': 0,
            'compressed_words': 0
        }
    }

    # Find all markdown files
    md_files = sorted(input_dir.rglob('*.md'))

    print(f"📊 Found {len(md_files)} markdown files\n")
    print("=" * 80)
    print()

    for md_file in md_files:
        # Skip certain files
        if md_file.name in SKIP_FILES:
            print(f"⏭️  Skipping {md_file.name}")
            print()
            continue

        # Calculate relative path
        rel_path = md_file.relative_to(input_dir)
        output_path = output_dir / rel_path

        # Compress file
        file_stats = compress_file(md_file, output_path)

        # Update stats
        stats['files'][str(rel_path)] = file_stats
        stats['totals']['total_files'] += 1

        if file_stats['status'] == 'success':
            stats['totals']['successful_files'] += 1
            stats['totals']['original_words'] += file_stats['original_words']
            stats['totals']['compressed_words'] += file_stats['compressed_words']
        elif file_stats['status'] == 'skipped':
            stats['totals']['skipped_files'] += 1

    # Calculate overall reduction
    if stats['totals']['original_words'] > 0:
        overall_reduction = (
            (stats['totals']['original_words'] - stats['totals']['compressed_words'])
            / stats['totals']['original_words'] * 100
        )
        stats['totals']['reduction_percent'] = round(overall_reduction, 1)

    stats['end_time'] = datetime.now().isoformat()

    return stats

# ===========================
# Main Execution
# ===========================

def main():
    print()
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 20 + "LLMLingua Repository Compressor" + " " * 27 + "║")
    print("╚" + "=" * 78 + "╝")
    print()

    input_path = Path(INPUT_DIR)
    output_path = Path(OUTPUT_DIR)

    # Validate input
    if not input_path.exists():
        print(f"❌ Error: Input directory '{INPUT_DIR}' not found")
        return

    # Clean output directory
    if output_path.exists():
        print(f"🗑️  Cleaning existing output directory...")
        import shutil
        shutil.rmtree(output_path)

    print(f"📂 Input:  {input_path}")
    print(f"📂 Output: {output_path}")
    print(f"⚙️  Config: {COMPRESSION_RATE:.0%} retention, {MAX_CHUNK_WORDS} word chunks")
    print()

    # Compress
    stats = compress_directory(input_path, output_path)

    # Save statistics
    stats_path = output_path / STATS_FILE
    with open(stats_path, 'w') as f:
        json.dump(stats, f, indent=2)

    # Print summary
    print()
    print("=" * 80)
    print()
    print("📊 COMPRESSION SUMMARY")
    print("-" * 80)
    print(f"Total Files:       {stats['totals']['total_files']}")
    print(f"Successful:        {stats['totals']['successful_files']}")
    print(f"Skipped:           {stats['totals']['skipped_files']}")
    print(f"Original Words:    {stats['totals']['original_words']:,}")
    print(f"Compressed Words:  {stats['totals']['compressed_words']:,}")
    print(f"Overall Reduction: {stats['totals'].get('reduction_percent', 0):.1f}%")
    print()
    print(f"✅ Compression complete!")
    print(f"📁 Output: {output_path}/")
    print(f"📈 Stats:  {stats_path}")
    print()

if __name__ == "__main__":
    main()
