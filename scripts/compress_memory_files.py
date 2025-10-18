#!/usr/bin/env python3
"""
Memory File Compressor using LLMLingua-2

This script compresses project memory files while preserving markdown structure
and link references using LLMLingua's force_tokens feature.

Key Features:
- Preserves markdown link syntax [text](path) to prevent broken references
- Maintains heading hierarchy (#, ##, ###)
- Preserves code blocks and inline code
- Keeps essential punctuation and structure
- Supports batch processing of all memory files

Usage:
    python scripts/compress_memory_files.py [options]

Options:
    --rate FLOAT         Compression rate (0.0-1.0), default: 0.4 (40% compression)
    --input PATH         Single input file to compress
    --input-dir PATH     Directory containing .memory.md files (default: .claude/memory)
    --output-dir PATH    Output directory for compressed files (default: .claude/memory/compressed)
    --dry-run            Show compression results without writing files
    --force-tokens LIST  Additional tokens to preserve (comma-separated)
    --verbose            Enable detailed logging

Examples:
    # Compress all memory files with 40% compression
    python scripts/compress_memory_files.py

    # Compress single file with 60% compression
    python scripts/compress_memory_files.py --input .claude/memory/project-context.memory.md --rate 0.6

    # Dry run to see results without writing
    python scripts/compress_memory_files.py --dry-run --verbose

Requirements:
    - llmlingua>=0.2.0
    - transformers>=4.30.0
    - torch>=2.0.0
"""

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional

try:
    from llmlingua import PromptCompressor
except ImportError:
    print("ERROR: llmlingua not installed. Run: pip install llmlingua")
    sys.exit(1)


# Markdown-specific tokens to preserve during compression
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

    # Markdown syntax - Tables
    "|",            # Table columns

    # Markdown syntax - Emphasis
    "**",           # Bold

    # Special characters (emojis/status indicators)
    "✅",           # Completed
    "❌",           # Failed
    "⏳",           # Pending
    "⏸️",           # Paused
    "⚠️",           # Warning
    "🔴",           # Critical

    # File paths & references
    ".",            # File extensions
    "_",            # Underscores in filenames
    "@",            # References
]

# Additional technical tokens to preserve
TECHNICAL_TOKENS = [
    # Version numbers
    ".",

    # TypeScript/JavaScript
    "=>",
    "->",
    "{}",
    "[]",

    # Commands & paths
    "$",
    "npm",
    "run",
    "test",
    "db:",

    # Status codes
    "200",
    "404",
    "500",
]


def setup_logging(verbose: bool = False) -> logging.Logger:
    """Configure logging with appropriate level."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format='%(levelname)s: %(message)s'
    )
    return logging.getLogger(__name__)


def load_compressor(verbose: bool = False) -> PromptCompressor:
    """
    Initialize LLMLingua-2 compressor with optimal model.

    Returns:
        Configured PromptCompressor instance
    """
    logger = logging.getLogger(__name__)
    logger.info("Loading LLMLingua-2 model (this may take a moment)...")

    try:
        compressor = PromptCompressor(
            model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
            use_llmlingua2=True,
            device_map="cpu"  # Use CPU to avoid GPU dependencies
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


def compress_text(
    compressor: PromptCompressor,
    text: str,
    rate: float = 0.4,
    force_tokens: Optional[List[str]] = None,
    verbose: bool = False
) -> Dict:
    """
    Compress text while preserving markdown structure.

    Args:
        compressor: Initialized PromptCompressor
        text: Input text to compress
        rate: Target compression rate (0.0-1.0)
        force_tokens: Additional tokens to preserve
        verbose: Enable detailed output

    Returns:
        Dict containing compressed_prompt, original_tokens, compressed_tokens, ratio
    """
    logger = logging.getLogger(__name__)

    # Combine default and custom force tokens
    all_force_tokens = list(set(MARKDOWN_FORCE_TOKENS + (force_tokens or [])))

    if verbose:
        logger.debug(f"Using {len(all_force_tokens)} force tokens")
        logger.debug(f"Target compression rate: {rate}")

    try:
        result = compressor.compress_prompt(
            text,
            rate=rate,
            force_tokens=all_force_tokens,
            drop_consecutive=True,  # Remove consecutive force_tokens
        )

        # Calculate statistics
        original_tokens = len(text.split())
        compressed_tokens = len(result['compressed_prompt'].split())
        ratio = compressed_tokens / original_tokens if original_tokens > 0 else 0

        return {
            'compressed_prompt': result['compressed_prompt'],
            'original_tokens': original_tokens,
            'compressed_tokens': compressed_tokens,
            'ratio': ratio,
            'compression_percent': (1 - ratio) * 100
        }
    except Exception as e:
        logger.error(f"Compression failed: {e}")
        raise


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
    Compress a single memory file.

    Args:
        compressor: Initialized PromptCompressor
        input_path: Path to input .memory.md file
        output_path: Path to output compressed file
        rate: Target compression rate
        force_tokens: Additional tokens to preserve
        dry_run: If True, don't write output file
        verbose: Enable detailed output

    Returns:
        Compression statistics dict
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

    # Compress
    result = compress_text(
        compressor,
        original_text,
        rate=rate,
        force_tokens=force_tokens,
        verbose=verbose
    )

    # Write output (unless dry run)
    if not dry_run:
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(result['compressed_prompt'])
            logger.info(f"✓ Written to: {output_path}")
        except Exception as e:
            logger.error(f"Failed to write {output_path}: {e}")
            raise
    else:
        logger.info(f"[DRY RUN] Would write to: {output_path}")

    # Log statistics
    logger.info(
        f"  Original: {result['original_tokens']:,} tokens | "
        f"Compressed: {result['compressed_tokens']:,} tokens | "
        f"Reduction: {result['compression_percent']:.1f}%"
    )

    return result


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

    Args:
        input_dir: Directory containing .memory.md files
        output_dir: Directory for compressed output files
        rate: Target compression rate
        force_tokens: Additional tokens to preserve
        dry_run: If True, don't write output files
        verbose: Enable detailed output
    """
    logger = logging.getLogger(__name__)

    # Find all memory files
    memory_files = list(input_dir.glob("*.memory.md"))

    if not memory_files:
        logger.warning(f"No .memory.md files found in {input_dir}")
        return

    logger.info(f"Found {len(memory_files)} memory files to compress")
    logger.info("")

    # Load compressor once for all files
    compressor = load_compressor(verbose=verbose)
    logger.info("")

    # Process each file
    total_stats = {
        'original_tokens': 0,
        'compressed_tokens': 0,
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

            total_stats['original_tokens'] += result['original_tokens']
            total_stats['compressed_tokens'] += result['compressed_tokens']
            total_stats['files_processed'] += 1
            logger.info("")

        except Exception as e:
            logger.error(f"Failed to process {input_path.name}: {e}")
            logger.info("")

    # Summary
    if total_stats['files_processed'] > 0:
        total_ratio = (
            total_stats['compressed_tokens'] / total_stats['original_tokens']
            if total_stats['original_tokens'] > 0 else 0
        )
        total_reduction = (1 - total_ratio) * 100

        logger.info("=" * 60)
        logger.info("SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Files processed: {total_stats['files_processed']}")
        logger.info(f"Total original tokens: {total_stats['original_tokens']:,}")
        logger.info(f"Total compressed tokens: {total_stats['compressed_tokens']:,}")
        logger.info(f"Overall reduction: {total_reduction:.1f}%")

        if dry_run:
            logger.info("")
            logger.info("[DRY RUN] No files were written")


def main():
    """Main entry point for the script."""
    parser = argparse.ArgumentParser(
        description="Compress memory files using LLMLingua-2 while preserving markdown structure",
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
