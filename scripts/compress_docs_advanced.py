#!/usr/bin/env python3
"""
Advanced Documentation Compression using LLMLingua-2

Compresses the docs/ directory while preserving markdown structure and links
using advanced force_tokens feature for guaranteed structural integrity.

Features:
- Markdown link preservation: [text](path) syntax intact
- Heading hierarchy maintained: #, ##, ###
- Code blocks preserved: ``` pairs
- Smart chunking for large files (respects section boundaries)
- Validation of compressed output
- Detailed statistics and reporting

Usage:
    python scripts/compress_docs_advanced.py [options]

Options:
    --input-dir PATH       Input directory (default: docs)
    --output-dir PATH      Output directory (default: docs-compressed)
    --rate FLOAT           Compression rate (default: 0.35)
    --max-chunk-words INT  Maximum words per chunk (default: 200, ~260 tokens)
    --dry-run              Show what would be compressed without writing
    --validate             Validate compressed files after compression
    --verbose              Enable detailed logging
    --skip-patterns LIST   Comma-separated file patterns to skip

Examples:
    # Compress docs with default settings
    python scripts/compress_docs_advanced.py

    # Dry run with validation
    python scripts/compress_docs_advanced.py --dry-run --validate --verbose

    # Custom compression rate and chunk size
    python scripts/compress_docs_advanced.py --rate 0.4 --max-chunk-words 500
"""

import argparse
import json
import logging
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

try:
    from llmlingua import PromptCompressor
except ImportError:
    print("ERROR: llmlingua not installed. Run: pip install llmlingua")
    sys.exit(1)


# ============================================================================
# Markdown Force Tokens (Advanced Pattern)
# ============================================================================

MARKDOWN_FORCE_TOKENS = [
    # Structural
    "\n",           # Line breaks (critical for markdown)
    "\n\n",         # Paragraph breaks

    # Punctuation
    ".",            # Sentences
    "!",            # Emphasis
    "?",            # Questions
    ",",            # Lists
    ":",            # Definitions
    ";",            # Clauses

    # Markdown syntax - Links & References
    "[",            # Link text start
    "]",            # Link text end
    "(",            # Link URL start
    ")",            # Link URL end
    "/",            # Path separator (critical for links)

    # Markdown syntax - Headings
    "#",            # Heading marker
    "##",           # Level 2 heading
    "###",          # Level 3 heading
    "####",         # Level 4 heading

    # Markdown syntax - Code
    "`",            # Inline code
    "```",          # Code block

    # Markdown syntax - Lists
    "-",            # List items
    "*",            # Alternative list/emphasis
    "+",            # Alternative list

    # Markdown syntax - Tables
    "|",            # Table columns

    # Markdown syntax - Emphasis
    "**",           # Bold
    "__",           # Alternative bold

    # Special characters (emojis/status indicators)
    "✅",           # Completed
    "❌",           # Failed
    "⏳",           # Pending
    "⏸️",           # Paused
    "⚠️",           # Warning
    "🔴",           # Critical
    "🟢",           # Success
    "🟡",           # Warning

    # File paths & references
    "_",            # Underscores in filenames
    "@",            # References
    "docs",         # Common path component
    "adr",          # Architecture decisions
    "patterns",     # Patterns directory
    "phases",       # Phases directory
    "system-prd",   # System PRD directory
]


# ============================================================================
# Configuration
# ============================================================================

class CompressionConfig:
    """Configuration for documentation compression."""

    def __init__(self, args):
        self.input_dir = Path(args.input_dir)
        self.output_dir = Path(args.output_dir)
        self.compression_rate = args.rate
        self.max_chunk_words = args.max_chunk_words
        self.dry_run = args.dry_run
        self.validate = args.validate
        self.verbose = args.verbose
        self.skip_patterns = args.skip_patterns.split(',') if args.skip_patterns else []
        self.stats_file = "compression_stats.json"

        # Add default skip patterns
        self.skip_patterns.extend([
            "llm-lingua-compressed.md",
            "llm-lingua-input.md",
            "decompressed.md",
            "*.compressed.md"
        ])


# ============================================================================
# Utility Functions
# ============================================================================

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
    """
    Estimate token count from word count (conservative).

    LLMLingua-2 has 512 token limit. Using conservative ratio:
    1 word ≈ 1.3 tokens (safer than assuming 1:1 or 0.75 ratio)
    """
    word_count = count_words(text)
    return int(word_count * 1.3)


def should_skip_file(file_path: Path, skip_patterns: List[str]) -> bool:
    """Check if file should be skipped based on patterns."""
    file_name = file_path.name
    for pattern in skip_patterns:
        if '*' in pattern:
            # Simple glob pattern matching
            pattern_regex = pattern.replace('*', '.*')
            if re.match(pattern_regex, file_name):
                return True
        elif file_name == pattern:
            return True
    return False


# ============================================================================
# Chunking Functions
# ============================================================================

def chunk_by_sections(content: str, max_words: int) -> List[Tuple[str, str]]:
    """
    Split content by ## headers, further chunking if sections are too large.
    Returns list of (chunk_content, chunk_label) tuples.
    """
    # Split by level-2 headers
    sections = re.split(r'\n(?=##\s)', content)

    chunks = []
    for section_num, section in enumerate(sections, 1):
        word_count = count_words(section)

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


# ============================================================================
# Compression Functions
# ============================================================================

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

    # Safety check - warn if approaching 512 token limit
    estimated_tokens = estimate_tokens(chunk)
    if estimated_tokens > 450:
        logger.warning(
            f"Chunk {chunk_num} has ~{estimated_tokens} estimated tokens (approaching 512 limit). "
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
                f"{compressed_words} words ({reduction:.1f}%)"
            )

        return result['compressed_prompt'], True, stats

    except Exception as e:
        error_msg = str(e)
        logger.error(f"Chunk {chunk_num}/{total_chunks} failed: {error_msg[:100]}")

        # Check if it's the token limit error
        if "sequence length" in error_msg.lower() or "512" in error_msg:
            logger.error(
                f"  → TOKEN LIMIT ERROR: Chunk has ~{estimated_tokens} tokens. "
                f"Reduce --max-chunk-words (current default: 200)"
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
    file_path: Path,
    output_path: Path,
    config: CompressionConfig
) -> Dict:
    """
    Compress a single markdown file.
    Returns compression statistics.
    """
    logger = logging.getLogger(__name__)
    logger.info(f"Processing: {file_path.relative_to(config.input_dir)}")

    # Read source
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        logger.error(f"Failed to read {file_path}: {e}")
        return {
            'status': 'error',
            'error': f"Read failed: {e}",
            'original_words': 0,
            'compressed_words': 0
        }

    original_words = count_words(content)

    # Skip empty files
    if original_words == 0:
        logger.info("  → Skipped (empty file)")
        return {
            'status': 'skipped',
            'reason': 'empty file',
            'original_words': 0,
            'compressed_words': 0
        }

    # Chunk content
    chunks = chunk_by_sections(content, config.max_chunk_words)
    total_chunks = len(chunks)

    logger.info(f"  → {original_words:,} words, {total_chunks} chunks")

    # Compress each chunk
    compressed_chunks = []
    chunk_stats_list = []
    success_count = 0

    for i, (chunk_content, chunk_label) in enumerate(chunks, 1):
        if config.verbose:
            logger.info(f"  → Chunk {i}/{total_chunks}: {chunk_label}")

        compressed, success, stats = compress_chunk(
            compressor,
            chunk_content,
            config.compression_rate,
            MARKDOWN_FORCE_TOKENS,
            i,
            total_chunks,
            config.verbose
        )

        compressed_chunks.append(compressed)
        chunk_stats_list.append(stats)

        if success:
            success_count += 1

    # Reassemble
    compressed_content = '\n\n'.join(compressed_chunks)
    compressed_words = count_words(compressed_content)

    # Write output (unless dry run)
    if not config.dry_run:
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(compressed_content)
        except Exception as e:
            logger.error(f"Failed to write {output_path}: {e}")
            return {
                'status': 'error',
                'error': f"Write failed: {e}",
                'original_words': original_words,
                'compressed_words': compressed_words
            }

    # Calculate stats
    reduction = ((original_words - compressed_words) / original_words * 100) if original_words > 0 else 0

    logger.info(
        f"  ✓ {original_words:,} → {compressed_words:,} words ({reduction:.1f}% reduction)"
    )

    if config.dry_run:
        logger.info(f"  [DRY RUN] Would write to: {output_path.relative_to(config.output_dir)}")

    return {
        'status': 'success',
        'original_words': original_words,
        'compressed_words': compressed_words,
        'reduction_percent': round(reduction, 1),
        'total_chunks': total_chunks,
        'successful_chunks': success_count,
        'failed_chunks': total_chunks - success_count,
        'chunk_stats': chunk_stats_list
    }


# ============================================================================
# Validation Functions
# ============================================================================

def validate_markdown_structure(content: str) -> Tuple[bool, List[str]]:
    """
    Validate that markdown structure is preserved.
    Returns (is_valid, issues).
    """
    issues = []

    # Check for broken link patterns
    link_pattern = r'\[([^\]]*)\]\(([^\)]*)\)'
    links = re.findall(link_pattern, content)

    # Check for orphaned brackets
    orphaned_open = content.count('[') - content.count(']')
    orphaned_close = content.count('(') - content.count(')')

    if orphaned_open != 0:
        issues.append(f"Unmatched square brackets: {orphaned_open} extra '['")

    if orphaned_close != 0:
        issues.append(f"Unmatched parentheses: {orphaned_close} extra '('")

    # Check for code blocks
    backtick_count = content.count('```')
    if backtick_count % 2 != 0:
        issues.append(f"Unmatched code blocks: {backtick_count} '```' markers (should be even)")

    is_valid = len(issues) == 0
    return is_valid, issues


def validate_compressed_file(file_path: Path) -> Tuple[bool, Dict]:
    """
    Validate a compressed file.
    Returns (is_valid, validation_results).
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return False, {'error': f"Failed to read file: {e}"}

    is_valid, issues = validate_markdown_structure(content)

    return is_valid, {
        'valid': is_valid,
        'issues': issues,
        'stats': {
            'total_lines': content.count('\n') + 1,
            'total_words': count_words(content),
            'markdown_links': len(re.findall(r'\[([^\]]*)\]\(([^\)]*)\)', content)),
            'headings': len(re.findall(r'^#{1,6}\s+.+', content, re.MULTILINE)),
            'code_blocks': content.count('```') // 2,
        }
    }


# ============================================================================
# Main Compression Function
# ============================================================================

def compress_directory(
    compressor: PromptCompressor,
    config: CompressionConfig
) -> Dict:
    """
    Recursively compress all markdown files in directory.
    Returns overall statistics.
    """
    logger = logging.getLogger(__name__)

    stats = {
        'start_time': datetime.now().isoformat(),
        'config': {
            'input_dir': str(config.input_dir),
            'output_dir': str(config.output_dir),
            'compression_rate': config.compression_rate,
            'max_chunk_words': config.max_chunk_words,
            'dry_run': config.dry_run,
        },
        'files': {},
        'totals': {
            'total_files': 0,
            'successful_files': 0,
            'skipped_files': 0,
            'failed_files': 0,
            'original_words': 0,
            'compressed_words': 0
        }
    }

    # Find all markdown files
    md_files = sorted(config.input_dir.rglob('*.md'))

    # Filter out skip patterns
    md_files = [f for f in md_files if not should_skip_file(f, config.skip_patterns)]

    logger.info(f"\n{'='*80}")
    logger.info(f"Found {len(md_files)} markdown files to process")
    logger.info(f"{'='*80}\n")

    for md_file in md_files:
        # Calculate relative path
        rel_path = md_file.relative_to(config.input_dir)
        output_path = config.output_dir / rel_path

        # Compress file
        file_stats = compress_file(compressor, md_file, output_path, config)

        # Update stats
        stats['files'][str(rel_path)] = file_stats
        stats['totals']['total_files'] += 1

        if file_stats['status'] == 'success':
            stats['totals']['successful_files'] += 1
            stats['totals']['original_words'] += file_stats['original_words']
            stats['totals']['compressed_words'] += file_stats['compressed_words']
        elif file_stats['status'] == 'skipped':
            stats['totals']['skipped_files'] += 1
        else:
            stats['totals']['failed_files'] += 1

        logger.info("")

    # Calculate overall reduction
    if stats['totals']['original_words'] > 0:
        overall_reduction = (
            (stats['totals']['original_words'] - stats['totals']['compressed_words'])
            / stats['totals']['original_words'] * 100
        )
        stats['totals']['reduction_percent'] = round(overall_reduction, 1)

    stats['end_time'] = datetime.now().isoformat()

    # Validation phase
    if config.validate and not config.dry_run:
        logger.info(f"\n{'='*80}")
        logger.info("VALIDATION PHASE")
        logger.info(f"{'='*80}\n")

        validation_results = {}
        for rel_path in stats['files'].keys():
            output_path = config.output_dir / rel_path
            if output_path.exists():
                is_valid, validation_data = validate_compressed_file(output_path)
                validation_results[str(rel_path)] = validation_data

                status = "✓ VALID" if is_valid else "✗ INVALID"
                logger.info(f"{status}: {rel_path}")
                if not is_valid and validation_data.get('issues'):
                    for issue in validation_data['issues']:
                        logger.info(f"  - {issue}")

        stats['validation'] = validation_results
        logger.info("")

    return stats


# ============================================================================
# Main Entry Point
# ============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Advanced documentation compression using LLMLingua-2",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )

    parser.add_argument(
        "--input-dir",
        type=str,
        default="docs",
        help="Input directory (default: docs)"
    )

    parser.add_argument(
        "--output-dir",
        type=str,
        default="docs-compressed",
        help="Output directory (default: docs-compressed)"
    )

    parser.add_argument(
        "--rate",
        type=float,
        default=0.35,
        help="Compression rate - portion to keep (default: 0.35)"
    )

    parser.add_argument(
        "--max-chunk-words",
        type=int,
        default=200,
        help="Maximum words per chunk (default: 200, ~260 tokens)"
    )

    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be compressed without writing files"
    )

    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate compressed files after compression"
    )

    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable detailed logging"
    )

    parser.add_argument(
        "--skip-patterns",
        type=str,
        help="Comma-separated file patterns to skip"
    )

    args = parser.parse_args()
    config = CompressionConfig(args)

    # Setup logging
    logger = setup_logging(config.verbose)

    # Print header
    print()
    print("╔" + "=" * 78 + "╗")
    print("║" + " " * 18 + "Advanced Documentation Compressor" + " " * 27 + "║")
    print("╚" + "=" * 78 + "╝")
    print()

    # Validate input
    if not config.input_dir.exists():
        logger.error(f"Input directory not found: {config.input_dir}")
        sys.exit(1)

    # Clean output directory (if not dry run)
    if config.output_dir.exists() and not config.dry_run:
        logger.info(f"Cleaning existing output directory...")
        shutil.rmtree(config.output_dir)

    # Show configuration
    logger.info(f"Input:  {config.input_dir}")
    logger.info(f"Output: {config.output_dir}")
    logger.info(f"Config: {config.compression_rate:.0%} retention, {config.max_chunk_words} word chunks")
    logger.info(f"Mode:   {'DRY RUN' if config.dry_run else 'LIVE'}")
    if config.validate:
        logger.info(f"Validate: Enabled")

    # Load compressor
    logger.info("\nLoading LLMLingua-2 model...")
    try:
        compressor = PromptCompressor(
            model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
            use_llmlingua2=True,
            device_map="cpu"
        )
        logger.info("✓ Model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        sys.exit(1)

    # Compress directory
    try:
        stats = compress_directory(compressor, config)
    except KeyboardInterrupt:
        logger.info("\n\nInterrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        if config.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)

    # Save statistics
    if not config.dry_run:
        stats_path = config.output_dir / config.stats_file
        stats_path.parent.mkdir(parents=True, exist_ok=True)
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
    print(f"Failed:            {stats['totals']['failed_files']}")
    print(f"Original Words:    {stats['totals']['original_words']:,}")
    print(f"Compressed Words:  {stats['totals']['compressed_words']:,}")
    print(f"Overall Reduction: {stats['totals'].get('reduction_percent', 0):.1f}%")
    print()

    if config.dry_run:
        print("🔍 DRY RUN - No files were written")
    else:
        print(f"✅ Compression complete!")
        print(f"📁 Output: {config.output_dir}/")
        print(f"📈 Stats:  {config.output_dir / config.stats_file}")

    print()


if __name__ == "__main__":
    main()
