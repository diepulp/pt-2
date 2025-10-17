#!/usr/bin/env python3
"""
Test version - compress only first 3 files to validate approach
"""

from llmlingua import PromptCompressor
import os
import re
from pathlib import Path
from typing import List, Dict, Tuple

# Test on just 3 files
INPUT_DIR = "docs"
OUTPUT_DIR = "docs-compressed-test"
MAX_FILES = 3
MAX_CHUNK_WORDS = 350
COMPRESSION_RATE = 0.35

print("🔧 Initializing compressor...")
compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
    use_llmlingua2=True
)
print("✓ Ready\n")

def count_words(text: str) -> int:
    return len(text.split())

def chunk_by_sections(content: str, max_words: int) -> List[str]:
    sections = re.split(r'\n(?=##\s)', content)
    chunks = []

    for section in sections:
        word_count = count_words(section)

        if word_count <= max_words:
            chunks.append(section)
        else:
            paragraphs = section.split('\n\n')
            current_chunk = []
            current_words = 0

            for para in paragraphs:
                para_words = count_words(para)

                if current_words + para_words > max_words and current_chunk:
                    chunks.append('\n\n'.join(current_chunk))
                    current_chunk = [para]
                    current_words = para_words
                else:
                    current_chunk.append(para)
                    current_words += para_words

            if current_chunk:
                chunks.append('\n\n'.join(current_chunk))

    return chunks

def compress_file(file_path: Path, output_path: Path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    original_words = count_words(content)

    if original_words == 0:
        print(f"   ⏭️  {file_path.name} - empty, skipping\n")
        return

    chunks = chunk_by_sections(content, MAX_CHUNK_WORDS)
    print(f"   📄 {file_path.name} ({original_words} words, {len(chunks)} chunks)")

    compressed_chunks = []
    for i, chunk in enumerate(chunks, 1):
        try:
            result = compressor.compress_prompt(
                [chunk],
                rate=COMPRESSION_RATE,
                use_context_level_filter=False,
                use_token_level_filter=True
            )
            compressed_chunks.append(result['compressed_prompt'])
            print(f"      ✓ Chunk {i}/{len(chunks)}")
        except Exception as e:
            print(f"      ⚠️  Chunk {i}/{len(chunks)} failed: {str(e)[:50]}")
            compressed_chunks.append(chunk)

    compressed_content = '\n\n'.join(compressed_chunks)
    compressed_words = count_words(compressed_content)
    reduction = ((original_words - compressed_words) / original_words * 100) if original_words > 0 else 0

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(compressed_content)

    print(f"      ✅ {original_words} → {compressed_words} words ({reduction:.1f}% reduction)\n")

def main():
    input_path = Path(INPUT_DIR)
    output_path = Path(OUTPUT_DIR)

    md_files = sorted(input_path.rglob('*.md'))[:MAX_FILES]

    print(f"🧪 TEST MODE: Processing {len(md_files)} files\n")
    print("=" * 60)
    print()

    for md_file in md_files:
        rel_path = md_file.relative_to(input_path)
        out_path = output_path / rel_path
        compress_file(md_file, out_path)

    print("=" * 60)
    print(f"✅ Test complete! Check {output_path}/ for results")

if __name__ == "__main__":
    main()
