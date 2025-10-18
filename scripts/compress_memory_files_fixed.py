#!/usr/bin/env python3
"""
Memory File Compressor using LLMLingua-2 (FIXED VERSION)

CRITICAL FIX: Addresses "Token indices sequence length is longer than the
specified maximum sequence length" error by implementing proper chunking
and token limit enforcement.

Changes from original:
- Added chunking for files >200 words
- Token estimation: 1 word ≈ 1.3 tokens (safer than 0.75)
- Max chunk size: 200 words ≈ 260 tokens (well under 512 limit)
- Chunk-by-section for better context preservation

Usage:
    python scripts/compress_memory_files_fixed.py [options]
"""

import argparse
import logging
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    from llmlingua import PromptCompressor
except ImportError:
    print("ERROR: llmlingua not installed. Run: pip install llmlingua")
    sys.exit(1)


# Markdown-specific tokens to preserve during compression
MARKDOWN_FORCE_TOKENS = [
    # Structural
    "\n", "\n\n",

    # Punctuation
    ".", "!", "?", ",", ":", ";",

    # Markdown syntax - Links & References
    "[", "]", "(", ")", "/",

    # Markdown syntax - Headings
    "#", "##", "###", "####",

    # Markdown syntax - Code
    "`", "```",

    # Markdown syntax - Lists
    "-", "*",

    # Markdown syntax - Tables
    "|",

    # Markdown syntax - Emphasis
    "**",

    # Special characters (emojis/status indicators)
    "✅", "❌", "⏳", "⏸️", "⚠️", "🔴",

    # File paths & references
    "_", "@",
]


# CRITICAL: Token limit configuration
# LLMLingua-2 model has 512 token context window
# Rough estimate: 1 word ≈ 1.3 tokens (conservative)
# Max safe chunk: 200 words ≈ 260 tokens (leaves buffer)
MAX_CHUNK_WORDS = 200  # REDUCED from 350 to stay under 512 token limit
TOKEN_TO_WORD_RATIO = 1.3  # Conservative estimate


def setup_logging(verbose: bool = False) -> logging.Logger:
    """Configure logging with appropriate level."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(levelname)s: %(message)s'
    )
    return logging.getLogger(__name__)


def count_words(text: str) -> int:
    """Count words in text."""
    return len(text.split())


def estimate_tokens(text: str) -> int:
    """Estimate token count from word count (conservative)."""
    word_count = count_words(text)
    return int(word_count * TOKEN_TO_WORD_RATIO)


def chunk_by_sections(content: str, max_words: int = MAX_CHUNK_WORDS) -> List[Tuple[str, str]]:
    """
    Split content by ## headers, further chunking if sections are too large.
    Returns list of (chunk_content, chunk_label) tuples.

    This prevents the "Token indices sequence length" error by ensuring
    no chunk exceeds the model's 512 token limit.
    """
    # Split by level-2 headers
    sections = re.split(r'\n(?=##\s)', content)

    chunks = []
    for section_num, section in enumerate(sections, 1):
        word_count = count_words(section)
        estimated_tokens = estimate_tokens(section)

        # Extract section title for labeling
        title_match = re.match(r'##\s+(.+)', section)
        section_title = title_match.group(1) if title_match else f"Section {section_num}"

        if word_count <= max_words:
            chunks.append((section, section_title))
        else:
            # Section too large, chunk by paragraphs
            paragraphs = section.split('\n\n')
            current_chunk = []
            current_words = 0
            part_num = 1

            for para in paragraphs:
                para_words = count_words(para)

                if current_words + para_words > max_words and current_chunk:
                    # Flush current chunk
                    chunk_content = '\n\n'.join(current_chunk)
                    chunk_label = f"{section_title} (Part {part_num})"
                    chunks.append((chunk_content, chunk_label))

                    current_chunk = [para]
                    current_words = para_words
                    part_num += 1
                else:
                    current_chunk.append(para)
                    current_words += para_words

            # Flush remaining
            if current_chunk:
                chunk_content = '\n\n'.join(current_chunk)
                chunk_label = f"{section_title} (Part {part_num})" if part_num > 1 else section_title
                chunks.append((chunk_content, chunk_label))

    return chunks


def load_compressor(verbose: bool = False) -> PromptCompressor:
    """
    Initialize LLMLingua-2 compressor with optimal model.
    """
    logger = logging.getLogger(__name__)
    logger.info("Loading LLMLingua-2 model (this may take a moment)...")

    try:
        compressor = PromptCompressor(
            model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
            use_llmlingua2=True,
            device_map="cpu"
        )
        logger.info("✓ Model loaded successfully")
        return compressor
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        logger.info("Trying alternative model...")
        try:
            compressor = PromptCompressor(
                model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
                use_llmlingua2=True,
                device_map="cpu"
            )
            logger.info("✓ Alternative model loaded successfully")
            return compressor
        except Exception as e2:
            logger.error(f"Failed to load alternative model: {e2}")
            sys.exit(1)


def compress_chunk(
    compressor: PromptCompressor,
    chunk: str,
    rate: float,
    force_tokens: List[str],
    chunk_num: int,
    total_chunks: int,
    verbose: bool = False
) -> Tuple[str, bool, Dict]:
    """
    Compress a single chunk with LLMLingua-2.
    Returns (compressed_text, success, stats).
    """
    logger = logging.getLogger(__name__)

    # Safety check
    estimated_tokens = estimate_tokens(chunk)
    if estimated_tokens > 500:
        logger.warning(
            f"Chunk {chunk_num} has ~{estimated_tokens} estimated tokens (close to 512 limit). "
            f"Consider reducing max_chunk_words."
        )

    try:
        result = compressor.compress_prompt(
            chunk,
            rate=rate,
            force_tokens=force_tokens,
            drop_consecutive=True,
        )

        original_words = count_words(chunk)
        compressed_words = count_words(result['compressed_prompt'])
        reduction = ((original_words - compressed_words) / original_words * 100) if original_words > 0 else 0

        stats = {
            'original_words': original_words,
            'compressed_words': compressed_words,
            'estimated_tokens': estimated_tokens,
            'reduction_percent': round(reduction, 1)
        }

        if verbose:
            logger.debug(
                f"Chunk {chunk_num}/{total_chunks}: "
                f"{original_words} words (~{estimated_tokens} tokens) → "
                f"{compressed_words} words ({reduction:.1f}% reduction)"
            )

        return result['compressed_prompt'], True, stats

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Chunk {chunk_num}/{total_chunks} failed: {error_msg[:100]}")

        # Check if it's the token limit error
        if "sequence length" in error_msg.lower() or "512" in error_msg:
            logger.error(
                f"  → This is a TOKEN LIMIT error. Chunk has ~{estimated_tokens} tokens. "
                f"Reduce max_chunk_words (current: {MAX_CHUNK_WORDS})"
            )

        return chunk, False, {
            'original_words': count_words(chunk),
            'compressed_words': count_words(chunk),
            'estimated_tokens': estimated_tokens,
            'reduction_percent': 0.0,
            'error': error_msg[:100]
        }


def compress_file(
    compressor: PromptCompressor,
    input_path: Path,
    output_path: Path,
    rate: float = 0.4,
    force_tokens: Optional[List[str]] = None,
    dry_run: bool = False,
    verbose: bool = False
) -> Dict:
    """
    Compress a single memory file with automatic chunking.
    """
    logger = logging.getLogger(__name__)
    logger.info(f"Processing: {input_path.name}")

    # Read input file
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            original_text = f.read()
    except Exception as e:
        logger.error(f"Failed to read {input_path}: {e}")
        raise

    original_words = count_words(original_text)
    original_tokens = estimate_tokens(original_text)

    # Skip empty files
    if original_words == 0:
        logger.info("  → Skipped (empty file)")
        return {
            'status': 'skipped',
            'reason': 'empty file',
            'original_words': 0,
            'compressed_words': 0
        }

    # Combine force tokens
    all_force_tokens = list(set(MARKDOWN_FORCE_TOKENS + (force_tokens or [])))

    # Chunk if necessary
    if original_words > MAX_CHUNK_WORDS:
        logger.info(f"  → {original_words:,} words (~{original_tokens} tokens) - chunking required")
        chunks = chunk_by_sections(original_text, MAX_CHUNK_WORDS)
        total_chunks = len(chunks)
        logger.info(f"  → Split into {total_chunks} chunks")
    else:
        logger.info(f"  → {original_words:,} words (~{original_tokens} tokens) - single chunk")
        chunks = [(original_text, "Full content")]
        total_chunks = 1

    # Compress each chunk
    compressed_chunks = []
    chunk_stats_list = []
    success_count = 0

    for i, (chunk_content, chunk_label) in enumerate(chunks, 1):
        if verbose:
            logger.info(f"  → Chunk {i}/{total_chunks}: {chunk_label}")

        compressed, success, stats = compress_chunk(
            compressor,
            chunk_content,
            rate,
            all_force_tokens,
            i,
            total_chunks,
            verbose
        )

        compressed_chunks.append(compressed)
        chunk_stats_list.append(stats)

        if success:
            success_count += 1

    # Reassemble
    compressed_content = '\n\n'.join(compressed_chunks)
    compressed_words = count_words(compressed_content)
    compressed_tokens = estimate_tokens(compressed_content)

    # Write output (unless dry run)
    if not dry_run:
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(compressed_content)
            logger.info(f"  ✓ Written to: {output_path}")
        except Exception as e:
            logger.error(f"Failed to write {output_path}: {e}")
            raise
    else:
        logger.info(f"  [DRY RUN] Would write to: {output_path}")

    # Calculate stats
    reduction = ((original_words - compressed_words) / original_words * 100) if original_words > 0 else 0

    logger.info(
        f"  ✓ {original_words:,} → {compressed_words:,} words "
        f"(~{original_tokens} → ~{compressed_tokens} tokens, {reduction:.1f}% reduction)"
    )

    return {
        'status': 'success',
        'original_words': original_words,
        'compressed_words': compressed_words,
        'original_tokens_estimate': original_tokens,
        'compressed_tokens_estimate': compressed_tokens,
        'reduction_percent': round(reduction, 1),
        'total_chunks': total_chunks,
        'successful_chunks': success_count,
        'failed_chunks': total_chunks - success_count,
        'chunk_stats': chunk_stats_list
    }


def compress_directory(
    input_dir: Path,
    output_dir: Path,
    rate: float = 0.4,
    force_tokens: Optional[List[str]] = None,
    dry_run: bool = False,
    verbose: bool = False
) -> None:
    """
    Compress all .memory.md files in a directory.
    """
    logger = logging.getLogger(__name__)

    # Find all memory files
    memory_files = list(input_dir.glob("*.memory.md"))

    if not memory_files:
        logger.warning(f"No .memory.md files found in {input_dir}")
        return

    logger.info(f"Found {len(memory_files)} memory files to compress")
    logger.info(f"Max chunk size: {MAX_CHUNK_WORDS} words (~{int(MAX_CHUNK_WORDS * TOKEN_TO_WORD_RATIO)} tokens)")
    logger.info("")

    # Load compressor once for all files
    compressor = load_compressor(verbose=verbose)
    logger.info("")

    # Process each file
    total_stats = {
        'original_words': 0,
        'compressed_words': 0,
        'files_processed': 0
    }

    for input_path in sorted(memory_files):
        # Generate output path
        output_path = output_dir / input_path.name

        try:
            result = compress_file(
                compressor,
                input_path,
                output_path,
                rate=rate,
                force_tokens=force_tokens,
                dry_run=dry_run,
                verbose=verbose
            )

            total_stats['files_processed'] += 1

            if result['status'] == 'success':
                total_stats['original_words'] += result['original_words']
                total_stats['compressed_words'] += result['compressed_words']

            logger.info("")

        except Exception as e:
            logger.error(f"Failed to process {input_path.name}: {e}")
            logger.info("")

    # Summary
    if total_stats['files_processed'] > 0:
        total_ratio = (
            total_stats['compressed_words'] / total_stats['original_words']
            if total_stats['original_words'] > 0 else 0
        )
        total_reduction = (1 - total_ratio) * 100

        logger.info("=" * 60)
        logger.info("SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Files processed: {total_stats['files_processed']}")
        logger.info(f"Total original words: {total_stats['original_words']:,}")
        logger.info(f"Total compressed words: {total_stats['compressed_words']:,}")
        logger.info(f"Overall reduction: {total_reduction:.1f}%")

        if dry_run:
            logger.info("")
            logger.info("[DRY RUN] No files were written")


def main():
    parser = argparse.ArgumentParser(
        description="Compress memory files using LLMLingua-2 (FIXED: proper chunking)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        "--rate",
        type=float,
        default=0.4,
        help="Compression rate (0.0-1.0), default: 0.4"
    )

    parser.add_argument(
        "--input",
        type=Path,
        help="Single input file to compress"
    )

    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path(".claude/memory"),
        help="Directory containing .memory.md files (default: .claude/memory)"
    )

    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(".claude/memory/compressed"),
        help="Output directory for compressed files (default: .claude/memory/compressed)"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show compression results without writing files"
    )

    parser.add_argument(
        "--force-tokens",
        type=str,
        help="Additional tokens to preserve (comma-separated)"
    )

    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable detailed logging"
    )

    args = parser.parse_args()

    # Setup logging
    logger = setup_logging(args.verbose)

    # Validate compression rate
    if not 0.0 <= args.rate <= 1.0:
        logger.error("Compression rate must be between 0.0 and 1.0")
        sys.exit(1)

    # Parse additional force tokens
    additional_tokens = []
    if args.force_tokens:
        additional_tokens = [t.strip() for t in args.force_tokens.split(",")]
        logger.info(f"Using {len(additional_tokens)} additional force tokens")

    # Process files
    try:
        if args.input:
            # Single file mode
            if not args.input.exists():
                logger.error(f"Input file not found: {args.input}")
                sys.exit(1)

            output_path = args.output_dir / args.input.name
            compressor = load_compressor(verbose=args.verbose)

            compress_file(
                compressor,
                args.input,
                output_path,
                rate=args.rate,
                force_tokens=additional_tokens,
                dry_run=args.dry_run,
                verbose=args.verbose
            )
        else:
            # Directory mode
            if not args.input_dir.exists():
                logger.error(f"Input directory not found: {args.input_dir}")
                sys.exit(1)

            compress_directory(
                args.input_dir,
                args.output_dir,
                rate=args.rate,
                force_tokens=additional_tokens,
                dry_run=args.dry_run,
                verbose=args.verbose
            )

    except KeyboardInterrupt:
        logger.info("\n\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
